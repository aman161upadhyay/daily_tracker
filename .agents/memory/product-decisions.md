---
name: Product decisions (Daily Tracker)
description: Non-obvious product/UX decisions and user-stated constraints that the code does not explain.
---

- User constraints (stated 2026-10-25): Android install via sideloaded APK first; home-screen widget that
  is **not water-only** — switchable to any habit (water, steps, movement, mind, periods, reading, writing,
  AI build-out; `settings.widgetHabitIds`, max 3, empty = automatic); movement nudges every 60/90 min (user-tunable); research-backed habit combos; copy the
  Apple Health look; Spotify green + gold frames + violet tints; adherence ramp pale gold → light green →
  Spotify green → green/violet; import Samsung Health / Google Fit via Health Connect; meditation and
  opt-in period tracking; native builds on the user's laptop with Android Studio.
- Cycle prediction blends the "typical length" setting with the user's own gaps until three cycles are
  logged (fallback counts as the missing samples). **Why:** one odd cycle must not swing the prediction;
  matches the on-screen copy "predictions sharpen after three cycles".
- Body tab shows an honest "Health Connect needs an installed build" state; never fake imported numbers.
- Rule edits on the same tracking day replace each other; a different `effectiveFrom` versions the rule so
  history keeps the old target. Same-cadence edits take effect today; a cadence change starts at the next
  period so the current week/month is never scored by two rules.
- Streak freezes: a missed period costs one freeze from the month the period *ends* in; nothing is charged
  while the streak is 0. Streaks are recomputed from raw entries every render (cached per state), never stored.
- Fresh installs start empty (only the water habit) and go through onboarding; sample data is an explicit
  opt-in from onboarding or Settings. **Why:** the user must never mistake demo history for their own.
- Persistence failures are shown (red banner + Settings note) rather than silently falling back to memory.
- Cycle opt-in lives in onboarding *and* Settings (decided 2026-10-25, user had not answered).
- Adherence colors go on fills only, never text (contrast); gold frame = "in flow" (≥ 90 % adherence).
- Nudge planner decisions (2026-10-25): the movement rotation advances per *completed* snack (plus swaps),
  never per elapsed slot, so the Today card and the first pending notification always name the same snack
  (an ignored nudge re-offers the same thing). A snooze re-offers the same snack via the SNOOZED event's
  habitIds; a swap offers the next one. FIXED clock times are kept outside active hours (the user set them);
  automatic cadences are not. Quiet hours = outside active hours, no separate setting. Water nudges are
  skipped while on pace; a merged water+movement nudge's "+ml" button only settles the water half.
  **Why:** avoiding "the card says squats but the phone says walk" was the main consistency complaint risk.
- Headless notification actions (app killed) run through expo-notifications' response task on Android and
  write to SQLite directly via the shared command layer; the running app reloads on foreground when a
  "headless write" flag is set. Expo Go cannot run these; only the dev build can — device checklist N5/N6.
- Widget decisions (2026-10-26, M3): one resizable widget instead of the spec's Water 2×2 / Move 2×1 set — the
  user wanted "any habit", so the tiles come from `widgetHabitIds` (order = priority; a small widget shows only
  the first). Automatic mode = water · the snack *up next* in the rotation (so the widget, Today card and
  notification agree) · mind. A ring tap mirrors the notification "Done" rule (`completeFromNudge` with source
  AUTO_WIDGET / trigger WIDGET): water adds one tap size, snacks add a set, count/timer habits log the day's
  remainder, yes/no never double-logs. Name tap deep-links to the habit; background opens the app. Cycle and
  steps tiles wait for M4 data. **Why:** a widget that can silently log twice is worse than one that does less.
