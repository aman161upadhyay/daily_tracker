---
name: Expo workspace quirks
description: Environment-specific facts for the daily-tracker Expo app — icon imports, test runner, node types, Metro path aliases, platform splits, headless entry, widget library, prebuild here, image tooling, web pitfalls.
---

## Phosphor icons must be deep-required
`phosphor-react-native`'s `exports` map only allows `.` and `./src/icons/*` (TypeScript source). Importing the
root bundles ~1,500 icons; importing `src/icons/X` with `import` makes tsc type-check the vendor source,
which fails against react-native-svg 15.15 (`className` on Svg). Working pattern (all in one file):
`require('phosphor-react-native/src/icons/X').XIcon as Icon` with `import type { Icon } from 'phosphor-react-native'`.
**Why:** tried `paths` aliases to the `.d.ts` and a pnpm patch first; Expo's Metro resolver applies tsconfig
`paths` to bare specifiers from project files, so the alias leaked into the bundle.
**How to apply:** add icons only in the central icons module; never import Phosphor elsewhere.

## Tests: node --test + tsx, not Vitest
`vitest` cannot be installed here (`ERR_PNPM_FETCH_403` on `tinypool` — registry firewall). Tests run with
`node --import tsx --test tests/*.test.ts` using `node:assert/strict`. Node globals/types are not in Expo's
tsconfig base, so each test file starts with `/// <reference types="node" />` (with `@types/node` installed);
do not add `"types": ["node"]` globally — it would leak Node's timer types into RN code.

## Storage: expo-sqlite on native, JSON on web, node:sqlite in tests
expo-sqlite's web build needs wasm + COOP/COEP headers, so the web preview keeps one JSON document in
AsyncStorage behind the same `TrackerStore` interface. Tests run the real migration SQL on Node 24's
built-in `node:sqlite` (`DatabaseSync`, unflagged) through a tiny `SqlDriver` adapter whose method
signatures must mirror expo-sqlite exactly (`getAllAsync(sql, params)` with params required) or the
structural typing breaks. `expo install` must be run as `CI=1 pnpm exec expo install <pkgs>` here.
Decision: no Drizzle/MMKV — hand-written migrations keyed by `PRAGMA user_version` are enough and keep the
future headless writers (widget taps, notification actions) free to insert single rows.

## Platform-split modules
Metro picks `x.native.ts` on Android/iOS and `x.ts` on web; tsc type-checks both, and the web file is the one
`@/…` imports resolve to for typing, so keep the exported API identical (used for `createStore` and `transfer`).
**Never import `./x` from `x.native.ts`** to share helpers: on native it resolves to itself → "Require cycle
x.native.ts -> x.native.ts" + "Maximum call stack size exceeded" at startup (re-export getters recurse); tsc does
not catch it because it resolves `./x` to the web file. Shared code goes in a third module (`transferFormat.ts`).
The new expo-file-system API (`File`, `Paths.cache`, `file.write`, `file.text()`) is sync for writes.

## Headless code must be registered from the entry file, not a route
Expo Router's `require.context` loads route modules lazily (`getRoutes` runs inside `ExpoRoot`'s render), so a
`TaskManager.defineTask` / `registerWidgetTaskHandler` placed in `app/_layout.tsx` does not exist when Android starts
the bundle without a UI (notification response task, background task, widget click). The app has a custom
`index.js` (`package.json` `main`) that imports the headless service modules and then `expo-router/entry`.
**How to apply:** anything that must run in a headless start goes through `index.js`; verify with the Android
bundle grep — the `index.js` module factory should require the task modules before `expo-router/entry`.

## react-native-android-widget throws on import in Expo Go
Under the new architecture its `AndroidWidget.ts` does `TurboModuleRegistry.getEnforcing('AndroidWidget')` at
module evaluation, so a static import anywhere breaks every screen in Expo Go (same failure class as the FCM
topic module). Pattern used: `src/services/widget.native.ts` gates on `Platform.OS === 'android' &&
!isRunningInExpoGo()` (from `expo`) and `require`s the library and the widget component lazily inside functions;
`widget.ts` is the web no-op. Metro still bundles the module (harmless; it is never evaluated in Expo Go).
Widget text uses `fontFamily` = TTF file name without extension (the plugin copies `fonts: [...]` into
`assets/fonts/`); custom fonts cannot be used inside the SVG, so values are `TextWidget`s overlapped on the ring.
The library runs its headless task with `allowedInForeground = true`, so taps also work while the app is open;
the app only notices through the headless-write flag on the next foreground.

## `expo prebuild` works in the workspace
`CI=1 pnpm exec expo prebuild --platform android --no-install` needs no Android SDK and is the way to check config
plugin output (widget provider XML, manifest receiver, fonts, preview drawable). It rewrites `package.json` to list
`expo`/`react`/`react-native` under `dependencies` (the scaffold had them in devDependencies — now moved for good) and
warns that `edgeToEdgeEnabled` is obsolete in SDK 57 (removed). Delete `android/` afterwards.

