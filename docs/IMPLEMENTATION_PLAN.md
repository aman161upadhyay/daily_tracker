# Daily Tracker — Implementation Plan

Owner: Aman Upadhyay · Repo: https://github.com/aman161upadhyay/daily_tracker (private) ·
Plan version 1.0 (2026-10-25). Companion documents: `DESIGN_SYSTEM.md`, `HABIT_LIBRARY.md`, and the
original Cadence spec in `reference/cadence/` (the Kotlin app whose product decisions and domain
logic this plan ports; where the two disagree, this plan wins).

---

## 0. Decisions

| Topic | Decision | Why |
|---|---|---|
| **Stack** | **Expo (React Native) + TypeScript**, Android first. Pure-logic "domain" layer in plain TS with unit tests. | Replit builds and previews it live on Aman's phone (Expo Go) while the UI is being designed — and UI quality is the top priority here. The three native needs (home-screen widget, exact-time nudges, Health Connect) have maintained Expo-compatible libraries. The Cadence Kotlin *source* is not available (only its docs), so there is no native codebase to extend; its tested algorithms are ported 1:1 to TypeScript instead. |
| **Where Android Studio fits** | On Aman's laptop, for two things: (1) building the **development build / APK** that includes the native modules (widgets, Health Connect) from the GitHub repo, (2) the signed **release APK** (and later the Play Store bundle). | Replit's sandbox cannot run the Android SDK/emulator; Expo Go on the phone covers everyday UI work, the laptop covers native builds. |
| **Distribution** | Sideloaded signed APK first; Play Store later from the same code (AAB). | As requested. Same signing key forever. |
| **Working name** | "Daily Tracker"; package id `com.amanupadhyay.dailytracker` (permanent once installed). | Matches the repo. Display name can change any time; the package id cannot. |
| **Privacy posture** | Offline-first, no accounts, no analytics/crash SDKs, no network calls except opening an evidence link in the browser. Data stays in SQLite on the phone + Android's end-to-end-encrypted Auto Backup + manual export. | Carried over from Cadence; also simplifies Play Store review. |
| **Look** | Apple Health information design; Spotify green + gold frames + violet "flow"; adherence color ramp gold → lime → light green → Spotify green → green/violet. | See `DESIGN_SYSTEM.md`. |
| **Units / locale** | US English, 12-hour times, **ml by default with an oz toggle** (confirm with Aman). | |
| **Cycle tracking** | Built in, **opt-in at onboarding**; when off, the Cycle tab and all cycle UI disappear. | Aman's app is for anyone; the original spec's cycle logic is still valuable. |
| **Git** | Push to `origin/main` after every milestone and at the end of every working session; `main` always builds; tag `v0.<milestone>`. | Requested. |

---

## 1. Product scope (v1 = M0–M5)

**In:** habits (yes/no, count, amount, timer) with daily/weekly/monthly cadences, streaks with
forgiving freezes; water logging with a pace-aware reminder, home-screen widget and notification
button; the **nudge engine** (interval / fixed / rotating movement snacks / event-triggered "Sugar
Shield"); meditation timer and 5-minute breathing guide; Health Connect import (steps, sleep,
workouts, heart rate, weight, hydration) with automatic habit check-offs; cycle tracking with
predictions, symptoms and discreet reminders (opt-in); Today rings, pinned cards, highlights;
heatmaps and charts; export/import; app lock; Android Auto Backup.

**Out of v1:** iOS, accounts/sync between devices, social features, AI coaching, wearables beyond
what Health Connect already aggregates, database encryption (app lock + encrypted backup, as in Cadence).

---

## 2. Information architecture

```
Today (tab)      TodayRings · Live nudge card · Pinned SummaryCards · Highlights · Quick log bar
Habits (tab)     Your habits by category (HabitRow list) · Library (presets, evidence) · + custom habit
  habit/[id]     Range segment · chart · heatmap · streak & freezes · nudge policy · "Why this matters" · edit
Body (tab)       Health Connect: Steps · Sleep · Workouts · Heart · Weight · Hydration imports · Connect / permissions
Cycle (tab, opt-in)  Phase ring · period buttons · calendar · day sheet (symptoms) · upcoming · insights · history
Settings (avatar)  Units · day boundary · active hours & quiet hours · nudge cap · notification channels ·
                   widgets help · Health Connect · app lock · backup/export/import · appearance · about & evidence policy
Onboarding       Name → goals (pick presets) → active hours → cycle tracking? → notifications permission → widgets tip
Mind (sheet/screen)  Meditation timer · Breathing guide (reachable from Today/Habits; not its own tab)
```