- Health Connect decisions (2026-10-26, M4): read-only; steps/heart/weight keyed by calendar day, sleep by the
  morning it ended, workouts/hydration by tracking day. Manual beats automatic: a typed steps total evicts the
  automatic entry and later syncs leave it alone; strength or generic (type 0) workouts ≥ 15 min tick Strength
  session once per day; imported drinks are matched by record id and skipped when a manual/widget drink sits
  within ±5 min and ±10 ml. Imported workouts are hidden, never deleted (hidden survives re-reads). "Pause
  imports" is an app-side flag, not `revokeAllPermissions` (library says that needs an app restart); the user
  withdraws permissions in the Health Connect app and the next sync notices. First sync 30 days (so no
  READ_HEALTH_DATA_HISTORY permission), later syncs from the day before the last sync, cap 14, and a partly
  failed read keeps the old watermark. Sample data is the only place body numbers can be synthetic, and the
  Body tab labels it. Deferred: steps/cycle widget tiles, sleep stages chart, write-back (v2).
- Cycle decisions (2026-10-26, M5): periods stay in `settings.cycle.history`; a span can be *excluded* (kept,
  but the cycle it starts leaves the averages — offered for outliers > 7 days from the median, never applied
  silently). Logging rules: a start ≤ 7 days before an existing start moves it; a start < 8 days after one, a
  day inside a period, or a future day is refused with a reason the sheet shows; a new start closes an older
  open period at the typical length. An open period displays/predicts as [start, min(today, start+periodDays−1)];
  "Period ended today" is prominent within the usual length and subtle through day 14. Late period → phase
  "late luteal", projection re-anchored at today+1, cycle reminders silent until a start is logged. Birth-control
  mode only hides fertile/ovulation (predictions unchanged). Discreet is a settings flag that neutralises every
  cycle notification's text; the `cycle` channel is lock-screen PRIVATE regardless. Insight thresholds: symptom
  windows ≥ 3 logged cycles / 3-day window hit ≥ 60 %; correlations Spearman n ≥ 4, |ρ| ≥ 0.5, symptom in
  ≥ 3 cycles, "tended to" wording, never causal. Turning tracking off hides all cycle UI but keeps data; only
  the explicit Delete wipes it. **Why:** irregular cycles are the norm, so the user — not a heuristic — decides
  what counts, and a notification must never reveal cycle details on a shared or locked screen.
- M6 decisions (2026-10-26): dark stays the default theme (user loves it); light/system are opt-in and the
  light palette remaps the *brand tokens* to AA inks (deep green + white button text) rather than adding
  separate ink/fill tokens, because screens derive fills from inks with `withAlpha`. App lock is visual only —
  widgets and notification actions keep writing (one-tap water is the point) — and a phone without a screen
  lock can neither enable it nor get trapped by it. Backups: Android Auto Backup includes *only*
  `files/backup/snapshot.json` (never the live SQLite/WAL or SharedPreferences) and is disabled on phones that
  cannot encrypt it; snapshot never for sample data, deleted by "Erase everything"; encrypted exports use an
  envelope that opens with standard tools (PBKDF2-SHA256 200k, AES-256-GCM, NFKC passwords, min 6 chars) — no
  lock-in, no recovery. Release signing reads `DT_RELEASE_*` Gradle properties with a debug-keystore fallback
  so `assembleRelease` always builds; Play Store work is explicitly not done. **Why:** privacy-first health
  data, and the user wants friends to install from a shared APK, not a store.
- Council-round-1 decisions (2026-10-26 night, user asleep, "no questions" loop): Health Connect *owns* the Steps
  total — widget/notification never log steps, `SET_AUTO_ENTRY` evicts every non-manual row (manual rows stay);
  over-cap HC reads are an error, not a truncated number. Android 8.x gets no cloud backup (manual export only),
  9–11 require `clientSideEncryption`, 12+ extraction rules. Debug-keystore fallback *kept* (first own-phone build
  must work) but Gradle warns and the guide says "never hand out such an APK". App lock prompts only when the gate
  locks (re-prompting on every foreground loops after a cancel). Nudge "Done" compares today's raw value to the
  per-day target (weekly habits were un-loggable once the week was met). UX-08 (Vitamin C default dose) rejected:
  the value is from the user's Cadence spec. Sugar Shield must be reachable without its habit being added (Today
  footer, quick-log sheet, habit page). Meditation < 1 min is not logged, and the Finish button says so.
  `@types/react` single version across the workspace is desired; Mac/Windows installs must get platform binaries
  (overrides removed) because the user builds the APK on a laptop. **Why:** the user asked for adversarial review
  and fixes without questions; every disposition is logged in `docs/RUNNING_CONTEXT.md` §6 so it is not re-litigated.
