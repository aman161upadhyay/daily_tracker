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
- Native builds happen on Aman's laptop (Android Studio): `npx expo prebuild -p android && npx expo run:android`.
- `patches/expo-notifications@57.0.24.patch` (applied by pnpm via `patchedDependencies` in `pnpm-workspace.yaml`) makes the
  Android FCM topic module optional: Expo Go's Android client ships without it, and without the patch importing
  `expo-notifications` throws on load and every screen fails ("Cannot find native module 'ExpoTopicSubscriptionModule'").
  Re-create the patch (`pnpm patch expo-notifications@<ver>`) whenever the package version changes.
- Platform-split pairs (`x.ts` + `x.native.ts`): the native file must never import `./x` — on Android/iOS that resolves to
  itself (infinite getter loop at startup). Put shared code in a third module (see `src/data/transferFormat.ts`).

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
- `app/` Expo Router: `(tabs)/{index,habits,body,cycle}`, `habit/[id]`, modals `settings`, `mind` and `shield` (Sugar Shield).
- Nudges: `src/domain/nudges/planner.ts` (pure plan) → `src/services/notifications[.native].ts` (OS diff-sync, channels,
  categories) ← `components/system/NudgeScheduler.tsx` (in-app) and `src/services/nudgeTasks[.native].ts` (headless:
  button presses with the app closed, 3-hourly re-plan). Button presses become reducer actions only through
  `src/state/commands.ts`, which both paths share. Web/Expo Go: planner runs, OS parts are honest no-ops.
  Device-only behaviour is listed in `docs/DEVICE_CHECKLIST.md`.
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
8. Native modules (`src/native/`, from M2 on) must degrade to stubs in Expo Go so the UI always runs there.
9. Keep `docs/` current when behaviour changes; add a device-checklist row for anything that can only be verified on a phone.
