# Daily Tracker — project instructions

Private Android tracker (habits · water · movement snacks · meditation · opt-in cycle) built with
**Expo SDK 57 (React Native 0.86, TypeScript)** in `artifacts/daily-tracker/`. Read
`docs/IMPLEMENTATION_PLAN.md` before the first change; `docs/DESIGN_SYSTEM.md` is the only source of
colors/type; `docs/HABIT_LIBRARY.md` holds the presets and their evidence; `docs/reference/cadence/` is the
original Kotlin spec being ported (this plan wins where they disagree).

## Git (requested by Aman)
- Remote `origin` = https://github.com/aman161upadhyay/daily_tracker.git, branch `main`. The workspace repo is
  linked to it (`git fetch`/`git push` work through Replit's GitHub proxy; no tokens in the shell).
- Commit in small named steps; **push after every milestone and at the end of every working session**,
  and before any risky refactor. Tag milestones `v0.<n>` (`v0.0` = M0 skeleton). Never force-push `main`.
- Commits are authored as **Aman Upadhyay `<aman161upadhyay@users.noreply.github.com>`** (repo-local
  `git config user.name/user.email`; set it again if the workspace is recreated). The first two commits
  (M0/M1) carry the agent's name and stay as they are — no history rewrite.
- Never commit keystores, `local.properties`, generated `android/`/`ios/` folders, `.env`, real health data,
  or Replit workspace state (`.conversation/`, `attached_assets/`, `.agents/*` except `.agents/memory/`).

## Commands (run inside `artifacts/daily-tracker/`)
- Dev server: the `artifacts/daily-tracker: expo` workflow (never `npx expo start` by hand). Web preview at
  `$REPLIT_EXPO_DEV_DOMAIN`; phone preview via Expo Go (widgets/Health Connect/notifications are stubbed there).
- `pnpm run typecheck` — `tsc --noEmit`; `pnpm run test` — `node --test` via tsx (`tests/*.test.ts`, node:assert).
  Both green before every push. Vitest is **not** used (its install is blocked in this workspace).
- Native builds happen on Aman's laptop (Android Studio) — `docs/BUILD_ANDROID.md` (`pnpm install` at the repo root, then
  `pnpm exec expo prebuild -p android --clean && pnpm exec expo run:android` in the artifact). `expo prebuild` runs here
  too (no SDK needed) to check plugin output; delete the generated `android/` afterwards (git-ignored anyway).
- `patches/expo-notifications@57.0.24.patch` (applied by pnpm via `patchedDependencies` in `pnpm-workspace.yaml`) makes the
  Android FCM topic module optional: Expo Go's Android client ships without it, and without the patch importing
  `expo-notifications` throws on load and every screen fails ("Cannot find native module 'ExpoTopicSubscriptionModule'").
  Re-create the patch (`pnpm patch expo-notifications@<ver>`) whenever the package version changes.
- Platform-split pairs (`x.ts` + `x.native.ts`): the native file must never import `./x` — on Android/iOS that resolves to
  itself (infinite getter loop at startup). Put shared code in a third module (see `src/data/transferFormat.ts`).
- `index.js` is the entry (package.json `main`), not `expo-router/entry` directly: it imports the headless task modules
  (`src/services/nudgeTasks`, `src/services/widget`) before the router. Expo Router evaluates `app/_layout.tsx` only when it
  renders, and Android runs the bundle without rendering for notification buttons, the periodic re-plan and widget taps —
  anything that must exist in those runs is registered from `index.js`.

## Layout
- `src/domain/` pure logic (time/tracking day, adherence scale, water pace, streaks, nudges, cycle, formatting) — no React,
  no `Date.now()`; `src/library/presets.ts` the habit library; `src/state/` reducer + selectors + seed +
  `TrackerProvider` (React context; `actions` are the only write path; `sampleData` flag for the demo dataset).
- `src/data/` persistence behind the `TrackerStore` interface: `sql/` = expo-sqlite on Android/iOS (row tables,
  hand-written migrations via `PRAGMA user_version`, tests run the same SQL on `node:sqlite`); `jsonStore.ts` = one JSON
  document in AsyncStorage on web and in tests; `createStore[.native].ts` picks per platform; `transfer[.native].ts` =
  export/import. No Drizzle/MMKV (see plan §3.1). A failed write shows a red banner — never swallow it.
