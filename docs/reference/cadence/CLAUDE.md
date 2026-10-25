# Cadence — agent instructions

Private Android habit + menstrual-cycle + water + workout + fasting tracker for the owner and ~5
friends, sideloaded (not on the Play Store). Kotlin, Jetpack Compose, Room, DataStore,
WorkManager, Glance widgets, Health Connect. Modules: `:domain` (pure Kotlin logic) and `:app`.

**The full handoff — architecture, decisions, step-by-step phases, device checklist, recipes,
troubleshooting — is in [docs/HANDOFF.md](docs/HANDOFF.md). Read it before your first change.**

## Commands
```bash
./gradlew :domain:test :app:testDebugUnitTest   # all tests — run after EVERY change (Windows: .\gradlew.bat)
./gradlew :app:assembleDebug                    # debug APK ("Cadence Debug", app.cadence.tracker.debug)
./gradlew :app:installDebug                     # install on the connected phone
./gradlew :app:assembleRelease                  # signed release APK (needs signing props in ~/.gradle/gradle.properties)
adb logcat -d -s Cadence:E AndroidRuntime:E     # app errors on the phone
```

## Non-negotiable rules
1. All tests must pass before you call anything done. Never weaken a test to make it pass;
   `CompatibilityGuardTest`, `SchemaMigrationTest`, `ReviewRegressionTest` and
   `FinalReviewRegressionTest` guard users' data and real bugs.
2. Time comes only from `TimeSource` (`container.timeSource` / `clock`). Never `Instant.now()`,
   `LocalDate.now()` or `System.currentTimeMillis()` in app logic.
3. Habits/water/steps use the tracking day (`clock.today()`, 3 am boundary); cycle data and
   wall-clock reminders use `clock.calendarToday()`.
4. "Is this a period day?" is only `CycleTimeline.periodContaining()`.
5. UI, widgets and receivers write only through repositories/services (they re-plan alarms,
   update notifications and widgets). Never write to a DAO from UI.
6. Database: any entity change = bump the Room version + a `Migration` + commit the new schema
   JSON. Never `fallbackToDestructiveMigration`. Never edit `app/schemas/.../1.json`.
7. Entities are also the export format: no renaming/removing fields or enum constants; new fields
   need defaults; `app/src/test/resources/fixtures/export-v1.json` must keep importing (never regenerate it).
8. A new setting touches `AppSettings`, `SettingsStore` (key/read/write), `SettingsSnapshot`
   (field added last with a default, named arg in `of`, `toAppSettings`) and `CompatibilityGuardTest`.
9. Habit types never change after creation; rule changes create a new versioned `HabitRule`;
   manual entries beat automatic ones.
10. Notification channel IDs/importance are permanent once installed; add channels, don't change them.
11. No analytics, crash reporting, ads or network SDKs. The app has no INTERNET permission.
12. No secrets in the repo (keystore and passwords live in `~/keystores` and `~/.gradle/gradle.properties`).
    No real health data in tests or fixtures.
13. Don't upgrade dependency versions unless asked. US English in all user-facing text.
14. Ask the owner before anything irreversible on her phone (uninstall, clear data, import over
    data, new signing key, changing `applicationId`).

## UI conventions
`TabPage`/`DetailScaffold` + `SectionCard` + `CardHeader`; `accentButtonColors(accent.main)`;
`ChipChoice(..., label = { })` with a named `label` (a trailing lambda won't compile); `Stepper(..., label = "…")`;
`display()` to show numbers, `clean()` for text fields; `context.safeStartActivity(intent)`;
read habit cards from `container.habitCards`; ≥48 dp touch targets with content descriptions.
