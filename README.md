# Daily Tracker

A private Android tracker for habits, water, movement snacks, meditation and (opt-in) the menstrual
cycle, with a home-screen widget, reminders with buttons, Health Connect import, app lock and
encrypted backups. Apple Health's information design in Spotify green with gold framing; habits
shift from pale gold to green to green-violet as you follow them. Installed as an APK you build
yourself; Play Store later from the same code if ever wanted.

**Start here**

- **Put it on your phone (no Android experience needed):** [docs/GET_IT_ON_YOUR_PHONE.md](docs/GET_IT_ON_YOUR_PHONE.md)
- **Running context / hand-over for agents and developers:** [docs/RUNNING_CONTEXT.md](docs/RUNNING_CONTEXT.md)
- **Project rules:** [replit.md](replit.md)

**Reference**

- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — decisions, architecture, milestones M0–M6 with what was built.
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — tokens, adherence colour ramp, typography, components, motion.
- [docs/HABIT_LIBRARY.md](docs/HABIT_LIBRARY.md) — evidence-based presets with sources.
- [docs/BUILD_ANDROID.md](docs/BUILD_ANDROID.md) — the technical build, signing and backup recipe.
- [docs/DEVICE_CHECKLIST.md](docs/DEVICE_CHECKLIST.md) — what can only be verified on a real phone.
- [docs/reference/cadence/](docs/reference/cadence/) — the original Cadence (Kotlin) spec whose decisions and algorithms are ported here.

## Stack

Expo SDK 57 (React Native 0.86, TypeScript) · Expo Router · expo-sqlite with hand-written migrations ·
expo-notifications · expo-background-task · react-native-android-widget · react-native-health-connect ·
expo-local-authentication · `@noble` crypto for encrypted exports · tests with `node --test`.
No analytics, no accounts, no network calls (except opening an evidence link you tap).

## Run

Monorepo managed with pnpm (`pnpm install` at the repository root). Day to day (UI, data, nudges):
the Expo dev server in `artifacts/daily-tracker/` and Expo Go on the phone. Native build with the
widget, Health Connect and background notification actions — on a laptop with Android Studio:

```bash
pnpm install
cd artifacts/daily-tracker
pnpm exec expo prebuild --platform android --clean
pnpm exec expo run:android --variant release   # installs a standalone build on the connected phone
```

Release signing reads `DT_RELEASE_STORE_FILE`, `DT_RELEASE_STORE_PASSWORD`, `DT_RELEASE_KEY_ALIAS`
and `DT_RELEASE_KEY_PASSWORD` from `~/.gradle/gradle.properties` and falls back to the debug keystore.
The keystore must never be committed.

## Working rules

See [replit.md](replit.md). Short version: push to `origin/main` after every milestone and every
working session; type-check and all tests green before a push; never a destructive migration; manual
entries beat automatic ones; all time goes through the tracking-day clock.