Apple Health mapping is in `DESIGN_SYSTEM.md` §1.

---

## 3. Architecture

### 3.1 Libraries (pin versions in M0; don't upgrade casually)

| Need | Choice |
|---|---|
| App shell / routing | Expo SDK (current stable), Expo Router (tabs + stack), TypeScript strict |
| UI | React Native + Reanimated 3, `react-native-svg` (rings, charts, heatmap), Phosphor icons, Manrope via `expo-font`, `expo-haptics` |
| State | Zustand for UI state; data flows from repositories (SQLite) via hooks |
| Storage | `expo-sqlite` + **Drizzle ORM** with committed migrations (never destructive); `react-native-mmkv` for settings/bookkeeping |
| Notifications & alarms | `expo-notifications` (channels, categories with action buttons, date triggers; `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`), `expo-task-manager` + `expo-background-task` for the 3-hourly catch-up |
| Widgets | `react-native-android-widget` (Expo config plugin; interactive widgets whose click handlers run in a headless JS task) |
| Health Connect | `react-native-health-connect` (config plugin adds the rationale activity, `VIEW_PERMISSION_USAGE` alias, `<queries>`) |
| App lock | `expo-local-authentication` |
| Backup / export | `expo-file-system`, `expo-sharing`, `expo-document-picker`; Android `dataExtractionRules`/`fullBackupContent` via config plugin |
| Tests | Vitest (domain + repositories against in-memory SQLite via `better-sqlite3`), React Native Testing Library (components), Maestro flows later (optional) |

**Expo Go rule:** everything in `src/native/` is wrapped so that in Expo Go (no custom native modules)
the app runs with no-op widget/Health Connect stubs and a visible "Needs the installed build" note.
Dev builds from the laptop get the real modules. Local notifications work in Expo Go on Android.

### 3.2 Folders

```
app/                      Expo Router routes: (tabs)/{today,habits,body,cycle}, habit/[id], settings/*, onboarding/*, mind/*
src/domain/               Pure TS, no RN imports, fully unit-tested (ported from Cadence's :domain)
  time/trackingDay.ts         DayBoundary (default 3 am), dayOf(instant, zone), DST-safe
  habits/{models,periods,streakEngine,weeklySummary}.ts
  water/pacePlanner.ts        expected intake, onPace, nextCheck, decideAtFire, dismiss/snooze
  nudges/planner.ts           planNudges(now, policies, state) → ScheduledNudge[] (caps, merges, quiet hours)
  nudges/rotation.ts          next snack in a rotation, swap, skip
  cycle/{models,predictor,timeline,alerts,reminderPlanner}.ts
  insights/{highlights,symptomWindows,correlations}.ts
  export/format.ts            versioned export schema (entities are the format)
src/data/                 db/schema.ts (Drizzle), db/migrations/*, repositories/*.ts, settings.ts
src/services/             notifications.ts, alarms.ts (replan*), widgets.ts, healthConnect.ts, backup.ts, appLock.ts, dayCloser.ts
src/native/               guarded wrappers: widget.ts, healthConnect.ts (stubs in Expo Go)
src/library/presets.ts    the HABIT_LIBRARY as data (id, rule, nudge policy, why, evidence)
src/ui/theme/             tokens.ts (from DESIGN_SYSTEM.md), typography.ts, adherenceScale.ts (OKLCH interpolation)
src/ui/components/        TodayRings, SummaryCard, HabitRow, AdherenceBar, NudgeCard, Heatmap26w, MetricChart, …
widgets/                  WaterWidget.tsx, MoveWidget.tsx, widgetTaskHandler.ts
tests/                    domain/*, data/*, ui/*
docs/                     this plan, design system, habit library, device checklist, reference/
```

### 3.3 Data model (SQLite via Drizzle; entities double as the export format — add fields with defaults, never rename)

