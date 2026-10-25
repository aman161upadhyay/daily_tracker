# Cadence: habit + cycle tracker (Android): implementation plan

> **Historical document.** This is the plan approved before the build started. The app as built
> differs in places (for example, steps come only from Health Connect, there is no step-sensor
> fallback, no "hide in Recents" setting, Android 13+ hides the Recents thumbnail automatically
> when the app lock is on, and no freeze is used when there is no streak). For the current design,
> rules and next steps, read **[HANDOFF.md](HANDOFF.md)**. Where the two disagree, HANDOFF.md is right.

## Context
The user distrusts mainstream cycle and habit apps because they sell or share data. Examples: Flo's data went to Meta (jury verdict Aug 2025), and Mozilla scored Stardust 2/10 on privacy.

Research across reviews of Flo, Clue, Apple Health, Loop, Streaks and water trackers shows:
- **Users love:** one-tap logging, interactive widgets, forgiving streaks, explanations of each phase, no paywalls, data export.
- **Users hate:** data sharing, nagging fixed-interval reminders, pregnancy-centric framing, buggy widgets, data loss.

**Goal:** a native Android app for the user and about 5 friends, installed directly from an APK (US-based, no smartwatch). It tracks:
- Habits, water, workouts, steps and intermittent fasting.
- Menstrual cycle phases, with a Vitamin C reminder 5 days before the period.

**Privacy principle:** no ads, no analytics, no third-party SDKs or trackers, and no data sold or shared. The app may use the internet. Its only off-device data flow in v1 is Android's built-in Google backup, which is end-to-end encrypted with the phone's screen lock.

**Decisions made with the user:**
- **Look:** calm and clean, in the style of Apple Health / Clue. One muted accent colour per area: rose for cycle, blue for water, green for habits.
- **Streaks:** Duolingo-style freezes. Each habit gets 2 per month; the 3rd miss resets the streak.
- **Backup:** Google backup.
- **Security:** fingerprint/PIN app lock only. The database itself is not separately encrypted.
- **Extras, all four in v1:** symptoms & insights, automatic check-offs, fasting timer, travel mode with weekly review.
- **Name:** "Cadence" is a working name; the display name can change later.

## Tech stack
- **Language and UI:** Kotlin + Jetpack Compose.
  - Compose BOM 2026.09.00, with material3 overridden to **1.5.0-beta01** for Material 3 Expressive (wavy progress, MotionScheme, ButtonGroup).
  - Experimental APIs are wrapped in `ui/components/`.
- **Widgets:** Glance 1.2.0 + glance-material3.
- **Storage:** Room 2.8.5 (KSP) for the database, with exported schemas and real migrations, never destructive. DataStore for settings.
- **Health data:** Health Connect `connect-client` 1.1.0.
  - Steps: Android 14+ counts phone steps natively; otherwise fall back to the hardware `TYPE_STEP_COUNTER`.
  - Also sleep, plus an optional write of exercise sessions.
- **Auto-ticks from app usage:** UsageStatsManager, for Duolingo/Kindle.
- **Background work:**
  - AlarmManager exact alarms (`USE_EXACT_ALARM`) for anything the user sees.
  - WorkManager for deferrable jobs.
- **App lock:** androidx.biometric.
  - `BIOMETRIC_STRONG|DEVICE_CREDENTIAL`, or `BIOMETRIC_WEAK|DEVICE_CREDENTIAL` on API 28–29.
  - Optional setting "hide content in Recents" (`FLAG_SECURE`), off by default.
- **Dependency injection:** a manual `AppContainer`, no Hilt. Widgets, receivers and workers reach it via `(ctx.applicationContext as TrackerApp).container`.
- **SDK levels:** minSdk 28, targetSdk 36, compileSdk 36. Edge-to-edge and predictive back.
- **Modules:**
  - `:domain` is pure Kotlin/JVM: streaks, cycle prediction, reminder math, insights, export format. Fully unit-testable.
  - `:app` holds all Android code.