- Council-round-3 decisions (2026-10-26 night): while the app's provider is alive it is the *only writer* —
  headless work (widget tap, notification button, background re-plan) hands a `state → actions` builder to the
  provider through the live-store registry; the database load→decide→save path exists only for a dead app.
  Dispatches carry a generation; reloads, the notification "handled" mark (`commitPending()`), snapshots (state
  getter, never a DB reload) and Health Connect results proceed only once their generation is committed, and
  schedule sync / cancel-all are serialised with a generation. The importer stays strict; every *writer* caps to
  the same constants (notes `MAX_TEXT`, amounts 1e6, water target 100–20,000 ml mirrored both ways). WATER is its
  own ledger kind (replay dedupe on merged nudges). Cycle notifications are discreet by default. Monthly quota =
  min(timesPerPeriod, days in month). Paused slots never spend the daily budget. Rejected/as-designed: strength
  tick judged by minutes threshold; web meditation leave dialog (Alert is a no-op on web; device row S4).
  **Why:** rounds 1–2 fixed races at the file level only; round 3 found the decisions were still made against
  stale state. Dispositions logged in `docs/RUNNING_CONTEXT.md` §6 Round 3.
- Council-round-4 decisions (2026-10-26 morning): the provider holds the *newest* state in a synchronous ref
  (`pendingRef`) and exposes `apply(state → actions)`; every decision (actions, notification listener, widget
  tap, background re-plan, Health Connect result) is made against that ref, never React's rendered state. The
  generation bumps only on a real change (no-op dispatches must not hang `commitPending`). Live headless paths
  await re-plan + widget redraw + snapshot themselves (Android may freeze the app right after the task). A
  shared body epoch (`src/state/epochs.ts`) cancels Health Connect reads across disconnect/remove/erase/restore
  from any screen. Headless snapshot getters return null (stand down) once the app is alive. Heart reads only
  replace/prune the subtype they covered (`batch.heartSources`). One prorated `periodRequired` for streak, card,
  charts, planner. Notification payloads are validated field by field (own-property checks; bad optionals
  dropped, bad required fields drop the press). A WATER on a re-offered slot is a new drink once its snooze
  ran out. App lock engages on every off→on transition. Name greeting on Today is *not* wanted — the initial
  avatar is the design. **Why:** round 4 showed the single-writer design still read one render behind itself.
  Dispositions in `docs/RUNNING_CONTEXT.md` §6 Round 4.
- Council-round-5 decisions (2026-10-26 midday): a shared formula must share its *inputs* — the prorated quota
  takes the cadence-segment start (`segmentStartOn` replays the streak's walk; the segment starts the day after
  the previous cadence's last period ended, not on the rule's effectiveFrom), used by streak, card, charts,
  planner, widget. The timer bell payload is built by `mindEndPayload()` next to `parsePayload` (empty day
  allowed for MIND_END only) and both ends of a meditation dedupe through `mindSessionExists` (60 s on
  startAt). Provider hydration + live-store registration run under the headless lock; headless DB paths
  re-check `liveStore()` after their re-plan await. Health Connect reads are single-flight; watermark never
  moves back. App-lock gate locks during render (no fade). Stepper numbers are tappable to type (clamped, not
  snapped). Period ends are editable from any calendar day (extend/shorten). Screenshot protection follows
  the *setting*, not the lock state — by design (Recents thumbnail). Rule edits baseline the rule *in force*
  (never the latest row): a rhythm planned for a later period is replaced at its own start, called off when
  the draft equals today's rule (`REMOVE_RULE`, never a habit's last rule), and only takes the new number
  when a target is edited; the habit page shows "From <day>: <rule>" while a plan is pending (a tester read
  the invisible plan as a failed save). **Why:** round 5 showed round 4's shared formula and tightened
  parser each broke a caller that was not updated with them. Dispositions in `docs/RUNNING_CONTEXT.md`
  §6 Round 5.