| Table | Key fields |
|---|---|
| `habit` | id, name, category, type `YES_NO\|COUNT\|AMOUNT\|TIMER`, unit, icon, color, presetId?, builtInKey?, createdDay, archived, pinned |
| `habit_rule` | habitId, effectiveFrom, cadence `DAILY\|WEEKLY\|MONTHLY`, timesPerPeriod, target, freezesPerMonth (versioned; edits create a new row) |
| `habit_entry` | habitId, day, at, zone, value, source `MANUAL\|AUTO_HC\|AUTO_WATER\|AUTO_TIMER\|AUTO_WIDGET`, manualOverride, externalId? |
| `water_entry` | at, zone, day, ml, source, externalId? (Health Connect hydration imports) |
| `nudge_policy` | habitId, kind `INTERVAL\|FIXED\|ROTATION\|EVENT\|CYCLE`, intervalMin, times (JSON), activeStart, activeEnd, days (bitmask), onlyWhenBehind, maxPerDay, enabled |
| `nudge_event` | at, habitId, kind, outcome `FIRED\|DONE\|SNOOZED\|SKIPPED\|SWAPPED\|EXPIRED` (feeds highlights and the "is this nagging?" tuning) |
| `movement_snack` | at, day, type, reps/seconds, trigger `NUDGE\|WIDGET\|SUGAR_SHIELD\|MANUAL` |
| `mind_session` | startAt, endAt, kind `MEDITATION\|BREATHING`, minutes, day |
| `workout` | day, startAt, durationMin, type, intensity, notes, source, externalId |
| `step_day`, `sleep_night`, `heart_day`, `weight_entry` | Health Connect mirrors (day, value, source) |
| `period`, `period_flow`, `symptom_entry`, `cycle_reminder` | ported from Cadence |
| `off_period` | start, end (travel/off mode: excluded from streaks and nudges) |
| `kv` (MMKV) | settings + bookkeeping (lastClosedDay, lastSnapshotAt, onboardingDone, …) |

Time rules (kept from Cadence, they were right): every timestamped row stores `at` (UTC ms), `zone`,
`day` (tracking day computed once at write time, 3 am boundary, configurable); habits/water/snacks use
the tracking day, cycle data and clock-time reminders use the calendar day; **manual entries always
beat automatic ones**; streaks are recomputed from raw entries, never stored.

### 3.4 Key flows

- **Tick / log** → repository writes → recompute cards (streak engine over full history) → cancel that habit's live nudge → `replanNudges()` → refresh widgets → haptic + color animation.
- **Water tap (app / widget / notification button)** → `waterRepo.addTap(ml)` → `syncWaterHabit(day)` → cancel water notification → `replanWater()` → widget update.
- **Nudge planning** (`domain/nudges/planner.ts`, pure): for the next 36 h, expand every enabled policy into candidate fire times inside its active window and days; drop water candidates while on pace; apply off mode and quiet hours; merge candidates ≤ 5 min apart into one combined notification; enforce `maxPerDay` per policy and the global daily cap (default 10); for `ROTATION`, assign the next snack per slot. The service turns the result into scheduled local notifications (deterministic ids so re-planning replaces rather than duplicates). Re-plan on: app open, any write, settings change, boot, time-zone change, every 3 h (background task).
- **Nudge fired** → notification with actions **Done** / **Snooze 10 min** / **Swap** (rotation) or **+250 ml** / **Snooze 30 min** (water). Action responses are handled by the notification response task; if the OS defers it, the response is applied on next app open with the original timestamp.
- **Sugar Shield** (`EVENT`) → button in app/widget → full-screen 60 s countdown with squat count → logs a snack → schedules a one-off "2-minute walk" nudge 20 min later.
- **Day close** (`dayCloser.ts`, runs on open / background task / after the boundary): sync Health Connect for yesterday and today, auto-tick habits (steps goal, workout ≥ 15 min, water goal, meditation minutes), close finished days (streak/freeze status), write the backup snapshot (if > 20 h old), replan, refresh widgets. Idempotent; never re-scores closed days with today's settings.
- **Health Connect import**: read Steps (aggregate/day), SleepSession, ExerciseSession, HeartRate (resting), Weight, Hydration; de-duplicate by record id; background read only if granted, otherwise on app open and widget taps.
- **Backup**: daily `files/backup/snapshot.json.gz` (same schema as export) included in Auto Backup (end-to-end encrypted; live DB excluded); on a fresh install with a restored snapshot show "Welcome back → Restore / Start fresh". Manual export/import via share sheet (optional password in M6).

---

## 4. Milestones (each ends with a push to GitHub and something visible on the phone)