## Structure (representative paths; `<pkg>` = `app.cadence.tracker`, applicationId is permanent)
```
domain/src/main/kotlin/<pkg>/domain/
  time/TimeSource.kt LogicalDay.kt
  habit/StreakEngine.kt Periods.kt HabitModels.kt
  cycle/CyclePredictor.kt PhaseCalculator.kt CycleAlerts.kt
  reminder/WaterPlanner.kt RulePlanner.kt
  insight/SymptomClusters.kt Correlations.kt
  export/ExportFormat.kt ExportCodec.kt (optional password: PBKDF2 + AES-GCM)
app/src/main/kotlin/<pkg>/
  TrackerApp.kt AppContainer.kt MainActivity.kt (FragmentActivity)
  data/db/{TrackerDatabase,Converters}.kt entity/* dao/*
  data/prefs/SettingsStore.kt   data/repo/*Repository.kt StreakService.kt
  data/health/{HealthConnectGateway,StepSensorSource,StepsProvider}.kt  data/usage/UsageGateway.kt
  sched/{AlarmScheduler,ReminderCoordinator}.kt  sched/receivers/*Receiver.kt
  work/{Rollover,HealthSync}Worker.kt   notify/{Channels,Notifications}.kt
  widget/{WaterWidget,AddWaterAction,UndoWaterAction,FastingWidget,RingBitmap}.kt
  security/AppLock.kt  export/{SnapshotWriter,ExportImport,PdfReportWriter}.kt  hc/PermissionsRationaleActivity.kt
  ui/{theme,components,nav,today,cycle,move,habits,settings,onboarding,review,lock}/
app/src/main/res/xml/{data_extraction_rules,backup_rules,water_widget_info,fasting_widget_info}.xml
app/schemas/ (exported Room schemas, committed)   gradle/libs.versions.toml
```
**Navigation:** bottom tabs **Today · Cycle · Move · Habits**, with Settings behind a gear icon.

## Data model (key points)
- **How a "day" is assigned:** every timestamped record stores `at` (UTC time), `zone` (IANA time zone) and `day`.
  - `day` is the logical date, computed once at write time using a configurable day boundary (00:00–05:00, default 03:00).
  - Queries use `day`. Changing the boundary or traveling never rewrites history.
  - Cycle and symptom data use plain calendar dates.
- **Tables:**
  - `period(startDate unique, endDate?, excludeCycle)`, `period_flow`.
  - `symptom_def` (pinnable; severity, scale or yes/no), `symptom_entry(day, key, value)`.
  - `habit(type YES_NO|NUMERIC|TIMER, builtInKey?)`.
  - `habit_rule(habitId, effectiveFrom, cadence DAILY|WEEKLY|MONTHLY, timesPerPeriod, target, freezesPerMonth=2)`. Rules are versioned, so editing a rule never rescores history.
  - `habit_entry(habitId, day, value, source MANUAL|AUTO_*, manualOverride)`: the raw facts.
  - `habit_period(habitId, periodStart, status MET|OPEN|FROZEN|MISSED|PAUSED, streakAfter, freezeMonth?)`: a derived cache that also serves as the freeze ledger.
  - `auto_rule(habitId, source, packageName?, threshold)`, `travel_period`, `water_entry`.
  - `workout(type, durationMin, intensity 1–5, notes)`.
  - `fasting_session(startAt, endAt?, targetMin=960)`.
  - `step_day`, `sleep_night`.
  - `reminder_rule(kind, anchor FIXED_TIME|DAYS_BEFORE_PERIOD|PHASE_START|WEEKDAY, offsetDays, discreet)`.
- **Auto-ticks** never overwrite a manual entry. If the user un-ticks an auto-tick, store 0 with `manualOverride` set.

## Core algorithms (all in `:domain`, pure functions with an injectable clock)
1. **Streaks and freezes (`StreakEngine`)**
   - The engine walks through periods: a day, a Mon–Sun week, or a month.
   - Days inside a travel period are excluded, and weekly targets are prorated.
   - When a period is met, the streak goes up by 1.
   - A closed, unmet period uses a freeze if the month the period *ends* in still has allowance. Status FROZEN: the streak is kept but doesn't grow. With no allowance left, status is MISSED and the streak resets to 0.
   - The current open period is never penalized.
   - The whole history is recomputed on every write and at rollover. This is idempotent, so backfilling a missed day refunds its freeze.
   - Only periods that ended yesterday trigger a notification, combined into one summary.
2. **Cycle prediction (`CyclePredictor`, `PhaseCalculator`)**
   - **Next period:** last start + the mean of the last 6 usable cycles. Usable means not excluded and 10–90 days long. With fewer than 2 cycles, use the typical length from onboarding (default 28).
   - **Uncertainty:** ±⌈standard deviation⌉ days, capped at 7.
   - **Ovulation:** next start − luteal length (default 14, allowed range 10–16).
   - **Fertile window:** ovulation −5 days through ovulation day.
   - **Phases:** Menstrual → Follicular → Fertile/Ovulation → Luteal → Late-luteal/PMS (the last 5 days).
   - **Edge cases:**
     - Short luteal phase: clamp ovulation to the day after the period ends and mark the prediction low-confidence.
     - Late period: show "Late n days" and suppress reminders.
     - Outliers: cycles <21 or >35 days, or more than 7 days from the median, prompt a suggestion to exclude them.
     - Birth-control mode only changes the display; it hides the fertile window.
   - **Messaging:** neutral wording for irregular-cycle alerts, plus a "not contraception" disclaimer.
   - **Cycle reminders:** a rule engine. The default rule is "Vitamin C", 5 days before the *earliest* predicted start.