- Council-round-6 decisions (2026-10-26 afternoon): planner slots are judged by the *tracking day they fall in*
  (`PlanInput.boundaryHour` → `trackingDayOf(slot)`) for FIXED and custom-window INTERVAL; rotation and water keep
  calendar-day `isToday` (windows start ≥ 5:00). `instantOf` sends a skipped DST minute forward (02:30 → 03:30),
  repeated minute → first pass; one slot per minute id (second dropped). DONE/DISMISSED outrank SNOOZED/SWAPPED
  regardless of timestamps, but WATER is *not* terminal (merged nudge: WATER then SNOOZED keeps the movement half
  open — round-3 design). Planner's one-off events are filtered by `eventHabitIds` (active habits + the
  `SHIELD_EVENT_HABIT_ID` placeholder), never by `input.habits` — the Sugar Shield habit has an EVENT policy and is
  not a planner habit (first attempt broke a planner test). Snack logs cap at `MAX_SNACKS_PER_LOG = 100` via one
  `LOG_SNACKS`. Unreadable snapshots are set aside (`snapshot.kept.json`), never overwritten; erase/opt-out write a
  cleanup marker first and start-up finishes it. `habitView` is cached per state+day for stored habit objects
  only (drafts bypass). Health Connect rationale = native trampoline activity → `daily-tracker://health-privacy`;
  the plugin must be listed *before* `react-native-health-connect` in app.json (Expo runs a later plugin's
  manifest mod first). `SYSTEM_ALERT_WINDOW` is blocked (`android.blockedPermissions`) — the debug source-set
  manifest still declares it, so only release loses it. Deferred knowingly: cross-runtime SQLite CAS (row V11),
  context split for the 30-s tick. **Why:** round 6's lenses (time, build, a11y, upgrade, scale) found the
  planner reasoning in calendar days and the backup lifecycle unrecoverable in two places. Dispositions in
  `docs/RUNNING_CONTEXT.md` §6 Round 6.
- Council-round-7 decisions (2026-10-26 evening): background work must run offline (pnpm patch removes the
  network constraint); exact-alarm status comes from a local native module, never `USE_EXACT_ALARM` (Play policy),
  and the capability is part of the notification ledger signature so a grant/revoke re-submits every request;
  the mind bell is re-submitted on foreground. Imports: every timestamp through `isInstantMs` (±200 y, integer),
  every day through `isCalendarDay`, unknown record fields projected away; one drink ≤ `MAX_WATER_LOG_ML`
  (20,000 ml) at every entry point. Forged notification responses are dropped at the JS boundary (`isOwnTrigger`:
  trigger type 'date' or absent) — MainActivity stays exported. Volume parsing: a comma is thousands only when it
  groups exactly three digits with no '.'; ounces show one decimal everywhere. Privacy copy never says "stays on
  this phone" — the backup can carry it ("kept inside the app (and in the phone backup, if that is on)"). Today
  shows Water/Movement/Mind cards only for habits the person has; cycle has `settings.cycle.showOnToday`; `/cycle`
  with tracking off renders a turn-on card. Notification titles cut at 40 chars (`shortName`); merged nudges keep
  both names via the candidate `line`. Left alone knowingly: React Compiler bail-outs in the provider / scheduler /
  mind screen (correct code, no measurable cost), sheet drafts lost on process death. **Why:** round 7's platform
  lens read the installed native sources and found two defaults (network constraint, inexact alarms) that no test
  here could reveal; the surface lens showed finite ≠ sane. Dispositions in `docs/RUNNING_CONTEXT.md` §6 Round 7.
