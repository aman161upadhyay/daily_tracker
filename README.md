# Daily Tracker

A private Android tracker for habits, water, movement snacks, meditation and (opt-in) the menstrual
cycle. Apple Health's information design in Spotify green with gold framing; habits shift from pale
gold to green to green-violet as you follow them. Installed as an APK first; Play Store later from
the same code.

- **Plan:** [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — decisions, architecture, milestones M0–M6, testing, build & release.
- **Design system:** [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — tokens, adherence color ramp, typography, components, motion.
- **Habit library:** [docs/HABIT_LIBRARY.md](docs/HABIT_LIBRARY.md) — evidence-based presets with sources.
- **Reference:** [docs/reference/cadence/](docs/reference/cadence/) — the original Cadence (Kotlin) spec whose decisions and algorithms are ported here.

## Stack

Expo (React Native, TypeScript) · Expo Router · expo-sqlite + Drizzle · expo-notifications ·
react-native-android-widget · react-native-health-connect · Vitest. No analytics, no accounts, no
network calls (except opening an evidence link you tap).

## Run

Day to day (UI, data, nudges): `npx expo start` and scan with Expo Go on the phone.

Native build with widgets and Health Connect (laptop with Android Studio):

```bash
npm ci
npx expo prebuild --platform android
npx expo run:android                 # debug build on the connected phone
cd android && ./gradlew assembleRelease   # signed release APK (keystore outside the repo)
```

Release signing reads `DAILY_TRACKER_STORE_FILE`, `DAILY_TRACKER_STORE_PASSWORD`,
`DAILY_TRACKER_KEY_ALIAS` and `DAILY_TRACKER_KEY_PASSWORD` from `~/.gradle/gradle.properties`.
The keystore must never be committed.

## Working rules

See [replit.md](replit.md). Short version: push to `origin/main` after every milestone and every
working session; all tests green before a push; never a destructive migration; manual entries beat
automatic ones; all time goes through the tracking-day clock.
