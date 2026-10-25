# Cadence

A calm, private Android tracker for habits, the menstrual cycle, water, workouts, steps and
intermittent fasting. Built for one person and a few friends and installed directly from an APK.
It has no ads, no analytics and no trackers, and no data is sold or shared.

- **Today**: today's habits, water, cycle summary, steps, workouts, fasting.
- **Cycle**: phase ring, calendar, predictions with ranges, symptoms and mood, patterns, a doctor
  PDF, and a Vitamin C reminder 5 days before the expected period.
- **Move**: one-tap water with a sticky reminder when you fall behind, workouts (21 types, intensity
  1–5), steps and sleep from Health Connect, and a fasting timer.
- **Habits**: daily/weekly/monthly habits with streaks and Duolingo-style freezes (2 a month),
  automatic check-offs (steps, water, workouts, fasting, Duolingo app use), and off mode for travel.
- **Widgets**: water (+1 / undo) and fasting.
- **Backup**: Android's end-to-end encrypted Google backup, plus manual export/import with an
  optional password. Fingerprint/PIN app lock.

## Build

Requirements: Android Studio (latest stable) and Android SDK Platform 37. The Gradle daemon runs
on Java 25 (`gradle/gradle-daemon-jvm.properties`); Gradle downloads it on the first build if needed.

```bash
./gradlew :domain:test :app:testDebugUnitTest   # 167 tests
./gradlew :app:installDebug                     # install "Cadence Debug" on a connected phone
```

Release signing reads `CADENCE_STORE_FILE`, `CADENCE_STORE_PASSWORD`, `CADENCE_KEY_ALIAS` and
`CADENCE_KEY_PASSWORD` from `~/.gradle/gradle.properties`. The keystore must never be put in this
repository.

If you received the project as `CADENCE_SOURCE_BUNDLE.txt`, extract it first (instructions at the
top of that file) and recreate the Gradle wrapper; see [docs/HANDOFF.md](docs/HANDOFF.md) §6 A1.

## Documentation

- [docs/HANDOFF.md](docs/HANDOFF.md) is the complete guide: decisions, architecture, rules, setup,
  phone testing, sharing with friends, recipes and troubleshooting.
- [CLAUDE.md](CLAUDE.md) is the short rule list for AI coding agents.
- [docs/PLAN.md](docs/PLAN.md) is the original plan, kept for history.