- Round 8 (2026-10-26 night) rules, each with a paradigm in RUNNING_CONTEXT §4 (31–35): a file is replaced only
  by a complete file (write `snapshot.next.json`, then move — the installed expo-file-system `move({overwrite})`
  deletes the destination before renaming); kept copies are one file each and never overwritten; the cleanup
  marker names its target. Encrypted export is envelope 2 (header string as GCM AAD; envelope 1 still opens; the
  Python recipe in BUILD_ANDROID shows the AAD join). Cycle: a reminder day that depends on an unlogged period is
  shown but never scheduled (`confirmed`); birth control pauses fertile/luteal rules; `estimated` is wording,
  `predicted` is calendar styling; future-dated starts anchor nothing; symptom burden = mean severity per logged
  day with a 3-day floor. Journey: weekly habits have `doneToday` distinct from the period ratio; week summary
  counts sessions vs quota. Widget: ring value in dp (no font scaling), labels budgeted, 48 dp touch floor, 72 dp
  min height, day line is the first thing dropped, failures draw a notice on the last good model, rotation taps
  resolve from the newest state. Health Connect: manual/widget drink within 5 min & 10 ml evicts its imported twin
  on the next sync; overlapping sleep/workouts (> half the shorter) count once (richest copy wins; hiding it
  reveals the other); every sync re-reads a rolling 7 days (cap 14) and a newly granted type gets a 30-day
  backfill (`sync.backfilled`; legacy installs count current grants as done). Deferred: HC `getChanges` tokens,
  "sharpens after three" copy. **Why:** round 8's lenses ran personas and scripts against the selectors and found
  the data layer only right for one source of truth per fact. Dispositions in RUNNING_CONTEXT §6 Round 8.
- Round 9 (2026-10-26 night) rules, paradigms 36–39 in RUNNING_CONTEXT §4: a merged notification is one
  delivery and many slots (`mergedIds` on the nudge/payload; ledger events per constituent with `via`; cap and
  budgets count the delivery once; the OS's deliveries while closed are folded into state *before* planning —
  `reconcileAndSync`). Every nudge decision is in tracking days (slot `dayOf`), a met weekly/monthly quota settles
  the period (`periodEndsOn`), automatic snoozes past the active end are dropped (fixed clock times keep theirs),
  `liveNudge` is null when the planner offers nothing. Reads are memoised by what they read: per-habit view/values
  memo keyed on rules, policies, the habit's log slice and the day (one slot per habit *object*; tests must check
  unrelated-state identity before the habit's own change); cadence segments walked once per rule history;
  period counts incremental over consecutive days; `periodRequired` arithmetic. Health Connect: manual drink ↔
  import twins one-to-one, nearest first, judged on the *current* upstream batch (idempotent); edited imports keep
  their recorded zone; a revoked type leaves `backfilled` so a re-grant backfills again. Cycle: PHASE_START/period
  offset 0 fires on the logged start; `phaseQualifier` = "(estimated)" up to today, "(predicted)" after. Copy:
  Stepper `inputKind` ('amount' for volumes; defaults to 'time' when `parse` is given, else 'number'); row labels
  say what the tap does; Today's water button follows `tapSizeMl`; widget `ringValue` drops the unit then compacts
  thousands before shrinking under 11 dp. **Why:** round 9's harnesses (fuzzer, planner simulator, perf profile)
  found the round-8 fixes right per object and wrong in aggregate. Dispositions in RUNNING_CONTEXT §6 Round 9.
