# Cadence — Handoff for the next agent

**Read this whole document before you change anything.** It is written for an AI coding agent
(for example Claude Sonnet) continuing this project on the owner's personal laptop, with her Google
Pixel phone. Everything you need is here: what the app is, what has been decided, how the code is
organised, the rules that keep users' data safe, the exact steps to build, test, sign and install,
a device test checklist, and a backlog.

If something in the repository contradicts this document, **stop and tell the owner** rather than
guessing. Last updated: 2026-10-12, version `0.1.0` (`versionCode 1`).

---

## Contents

0. [How to work on this project (rules for you)](#0-how-to-work-on-this-project-rules-for-you)
1. [What the app is and what's been decided](#1-what-the-app-is-and-whats-been-decided)
2. [Current status](#2-current-status)
3. [Repository map](#3-repository-map)
4. [Architecture and key flows](#4-architecture-and-key-flows)
5. [Rules that must never be broken](#5-rules-that-must-never-be-broken)
6. [Phase A — Set up the laptop and prove the build](#6-phase-a--set-up-the-laptop-and-prove-the-build)
7. [Tests: inventory, commands, how to write more](#7-tests-inventory-commands-how-to-write-more)
8. [Phase B — Install the debug build on the Pixel](#8-phase-b--install-the-debug-build-on-the-pixel)
9. [Phase C — Release signing and the everyday build](#9-phase-c--release-signing-and-the-everyday-build)
10. [Phase D — First-run setup on the phone](#10-phase-d--first-run-setup-on-the-phone)
11. [Phase E — On-device acceptance checklist](#11-phase-e--on-device-acceptance-checklist)
12. [Phase F — Sharing with friends](#12-phase-f--sharing-with-friends)
13. [Known limitations (deliberate)](#13-known-limitations-deliberate)
14. [Backlog, in priority order](#14-backlog-in-priority-order)
15. [Recipes (step by step)](#15-recipes-step-by-step)
16. [Troubleshooting](#16-troubleshooting)
17. [Review history](#17-review-history)
18. [Provenance and policy notes](#18-provenance-and-policy-notes)
19. [Glossary](#19-glossary)

---

## 0. How to work on this project (rules for you)

1. **Run the tests after every change** (command in §7). Never say a task is done, and never
   commit, while a test fails. If a test fails, report the failing test's name and message.
2. **Never "fix" a failing test by changing what it expects** unless the owner asked for that
   behaviour to change. Read the test's name and failure message first: many tests exist because
   a real bug was found (see `ReviewRegressionTest`, `FinalReviewRegressionTest`,
   `CompatibilityGuardTest`).
3. **Do not upgrade library or tool versions** unless asked. The versions in
   `gradle/libs.versions.toml` were chosen to work together (Kotlin 2.4.20 + AGP 9.3.1 + KSP
   2.3.12 + Gradle 9.5.0, daemon on Java 25 via `gradle/gradle-daemon-jvm.properties`). Upgrading
   one can break the build in confusing ways.
4. **Privacy is a product requirement.** Do not add analytics, crash reporting, ads or any SDK
   that sends data off the phone. The app has **no `INTERNET` permission** (checked in the merged
   release manifest; WorkManager adds `ACCESS_NETWORK_STATE`, `WAKE_LOCK` and `FOREGROUND_SERVICE`,
   which give no network access). Keep it that way unless the owner explicitly asks. After adding any
   library, build a release and check
   `app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml`
   for `INTERNET`. The only off-device copies are Android's encrypted Google backup and files the
   user exports herself.
5. **Ask the owner before anything irreversible on her phone**: uninstalling Cadence (this deletes
   her data unless she exported it), clearing app data, changing `applicationId`, creating or
   replacing the signing key, or importing a file over her data.
6. **No secrets in the repository.** The release keystore and its passwords live outside the
   project (see §9). `.gitignore` already blocks `*.jks`, `*.keystore` and `local.properties`.
7. **No real health data in the repository** (tests, fixtures, screenshots). Use synthetic data.
8. **Keep changes small and match the surrounding code**: same naming, same comment style
   (short "why" comments, no noise), same components (§5.12). Prefer editing an existing file to
   adding a new abstraction.
9. **US English** in everything the user sees ("color", "gray", "traveling", "estrogen").
10. When you are unsure what the owner wants, **ask her** instead of choosing for her.

---

## 1. What the app is and what's been decided

**Cadence** (working name) is a private Android app for one person, the owner,
and about five friends. It is installed directly from an APK; it is **not** on the Play Store.
Its point is a calm, Apple-Health/Clue-like tracker that **does not sell or share data**.

### Tabs and features

| Tab | What it does |
|---|---|
| **Today** | Date header; banners (notification permission, usage access, off mode); today's habits with one-tap check circles; water card; cycle summary; steps (only if Health Connect exists); workouts; fasting (only if a fast is running or a fasting habit exists). |
| **Cycle** | Phase ring ("Day 8 · Follicular phase · Period in about 21 days"), period started/ended buttons, month calendar with phases, day sheet (period start/end + 14 symptoms), upcoming (next period, fertile window, cycle reminders), insights (symptom patterns + correlations) with a doctor-ready PDF, cycle history, cycle reminders, disclaimer. |
| **Move** | Water (ring, +tap, undo, today's entries, 7-day bars), steps and sleep from Health Connect, workouts (21 types, duration, intensity 1–5, notes, "Repeat last"), fasting timer. |
| **Habits** | Last-7-days rows with tappable day dots for backfilling, "Your week so far" (weekly review), off mode, how streaks work, + to add a habit. Habit detail: stats, 26-week heatmap, "Fill in a past day", edit. |
| **Settings** (gear) | Water, day boundary, fasting goal, cycle, notifications, privacy & app lock, connections (Health Connect, usage access), backup (export/import), developer tools (debug builds only), about. |

**Home-screen widgets:** Water (`I drank water +200 ml`, Undo, progress) and Fasting (start/end, progress).

**Six preloaded habits:** Gym (ticks from a ≥15-min non-walking workout), Read a chapter
(manual), Drink water (ticks at the water goal), 5K steps (number habit filled from Health
Connect), Intermittent fasting (ticks when a fast reaches its goal), Duolingo lesson (ticks after
3 minutes in Duolingo, via Usage access).

### Decisions already made with the owner (do not reopen them)

| Topic | Decision |
|---|---|
| Look | Calm and clean (Apple Health / Clue). One accent per area: rose = cycle, blue = water, green = habits, amber = move. No dynamic color. |
| Streaks | Duolingo-style freezes: **2 per month** for daily habits (1 weekly, 0 monthly by default; editable per habit). A miss uses a freeze; with none left the streak resets. Backfilling a missed day refunds the freeze. **No freeze is spent when there is no streak to protect** (changed in the final review). |
| Day boundary | Configurable, default **3 am**: late nights count for the previous day. |
| Water reminder | Every ~2 h, only when behind pace, only within active hours (default 9 am–9 pm), stops at the goal. It is sticky: on Android 14+ a swipe re-posts it once silently; a second swipe is respected. It clears itself just after active hours end. |
| Vitamin C | "Time to add more vitamin C" 5 days before the **expected** period start. |
| Privacy level | the owner said: *"It can be connected to internet… don't want it to be that private."* So: Android Auto Backup (end-to-end encrypted with the phone's screen lock) + manual export/import with an optional password. App lock (fingerprint/PIN) only — **no** database encryption. No ads/analytics/trackers. |
| Health data | Health Connect (read only) for steps, sleep, workouts. She has **no watch**; Pixel phones count steps. |
| Region | USA (US English, US Letter PDF, 12-hour times). |
| Distribution | Sideloaded APK for her and ~5 friends. |

---

## 2. Current status

- **Feature-complete v0.1.0.** All features above are implemented.
- **167 automated tests pass**: 84 JVM tests in `:domain`, 83 Robolectric tests in `:app`
  (unit + integration + Compose UI smoke tests).
- **Verified on an Android 17 emulator** (Pixel-like, 1080×2400), including: every tab, dark mode,
  habit create/backfill/number entry, workout logging, fasting, weekly review, cycle setup →
  ring/calendar/predictions, the water widget added from the launcher (tap and Undo, also after
  an app update), the sticky water notification, **all reminders firing from real exact alarms
  while the device was forced into deep Doze**, app lock with a real PIN (unlock, cancel, Home and
  back stays locked), and the **minified release build** (R8) launching, seeding data and
  restoring navigation after process death.
- **Not yet done (needs the phone):** everything in Phase B–F: real Health Connect data, Usage
  access with Duolingo, Google backup round trip, reboot, a full day of reminders, battery
  behaviour, friends' phones.
- **No release keystore exists yet.** Create it on the personal laptop (§9).
- The project was **not** under git when handed over. It reaches the personal laptop either as
  `CADENCE_SOURCE_BUNDLE.txt` (most likely) or via her GitHub (§6 A1).

---

## 3. Repository map

```
Tracker/
├── CLAUDE.md                     Short rules for any agent (auto-loaded by Claude Code). Points here.
├── README.md                     Human overview.
├── docs/HANDOFF.md               This file.
├── docs/PLAN.md                  The original implementation plan (historical; this file wins).
├── settings.gradle.kts           Modules :app and :domain.
├── build.gradle.kts              Plugin declarations only.
├── gradle.properties             Non-secret build settings.
├── gradle/libs.versions.toml     All versions (pinned; don't upgrade casually).
├── gradle/gradle-daemon-jvm.properties  Gradle daemon runs on Java 25 (auto-downloaded if missing).
├── gradle/wrapper/…              Gradle 9.5.0 wrapper.
├── domain/                       Pure Kotlin (no Android). All the logic worth unit-testing.
│   └── src/main/kotlin/app/cadence/tracker/domain/
│       ├── time/TimeSource.kt        The only clock (now, zone, calendarToday).
│       ├── time/LogicalDay.kt        DayBoundary; which tracking day an instant belongs to (DST-safe).
│       ├── habit/HabitModels.kt      HabitType, Cadence, HabitRule (versioned), PeriodStatus, StreakResult.
│       ├── habit/Periods.kt          Splits history into days/weeks/months, clipped at rule changes.
│       ├── habit/StreakEngine.kt     Streaks + freezes, recomputed from scratch every time.
│       ├── habit/WeeklySummary.kt    Week-so-far numbers for the weekly review.
│       ├── cycle/CycleModels.kt      PeriodLog, CycleSettings, CyclePrediction, CyclePhase, CycleDay.
│       ├── cycle/CyclePredictor.kt   Next start = mean of last ≤6 usable cycles; range from SD.
│       ├── cycle/CycleTimeline.kt    Phase of any date; periodContaining (THE period-day rule),
│       │                             openPeriodOn, startShortlyAfter, nextFertileWindow.
│       ├── cycle/CycleAlerts.kt      Short/long/variable cycle and long period alerts.
│       ├── cycle/CycleReminderPlanner.kt  When a cycle reminder fires (e.g. 5 days before nextStart).
│       ├── water/WaterPlanner.kt     WaterSettings, pace, next check, fire decision, dismiss, expiry.
│       ├── fasting/Fasting.kt        FastingSession: progress, completion, credited day.
│       ├── insight/SymptomInsights.kt  3-day symptom windows present in ≥60% of ≥3 cycles.
│       ├── insight/Correlations.kt   Spearman correlations (≥4 cycles, |ρ| ≥ 0.5, "tends to").
│       └── export/ExportCodec.kt     Optional export password: PBKDF2 (600k) + AES-GCM.
├── app/
│   ├── build.gradle.kts          Android config, signing from ~/.gradle/gradle.properties, test options.
│   ├── schemas/…/1.json          Room schema v1. COMMITTED. Never edit by hand (see §5.6).
│   ├── proguard-rules.pro        Empty on purpose (libraries ship their own R8 rules; verified).
│   └── src/
│       ├── main/AndroidManifest.xml  Permissions, receivers, widgets, Health Connect rationale.
│       ├── main/res/xml/         backup_rules + data_extraction_rules (what Google backup copies),
│       │                         water_widget_info, fasting_widget_info.
│       ├── main/res/layout/      Widget picker previews only.
│       ├── debug/res/values/strings.xml   Debug app name "Cadence Debug".
│       ├── main/kotlin/app/cadence/tracker/
│       │   ├── TrackerApp.kt         Application: lazy AppContainer, notification channels.
│       │   ├── AppContainer.kt       Manual dependency wiring. `context.container` everywhere.
│       │   ├── MainActivity.kt       Lock gate, Recents thumbnail, foreground sync, BiometricPrompt.
│       │   ├── data/
│       │   │   ├── db/Entities.kt    Room entities (also the export format!) + enums.
│       │   │   ├── db/Daos.kt        Queries. BackupDao = whole-table reads/writes.
│       │   │   ├── db/TrackerDatabase.kt  Version 1, schema export on, no destructive migration.
│       │   │   ├── db/Converters.kt  LocalDate as ISO text, Instant as epoch millis.
│       │   │   ├── prefs/SettingsStore.kt  AppSettings (user settings) + AppState (bookkeeping) in DataStore.
│       │   │   ├── DayClock.kt       today() (tracking day) vs calendarToday(); ticking flows.
│       │   │   ├── AppStartup.kt     First launch: seed or offer restore. InitMarker.
│       │   │   ├── model/Symptoms.kt The 14 symptoms and their value labels.
│       │   │   ├── repo/HabitRepository.kt   Habits, rules, entries, cards, off mode.
│       │   │   ├── repo/WaterService.kt      Every water write + its side effects.
│       │   │   ├── repo/CycleRepository.kt   Periods, symptoms, cycle reminders.
│       │   │   ├── repo/MoveRepository.kt    Workouts, steps, sleep; Gym auto-tick.
│       │   │   ├── repo/FastingService.kt    Fasting timer + notification + credit.
│       │   │   ├── repo/InsightsRepository.kt  Builds symptom insights.
│       │   │   ├── repo/WeeklyReviewBuilder.kt Week-so-far data.
│       │   │   ├── backup/BackupManager.kt   Export/import JSON, daily snapshot, restore.
│       │   │   ├── backup/PdfReportWriter.kt Doctor PDF (US Letter, text only).
│       │   │   └── backup/Serializers.kt     kotlinx-serialization for LocalDate/Instant.
│       │   ├── sched/
│       │   │   ├── AlarmScheduler.kt    Exact alarms, one per (kind, id) via data URI.
│       │   │   ├── ReminderCoordinator.kt  Computes and schedules the next alarm of every kind.
│       │   │   ├── AlarmHandler.kt      What happens when an alarm fires or a notification button is pressed.
│       │   │   ├── Receivers.kt         AlarmReceiver, ActionReceiver, SystemEventsReceiver.
│       │   │   ├── DayCloser.kt         Closes finished days, syncs, streak summary, snapshot, replan.
│       │   │   └── SyncWorker.kt        WorkManager runner for DayCloser (now + every 3 h).
│       │   ├── notify/Notifications.kt  All notifications, channels, IDs.
│       │   ├── health/HealthConnectGateway.kt  Read steps/sleep/workouts.
│       │   ├── health/UsageGateway.kt   App-usage minutes (Duolingo/Kindle).
│       │   ├── health/PermissionsRationaleActivity.kt  Privacy text Health Connect shows.
│       │   ├── security/AppLock.kt      Lock state machine (no UI).
│       │   ├── widget/                  Glance widgets + WidgetUpdater.
│       │   └── ui/
│       │       ├── theme/               Colors (light/dark accents), type, theme.
│       │       ├── components/          Shared UI: cards, controls, pickers, charts, formats, intents.
│       │       ├── nav/Routes.kt, CadenceApp.kt   Navigation 3 routes; startup/restore; tabs.
│       │       ├── today/ cycle/ move/ habits/ review/ settings/ lock/   Screens.
│       └── test/
│           ├── kotlin/app/cadence/tracker/…  Robolectric tests (see §7).
│           ├── resources/fixtures/export-v1.json  Frozen synthetic export (never regenerate).
│           └── resources/robolectric.properties   sdk=35.
```

---

## 4. Architecture and key flows

### 4.1 Layers

```
UI (Compose screens, widgets, notification buttons)
   │  read: Flows from repositories / container.habitCards
   │  write: call a repository/service method — never a DAO directly
   ▼
Repositories & services (data/repo, sched)  ← own ALL side effects:
   │    re-plan alarms, cancel/post notifications, refresh widgets, auto-tick habits
   ▼
Room database (data/db) + DataStore settings (data/prefs)
   ▲
Pure logic (domain/): streaks, cycle, water, fasting, insights, export crypto
```

`AppContainer` builds everything once (manual DI). Activities, widgets, receivers and workers all
reach it with `context.container`. Tests build their own container with a fake clock, an in-memory
database and a temporary settings file (`app/src/test/.../TestEnv.kt`).

Important container members: `timeSource`, `clock` (DayClock), `db`, `settings`, `appScope`
(background writes that must outlive a screen; errors are logged, not crashed), `dataLock` (mutex
for whole-database work), `settingsState`, `habitCards` (shared StateFlow of habit cards),
`habits`, `water`, `cycle`, `move`, `fasting`, `insights`, `weeklyReview`, `health`, `usage`,
`backup`, `pdfReport`, `reminders`, `scheduler`, `notifications`, `widgets`, `dayCloser`,
`alarmHandler`, `startup`, `appLock`, `importData()`.

### 4.2 Key flows

**Ticking a habit (Today or Habits tab)** → `HabitRepository.toggle/setValue` writes a MANUAL
entry (manual always beats automatic), moves the habit's start back if the day is earlier
(`extendStartTo`), cancels that habit's reminder notification. Cards update through
`observeCards()` → `container.habitCards`. Streaks are recomputed from the full history by
`StreakEngine.evaluate` every time.

**Water tap (app, widget, or "I drank water" in the notification)** → `WaterService.addTap()`:
insert entry → `syncHabit(day)` (Drink water = 1 if total ≥ goal) → cancel the water notification
→ reset `waterReposts`/`waterNotBefore` → `replanWater()` → refresh the widget.

**Water reminder lifecycle**
1. `ReminderCoordinator.replanWater()` schedules the next check with `WaterPlanner.nextCheck`
   (one interval after the last tap, inside active hours), never earlier than `waterNotBefore`.
2. Alarm fires → `AlarmHandler.onWaterCheck()` → `WaterPlanner.decideAtFire`: POST if behind
   pace, SKIP if on pace, NONE outside hours/goal reached/paused. Posting sets a timeout so the
   notification clears itself at active-hours end + 3 min.
3. Notification is ongoing with "I drank water (+200 ml)" and "Snooze 30 min".
   Swipe (Android 14+) → `onWaterDismissed()`: first swipe while behind and in hours → re-post
   silently; otherwise accept and schedule the next check one interval later.

**Closing a day (`DayCloser.run`)** runs on app open (at most every 2 min), from `SyncWorker`
(right after the day boundary via the ROLLOVER alarm, and every 3 h), after saving a habit, after
Health Connect permissions are granted or "Refresh" is tapped on the Steps card, and from the
developer tools. It does nothing until first-launch setup finished (`InitMarker`). Under `dataLock`,
for each day from `min(lastClosedDay + 1, yesterday)` (but at most 14 days back) to today: Health
Connect sync (yesterday is always re-read; data arrives late), and — **only for days after
`lastClosedDay`** — app-usage sync and the water habit check (those settings aren't versioned).
Then, if at least one new day closed (`lastClosedDay` before yesterday) and the streak summary is
enabled, the streak summary notification (only real news: a freeze used, or a streak that was > 0
reset); `lastClosedDay = yesterday`; the backup snapshot if the last one is older than 20 h; then
`replanAll()` and widget refresh.

**Cycle prediction** (`CyclePredictor.predict`, exposed as `CycleTimeline.prediction`; phases by
`CycleTimeline.day`): logs normalised; next start = last start + mean of the last
≤6 usable cycle lengths (10–90 days); fewer than 3 cycles → ±2 days range, else ±ceil(SD) capped
at 7. Ovulation = next start − luteal length (default 14); fertile window = 5 days before
ovulation through ovulation; late-luteal (PMS) = last 5 days. Short cycles clamp ovulation and flag
low confidence. A late period keeps today in late-luteal and suppresses cycle reminders.
**Vitamin C**: `CycleReminderPlanner.nextFire` = `nextStart − 5 days` at 9:00.

**Period buttons**: "Period ended today" is offered (prominently) while the open period is within
its usual length, and (subtly, outlined) through day 14 of the period, i.e. start + 13 days
(`openPeriodOn`). Logging a
start up to 7 days before an existing start **moves** that start (`startShortlyAfter`) instead of
creating an impossible 1-day cycle. Whether a day counts as a period day is always
`periodContaining` (see §5.3).

**Backup**
- *Daily snapshot*: `BackupManager.writeSnapshot()` writes `files/backup/snapshot.json.gz`
  (same JSON as a manual export), read in one DB transaction and written with `AtomicFile`. It
  refuses to overwrite an existing snapshot with a completely empty database. Then it sets
  `AppState.lastSnapshotAt` and calls Android's `android.app.backup.BackupManager(context).dataChanged()`
  so the system schedules a backup.
- *What Android backs up*: only `files/backup/` and `files/datastore/` (settings), and only when
  end-to-end encryption is available, i.e. the phone has a screen lock: `data_extraction_rules.xml`
  (`disableIfNoEncryptionCapabilities`, Android 12+) and `backup_rules.xml`
  (`requireFlags="clientSideEncryption"`, Android 9–11). Device-to-device transfer copies the same
  folders. The live Room DB is not backed up (copying it mid-write can corrupt it).
- *Restore*: on a reinstall Android restores those files before first launch. `AppStartup.check()`
  sees no `InitMarker` (it lives in `noBackupFilesDir`, never restored) + a snapshot + an empty DB
  → shows `RestoreScreen` (`ui/lock/LockScreens.kt`): title **"Welcome back"**, text "We found your
  Cadence backup from <date>. Restore your habits, cycle history and settings?", buttons
  **Restore my data** / **Start fresh** (if reading fails: "Couldn't restore" / **Try again**).
  Either choice then creates the marker.
- *Manual export/import*: Settings → Backup. Optional password (PBKDF2 600k + AES-256-GCM).
  Import replaces everything (after a confirm dialog), skips orphan rows, then re-plans alarms,
  syncs the fasting notification and refreshes widgets.

**App lock** (`AppLock` + `MainActivity`): **on by default** (`appLockEnabled = true`). Locks on
cold start and after the timeout (default 5 min) in the background, only if enabled **and** the
phone has a screen lock — so on a phone with a PIN, the very first launch shows the unlock prompt
before anything else (even before the restore screen). Once locked, only a
successful BiometricPrompt unlock opens it (leaving and returning does not). While locked the app
UI is **not composed at all** (so dialogs/sheets can't float above the lock); saved navigation
state survives. With the lock on, Android 13+ shows no app thumbnail in Recents. Widgets and
notification buttons keep working while locked (by design).

**Health Connect** (`HealthConnectGateway`): read-only steps (daily aggregate), sleep (sessions
ending in the day), exercise sessions (imported as workouts, de-duplicated by record id). Reads
happen in the foreground; background reads only if `READ_HEALTH_DATA_IN_BACKGROUND` was granted.
On Android 14+ Health Connect is built into the system; on 9–13 it's an app from the Play Store.

**Usage access** (`UsageGateway`): foreground minutes per package from UsageStats events
(RESUMED/PAUSED), clipped to the tracking day. Ticks APP_USAGE habits at their threshold.

**Fasting** (`FastingService`): start/stop/edit start/delete, an ongoing notification with a
system chronometer, a FASTING alarm at the goal ("Fast complete" on the reminders channel), the
fasting habit credited for the day the goal was reached.

### 4.3 Background map

| Alarm kind (`AlarmKind`) | Scheduled by | Fires → |
|---|---|---|
| ROLLOVER | `scheduleRollover` (boundary + 1 min) | `SyncWorker.enqueueNow` → DayCloser |
| WATER | `replanWater` | water check (§4.2) |
| HABIT (id = habit id) | `replanHabits` (daily at the habit's reminder time) | reminder if not done/paused |
| CYCLE (id = reminder id) | `replanCycle` | cycle reminder (discreet option) |
| WEEKLY_REVIEW | `replanWeeklyReview` (Sunday, default 6 pm) | weekly review notification |
| FASTING | `replanFasting` (goal time) | "Fast complete" + credit |

- Exact alarms: `setExactAndAllowWhileIdle` (`USE_EXACT_ALARM`, auto-granted on Android 13+).
  If exact alarms aren't allowed (Android 12 without the user's grant) it falls back to the
  inexact `setAndAllowWhileIdle`; Settings → Notifications then shows "Allow exact reminder times".
  Each (kind, id) has a PendingIntent identified by the data URI `cadence://alarm/KIND/id`, so
  scheduling again replaces the previous alarm. Re-planning is always safe (idempotent).
- `SystemEventsReceiver` (boot, app update, time set, time-zone change, exact-alarm permission
  change) → `replanAll()`, restore the fasting notification, schedule + run `SyncWorker`.
- WorkManager: unique `sync-now` (one-time, KEEP) and `sync-periodic` (every 3 h, KEEP).

| Notification | Channel | ID |
|---|---|---|
| Water reminder (ongoing) | `water` | 1 |
| Fasting timer (ongoing, silent) | `fasting` (low) | 2 |
| Weekly review | `summary` | 3 |
| Streak summary | `summary` | 4 |
| Fast complete | `reminders` | 5 |
| Habit reminder | `reminders` | 1000 + habit id |
| Cycle reminder (VISIBILITY_PRIVATE, discreet public version) | `reminders` | 100000 + reminder id |

---

## 5. Rules that must never be broken

Each rule says **what**, **why**, and **how to follow it**.

### 5.1 One clock
- **What:** all time comes from `TimeSource` (`container.timeSource`, `clock.time`). Never call
  `Instant.now()`, `LocalDate.now()`, `System.currentTimeMillis()`, `Clock.systemDefaultZone()`
  in app logic. (Exceptions already in the code: `MainActivity`'s 2-minute sync throttle and
  `AppLock`'s `SystemClock.elapsedRealtime()` — they measure durations, not dates.)
- **Why:** tests control time with `FakeTime`; mixed clocks make day-boundary bugs.

### 5.2 Two kinds of "today"
| Use | Call |
|---|---|
| Habits, water, steps, sleep, workouts, fasting credit, weekly review | `clock.today()` / `clock.dayOf(instant)` / `clock.todayFlow` (tracking day, 3 am boundary) |
| Cycle data, symptoms, wall-clock reminders (habit/cycle/weekly) | `clock.calendarToday()` / `clock.calendarTodayFlow` (plain date) |

### 5.3 One "is this a period day?" rule
`CycleTimeline.periodContaining(date)` is the only rule. Don't re-implement "start + length" in
UI or repository code. `openPeriodOn` and `startShortlyAfter` only decide which buttons to offer.

### 5.4 Writes go through repositories/services
UI, widgets, receivers and workers never write to DAOs directly. The services re-plan alarms,
cancel notifications and refresh widgets; skipping them leaves stale reminders and widgets.
Reading a DAO for display is fine.

### 5.5 Habits keep their history honest
- A habit's **type never changes** after creation (the editor locks it). Changing it would rescore history.
- Target/frequency/freezes changes create a **new `HabitRule`** (`effectiveFrom`) through
  `HabitRepository.update`; never change an existing rule's values any other way. Same cadence →
  the new rule starts with the current period; cadence change → it starts after the current period
  (the editor explains a pending change). Rules are keyed by (habitId, effectiveFrom), so a second
  edit within the same period replaces the rule the first edit created — that's intended.
- **Manual entries always win** over automatic ones; `autoRecord` skips MANUAL entries. "Clear"
  (`clearValue`) hands a day back to automatic syncs.
- **Don't re-score closed days with today's unversioned settings** (water goal, app-usage minutes).
- Streaks are always recomputed from raw entries; never store a streak count.

### 5.6 The database: no change without a migration
- Room version is **1**. `app/schemas/app.cadence.tracker.data.db.TrackerDatabase/1.json` is
  committed and frozen. `CompatibilityGuardTest` fails if `1.json` no longer contains the v1
  identity hash, or if a schema file is missing for any version up to the current one (so after a
  bump, a missing `2.json` fails too). `SchemaMigrationTest` proves a v1 database opens with the
  current code.
- Any change to an entity (field added/removed/renamed/retyped, table, index) **must** bump the
  version and ship a `Migration` — see Recipe R2. **Never** use `fallbackToDestructiveMigration`:
  it would wipe a user's health history on update.
- Adding a DAO *query* does not change the schema (no migration needed).

### 5.7 Entities are also the export format
`ExportFile` serialises the entities directly. Renaming/removing a field or an enum constant
(`AutoSource`, `WorkoutType`, `CycleAnchor`, `HabitType`, `EntrySource`, …) breaks old exports and
snapshots. New fields need default values. Keep `fixtures/export-v1.json` importing (Recipe R3).

### 5.8 Settings: every place to update
A new user setting needs: `AppSettings` (+ default), `SettingsStore` (key in `K`, read, write),
`SettingsSnapshot` (field added **last, with a default value**, in `of` and `toAppSettings`), the
Settings UI, and `CompatibilityGuardTest`'s `custom` value. Recipe R1. (Bookkeeping that isn't a
setting goes in `AppState` only.)

### 5.9 Backup invariants
- The snapshot stays at `files/backup/snapshot.json.gz`; settings stay in DataStore
  `files/datastore/settings.preferences_pb`. Both XML rule files list exactly those folders. A new
  DataStore file or a moved file silently drops out of Google backup.
- Background work must keep waiting for `InitMarker` (otherwise a fresh install could overwrite a
  restored snapshot before the user chose to restore).

### 5.10 Notifications
Channel IDs and their importance **can't be changed after users install the app** (Android keeps
the user's copy). Add a new channel instead of changing one. Keep the fixed IDs in §4.3.

### 5.11 Alarms
Use `AlarmScheduler.schedule(kind, at, id)`; don't create PendingIntents for alarms elsewhere.
After changing anything that affects a reminder time, call the matching `replan…()`.

### 5.12 UI conventions
- Screens: tabs use `TabPage` (a LazyColumn with status-bar padding) and `ScreenHeader`; detail
  screens use `DetailScaffold`. Content goes in `SectionCard { CardHeader(...) … }`.
- Buttons with an accent color use `accentButtonColors(accent.main)` (AA contrast).
- `ChipChoice(options, selected, onSelect, label = { … })` — `label` is the 4th parameter and the
  last one is `modifier`, so a trailing `{ }` lambda doesn't compile; pass `label = { … }` by name.
- `Stepper(…, label = "daily goal")` so screen readers say what it changes.
- Numbers: `display()` for showing ("5,000", "2.25"), `clean()` for editable text fields.
- Opening system screens/the store: `context.safeStartActivity(intent)` (never bare `startActivity`).
- Dialogs: `NumberInputDialog`, `ConfirmDialog`, `DatePickerDialogFor`, `TimePickerDialogFor`.
- Touch targets ≥ 48 dp; icon-only buttons need a `contentDescription`.
- Long work in `produceState`: wrap CPU work in `withContext(Dispatchers.Default)`.
- Habit cards: read `container.habitCards` (shared), not a new `observeCards()` per screen.

### 5.13 `:domain` stays pure Kotlin
No `android.*` imports in `domain/`. If logic needs Android, put the Android part in `:app` and
pass plain values in.

### 5.14 The lock gate
`CadenceApp` is composed only when `locked == false`. Don't move dialogs or sheets outside it.

---

## 6. Phase A — Set up the laptop and prove the build

Do these in order. Each step has a check; don't continue until it passes.

**A1. Get the code.** It arrives one of two ways.

*(a) As `CADENCE_SOURCE_BUNDLE.txt`* (one text file holding every source file; the Gradle wrapper
jar and `gradlew` scripts are deliberately not in it):
1. Put the bundle in a new, empty folder (e.g. `~/Cadence`) and extract it there with the Python or
   PowerShell script printed at the top of the bundle (save the script as a file first). The script
   checks every file's SHA-256 and must print `OK: 149 files extracted and verified into <folder>`.
   If any file fails verification, stop and tell the owner (the file was altered in transit). Then move
   the bundle and the script out of the project folder so they aren't committed.
2. Recreate the Gradle wrapper (`gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`). Either:
   - Android Studio: open the folder, let the sync finish (it reads `gradle/wrapper/gradle-wrapper.properties`
     and downloads Gradle 9.5.0 itself), then Gradle tool window → *Cadence* → *Tasks* → *build setup* →
     double-click **wrapper**; or
   - with any recent Gradle installed (download the binary zip from gradle.org/releases if needed):
     `gradle wrapper --gradle-version 9.5.0` in the project folder. Gradle needs to find the Android
     SDK for this: open the folder in Android Studio once first (it writes `local.properties`), or
     set `ANDROID_HOME` to the SDK folder.
   Check: `./gradlew --version` (Windows: `.\gradlew.bat --version`) prints `Gradle 9.5.0`.
   `gradle-wrapper.properties` must still say `gradle-9.5.0-bin.zip` afterwards (revert if the task changed it).
3. Make it a git repository and commit, so every later change is tracked:
   `git init`, `git add .`, `git commit -m "Cadence v0.1.0 from bundle"`. Check `git status` doesn't
   list `build/`, `.gradle/` or `local.properties` (they're in `.gitignore`).

*(b) From her GitHub*, if she uploaded it there: `git clone <her repo url> Cadence` and `cd Cadence`.

Check (both ways): `docs/HANDOFF.md` and `app/schemas/app.cadence.tracker.data.db.TrackerDatabase/1.json` exist.

**A2. Install Android Studio** (latest stable) from developer.android.com/studio. Its bundled JDK
("JBR") starts the Gradle wrapper. The Gradle **daemon** itself is pinned to **Java 25** by
`gradle/gradle-daemon-jvm.properties`: if no JDK 25 is installed, Gradle downloads one
automatically from the URLs in that file on the first build (needs internet). Don't edit that file.
In Android Studio → Settings → Languages & Frameworks → Android SDK, install **Android SDK
Platform 37** (the app compiles against API 37) and the latest **Android SDK Build-Tools** and
**Platform-Tools** (for `adb`).

**A3. Open the project** in Android Studio (File → Open → the `Cadence` folder). Let Gradle sync
finish (first time it downloads Gradle 9.5.0 and the libraries; several minutes). Android Studio
creates `local.properties` with `sdk.dir`; never commit it.
Check: the sync finishes without errors.

**A4. Command line.** Use the Gradle wrapper from the project root. Point `JAVA_HOME` at Android
Studio's JBR if `java` isn't on your PATH:
- macOS: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`
- Windows (PowerShell): `$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"`
- Linux: `export JAVA_HOME="$HOME/android-studio/jbr"` (wherever Studio is installed)

Use `./gradlew …` on macOS/Linux, `.\gradlew.bat …` on Windows.

**A5. Only if the Windows user folder has a space in it** (e.g. `C:\Users\First Last`): Robolectric
can't load its Android jars from such a path. Add to `%USERPROFILE%\.gradle\gradle.properties`:
```properties
robolectricMavenRepo=C:/Users/FIRSTL~1/.m2/repository
```
(use the real 8.3 short name; find it with `cmd /c dir /x C:\Users`). macOS/Linux never need this.
Corporate TLS-inspection settings from the corporate laptop are **not** needed on a personal laptop.

**A6. Prove the build:**
```bash
./gradlew :domain:test :app:testDebugUnitTest :app:assembleDebug
```
Check: `BUILD SUCCESSFUL`. The first run downloads Robolectric's Android jar (~200 MB). Count the
tests (expected **84** domain + **83** app, all passing, or more if tests were added since):
- macOS/Linux: `grep -ho 'tests="[0-9]*"' domain/build/test-results/test/*.xml app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | paste -sd+ | bc`
- Windows PowerShell: `(Get-ChildItem domain\build\test-results\test\*.xml, app\build\test-results\testDebugUnitTest\*.xml | ForEach-Object { [int]([xml](Get-Content $_)).testsuite.tests } | Measure-Object -Sum).Sum`
- Or open `app/build/reports/tests/testDebugUnitTest/index.html` and `domain/build/reports/tests/test/index.html`.

Shell note for the rest of this document: commands are written for bash. In Windows PowerShell use
`.\gradlew.bat` instead of `./gradlew`, and replace `| grep text` with `| Select-String text`.

If this fails, see §16 before changing any code.

---

## 7. Tests: inventory, commands, how to write more

### 7.1 Commands
| What | Command |
|---|---|
| Everything (do this after every change) | `./gradlew :domain:test :app:testDebugUnitTest` |
| Domain only (fast, seconds) | `./gradlew :domain:test` |
| One test class | `./gradlew :app:testDebugUnitTest --tests "app.cadence.tracker.data.WaterServiceTest"` |
| One test | `./gradlew :app:testDebugUnitTest --tests "app.cadence.tracker.data.WaterServiceTest.*goal*"` |
| Debug APK | `./gradlew :app:assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk` |
| Release APK (R8) | `./gradlew :app:assembleRelease` → `app/build/outputs/apk/release/` |
| Install debug on the connected phone | `./gradlew :app:installDebug` |

Failures: the console shows the failing class; details in `app/build/reports/tests/testDebugUnitTest/index.html`
or the XML in `app/build/test-results/testDebugUnitTest/`.

### 7.2 Inventory (167 tests)

**`:domain` (JVM, 84):**
| File | # | Covers |
|---|---|---|
| `time/LogicalDayTest` | 6 | Day boundary, DST nights |
| `habit/StreakEngineTest` | 16 | Streaks, freezes per month, no freeze at streak 0, backfill refunds, travel pauses, weekly proration, month-end weeks, rule changes not retroactive, start moved before first rule |
| `habit/WeeklySummaryTest` | 4 | Week-so-far numbers |
| `cycle/CycleTimelineTest` | 16 | Predictions, ranges, phases, short cycles (ovulation clamped), late, projection, periodContaining, openPeriodOn, startShortlyAfter, fertile window, birth-control mode |
| `cycle/CycleAlertsTest` | 5 | Short/long/variable cycle alerts, outliers |
| `cycle/CycleReminderPlannerTest` | 7 | Vitamin C timing, late suppression, phase anchors |
| `water/WaterPlannerTest` | 17 | Pace, next check, fire decision, grace, dismiss, snooze/later, expiry |
| `fasting/FastingTest` | 3 | Progress, completion, credited day |
| `insight/SymptomInsightsTest` | 4 | Symptom windows |
| `insight/CorrelationsTest` | 2 | Spearman correlations |
| `export/ExportCodecTest` | 4 | Encrypt/decrypt, wrong password, tampering |

**`:app` (Robolectric, 83):**
| File | # | Covers |
|---|---|---|
| `data/HabitRepositoryTest` | 10 | Create/update/rules, toggle, auto vs manual, off mode |
| `data/WaterServiceTest` | 5 | Taps, undo, habit sync, reminder side effects |
| `data/CycleMoveFastingTest` | 12 | Cycle setup/periods/symptoms, workouts → Gym, HC de-dup, fasting |
| `data/BackupAndStartupTest` | 7 | Export/import, password, invalid files, first launch, restore offer, start fresh |
| `data/ReviewRegressionTest` | 13 | Bugs from the first adversarial review |
| `data/FinalReviewRegressionTest` | 9 | Bugs from the final review (backups for cycle-only users, closed days, streak summary, moving a start, number-habit reminders, water expiry, fasting notification, orphan rows, number formatting) |
| `data/CompatibilityGuardTest` | 3 | **Guards:** frozen DB schema v1, every setting saved + backed up, v1 export still imports |
| `data/SchemaMigrationTest` | 1 | **Guard:** a database written by version 1 opens with the current code (all migrations) and keeps its rows |
| `sched/AlarmHandlerTest` | 11 | Water (behind / on pace / goal / sticky swipe / drink action), snooze + re-plan, habit reminder, off mode, cycle reminder + discreet, system-event re-plan (incl. weekly review alarm) |
| `security/AppLockTest` | 4 | Lock on start, timeout, no bypass by leaving/returning, no lock without screen lock |
| `ui/ScreensTest` | 8 | Compose smoke tests: Today tick, Habits list, Cycle setup, Move log sheet, Settings, grouped numbers, create a habit in the editor, weekly review |

### 7.3 Writing a test
- **Domain logic** → a JVM test in `domain/src/test/...` (fast). Build inputs by hand; use fixed dates.
- **Anything touching Room/DataStore/notifications/alarms** → extend `AppTest` (`TestEnv.kt`):
  you get `c` (a real `AppContainer` with in-memory DB), `time` (`FakeTime`, starts **Monday
  2026-10-12 10:00 America/New_York**; `time.set(month, day, hour)`), `day(month, day)`,
  `notifications`, `activeNotificationIds()`, `newContainer(dir, time)` (a second "install").
  Wrap the body in `runBlocking { … }`. If the body ends with an assertion that returns a value
  (e.g. `assertFailsWith`), put it in braces so the test returns Unit.
- **Compose UI** → follow `ScreensTest`: `@Config(qualifiers = "w411dp-h2400dp")` (tall screen so
  lazy lists compose everything), `compose.waitUntil { … }` for async data, `performScrollTo()`
  before clicking. Writes launched on `appScope` finish asynchronously — `waitUntil` for them.
- Name tests after the behaviour they check, matching the file's style (backticked sentences in
  most files; camelCase in `ScreensTest`).

---

## 8. Phase B — Install the debug build on the Pixel

The debug app is called **"Cadence Debug"** (`app.cadence.tracker.debug`). It's separate from the
release app (`app.cadence.tracker`): separate data, separate widgets. Use it for testing; the owner's
real data should live in the release app (§9).

1. Phone: Settings → About phone → tap **Build number** 7 times (enter PIN) → Developer options on.
2. Settings → System → Developer options → turn on **USB debugging** (cable) or **Wireless
   debugging** (same Wi-Fi).
3. Connect:
   - Cable: plug in, accept the "Allow USB debugging?" prompt on the phone.
   - Wireless: Developer options → Wireless debugging → **Pair device with pairing code**. On the laptop:
     ```bash
     adb pair <ip>:<pairing-port>        # enter the 6-digit code
     adb connect <ip>:<port>             # the port shown on the Wireless debugging screen (not the pairing port)
     ```
   `adb` is in the SDK's `platform-tools` folder (add it to PATH, or use Android Studio's terminal).
4. Check: `adb devices` lists the phone as `device`.
5. Install and start:
   ```bash
   ./gradlew :app:installDebug
   adb shell am start -n app.cadence.tracker.debug/app.cadence.tracker.MainActivity
   ```
6. Check: the phone has a screen lock, so the unlock prompt appears first (app lock is on by
   default); after unlocking, Today shows 6 habits; no crash. Errors, if any:
   `adb logcat -d -s Cadence:E AndroidRuntime:E`.

---

## 9. Phase C — Release signing and the everyday build

Friends and the owner's real data use the **release** build. Every future update must be signed with
the **same key**, forever: a new key means friends must uninstall (losing data) and Google backup
restore won't match. **Create the key once, back it up twice.** Ask the owner before creating it.

1. Create a folder **outside the repository**: `~/keystores` (macOS/Linux) or `%USERPROFILE%\keystores` (Windows).
2. Create the key (the owner types the passwords; store them in her password manager):
   ```bash
   keytool -genkeypair -v -keystore ~/keystores/cadence-release.jks -alias cadence -keyalg RSA -keysize 4096 -validity 36500
   ```
   (`keytool` is in `$JAVA_HOME/bin`. On Windows use `%USERPROFILE%\keystores\cadence-release.jks`.)
3. Add to `~/.gradle/gradle.properties` (Windows: `%USERPROFILE%\.gradle\gradle.properties`) —
   **not** the project's `gradle.properties`:
   ```properties
   CADENCE_STORE_FILE=/Users/<you>/keystores/cadence-release.jks
   CADENCE_STORE_PASSWORD=<store password>
   CADENCE_KEY_ALIAS=cadence
   CADENCE_KEY_PASSWORD=<key password>
   ```
   On Windows write the path with forward slashes: `C:/Users/<you>/keystores/cadence-release.jks`.
4. Back up `cadence-release.jks` + both passwords in two places (e.g. an encrypted USB stick and her
   password manager's file attachment). Never email it or commit it.
5. Build: `./gradlew :app:assembleRelease` → `app/build/outputs/apk/release/app-release.apk`.
   (Without the properties the build produces `app-release-unsigned.apk`, which can't be installed.)
6. Verify the signature:
   ```bash
   <sdk>/build-tools/<version>/apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
   ```
   Check: one signer, CN = what she entered. Keep the SHA-256 digest somewhere — friends' builds must match it.
7. Install: `adb install -r app/build/outputs/apk/release/app-release.apk`.
8. Releasing an update later: bump `versionCode` (by 1) and `versionName` in `app/build.gradle.kts`,
   run all tests, `assembleRelease`, `adb install -r` (keeps data). Never `adb uninstall` the release
   app without an export first.

---

## 10. Phase D — First-run setup on the phone

With the owner, on the **release** app:
1. Open Cadence and unlock (app lock is on by default). If a **"Welcome back"** screen appears,
   it found a Google backup from an earlier install: **Restore my data** (or **Start fresh** if she
   wants a clean slate).
2. Today → **Allow notifications**.
3. Cycle → set up with her last 1–3 period start dates and typical length.
4. Move → **Connect Health Connect** → allow Steps, Sleep, Exercise and "access data in the background".
   On Android 14+ Health Connect is in Settings → Security & privacy → Privacy controls → Health
   Connect. Steps need a source: the Pixel counts steps with Fitbit/Google Fit, or Health Connect's
   own phone step tracking if offered on her Android version — check Health Connect → Data and
   access → Steps shows data.
5. Today → **Allow** usage access (for Duolingo) → find Cadence → allow.
6. Settings → Notifications → **Keep reminders on time** (battery optimization off for Cadence).
7. Settings → Privacy & security → check **App lock** is on (it is by default; it needs a phone
   screen lock) and choose the timeout.
8. Home screen → long-press → Widgets → Cadence → add **Water** (and **Fasting timer** if she fasts).
9. Phone Settings → Google → Backup → make sure backup is on (Google One). Backups only happen with
   a screen lock (end-to-end encryption).
10. Settings → Backup → **Export my data** once, with a password, to Drive — her own safety copy.

---

## 11. Phase E — On-device acceptance checklist

Run on the **debug** build first (it has Settings → **Developer tools** at the bottom), then the
important ones again on the release build. Record pass/fail for each. For a failure, collect
`adb logcat -d -s Cadence:E AndroidRuntime:E` and a screenshot, then fix with a test (§15 R10).

| # | Test | Steps | Expected |
|---|---|---|---|
| E1 | Fresh install | Install, open | Unlock prompt first (lock is on by default, phone has a PIN); then Today with 6 habits; banners for notifications/usage access |
| E2 | App lock | Check Settings → App lock is on; set "Lock after" 1 min; open a dialog (a habit → Fill in a past day → pick a day); press Home; wait 2 min; reopen; Cancel the prompt | "Cadence is locked" screen with **no dialog above it**; after unlocking, the app is back where it was |
| E3 | Lock timeout | Unlock; Home; wait > timeout (pick 1 min); reopen | Locked again. Reopen within 1 min → still open. While locked: Home and back → **stays locked** |
| E4 | Recents | With lock on, open Recents (Android 13+) | No thumbnail of app content |
| E5 | Habit tick | Today → tap Gym's circle; tap again | Ticked (streak 1), then unticked |
| E6 | Backfill | Habits tab → tap yesterday's dot on "Read a chapter" | Dot filled; streak updates |
| E7 | Number habit | + → "Protein", Amount, 60, g → Save → tap Today's dot | Keyboard opens by itself; save 72 → "72 / 60 g", ticked |
| E8 | Past day dialog | Habit → Fill in a past day → pick a day with a value | Value prefilled; Cancel changes nothing |
| E9 | Water in app | Move → +200 ml ×2; Undo | Ring/total update; widget matches |
| E10 | Widget, app closed | Swipe Cadence away from Recents; tap widget "I drank water" | Widget total +200 within a few seconds; open app → same total |
| E11 | Widget Undo | Tap Undo on the widget | Total −200 |
| E12 | Sticky water reminder | Inside active hours **and behind pace** (e.g. nothing logged today, after ~9:40 am with defaults): Developer tools → Show water reminder now; swipe it away; swipe again | 1st swipe: comes back silently. 2nd: stays away. (If you're on pace or outside active hours, the 1st swipe is already respected — that's correct.) |
| E13 | Reminder actions | Show water reminder now → tap "I drank water" (also try from the lock screen) | Notification gone; +200 ml recorded |
| E14 | Snooze | At least 30 min before active hours end: Show water reminder now → Snooze 30 min | Gone; `adb shell dumpsys alarm | grep -A3 cadence` shows an alarm ~30 min later (closer to the end of active hours it moves to tomorrow's first check instead) |
| E15 | Real alarms under Doze | Make sure you're behind on water and inside active hours; give a habit a reminder; Developer tools → Fire every reminder in 1 minute; lock the phone; `adb shell dumpsys deviceidle force-idle`; wait 90 s; `adb shell dumpsys deviceidle unforce` | Notifications for water, weekly review, the habit (if not done) and each cycle reminder |
| E16 | Number habit reminder | Give "5K steps" a reminder; fire reminders | Reminder has **no** "Mark done" button; yes/no habits do |
| E17 | Water reminder expiry | In the evening, show a water reminder (Developer tools, or a real one) and leave it unanswered past the end of active hours | It disappears by itself ~3 min after the end (no re-post) |
| E18 | Cycle | Log period start today; next day "Period ended today"; calendar → tap a day just before the start → "Move the … start to this day" | Ring, calendar, predictions update; start moves; no 1-day cycle |
| E19 | Symptoms + PDF | Log a few symptoms; Cycle → Insights card → **Create doctor report (PDF)** → save | PDF opens, US Letter, readable |
| E20 | Private cycle reminders | Fire reminders (E15) with the phone locked; then Settings → Cycle → Discreet notifications on and fire again | Cycle (Vitamin C) reminders always show only "Cadence – You have a reminder" **on the lock screen**; with Discreet on they say that in the shade too. Water/habit/weekly reminders keep their normal text (by design) |
| E21 | Health Connect | Connect; walk or add steps in Fit; Developer tools → Run end-of-day sync now | Steps card shows today's steps; "5K steps" fills in; ticks at 5,000 |
| E22 | Workouts from HC | Record a workout in Fit/Fitbit (≥15 min, not a walk); sync | Appears in Workouts with source Health Connect; Gym ticks; no duplicate after a second sync |
| E23 | Usage access | Use Duolingo for 4 minutes; sync | Duolingo lesson ticked |
| E24 | Fasting | Start fast (app and widget); Edit start; End | Notification chronometer runs; widget shows progress; ending clears notification; habit ticks if the goal was reached |
| E25 | Off mode | Habits → Pause habits for 2 days | Banner on Today; water reminders stop; streaks unaffected |
| E26 | Weekly review | Wait for Sunday 6 pm or fire reminders; tap the notification | Opens "Your week" |
| E27 | Time zone change | Settings → System → Date & time → turn off automatic time zone → pick another zone | `adb shell dumpsys alarm` shows Cadence alarms re-planned; reminders at the new local times |
| E28 | Reboot | Restart the phone (fast running, widget on screen) | Fasting notification back; widget works; `dumpsys alarm` shows Cadence alarms |
| E29 | Export/import | Export with password; change some data; Import with wrong password, then right one | "Wrong password", then everything restored |
| E30 | Upgrade keeps data | Bump `versionCode`, build, `adb install -r` | All data still there; widget recovers within seconds |
| E31 | Google backup round trip | **Export first** (uninstall deletes data). See E31 steps below | "Welcome back" screen on reinstall; data back |
| E32 | Dark mode + large text | Dark theme on; Settings → Display → Font size largest | Everything readable, nothing clipped |
| E33 | TalkBack spot check | TalkBack on; Today and Settings | Check circles say "Mark Gym done"; steppers say what they change |
| E34 | A real day | Use it for a day with default settings | Water reminders only when behind, none after 9 pm; streak summary next morning only if a freeze was used/streak lost |

**E31 Google backup round trip** (do it with the debug app, so her real data isn't at risk):
```bash
adb shell bmgr enabled                      # "Backup Manager currently enabled"
# In the app: Developer tools → Write backup snapshot now
adb shell bmgr backupnow app.cadence.tracker.debug
adb shell dumpsys backup | grep -i cadence  # optional: look for a recent successful backup
adb uninstall app.cadence.tracker.debug
./gradlew :app:installDebug                 # restore-at-install brings back files/backup and settings
adb shell am start -n app.cadence.tracker.debug/app.cadence.tracker.MainActivity
```
Expected: after unlocking, the **"Welcome back"** screen → **Restore my data** → data back. If it doesn't appear,
the backup may not have run (needs a screen lock, Wi-Fi, Google backup on). Try
`adb shell bmgr list sets` and `adb shell bmgr restore <token> app.cadence.tracker.debug`, then
reopen. Note the result for the owner; if restore never works for sideloaded installs on her phone,
manual export/import is the fallback (already built) — tell her.

---

## 12. Phase F — Sharing with friends

1. Build a signed release APK (§9) and test it on the owner's phone first.
2. Share the APK file (e.g. a Google Drive link). Each friend: open it on the phone → allow
   "Install unknown apps" for the app that opened it → Install. Play Protect may warn that the app
   is from an unknown developer; that's expected for a sideloaded app.
3. Each friend's data stays on her own phone (nothing is shared between users).
4. Updates: send a new APK signed with the **same key** and a higher `versionCode`; installing it
   over the old one keeps data.
5. Samsung/Xiaomi/OnePlus phones are aggressive about battery: ask friends to do §10 step 6 and,
   on Samsung, Settings → Battery → Background usage limits → add Cadence to "Never sleeping apps".
6. **Android developer verification:** Google is rolling out a requirement that apps installed on
   certified Android devices come from verified developers (regional enforcement began in 2026;
   broader rollout planned after that). Installs through `adb` are exempt. Check the current rules at
   developer.android.com (search "Android developer verification"); a free limited-distribution
   (hobbyist) account is expected to be enough for a handful of friends' devices. Register with the
   **release** signing key when it's needed. Tell the owner before it becomes a blocker.

---

## 13. Known limitations (deliberate)

| Limitation | Why / workaround |
|---|---|
| Water can only be logged for today | Past-day water entry wasn't requested; history is read-only. Backlog #1. |
| Weekly/monthly number habits count days that reach the daily target (not a weekly total) | Simpler model; backlog #2. |
| Habits can be deleted, not archived | Archive UI not built (the `archived` field exists). Backlog #3. |
| Steps come only from Health Connect | No direct step-sensor fallback (Android 9–13 without Health Connect show no steps). Backlog #4. |
| Health Connect is read-only | Workouts logged in Cadence aren't written to Health Connect. Backlog #5. |
| No database encryption | Decided with the owner: app lock + encrypted Google backup is enough. |
| Widgets and notification buttons work while the app is locked | By design (one-tap water). |
| After "Force stop" in system settings, widget buttons do nothing until the app is opened once | Android 15+ cancels a force-stopped app's PendingIntents. Normal swipe-away is fine. |
| Freezes reset each month and don't roll over | As decided. |
| Strings are in Kotlin code (English only) | No localization planned. |
| Usage access banner shows even if Duolingo isn't installed | "Not now" is remembered permanently. |

---

## 14. Backlog, in priority order

Do these only when the owner asks. Each item lists where to start.

1. **Water for past days** — today `WaterService.addTap(ml: Int? = null)` always uses "now"; add a
   day/time parameter, a "+ add for a past day" entry in `WaterCard`'s detailed view, and
   `syncHabit(day)` for that day (closed days may be re-scored only by an explicit user action).
2. **Weekly/monthly totals for number habits** ("150 minutes a week") — a new rule kind in
   `HabitRule` (`targetIsTotal`) + `StreakEngine` + schema migration (R2) + export default (R3).
3. **Archive habits** — editor button "Archive", a collapsed "Archived" list on the Habits tab;
   `observeActive()` already filters archived habits.
4. **Step-sensor fallback** for phones without Health Connect — `TYPE_STEP_COUNTER` snapshots per
   tracking day stored in `step_day`.
5. **Write workouts to Health Connect** — `WRITE_EXERCISE` permission + `ExerciseSessionRecord`.
6. **Haptics** on habit ticks and water taps (`LocalHapticFeedback`).
7. **One settings model** — derive `SettingsSnapshot` from `AppSettings` with
   `@Serializable` to remove the duplication in R1.
8. **Final app name and icon** — change `app_name` in both `app/src/main/res/values/strings.xml` and
   `app/src/debug/res/values/strings.xml` ("… Debug"), and the launcher drawables; never `applicationId`.
9. **Material 3 stable** — when `material3` 1.5.0 is stable, move off the beta (one version change,
   then run all tests and check screens).
10. **Remember the notification-permission denial** across cold starts (`NotificationBanner`).

---

## 15. Recipes (step by step)

### R1. Add a user setting
1. `AppSettings` (`data/prefs/SettingsStore.kt`): add the field with its default.
2. Same file: add a key in `K` (new, unique string — never reuse/rename an old key), read it in
   `readSettings` (falling back to the default), write it in `writeSettings`.
3. `SettingsSnapshot` (`data/backup/BackupManager.kt`): add the field **at the end, with a default
   value** (so older exports still import), add `newField = s.newField` to the named arguments in
   `of(...)`, and pass it on in `toAppSettings()`.
4. `CompatibilityGuardTest`: set it to a non-default value in `custom` (the test fails until you do).
5. Settings UI: put the control in `ui/settings/SettingsScreen.kt` and save with
   `container.save({ it.copy(x = v) }) { <replan/refresh> }` — `save` is a private helper in that
   file. If it affects reminders, call the matching `container.reminders.replan…()`; water settings
   → `container.water.onSettingsChanged()`.
6. Run all tests.

### R2. Change the database (migration)
1. Edit the entity in `data/db/Entities.kt`. New columns need a default value
   (`val notes: String = ""`) so Room and old exports cope.
2. In `TrackerDatabase.kt`: set `version = 2` in `@Database`; add the imports
   `import androidx.room.migration.Migration` and `import androidx.sqlite.db.SupportSQLiteDatabase`;
   and inside the existing `companion object`, add the migration and replace `create()`:
   ```kotlin
   val MIGRATION_1_2 = object : Migration(1, 2) {
       override fun migrate(db: SupportSQLiteDatabase) {
           db.execSQL("ALTER TABLE workout ADD COLUMN calories INTEGER NOT NULL DEFAULT 0")
       }
   }
   fun create(context: Context): TrackerDatabase =
       Room.databaseBuilder(context, TrackerDatabase::class.java, NAME).addMigrations(MIGRATION_1_2).build()
   ```
   The SQL must produce exactly what Room expects (compare with the generated `schemas/…/2.json`).
3. Build once (`./gradlew :app:assembleDebug`): KSP writes `app/schemas/…/2.json`. **Commit it.
   Never edit `1.json`** (`CompatibilityGuardTest` checks its hash; Room would silently rewrite it
   if you changed an entity without bumping the version).
4. Extend `SchemaMigrationTest` (`app/src/test/.../data/SchemaMigrationTest.kt`). It is already set
   up (schemas are debug assets, `room-testing` is a test dependency) and already does the important
   part: it writes a **version 1** database with raw SQL and opens it with the production
   `TrackerDatabase.create()`, so once `MIGRATION_1_2` is in `create()`, Room runs it and validates
   the result against the new schema. Add an assertion for your change, for example in a workout row:
   ```kotlin
   execSQL("INSERT INTO workout (id, day, startAt, durationMinutes, type, customName, intensity, notes, source, externalId) VALUES (1, '2026-10-12', 0, 30, 'RUNNING', NULL, 3, '', 'MANUAL', NULL)")
   // … after opening:
   assertEquals(0, b.workouts().single().calories)
   ```
   For a later v2→v3 change, copy the test, create the database at version 2 (`helper.createDatabase(2)`)
   with v2's columns, and keep the v1 test as it is (it then exercises 1→2→3).
5. Keep the v1 hash check in `CompatibilityGuardTest` as it is.
6. Export format: see R3.
7. Run all tests; then on the phone install the new build **over** the old one (`adb install -r`)
   and confirm data is intact (E30).

### R3. Change the export format
- Adding a field with a default: nothing else needed; `fixtures/export-v1.json` must still import.
- Renaming/removing/retyping a field or enum value: bump `ExportFile.VERSION`, keep reading old
  versions (map old names in `importJson`), add `fixtures/export-v2.json` and a test like
  `a version 1 export file still imports`. **Never regenerate or edit `export-v1.json`.**

### R4. Add an automatic check-off source
1. Add the enum value to `AutoSource` (append at the end; never rename existing ones).
2. In `HabitEditorScreen`: a label in `label()`, an explanation in `explain()`, the habit type it
   implies in `chooseAuto`, and add it to the `autoOptions` list(s) for the type(s) it fits (those
   lists decide what an existing, type-locked habit may pick).
3. Produce values: a gateway/service calls `habits.autoRecord(AutoSource.X, day) { habit -> value }`,
   and `DayCloser` calls it per day (decide whether closed days may be re-read — §5.5).
4. Tests: a repository test proving it ticks, and that a manual entry wins.

### R5. Add a screen
1. Add a `@Serializable data object/class` route in `ui/nav/Routes.kt` implementing `NavKey`.
2. Add an `entry<YourRoute> { … }` in `ui/nav/CadenceApp.kt`'s `entryProvider`.
3. Build it with `DetailScaffold(title, onBack) { item { SectionCard { … } } }`.
4. Navigate with `navigate(YourRoute)` from a caller. Add a `ScreensTest` smoke test.

### R6. Add a notification
Use an existing channel if the importance fits; otherwise add a new channel in
`Notifications.createChannels()` (new ID). Give it a fixed ID or ID range in the companion object.
Post via `post(id, builder)` (it checks permission). Cancel it wherever its reason ends.

### R7. Add a symptom
Append to `Symptoms.all` (`data/model/Symptoms.kt`) with a new unique `key` (keys are stored; never
rename one). The day sheet shows it automatically.

### R8. Change the default habits
Edit `HabitRepository.seedDefaults`. This only affects **new installs** (existing users keep their
habits). Keep `builtInKey`s stable.

### R9. Make a release
Bump `versionCode` + `versionName`, run all tests, `assembleRelease`, verify the signature (§9 step 6),
install over the previous build on the owner's phone, run E1–E13 quickly, then share.

### R10. Fix a bug someone reports
1. Reproduce it (on the phone or emulator); get logs (`adb logcat -d -s Cadence:E AndroidRuntime:E`).
2. Write a failing test that shows the bug (domain test if possible, else `AppTest`).
3. Fix it in the smallest correct way; make the test pass; run all tests.
4. Re-check on the device.

---

## 16. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Gradle sync: "Plugin … was not found" / SSL errors | Network or proxy | Check internet; on a corporate network you'd need its certificate (not expected on a personal laptop) |
| `UnsatisfiedLinkError` or `NoSuchFileException …%20…` in Robolectric tests | Space in the Windows user path | §6 A5 (`robolectricMavenRepo`) |
| Robolectric tests time out waiting for a node | Lazy list item off-screen | Keep `@Config(qualifiers = "w411dp-h2400dp")`; use `performScrollTo()` |
| Kotlin: "Accidental override … wait(J)V" in a test | A helper named `wait(Long)` clashes with `Object.wait` | Rename the helper |
| App crashes on launch after an update: "Room cannot verify the data integrity" | Entity changed without version bump/migration | Revert the entity change or do R2. Never destructive migration |
| `CompatibilityGuardTest` fails | You changed the DB schema, a setting, or the export format | Read its message; follow R1/R2/R3 |
| Release APK won't install ("package invalid"/"no certificates") | Unsigned (signing properties missing) | §9 step 3 |
| "App not installed as package conflicts" | Different signing key than the installed app | Same key required. Never uninstall without export |
| Reminders late or missing | Battery optimization / OEM killer / notifications off | §10 step 6; Settings → Notifications; `adb shell dumpsys alarm` |
| Widget buttons do nothing | App was force-stopped | Open the app once |
| Steps always 0 | Health Connect has no step source, or permission missing | Health Connect → Data and access → Steps; reconnect in Settings → Connections |
| Duolingo never ticks | Usage access off, or < 3 min use | Settings → Connections → Usage access |
| Restore prompt never appears | No backup ran (no screen lock / Wi-Fi / backup off) | §11 E31; use manual export/import |
| Can't screenshot the PIN screen | Secure system window | Expected |

---

## 17. Review history

The code went through two adversarial reviews plus emulator walkthroughs. Fixed issues have
regression tests (`ReviewRegressionTest`, `FinalReviewRegressionTest`, `AppLockTest`, guard tests).

**Final review (2026-10-12) — fixed:**
app-lock bypass by leaving and returning; dialogs drawn above the lock screen; backups stopping for
users with no habits; closed days re-scored with a later water goal / app-usage threshold; freezes
spent with no streak and a nagging morning summary; period buttons pushing users into fake short
cycles (end offered for 14 days, moving a start); backfilling before the start splitting a week;
Recents thumbnail with the lock on; non-transactional, non-atomic snapshot (+ orphan rows on
import); ignored water reminder staying overnight; "Day 1 of your period" on a merely predicted
day; future preselected end date; past-day dialogs losing/overwriting values; "Mark done" pinning
fake values for number habits; one-decimal rounding of targets; stuck fasting notification; silent
"Fast complete"; Health Connect settings action; unguarded system-screen launches; usage banner
reappearing; pending frequency changes hidden in the editor; type vs automatic-source mismatch;
accessibility (stepper names, 48 dp icon picker with selection, spoken calendar dates, check-circle
description, widget Undo size); habit cards computed once and shared; CPU work off the main thread.

**Polish from the emulator walkthrough:** thousands separators ("5,000"), auto-focus and Done key
in number dialogs, weekly review wording ("None logged yet", "1 day"), chart goal line no longer
looks like a divider, US spelling, "2,000 ml" in the notification, debug app named "Cadence
Debug", real widget picker previews, faint heatmap cells before a habit's start, debug-only
Developer tools.

---

## 18. Provenance and policy notes

- The app was built with Claude Code on the owner's a corporate laptop using **synthetic data only**.
  She was advised to confirm that moving this code to a personal GitHub account and laptop is
  allowed under the employer's acceptable-use / IP policy. If that hasn't been confirmed, ask her before
  publishing the repository anywhere public. Keep the repository **private**.
- The corporate laptop's user-level Gradle file had corporate proxy/certificate settings; those are not
  part of the repository and are not needed elsewhere.
- No credentials, keys or personal data are in the repository. Keep it that way.
- AI-generated code: review changes like any other code; the tests are the safety net, not a
  substitute for reading the diff.

---

## 19. Glossary

| Term | Meaning |
|---|---|
| Tracking day / logical day | The day an action counts for, using the day boundary (default 3 am). |
| Calendar day | The plain date, used for cycle data and wall-clock reminders. |
| Freeze | Covers a missed period so the streak survives; limited per month. |
| Rule (`HabitRule`) | A habit's target/frequency/freezes from a date onwards; versioned. |
| Period (habits) | One scoring window: a day, a Mon–Sun week, or a month. |
| Period (cycle) | Menstruation; logged by start (and optional end). |
| Open period | A logged period with no end date. |
| Off mode / travel | Days excluded from streaks and water reminders. |
| Snapshot | `files/backup/snapshot.json.gz`, the daily copy Google backup uploads. |
| InitMarker | `noBackupFilesDir/initialized`; exists once first-launch setup is done. |
| Auto Backup | Android's built-in backup to the user's Google account. |
| Health Connect | Android's on-device health data store (steps, sleep, workouts). |
| Usage access | Permission to read which apps were in the foreground and for how long. |
| R8 | The release build's code shrinker/obfuscator. |