3. **Water reminders (`WaterPlanner`)**
   - **Pace:** expected intake = target × fraction of active hours elapsed. You're on pace if consumed + half a tap ≥ expected.
   - **Scheduling:** check 2 hours after the last tap (configurable), only within active hours. Skip silently when on pace. Stop at the goal or during travel.
   - **The notification:**
     - It is ongoing, with actions "I drank water" and "Snooze 30m".
     - First swipe: it re-posts silently, because Android 14+ allows swiping ongoing notifications away.
     - Second swipe on the same reminder: treated as "not now", and the next check is rescheduled.
     - A tap from anywhere (app, widget or notification) cancels it and replans.
4. **Day rollover**
   - **Trigger:** an exact alarm at the day boundary + 1 minute starts a unique `RolloverWorker`. It also runs on app open and every 6 hours as a catch-up.
   - **For each unclosed day:**
     - Finalize steps (Health Connect aggregate, or the sensor snapshot).
     - Compute app usage from UsageStats events, clipped to the logical day.
     - Read sleep.
     - Auto-tick habits.
     - Recompute streaks, which closes periods as FROZEN or MISSED.
     - Write the daily backup snapshot.
     - Replan all alarms.

**Background map:**
- Exact alarms:
  - habit reminders
  - cycle reminders
  - weekly review (Sun 18:00)
  - water checks
  - fasting target reached
  - the rollover trigger
- WorkManager:
  - Rollover (unique)
  - HealthSync (hourly, only if background-read permission is granted)
- `SystemEventsReceiver` replans everything idempotently on:
  - `BOOT_COMPLETED`
  - `MY_PACKAGE_REPLACED`
  - `TIMEZONE_CHANGED`
  - `TIME_SET`
  - changes to the exact-alarm permission
- Alarms use deterministic request codes.

## Backup, export & security
- **Google backup (Android Auto Backup)**
  - Turn on with `allowBackup=true`.
  - In `data_extraction_rules.xml`, set `<cloud-backup disableIfNoEncryptionCapabilities="true">`, so nothing uploads unless it is end-to-end encrypted with the screen lock. Use `requireFlags="clientSideEncryption"` in the older `backup_rules.xml`.
  - Include `files/backup/` and DataStore. Exclude the live Room database files, because copying the database mid-write can produce an inconsistent copy.
- **Daily snapshot:** the rollover job writes `files/backup/snapshot.json.gz` using the same exporter as manual export, so the schema is versioned. The OS uploads it roughly daily when the phone is idle, charging and on Wi-Fi.
- **Restore:** on first launch, if the database is empty and a restored snapshot exists, show "Restore your data from <date>?" and import it.
  - **Verify in M1:** confirm restore works for a sideloaded install, using `adb shell bmgr backupnow` / `bmgr restore` plus a real uninstall/reinstall. If restore doesn't trigger for sideloaded installs, the manual export below is the fallback, and Google Drive API backup becomes a v2 option.
- **Manual export/import:** a JSON file with an optional password (PBKDF2-HMAC-SHA256 600k + AES-256-GCM, header as AAD). Saved through the system file picker or share sheet, for example to Drive.
- **App lock:** fingerprint/PIN on open and after N minutes in the background. Widgets and notification actions (water, fasting) keep working while the app is locked. Cycle notifications use `VISIBILITY_PRIVATE` with a discreet public version.
- **No third-party SDKs:** no analytics, crash reporting or ad libraries. The merged manifest is reviewed each milestone.
- **Health Connect manifest requirements for sideloaded apps:**
  - A permission-rationale activity (Android ≤13).
  - A `VIEW_PERMISSION_USAGE` activity-alias (Android 14+).
  - `<queries>` for the Health Connect app on Android 9–13.
- **Release signing:**
  - The keystore lives at `%USERPROFILE%\keystores\cadence-release.jks`.
  - Its credentials live in `%USERPROFILE%\.gradle\gradle.properties`, never in the project.
  - Back up the keystore offline. Losing it blocks updates for everyone, and Google backup restore is tied to the same signing key.
- **corporate laptop:** synthetic test data only. Never copy real health exports onto it.

## Milestones (each ends with an installable APK on the phone)
- **M0: Environment + skeleton**
  - **Install tools:** the user installs Android Studio (the company software portal if offered, otherwise the official installer; check IT policy), and optionally Git.
  - **Phone connection:** wireless debugging to the phone. The emulator is probably blocked on the corporate laptop.
  - **Corporate network:** if Gradle downloads fail, set proxy/SSL trust in the user-level `gradle.properties`.
  - **Project scaffold:** `:domain` + `:app`, version catalog, theme, four-tab navigation, Room database, backup rules, and a signed release build installed on the phone.