- Round 10 (2026-10-26 night) rules, paradigms 40–43 in RUNNING_CONTEXT §4: a delivery is an *occurrence*
  (slot id + time) — `firedActions` dedupes by occurrence among FIRED events, so a snoozed/swapped slot that rings
  again is counted again and a replay is a no-op; deliveries go to a journal (`deliveryJournal.ts`) before the
  ledger is replaced and are acknowledged only after the store confirmed the save (`reconcileAndSync` →
  `{delivered, persisted}`; headless callers ack after `store.persist`); "it rang" = absent from the pending set,
  never a clock comparison. Budgets count deliveries per tracking day (missed slots are free), exempt ids
  `summary:`/`cycle:`/`event:` are outside the cap (anything else counts, legacy ids included), responses carry the
  payload's `day`, TAP writes one FIRED per slot+day and none when the sync already recorded it, loops `continue`
  past settled slots. Reminder policies are editable per habit (`ReminderPolicySheet`; modes Off / Set times /
  Every so often, movement habits get Rotation instead of an own interval, water gets pace checks only; card text
  comes from `describePolicy`, never preset copy; EVENT/CYCLE policies are not editable). Water display goes
  through `formatHabitValue`/`habitAmountText`/`habitUnit` everywhere. Freezes default by cadence
  (`defaultFreezes`: 2/1/0). Session sweep: best overlap share wins (oldest on a tie). Rejected: a new data
  version to make v0.12 refuse v0.13 exports (documented the caveat instead). Deferred: reconstruction of merged
  reminders scheduled by v0.12 (replaced on the first sync anyway); B3 activity history with Undo; B5 pinned-card
  picker. **Why:** round 10's pipeline/diff lenses showed round 9 keyed deliveries by slot id for life and acked
  before the save; the finish-line lens found the "configurable nudges" user constraint still unmet.
- Round 11 (2026-10-26 night) rules, paradigms 44–48 in RUNNING_CONTEXT §4: budgets and the cap count *every*
  FIRED event per occurrence (`deliveriesOn`, key `via ?? nudgeId` + time); the latest event per slot settles
  only; TAP/OPEN write nothing (the sync owns FIRED; a monotonic FIRED dedupe was tried and reverted after the
  simulator showed it loses occurrences when a tap races the sync — exact `id|at` dedupe is the rule). The
  notification service keeps one record `{ledger, journal, cancelling, scheduling}` under one key, written
  before and after each OS change; a dead sync's intents are resolved on the next read (cancelled+gone = not
  rung; scheduling+pending = ours; gone+overdue = rung — deliberate, a double ring is worse than a phantom;
  gone+ahead = forgotten). A storage read failure throws (never "empty"). Replacing the state (erase / restore /
  sample) bumps `replaceEpoch`; the scheduler runs `cancelAll({forget:true})`; cancel-all and acks are queued
  jobs that a newer sync never skips. Editor: a paused schedule stays paused on Save (the switch resumes it);
  time rows have stable keys; a stepper opened and closed without typing returns the value it opened with;
  freezes use a touched flag. The Reminders card has a "Next: …" line from the plan (policy fallback only for a
  chosen weekday past the 36-h horizon). Weekday selection for set times: `NudgePolicy.weekdays` (0 = Mon … 6 =
  Sun, calendar day of the time; absent = every day; all seven normalises to absent; last chip not removable),
  schema v6 `weekdays_json`. Widget tap under a failed live save draws the on-disk numbers + notice, no snapshot.
  Deferred: reminder set-up inside habit creation. **Why:** round 11's simulator and native-paths lenses showed
  round 10 journaled per occurrence but still budgeted per slot id, and that the service's record had crash
  windows and a read-failure-as-empty path. Dispositions in RUNNING_CONTEXT §6 Round 11.