- First launch starts empty (water habit only) and redirects to `app/onboarding.tsx` until `settings.onboardingDone`.
- `constants/colors.ts` + `constants/typography.ts` are the tokens; `hooks/useColors.ts` the theme hook;
  `components/ui/` primitives (`Txt`, `Card`, `PressableScale`, `Screen`, `Sheet`, `icons.tsx`);
  `components/tracker/` the Health-style widgets (rings, summary cards, habit rows, charts, heatmap, evidence).
- `app/` Expo Router: `(tabs)/{index,habits,body,cycle}`, `habit/[id]`, `body/[metric]`, modals `settings`, `mind`, `shield`
  (Sugar Shield) and `body/setup` (Health Connect sources help).
- Health Connect (Android dev/release builds only; read-only): `src/services/healthConnect[.native].ts` is the only bridge
  (lazy `require`; the web/Expo Go stub reports `unsupported`), `src/services/bodySync.ts` the sync (30 days first, then
  from the day before the last sync, cap 14; per-type errors keep the watermark), `src/domain/body/` the mirrors
  (`types`, `merge` idempotent upsert, `stats`, `exerciseTypes`), `src/state/bodyCommands.ts` the auto-ticks (steps →
  Steps habit via `SET_AUTO_ENTRY`, strength/generic workouts ≥ 15 min → Strength session, hydration → water by record
  id with a ±5 min duplicate check). `hooks/useHealthConnect.ts` + `components/system/BodySync.tsx` drive it from the UI
  (foreground sync, 2-min gap); the headless 3-hourly task syncs too when background access was granted. Permissions and
  the `<queries>` entry live in `app.json` (the plugin only adds the rationale intent/alias); "Pause imports" is the
  `settings.healthConnectEnabled` flag, never `revokeAllPermissions`. Imported workouts are hidden, never deleted.
- Nudges: `src/domain/nudges/planner.ts` (pure plan) → `src/services/notifications[.native].ts` (OS diff-sync, channels,
  categories) ← `components/system/NudgeScheduler.tsx` (in-app) and `src/services/nudgeTasks[.native].ts` (headless:
  button presses with the app closed, 3-hourly re-plan). Button presses become reducer actions only through
  `src/state/commands.ts`, which both paths share. Web/Expo Go: planner runs, OS parts are honest no-ops.
  Device-only behaviour is listed in `docs/DEVICE_CHECKLIST.md`.
- Widget (Android dev/release builds only): `src/widget/` — `model.ts` (pure view model: chosen habits or water · next
  rotation snack · mind), `layout.ts` (size breakpoints), `ring.ts` (SVG string), `TrackerWidget.tsx`
  (`react-native-android-widget` primitives → RemoteViews; never React Native views), `handler.tsx` (headless task: load
  SQLite → `widgetTapActions` → `replanHeadless` → persist → `markHeadlessWrite` → redraw). `src/services/widget[.native].ts`
  is the only place that touches the library and `require`s it lazily: importing it in Expo Go throws at load.
  `components/system/WidgetSync.tsx` redraws on model changes; the headless nudge tasks redraw after persisting. Plugin
  config, fonts (`assets/fonts/`, copied from `@expo-google-fonts/manrope`) and the picker preview
  (`assets/widget/preview.png`, regenerate with `scripts/widget-preview.sh`) live in `app.json`.
- Cycle (opt-in, `settings.cycleEnabled`): `src/domain/cycle/` — `timeline.ts` (prediction + `buildTimeline().infoOn()`
  for the phase of any day; `periodContaining()` is the only period-day rule; `applyPeriodStart/End` hold the logging
  rules), `alerts.ts`, `reminders.ts`, `insights.ts` (symptom windows, Spearman habit ↔ symptom), `symptoms.ts` (keys are
  permanent). Periods live in `settings.cycle.history` (`PeriodSpan`, `excluded` keeps a span but drops its cycle from
  the averages); day logs in `state.cycleLogs` / table `cycle_day` (an empty log deletes the row). Cycle data uses the
  calendar day, never the tracking day. The planner adds `cycleReminders` on channel `cycle` (lock-screen PRIVATE;
  `settings.cycle.discreet` swaps every cycle notification for "Daily Tracker · You have a reminder."). Tracking off
  hides the tab, the Today card and the planner input but keeps the data; only Settings → Cycle data → Delete wipes it.
  UI in `components/cycle/` (`PhaseRing`, `CycleCalendar`, `DaySheet`, `ReminderSheet`, `InsightsCard`, `phaseColors`).