## Image tooling
No PIL, no sharp. ImageMagick `magick` is available and was used for app icons (icon/adaptive/splash/favicon) and
the widget preview (`scripts/widget-preview.sh`). Gotcha: `-gravity center -geometry -X-Y` with *both* offsets
negative silently composites nothing; position text with `-gravity Center -draw "text x,y '…'"` instead, which
takes signed offsets correctly. Settings like `-stroke` leak into later `label:` images unless reset (`-stroke none`).

## Expo Go on Android lacks the FCM topic module
`expo-notifications@57.0.24` does `requireNativeModule('ExpoTopicSubscriptionModule')` at import time in its
`.android.js`; Expo Go's Android client (sdk-57 `ExperiencePackagePicker` + `ExpoModuleRegistryAdapter`) registers
every other notifications module but not that one, so importing `expo-notifications` anywhere crashed every route
("Cannot find native module …", then "Route … is missing the required default export", blank screen, 50+ LogBox
entries). Fixed with a pnpm patch (`patches/expo-notifications@57.0.24.patch`, `requireOptionalNativeModule ?? {}`);
upstream main still uses the throwing call, so re-check when bumping the SDK. Local notifications do work in Expo Go.
Metro verification without a device: request Expo Go's exact bundle URL
`/.expo/.virtual-metro-entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app`
on Metro's port (`PORT` from the workflow process environ) and grep it.

## Notifications / background tasks (SDK 57)
expo-notifications uses exact alarms only when `SCHEDULE_EXACT_ALARM` is in app.json permissions *and* the
user allowed it (Android 12+); otherwise inexact delivery. `Notifications.registerTaskAsync` also delivers
**action-button presses with the app backgrounded/killed on Android** (that is the "response task");
`expo-background-task` is unavailable in Expo Go — both registrations are wrapped in try/catch and the UI
reports "unavailable" instead of failing. Notification `data` must be a plain object (spread the payload;
typed interfaces without an index signature do not satisfy `Record<string, unknown>`).
`weekdayOf()` in the time module is Monday = 0; any weekday setting must use that convention (Sunday = 6).

## Web preview pitfalls (react-native-web)
- Nested `Pressable`s render as nested `<button>`s → React error overlay. Keep action buttons as siblings of
  the pressable area, never children.
- react-native-svg's `G origin=` prop emits an invalid `transform-origin` DOM attribute; use
  `transform={\`rotate(-90 cx cy)\`}` instead.
- `StyleSheet.absoluteFillObject` is missing from RN 0.86 types; use `absoluteFill`.
- RN `TextProps` already has `role` (ARIA), so a custom `role` prop needs `Omit<TextProps, 'role'>`.

## Health Connect: manifest comes from app.json, not the plugin
`react-native-health-connect` 4.x's config plugin only adds the rationale intent filter and the
`ViewPermissionUsageActivity` alias; the `android.permission.health.READ_*` entries and the `<queries>` package
(`com.google.android.apps.healthdata`, via `expo-build-properties` `manifestQueries`) must be declared in
`app.json`, and the permission sheet silently omits any type not in the manifest. Expo autolinking registers the
permission delegate (the README's MainActivity edit is for bare RN only). The library needs `minSdkVersion` 26
(SDK 57 default is 24). Steps/heart rate read cleanly through `aggregateGroupByPeriod`; sessions through paged
`readRecords`. Verify with `CI=1 pnpm exec expo prebuild --platform android --no-install` and grep the manifest,
then delete `android/`.

## Verifying gated screens in the web preview
The screenshot tool starts with empty storage, so anything behind onboarding (`settings.onboardingDone`) shows
the onboarding page. Routes outside `(tabs)` (`/body/setup`, `/body/steps`, `/settings`) have no gate and can be
screenshotted directly; for the tabs with sample data, one testing-subagent run that taps "Explore with sample
data instead" on onboarding is the cheapest path (it also accepts `window.confirm` dialogs for destructive buttons).

## M6 quirks (2026-10-26)
- `@noble/ciphers` / `@noble/hashes` 2.x import with the `.js` suffix (`@noble/ciphers/aes.js`); Metro resolves
  them through package exports and Hermes has `btoa`/`atob`; keep base64 spread chunks ≤ 8 KiB for Hermes'
  argument limit. PBKDF2 200k runs ~0.2 s in Node — the phone is the slow case, hence the busy label.
- Theme switching: `useColorScheme()` only follows the phone when `app.json` `userInterfaceStyle` is
  `automatic`; a scheme context must wrap the `ThemeProvider` *inside* `TrackerProvider` (settings drive it), and
  the error fallback outside it falls back to dark via the context default.
- Local config plugins (`plugins/*.js`, listed as `./plugins/<name>` in app.json) are verified the same way as the
  Health Connect manifest: `CI=1 pnpm exec expo prebuild --platform android --no-install` + grep, then
  `rm -rf android`. `withAppBuildGradle` text edits must be idempotent (prebuild may run mods twice).
- `expo-file-system` SDK 57 new API: `File.modificationTime` (ms | null), `file.move(dest, { overwrite: true })`
  returns a Promise, `create({ overwrite })` / `write()` are sync.