- Round 12 (2026-10-26 night) rules, paradigms 49–52 in RUNNING_CONTEXT §4: the notification service's
  records (bookkeeping, press inbox) are rows in the state's SQLite `kv` table via
  `TrackerStore.readRecord/writeRecord` (compare-and-set → `SupersededError`, start over, never overwrite),
  cleared by `replace` in the same transaction — never AsyncStorage for anything the state's erase/restore
  must take with it. Erase/restore/sample data flush through `store.replace` (the provider's `SaveQueue.markReplace`);
  `replaceEpoch` is a dependency of the debounced re-plan (no separate cancel-all effect). A notification
  button press is written to a durable inbox before it is applied and marked handled only after the state
  write committed; the inbox is replayed at every runtime start with the *received* instant (so replays
  compute the same thing; SNOOZE deduped by exact instant). Stored records are validated entry by entry and
  capped — a damaged row is dropped, never fatal. Refused OS cancels keep their ledger entry; a failed sync
  is shown (Settings → Reminders) and retried after a minute. Rejected DR12-04 (the 30-min overdue grace
  cancel is correct: Expo removes a request at delivery). Deferred PLAT12-03 (reboot drops expired DATE
  triggers before Expo's boot receiver → phantom FIRED; needs a Kotlin boot receiver; checklist AC5
  measures it). Dispositions in RUNNING_CONTEXT §6 Round 12.
- Round 13 (2026-10-26 night) rules, paradigms 53–58: `readRecord` returns `{value, version}` and the
  version carries a replace generation (SQLite kv `replace_generation`, JSON `{generation, records}`) —
  a "no record yet" read before an erase/restore must not write after it; never compare record text
  alone. Re-plans wait for `replacePending` (replace applied on screen but not committed) and in-flight
  folds are fenced on `replaceSeq()` (scheduler + `replanLive`; LiveStore exposes both). A refused OS
  schedule/cancel fails the sync (`OsRefusedError`) *after* the honest ledger write. The launch press is
  cleared only after the inbox write (`launchResponse` / `clearLaunchResponse`). Nothing may present
  above the app lock: `Sheet` reads `lockState` (a later RN Modal stacks above the gate's on Android).
  Ids from outside the table go through `presetById` (hasOwnProperty), never `PRESET_BY_ID[x]`. B3 built:
  "Logged" activity list on every habit page (exact-record Remove; Health Connect rows listed, not
  removable) + "Fix an older day" month picker (yes/no flips in place; amounts via AmountSheet set mode;
  one sheet at a time). Backlog: Undo toast after Remove, B5 pinned-card picker. Dispositions in §6 Round 13.
- Round 14 (2026-10-26 night) rules, paradigms 59–65: the provider's save loop is `src/state/saveQueue.ts`
  (pure, tested) — one queue per hydration, `dispose()` on unmount/reload retires it (no retry, no pass,
  waiters false); never add a retry/timer to the provider outside the queue. A failed open/load is
  `loadError` + `retryLoad` (ready stays false; the layout shows "Your data could not be opened"), never a
  ready placeholder. Every follow-up after a write (widget redraw, snapshot) uses `committed()` and runs
  only when `persisted`; `BackupSync` awaits `commitPending()` first. Duplicate press claims go through
  `ClaimGate` (answered after the first inbox write). Today's cards: `Settings.pinned` is the ordered
  membership (sanitised; cycle always in the list, shown by `cycle.showOnToday`), rendered filtered by
  availability; Steps/Sleep opt-in show a door to Body without data. The month picker computes its own
  month (`ratiosFor`), never the heatmap strip. Solid fills with text use `inkFor` + `readableFill`
  (test over every category colour, both themes). Dispositions in §6 Round 14.
- Round 15 (2026-10-26 night) rules, paradigms 66–69: every running-app snapshot reads
  `committedSource(liveStore)` — committed state vetoed by the newest state's backup policy and by a
  pending replace (never `current()`, never bare `committed()`). Notification permission goes through
  `classifyPermission` (Expo status + canAskAgain + POST_NOTIFICATIONS runtime check): on Android 13+
  Expo's "denied" on a fresh install means "not asked yet". Undo = exact `LogRecord` restore
  (`dayRecords` is the one removal rule; `RESTORE_LOGS` skips present ids / orphan entries, cap 1000);
  toast is a module store + `ToastHost` in the root layout under the lock gate, hidden on replaceEpoch.
  Memo boundaries: `habitView` compares the habit's own rules/policy; `nudgePlan` keeps a last-plan memo
  over the slices the planner reads (body is not one); Today builds cards on demand; `maybeSnapshot`
  remembers the write time of a file it wrote/verified and skips `keepUnreadable` for it. Perf figures
  left as known: cold cycleInsights ~44 ms phone, plan per tick ~15 ms. Dispositions in §6 Round 15.
- Round 16 (2026-10-26 night) rules, paradigms 70–76: week start is a trailing numeric parameter
  (Monday 0 default, Sunday 6 via `weekStartIndex`) — stored weekday encoding never changes, only
  bounds/order; the weekly summary follows the week's last day and its hint must read the configured
  day (a hard-coded "Sundays" was caught by browser e2e). Undo keeps manual-beats-AUTO_HC. Snapshot
  shortcut identity = mtime+size (no digest). Today-card anchors by real minutes (DST fold). Planner
  budgets/rotation move only on kept candidates (`push` returns a boolean). Sleep nights carry
  start/end UTC offsets (bridge passes `startZoneOffset`/`endZoneOffset` for sleep though its TS
  types omit them); a reread with the same times keeps the first placing; schema v7. Widget headless
  tap: persist first, re-plan second (library timeout 30 s reported as success); a tap inbox was
  rejected — taps have no dedupe key, a replayed drink double-counts. Expo web HMR can leave a stale
  module ("ReferenceError: <new import> is not defined") after adding imports — restart the workflow
  before a browser e2e. Dispositions in §6 Round 16.
- Round 17 (2026-10-26 night) rules, paradigms 77–80: once a headless tap is persisted nothing after
  it may show "could not be saved" (`tapSaved` flag; catch draws the applied state). Memo deps are
  listed from the callee's reads — a new setting must be added to every memo that can see it (the
  week start reached `habitRatios` under `cycleInsights`). One reminder editor (`ReminderPolicyForm`)
  embedded in the New habit sheet and wrapped by the page's sheet; a chained sheet and a duplicated
  mini-form were rejected. The round-12 simulator is now a gating test (`tests/nudgeSim.test.ts`,
  75 sequences; `NUDGE_SIM_SEQUENCES=200` for the full run). Native-importing modules (the widget
  handler, `backup.native.ts`) are tested by transpiling the source with the TypeScript API into a
  vm with scripted requires, or via `node:module` `registerHooks` — never by importing react-native.
  Dispositions in §6 Round 17.
- Round 18 (2026-10-26 night) rules, paradigms 81–85: a lifetime is a token (fresh object per effect
  setup; a boolean `alive` ref is broken for good by StrictMode's replay) and it travels with the work
  to the last OS call (`still` through `reconcileAndSync` → `syncStateToOs` → `syncPlan`, re-read
  after the OS reads, before the first write). Live-store registration/teardown live in one effect
  and tear down by identity; `LiveStore.alive()` is bound to the hydration's queue and a retired
  `apply` saves nothing. Paired OS ops (mind bell schedule/cancel) go through one queue + generation,
  newest wins. The real `notifications.native.ts` and `replan.ts` are testable behind `registerHooks`
  stubs (expo-*, react-native, AsyncStorage in memory; './notifications' from replan redirected to the
  native file) — see `tests/round18.test.ts`. State fuzz is gating (`tests/stateFuzz.test.ts`,
  `FUZZ_SEQUENCES=300` for the full run). Copy terms kept on purpose: "pace check" (water mode name),
  "streak freeze"; the tester's copy audit is a repeatable lens. Dispositions in §6 Round 18.
- Round 19 (2026-10-26 night) rules, paradigms 86–88: accessibility state only through `aria-checked` /
  `aria-selected` / `aria-disabled` (react-native-web 0.21 ignores `accessibilityState`; RN maps the
  aria props on Android). A Library preset's reminder is shown and editable (collapsed) in its sheet
  before adding — `presetHabitAction(preset, id, day, reminder?)`; EVENT presets keep their trigger.
  Highlights never show "0 of N" over no history. Movement presets' interval mode reads "Rotation" on
  purpose. The web preview's About version lags app.json (babel inlines the web manifest once; Metro
  cache) — clear /tmp/metro-cache before a web check, never "fix" it in code. Dispositions in §6 Round 19.
- Craft & learning presets carry honest evidence labels (read-before-bed Emerging; technical reading
  Moderate; write Moderate; build-with-AI Emerging = habit-formation evidence, not a productivity claim).
- Open questions still unanswered by the user: private repo?, meaning of "Fable model", final app
  name/icon, ml vs oz default (onboarding defaults to ml), Cadence Kotlin source availability,
  active hours 9–21 and a 10-nudges/day cap.
