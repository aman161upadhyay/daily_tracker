---
name: Expo workspace quirks
description: Environment-specific facts for the daily-tracker Expo app — icon imports, test runner, node types, Metro path aliases, image tooling, web pitfalls.
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
The new expo-file-system API (`File`, `Paths.cache`, `file.write`, `file.text()`) is sync for writes.

## Image tooling
No PIL, no sharp. ImageMagick `magick` is available and was used for app icons (icon/adaptive/splash/favicon).

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
