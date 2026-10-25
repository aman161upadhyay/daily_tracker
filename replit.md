# Daily Tracker — project instructions

Private Android tracker (habits · water · movement snacks · meditation · opt-in cycle) built with
**Expo (React Native, TypeScript)**. Read `docs/IMPLEMENTATION_PLAN.md` before the first change;
`docs/DESIGN_SYSTEM.md` is the only source of colors/type; `docs/HABIT_LIBRARY.md` holds the presets
and their evidence; `docs/reference/cadence/` is the original Kotlin spec being ported (this plan wins
where they disagree).

## Git (requested by Aman)
- Remote `origin` = https://github.com/aman161upadhyay/daily_tracker.git, branch `main` (private repo).
- Commit in small named steps; **push after every milestone and at the end of every working session**,
  and before any risky refactor. Tag milestones `v0.<n>`.
- Never commit keystores, `local.properties`, generated `android/`/`ios/` folders, `.env`, or real health data.

## Commands
- `npx expo start` — dev server; preview in Expo Go on the phone (widgets/Health Connect are stubbed there).
- `npm test` — Vitest (domain + repositories); `npx tsc --noEmit` — types. Both green before every push.
- Native builds happen on Aman's laptop (Android Studio): `npx expo prebuild -p android && npx expo run:android`.

## Non-negotiables
1. All time comes from the tracking-day clock (`src/domain/time`); never `Date.now()` in domain logic (injectable clock for tests). Habits/water/snacks use the tracking day (3 am boundary); cycle data and clock-time reminders use the calendar day.
2. Writes go through repositories/services only (they replan nudges, refresh widgets, update notifications). UI, widgets and notification handlers never touch the DB directly.
3. Schema changes = a new Drizzle migration, never destructive. Entities are the export format: add fields with defaults, never rename/remove.
4. Manual entries beat automatic ones. Streaks are recomputed from raw entries, never stored. Habit types never change after creation; rule edits are versioned.
5. Notification channel ids and importance are permanent once shipped; add channels, don't change them. Nudge ids are deterministic so re-planning is idempotent.
6. Privacy: no analytics, crash reporting, ads or network SDKs. The only network use is opening an evidence link the user taps.
7. Design: tokens from `docs/DESIGN_SYSTEM.md` only; adherence colors apply to fills, never to text; ≥ 48 dp touch targets with accessibility labels; US English, no exclamation marks in notifications.
8. Native modules (`src/native/`) must degrade to stubs in Expo Go so the UI always runs there.
9. Keep `docs/` current when behaviour changes; add a device-checklist row for anything that can only be verified on a phone.