### M0 — Skeleton you can see (Expo Go)
- Expo project, TypeScript strict, Expo Router with the 4 tabs, Manrope, Phosphor, tokens from `DESIGN_SYSTEM.md`, dark theme.
- Components with mock data: `TodayRings`, `SummaryCard`, `HabitRow` + `AdherenceBar` (full color ramp demo), `NudgeCard`, `SectionHeader`, `Heatmap26w`, `MetricChart`, `RangeSegment`.
- Today / Habits / habit detail screens laid out exactly per the Apple Health mapping.
- Domain scaffolding + Vitest running; `trackingDay` ported with its DST tests.
- `.gitignore` (keystore, `local.properties`, builds), README with laptop build steps, first push.
**Done when:** Aman opens it in Expo Go on his phone and the Today screen looks like the target design with sample data; adherence colors visibly ramp gold → green → violet.

### M1 — Real habits, water, and the Library
- Drizzle schema + migrations; repositories; settings; onboarding (goals from the Library, active hours, cycle opt-in).
- Streak engine with freezes (ported from Cadence, tests ported 1:1: 3rd miss resets, month-end freeze accounting, weekly habit over month end, backfill refunds, rule change not retroactive, idempotent recompute).
- Habit types YES_NO / COUNT / AMOUNT / TIMER; backfill strip (last 7 days); habit editor; archive.
- Water: quick log (150/250/350/custom), today's entries, 7-day bars, pace planner + tests.
- Library screen: presets with "Why" + evidence links; one-tap add; custom habit.
- Highlights v1 (rule-based: best streak, days logged, week-over-week water).
- Export/import JSON (no password yet); day boundary setting.
**Done when:** a full day of real logging works offline; data survives restarts; all domain tests green.

### M2 — The nudge engine + Mind
- Notification channels (`nudges`, `water`, `summary`, `cycle`), permission flow, exact-alarm handling and the "Allow exact reminders" settings deep link.
- `planNudges` with caps, merges, quiet hours, pace-aware water, rotation; deterministic ids; replan on all triggers; 3-hourly background catch-up; boot/time-zone re-plan.
- Action buttons (Done / Snooze / Swap / +250 ml) and the response task; `nudge_event` logging.
- Sugar Shield flow (countdown screen + post-meal follow-up).
- Meditation timer (bells, presets, background-safe via scheduled end notification) and the cyclic-sighing breathing guide (`BreathCircle`).
- Off mode (travel) and the weekly "Your week" summary notification (Sunday 6 pm).
**Done when:** on a real workday the phone gets a sensible, non-nagging cadence of nudges that can be completed from the notification; snoozes and caps behave; tests cover the planner's edge cases (active-hours end, cap reached, merge, DST night).