- Theme (M6): `settings.theme` (dark default — the dark UI is the design — | light | system) is resolved once in
  `app/_layout.tsx` (`ThemeRoot`) into `SchemeContext`; `useColors()` / `useScheme()` read it, nothing else should
  branch on the theme. Light tokens in `constants/colors.ts` are deeper AA inks (fills are alpha tints of them); the
  widget stays dark. `Txt` caps font scaling per role; `useReducedMotion` gates the tweens (not the breathing circle).
- App lock (M6): `src/services/appLock[.native].ts` (expo-local-authentication, PIN fallback; web = unavailable) and
  `components/system/AppLockGate.tsx` (a Modal over the stack, visual only — widgets and notification buttons keep
  writing; phones without a screen lock cannot enable it and never get trapped).
- Backups (M6): `src/data/backupCrypto.ts` (PBKDF2-SHA256 200k + AES-256-GCM, every parameter in the envelope; opens
  with standard tools, recipe in `docs/BUILD_ANDROID.md`) behind `transferFormat.ts` `inspectExport` / `unlockExport`;
  `components/settings/BackupCard.tsx` owns the password sheets. Android Auto Backup: `components/system/BackupSync.tsx`
  keeps `files/backup/snapshot.json` (plain export, hourly at most, not for sample data, deleted on erase) via
  `src/services/backup[.native].ts`; `plugins/withBackupRules.js` includes only that folder. Onboarding offers
  "Welcome back → Restore it" when a snapshot exists.
- Config plugins live in `plugins/` (`withBackupRules`, `withReleaseSigning` — release key from `DT_RELEASE_*` Gradle
  properties, debug keystore fallback) and are tested with `expo prebuild --platform android --no-install` + grep,
  then `android/` is deleted again (it is git-ignored and never committed).
- Icons: Phosphor, imported only through `components/ui/icons.tsx` using
  `require('phosphor-react-native/src/icons/<Name>').<Name>Icon` (the root import would bundle every icon; the
  package only exports `.` and `./src/icons/*`). Add new icons there, never import Phosphor elsewhere.

## Non-negotiables
1. All time comes from the tracking-day clock (`src/domain/time`); never `Date.now()` in domain logic (injectable clock for tests). Habits/water/snacks use the tracking day (3 am boundary); cycle data and clock-time reminders use the calendar day.
2. Writes go through the reducer/actions only (they will replan nudges, refresh widgets, update notifications). UI, widgets and notification handlers never touch storage directly.
3. Persisted state is the export format: add fields with defaults, never rename/remove; bump `TrackerState.version` with a migration in `TrackerProvider` (never drop saved data).
4. Manual entries beat automatic ones. Streaks are recomputed from raw entries, never stored. Habit types never change after creation; rule edits are versioned by `effectiveFrom`.
5. Notification channel ids and importance are permanent once shipped; add channels, don't change them. Nudge ids are deterministic so re-planning is idempotent.
6. Privacy: no analytics, crash reporting, ads or network SDKs. The only network use is opening an evidence link the user taps.
7. Design: tokens from `docs/DESIGN_SYSTEM.md` only; adherence colors apply to fills, never to text; ≥ 48 dp touch targets with accessibility labels; never nest pressables (web renders them as `<button>`); US English, no exclamation marks in notifications.
8. Native modules must degrade to stubs in Expo Go and on web so the UI always runs there: platform-split service files
   (`src/services/*.native.ts` + `*.ts`), lazy `require` for libraries that throw on import (widget), and a runtime
   `isRunningInExpoGo()` guard before touching them.
9. Keep `docs/` current when behaviour changes; add a device-checklist row for anything that can only be verified on a phone.