- **M1: Habits + water + lock + backup (first useful version)**
  - **Habits:** 6 preloaded plus custom habits (yes/no, number or timer; daily, X per week or monthly). Streaks with freezes, the day boundary, a strip for backfilling yesterday, and a heatmap.
  - **Background:** habit reminders and the rollover job.
  - **Water:** home-screen widget (+1 / undo / progress ring), water settings (ml per tap, target, taps per day) and sticky reminders.
  - **Security and backup:** app lock, a Samsung battery-optimization guidance screen, daily snapshot + Google backup + restore prompt, and manual export/import.
- **M2: Cycle + symptoms**
  - Onboarding asks for the last 2–3 start dates and typical length.
  - Predictions with ranges, a phase ring and a calendar.
  - Vitamin C and other cycle reminders, discreet wording, irregular-cycle alerts, birth-control mode.
  - A 5-second symptom and mood log, and a cycle card on Today.
- **M3: Move + automatic check-offs**
  - **Workout logger:** about 20 types, duration presets, intensity 1–5, "repeat last".
  - **Health Connect:** permissions, steps, sleep, optional workout write, with the step-sensor fallback.
  - **Auto-ticks:** 5K steps; a workout ticks Gym; water ticks Water 2L; app usage ticks Duolingo/Kindle.
- **M4: Fasting + travel + weekly review**
  - **Fasting timer:** works from the app, widget and notification, with an editable start time. Reaching the target auto-ticks intermittent fasting.
  - Travel/off mode.
  - A Sunday review notification and screen.
- **M5: Insights + doctor PDF** (last, because insights need several cycles of data)
  - **Symptom clustering:** find the 3-day window that contains the symptom in at least 60% of cycles. Requires at least 3 cycles.
  - **Habit ↔ symptom correlations:** Spearman, with n ≥ 4 cycles and |ρ| ≥ 0.5, worded as "tends to".
  - **Doctor PDF:** 12 months on US Letter via `PdfDocument`, saved through the system file picker.
  - Polish.

## Verification
- **Unit tests in `:domain`** (JVM, run with `./gradlew :domain:test`):
  - **Streaks:**
    - the 3rd miss resets
    - Jan 31 / Feb 1 freezes count against different months
    - a weekly habit spanning a month end
    - travel proration
    - backfill refunds a freeze
    - a rule change is not retroactive
    - the 3am boundary and US DST
    - recompute is idempotent
  - **Cycle:**
    - fewer than 2 cycles
    - an excluded outlier
    - the variance range
    - the short-luteal clamp
    - a late period
  - **Water planner:** pace edge cases, goal reached, the second-dismiss guard.
  - **Export codec:** round trip, wrong password, tampered header.
- **On-device tests, run on the phone:**
  - Room DAO tests and migration tests against the exported schemas.
  - A few Compose UI tests:
    - ticking a habit updates the streak
    - water +1 updates the ring
    - the lock gate appears
- **Manual on-device checklist, each milestone:**
  - **Widget:** +1 works with the app killed and after a reboot.
  - **Sticky reminder:** the first swipe re-posts it, the second swipe stops it.
  - Actions work from the lock screen.
  - **Alarms under Doze:** `adb shell dumpsys deviceidle force-idle` + `dumpsys alarm`.
  - Changing the time zone.
  - The Health Connect permission flow.
  - The Duolingo auto-tick.
  - **Backup round trip:** `bmgr backupnow` → uninstall → reinstall → restore prompt.
  - Manual export/import.
  - **Upgrade install:** data is kept.
  - **Third-party SDK check:** merged manifest and APK Analyzer show none.

## Key risks
- **Corporate laptop restrictions:** admin rights, proxy, SSL inspection or virtualization may block Android Studio, Gradle or the emulator. Mitigation: wireless debugging and user-level proxy settings.
- **Auto Backup quirks:**
  - It runs on the OS schedule, roughly daily.
  - It needs a screen lock for end-to-end encryption.
  - Restore for sideloaded installs must be verified in M1. The fallback is manual export, or a v2 Drive API backup.
- **Samsung battery killing** can stop reminders. Mitigation: a guidance screen plus an ignore-battery-optimization request, which is fine for a sideloaded app.
- **Health Connect background reads** may not be granted. Auto-ticks then finalize on the next app open, and late data simply refunds freezes.
- **Android developer verification** reaches the US around 2027. Before then, register a free limited-distribution account (up to 20 devices) with the release key. Installs via adb stay exempt.
- **Material 3 1.5.0 is in beta.** The wrapped components limit the blast radius of any API changes.

## Corporate-laptop safeguards during implementation
- The desktop app has no sandbox, so the user reviews every command.
- I warn before any install or Gradle dependency download, because package installs can run code.
- No secrets go in the project folder.
- AI-generated code is reviewed and tested on the device before anyone else installs it.