### M3 — Widgets + first installed build (laptop)
- `react-native-android-widget` config; Water 2×2 and 4×1, Move 2×1 (Sugar Shield / Move now); headless click handlers writing through the repositories; widget refresh from every write path.
- Laptop recipe verified: `git pull` → `npm ci` → `npx expo prebuild -p android` → `npx expo run:android` on the phone (Android Studio's SDK + adb). Debug build id suffix `.debug`.
- Device checklist part 1 (`docs/DEVICE_CHECKLIST.md`, ported from Cadence E1–E17): widget with app swiped away, after reboot, nudges under Doze (`adb shell dumpsys deviceidle force-idle`), time-zone change.
**Done when:** the widget on Aman's home screen logs water with the app closed, and nudges fire on time with the phone idle.

### M4 — Health Connect + Body tab
- Permissions flow and rationale; reads for steps, sleep, exercise sessions, heart rate, weight, hydration; background-read permission when available.
- Body tab cards + detail charts (D/W/M/6M/Y); imports de-duplicated; manual-wins rules; auto-ticks (steps goal, workout → strength session habit, hydration → water).
- Samsung Health / Google Health (Fitbit) / Google Fit set-up help screen ("turn on Health Connect sync in that app").
**Done when:** steps and sleep from Aman's phone appear without manual entry, and a Samsung Health water log shows up in the water ring once.

### M5 — Cycle (opt-in) + insights
- Port `CyclePredictor`, `CycleTimeline` (`periodContaining` is the only period-day rule), alerts, reminder planner, with their tests.
- Cycle tab: phase ring, calendar, day sheet with 14 symptoms + mood, upcoming, history; discreet notifications (`VISIBILITY_PRIVATE` with a neutral public text); birth-control mode; "Track cycle" toggle removes everything when off.
- Symptom-window insights (≥ 3 cycles) and habit ↔ symptom correlations (Spearman, n ≥ 4, |ρ| ≥ 0.5, "tends to" wording).
**Done when:** predictions, phases and reminders match the ported test fixtures; nothing cycle-related is visible when the toggle is off.

### M6 — Polish, lock, release
- App lock (biometric/PIN, lock after N minutes; widgets and notification buttons keep working); Auto Backup rules + restore prompt; export password (PBKDF2 + AES-GCM).
- Light theme; large-text and TalkBack pass; reduce-motion.
- Release signing recipe (`~/keystores/daily-tracker-release.jks`, credentials in `~/.gradle/gradle.properties`, never in the repo), `versionCode` discipline, `assembleRelease`, `apksigner verify`, install over the debug build on a second slot.
- Play Store readiness (only when wanted): adaptive icon, feature graphic, privacy policy page, Health Connect permissions declaration, data-safety form, `bundleRelease` AAB.
**Done when:** a signed release APK runs a full day on Aman's phone; friends can install it from a shared file.

---

## 5. Feature specs that need precision

### 5.1 Habits
Types: `YES_NO` (check), `COUNT` (e.g. 6 squat snacks), `AMOUNT` (e.g. 2,000 ml, 13 min), `TIMER`
(meditation; the timer writes an `AMOUNT` of minutes). Cadence: daily, X per week, monthly. Freezes:
2/month daily, 1 weekly, 0 monthly by default; a freeze is spent only when there is a streak to
protect; backfilling refunds it. Type never changes after creation; rule edits are versioned.

### 5.2 Water
Goal in ml (or oz display), tap size (default 250 ml), active hours (default 9 am–9 pm). Pace
planner exactly as in `reference/cadence/HANDOFF.md` §4.2 (check one interval after the last tap,
skip when on pace, stop at goal/off mode, sticky-notification behaviour on Android 14+: first swipe
re-posts silently once, second swipe is respected, clears itself just after active hours end).

### 5.3 Movement snacks and Sugar Shield
A snack is a typed event (`SQUATS`, `CALF_RAISES`, `WALK`, `STRETCH`, `PUSH_UPS`, `STAIRS`,
`VIGOROUS_MINUTE`, custom) with reps or seconds. Each snack preset is a `COUNT` habit; the rotation
policy is shared. Sugar Shield is an `EVENT` policy: the button lives in the Today quick-log bar and
the Move widget; it logs a `SQUATS` snack when the countdown completes (or the user taps "Did it"),
and schedules a one-off post-meal walk nudge 20 min later (dismissible, never repeats).

### 5.4 Nudge engine contract (`planNudges`)
Input: `now`, zone, policies with their habits' current progress, water pace state, off periods,
quiet hours, global cap, recent `nudge_event`s (for snoozes and "already fired" slots).
Output: ordered `ScheduledNudge { id, at, habitIds[], title, body, actions[], channel }` for ≤ 36 h.
Invariants (tested): never outside active hours or inside quiet hours; never more than cap/day;
never two notifications within 5 min (merge instead); snooze moves only that nudge; water nudges are
dropped while on pace; a completed habit emits no further nudges today; ids are deterministic per
(policy, slot) so re-planning is idempotent; DST transitions never double-fire or skip a whole day.

### 5.5 Widgets
Interactive widgets render React-like trees through `react-native-android-widget`; click handlers run
headless and must only call repository methods (which replan and refresh). Known limitation (same as
native): after **Force stop** the buttons are inert until the app is opened once. Widgets keep
working while the app is locked (by design, one-tap water).

### 5.6 Health Connect
Read-only in v1 (write of hydration/mindfulness sessions is a v2 option). Permission set: Steps,
SleepSession, ExerciseSession, HeartRate, Weight, Hydration, plus background read. Yesterday is always
re-read (data arrives late). Imported workouts are de-duplicated by record id; the user can hide,
not delete, an imported record.

### 5.7 Cycle
Verbatim port of Cadence's rules: next start = last start + mean of the last ≤ 6 usable cycles
(10–90 days); range ±ceil(SD) capped at 7 (±2 with < 3 cycles); ovulation = next start − luteal
(14; 10–16); fertile window = 5 days before ovulation through ovulation; late-luteal = last 5 days;
short-cycle clamp with low-confidence flag; late period suppresses reminders; neutral wording and a
"not contraception" disclaimer; discreet notification text; `periodContaining()` is the only
period-day rule.

### 5.8 Backup and export
Export = the entities, versioned (`version: 1`); new fields get defaults; fixtures of each version
stay in `tests/fixtures` forever. Auto Backup includes `files/backup/` and settings, excludes the live
database. Import replaces everything after a confirm dialog, then replans and refreshes.

### 5.9 Settings (every setting: default, storage key, export field, settings UI, guard test)
Units, tap size, water goal, active hours, quiet hours, day boundary (00:00–05:00), nudge cap,
per-channel sound/vibration, rotation members, weekly summary on/off and time, cycle on/off, discreet
cycle notifications, birth-control mode, luteal length, app lock + timeout, theme, pinned cards.

---

## 6. Testing

- **Domain (Vitest):** streaks & freezes (16 cases ported), tracking day & DST (6), water planner (17), nudge planner (new, ≥ 20: caps, merges, quiet hours, rotation order, snooze, DST, active-hours end, completed habit), cycle timeline/predictor/alerts/reminders (28 ported), fasting-style timer credit, insights, export round-trip.
- **Repositories (Vitest + in-memory SQLite):** manual beats auto, rule versioning, de-dup of Health Connect imports, day closer idempotency, migration tests (every schema version opens).
- **Components (RNTL):** HabitRow states and colors by adherence, SummaryCard formatting (thousands separators, units), TodayRings values.
- **Device checklist** (`docs/DEVICE_CHECKLIST.md`, ported from Cadence §11): fresh install, widget with app killed and after reboot, nudges under Doze, sticky water reminder, action buttons from the lock screen, time-zone change, Health Connect flow, upgrade keeps data, backup round trip, dark/light + large text + TalkBack, "a real day".
- CI (GitHub Actions, optional in M3): `npm ci && npm test && npx tsc --noEmit` on every push.

---

## 7. Build, signing, distribution

**Daily (Replit):** `npx expo start` → scan with Expo Go. UI, data, nudges testable there.

**Native build (laptop, Android Studio installed):**
```bash
git clone https://github.com/aman161upadhyay/daily_tracker.git && cd daily_tracker
npm ci
npx expo prebuild --platform android          # generates android/ from app.json + config plugins
npx expo run:android                          # debug build on the connected phone (USB or wireless adb)
```
**Release APK:** keystore at `~/keystores/daily-tracker-release.jks` (create once with `keytool`,
back it up twice); credentials in `~/.gradle/gradle.properties` (never in the repo);
`cd android && ./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk` →
`adb install -r`. Every later update: bump `versionCode`, same key.
**Play Store (later):** `./gradlew bundleRelease` → AAB; Play Console listing; Health Connect
permissions declaration and privacy policy; target the current SDK level.
**Android developer verification:** Google is phasing in verification for apps installed on certified
devices (adb installs stay exempt). Register the release key with a free limited-distribution
account when it becomes required for sideloading to friends.

---

## 8. Git workflow

- Remote: `origin` = https://github.com/aman161upadhyay/daily_tracker.git, branch `main`.
- Commit in small, named steps (`feat(nudges): merge nudges within 5 min`); push after every
  milestone and at least at the end of each working session, and before any risky refactor.
- Tags: `v0.0` M0 … `v0.6` M6; release builds carry `versionName` = tag.
- Never commit: keystores, `local.properties`, `android/`/`ios/` generated folders (we use Expo
  prebuild; the generated native projects are reproducible), `.env`, real health data (fixtures are synthetic).

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| OEM battery killers (Samsung/Xiaomi) delaying nudges | Exact alarms; "Keep reminders on time" screen (ignore battery optimizations request + OEM instructions); 3-hourly catch-up; replan on open |
| Notification action handling while the app is dead (RN) | Response task + apply-on-next-open fallback with the original timestamp; verify on device in M2; if unreliable, actions open the app to a one-tap confirm screen |
| Widget latency / inert after Force stop | Headless handler kept tiny; documented limitation; widget body opens the app |
| Expo Go lacks widgets / Health Connect | Guarded wrappers + stubs; laptop dev builds from M3 |
| Health Connect background permission not granted | Sync on open and on widget taps; yesterday always re-read |
| Evidence overstated in the UI | Honesty rules in `HABIT_LIBRARY.md` §F; source links |
| Play Store Health Connect policy review | Read-only scope, clear rationale screen, privacy policy; no third-party SDKs |

---

## 10. Open questions for Aman (none block M0)

1. Final app name and icon idea? ("Daily Tracker" works; the package id is set once.)
2. ml or oz by default?
3. Should cycle tracking be offered at onboarding (opt-in) or hidden behind Settings?
4. Do you have the Cadence Kotlin *source* (not just the docs)? If yes, its tests can be ported 1:1.
5. Active hours default 9 am–9 pm and a nudge cap of 10/day — right for your days?
