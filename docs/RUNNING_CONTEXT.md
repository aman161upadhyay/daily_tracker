# Running context — Daily Tracker

The hand-over file. It is kept current by whoever (human or agent) works on the project and is the
first thing to read after `replit.md`. It answers: what exists, why it is the way it is, how work is
verified, what happened step by step, and what is still open. Append to the journal; never rewrite
history.

Last updated: 2026-10-26, autonomous session (council rounds 1–20 fixed; see journal and §6).

---

## 1. Status at a glance

| | |
|---|---|
| App | Daily Tracker — private Android tracker: habits · water · movement snacks · meditation · opt-in cycle · home-screen widget · configurable nudges · Health Connect import · app lock · encrypted backups |
| Code | `artifacts/daily-tracker/` — Expo SDK 57, React Native 0.86, TypeScript, Expo Router, expo-sqlite |
| Version | `app.json` `version 0.26.0`, `versionCode 26`, tag `v0.26` (M6 complete + council rounds 1–22) |
| Repo | https://github.com/aman161upadhyay/daily_tracker.git, branch `main`, commits authored as Aman |
| Milestones | M0 skeleton ✅ · M1 storage/streaks/onboarding ✅ · M2 nudges/notifications ✅ · M3 widget ✅ · M4 Health Connect/Body ✅ · M5 cycle ✅ · M6 theme/lock/backup/signing ✅ (`docs/IMPLEMENTATION_PLAN.md`) |
| Verified here | type-check (three packages), 495 unit tests (incl. a 75-sequence randomised nudge simulation and a seeded state fuzz), Android Metro bundle, Hermes bytecode compile, `expo export` release bundle, `expo prebuild` manifest/gradle checks (incl. the Health Connect rationale activity), web walkthroughs by a browser-driving tester |
| Never run yet | a real Android device. Everything native (widget taps, notification buttons with the app closed, Health Connect, app lock, Auto Backup, signed APK) is coded and reviewed but untested on hardware — `docs/DEVICE_CHECKLIST.md` lists the exact rows |
| User's next step | `docs/GET_IT_ON_YOUR_PHONE.md` (plain-language build guide) |

## 2. Read order for a new agent

1. `replit.md` — project rules, commands, layout, the nine non-negotiables.
2. This file — sections 3–5 (method, decision paradigms, journal).
3. `docs/IMPLEMENTATION_PLAN.md` — architecture (§3), data model, flows, each milestone's "Built" notes.
4. `docs/DESIGN_SYSTEM.md` (tokens, components), `docs/HABIT_LIBRARY.md` (presets + evidence).
5. `.agents/memory/*.md` — environment quirks that cost time to rediscover, product decisions with their *why*.
6. `docs/BUILD_ANDROID.md`, `docs/DEVICE_CHECKLIST.md` — the laptop/phone side.

## 3. Working method

### Commands (inside `artifacts/daily-tracker/`)
- `pnpm exec tsc --noEmit -p .` — must be clean.
- `pnpm test` — `node --test` via tsx over `tests/*.test.ts` (no Vitest; blocked in this workspace).
- Dev server: the `artifacts/daily-tracker: expo` workflow (restart it; never `expo start` by hand).
- Android bundle check without a device: read `PORT` from the workflow process
  (`tr '\0' '\n' < /proc/$(pgrep -f "expo start" | head -1)/environ | grep ^PORT=`) and fetch
  `http://127.0.0.1:$PORT/.expo/.virtual-metro-entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app`
  (expect HTTP 200; grep it for the modules you touched).
- Hermes compile check of that bundle: `node_modules/.pnpm/hermes-compiler*/node_modules/hermes-compiler/hermesc/linux64-bin/hermesc -emit-binary -out /tmp/a.hbc /tmp/android.bundle` (the workspace copy lives under `.cache/typescript/5.9/node_modules/hermes-compiler/...` if the pnpm one lacks a linux binary).
- Production bundle: `CI=1 pnpm exec expo export --platform android --output-dir /tmp/dt-export` — catches release-only bundling problems.
- Config plugins / manifest: `CI=1 pnpm exec expo prebuild --platform android --no-install`, grep
  `android/app/src/main/AndroidManifest.xml` and `android/app/build.gradle`, then `rm -rf android`.
- Web preview version lag: babel inlines the app manifest for **web only** at first transform and Metro's
  transform cache keeps it, so About on the web preview can show a version many rounds old (0.7.0 was seen
  at 0.22). Not an app bug — Android reads the config embedded at build time. `rm -rf /tmp/metro-cache`
  before restarting the workflow when the web version matters.
- Gated screens in the web preview: the screenshot tool cannot pass onboarding; `/settings`, `/body/*` are
  ungated; for the tabs, a browser-driving tester taps "Explore with sample data instead".

### Verification ladder (what "done" means for a change)
1. tsc clean, tests green (add tests for domain/data logic; UI is verified visually).
2. Android bundle 200 + Hermes compile when anything under `src/services`, `index.js`, plugins or deps changed.
3. Web screenshot or tester run for anything visible.
4. Docs: `replit.md` layout notes, plan "Built" notes, device-checklist row for phone-only behaviour,
   this file's journal.
5. Commit as Aman (small, named), `git push` (never force), tag milestones `v0.<n>`.

### Who does what when the user is away
The user asked (2026-10-26, before sleeping) for an autonomous loop: adversarial review by a council of
independent agents over all decisions and code, fixes, end-to-end tests, further ideas, continuous pushes,
no questions back. The loop used here:
1. **Council round** — several read-only reviewer agents, each with a different lens (Android runtime,
   data integrity, product/UX, security/privacy, release/onboarding docs), return findings with severity,
   evidence (file:line) and a recommendation.
2. **Triage** — the main agent accepts or rejects each finding against §4 (paradigms) and the user's
   stated constraints; rejections are logged with the reason in §6 so they are not re-litigated.
3. **Fix + verify** — ladder above; one commit per coherent batch; push.
4. **Journal** — §5 gets a dated entry; §6 gets the findings table.
5. Repeat with fresh lenses until two consecutive rounds produce nothing above "low".

## 4. Decision paradigms (how choices are made here)

These are the rules behind the rules. When a new question comes up, decide with these; if a decision
contradicts one, write down why.

1. **Privacy before convenience.** No analytics, no accounts, no network SDKs; the only network use is an
   evidence link the user taps. Health data never leaves the phone unless the user exports it. Cycle
   notifications never reveal content on a locked or shared screen. Backups include only the app's own
   snapshot file, encrypted-capable phones only; encrypted exports are documented so the user is never
   locked in.
2. **Honest UI.** Never fake data: fresh installs start empty, sample data is explicit and labelled
   everywhere it shows. Unavailable native features say so ("needs an installed build", "not available in
   the browser preview") instead of pretending. Persistence failures are shown in red, not swallowed.
3. **Manual beats automatic.** A typed value evicts an imported/automatic one and later syncs leave it
   alone. Automatic sources (widget, notification buttons, Health Connect) must never double-log.
4. **One clock.** Habits/water/snacks use the tracking day (3 am boundary) from `src/domain/time`; cycle
   data and clock-time reminders use the calendar day. No `Date.now()` in domain code (injectable clock).
5. **Writes go through the reducer.** UI, widget handler and notification handlers call actions/commands;
   every write replans nudges, refreshes the widget and persists through the store. Headless writers share
   `src/state/commands.ts` with the app so the rules are identical.
6. **Persisted state = export format.** Fields are added with defaults (`normalizeSettings`, migrations
   keyed by `PRAGMA user_version`), never renamed or dropped; saved data is never deleted by an upgrade.
7. **Deterministic, idempotent background work.** Nudge ids and plans are deterministic so re-planning
   replaces rather than duplicates; sync watermarks only move forward on success; snapshots are written
   atomically; config plugins are idempotent.
8. **Degrade to stubs, never crash.** Native modules are behind platform-split files and lazy `require`s so
   Expo Go and the web preview always run; anything headless is registered from `index.js`.
9. **Design system is the only source of colour and type.** Dark is the design; light is an opt-in remap of
   the brand tokens to AA inks. Adherence colours go on fills, never text. ≥ 48 dp targets, labels on
   everything interactive, no nested pressables, US English, no exclamation marks in notifications.
10. **The user decides, heuristics propose.** Outlier cycles are *offered* for exclusion, never excluded
    silently; correlations use "tended to" wording; nothing is auto-deleted (imports are hidden).
11. **Phone-only behaviour gets a checklist row.** If it cannot be verified here, it is written down in
    `docs/DEVICE_CHECKLIST.md` with steps and the expected result.
12. **Reversibility over cleverness.** Prefer the change that can be undone (a flag, an additive field, a
    documented fallback) to a migration or a rename.
13. **Mark done only after the commit.** Any "already handled" marker (notification press keys, sync
    watermarks, snapshot timestamps) is written after the state write succeeded, never before; a crash in
    between must replay, and the replay must be a no-op because the dedupe lives in the same transaction as
    the data (the nudge-event ledger). Corollary: every headless writer goes through one in-process lock.
14. **Removal needs a complete picture.** Imported data (Health Connect) is only removed when the read that
    says "it is gone" covered the whole window without errors; a partial read may add and update but never
    delete. Manual data is never removed by a sync.
15. **Imports are hostile input.** Every number has a range, every list a unique key, every size a cap —
    before anything reaches the planner, the database or a key-derivation loop.
16. **Limits are enforced where the value is typed, not only where the file is read.** The validator
    stays strict (a file is either whole or rejected), so every writer — sheets, steppers, text inputs,
    the settings↔rule mirrors — clamps or caps to the same constants (`MAX_TEXT`, `MAX_AMOUNT`, the
    water-goal range). A value the app accepted must never make the app's own backup unrestorable.
17. **One writer per runtime.** While the app's provider is alive, headless work (widget tap,
    notification button, background re-plan) hands its changes to the provider through the live-store
    registry instead of loading and saving the database itself; the provider is the single writer and
    the only reader of its own unsaved changes. Decisions made against a stale snapshot are a bug.
18. **Nothing is done until its generation is committed.** The provider counts dispatches; a reload,
    a notification "handled" mark, a snapshot or a sync result may only proceed once the generation
    it saw is in the database (`commitPending()`), and anything in flight across an erase or a reload
    (Health Connect sync, schedule sync, snapshot) is dropped when its generation is superseded.
19. **Decide against the newest state, never the rendered one.** The provider keeps the newest state
    in a ref that every dispatch updates synchronously; React renders it a moment later. Anything that
    computes its next action from state (an action, a widget tap, a notification button, a sync
    result) goes through `apply(state => actions)` on that ref, so two commands in the same tick see
    each other. A dispatch that changes nothing is not a change: it does not bump the generation, so
    nobody waits for a write that will never happen.
20. **A read covers only what it was granted.** A Health Connect read with one of two heart
    permissions says nothing about the other's fields; it neither replaces nor removes them. Same
    for any import that is a subset of a stored record: replace what you read, keep the rest.
21. **One formula per number.** The prorated period quota ("2 of 4 this week" in the first, partial
    week) is computed once (`periodRequired`) and used by the streak, the card, the charts and the
    planner. When two screens can disagree about a number, extract the formula before fixing either.
22. **One formula, same inputs.** A shared formula fed different inputs still disagrees: the round-4
    quota was one function, but the streak gave it the period's real start and the card gave it the
    creation day, so a cadence change split them again. When a formula is shared, share the derivation
    of its inputs too (`segmentStartOn` for the quota), and test the transition cases (daily → weekly,
    weekly → monthly, mid-week and on a boundary), not only the steady state.
23. **Whatever writes a payload is what parses it.** The timer bell was built by hand in the
    notification service and rejected by the parser that had been tightened in another file. A payload
    builder lives next to its parser and a round-trip test (`parsePayload(build(...))`) guards every kind.
24. **Two ends of one event share one dedupe.** The meditation timer can be finished by the screen's
    clock or by the end bell, in either order, with the OS free to pause the screen's clock. Both go
    through `mindSessionExists` (same key, same window) against the newest state; a dedupe that lives
    only on one side is a double log waiting for the other.
25. **Rule edits are decisions over the rule *in force*, not the latest row.** `ruleChangeActions` /
    `targetChangeActions` (`src/state/commands.ts`) take today's rule as the baseline, treat a rhythm
    planned for a later period as a plan — replaced at its own start, called off (`REMOVE_RULE`) when
    the draft is today's rule again, carried along when only the target changes — and the habit page
    shows the plan ("From Nov 2: …") so a save that starts next week never looks lost. **Why:** basing
    an edit on the latest row made a planned monthly rhythm start today when a target was tweaked, and
    an invisible plan read as a failed save.
26. **A clock time is judged by the tracking day it falls in, and a wall-clock minute is one slot.**
    `instantOf` moves a minute the clock skips forward onto the moment the clock jumps to (02:30 on a
    spring-forward night is 03:30, never 01:30), and resolves a repeated minute to its first pass; the
    planner carries `boundaryHour` and asks `trackingDayOf(slot)` before deciding a slot is already
    settled, and drops the second of two elapsed-hour slots that share a minute id. Terminal nudge
    events (done, dismissed) outrank snoozes whatever their timestamps say. **Why:** calendar-day
    checks sent a 1:30 am reminder for a habit done an hour earlier, a skipped minute rang an hour
    early, and a clock set back between a snooze and a tap re-offered a finished nudge.
27. **A backup the running build cannot read is never overwritten, and a delete is a promise kept on
    the next start.** The hourly snapshot writer moves an unreadable snapshot to `snapshot.kept.json`
    first; onboarding and Settings say so and offer keep / delete / try again; erase and opt-out write
    a `backup-cleanup.pending` marker before deleting and clear it last, and start-up finishes any
    pending cleanup. **Why:** a newer phone's restored snapshot was the only copy of that data and a
    fresh install would have replaced it within the hour; an erase interrupted by process death left
    the old snapshot eligible for Android backup for ever.
28. **Local-only work never carries a network constraint, and a library's defaults are read in its
    source, not assumed.** The background re-plan (and the background Health Connect read) touch
    nothing outside the phone, so the "network connected" constraint the installed
    `expo-background-task` puts on every job is removed by a maintained pnpm patch
    (`patches/`, listed in `pnpm-workspace.yaml`). **Why:** an offline phone would have stopped
    getting reminders 36 hours after the app was last opened — the planner's horizon — with
    nothing in the app able to explain it.
29. **What the OS decided when a request was submitted is part of that request's identity.**
    expo-notifications picks exact or inexact alarms at scheduling time and never revisits them, so
    the exact-alarm capability is folded into the notification ledger signature: when the person
    allows or revokes "Alarms & reminders", the next sync re-submits every future request, and the
    meditation bell is re-submitted when the screen comes back to the foreground. The capability
    itself is read through a 30-line local native module (`modules/exact-alarms/`) rather than by
    declaring `USE_EXACT_ALARM`, which Play reserves for alarm-clock apps. **Why:** on Android 14+
    the permission starts off, so without this a reminder set before the grant stays inexact for
    ever and one set before a revoke is silently gone.
30. **Privacy copy describes where the bytes can actually go, not where we would like them to
    stay.** With Android backup on by default and the hourly snapshot carrying the whole state,
    "stays on this phone" is false; every such line now says "kept inside the app (and in the phone
    backup, if that is on)" and the health rationale names the backup as the one copy that can
    leave. **Why:** the rationale is what Health Connect shows people before they grant access; an
    absolute claim there that the same screen's own promises contradict is the kind of thing a
    reviewer — or a friend — notices first.
31. **A file is replaced only by a complete file; a copy set aside is never overwritten.** The
    snapshot writer writes `snapshot.next.json` in full, then moves it over `snapshot.json`; a
    complete `next` found on start outranks the old file. Unreadable snapshots are kept one file
    each (`snapshot.kept.<ms>.json`) and the cleanup marker names its target. **Why:** the
    installed expo-file-system `move({ overwrite })` deletes the destination before the rename, so
    a crash in between left nothing; and a second unreadable snapshot used to erase the first one
    kept. Both are the person's only copy of something.
32. **A reminder day that depends on a period not yet logged is shown, never submitted to the
    OS.** `ReminderFire.confirmed` is false for "day N of the period" rules once the logged period's
    day has passed; the Cycle tab shows the speculative day with "once the period is logged" and
    the planner schedules only confirmed fires. Under hormonal birth control the fertile and
    luteal rules pause (there is no ovulation to count from) and the sheet offers only period
    rules. **Why:** a reminder that rings on a predicted day while the period is late is the
    promise "paused while late" broken from the lock screen, where it cannot be explained.
33. **Phases between periods are estimates and say so; "predicted" is a calendar style, not a
    truth claim.** `CycleDayInfo.estimated` drives the wording ("(estimated)" in the day sheet and
    the calendar's accessibility label); `predicted` keeps styling the days past today. A start
    logged on a future day is kept in the record (so it can be removed) but anchors nothing, and
    the Cycle tab flags it. Symptom correlations compare the mean severity per logged day, not the
    sum — and skip a cycle with fewer than three logged days. **Why:** the sum called a
    well-logged mild cycle the worst one, and a retrospective ovulation looked like a measurement.
34. **Two sources reporting one night or one workout are one session; a drink logged by hand is
    the record of that drink.** Health Connect mirrors keep every record (each can be deleted
    upstream on its own) but the Body tab counts overlapping sessions (> half of the shorter one)
    once, the richest copy standing for the rest; a manual or widget drink within five minutes
    and ten millilitres of an imported one evicts the import on the next sync. Every sync re-reads
    a rolling week, and a record type granted later gets its own 30-day first read. **Why:** a
    phone plus a watch gave 15-hour nights, a glass tapped a minute after the other app's entry
    counted twice for ever, and a workout that reached Health Connect two days late never landed.
35. **A widget value is drawn in dp; its labels scale with a budget; a failure is a notice, not an
    empty configuration.** The ring value ignores the font scale (a ring is a fixed shape), labels
    scale until their block would push the ring under 72 dp, then the day line goes before the
    ring shrinks; a load or tap failure draws a notice on the last good model instead of "choose
    habits". The automatic rotation tap resolves the next snack from the state being written, not
    from the habit the drawing showed. **Why:** at 2× font scale the old layout clipped "1,850",
    the 60 dp compact widget drew a 36 dp target, and a storage error was indistinguishable from a
    fresh install.
36. **A merged notification is one delivery and many slots.** Two series landing within five
    minutes ring once; the notification carries every slot id it stands for (`mergedIds`), what
    happens to it — it rings, is snoozed, is done — is written against each slot (the constituents
    pointing back through `via`), and the daily cap counts the delivery once. Deliveries the OS made
    while the app was closed are folded into the state *before* the next plan is built. **Why:** a
    recompute that kept only the first slot's id brought the second slot back two minutes after a
    snooze, and planning before reading the deliveries spent the cap twice.
37. **Every nudge decision is made in tracking days, and a decision made for a period holds for the
    period.** A slot's day is the tracking day of its clock time (a 1 am reminder is judged by the
    evening before it); budgets, caps and "done" are kept per tracking day; a met weekly or monthly
    quota settles every remaining slot of that period (`periodEndsOn`); an automatic snooze that
    lands past the end of the active hours is over for the day (a fixed clock time keeps its
    snooze); the live countdown says nothing when the planner offers nothing. **Why:** midnight
    reopened finished rotations and reset the cap three hours before the boundary, Tuesday rang
    for a quota met on Monday, and a 20:50 snooze rang at 21:05.
38. **Reads are memoised by what they read, not by the state they were asked with.** A habit's view
    and day values are keyed on its rules, policies, its own slice of the log and the day (a water
    tap leaves the other habits' views alone); cadence segments are walked once per rule history
    and looked up; period counts over consecutive days extend the previous day's count; quotas are
    arithmetic. The per-state caches stay as the fast path within one render pass. **Why:** one
    water tap rebuilt 25 lifetime streaks (37 ms on the render thread) and the cycle insights took
    0.4 s because every day re-walked a year of periods.
39. **A manual drink stands for at most one imported one, judged on the upstream record as it is
    now.** Twins are matched one-to-one, closest first, within five minutes and ten millilitres,
    against the current upstream batch; an import moved an hour away upstream is a drink of its
    own again; an edited import keeps the zone it was recorded in. A record type revoked and
    re-granted gets its 30-day first read again. **Why:** one tap erased two distinct imports eight
    minutes apart, a corrected upstream time was not idempotent, and a re-granted type never
    recovered its gap.
40. **A delivery is an occurrence — a slot at a time — and it is written down once per
    occurrence, and only forgotten once the state that holds it is on disk.** A slot that was
    snoozed or swapped and rang again is a second occurrence (a second ledger row, a second charge
    against the cap); a replay of the same occurrence is a no-op. The sync's report of what the OS
    delivered goes to a journal before the ledger is replaced and leaves the journal only after
    the store confirmed the save; a fold that was lost (a failed save, the process killed between
    the two writes) is folded again next time. Absence from the pending set is the evidence a
    one-shot rang — not its time against the clock, which a clock set back would contradict.
    **Why:** a snoozed slot was re-offerable forever and never spent the cap; a lost fold reopened
    the budget; a clock rolled back rescheduled a notification the person had already seen.
41. **Budgets count what rang, by the tracking day the slot belongs to.** A per-habit "at most N
    a day" and the global cap are spent by deliveries, never by slots that went by undelivered
    (the phone was off); the weekly summary, cycle prompts and on-demand follow-ups are outside
    the cap; a response is stamped with the day the slot was planned for, not the day the button
    was pressed; a settled slot is skipped, not the end of the day's loop, so an active window
    that crosses the boundary still serves the next tracking day. **Why:** a missed morning used
    up the day's allowance, a tap on yesterday's notification spent today's cap, and night-owl
    hours after 3 am were never offered.
42. **A reminder policy is the person's to edit, for every habit; the presets only choose the
    starting point.** One editor (Off / Set times / Every so often, or the movement rotation; the
    daily limit; "only when behind") saves a normalised policy, and the card's words are rendered
    from the saved policy, never from preset copy. What a mode means is said where it is chosen
    (set times ring at their time even outside active hours; intervals stay inside them; all count
    toward the cap). **Why:** "configurable nudges" was a user constraint and a preset's 07:30
    could only be switched off, not moved; custom habits had no reminders at all.
43. **One display adapter per stored unit, used everywhere that unit appears.** Water is stored in
    ml and shown in the units setting by `formatHabitValue` / `habitAmountText` / `habitUnit` in
    rows, the detail header, the chart, the backfill strip, the rule text and the editor (which
    parses what it shows); an untouched value round-trips without drift. **Why:** the Today card
    said 8.5 oz while the row under it said 250 ml and Edit demanded millilitres.
44. **Every ring spends; the latest event only settles.** Per-habit budgets and the daily cap count
    every FIRED event of a slot as its own occurrence (`deliveriesOn`, keyed by `via ?? nudgeId`
    and time); the newest event per slot decides only whether the slot is settled or re-offerable.
    Taps and opens write nothing about delivery — the sync owns FIRED. **Why:** a slot that rang,
    was snoozed and rang again spent one of the budget; a tap's own FIRED raced the sync's and the
    monotonic dedupe that tried to reconcile them lost occurrences in simulation.
45. **One bookkeeping record, written before and after every change to the OS schedule, with
    intents.** `{ledger, journal, cancelling, scheduling}` under one key: the deliveries that are
    owed go down before anything can forget them, and what is about to be cancelled or scheduled
    is readable by the next sync if this one dies half-way. A dead sync's intents are resolved on
    the next read (cancelled and gone = not rung; scheduling and pending = ours; gone and overdue =
    rung; gone and still ahead = forgotten; the same id pending again = re-schedule). **Why:** a
    death between `cancelScheduledNotificationAsync` and the ledger write made the next sync read
    the cancelled alarm as delivered, or a scheduled one as not ours. "Gone and overdue = rung" is
    deliberate: a missed write-down causes a double ring, which is worse than a phantom count.
46. **Replacing the state replaces the bookkeeping.** Erase, restore and sample data are written
    with `TrackerStore.replace`, which clears the service records in the same SQLite transaction
    as the state (round 12; until then a `cancelAll({forget: true})` ran ahead of the re-plan, and
    a sync in flight could write the old record back). The provider bumps `replaceEpoch`, a
    dependency of the debounced re-plan, so the next sync starts from a clean slate: the old
    state's alarms are cancelled as not ours and the new plan is scheduled, even when the two plans
    read the same. Cancel-all is queued, never skipped for a newer sync. **Why:** the previous
    state's rings were folded into the new one as deliveries, and a skipped "reminders off" left
    alarms standing.
47. **A failed read of a record that gates a write is an error, not an empty record.** The
    notification service throws on a storage read failure; the sync gives up and is retried later.
    **Why:** `.catch(() => null)` on the ledger read made the write that followed forget every
    pending alarm (cancelled as not ours) and every delivery still owed.
48. **The card says what will happen, the editor says what was asked.** The Reminders card carries
    a "Next: today at 4:00 PM" line read off the actual plan (or the reason there is none: paused,
    off in Settings, done, nothing inside the horizon; a chosen weekday past the horizon is read off
    the policy). A paused schedule stays paused when edited; Save never resumes it. **Why:** the
    policy line promised 07:30 while the plan had skipped it, and saving an unchanged editor
    switched a paused reminder back on.
49. **Service records live in the state's database, beside the state.** The notification
    service's bookkeeping and the inbox of button presses are rows in the SQLite `kv` table
    (`TrackerStore.readRecord` / `writeRecord`, prefix `svc.`), not AsyncStorage: as durable
    as the state, cleared by `replace` in the same transaction, and written compare-and-set — a
    write that finds the record moved (a replace, a sync on another runtime) throws
    `SupersededError` and the sync starts over instead of overwriting. **Why:** two stores for
    one fact (the state in SQLite, what its alarms delivered in AsyncStorage) can only be erased
    or restored one at a time, and a sync in flight across the gap wrote the old record back.
50. **A button press is written down before it is applied, and marked handled only after the
    state write committed.** `beginHandling` puts the press (payload, action, the instant it
    arrived) into a durable inbox; `endHandling(committed)` marks it handled and drops it, or
    counts a failed try and keeps it. Whatever is still in the inbox is replayed at the next start
    of any runtime (the app once hydrated, the periodic re-plan) with the instant it was received,
    so the replay computes what the first attempt did; the command layer's own dedupe (nudge
    events written in the same transaction as the log; a snooze at exactly that instant) makes a
    second application a no-op. Five failed tries or 48 hours and the press is dropped. **Why:**
    Android hands a press to our task once and expo-task-manager keeps nothing durable; a process
    death between the press and the write lost the drink or the Done for good.
51. **A stored record is checked entry by entry; a damaged row is dropped, never fatal, and lists
    are capped.** Bookkeeping entries, journal rows, intents and inbox presses are validated field
    by field and bounded (1,000 records, 50 presses, 200 handled marks). **Why:** one bad row kept
    as-is would crash every later sync and stop reminders for good; an unbounded list would make
    every sync crawl.
52. **A refused OS call leaves its entry standing — and fails the sync.** A cancel the OS refused keeps
    its ledger entry (the alarm is still the OS's, a ring from it is counted, the next sync tries
    again); a schedule the OS refused is not written down. Either way the sync writes its honest
    ledger first and then throws (`OsRefusedError`), so the failure is visible — Settings →
    Reminders shows it, the scheduler retries a minute later and on the next foreground. **Why:**
    dropping the entry made that ring unaccountable, and a sync that swallowed the refusal
    reported success, so nothing retried and the reminder never rang.
53. **A record's version moves with every replace, present or not.** `readRecord` returns a version
    (the replace generation plus the text); `writeRecord` compares that, not the text alone. **Why:**
    a sync that read "no record yet", was overtaken by an erase / restore, and then wrote with
    "expected: nothing" passed the compare and revived the dead state's schedule and deliveries.
54. **Nothing of the old state's record is folded into a replacement.** A re-plan waits until the
    replace is in the database (`replacePending`), and a re-plan already in flight is fenced on
    the replace counter (`replaceSeq`): a fold conceived before the replace is refused after it
    and the re-plan starts over. **Why:** between the replace on screen and its commit the database
    (and the deliveries journal beside it) still belong to the old state; a fold in that window
    charged the new state for rings it never scheduled.
55. **The press that launched the app is cleared only once it is in the inbox.** `launchResponse`
    reads without clearing; `clearLaunchResponse` runs after `beginHandling` wrote the press down.
    **Why:** clearing first lost the press to a death in between; reading it twice is harmless
    (the inbox dedupes by key).
56. **Nothing is presented above the app lock.** The gate publishes its state (`lockState`); every
    Sheet renders its Modal only while unlocked and appears once the gate is down. **Why:** a deep
    link (`daily-tracker://habits?preset=…`) opened a Sheet while the gate was up, and Android
    stacks a later Dialog above an earlier one — the lock showed what it was meant to hide.
57. **An id from outside the table is looked up with `hasOwnProperty`.** `presetById` answers for
    real presets only; a deep link's or a backup's `presetId` never reaches a plain index. **Why:**
    `PRESET_BY_ID['__proto__']` returned `Object.prototype`, which rendered as a preset and threw
    in the evidence block — a crash on demand from any app on the phone.
58. **What was logged is a list of records, each removable on its own.** The habit page's "Logged"
    card lists the records behind the figures (drinks, snacks, sessions, entries) with where each
    came from, today by default and the last seven days on request; Remove takes off exactly that
    record. Records another app owns (Health Connect) are listed, not removable — the next read
    would bring them back. Older days are fixed through a month picker ("Fix an older day"), which
    sets the day's total (or flips a yes/no day in place). **Why:** a drink logged twice from the
    widget or squats counted from the wrong reminder were only correctable by rewriting the day's
    total, which erased the time and origin of everything else that day.
59. **A retired provider writes nothing more.** The save loop is a `SaveQueue` owned by one
    provider for one life; unmounting (the error boundary's reset mounts a new provider) or loading
    again retires it: no retry fires, no pass starts, waiters get false, and a write already in
    flight is the last. **Why:** a failed save's retry timer outlived the provider that scheduled
    it and put old rows back after the new provider's erase (reproduced in a probe); serialising
    transactions does not decide who may write — ownership does.
60. **A failed load is not "ready".** When the database cannot be opened at start the layout shows
    why and offers "Try again"; nothing renders, no writer is registered, and the reminder scheduler
    and widget sync stay off. **Why:** the empty placeholder read as a fresh install, accepted
    memory-only edits, and its empty plan would cancel every real reminder on the next sync.
61. **Follow-ups after a write go by what is on disk.** The widget redraw and the backup snapshot
    after a notification press use the committed state, and only when the write persisted; the
    hourly snapshot waits for the pending commit and snapshots the committed state. **Why:** a
    drink whose save gave up appeared on the widget and could enter Auto Backup while the app's
    own database did not have it (paradigm 18 applied to every follow-up, not only the widget tap).
62. **A duplicate claim is answered after the first claim's durable write.** `ClaimGate` holds a
    second caller for the same press key until the first inbox write settles, so a false always
    means "written down or handled" — the caller that discards the OS's copy of a launch press
    relies on it; a failed write releases the claim to the next caller. **Why:** the foreground
    listener and the launch handler met on one key and the launch copy was cleared while the inbox
    write was still in flight (paradigm 55's window, one step further in).
63. **The pinned cards are the person's list; a card still needs its data.** `Settings.pinned` holds
    the order and membership (sanitised on read: known ids once, cycle always present); Today renders
    the list filtered by what exists — the Water habit, a movement habit, Mind, cycle tracking plus
    its own switch, Health Connect data for Steps and Sleep (an opted-in card without data is a door
    to the Body tab). **Why:** the list says what is wanted, the screen adds what exists; neither
    side invents a "0 of 0" card or hides a card the person asked for without saying where its data
    comes from.
64. **A picker computes for the days it shows.** The month picker asks `ratiosFor(days)` for the
    month on screen instead of reading the heatmap's 26-week strip. **Why:** months beyond the strip
    rendered every day blank although the days had logs.
65. **Fills that carry text are measured, not assumed.** The ink on a solid disc is the theme colour
    (text or background) with the higher contrast, and the fill moves lighter or darker in OKLCH
    until the pair reaches 4.5:1 (`readableFill`); partial days are rings so the number stays on the
    surface. A test holds this for every category colour in both themes. **Why:** the light theme's
    teal carries neither near-black nor white at AA as it is.
66. **A snapshot holds the committed state, vetoed by the newest intent.** `committedSource(view)`
    (`src/services/snapshotSync.ts`) is the one source every running-app snapshot reads from: what
    the database has — never a change whose save is pending or gave up — unless the newest state
    says there should be no backup (opt-out, erase) or a whole-state replace is pending, in which
    case nothing is written. **Why:** the committed state still said "backup on" after an opt-out
    whose save failed, and the hourly refresh re-created the copy the opt-out had deleted; consent
    is withdrawn at the tap, not at the commit.
67. **Requestability is not denial.** On Android 13+ Expo answers "denied" whenever notifications
    are not enabled, which on a fresh install means only that POST_NOTIFICATIONS was never asked
    for. The runtime permission is read on its own (`classifyPermission`): not granted and still
    askable → ask; granted at the system level but switched off in the app's settings → blocked.
    **Why:** every new install read as "blocked" and never saw the Allow button.
68. **Undo restores the exact records.** Remove and Clear day hand back the `LogRecord`s they took
    (`dayRecords` is the one rule the reducer, the activity list and Undo share); `RESTORE_LOGS`
    appends them again — same ids, times and origins — skipping any already present or whose habit
    is gone, capped at 1000; the toast is hidden when the whole state is replaced. **Why:** a
    re-logged record is a new one logged now; a removed 9 am drink should come back at 9 am.
69. **Memo boundaries follow what is read, not where it lives.** A habit's view compares its own
    rules and policy, not the tables; the plan compares the slices the planner reads, not the state
    identity; the Today cards are built on demand; a snapshot file this process wrote is not parsed
    again before the next refresh. **Why:** the perf lens measured one reminder edit rebuilding all
    twelve views (56 ms), a Health Connect read re-planning (17 ms), hidden cards scanning two years
    of drinks, and the hourly refresh spending ~160 ms of main-thread parsing on a two-year backup.
70. **The week's first day is a parameter whose zero is Monday.** `weekStartIndex` turns the setting
    into a trailing numeric argument (Monday 0, Sunday 6) that every period bound, quota, grid and
    summary computation takes, defaulting to 0, so nothing moves until the setting is changed; the
    stored weekday encoding stays Monday = 0 — only the order things are shown and bounded in
    rotates. The weekly summary rings on the week's last day (Saturday for Sunday-first weeks).
    **Why:** most of the US counts from Sunday; a setting that changed the encoding would have
    re-dated every stored weekday choice and summary day.
71. **Undo keeps the logging precedence.** A manual record restored replaces the Health Connect
    fill of its habit-day, as logging by hand does — paradigm 68's "append" is qualified by it.
    **Why:** a sync can land inside the Undo window; the day would have counted both.
72. **A snapshot file is known by its stamp, not its clock.** The file this process wrote or found
    readable is identified by write time and size; a same-second rewrite by another process (a
    restore from a newer app) is still re-checked. **Why:** a one-second clock alone could pass a
    foreign file as ours; a digest was judged a cost for a corner.
73. **Countdowns are real minutes; windows are wall-clock.** The Today card places its anchors
    (the last snack, the snooze) by minutes elapsed from now and reports the wait the same way;
    the active hours stay the clock times they mean. **Why:** on the autumn night the clock shows
    01:45 twice, and a snooze "until 01:45" taken at the first read as due.
74. **Budgets move on what was kept.** The planner charges a habit's daily budget and advances
    the rotation only for a candidate it placed; one dropped as a duplicate identifier (the repeated
    hour) or as unplaceable costs nothing. **Why:** two dropped slots cost two of a budget of eight
    and the 03:30 reminder on a 25-hour night; the rotation skipped a habit's turn.
75. **A body record keeps the clock it was recorded on.** A night stores the UTC offsets it was
    slept at (the recorder's from Health Connect when present, else the phone's at import); its
    calendar square, its clock on the Body screens and the bedtime spread read in them, and a
    reread with the same times keeps the first placing. Nights imported before the field read in
    the current zone, as they did. **Why:** a reread after a trip re-dated nights by id, and a
    steady 23:00 bedtime read as irregular in the new zone.
76. **A headless tap is durable before it is slow.** The widget's headless writer persists the tap,
    then re-plans and persists the fold as a second diff under the same lock. The widget library
    grants 30 seconds and reports a timeout as success; a tap has no identity to replay by (a second
    drink is a real second drink), so it is saved early rather than journaled like a press. **Why:**
    the tap used to wait for the lock, the load and the whole re-plan before it reached disk.
77. **Once the person's intent is on disk, nothing after it may unsay it.** A headless step that
    fails after the tap was persisted (the revision, the re-plan, the fold's second persist) logs
    and moves on; the widget draws the saved number and never shows "could not be saved" for a tap
    that was. The notice is for the one failure that matters to the person — the first persist.
    **Why:** a failed second persist redrew the old number with the notice, and the person logged
    the drink again (ADV16-01).
78. **A memo's dependency list is written from the callee's reads, not the caller's intuition.**
    When a selector memoises on "the slices it reads", every setting the code under it consults is
    a dependency too — the week start reached `habitRatios` through `periodBounds` while the cycle
    insights' memo listed only the logs. The test for a new setting includes "does every memo that
    can see it recompute?" **Why:** the correlations stayed on Monday weeks after the switch
    (ADV16-02).
79. **One editor per concept, embedded where the concept first comes up.** The reminder schedule
    has one form (`ReminderPolicyForm`) and one builder (`policyFromDraft`); the creation sheet
    embeds the form, the habit page's sheet wraps it. A reminder set while creating a habit is
    therefore exactly the one the page would have saved, and a later change to either shows up in
    both. **Why:** a chained second sheet and a duplicated mini-form were both considered and
    rejected — the first interrupts, the second drifts.
80. **A simulator that found a real bug is promoted into the suite.** The round-12 randomised
    phone (saves that fail, processes that die, replies, a clock rolled back) lived in `/tmp` and
    only printed a summary; it now runs under `node --test` with a smaller sequence count and
    fails the suite on any invariant breach, reporting the seed and the last steps (`tests/
    nudgeSim.test.ts`; `NUDGE_SIM_SEQUENCES=200` for the full run). **Why:** the test-audit lens
    found that mutants the simulator would have caught passed the suite.
81. **A lifetime is a token, and it travels with the work to the last external boundary.** A
    component or provider that can be retired while its asynchronous work is in flight (an
    error-boundary reset, the dev-time effect replay, a retry after a failed load) gives that work
    a token of the life that started it — a fresh object per effect setup, a queue per hydration —
    and the work re-checks the token after every await, up to and including the call that changes
    the OS (`still` in `reconcileAndSync` → `syncStateToOs` → `syncPlan`, read again after the OS
    was read and before the first write). A boolean "alive" flag is not enough: the effect replay
    leaves it false for good, and a check at the start of the work misses the awaits after it.
    **Why:** LIFE18-2/5/6 — a retired scheduler's sync, queued behind its replacement's cancel-all,
    set the old alarms back; the boolean fix broke every sync under StrictMode.
82. **Registration and unregistration share one lifetime, and teardown is by identity.** Whatever
    registers a live object in a module-level slot (the live store) keeps the instance it
    registered and clears the slot only if it still holds that instance; a replacement that
    registered in between is left alone. The registering effect and the clearing cleanup are the
    same effect, never two. **Why:** LIFE18-1 — a provider whose first hydrated render threw stayed
    registered as the writer, and widget taps were handed to a dead provider.
83. **A live handle says whether its owner is alive, and a retired owner saves nothing.**
    `LiveStore.alive()` is bound to the hydration's queue; `apply` on a retired provider returns
    `persisted: false` without publishing, so headless callers fall back to their own path or keep
    the press for a replay, and `replanLive` stops short of the OS. **Why:** LIFE18-7 — the replace
    counter alone did not move when the provider went away.
84. **Serialise the pair, and let the newest request win.** Two operations on one OS object
    (schedule the bell / cancel the bell) go through one queue with a generation counter; an
    operation superseded while it waited (or while its own first await ran) does nothing. **Why:**
    LIFE18-3 — a cancel finished before the schedule it was meant to undo, and the discarded
    session's bell rang.
85. **Copy is audited by someone who did not write it, against the screen.** A browser-driving
    tester reads every string in context and reports jargon, fragments, mixed units and
    inconsistent names; the fixes keep the product's own terms (pace check, streak freeze) but
    explain them once where they appear. **Why:** round 18's audit found "Snooze 10", "At most, a
    day", "Flow", "front-load" and "Open source:" — all clear to the author, none to a reader.
86. **Accessibility state goes through the `aria-*` props.** `aria-checked`, `aria-selected`,
    `aria-disabled` (React Native maps them to `accessibilityState` on Android); never the
    `accessibilityState` object. **Why:** react-native-web 0.21 dropped `accessibilityState`, so the
    web preview — and the browser-driving tester, and any web build — exposed no checked / selected
    / disabled state at all: the day letters read as unchecked while drawn on (fresh-install
    journey, round 19).
87. **A preset is added with its reminder in view.** The Library sheet shows the preset's schedule
    with Change, which unfolds the one reminder editor (paradigm 79) pre-filled with the preset's
    times; Add stores exactly what the summary said (`presetHabitAction`). Collapsed by default,
    so the fast path stays one tap; on-demand presets (EVENT) show no editor and keep their
    trigger whatever is passed. **Why:** the strength / stair presets rang every day until the
    weekly quota was in, and the days could only be chosen after adding — the last creation-time
    gap in the backlog. An archived preset added again comes back with its history and takes the
    chosen reminder (`restorePresetActions`); untouched, it keeps the schedule it had.
88. **Nothing is not a highlight.** A summary that would read "0 of the last 7 days" over a week
    with no data — and a previous week with none — is left out; a week that went from something to
    nothing is said plainly ("No water logged in the last 7 days"). Empty states say what is
    missing and what to do, never a fraction over history that does not exist. **Why:** the
    fresh-install journey read "You logged water 0 of the last 7 days" as history on day one.
89. **The clock format is threaded explicitly, like units.** `formatClock(minute, clock)` takes the
    format every time; the provider resolves it once (`resolveClockFormat`: Settings → Time format,
    or the phone's own 24-hour switch read at the platform boundary in `services/deviceClock.ts`,
    refreshed on every foreground) and `useClockFormat()` hands it to the screens; `PolicyContext`
    and `nextRingText` carry it so the domain's sentences follow it too. Never a module-level
    default: tab screens stay mounted and their memoised strings would go stale. **Why:** every
    time in the app was "9:30 PM" whatever the phone said (locale lens, round 20); the units
    setting had already shown that an explicit parameter is the only way tsc finds every writer.
90. **A typed number is read from every keyboard.** `parseDecimalInput` folds Arabic-Indic and
    Persian digits and marks, treats a space between digit groups as grouping, reads a lone
    separator before exactly three digits as thousands ("2.000" is 2,000 ml, "1,5" is 1.5) and the
    last of two kinds as the decimal; a second separator of the same kind is nothing yet (null —
    the stepper keeps its value) rather than a guess. **Why:** a decimal-comma keyboard's "1,5" read
    as 15, and "1.250.0" on the way to "1.250.000" made the value jump keystroke by keystroke.
91. **Key derivation yields.** The export and unlock screens use `encryptBackupAsync` /
    `decryptBackupAsync` (noble's `pbkdf2Async`, which gives the event loop a turn every few
    milliseconds); the synchronous forms stay for tests and tools and read the same files. **Why:**
    200,000 PBKDF2 rounds blocked the JavaScript thread for seconds on a phone — the busy label froze
    and Cancel queued behind it (performance lens, round 20).
92. **No figure is written into a string at authoring time.** A preset's texts carry their volumes
    and clock times as tokens (`{2000}`, `{19:00}`) that `presetText(text, units, clock)` writes in
    the units setting and the time format; a row's reminder hint comes from the habit's own policy
    (`shortPolicyText`), never from the preset it was made from. **Why:** the "second week" journey
    found "2,000 ml a day" and "2,700 ml (women)" under ounces, and Today's rows said "At 7:30 AM"
    under the 24-hour clock — and said it for a reminder the person had long since changed.
93. **A result that outlives its request is dropped.** A sheet that awaits something (the unlock's
    key derivation) keeps a request token; Cancel, a new file and an unmount retire it, and a retired
    request's result — a state to replace everything with, an error — is thrown away instead of
    shown. One derivation at a time: the keyboard's submit checks the same in-flight flag the
    disabled button stands for. **Why:** the round-21 diff review ran the real close / unlock
    handlers with a deferred derivation: close, then the derivation resolved, and `onUnlocked` still
    fired — the "replace everything?" confirmation reappeared after the person had cancelled.
94. **Anything that indexes a list is a whole, non-negative number at the import boundary and
    again where it is used.** The rotation offset a backup carries is validated as one, and the
    planner normalises the sum it indexes with (`Number.isSafeInteger` and `>= 0`, else 0).
    **Why:** the security lens built a file with `offset: 0.5` that passed `inspectExport` and made
    `nudgePlan` throw on `undefined.id` at render time — the restored state was unusable for the day.
95. **The person can test a reminder before trusting a day of them.** Settings → Reminders → Test
    schedules one ring a minute out on the real channel and trigger (`TEST_RING_ID`, outside the
    plan and the ledger: the sync and "reminders off" leave it standing, its payload names no nudge,
    so a tap logs nothing), says "lock the phone now", and after the due minute and a grace asks
    whether it came; "No" lists the checks in the order that finds the cause (notifications and the
    channel, battery Unrestricted, Alarms & reminders, Do Not Disturb). **Why:** nothing native has
    run on hardware yet; a friend's first question will be "do reminders arrive on my phone?", and
    a forecast label cannot answer it — only a ring on a locked screen can.
96. **A count asks each day about itself.** "Days met" counts days whose own value met the day's
    target (`daysMet`), never days whose period reads complete: a weekly habit's `ratio` carries
    the week's accumulated progress, and one Monday session reads 1.0 all week. The category rings
    ask the same way (`askedToday`): a weekly or monthly habit whose quota is met owes nothing on a
    day not started, for Mind as for Movement. **Why:** the statistics lens found "7 days met" for
    one session, and a Mind ring empty on Tuesday for a meditation done once a week on Monday.
97. **A label says what the number spans.** A weight difference is written "over 35 days", "over
    4 months" or "since Jan 2025" from the reference reading's real date (`weightSpanText`), never
    "over 30 days" for whatever reading lay beyond the cutoff; durations round to whole minutes
    before the hours split off ("8h", not "7h 60m"). **Why:** the same lens built two readings 669
    days apart and read "−10.0 kg over 30 days".
98. **Pace runs on the tracking day's clock.** Between midnight and the 3 am boundary the day being
    summarised has had its whole active window, so the expected intake is the goal — the minutes
    are counted into the tracking day (`+ 24 h` once the calendar day has turned), not read off a
    new morning's zero. **Why:** at 23:59 the card said "1,750 ml behind"; at 00:00, with the same
    records and the same day, "on pace".
99. **What a screen reader can reach, name and land on.** Real screen and section titles are
    headings (`Txt heading`), a sheet is a dialog named by its title that TalkBack lands on when it
    presents (the scrim is out of the focus order), repeated actions carry what they act on ("Remove
    250 ml entry at 9:30 AM", "Log 5 minutes of breathing"), every tappable thing reaches 48 dp
    with slop, the primary action of a row keeps a readable width (the rest wrap under it on a
    narrow phone), and the rings card stacks under 360 dp. **Why:** the accessibility lens at
    320 × 568 found zero headings, an unnamed dialog that focused Close, "D…" for Done now, every
    legend total truncated, and four removal buttons that read alike.

### How council findings are judged
- Accept when: evidence is concrete (file:line, reproducible), it violates a paradigm or a user constraint,
  or it would break on a real phone. Severity drives order: data loss / crash / privacy > wrong behaviour >
  inconsistency > polish.
- Reject (and log why) when: it contradicts a user constraint (e.g. "dark must stay default", "widget =
  any habit"), it is a taste change with no evidence, or the cost is a risky migration for a cosmetic gain.
- Defer when: it needs the user (naming, pricing, Play Store), or hardware (device-only).

## 5. Journal (step by step)

Dates are America/New_York. Commits are on `main`.

| When | What | Where |
|---|---|---|
| 2026-10-25 | Docs first: README, implementation plan (M0–M6), design system, habit library, project rules; Cadence (Kotlin) spec imported as reference | `05263cf`, `c824177` |
| 2026-10-25 | **M0** Expo skeleton: tokens, tabs, habit detail, sample data, domain tests | `129399d` |
| 2026-10-25 | **M1** SQLite store with hand-written migrations (node:sqlite in tests), streak engine with freezes, habit editor, backfill, onboarding, export/import | `a955920` |
| 2026-10-25 | **M2** nudge planner (pure) + notifications service (channels, categories, OS diff-sync), Sugar Shield, Craft habits; headless response task | `d4d2771` |
| 2026-10-26 | Expo Go on Android fixed: optional FCM topic module (pnpm patch), self-importing `.native` module removed | `bc02684` |
| 2026-10-26 | **M3** resizable home-screen widget (any habit, max 3) with one-tap logging through the shared command layer; laptop build recipe; device checklist | `62ef5a6`, `4910d4f` |
| 2026-10-26 | **M4** Health Connect import (steps, sleep, exercise, heart rate, weight, hydration) + Body tab; manual-beats-automatic merge | `c9b86cc` |
| 2026-10-26 | **M5** opt-in cycle tracking: phases, calendar, day logs, reminders (private channel, discreet mode), insights | `f21e379`, tag `v0.5` |
| 2026-10-26 | **M6** light/system theme, font-scale caps, reduce-motion, app lock, encrypted export (PBKDF2+AES-GCM), Auto Backup snapshot + restore prompt, release-signing plugin, 170 tests | `d5b9251`, tag `v0.6` |
| 2026-10-26 night | User went to sleep with the standing instruction: run an adversarial council loop, fix, test end to end, keep pushing, maintain this file and a plain-language phone guide, ask nothing. Wrote `docs/GET_IT_ON_YOUR_PHONE.md` and this file; README refreshed (it still described Drizzle/Vitest/npm) | `980295f` |
| 2026-10-26 night | **Council round 1** — five read-only reviewers (Android runtime, data integrity, UX, security/privacy, release/docs) plus a browser-driving end-to-end tester over the web preview with sample data. 40-odd findings; triage in §6 | — |
| 2026-10-26 night | **Round-1 fixes, batch A (data/runtime/security):** import validation of every record list (`src/data/validate.ts`, version check, settings sanitised key-by-key); encrypted-backup envelope bounds checked before any key derivation; import size cap; one serialised SQLite connection; headless writes bump a revision counter instead of a read-then-clear flag; notification "handled" keys queued and reversible; provider flush/retry loop for failed persists; Auto Backup snapshot rules rewritten (`cloudBackup` on by default, nothing before onboarding, seeded Water alone does not count); export cache purged; nudge completion checks today's raw value (a weekly habit could not be logged twice… or at all); YES_NO from a nudge adds an entry; Health Connect owns the step total (`SET_AUTO_ENTRY` evicts every non-manual row; steps are never logged by widget/notification); over-cap Health Connect reads are reported as an error rather than silently truncated; timer-bell sessions are filed under the day they ended; weekly/monthly ratios count from the real period start; app lock states `ready / none / error` with screen-capture protection; backup rules split per Android version (9–11 client-side-encryption only, 12+ extraction rules, 8.x none); release builds print a Gradle warning when signed with the public debug key; `expo-crypto` randomness; unused native deps removed (image picker, location, blur, glass effect, symbols, image, zod…) | this commit |
| 2026-10-26 night | **Round-1 fixes, batch B (UX/e2e):** Sugar Shield reachable from Today, the quick-log sheet and its habit page even when the shield habit is not added; stale "arrives in the next milestone" nudge copy replaced; backfill copy explains days before the habit existed; pinned habits first on Today; Archived section with Restore in the Library; cycle day sheet keeps the draft when a period button is tapped and confirms "Remove this period"; sample-data chip on every tab; 48 dp touch targets via hitSlop; meditation Finish says what it will log (and that < 1 min is not logged); onboarding step 5 asks for notification permission with an honest explanation; chart range labels 7D/2W/1M/6M/1Y; charts expose a spoken summary | this commit |
| 2026-10-26 night | **Workspace:** removed the 20 darwin/win32 `'-'` overrides from `pnpm-workspace.yaml` so `pnpm install` on a Mac/Windows laptop gets esbuild/lightningcss/rollup binaries (the user builds there); lockfile regenerated, all packages now share `@types/react` 19.2.18; root `preinstall` is a Node script (works on Windows). pnpm left a stale hoist after the version change — fix recorded in `.agents/memory/expo-workspace-quirks.md` | this commit |
| 2026-10-26 night | Verification for the two batches: tsc clean, 185 tests, Android Metro bundle 200, Hermes compile, `expo export` (release bundle 5.8 MB hbc), `expo prebuild` → `res/xml-v28/backup_rules.xml` with `clientSideEncryption`, Gradle `logger.warn`, no camera/location permissions in the manifest | this commit |

| 2026-10-26 night | **Council round 2** — six reviewers over the round-1 result (Android runtime, data integrity, UX, security/privacy, release/docs, and the browser end-to-end tester). 34 findings; triage in §6. The e2e tester's run caught one transient error that was my own mid-edit planner race (not a product bug) | — |
| 2026-10-26 night | **Round-2 fixes:** headless writers serialised behind one in-process lock (widget tap + notification button at the same moment); notification "handled" mark split into an in-memory claim and a durable mark written only after the state commit; the running app re-checks for headless writes on every 30 s tick, 4 s after foregrounding, and immediately when the write happens on its own runtime, and never hydrates over unsaved changes; the Auto Backup snapshot is refreshed by headless writes and the 3-hourly task (widget-only phones were never backed up); overdue-but-pending alarms get a 30-minute grace instead of being cancelled and charged to the cap; import validation gained numeric bounds and duplicate-key rejection; settings ranges; `excluded` periods survive a round trip; streak engine judges each day by that day's target; Health Connect reconciles upstream deletions/edits (mirrors, strength ticks, imported drinks) for complete reads and reads a second step aggregate on tracking-day boundaries; water goal edits update the Water rule; the quick-amount sheet keeps an untouched prefill exact across ml/oz; water card uses the planner's half-tap tolerance; Sugar Shield only promises a reminder when it can deliver one; notification taps route cycle/summary/event nudges sensibly; meditation timer asks before Back discards a session (and the Finish label no longer overflows at large font sizes); more 48 dp targets; heatmap speaks a summary and marks complete days with a dot; export scratch files get a random tag and the import size check reads the real file; onboarding gained a "Phone backup" step; the laptop guides fixed on five points (NDK/CMake, the public debug key, one keystore password, full APK path, split `git pull` / `pnpm install`) | this commit |
| 2026-10-26 night | Verification: tsc clean in all three packages, 200 tests (15 new in `tests/round2.test.ts`), Android Metro bundle 200 (12.5 MB dev), `expo export --platform android` → 5.8 MB Hermes bytecode, web preview renders. Prebuild not repeated (no plugin or manifest change this round) | this commit |

| 2026-10-26 night | **Council round 3** — the same six lenses re-read the round-2 result (new reviewer sessions). 37 findings, 22 of them high; triage in §6. Theme: the round-2 fixes closed the headless/foreground races at the file level but not at the decision level (stale state, generations, payload shape), plus input limits that only the importer enforced | — |
| 2026-10-26 night | **Round-3 fixes:** notification responses parsed from the raw Android bundle (`dataString`) as well as the mapped shape; a live-store registry makes the running app the single writer for widget taps, notification buttons and background re-plans (no more load → decide → save against a stale database while the UI holds unsaved changes); dispatch generations guard reloads, the "handled" mark (`commitPending()`), snapshots (state getter, never a DB reload — fixes resurrecting an erased snapshot) and Health Connect results; schedule sync and cancel-all serialised with a generation so a late sync cannot restore cancelled alarms; only accepted schedules enter the ledger; widget task awaits its snapshot. Data: WATER became its own ledger kind so a replay of the drink button on a merged nudge is a no-op; step totals, strength ticks (including a workout *moved* to another day) and heart rows follow upstream deletions on complete reads; monthly quota capped at the month's length; paused slots no longer spend the daily budget; strict `HH:MM` for fixed times (bad ones skipped, never NaN); body sync metadata sanitised on import; input caps at every writer (amount ≤ 1,000,000, notes/names/units capped, water target 100–20,000 ml, goal↔rule sync clamps the same way and no longer activates a pending cadence change early). UX: meditation timer pauses while its leave dialog is open and logs once; Sugar Shield re-reads notification permission on return from Settings; habit editor target row wraps; heatmap dot at ≥ 5 dp cells, legend wraps; backup switch no longer pushed offscreen; onboarding privacy copy matches the backup disclosure. Privacy: cycle notifications discreet by default; "Start fresh" deletes the declined snapshot; abandoned document-picker copies purged at start-up and on erase; web export name gets the same random tag. Docs: Mac `EACCES` path, PowerShell variants of the signing recipe, explicit working directory per block, NFKC in the Python decrypt recipe, 3 am boundary rows in the checklist, equal-versionCode wording, RN 0.86. Version → `0.7.0` / `versionCode 7` | this commit, tag `v0.7` |
| 2026-10-26 night | Verification: tsc clean in all three packages, 215 tests (15 new in `tests/round3.test.ts`), Android Metro bundle 200 (12.5 MB dev), `expo export --platform android`, web preview renders | this commit |
| 2026-10-26 morning | **Council round 4** — six lenses over the round-3 result (new sessions). 30-odd findings; triage in §6. Theme: the single-writer design was right but its decisions still read React's *rendered* state (one render behind its own dispatches), a no-op dispatch could hang a waiter, and the live headless paths skipped the re-plan/widget/snapshot the database paths did | — |
| 2026-10-26 morning | **Round-4 fixes:** provider rewritten around a synchronous newest-state ref + `publish` (generation only on a real change) + `apply(builder)`; every command path (actions, notification listener, widget tap, background re-plan, Health Connect sync) decides against that ref; live headless paths now re-plan, redraw the widget and snapshot before resolving; a shared body epoch cancels Health Connect reads across disconnect / remove / erase / restore from any screen; headless snapshot getters stand down when the app came alive; notification payloads validated field by field (prototype keys, bounds, shapes); WATER on a re-offered slot logs again once its snooze ran out; symptom severities / flow / mood validated on import; heart reads covering one permission keep the other's values; water goal mirrored from the editor side through one `syncWaterGoal`; prorated period quota shared by streak, card, charts and planner; app lock engages the moment it is enabled (toggle or restore); a foreground timer logs the instant it really ended (day boundary); Sugar Shield finish is single-shot; stepper snaps to its grid, 48 dp rows, shrinkable value; chips wrap; sheets keep taps with the keyboard up and skip the slide under reduce-motion; light-theme green/gold inks ≥ 4.5:1; oz hint shows the cap in oz; build guide (PowerShell 5 `&&`, first-clone vs later-build, Windows keystore path, build-tools filter) and checklist (R1 step 6, discreet default in C1–C3, R11 path, rows T1–T10) | this commit |
| 2026-10-26 morning | Verification: tsc clean in all three packages, 231 tests (16 new in `tests/round4.test.ts`), Android Metro bundle 200 (12.5 MB dev), `expo export --platform android` → 5.9 MB Hermes bytecode, web preview renders (Settings) | this commit |
| 2026-10-26 midday | **Council round 5** — five lenses (Android runtime, data, UX, security, release) over the round-4 result plus a cycle-flow e2e run. Theme: the round-4 proration formula was shared but fed the wrong start day after a cadence change; the timer bell's own payload failed the stricter parser; the live-store hand-over still had a window between a headless job's "app not alive" check and its write. Triage in §6 | — |
| 2026-10-26 midday | **Round-5 fixes:** `parsePayload` accepts the timer bell's empty day (only for `MIND_END`) and the bell is built by the same `mindEndPayload()` the parser is tested against; one `mindSessionExists()` dedupe (60 s on the start instant) for the bell and the screen's own log; cadence segments — `segmentStartOn()` replays the streak's walk, and the card, charts, planner and widget prorate from the segment start instead of the creation day (a weekly habit turned monthly is no longer asked for the whole month's quota in its first partial month); the provider loads and registers the live store under the headless lock and headless jobs re-check for a live store after their re-plan await, before writing; `commitPending()` kicks one more save when the retry budget was already spent; Health Connect reads are single-flight with a watermark that never moves backwards; the app-lock gate locks during render (no unlocked frame) with no modal fade; BackfillStrip judges each day against its own rule; the stepper's number is tappable to type (bounded, no grid snap); the breathing circle resumes mid-phase and the phase label is a live region; a closed period's end can be moved from the day sheet (extend or shorten) and future days explain themselves; cycle calendar cells ≈46 dp; `docs/BUILD_ANDROID.md` restored after a round-4 text-splice corruption (a `$'` in a replacement string) | this commit |
| 2026-10-26 midday | Verification: tsc clean ×3, 245 tests (14 new in `tests/round5.test.ts`), Android Metro bundle 200 (12.8 MB dev), `expo export --platform android` → 5.9 MB Hermes bytecode, web screenshot (Mind); e2e tester over the cycle sheet, the mind timer, the typed stepper, the cadence change and the Library (results in §6 Round 5) | this commit |

| 2026-10-26 afternoon | **Council round 6** — five new lenses (time/DST/calendar arithmetic, first-build/release, accessibility, upgrade/data-migration, scale/performance) over the round-5 result. Theme: the planner reasoned in calendar days where the user lives in tracking days; the Auto Backup lifecycle had two unrecoverable moments; typed input trusted blur ordering and the stored unit; four palette tokens missed AA; one water tap recomputed every habit's lifetime. Triage in §6 | — |
| 2026-10-26 afternoon | **Round-6 fixes:** `instantOf` DST-gap fix; planner tracking-day slot checks (`boundaryHour`), duplicate-minute dedupe, terminal-event ranking, orphan one-off events skipped (`eventHabitIds`), plan cache keyed on day and zone; archive/delete drop a habit's scheduled events; `LOG_SNACKS` bulk action with a 100-snack ceiling in the sheet and at the command boundary; heart history counts as data worth backing up; unreadable snapshots set aside (`snapshot.kept.json`) with onboarding and Settings cards; durable cleanup marker for erase / opt-out; `habitView` cached per state, cadence segments cached per rule history, cycle insights keyed on their inputs with an empty fast path; stepper applies each keystroke (Save right after typing keeps the value) and takes a `parse` so the water goal is typed in the unit shown (`parseVolumeInput`); tertiary inks and the light primary green moved to ≥ 4.5:1 (contrast regression test over `constants/colors.ts`); font-scale caps raised (callout/caption 2×, title2 1.8×, title1 1.6×); widget rings and names labelled for TalkBack; Health Connect privacy rationale: `plugins/withHealthRationale.js` adds `HealthRationaleActivity` (both rationale intents → `daily-tracker://health-privacy`) and `app/health-privacy.tsx`; `SYSTEM_ALERT_WINDOW` removed from release builds (`blockedPermissions`; the debug source set keeps it); guides: Play Protect vs unknown-source prompts, properties-file escaping and the `ORG_GRADLE_PROJECT_*` alternative, version table; checklist H2 tightened, rows V1–V11; version 0.10.0 / versionCode 10 | this commit |
| 2026-10-26 afternoon | Verification: tsc clean, 269 tests (24 new in `tests/round6.test.ts`), Android Metro bundle 200 (12.9 MB dev), `expo prebuild` in a scratch copy: manifest shows the rationale activity, the retargeted alias, no rationale filter on MainActivity, `SYSTEM_ALERT_WINDOW` with `tools:node="remove"`; the Kotlin trampoline generated | this commit |

| 2026-10-26 evening | **Council round 7** — five lenses (Android platform sources, resilience / failure injection, code quality with a React Compiler probe, attack surface with scripted payloads, product copy and flows) over the round-6 result, plus a browser e2e pass. Theme: two library defaults nobody had read (a network constraint on background work; exact alarms silently off on Android 14+), four places that trusted a finite number to be a sane one, and privacy copy that the backup setting made false. Triage in §6 | — |
| 2026-10-26 evening | **Round-7 fixes:** pnpm patch on `expo-background-task` (background work needs no network); `modules/exact-alarms` + `exactAlarmsAllowed()` / `openExactAlarmSettings()` (per-app intent via expo-intent-launcher), Reminders card status line and button, capability folded into the ledger signature, bell re-armed on foreground; Sheet bounded to the window height; `isInstantMs` / `isCalendarDay` on every imported timestamp and day, `projectRecords` strips unknown fields on import, `parsePayload` bounds `mind.startAt`, `isOwnTrigger` ignores a response whose trigger is not our date trigger (forged push responses); BODY_SYNC errors from the background job reach the card; NudgeScheduler derives its command context from the newest state and one captured instant; the mind screen cancels only a bell it set and reports a bell it could not set; BackupCard's "try to restore" waits for the write to commit before forgetting the kept copy; onboarding offers any snapshot with user data and confirms before deleting one; Quick Log shares `MAX_WATER_LOG_ML` (20,000 ml) with the command boundary; one volume parser everywhere (comma is thousands only when grouping three digits); ounces to one decimal across Today, notifications and the widget; merged notifications keep both habit names; long names cut at 40 characters in titles; `snackCountsFor` shared by selectors and reducer; dead exports removed; Today hides the Water / Movement / Mind cards for habits the person does not have, the Cycle card has its own "Show on Today" switch, `/cycle` with tracking off shows a turn-on card; "How it works" on every Health Connect card; widget card says how to add the widget; privacy copy corrected (paradigm 30); version 0.11.0 / versionCode 11 | this commit |
| 2026-10-26 evening | Verification: tsc clean, 285 tests (15 new: 13 in `tests/round7.test.ts`, two planner tests for merged names and long titles), `expo export --platform android` → 5.9 MB Hermes bytecode (the local module's JS import resolves), web preview renders; `modules/exact-alarms` Kotlin is **not** compile-verified here (no Android SDK) — `docs/BUILD_ANDROID.md` gives the escape hatch | this commit |

| 2026-10-26 night | **Council round 8** — six lenses, each a persona walk or a scripted probe rather than a code read alone (a 14-day habit journey with three personas, the widget under font scale and launcher sizes with a layout probe, Health Connect dedupe and permission coverage, the cycle model under birth control and bad data, backup atomicity against the installed expo-file-system sources, a browser e2e over the round-7 flows). Theme: the data layer had grown correct for the single-source case and nowhere else — two copies of a night, a drink in two apps, a second unreadable snapshot, two weeks of a weekly habit — and the install's own library did not do what the code assumed (`move` deletes before it renames). Triage in §6 | — |
| 2026-10-26 night | **Round-8 fixes:** snapshot replaced through a complete `snapshot.next.json` (recovered on start), kept copies one file each with a target-aware cleanup marker, onboarding and the kept-copy card delete through the same journaled path and show a failed delete; encrypted export envelope 2 (header as GCM AAD; envelope 1 still opens); damaged containers (`cycleLogs`, `events`, `body.*` present but not lists; a day log without a day) rejected instead of normalised away; cycle reminders carry `confirmed`, birth control pauses fertile/luteal rules and the sheet offers only period rules, "once the period is logged" suffix, `CycleDayInfo.estimated` with "(estimated)" wording, `historyUpTo` keeps future-dated starts out of predictions with a `future-start` alert, symptom burden as mean severity with a three-logged-days floor; `HabitView.doneToday` / `dayRatio` for the checkbox, Mark done and the planner, Today's movement target = the per-day target while the period quota is unmet, climber needs four observed days in both weeks, `streakUnit()` in highlights and the week summary, the week summary counts sessions against the quota, Sugar Shield alone no longer opens a Movement card; widget layout takes the font scale (ring value unscaled, labels budgeted, 48 dp touch floor, 72 dp minimum height, day line only while the ring stays ≥ 72 dp), `notice` state for load/tap failures on the last good model, rotation tap resolves from the newest state, headless runs refresh the widget even when nothing changed; Health Connect: a manual/widget drink within 5 min / 10 ml evicts its imported copy on the next sync, overlapping sleep and workout sessions counted once (`distinctSleep` / `distinctWorkouts`, the list page shows one row), rolling 7-day re-read with a 30-day backfill per newly granted type (`sync.backfilled`), the connection card names what is read and what is not allowed, the Body tab says which metrics a missing permission keeps empty; paradigms 31–35; checklist Y1–Y14; version 0.12.0 / versionCode 12 | this commit |
| 2026-10-26 night | Verification: tsc clean, 304 tests (15 new in `tests/round8.test.ts`, plus updated widget / body / cycle / backupCrypto suites), `expo export --platform android` → 5.9 MB Hermes bytecode; browser e2e over the round-7 flows (Today without the trio, cycle guard and Today switch, Quick Log ceiling, Body card) all passed with no console errors | this commit |

| 2026-10-26 night | **Council round 9** — six lenses over the round-8 diff, each with a harness rather than a read: a diff review with probes, a randomised command fuzzer (80 sequences × 65 commands, DST dates, four zones, SQLite round trips), a planner simulator over November's DST night, a performance profile on a two-year fixture, a copy / accessibility audit, and a browser e2e over the round-8 flows. Theme: the round-8 fixes were right one object at a time and wrong in the aggregate — one manual drink evicted two imports, a merged notification forgot its second slot, the planner's tracking-day checks stopped at the rotation, and every cache was keyed on the whole state. Triage in §6 | — |
| 2026-10-26 night | **Round-9 fixes:** `reconcileAndSync` folds the deliveries the OS made while the app was closed into the state before planning (headless and live paths; `firedSinceLastSync`); merged notifications carry `mergedIds`, ledger events are written per constituent with `via` (schema v5), the cap and per-habit budgets count a delivery once, the signature includes day and constituents; planner slots carry their tracking day (`dayOf`), per-slot eligibility and budgets, rotation / water anchors unconditional, water counted per slot, a met weekly / monthly quota settles the period through `PlanHabit.periodEndsOn`, automatic snoozes past the active window dropped (fixed times keep theirs), `liveNudge` returns nothing when the planner offers nothing; cycle: PHASE_START/period with offset 0 fires on the logged start, `phaseQualifier()` gives "(estimated)" / "(predicted)" by date on the ring, the day sheet, the calendar and Today; Health Connect: `twinImports()` one-to-one nearest matching on the current upstream (binary search on the manual rows), edited imports keep their zone, duplicate external ids removed, a revoked type leaves `backfilled` so a re-grant backfills again; stats: `distinctSessions` as an active-set sweep (linear under an anomalous long record); week summary counts a monthly habit by its share of the week; summary cards expose their date and detail to TalkBack; connection-card copy says what a missing permission keeps empty; Today's water button and label follow `tapSizeMl`; row labels say what the button does (`quickLogLabel`); stepper `inputKind` ("an amount" for volumes, bounds in the unit shown; the onboarding formatter uses its argument); widget `ringValue()` drops the unit, then compacts thousands, before the floor size ("1.9k", TalkBack keeps the full value); performance: per-habit view / day-value memo keyed on rules, policies, the habit's log slice and the day, cadence segments walked once per history (`cadenceSegments` / `segmentStartIn`), incremental period counts in `habitRatios`, arithmetic `periodRequired` — water tap ×25 views 37 → 3.4 ms, cold cycle insights 430 → 48 ms, monthly year series 60 → 1.3 ms; paradigms 36–39; checklist Z1–Z13; version 0.13.0 / versionCode 13 | this commit, tag `v0.13` |
| 2026-10-26 night | Verification: tsc clean, 326 tests (22 new in `tests/round9.test.ts`), `expo export --platform android` → 6.0 MB Hermes bytecode, the perf fixture re-run (`/tmp/perf-r9.ts`) | `e44adf8`, tag `v0.13` |
| 2026-10-26 night | **Council round 10** — six lenses over the round-9 result: a diff review with probes, a selector-cache audit (3 seeds × 2,200 reducer steps, 132,912 differential assertions, a GC-stable memory probe), a notification-pipeline state-machine review against the expo-notifications and background-task Kotlin sources, an upgrade / downgrade lens (schema 1→5 migrations, v0.12 exports, envelopes), a "finish line" product review (defects, five 1.0 improvements, doc claims that do not match code) and a browser e2e. Theme: round 9 made deliveries count once, but still keyed them by slot id for life, acknowledged them before the save, and counted the wrong things against budgets; and the one user constraint the app had never honoured — tunable reminders per habit — was still missing. 25 findings; triage in §6 | — |
| 2026-10-26 night | **Round-10 fixes:** deliveries written per occurrence (slot id + time) with a journal acknowledged only after the store confirmed the save (`src/services/deliveryJournal.ts`, `reconcileAndSync` serialised and returning `{delivered, persisted}`); delivery judged by absence from the pending set, not the clock; TAP writes one FIRED per day and responses carry the slot's day; exempt ids (summary / cycle / event) outside the cap; INTERVAL and FIXED budgets per tracking day counting deliveries only; rotation and interval loops continue past settled slots; the background task re-plans after an import changed the state; plan cache keyed by exact `nowMs`; session sweep takes the group with the best overlap; "Rest of today" pauses to the day boundary; Body extrema from the selected range; water shown in the units setting everywhere (shared helpers); the **reminder policy editor** (`ReminderPolicySheet`, `describePolicy`) on every habit page; freezes default by cadence; destructive taps confirm (`confirmDestructive`); the Water summary routes to the Library when no water habit exists; doc claims corrected (library defaults, weekday rows, luteal check-in, pinned cards, source links, downgrade caveat) | this commit |
| 2026-10-26 night | Verification: tsc clean, 345 tests (19 new in `tests/round10.test.ts`), `expo export --platform android` → Hermes bytecode OK | this commit, tag `v0.14` |
| 2026-10-26 night | **Council round 11** — five lenses over the round-10 result: a diff review, a plan / delivery simulator (random days of rings, taps, snoozes and deaths between the OS change and the record), a UX walkthrough of the new editor at large font sizes, a native-paths review (widget handler, headless tasks, the notification service's storage) and a browser e2e of the editor. Theme: round 10 keyed deliveries per occurrence in the journal but still counted budgets per lifetime slot id, the service's storage had no crash windows written down and read failures as empty, and the editor had edges (remounting rows, a Save that resumed a paused schedule, a Done that re-parsed a formatted value). 21 findings; triage in §6 | — |
| 2026-10-26 night | **Round-11 fixes:** budgets and the cap count every FIRED event per occurrence (`deliveriesOn`), the latest event settles only; TAP / OPEN write nothing (exact `id\|at` dedupe restored after the simulator broke the monotonic one); one bookkeeping record `{ledger, journal, cancelling, scheduling}` under `dailytracker.nudges.bookkeeping.v1` (one-time fold of the two old keys), written before and after each OS change, dead intents resolved by `deliveries()`; a storage read failure throws; `cancelAll({forget})` for a replaced state, driven by `replaceEpoch` from the provider; cancel-all and acknowledgements queued, never skipped; `beginHandling` releases its claim on a failed read; a widget tap whose live save gave up draws the on-disk numbers with the "could not be saved" notice; the background task re-plans after an import with a fresh instant; the editor: stable time-row keys, a paused schedule stays paused on Save ("Paused ·" on the card, a footnote in the editor), stage badge and value row survive large fonts, "once 60% of today's target is logged", a touched flag for freezes, a stepper opened and closed without typing keeps its value, per-kind card copy; **new:** "Next: …" line on the Reminders card from the plan; **weekday selection for set times** (schema v6 `weekdays_json`, planner, description, seven chips, validator); the Water summary opens the Library on the Water preset (`/habits?preset=…`); checklist AB1–AB11; version 0.15.0 / versionCode 15 | this commit |
| 2026-10-26 night | Verification: tsc clean, 362 tests (17 new in `tests/round11.test.ts`), `expo export --platform android` → Hermes bytecode OK | `485066c`, tag `v0.15` |
| 2026-10-26 night | **Council round 12** — five lenses over the round-11 result: a diff review with probes, a data / upgrade audit, a finish-line audit (does the app do what the user asked, end to end), an Android platform audit, browser e2e; plus the simulator rerun, which found the one real residual (merging across the 3 am boundary) | this commit |
| 2026-10-26 night | **Round-12 fixes:** the planner never merges across the tracking-day boundary; service records move from AsyncStorage into the state's SQLite `kv` table (`readRecord` / `writeRecord`, compare-and-set, cleared by `replace`); erase / restore / sample data are written with `replace` (the provider's `replaceGenRef`) and `replaceEpoch` drives the re-plan instead of `cancelAll({forget})`; a durable press inbox (`responseInbox.ts`) replayed at every runtime start with the received instant, snooze deduped by instant; bookkeeping validated entry by entry and capped, the ledger indexed; refused cancels stay in the ledger (sync and cancel-all); sync health shown on the Reminders card with a one-minute retry; the next-ring line orders pause → plan → met quota → far set time → done today, today / tomorrow by the calendar day (card and Settings preview); a widget tap under a failed save draws the committed state; the stepper clamps a restored value to the current bounds; no Remind-me switch on on-demand policies; Off / paused movement copy matches the rotation; the Water door opens the Library every time; water copy in the person's units; weekday chips without the radiogroup role; onboarding and the phone guide say what the Android backup carries; version 0.16.0 / versionCode 16 | this commit |
| 2026-10-26 night | Verification: tsc clean, 376 tests (12 new in `tests/round12.test.ts`, 2 in the store contract), simulator 600 sequences / 0 invariant failures, `expo export --platform android` → Hermes bytecode OK | `07420f8`, tag `v0.16` |
| 2026-10-26 night | **Council round 13** — a diff review with probes over the round-12 result (five findings, all reproduced in pure probes) and a privacy / threat lens over the whole app (two findings; the backup crypto, Android backup allowlist, Health Connect scope, network silence, cycle notification visibility and widget exposure all passed) | this commit |
| 2026-10-26 night | **Round-13 fixes:** refused OS calls fail the sync after the honest ledger write (`OsRefusedError`, retry + health); record versions carry the replace generation (SQLite `replace_generation`, JSON `{generation, records}`), so a "nothing yet" read before a replace cannot write after it; re-plans wait for a replace to commit (`replacePending`) and in-flight folds are fenced (`replaceSeq`, in the scheduler and `replanLive`); the launch press is cleared only after the inbox write; the JSON store serialises its record operations; sheets stay down while the app lock is up (`lockState`); `presetById` for every id from outside; **B3** — the "Logged" activity list on every habit page (exact-record Remove, origin, today / last 7 days) and the "Fix an older day" month picker (`DayPickerSheet`, `month.ts` shared with the cycle calendar); version 0.17.0 / versionCode 17 | this commit |
| 2026-10-26 night | Verification: tsc clean, 384 tests (8 new in `tests/round13.test.ts`, the store contract rewritten for versions), browser e2e of the Logged card and the picker, `expo export --platform android` | this commit, tag `v0.17` |

| 2026-10-26 night | **Council round 14** — three lenses over the round-13 result: a diff review with probes (three findings), a state-machine / interleaving review of the provider (three findings, two reproduced in probes with the real store), and a UX / accessibility pass over the new Logged list and picker (five findings). Judged in §6 | — |
| 2026-10-26 night | **Round-14 fixes:** the provider's save loop extracted into `src/state/saveQueue.ts` (one queue per hydration, retired on unmount / reload: no retry, no pass, waiters false — SM-01); a failed load shows "Your data could not be opened" with Try again instead of an empty ready state (SM-03); the notification path's widget redraw and snapshot gated on `persisted` and drawn from the committed state, the hourly snapshot waits for the pending commit (SM-02); `ClaimGate` (`src/services/claimGate.ts`) behind `beginHandling` — a duplicate caller is answered after the first inbox write (ADV13-01); the month picker computes ratios per month (`ratiosByDay`, ADV13-02 / UX14-01); the Reminders card shows a failed cancel with reminders off (ADV13-03); rings for partial days, a measured ink and `readableFill` for full days (UX14-02), "Clear day" confirmed with the day and amount (UX14-03), month titles announced and years in older-day labels in both calendars (UX14-04), 48 dp cells (UX14-05); **B5** — "Cards on Today" picker (`PinnedCardsSheet`, from Today's "Choose cards" and Settings → Today): membership and order in `Settings.pinned`, Steps / Sleep opt-in with a door to Body, the cycle row bound to its own switch; version 0.18.0 / versionCode 18 | this commit |
| 2026-10-26 night | Verification: tsc clean, 398 tests (14 new in `tests/round14.test.ts`: the pinned list, ratios past the strip, AA inks on every category colour, the claim gate, the save queue's retry / replace / retirement), browser e2e of the picker and the card sheet, `expo export --platform android` | this commit, tag `v0.18` |
| 2026-10-26 night | **Round-15 fixes:** `committedSource` — every running-app snapshot (foreground `BackupSync`, the headless live paths of the notification, widget and re-plan writers) reads the committed state vetoed by the newest intent and by a pending replace (ADV14-01, paradigm 66); the pinned Steps card falls back to the Steps habit's own log (`stepsCardViewFromHabit`, ADV14-02); the notification permission classified from Expo's status + `canAskAgain` + the POST_NOTIFICATIONS runtime check (`src/services/notificationPermission.ts`, PLAT15-01, paradigm 67); exact-timing copy softened (PLAT15-02); per-habit rules / policy in the view memo (PERF15-01), the plan reused across states that differ only in what the planner never reads (PERF15-02), Today's cards built on demand and the newest-of-day lookups memoised (PERF15-03), the snapshot refresh skipping the re-parse of a file this process wrote (PERF15-04); **B3 follow-up** — Undo toast (`components/ui/Toast.tsx`, `ToastHost` in the root layout under the lock gate) after Remove and after Clear day, restoring the exact records (`src/domain/habits/records.ts`, `RESTORE_LOGS`, paradigm 68); version 0.19.0 / versionCode 19 | this commit |
| 2026-10-26 night | Verification: tsc clean, 411 tests (13 new in `tests/round15.test.ts`: Clear day ↔ `dayRecords`, restore once / twice / orphan / cap, the snapshot veto, the permission matrix, the Steps fallback, the view and plan memo boundaries), browser e2e of Undo after Remove and Clear day and of the Steps card from the manual habit, `expo export --platform android` | this commit, tag `v0.19` |
| 2026-10-26 night | **Council round 16** — a diff review with probes over the round-15 result (three findings: Undo double-counting a synced day, a toast outliving a retired provider, the snapshot shortcut's identity), a Hermes / release-build lens (one finding: the widget tap's durability; Intl, regex, 16 KB flags and the fixed reminders across DST judged correct) and a DST simulation (three findings: the countdown across the fold, the budget spent on dropped slots, nights re-dated by a trip) — plus the week-start setting from the backlog | this commit |
| 2026-10-26 night | **Round-16 fixes and the week-start setting:** `Settings.weekStart` (Monday default) threaded as a trailing `weekStart` index through the periods (`streaks.ts`), the selectors, the stats, the month grid (`monthCells`, `weekdayLetters`) and every calendar / heatmap / week strip; the weekly summary's day follows it; `RESTORE_LOGS` evicts the import a restored manual record outranks (ADV15-01, paradigm 71); `ToastHost` clears its toast on unmount (ADV15-02); the snapshot shortcut keyed on write time + size (`snapshotStamp`, ADV15-03, paradigm 72); the Today card's anchors by real minutes (DST16-01, paradigm 73); the planner's `push` reports what it kept and budgets / the rotation move only then (DST16-02, paradigm 74); nights carry `startOffsetMin` / `endOffsetMin` from Health Connect's zone offsets or the phone's, read by the Body screens and the bedtime spread, kept across a reread (`keepNightPlacing`), schema v7 (DST16-03, paradigm 75); the widget's headless tap persisted before the re-plan (HERM16-01, paradigm 76); version 0.20.0 / versionCode 20 | this commit |
| 2026-10-26 night | Verification: tsc clean, 424 tests (12 new in `tests/round16.test.ts`: Sunday weeks in bounds / quota / grids / the view / the streak / the setting's default, Undo's eviction, the 25-hour night's interval budget and rotation turns, the countdown across the fold, the sleep offsets through merge and the spread; 1 in the store tests: schema v7 and the night round trip), browser e2e of the week-start setting through Settings, the heatmap and the day picker | this commit, tag `v0.20` |
| 2026-10-26 night | **Council round 17** — a diff review with probes over the round-16 result (two findings: the widget tap's second persist, the insights memo and the week start), a data / upgrade lens (clean: migrations 0–7 probed, the sleep-offset bridge shape, `expo install --check`) and a test-audit lens (mutation testing of the suite: six gaps, no implementation bugs; the throwaway simulator flagged as non-gating) — plus reminder set-up inside habit creation from the backlog | this commit |
| 2026-10-26 night | **Round-17 fixes and reminders at creation:** the widget's headless path marks the tap saved after its first persist and draws it as saved whatever fails after (ADV16-01, paradigm 77); `cycleInsights` keys its memo on the week start too (ADV16-02, paradigm 78); the reminder form extracted from the habit page's sheet into `ReminderPolicyForm` and embedded in the New habit sheet, saved in the same `ADD_HABIT` as the habit (`HabitDraft.reminder`, `newHabitAction` in `commands.ts`, paradigm 79); the "At most, a day" stepper shows the value that will be saved; version 0.21.0 / versionCode 21 | this commit |
| 2026-10-26 night | Verification: tsc clean, 438 tests (13 new in `tests/round17.test.ts`: the creation action with set times / an interval / Off / the rotation, the insights memo across a week-start switch, the widget tap under five failure injections through a transpile-and-inject harness, and the audit's six gaps — a failed replace / persist rolls back whole, the default PBKDF2 rounds, the snapshot stamp's size half, Sunday-first partial quotas, a start-only night edit, weekday names; 1 in `tests/nudgeSim.test.ts`: 75 randomised ten-day sequences, 0 breaches, paradigm 80), browser e2e of a habit created with a 7 PM Mon / Wed / Fri reminder and one with none | this commit, tag `v0.21` |
| 2026-10-26 night | **Council round 18** — a diff review with probes over the round-17 result, a lifecycle lens (unmounts, resets, StrictMode, timers across awaits), a state fuzz lens (45,000 seeded transitions against the validator, the SQLite stores and every selector) and a copy audit by the browser-driving tester. Findings: ADV17-01 (the creation form's "At most, a day" showed an unsaveable 3), LIFE18-1…7 (a dead provider left registered; a retired scheduler re-scheduling an old plan after the permission await, after `prepare()`, and from a captured live store; the mind bell's schedule/cancel race; a boolean lifetime broken by StrictMode's effect replay; untracked foreground timers), no fuzz breaches, fifteen copy rows. | — |
| 2026-10-26 night | **Round-18 fixes:** `LiveStore.alive()` bound to the hydration's queue, identity-based live-store teardown in both provider effects, `apply` on a retired provider saves nothing (paradigms 82–83); a per-effect lifetime token in `NudgeScheduler` and a `still` validity carried through `reconcileAndSync` → `syncStateToOs` → `syncPlan` to the first bookkeeping write (paradigm 81); the mind bell serialised with a generation (paradigm 84); `BodySync` with one coalesced, cancelled timer; `distinctTimeCount` bounding the "Daily maximum" stepper; the copy fixes (Snooze 10 min, Reminder settings, Daily maximum / Only when I'm behind, Days met, Empty / Partial legend, ml-only water evidence, Source: links, plain reminder footnotes, Set today's total, Daily target, the clear-day and calendar hints); every stepper disables its minus / plus at a bound instead of offering a tap that changes nothing; the fuzzer promoted into the suite (`tests/stateFuzz.test.ts`, `FUZZ_SEQUENCES`); version 0.22.0 / versionCode 22 | this commit |
| 2026-10-26 night | Verification: tsc clean, 448 tests (9 new in `tests/round18.test.ts` — the real notification service loaded behind Node module hooks with a scripted OS: the bell race, a sync refused after the OS read with zero writes, a retired provider's re-plan stopped before the OS, the living one's ring scheduled — plus the one-test fuzz), the lifecycle lens re-ran its harness after each fix (all seven gone), browser e2e of the copy and of the stepper bound, `expo export --platform android` | this commit, tag `v0.22` |
| 2026-10-26 night | **Council round 19** — a diff review of round 18 (no findings), an Android 14 / 15 / 16 release-readiness lens over app.json, the plugins, the local module, the patches and the installed native sources, with a scratch prebuild (no findings; two corrections to the file's own assumptions: the background task is chained one-time work with a 180-minute delay on every target phone, and the 16 KB page-size check belongs in the laptop build), a fresh-install journey by the browser-driving tester (onboarding → presets → a custom habit → logging and undo → every screen with near-empty data → export → Reminders), and a dead-code pass (`tsc --noUnusedLocals --noUnusedParameters` plus an unused-export scan). | — |
| 2026-10-26 night | **Round-19 fixes and additions:** accessibility state through `aria-*` props everywhere (paradigm 86); a Library preset's reminder shown and editable in its sheet before adding (`presetHabitAction`, paradigm 87); the Mind timer's "Other" length (1–120 min, typed or stepped) and "1 minute" singular; the water highlight left out over two empty weeks (paradigm 88); the New habit type hint as a sentence; the weekly presets' Library copy ("until 3 days are logged this week"); the Stepper's bound buttons; seven unused imports / locals and one dead export removed; BUILD_ANDROID's 16 KB check; version 0.23.0 / versionCode 23 | this commit |
| 2026-10-26 night | Verification: tsc clean, 455 tests (7 new in `tests/round19.test.ts`: the preset action with and without a chosen reminder, Off, an on-demand preset's trigger kept, a movement preset's rotation, a weekly preset with chosen days ringing on those days only and on every day without), browser e2e of the preset sheet's reminder (Mon / Wed / Fri chosen → the habit page's row and "Next: Wed"), the on-demand preset without an editor, the day letters' checked state, the type hint, no empty-week highlight, a 1-minute meditation to completion, `expo export --platform android` | this commit, tag `v0.23` |
| 2026-10-26 night | **Council round 20** — three lenses over the round-19 result: a diff review with probes (one finding: an archived preset added again from the Library ignored the sheet's reminder), a locale / internationalisation lens (three findings: typed amounts read on one keyboard only, every clock time written as 12-hour whatever the phone says, an unchecked zone name from the runtime; expo-localization was not installed, headless texts carry no clock times), and a performance lens over the selectors and the backup path with a 730-day fixture (two findings: the streak loop and `addDays` re-parsing the same days, and PBKDF2 blocking the JavaScript thread) — plus the "second week" journey by the browser-driving tester. |
| 2026-10-26 night | **Round-20 fixes and the time format:** `restorePresetActions` (an archived preset comes back with its history and the chosen reminder, paradigm 87); `parseDecimalInput` folds Arabic-Indic / Persian digits and marks, grouping spaces, thousands dots and decimal commas, and refuses a second same-kind separator (paradigm 90); `currentZone` formats a date with the runtime's zone name before trusting it; `Settings.clockFormat` (Automatic / 12-hour / 24-hour) resolved once in the provider from the phone's switch (`expo-localization` `getCalendars()[0].uses24hourClock`, refreshed on foreground) and threaded as a required `clock` through `formatClock`, `PolicyContext`, `nextRingText`, every stepper's time format and placeholder and the Shield's walk line (paradigm 89); `encryptBackupAsync` / `decryptBackupAsync` behind the export and unlock screens (paradigm 91); the streak loop reuses its cursor and `addDays(day, 1)` keeps a bounded next-day cache (cold `habitView` 22 → 11 ms, `liveNudge` 30 → 8.5 ms, `nudgePlan` 26 → 8.8 ms, `highlights` 15 → 6.8 ms, `cycleInsights` 13 → 6.6 ms on the 730-day fixture). |
| 2026-10-26 night | **Journey fixes (round 20):** preset texts carry volume and clock tokens written by `presetText` (the Library's "2,000 ml a day" / "2,700 ml (women)" under ounces, "At 7:30 AM" under the 24-hour clock); Today's row hint from the habit's own policy (`shortPolicyText`) instead of the preset's static line (paradigm 92); the water highlight in the units setting; a stair snack is one climb (a logged climb counts one of the day's three); the Reminders card's Next up names the snack of a rotation ring and each part of a merged one; the web file picker is attached to the document while the chooser is open and reads a dismissed chooser as a cancel; the week-start hint says past weeks are re-read. |
| 2026-10-26 night | **Council round 21** — three lenses over the round-20 result: a diff review with probes (two findings: the unlock sheet's result after Cancel, an archived preset without a reminder row whose default the sheet promised but Add skipped; the ideas desk proposed the reminder self-test), a security / privacy audit (one finding: a backup's rotation offset of 0.5 or −1 crashed the planner after restore; crypto, lock gate, deep links, import projection, SQL, widget receiver, backup allowlist judged correct), and a power-user / edge-input journey by the browser-driving tester (see §6 Round 21). |
| 2026-10-26 night | **Round-21 fixes and the reminder self-test:** `UnlockSheet` keeps a request token and an in-flight flag — Cancel, a new file and an unmount retire the running derivation, whose result is then dropped (LENS21-01, paradigm 93); `nudgeSwap.offset` validated as a whole non-negative number and the planner's rotation index normalised (SEC21-01, paradigm 94); an archived preset without a reminder row installs the default the sheet showed (LENS21-03); `parseDecimalInput` ignores a trailing unit word but refuses letters or a sign inside the number and a space that groups nothing ("1 2 3", "12 00", "-5", "1e3" → null, where they read 123, 1200, 5, 13), `formatClock` floors a fractional minute; Settings → Reminders → **Test** — "Send a test reminder" schedules `TEST_RING_ID` a minute out on the nudges channel, outside the plan (`scheduleTestRing` / `cancelTestRing`; the sync and `cancelAll` skip it), the card says "lock the phone now", asks after the due minute plus 30 s, and on "No" lists the checks (`src/domain/nudges/reminderTest.ts`, paradigm 95); the scripted-OS harness moved to `tests/support/scriptedOs.ts`; version 0.25.0 / versionCode 25 | this commit |
| 2026-10-26 night | Verification: tsc clean, 479 tests (4 new in `tests/round21.test.ts`: the planner under a fractional / negative / huge / NaN offset, the self-test's phases and lines, its ring surviving a sync and reminders-off on the real service, a second test replacing the first; 5 assertions added to `hardening` for the offset validator and 12 to `round20` for the parser and the floor), browser e2e (see §6 Round 21), `expo export --platform android`; pushed as `v0.25`. |
| 2026-10-26 night | **Council round 22** — three lenses over the round-21 result: a diff review with probes (three findings on the self-test: a cancel overtaken by an older send, a refused cancel shown as success, a test sent before the channels existed; the ideas desk proposed a backup check-in), a statistics-correctness audit (five findings: "Days met" counting a met week as seven days, a years-old weight difference labelled "over 30 days", "7h 60m", hydration pace resetting at midnight three hours before the day ends, the Mind ring ignoring a met weekly quota; 300 random streak states, the water / snack / mind sums, the cycle averages and the nudge budget judged correct), and an accessibility + 320 × 568 audit in code and browser (eight findings: no headings, unnamed sheets, primary buttons squeezed to "D…", every legend total truncated, input rows pushing their button out of the sheet, targets under 48 dp, repeated action names, two light inks under AA). |
| 2026-10-26 night | **Round-22 fixes and the backup check-in:** `daysMet` / `dayMet` in `progress.ts` behind the habit page's "Days met" and `askedToday` behind both category rings (STAT22-01 / -05, paradigm 96); `latestWeight` returns `sinceDay` / `sinceDays` and `weightSpanText` writes the real span, `formatSleep` rounds whole minutes first, `formatMonthYear` (STAT22-02 / -03, paradigm 97); `todaySummary` counts minutes into the tracking day past midnight (STAT22-04, paradigm 98); the test ring's schedule / cancel serialised with a generation (`SupersededError` for an overtaken send), `cancelTestRing` rejects when the OS refuses and the card keeps the test and says the ring may still come, `registerChannels()` before the test is scheduled, one request at a time in the card with results dropped after unmount (ADV21-01…03); `Txt heading`, Screen / section / settings-card titles as headers, `Sheet` as a `role="dialog"` named by its title with TalkBack focus on present and a scrim out of the focus order, the rings card stacked under ~360 dp (`useWindowDimensions`), wrapping action rows whose primary keeps `flexBasis` (NudgeCard, habit page, Cycle), `minWidth: 0` inputs with non-shrinking buttons (Backup, Log, Amount sheets), 48 dp slop on the stepper's value, the toast's Undo, source links and month titles, times in Remove names and kinds in quick-log names, light `greenMist` #226538 and `cat.hydration` #10786B (A11Y22-01…08, paradigm 99); `Settings.lastExportAt` set when a file is handed to the share sheet and `backupAge` under the Export button ("No backup exported yet." / "Last exported Oct 12, 14 days ago." / after 30 days "Export again to keep a recent copy."), never claiming the copy is anywhere (IDEA22); version 0.26.0 / versionCode 26 | this commit |
| 2026-10-26 night | Verification: tsc clean, 495 tests (13 new in `tests/round22.test.ts`: one Monday session = one day met while the strip reads 1.0 all week, `dayMet` without a target, the 669-day weight span and the days / months / since wording, sleep rounding, pace at 23:59 vs 02:59 and a new day's zero, the Mind ring on Tuesday with and without a session, the light inks on their surfaces, the backup check-in's lines and a clock set back; 3 new in `round21`: the overtaken send, the refused cancel, channels before the test; `body` extended for the span), browser e2e (see §6 Round 22), `expo export --platform android`; pushed as `v0.26`. |
| 2026-10-26 night | Verification: tsc clean, 475 tests (20 new in `tests/round20.test.ts`: the restore with / without a chosen reminder, an active habit, an on-demand preset; every keyboard's numbers and the refusals; the format's resolution, both writings, read-back in both, the policy words and the next-ring line in 24-hour, the setting through a file; the async crypto round trip both ways, a wrong password, the event loop turning during derivation; the preset tokens in both units and both clocks, the live row hint, the oz highlight, the one-climb stair snack), browser e2e twice (see §6 Round 20), `expo export --platform android`; pushed as `v0.24`. |

(Entries for each council round follow below as they happen.)

## 6. Council log

Format per round: lens → findings (severity · title · disposition · commit). Dispositions: **fixed**,
**rejected** (reason), **deferred** (needs user/phone).

### Round 22 (2026-10-26 night)

Three lenses over the round-21 result — a diff review with probes and an ideas desk, a statistics-correctness audit (streaks, quotas, averages, deltas, pace, rounding, the nudge budget) and an accessibility + small-screen audit (code and browser, 390 × 844 and 320 × 568).

**Diff review**
- ADV21-01 med · the self-test's schedule and cancel were not serialised: a cancel issued while an earlier send was still clearing the old ring could be followed by that send's schedule, resurrecting the ring and the "waiting" UI; the Send button stayed enabled while a send was in flight · **fixed** — a queue and a generation like the mind bell's (`SupersededError` for an overtaken send, dropped by the card), an in-flight flag and a disabled "Scheduling…" button, results dropped after unmount; test.
- ADV21-02 med · a refused cancel was swallowed and the card forgot the test while its ring still stood · **fixed** — `cancelTestRing` rejects, the card keeps the test and says "could not be cancelled … it may still ring" so Cancel can be tried again; "No" says it too; test.
- ADV21-03 low · a test sent before the scheduler's own `prepare()` could reach the OS with no channel registered · **fixed** — `registerChannels()` runs inside `scheduleTestRing`; test.
- Judged correct: the extracted unlock handlers (close before resolution, StrictMode replay, double submit), the test ring's exemptions and null parse, the foreground tick, 46 parser inputs. Noted low: a trailing sign is still permissive ("5-" → 5).
- Ideas desk: a backup check-in — **built** (`lastExportAt`, `backupAge`). Riskiest first-device path restated: the cold notification action → headless task → inbox → writer → SQLite → reconciliation.

**Statistics-correctness audit**
- STAT22-01 med · "Days met" on a weekly habit counted days whose accumulated week ratio reached 1: one Monday session read "7 of last 14" by Sunday · **fixed** — `daysMet` asks each day's own value against its target; paradigm 96; test.
- STAT22-02 med · `latestWeight` took any reading at or before the 30-day cutoff and the Body card wrote "over 30 days" for it — two readings 669 days apart read "−10.0 kg over 30 days" · **fixed** — the reference's day and distance are returned and `weightSpanText` writes "over 35 days" / "over 4 months" / "since Jan 2025"; paradigm 97; tests.
- STAT22-03 low · `formatSleep(479.8)` wrote "7h 60m" (hours floored before the minutes rounded) · **fixed** — whole minutes first; test.
- STAT22-04 med · hydration pace used the calendar minute: at 00:00, three hours before the tracking day's boundary, the expected intake fell to zero and "1,750 ml behind" became "on pace" with nothing changed · **fixed** — minutes counted into the tracking day once the calendar day has turned; paradigm 98; tests (23:59 vs 02:59, and a new day's zero).
- STAT22-05 med · the Mind ring added a weekly meditation's 10 minutes to every day's target, so Tuesday showed an empty ring after Monday met the week's one session, while Movement already applied the quota rule · **fixed** — one `askedToday` behind both rings; paradigm 96; test.
- Judged correct: 300 seeded streak states (monthly, leap, year edges, target and cadence changes, freezes; week starts 0 / 1 / 6) with zero mismatches, the raw water / snack / mind sums, same-day water rows summing, heatmap clamping, the 02:59 / 03:00 boundary itself, null percentage baselines, cycle averages and next-start predictions at leap day and both DST dates, Spearman ties, Body sums and fallbacks, a cap of two automatic nudges per day in the sample plans.

**Accessibility + 320 × 568 audit**
- A11Y22-01 med · `Txt role` was typography only: no screen or section title was a heading · **fixed** — `heading` prop → `accessibilityRole="header"` on the Screen title, SectionHeader, every settings card title and the main section titles (not on titles inside buttons); paradigm 99.
- A11Y22-02 med · a sheet was an unnamed dialog that focused Close first; the scrim was a second focusable "Close" · **fixed** — the sheet `View` is `role="dialog"` with `aria-labelledby` / `accessibilityLabel` from its title, the title is a header TalkBack lands on 400 ms after present (50 ms under reduced motion), the scrim is tappable but out of the accessibility tree.
- A11Y22-03 med · fixed-width neighbours squeezed the flex primary: "Done now" rendered "D…" at 320 dp, "+250 ml" and "Period started today" likewise · **fixed** — the rows wrap and the primary keeps a `flexBasis` (150 / 160 / 190 dp), so the secondary actions move under it on a narrow phone and sit beside it at 390.
- A11Y22-04 med · beside a 164 dp ring at 320 dp every legend total truncated and "Hydration" split · **fixed** — the card stacks the legend under the ring when the room beside it is under ~150 dp × the font scale.
- A11Y22-05 med · on the web a flex `TextInput` kept its intrinsic width and pushed Show / Log past the sheet's edge at 320 dp · **fixed** — `minWidth: 0` on the inputs, `flexShrink: 0` on the buttons (Backup password, Log something, Amount).
- A11Y22-06 med · targets under 48 dp: the stepper's typed-value door (22 dp + 6 slop), the toast's Undo (40), source links (32), month titles (22) · **fixed** with slop to 48 dp. Calendar cells at 320 dp (35–43 dp wide, 48–80 tall) **by design** — adjacent grid cells cannot borrow horizontal slop; they keep their height and the picker scrolls.
- A11Y22-07 low · four "Remove 250 ml entry" buttons read alike; two "5 min" chips logged different kinds · **fixed** — the time or day in the name, and "2 of 5" when taps landed in the same minute (the tester found fifteen alike at 7:02 PM in the sample data), "Log 5 minutes of breathing"; the Log sheet's group titles are headings.
- A11Y22-08 med · light theme: "Moderate" (greenMist #3B9D5D) on its 16 % tint measured 2.86:1; the Water card title (#13897A, 17 px) 4.30:1 · **fixed** — #226538 (5.5:1 on white, 4.9:1 on the raised surface) and #10786B (5.4:1 / 4.7:1); test over the actual tinted surfaces.
**Browser re-check on 0.26.0** (the browser-driving tester, 320 × 568 and 390 × 844): rings stacked with every total whole; "Done now", "+250 ml" whole, the Log sheet's button inside the sheet; the sheet a dialog named by its title with one Close and the tab order inside it; headings on every screen (Settings: every card title); "No backup exported yet." after Start fresh; Remove names unique ("…at 7:46 PM, 2 of 5"); "Log 5 minutes of meditation / breathing"; the light Moderate pill at rgb(34, 101, 56) on its 16 % tint; "Days met 4 of last 14" on a weekly habit; About 0.26.0; no console errors (one stale-bundle `SPACE is not defined` during our own restart, gone on reload).
- Judged correct: no Pressable without a role, no Switch without a label, no `accessibilityState` left (aria props throughout), Undo restores and its region is polite, chart / heatmap / ring text alternatives, no document-level overflow at either width, secondary / tertiary inks ≥ 4.85:1. Device checks owed: font scale 1.3 / 2.0, TalkBack's announcement on present, the fixed 20 / 22 dp badges.

### Round 21 (2026-10-26 night)

Three lenses over the round-20 result — a diff review with probes and an ideas desk, a security / privacy audit (crypto, lock gate, deep links, import, SQL, the widget receiver, backups, Health Connect, logging), and the browser-driving tester's power-user / edge-input journey.

**Diff review**
- LENS21-01 med · closing the unlock sheet did not cancel the unlock: the derivation (which now yields) finished after Cancel and `onUnlocked` still fired, reopening the replace-everything confirmation; a failed old request could write its error into the next sheet; the keyboard's submit launched further derivations past the disabled button · **fixed** — a request token retired on close, file change and unmount, checked after the await before every callback and state update; an in-flight flag shared by the button and the keyboard; paradigm 93.
- LENS21-02 med · (baseline, fixed in the same commit) `parseDecimalInput` read "1 2 3" as 123, "12 00" as 1200 and "-5" as 5 · **fixed** — a trailing unit word is dropped, then letters or a sign inside the number and a space that groups nothing make it null; tests for "64 oz", "1.5l", "1e3", "-5", "0x10", "1 2 3", "12 00".
- LENS21-03 low · an archived preset whose reminder row was gone was shown with the preset's default schedule, and an untouched Add installed nothing · **fixed** — the default shown is installed when the archived copy has no policy row.
- Judged correct: the foreground tick re-reads the phone's clock and the provider memo carries it; no app call passes a literal `12h`; `presetText`'s `12h` default serves the volume-only wrappers whose texts carry no clock tokens; 100,000 calendar checks incl. negative deltas; the next-day cache clears at 8,192; FIXED hints dedupe times and drop seven weekdays; parallel async encryptions independent; the web focus fallback cleared at `onchange`.
- Ideas desk: a guided on-device reminder self-test — **built** (paradigm 95). Riskiest first-device path named: the cold / headless notification-button path (task registration → inbox → provider / headless ownership → SQLite commit → OS reconciliation), which only hardware can establish.

**Security / privacy audit**
- SEC21-01 med · a valid-looking backup with `nudgeSwap.offset` 0.5 or −1 passed `inspectExport`; with an eligible rotation `nudgePlan` threw on `undefined.id` in the scheduler and in Settings, and the value stayed persisted until the day changed · **fixed** — the offset validated as a whole number in [0, 1e6] and the day as a calendar day; the planner normalises its rotation index; paradigm 94; tests.
- Judged correct: AES-256-GCM with fresh OS / WebCrypto randomness, 16-byte salts, 12-byte IVs, PBKDF2-SHA256 200k, identical sync / async envelopes, edited iterations / salt / IV / date / version rejected; password fields cleared; no persisted PIN; the lock gate on cold start and resume; deep-link preset lookup by own properties; import projection strips unknown nested fields and bounds text / rows / files; parameterised SQL; migrations never reset a newer schema; the cycle's discreet text on a PRIVATE channel; widget receiver not exported; backup allowlist excludes the live database, WAL, preferences and cache; Health Connect read-only; no PIN / password / health dumps in logs.

**Power-user / edge-input journey** (the browser-driving tester, 390 × 844: every preset added, a 60-code-point emoji / RTL habit name, rapid taps, field extremes, archive-all, Erase everything, damaged imports, deep links)
- J21-01 med · fifteen rapid taps on a Count habit's + gave thirty entries, while ten rapid taps on the Water + gave exactly ten drinks · **harness, not the app** — the re-check on 0.25.0 tapped the same component four ways (five spaced clicks, fifteen tight clicks, fifteen direct DOM `element.click()` calls, fifteen `touchscreen.tap()` calls) and got exactly one row per tap each time, with the Water + at fifteen for fifteen; the tester's generic selector had matched two identical + buttons (Today's row and the Habits tab's off-screen one), which is where the doubled run came from. The app's path is one dispatch per press (`increment` → one `ADD_ENTRY`).
- J21-02 low · the Log sheet's **Log** stayed enabled on a typed 0 and a tap on it closed the sheet with nothing logged · **fixed** — in "add" mode the button waits for a number above 0 ("Set" keeps 0: it clears the day).
- J21-03 low · with no movement or mind habit active (every one archived, or every quota met and nothing started today) the rings card read "6 / 0 snacks" and "13 / 0 min" with full rings, and the category cards "6 of 0" · **fixed** — with nothing asked, the count stands alone ("6 snacks", "13 min"; the cards say "today"); the full ring for a day with logs and no ask stays (nothing owed, something done).
- J21-04 low · the water goal field turned "-5", "1e3" and "abc" into 100 ml (the lower bound) with no message · **fixed with LENS21-02** — these are no number now and the stepper keeps its value; a typed 0 or 99 still clamps to the 100 ml floor silently, as every bounded stepper does (by design: the bound is the message).
- Judged by design: Today's Hydration / Movement / Mind cards stay for a day that has logs after the habits were archived (PROD7-04: "or logged today"), the weekly highlights describe logs whatever is archived now; "Start fresh" on the sample state removes the sample history and keeps settings while "Erase everything" is the full erase, each confirmation saying which; archived habits restore one by one (no "Restore all" — rarely needed, and a restore is cheap); a typed active-hours time outside the stepper's window clamps to it; `/shield` is a tool that works without the Sugar Shield habit; manual mind logs above the goal are allowed (a long session is a long session). The Metro disconnect and the 502 the tester saw were our own dev-server restart mid-run, not the app.
- Pass: the ten remaining presets added in category order with twenty rows on Today; the 60-code-point name created, shown with its reminder summary deduplicated ("At 9:00 AM and 11:00 AM") and shortened on Today; the archive confirmation's text; Next up reduced to Water with only Water active and to "Nothing planned right now…" with nothing active; Erase everything zeroing Today, Body and Cycle and keeping the settings' cycle reminder; a damaged import named its first bad field and a half file "not valid JSON", both leaving the data untouched; the good file restored 10 habits and 2,074 entries; `preset=__proto__`, an unknown preset, an unknown habit id and `kind=BOGUS` all land safely.

### Round 20 (2026-10-26 night)

Three lenses over the round-19 result — a diff review with probes, a locale / internationalisation lens, and a performance lens over the selectors and the backup path (a generated 730-day state, `node --import tsx` timings cold and warm) — plus the browser-driving tester's "second week" journey over sample data.

**Diff review**
- ADV19-01 med · an archived Library preset added again from its sheet kept its old schedule: `addPreset` returned the existing habit before the chosen reminder was looked at, while the sheet had said "Add to my habits" under a reminder card that showed the preset's default · **fixed** — `restorePresetActions(state, existing, reminder?)` (un-archive, then `SET_POLICY` re-addressed to the existing habit; EVENT / CYCLE policies keep their trigger); the sheet's card starts from the archived copy's own policy and says "You archived this habit earlier; adding it back keeps its history"; tests.
- Judged correct: the preset action with every reminder kind; the Mind "Other" stepper's bounds and the singular; the water highlight's guard (an early return there would have skipped the later highlights — a guard is used instead); React Native's `aria-*` → `accessibilityState` mapping on Pressable, including `aria-disabled` on a disabled Pressable.

**Locale / internationalisation**
- LOC20-1 med · typed amounts were read on one keyboard: a decimal-comma keyboard's "1,5" became 15 and "٢٥٠" nothing · **fixed** — `parseDecimalInput` folds Arabic-Indic / Persian digits and the Arabic decimal and thousands marks, drops a grouping space between digit groups, reads a lone separator before exactly three digits as thousands ("2.000" → 2,000; "12,000 ml" → 12,000) and the last of two kinds as the decimal ("1.850,5" → 1,850.5), and returns null for a second same-kind separator ("1.2.3", "1.250.0" mid-typing) so the stepper keeps its value; paradigm 90; tests. (A first version folded every space to a comma, which broke "12,000 ml" → 12 — only a space between a digit and exactly three digits is grouping.)
- LOC20-2 med · every clock time in the app was written "9:30 PM" whatever the phone's 24-hour setting (43 call sites of `formatClock`, the Shield alone through `toLocaleTimeString`) · **fixed** — `Settings.clockFormat` (`system` default · `12h` · `24h`; Settings → Time format "Automatic / 12-hour / 24-hour" with the current writing in the hint), the phone's switch read through `expo-localization` (`getCalendars()[0].uses24hourClock` = Android's `DateFormat.is24HourFormat`; the locale's `hourCycle` as the fallback) in `services/deviceClock.ts` at start and on every foreground, `resolveClockFormat` in the provider, `useClockFormat()` for the screens, a required `clock` on `formatClock`, `PolicyContext` and `nextRingText` so tsc found every writer, the time steppers' format and placeholder ("21:30" / "9:30 pm") following it, the Shield's walk line through `formatClock`; paradigm 89; tests. Headless texts (notification bodies, the widget) carry no clock times, so nothing there changed. `expo-localization`'s config plugin was added to app.json by the install; without options it changes nothing on Android.
- LOC20-3 low · `currentZone` trusted the runtime's zone name; some Android builds return a name (`Etc/Unknown`) that `Intl.DateTimeFormat` then refuses, which every tracking-day formatter would have thrown on · **fixed** — the name is tried in a `DateTimeFormat` before it is accepted; UTC otherwise.
- Judged correct: no `toLocaleString` / `Intl.NumberFormat` left in the app's own text (volumes and counts are written by `formatVolume` / the stepper formatters); dates are written by the app's own day formatters with English month and weekday names (the app is English-only, by the plan).

**Performance** (730-day generated state: 7 habits, 5,100 water rows, 2,900 entries, 1,460 snacks, 700 mind sessions)
- PERF20-01 med · `streakFor` re-parsed every day of the history: the period loop called `addDays(day, 1)` per day and `addDays` re-parsed the day string each time (`habitView` 22 ms cold, `liveNudge` 30 ms, `nudgePlan` 26 ms — on a phone's JavaScript thread, three to five times slower, on every tick) · **fixed** — the loop reuses the day after each period's end as the next cursor; `addDays(day, 1)` keeps a bounded (8,192-entry) next-day cache. After: `habitView` 11 ms, `liveNudge` 8.5 ms, `nudgePlan` 8.8 ms, `highlights` 15 → 6.8 ms, `cycleInsights` 13 → 6.6 ms; warm paths unchanged (memoised).
- PERF20-02 med · the export and the unlock ran 200,000 PBKDF2 rounds synchronously on the JavaScript thread (seconds on a phone: the busy label froze and Cancel queued behind it; the unlock sheet used a `setTimeout` to let the spinner paint, which does not help once the loop starts) · **fixed** — `encryptBackupAsync` / `decryptBackupAsync` on noble's `pbkdf2Async` (yields every 10 ms); `serializeExportAsync` / `unlockExportAsync`; the export builds its text before the file is created; the sync forms stay for tests and read the same files; paradigm 91; tests (incl. a timer that must run during the derivation).
- Noted, no finding: a full persist of the 730-day state through the node SQLite adapter takes 776 ms (the save queue coalesces and runs off the render path); `heatmapValues` 4.6 ms cold.

**"Second week" journey** (sample data; the browser-driving tester — a weekly rule edit, an older day's water, archive and restore, the week start, ounces, the cycle screens, snooze, reminders off, an encrypted export and import, Erase everything)
- J20-01 med · with ounces set, the Library said "2,000 ml a day", the water preset's "Why this matters" cited "2,700 ml (women) to 3,700 ml (men)" and the Today highlight read "1,471 ml a day on average" · **fixed** — volume tokens in the preset texts written by `presetText(text, units)` (`presetRuleText`, `presetWhy`); the highlight through `formatVolume`; a test walks every preset under ounces; paradigm 92.
- J20-02 med (second run) · under the 24-hour clock Today's rows still said "At 7:30 AM", "At 3:00 PM", "At 6:00 PM" — the hint was the preset's static `nudgeText`, which also ignored a changed reminder and said nothing for a custom habit · **fixed** — `shortPolicyText(policy, ctx)` from the habit's own policy ("At 07:30", "At 08:00 +2 on weekdays", "Every 1 h 30 min when behind", "Rotation", "On demand"); the Library sheet's reminder line carries clock tokens (`presetNudgeText`); paradigm 92.
- J20-03 med (second run) · Stair sprint: one "Log one" wrote "3 stair climbs" in the log but counted 1 of the day's 3 climbs, so the summary stayed "0 of 3 this week" · **fixed** — a stair snack is one climb (`SNACK_LABELS.STAIRS.defaultReps` 1, label "Stair climb"): three logged climbs complete the day, as the preset and the sprint-snack protocol say (three single climbs spread over a day). The earlier sample rows keep their reps; a day counts snacks, not reps, for every movement habit.
- J20-04 low (second run) · "Import backup" on the web preview opened no chooser for the test harness and left both buttons busy until a reload (a detached `<input type=file>`, `click()`ed and dropped) · **fixed** — the input is appended (hidden) while the chooser is open and removed after; a dismissed chooser with no cancel event is read as a cancel 1.5 s after the window regains focus. Android uses the document picker and was not affected.
- J20-05 low · Settings → Reminders' Next up said "5:47 PM · Time for a break" for a ring Today's card called "10 push-ups" (the merged title; a rotation's "Movement snack" the same) · **fixed** — a rotation or merged line shows the body ("10 push-ups — push-up snack"; each part of a merged ring).
- J20-06 low · changing the week start moved Strength's 14-day figures (71 % / 8 → 57 % / 6) and the heatmap's counts · **by design** (weekly quotas re-bucket, round 16) — the setting's hint now says "past weeks included, so a weekly habit's history is re-read too".
- J20-07 info · About read "0.7.0" on the first run · Metro's cache (J19-06), cleared before the second run, which read 0.24.0; "Erase everything" landing on an empty Today rather than onboarding · **by design** (the copy says settings and Water stay); the water highlight's "50 oz a day on average" is the one-decimal writer dropping ".0" · correct.
- Judged correct: the weekly rule edit and its history (a "history-visibility gap" for a rule changed mid-week is the week strip's existing re-read, low, not pursued); an older day's water through the day picker; archive → restore; the cycle journey; snooze; reminders off; the encrypted export and import on the first run (second run: see J20-04).

### Round 19 (2026-10-26 night)

Four lenses over the round-18 result — a diff review with probes, an Android 14 / 15 / 16 release-readiness lens (static, with a scratch prebuild), a fresh-install journey by the browser-driving tester, and a dead-code pass — plus the backlog's "choose days for presets" step.

**Diff review**
- No findings. Judged correct: the lifetime token across the dev-time effect replay and an error-boundary replacement; the fence before the first bookkeeping write (a sync already past it finishes its journaled OS changes and the serialised replacement follows); `SupersededError` caught on every path (scheduler retry, widget, notification response, the background task's outer catch); the headless re-plan's default predicate; the web twin's signature; every Stepper call site under the new bound logic (out-of-range values stay recoverable; parsed time / volume steppers unchanged).

**Release readiness (Android 14 / 15 / 16)**
- No findings. Judged correct from the generated manifest and the installed sources: edge-to-edge on with insets applied by `Screen`, `Sheet` and the lock gate; `enableOnBackInvokedCallback="false"` (an explicit opt-out of predictive back, not a silent default); exact alarms fall to `setAndAllowWhileIdle` when denied (late, never lost) and the capability is part of the scheduling identity; flexible page sizes enabled in React Native, expo-modules-core and expo-sqlite (the APK still has to be checked — added to BUILD_ANDROID); notification actions run in the background (`opensAppToForeground: false`) with categories persisted across reboots; expo-notifications' boot receiver reloads stored requests and drops expired ones (PLAT12-03 stands; a boot timestamp alone cannot tell a pre-boot delivery from a missed alarm); Health Connect availability through `getSdkStatus`, background-read permission requested at runtime, both rationale entry points in the manifest; the widget's headless work through WorkManager with no foreground service; backup rules and a non-exported receiver set; icons, signing properties and the two patches accepted by prebuild.
- Correction to earlier notes: the background task is **chained one-time work with a 180-minute initial delay** on API 26+ (every target phone); the 15-minute periodic floor only applies to the older branch. Nothing in the app assumes it runs on time.

**Fresh-install journey** (onboarding kept at its defaults; no sample data)
- J19-01 med · the reminder form's day letters reported no checked state (visibly on, `isChecked` false) — react-native-web 0.21 ignores `accessibilityState`; the same held for every selected chip, done row and disabled day in the app on web · **fixed** — `aria-checked` / `aria-selected` / `aria-disabled` everywhere (React Native maps them to `accessibilityState` on Android); paradigm 86; verified checked on web.
- J19-02 med · the Mind timer offered 5 / 10 / 13 / 20 minutes only; a short session could not be run · **fixed** — an "Other" chip with a 1–120 minute stepper (typed or stepped); "1 minute" singular; a one-minute session ran to "Session logged" and Today's Mind moved.
- J19-03 low · "You logged water 0 of the last 7 days · 0 ml a day on average" on the first day · **fixed** — left out over two empty weeks; "No water logged in the last 7 days" after a logged week; paradigm 88.
- J19-04 low · "Did it or not · cannot be changed later" (a fragment) · **fixed** — "Did it or not. The type can't be changed once the habit exists."
- J19-05 low · "At 6:00 PM until both sessions are in this week" (the Library's schedule line) · **fixed** — "… are logged this week" (both weekly presets).
- J19-06 low · About read "Daily Tracker 0.7.0" on the web preview · **not a bug** — babel inlines the manifest for web at first transform and Metro's cache keeps it; Android reads the embedded config. Noted in §3; the cache is cleared before the next web run.
- J19-07 info · no notification prompt on web, App lock and Health Connect say "not available in the browser preview", the Reminders card's plan shows with the switch on · judged correct (the preview's own limits are stated on each card).
- Judged correct: every empty state read (no NaN / undefined / Invalid Date / blank sentence); logging and Undo; the export (a JSON file downloaded, "Backup created. Keep it somewhere safe…"); the widget choice; the Body guide links.

**Dead code**
- Seven unused imports / locals (`React` default imports excepted — the new JSX transform leaves them harmless) and one dead export (`sumValues`) removed; `NudgeCard`'s unused `activeEndMin` prop dropped. Exports used only by tests (70) and typed constants exported for documentation were left as they are.

**Reminders for presets** (backlog)
- The Library sheet's "Reminder" card: the preset's schedule in words, Change unfolds `ReminderPolicyForm` pre-filled with the preset's reminder, Done folds it, "Add to my habits" stores the choice (`presetHabitAction` in `commands.ts`; the preset's own reminder when untouched; an on-demand preset keeps its trigger). The compact "Add" button in the list stays the fast path. Paradigm 87; tests; checklist AJ1.
- Browser e2e: Stair sprint → Change → Mon / Wed / Fri → "At 10:30 AM, 2:30 PM and 4:30 PM on Mon, Wed and Fri" → Add → the habit page's Reminders row repeats it, "Next: Wed, Oct 28 at 10:30 AM"; Sugar Shield shows no Reminder card; Meditate shows "At 7:30 AM". (The movement presets' interval mode reads "Rotation", as on the habit page — by design.)

### Round 18 (2026-10-26 night)

Four lenses over the round-17 result — a diff review with pure probes, a lifecycle lens (what happens to work in flight when its owner unmounts, is reset by the error boundary, or is replayed by StrictMode), a state fuzz lens, and a copy audit by the browser-driving tester.

**Diff review**
- ADV17-01 low · the creation form's "At most, a day" stepper showed the draft's 3 while `policyFromDraft` clamps a one-time schedule to 1; the stored reminder said 1, the form said 3 · **fixed** — the stepper shows the value that will be saved and its maximum is the number of distinct valid times (`distinctTimeCount`, shared with the builder); test.
- Judged correct: the other memo dependency lists, the handler's failure paths after ADV16-01, the creation action's rule / policy, the round-17 tests.

**Lifecycle**
- LIFE18-1 med · the provider registered itself as the live store inside hydration but unregistered only from the separate ready-gated effect; a provider retired before that effect committed (its first hydrated render threw into the error boundary) stayed registered, and widget taps were handed to a dead provider · **fixed** — registration and teardown in the same effect, identity-based in both effects, `apply` on a disposed queue returns `persisted: false` without publishing; paradigms 82–83.
- LIFE18-2 med · the scheduler's debounced callback continued after unmount: after `await getPermission()` it re-planned a frozen state over its replacement's cancel-all · **fixed** — `gone` checked after the await; a lifetime fence in `current()` and the fenced `apply`.
- LIFE18-3 med · `scheduleMindEnd` awaited its cancel-before-schedule while `cancelMindEnd` ran independently; the cancel finished first and the discarded session's bell was set · **fixed** — one queue with a generation; paradigm 84; tests (the held cancel, both orders).
- LIFE18-4 low · `BodySync` set an untracked timeout per foreground event with no alive guard · **fixed** — one coalesced timer, cancelled on cleanup.
- LIFE18-5 med · (after the first fix) the fence sat before `prepare()`, another await; a scheduler retired during it still reached `syncPlan` · **fixed** — `still` carried through `reconcileAndSync` → `syncStateToOs` → `syncPlan`, re-read inside the serialised job after the OS reads and before the first write (zero writes verified); paradigm 81.
- LIFE18-6 med · (after the first fix) the boolean `alive` ref was set false by StrictMode's effect replay and never true again — every sync refused for the life of the app in dev · **fixed** — a fresh token object per effect setup, captured by each sync; paradigm 81.
- LIFE18-7 med · `replanLive` through a live store captured before the provider's teardown kept scheduling (the replace counter does not move on teardown) · **fixed** — `LiveStore.alive()` and `still = alive && replaceSeq unchanged`; test (the real service and re-plan module behind module hooks).
- The lens's harness re-ran after each fix: all seven demonstrated failures gone; registry ownership, the hand-off window under the headless lock, the retry path (no storm) and `replanHeadless` (the lock owns its sequence) judged correct.

**State fuzz**
- No breaches in 300 sequences × 150 steps (45,000 transitions; two zones, DST and the 3 am boundary, clocks moved back, every command builder, exports and sample replaces) against the validator, export → parse, reference integrity, rule-version order, clear → restore, water undo, every selector (no non-finite number), SQLite persist → load and replace → load. Generator promoted into the suite (`tests/stateFuzz.test.ts`, 6 sequences by default, `FUZZ_SEQUENCES=300` for the full run; a mutated invariant verified to fail with seed and trace).

**Copy audit** (fifteen rows; the five worth most all fixed)
- "Snooze 10" → "Snooze 10 min"; "Nudge settings" → "Reminder settings"; "At most, a day" → "Daily maximum"; "Only when behind" → "Only when I'm behind"; the Library intro explains the evidence badges; "front-load" gone; "Open source:" → "Source:"; the water evidence in ml only; "Last 14 days 3 of 14" → "Days met 3 of last 14"; the heatmap legend Empty / Partial / Complete; streak-freeze lines rewritten (and a 0-freezes variant); the reminder footnotes and interval hints as sentences; "Set Drink water" → "Set today's total"; "Target a day" → "Daily target"; the clear-day confirmation and the calendar hint rewritten. Paradigm 85.
- Kept, with reasons: "pace check" (the water mode's own name, explained where it appears), the short badge labels (the intro now gives the scale), the ⚙ icon.
- From the re-check: the Stepper's minus / plus never disabled at a bound (a tap that changed nothing) · **fixed** — disabled and faded at the bound, everywhere the Stepper is used; the switch's accessible name matched its visible label; the Daily maximum hint rewritten as sentences. Browser e2e (390×844): all fifteen rows read as intended; a set-times reminder's maximum follows the distinct time rows (1 → 2 → 1) with the bound shown by the disabled button; the water sheet keeps no behind-switch and no maximum by design.

### Round 17 (2026-10-26 night)

Three lenses over the round-16 result — a diff review with pure probes, a data / upgrade lens (migrations, the Health Connect bridge, dependency drift) and a test-audit lens (mutation testing: does the suite fail when the code is wrong?) — plus reminder set-up inside habit creation from the backlog.

**Diff review**
- ADV16-01 med · in the widget's headless path a failure after the first persist (the revision write, the fold's persist) fell to the outer catch, which redrew the pre-tap state with "That tap could not be saved" though the tap was on disk — a person who believed it logged twice · **fixed** — `loaded` becomes the applied state and `tapSaved` is set right after the first persist; the catch draws it without the notice; paradigm 77; five failure injections tested through a harness that transpiles the real handler and scripts its store and services.
- ADV16-02 med · `cycleInsights` memoised on the logs, habits, rules and entries but not on the week start, which `habitRatios` reads through `periodBounds`, so the correlations kept Monday weeks after the switch until an entry changed · **fixed** — the week-start index is a memo dependency; paradigm 78; test.
- Judged correct: the week-start call sites (complete), the planner's budgets after DST16-02, `RESTORE_LOGS`' eviction, the sleep offsets through the bridge (`{id, totalSeconds}` maps, divided to minutes by the adapter), `ToastHost`.

**Data / upgrade**
- No findings. Migrations 0 → 7 probed on real rows; the sleep-offset columns round-trip; `expo install --check` reports every dependency at the SDK's version; `expo-doctor` is not installed here (the first laptop build runs it).

**Test audit** (mutation testing — all regression gaps, no implementation bugs)
- TEST17-01 med · dropping the transaction around `SqliteStore.replace` passed the suite · **fixed** — a failed replace / persist (injected disk-full mid-write) leaves the state and the service records intact, then a retry lands whole.
- TEST17-02 med · the backup cipher's default round count was only asserted as a constant; an envelope made without an override was never checked · **fixed** — test.
- TEST17-03 med · the snapshot stamp's size half (ADV15-03) had no test · **fixed** — a same-second rewrite of another size changes the stamp (the file-system module is stubbed through Node's module hooks).
- TEST17-04 med · Sunday-first partial-week quotas (`periodRequired` with a week start) untested · **fixed** — test.
- TEST17-05 med · `keepNightPlacing` only tested for an end-time edit · **fixed** — a start-only edit is a new placing.
- TEST17-06 low · `weekdayName` untested · **fixed** — table test.
- The lens also found the round-12 simulator non-gating (a summary print in `/tmp`) · **fixed** — promoted into the suite (`tests/nudgeSim.test.ts`, 75 sequences, asserts zero breaches; a breach of the test's own invariant check verified to fail the suite with seed and trace); paradigm 80.
- Judged correct: the requested risky-target mutants (seven) were all killed; frozen clocks across DST, month starts, Mondays and the pre-3 am hours pass under other zones; no assertion-free tests, no swallowed assertions.

**Reminders at creation** (backlog)
- `ReminderPolicyForm` (the fields of the Reminders sheet, now a controlled component with `policyDraftFrom` / `policyFromPolicyDraft`), the page's `ReminderPolicySheet` a thin wrapper around it; the New habit sheet shows a "Reminders" section (Set times / Every so often / Off, Off by default) above Pin to Today; `HabitDraft.reminder` and the pure `newHabitAction(draft, id, day)` in `commands.ts` build one `ADD_HABIT` with the habit, its rule and its policy (a ROTATION choice, impossible for a custom habit, stores as none). Edit mode is unchanged (the page's sheet edits an existing reminder). Paradigm 79; tests; checklist AH1–AH2.
- Browser e2e (390×844, sample data): New habit → "Floss …", Weekly, 3 days → Reminders: Set times → 7:00 PM, Tue / Thu / Sat / Sun off → summary "At 7:00 PM on Mon, Wed and Fri" → Create → the habit page shows the schedule and "Next: today at 7:00 PM"; Change opens on Set times, 7:00 PM, M W F; a second habit with Reminders left Off shows "No reminder set". No console errors. One observation: the form's "At most, a day" showed 3 while the saved policy (clamped to one time) read 1 · **fixed** — the stepper shows the value that will be saved.

### Round 16 (2026-10-26 night)

Three lenses over the round-15 result — a diff review with pure probes, a Hermes / release-build lens over the native and bytecode surface, and a DST simulation (minute-by-minute plans through 1 November 2026 and 14 March 2027 in New York, a trip to Kolkata) — plus the week-start setting from the backlog.

**Diff review**
- ADV15-01 med · `RESTORE_LOGS` appended a restored manual entry beside the `AUTO_HC` entry a sync had written for the same habit-day inside the Undo window, so the day counted both · **fixed** — the reducer evicts the same habit/day import when a manual record returns (the precedence logging by hand already has); paradigm 71; test.
- ADV15-02 low · a toast shown just before the provider was retired by an error-boundary reset outlived it · **fixed** — `ToastHost` hides on unmount.
- ADV15-03 low · the snapshot shortcut identified "the file this process wrote" by write time alone (one-second resolution) · **fixed** — write time + size (`snapshotStamp`); a digest rejected as a cost for a corner; paradigm 72.

**Hermes / release build**
- HERM16-01 med · the widget's headless tap reached disk only after the headless lock, the load and the whole re-plan; `react-native-android-widget` grants the task 30 s (`HeadlessJsTaskConfig(…, 30 * 1000, true)`) and reports a timeout as WorkManager success, after which the process is disposable · **fixed** — the tap is persisted (and the revision bumped) before the re-plan; the fold is a second diff under the same lock, skipped when the app came alive meanwhile (its scheduler plans for itself; the deliveries stay in the journal for it). A press-style inbox was rejected: a tap has no key to dedupe a replay by, and a replayed drink would double-count where a lost one is visible (the tile does not move). Paradigm 76; checklist AG6.
- Judged correct by the reviewer: the `Intl`, regex and API surface used under Hermes, the 16 KB page-size flags of the native dependencies, the plan's dependency list (`state.settings` covers the new week-start field), fixed reminders across the DST fold, the snooze of fixed slots, Health Connect step bounds on a 25-hour day.

**DST simulation**
- DST16-01 med · the Today card placed the last snack and the snooze by wall-clock minutes, so on the autumn night a snooze "until 01:45" taken at the first 01:45 read as due · **fixed** — anchors by real minutes from now, the due clock read off the instant (`atClock`); paradigm 73; test.
- DST16-02 med · the planner charged a habit's budget (and advanced the rotation) before `push` dropped a repeated-hour duplicate, so a 30-minute reminder with a budget of eight lost its 03:30 slot and the rotation skipped a turn · **fixed** — `push` returns whether it kept the candidate; budgets and the ordinal move only then (rotation, interval and fixed paths); paradigm 74; tests.
- DST16-03 med · a Health Connect night stored no zone: a reread after a trip re-dated it to the new zone's calendar day (same id, so the merge took the new day) and the bedtime spread measured New York bedtimes on the Kolkata clock · **fixed** — `startOffsetMin` / `endOffsetMin` on the night (the recorder's zone offsets from the bridge — it passes `startZoneOffset` / `endZoneOffset` for sleep though its TypeScript types omit them — else the phone's at import), used by `dayAtOffset`, `sleepClockMin` and the spread; `keepNightPlacing` keeps the first placing across a reread with the same times; schema v7 (two nullable columns) and the export shape; paradigm 75; tests incl. the migration.
- Judged correct: the tracking-day boundary on both DST nights for boundaries 0, 3 and 4 (no past slots, no misfiled days in a minute-by-minute run), the spring-forward gap, water pace at 90 min across the fold, the cap counting two deliveries from the repeated hour, weekly freezes and streaks across the change, the cycle timeline, the widget and Today selectors after a zone change.

**Week-start setting** (backlog)
- `Settings.weekStart` ('monday' | 'sunday'), Settings → Day & cycle → "Week starts on"; `weekStartIndex` / `weekEndIndex` / `weekStartOf(day, start)`; a trailing `weekStart` parameter through `periodBounds` / `periodStartOf` / `periodQuota` / `periodRequired` / `segmentStartOn` / `cadenceSegments` / `evaluateStreak`, the selectors (segment cache key, `periodDoneOn`, `habitRatios`, the view memo, `planHabitOf`), `nextPeriodStart`, `workoutsThisWeek`, `monthCells` / `weekdayLetters`, the day picker, the cycle calendar, the heatmap and the reminder weekday chips; choosing it also moves the weekly summary to the week's last day. Paradigm 70; tests; checklist AG1.
- Browser e2e (390×844, sample data): Monday default → Sunday → the heatmap labels S·T·T·S, the October 2026 calendar S M T W T F S with the 1st under Thursday, back to Monday → M T W T F S S; no console errors after a full reload. One finding: the Reminders card's summary hint was the hard-coded "Sundays — how the week went" · **fixed** — `weekdayName(s.weeklySummary.weekday)` ("Saturdays —" for Sunday-first weeks). The tester's first run also hit `ReferenceError: weekStartIndex` from a stale hot-reloaded bundle — gone after a dev-server restart, not a code fault.

### Round 15 (2026-10-26 night)

Three lenses over the round-14 result — a diff review with probes, a platform / Android-13 lens, and a performance lens with a validated two-year fixture (12 habits, 8,000 entries, 6,000 drinks, 3,000 snacks, 2,000 ledger events; container ms × 4 ≈ phone) — plus the B3 follow-up from the backlog.

**Diff review**
- ADV14-01 high · the hourly refresh snapshotted `committed()`, which after an opt-out or erase whose save was pending or failed still said "backup on" — the copy the opt-out had just deleted came back · **fixed** — `committedSource(view)`: committed state, vetoed by the newest state's policy and by a pending replace; shared by `BackupSync` (now reading the live store) and the headless live paths, which previously snapshotted `current()`; paradigm 66; tests.
- ADV14-02 med · the pinned Steps card read Health Connect only; a hand-logged Steps habit left it as the "door to Body" placeholder although the picker promised "or the Steps habit" · **fixed** — `stepsCardViewFromHabit` (present whenever the habit exists; 7-day series and average from `habitDayValue`); test.
- Judged correct by the reviewer: hostile pinned values on import, the claim gate, the picker's accessibility, `ratiosByDay` against the heatmap at 3 am and across DST, SDK 36 / edge-to-edge / 16 KB flags, backup rules, FLAG_SECURE.

**Platform (Android 13+)**
- PLAT15-01 med (a real device bug) · Expo returns `denied` + `canAskAgain: true` on a fresh Android 13 install (notifications not enabled because POST_NOTIFICATIONS was never asked for); `toState` read it as blocked, so onboarding and the Reminders card never showed "Allow notifications" · **fixed** — `classifyPermission({ status, canAskAgain, runtimeGranted })` with `PermissionsAndroid.check(POST_NOTIFICATIONS)` on API 33+ (expo-modules-core's `PermissionsService` confirmed: `canAskAgain = !blocked`, blocked = rationale no longer shown); paradigm 67; the permission matrix tested; checklist AF1.
- PLAT15-02 low · the exact-timing copy promised "ring at the planned minute" · **fixed** — "closer to the planned minute; battery settings can still delay them".

**Performance (two-year fixture)**
- PERF15-01 med · `habitView`'s cross-state memo compared the whole `rules` and `policies` tables, so one reminder edit rebuilt all twelve views (14 / 56 ms) · **fixed** — per-habit `rulesFor` rows and `policyFor` compared instead; test (a policy or rule edit on Steps leaves Water's view object).
- PERF15-02 med · the plan cache was keyed on the state identity, so a body-only update (a Health Connect read) re-planned (4.3 / 17 ms) · **fixed** — a last-plan memo over the thirteen slices the planner reads; the exact-instant key stays (paradigm 29's reasoning); test.
- PERF15-03 low · Today filtered and sorted two years of drinks on every local render and built every card's chart whether shown or not · **fixed** — `newestOn` memoised per log, cards built on demand from the shown list.
- PERF15-04 med · the hourly refresh re-parsed the whole existing snapshot (`keepUnreadable`: 31 / 125 ms) before serialising the next (9 / 35 ms) · **fixed** — the write time of the file this process wrote or found readable is remembered; a file with another write time is still checked (a restore from a newer app is still set aside).
- Measured and left: cold `cycleInsights` 11 / 44 ms on the Cycle tab (warm 0.0005 ms; slice-keyed; below round 9's figure); `nudgePlan` on a clock tick 3.8 / 15 ms (near budget, exact instant kept); JSON web store stringifies the whole state (web is the preview, not the product); SQLite persist 1 / 4 ms with one upsert per drink.

**B3 follow-up — Undo** (from the backlog)
- `components/ui/Toast.tsx`: one toast at a time, 6 s (×2 with a screen reader), announced, fade honouring reduce-motion, clears the tab bar, hidden on `replaceEpoch`; `ToastHost` mounted in the root layout under the lock gate.
- `src/domain/habits/records.ts`: `LogRecord`, `findRecord`, `dayRecords`, `restorable`, `MAX_RESTORE_RECORDS`; reducer `CLEAR_DAY` removes exactly `dayRecords`, `RESTORE_LOGS` appends what is restorable; provider `removeLog` / `clearDay` return the records, `restoreLogs` puts them back.
- Remove in the Logged list → "Removed 250 ml at 9:10 AM · Undo"; Clear day in the amount sheet → "Cleared 500 ml today · Undo" (the sheet closes first); paradigm 68; tests; checklist AF3.

### Round 14 (2026-10-26 night)

Three lenses over the round-13 result — a diff review with probes, a state-machine / interleaving review of `TrackerProvider` (the reviewer transpiled the real closures and drove them with the real SQLite store), and a UX / accessibility pass over the Logged list and the month picker — plus the B5 feature. Ids are theirs.

**Diff review**
- ADV13-01 high · `beginHandling` answered false for a key another caller was still writing to the inbox, and the launch handler then cleared the OS copy of the press — a death in that window lost it · **fixed** — `ClaimGate`: a duplicate caller waits for the first claim's write; a failed write releases the claim; paradigm 62; tests.
- ADV13-02 med · the picker read the heatmap's 26-week strip, so every month beyond it drew blank · **fixed** — `ratiosFor(days)` per month (`ratiosByDay`); paradigm 64; test.
- ADV13-03 med · the Reminders card showed a sync failure only while reminders were on; a failed cancel-all after turning them off was invisible · **fixed** — shown either way, with wording for the off case ("could not be cancelled yet; they may still ring").

**State machine / interleaving**
- SM-01 high · a failed save's retry was scheduled without checking whether the provider still existed; the error boundary's reset mounts a new provider, and the probe showed the old one's retry re-writing a drink after the new one's `replace(empty)` · **fixed** — `SaveQueue` (`src/state/saveQueue.ts`) owns committed / target / generations / retries / waiters and is retired on unmount or reload; the reload and replace paths use it; paradigm 59; six tests including the exact scenario (deferred write → dispose → reject → no timer, no pass, waiters false).
- SM-02 med · after a notification press the widget redraw and the snapshot ran on `applied` alone, so a drink whose save gave up showed on the widget and could enter Auto Backup (the widget-tap path already gated on `persisted`) · **fixed** — gated on `persisted`, drawn from `committed()`; the foreground `BackupSync` waits for `commitPending()` and snapshots `committed()` (the reviewer's audit note); paradigm 61.
- SM-03 med · a failed open / load still set `ready` with the placeholder: onboarding showed, edits were accepted in memory, and the scheduler could cancel real reminders against the empty plan · **fixed** — `loadError` + `retryLoad` in the context; the layout shows an error screen with Try again and nothing else mounts; paradigm 60.
- Judged correct by the reviewer: publish / apply ordering, dispatch during flush, replace during a failing flush, reload fences, waiter settlement, the replacement bookkeeping of rounds 12–13.

**UX / accessibility**
- UX14-01 = ADV13-02 · **fixed**.
- UX14-02 med · filled day cells put the theme text on a 25–85 % tint of the category colour — below AA on several · **fixed** — partial days are rings (the number stays on the surface), full days a solid disc with a measured ink and a fill nudged in OKLCH to 4.5:1 (`inkFor`, `readableFill`); paradigm 65; a test over every category colour in both themes.
- UX14-03 med · "Clear day" removed every record of the day with no confirmation · **fixed** — `confirmDestructive` naming the day and the amount.
- UX14-04 med · the month title was labelled "Jump to this month" (its text unread), month changes were silent, and days of another year were read without the year · **fixed** — label = the month, hint only away from this month, `accessibilityLiveRegion`, year in older-day labels (picker and cycle calendar).
- UX14-05 low · 7 columns in the sheet's padding left ~46 dp cells on a 360 dp phone · **fixed** — the grid bleeds 12 dp into the sheet padding.

**B5 — Today's pinned cards** (from the backlog)
- `src/domain/today/pinned.ts`: ids, titles, `sanitizePinned` (known ids once, cycle always present, default for junk), `setPinned`, `movePinned`; `Settings.pinned` typed `PinnedCardId[]` and sanitised in `normalizeSettings`.
- `components/tracker/PinnedCardsSheet.tsx`: switches and up / down arrows per card, the cycle row bound to `cycle.showOnToday` and hidden while tracking is off (a hidden cycle entry moves last), "Not shown" for cards that are off.
- Today renders `settings.pinned` filtered by availability; Steps and Sleep share `StepsSummaryCard` / `SleepSummaryCard` with the Body tab (`components/body/BodySummaryCards.tsx`) and show a door to Body until Health Connect delivers; Settings → Today lists what is showing and opens the sheet.

### Round 13 (2026-10-26 night)

Two lenses over the round-12 result — a diff review with probes (the records-beside-the-state change, the inbox, the replace path) and a privacy / threat review of the whole app — plus the B3 feature. Ids are theirs.

**Diff review (probes run in pure TypeScript against the real modules)**
- ADV12-01 high · a schedule or cancel the OS refused was a `console.warn`; the sync resolved, health cleared, nothing retried — a transient refusal left a reminder unscheduled until the plan next changed · **fixed** — the sync writes its honest ledger, then throws `OsRefusedError` (count of refused schedules / cancels); the scheduler retries after a minute and the Reminders card shows it; `cancelAll` the same; paradigm 52 rewritten.
- ADV12-02 med · a compare-and-set with "expected: no record" could not see a replace between the read and the write (reproduced in SQLite and JSON): the old state's sync wrote its ledger after an erase and the next sync counted its rings for the new state · **fixed** — `readRecord` returns `{value, version}`, the version carries a replace generation the store bumps in the same transaction; `writeRecord` compares versions and returns the new one; paradigm 53; the store contract covers a "nothing yet" read across a replace and racing writes.
- ADV12-03 high · a replace that failed to commit (and was retried) let the 600 ms re-plan read the old journal and fold the old state's deliveries into the restored state; a replace during a re-plan did the same · **fixed** — `replacePending` gates the re-plan (and the foreground sync, and `replanLive`) until the replace is in the database; the in-flight fold is fenced on `replaceSeq()` and a fenced re-plan is abandoned as superseded; paradigm 54.
- ADV12-04 high · `consumeLaunchResponse` cleared Expo's last response before the inbox write; a death in between lost the press that launched the app · **fixed** — `launchResponse` + `clearLaunchResponse` after `beginHandling`; paradigm 55.
- ADV12-05 low · the JSON store's compare-and-set was read-then-write without a transaction; two concurrent writes with the same expectation both won (reproduced under `Promise.all`) · **fixed** — one queue per JsonStore instance; the contract test races two writes on both stores (the SQLite one through the same one-at-a-time queue the app uses).
- Judged correct by the reviewer (no finding): the serialised queue has no deadlock cycle, the provider's replace generation and the boundary merge, the widget's committed() path.

**Privacy / threat review**
- PRIV-01 high · with the app lock up, `daily-tracker://habits?preset=meditate&t=1` from any app mounted the habits route and opened its Sheet — a second Modal that Android stacks above the gate's — showing "Open habit" (the habit exists) or "Add to my habits" (and allowing the add) without authentication · **fixed** — the gate publishes `lockState`; `Sheet` renders its Modal only while unlocked and shows once the gate is down; paradigm 56; checklist AD5.
- PRIV-02 high · `daily-tracker://habits?preset=__proto__` (also `constructor`, `toString`) passed `PRESET_BY_ID[...]` and crashed the app in the evidence block (reproduced with a pure probe) · **fixed** — `presetById` (own properties only) everywhere an id comes from outside — the route, Today's nudge text, the habit page, `addPreset`, onboarding; tests cover the inherited names; paradigm 57.
- Passed without findings: backup encryption (AES-256-GCM, PBKDF2 200k, fresh salt / IV, authenticated header, bounded import, password cleared), the Android backup allowlist (only `files/backup`; live SQLite / WAL, preferences, transfer cache and widget images excluded), Health Connect (seven read types, no writes, package-restricted rationale), no runtime network calls or analytics, bundled fonts, cycle notifications on a PRIVATE channel (AOSP redaction checked), the widget model (selected habits only, private files, unpredictable names), release error screen hides details.

**B3 — correctable activity history** (from the round-10 backlog)
- `src/domain/habits/activity.ts` (`habitActivity`): the records behind a habit for a set of days, newest first, with amount, time, origin (widget / reminder / Health Connect / Sugar Shield) and whether it is removable (imported records are not — the next read re-adds them); the Sugar Shield rule (`snackCountsFor`) decides which snacks belong to which habit, so Remove never takes a row the count did not include.
- `components/tracker/ActivityList.tsx`: the "Logged" card on every habit page (it replaces the water-only "Today's water" list); today by default, "Show the last 7 days" with day headers; Remove behind `confirmDestructive`; a footnote when imported rows are listed.
- `components/tracker/DayPickerSheet.tsx` + `src/domain/time/month.ts` (shared with the cycle calendar, which was refactored onto it): "Fix an older day" under the 26-week heatmap when the habit is older than the 7-day strip; days tinted by the day's done ratio; days before the habit and days to come are not offered; a yes/no day flips in place, an amount opens the amount sheet in set mode for that day (one sheet at a time).
- Not done: an "Undo" toast after Remove (the row is gone; adding it back is one tap on the habit's button) — backlog.

### Round 12 (2026-10-26 night)

Five lenses over the round-11 result — diff review (with probes), data / upgrade audit, finish-line audit, Android platform audit, browser e2e — plus the simulator rerun. Ids are theirs.

**Simulator**
- SELF12-00 high · two set times a minute apart across 3 am merged into one notification stamped with one day; the other habit's ring was counted on the wrong day · **fixed** — the merge needs the same tracking day; tests.
- SELF12-01 low · `cancelAll` used `cancelAllScheduledNotificationsAsync`, which took the meditation bell down with the reminders · **fixed** — per-id cancels that skip the bell.

**Diff review**
- DR12-01 high · the bookkeeping lived in AsyncStorage while the state lived in SQLite: an erase or restore cleared one and not the other, and a sync in flight across `cancelAll({forget})` wrote the old record back · **fixed** — paradigms 46 (rewritten), 49; the store contract tests cover `readRecord` / `writeRecord` / `replace`.
- DR12-02 med · `replaceEpoch` drove a separate cancel-all effect rather than the re-plan; equal plans before and after a replace skipped the sync · **fixed** — `replaceEpoch` is a dependency of the debounced re-plan; the separate effect is gone.
- DR12-03 med · a cancel the OS refused dropped the entry from the ledger · **fixed** — refused ids stay (sync and cancel-all); paradigm 52.
- DR12-04 low · a pending alarm past the 30-minute grace is cancelled and not charged · **rejected** — Expo removes a request at delivery; a one-shot alarm still pending half an hour late has not rung, and the window for a race is milliseconds.
- DR12-05 med · a sync failure was a `console.warn`; the schedule stayed stale until the next state change · **fixed** — `syncHealth` / `onSyncHealth`, the Reminders card shows the last failure, the scheduler retries after a minute; paradigm 52.
- DR12-06 med · the next-ring line read the plan before the global pause and a met weekly quota after a far set time · **fixed** — order: off → paused → paused until → plan → done for the period → far set time → done today → nothing; tests.
- DR12-07 low · "today" / "tomorrow" came from the tracking day, so a 1 AM ring read "today" at 11 PM · **fixed** — calendar day of the ring against the calendar day now, on the card and in the Settings preview; tests.
- DR12-08 med · a widget tap whose live save gave up drew `live.current()`, which held the unsaved change; a second failed tap drew the first · **fixed** — `LiveStore.committed()` (what the database holds) is drawn under a failed save, whether or not this tap applied.
- DR12-09 low · a stepper restored to its opening value ignored bounds a sibling field had moved meanwhile · **fixed** — clamped to the current bounds.

**Data / upgrade audit**
- DATA12-01 high · the bookkeeping parser kept any array element; one damaged row crashed every later sync · **fixed** — entry-by-entry validation; paradigm 51; tests.
- DATA12-02 med · unbounded lists and `ledger.find` per entry · **fixed** — caps and a Map index.

**Android platform audit**
- PLAT12-01 high · a press handed to the headless task was lost if the process died before the write (expo-task-manager keeps nothing) · **fixed** — the durable inbox and replay; paradigm 50; tests; checklist AC2–AC3.
- PLAT12-02 = DR12-01.
- PLAT12-03 med · a reboot removes expired DATE triggers before Expo's boot receiver reschedules; the next sync reads them as rung (a phantom spends the cap) · **deferred** — there is no JavaScript boot signal without a Kotlin module; documented, checklist AC5 measures it.

**Finish-line audit** (the user's asks, end to end)
- FL12-01 low · the Remind-me switch showed on on-demand policies (the Sugar Shield's follow-up, cycle reminders) and promised a pause that does not exist · **fixed** — hidden there.
- FL12-02 = DR12-06. FL12-03 = DR12-07.
- FL12-04 low · "the Today card still offers it when it is next in the rotation" was false for an Off or paused movement habit (the selectors leave it out) · **fixed** — copy matches the rotation.
- FL12-05 low · the Water door (`/habits?preset=water`) opened the Library once; a second tap after dismissing did nothing · **fixed** — the push carries the instant, the tab watches both.
- FL12-06 low · water copy said "ml behind pace" to someone who set ounces · **fixed** — `formatVolume` in the planner (`PlanSettings.units`); tests.
- FL12-07 low · the weekday chips carried a `radiogroup` role (a screen reader announces one choice) · **fixed** — plain group with a label.
- FL12-08 low · onboarding and the phone guide said nothing leaves the phone, while the Android backup (on by default) carries an encrypted copy to the Google account · **fixed** — both say so.
- Deferred again: reminder set-up inside habit creation, B3 activity history, B5 pinned-card picker, Settings anchors.

**Browser e2e (round-11 build)** — weekday chips, paused-stays-paused, the stepper's tap-and-Done, freezes across a cadence change, the Water door — passed.

### Round 11 (2026-10-26 night)

Five lenses over the round-10 result: diff review, plan / delivery simulator, UX walkthrough, native paths, browser e2e. Ids are theirs.

**Diff review**
- DR11-01 high · per-day budgets and the cap counted the latest event per lifetime slot id, so a slot that rang, was snoozed and rang again spent one · **fixed** — every FIRED event per occurrence counts (`deliveriesOn`); `latest` settles only; paradigm 44; tests; checklist AB1.
- DR11-02 high · a storage read failure in the notification service read as an empty record; the write that followed forgot the ledger and the journal · **fixed** — the read throws, the sync gives up and is retried; paradigm 47.

**Simulator** (random 14-day schedules; rings, taps, snoozes, deaths between the OS change and the record)
- SIM11-01 high · the monotonic FIRED dedupe (a re-ring ignored when an equal-or-later FIRED existed) lost occurrences when a TAP's own FIRED raced the sync's · **accepted, reverted** — exact `id|at` dedupe; TAP / OPEN write nothing, the sync owns FIRED; the round-10 TAP test rewritten.
- SIM11-02 / -03 (its I1, I5) · budgets counted lifetime slot ids · the DR11-01 fix; the simulator reruns clean.

**Native paths**
- NP11-01 = DR11-02.
- NP11-02 high · erase / restore / sample data kept the previous state's ledger and journal; its rings were folded into the new state as deliveries · **fixed** — `replaceEpoch` in the provider, `cancelAll({forget: true})` in the scheduler ahead of the re-plan; cancel-all queued, never skipped; paradigm 46; checklist AB2.
- NP11-03 high · a death between the OS mutation and the ledger write left alarms the next sync misread (cancelled = delivered, scheduled = not ours) · **fixed** — one bookkeeping record with `cancelling` / `scheduling` intents written before the OS changes and cleared after; `deliveries()` resolves a dead sync's intents; a one-time fold of the two old keys; paradigm 45; tests; checklist AB3.
- NP11-04 med · `beginHandling` kept its in-flight claim when the handled-set read failed · **fixed** — released on failure.
- NP11-05 med · a widget tap through a live store that gave up saving drew the unsaved numbers and snapshotted them · **fixed** — `persisted: false` draws what is on disk with the "could not be saved" notice and skips the snapshot; checklist AB11.
- NP11-06 low · the background task's second re-plan after an import reused the pre-read instant · **fixed** — a fresh context after the import, in both branches.

**UX walkthrough**
- UX11-01 med · time rows keyed by their text remounted on every keystroke · **fixed** — stable row keys.
- UX11-02 med · saving the editor resumed a paused schedule · **fixed** — paused stays paused on Save; "Paused ·" on the card; the editor's footnote names the switch; paradigm 48; tests; checklist AB4.
- UX11-03 low · the stage badge clipped and the value row overflowed at large font sizes · **fixed** — minimum height and wrapping.
- UX11-04 low · "Skipped once the day is 60% done" read as the clock · **fixed** — "once 60% of today's target is logged".
- UX11-05 med · freezes a person set to the cadence's default were moved by a cadence change · **fixed** — a touched flag instead of an equality test; checklist AB9.
- UX11-06 med · tapping a formatted stepper value and pressing Done re-parsed it (67.6 oz → 1,999 ml) · **fixed** — text equal to what the field opened with returns the value it opened with; checklist AB8.
- UX11-07 low · the Reminders card's copy over-generalised (Done / Snooze for water, a Today nudge for non-movement habits) · **fixed** — copy per kind.
- Improvements taken: the "Next: …" line on the Reminders card (paradigm 48; checklist AB5); the Water summary opens the Library on the Water preset (checklist AB10); **weekday selection for set times** — schema v6 `weekdays_json`, the planner skips other calendar days, "At 6:00 PM on Mon, Wed and Fri" (weekdays / weekends / lists), seven chips in the editor with the last day not removable, the validator bounds it, and the next-ring line reads the policy when the chosen day lies past the plan's horizon (checklist AB6–AB7).
- Deferred: reminder set-up inside habit creation (the editor is one tap away on the habit page).

**Browser e2e (round-10 build)** — the editor on custom, preset and movement habits: modes, times, interval, only-when-behind, the cap, Save and Cancel, the card text after saving — passed. Screenshots taken right after dismissing a sheet sometimes caught the web Modal's slide-out as a dim band; not a stuck overlay.

### Round 10 (2026-10-26 night)

Six lenses over the round-9 result, each with a harness: diff review, cache audit, pipeline state machine, upgrade / downgrade, finish line, browser e2e. Ids are theirs.

**Diff review**
- DR10-01 med · a failed live save still consumed the ledger (the delivery accounting died with the process) · **fixed** — the delivery journal: reports are journaled before the ledger is replaced and acknowledged only after `apply` resolved `{persisted: true}` (headless callers acknowledge after `store.persist`); paradigm 40; tests; checklist AA2.
- DR10-02 med · two concurrent reconciliations could leave the older plan installed · **fixed** — `reconcileAndSync` runs on one promise chain per runtime (read → fold → plan → fold is one job).
- DR10-03 med · a snoozed parent blocked the recording of newly merged constituents · **fixed** — `firedActions` dedupes per occurrence (`id|at`) among FIRED events, not by lifetime slot id; tests.
- DR10-04 med · non-movement interval budgets counted missed slots and ignored earlier deliveries after re-anchoring · **fixed** — `budgetFor(dayOf(at))` in the INTERVAL and FIXED loops, no local counter; paradigm 41; tests; checklist AA6.
- DR10-05 med · settled pre-boundary rotation slots suppressed the next tracking day (night-owl hours, DST dates) · **fixed** — `continue` past a settled or ineligible slot instead of `break`; test; checklist AA7.
- DR10-06 med · the session sweep matched newest-first and could double-count a staged night · **fixed** — the open group with the largest overlap share takes the session (oldest on a tie), so the result depends on the records, not on how many groups are open; test.

**Cache audit**
- CA10-01 med · the minute-keyed plan cache returned an expired or lead-violating reminder for up to 59 s · **fixed** — keyed by exact `nowMs` (the planner uses exact milliseconds; callers already pass a stable instant per pass).
- Checked and clean: 132,912 differential assertions over 3 × 2,200 reducer steps; segment cache beyond its cap; memory flat over 10,000 states.

**Pipeline state machine**
- PIPE10-01 med · snoozed / swapped slots were permanently re-offerable and a snoozed delivery never spent the cap · **fixed** — occurrence dedupe (DR10-03); the planner's re-offer is settled by the ring that follows it; test; checklist AA1.
- PIPE10-02 med · ledger acknowledgement preceded the durable FIRED commit · **fixed** — the journal (DR10-01).
- PIPE10-03 med · merged notifications scheduled by v0.12 settle only their primary constituent after the upgrade · **deferred** — it lasts one sync: the first re-plan after the update re-signs every pending request (the signature changed in round 9) and the stale ones are replaced; a reconstruction from policy metadata is not worth the code for a window of minutes. Noted in the downgrade / upgrade caveat.
- PIPE10-04 med · exempt deliveries (summary, cycle, follow-ups) spent the automatic cap · **fixed** — `EXEMPT_ID` (`summary:` / `cycle:` / `event:`) outside the count, anything else counts (legacy ids included); test; checklist AA5.
- PIPE10-05 med · tapping yesterday's notification charged today's cap · **fixed** — responses are stamped with the payload's day; TAP writes one FIRED per slot and day and none when the sync already recorded the ring; test; checklist AA4.
- PIPE10-06 med · a background Health Connect import left the OS schedule based on pre-import progress · **fixed** — the background task re-plans with a fresh context after an import changed the state (live and headless branches); checklist AA8.
- PIPE10-07 med · a clock set back rescheduled a delivered notification · **fixed** — a ledger entry absent from the pending set has rung whatever the clock says; test; checklist AA3.

**Upgrade / downgrade**
- UP10-01 med · a v0.13 export imported into v0.12 silently drops `via` · **rejected** — a new data version would make every older build refuse the file outright, which is worse for the one person who downgrades than losing the merged-reminder link; the phone guide now says what an older build keeps. The SQLite downgrade already refuses cleanly.
- Checked and clean: migrations 1→5 from their shipping tags, v0.12-shaped states through both importers, envelopes 1 and 2, the plugin diff.

**Finish line**
- FL10-01 med · habit reminders could not be configured (customs created with `NONE`, presets only switchable) · **fixed** — `ReminderPolicySheet` + `describePolicy` / `policyFromDraft`; the Reminders card renders the saved policy and its footnote says what the mode means (set times ring outside active hours; intervals do not); hidden for the Sugar Shield's event policy; paradigm 42; tests; checklist AA10–AA12.
- FL10-02 med · "Rest of today" resumed at the active end (one minute after 21:00) · **fixed** — pauses to the next day boundary; checklist AA9.
- FL10-03 med · the ounce setting was ignored by the water row, detail, chart, backfill and editor · **fixed** — `formatHabitValue` / `habitAmountText` / `habitUnit`, `describeRule(units)`, the editor's target stepper formats and parses in display units; paradigm 43; tests; checklist AA13.
- FL10-04 med · six-month / year Body extrema covered 30 days · **fixed** — `MetricSeries.daily` feeds best / lowest for the selected range; checklist AA14.
- FL10-05 low · destructive quick taps had no confirmation · **fixed** — `confirmDestructive` shared by cycle, settings, the reminder sheet and the drink list (an exact-record Undo is backlog B3); checklist AA16.
- FL10-06 low · the Water summary was a dead target without a water habit · **fixed** — routes to the Library.
- Doc claims · **fixed** — library "defaults are editable" now true and says where; weekday rows and the 20:30 luteal check-in say what exists; pinned-card picker marked backlog B5; source-link rule scoped to rows that cite a study; freezes default by cadence (`defaultFreezes`) in the seed and the editor; week-start and per-habit sounds carried in §7.
- Improvements B1–B5 · B1 (installed-APK gate) is the device run already owed; B2 and B4 done above; B3 (correctable activity history with Undo) and B5 (pinned-card picker) → backlog.

**Browser e2e (round-9 build)** — onboarding, the water-goal hint, adding a Library habit, oz on Today, sample data, Body cards, the cycle calendar's estimated / predicted wording, the end-of-day pause — all passed. The two "fails" are not defects: the COUNT quick action is labelled "Log one <name>" on purpose (checklist Z12 wording updated), and 330 ml is not a tap-size preset by design (type it); checklist Z13 now uses 350.

### Round 9 (2026-10-26 night)

Six lenses over the round-8 diff, each with its own harness: a diff review with probes (`/tmp/r9-diff-probe.ts`), a randomised command fuzzer (`/tmp/fuzz-r9.ts`), a planner simulator (`/tmp/sim-r9.ts`), a performance profile (`/tmp/perf-r9.ts`), a copy / accessibility audit (`/tmp/council9-copy.ts`) and a browser e2e. Ids are theirs.

**Diff review** (round-8 changes, probed)
- DR-01 med · PHASE_START/period with offset 0 skipped the logged start (returned the predicted one, confirmed) · **fixed** — `offsetDays >= 0` counts from the logged start while that day is ahead; test.
- DR-02 med · the working-tree early-break in `distinctSessions` double-counted overlapping workouts (in-place replacement broke the start order) · **fixed** — rewritten as an active-set sweep over kept groups by last end; the `longest` bound gone; test under an anomalous 400-hour record.
- DR-03 med · water reconciliation not idempotent after an upstream correction (a moved import stayed evicted, then came back) · **fixed** — twins judged on the current upstream batch every sync.
- DR-04 med · one manual drink erased two distinct imports eight minutes apart · **fixed** — `twinImports()` one-to-one, closest pair first, each manual row used once; paradigm 39; tests; checklist Z7.
- DR-05 med · a type revoked and re-granted never recovered its gap (stayed in `backfilled`) · **fixed** — after a complete read `backfilled` is the granted set, so a re-grant backfills 30 days again; checklist Z8.
- DR-06 low · the widget fit helper still truncated long values at 32 dp ("1,8…") · **fixed** — `ringValue()` drops the unit, then compacts thousands, before the 9 dp floor; the accessibility label keeps the full value; test; checklist Z10.
- Checked and fine: weekly COUNT "done", sparse-symptom NaNs, a sole future start, partial-permission pruning, legacy / envelope-2 round trips.

**Fuzzer** (80 sequences × 65 commands, two seeds, DST dates, four zones, SQLite persist / load)
- FZ-01 med · editing an imported drink after a zone change kept the old zone but computed the day in the new one · **fixed** — the edited row's day comes from the zone it was recorded in (paradigm 39).
- Checked and fine: reducer purity, duplicate keys, validation, JSON / SQLite semantic persistence, finite non-negative ratios, streak bounds, Today sums, deterministic / unique / capped plans. Noted, not a finding: preset construction carries own `undefined` properties that JSON omits (strict equality is not an invariant); strength ticks keep the workout's start day with `at` = its end (documented).

**Planner simulator** (November DST night, New York)
- PS-01 med · headless re-plan built the plan before folding the deliveries made while closed, spending the cap twice · **fixed** — `reconcileAndSync()`: deliveries first (`firedSinceLastSync`), then plan, then the sync's own fired records; both headless paths and the in-app scheduler; paradigm 36; checklist Z1.
- PS-02 med · merged notifications kept only the first slot's id; a snooze on the merged one brought the second slot back two minutes later · **fixed** — `mergedIds` on the nudge and the payload, events per constituent with `via` (schema v5 `ALTER TABLE nudge_event ADD COLUMN via`), cap and budgets count a delivery once, swap / snooze re-offers search every constituent's habit; tests; checklist Z2.
- PS-03 med · midnight reopened completed rotation progress and reset the cap three hours before the tracking boundary · **fixed** — every slot carries `dayOf(at)`; eligibility, budgets and the cap are per tracking day; paradigm 37; test; checklist Z4.
- PS-04 med · an automatic snooze could ring outside active hours (20:50 → 21:05) · **fixed** — automatic snoozes past the active end are dropped for the day; fixed clock times keep theirs; test; checklist Z3.
- PS-05 med · a met weekly quota still generated tomorrow's same-week reminders · **fixed** — `PlanHabit.periodEndsOn` from `periodBounds`; `settled()` covers every slot up to it; test; checklist Z5.
- PS-06 med · the live countdown continued after every movement habit was done (legacy rotation fallback) · **fixed** — `liveNudge` filters done / period-met habits and returns null when the planner offers nothing (the "due now" case kept); checklist Z6.

**Performance** (two-year fixture: 25 habits, 6,000 drinks, 900 sleep sessions, 30 cycles)
- PF-01 med · a water tap rebuilt every habit's lifetime streak (37 ms on the render thread) · **fixed** — per-habit view / day-value memo keyed on rules, policies, the habit's log slice and the day; now 3.4 ms for 25 views; paradigm 38; test.
- PF-02 med · cadence lookups quadratic; cold cycle insights 0.43 s · **fixed** — `cadenceSegments()` walked once per rule history (a year past the asked day), `segmentStartIn()` lookup, incremental period counts in `habitRatios`, arithmetic `periodRequired`; cold insights 48 ms, monthly year series 1.3 ms; tests.
- PF-03 med · one anomalous long sleep span defeated the bounded dedupe scan (1.6 M comparisons at 1,800 sessions) · **fixed** — the active-set sweep (DR-02); comparisons bounded by the open set; test.
- PF-04 low · hydration reconciliation was a Cartesian search · **fixed** — manual rows sorted once, binary search for the window (DR-04).

**Copy / accessibility**
- CA-01 med · the week summary counted a monthly habit's whole-month completions as this week's · **fixed** — a monthly habit contributes its share of the week (quota × 7 / month length, at least 1); test.
- CA-02 med · the estimated-phase flag never reached the ring, Today or the calendar · **fixed** — `phaseQualifier()` shared by PhaseRing, DaySheet, CycleCalendar and Today ("(estimated)" up to today, "(predicted)" after); test — this was also the e2e's one failure.
- CA-03 med · summary cards hid their timestamp and detail from TalkBack · **fixed** — the label includes detail and time.
- CA-04 med · water steppers said "Tap to type a time" and onboarding announced bounds from a formatter that ignored its argument · **fixed** — `Stepper.inputKind` ("an amount"); the onboarding formatter formats the value it is given; checklist Z11.
- CA-05 med · permission copy promised empty metrics that keep their data · **fixed** — "nothing new of these is imported … what was imported before stays until you remove it" on the connection card; the Body tab matches.
- CA-06 med · "One tap adds" did not control Today's water button (hard-coded 250 ml) · **fixed** — label and action follow `tapSizeMl`; checklist Z13.
- CA-07 med · row action labels promised actions the handlers do not perform ("Start … timer" for every TIMER, "Add one" for AMOUNT) · **fixed** — `quickLogLabel()` and a timer label that says "Log time for …" when the sheet opens; checklist Z12.

**Browser e2e (round-8 build):** weekly "done today" and Undo today, period-day reminder suffix, birth-control pause and the period-only sheet — all passed; the one failure (the ring said "(predicted)" for an estimated day) is CA-02, fixed. No console errors.

### Round 8 (2026-10-26 night)

Six lenses over the round-7 result. Each ran a scenario rather than a read: persona journeys through the selectors (`/tmp/dt-round8-personas.ts`), a widget layout probe at launcher sizes and font scales, a Health Connect review against the installed 4.1.3 sources, a cycle script (`/tmp/cycle-round8.ts`), the backup lens reading expo-file-system's Kotlin, and a browser e2e. Ids are theirs.

**Backup / data-safety lens** (read `expo-file-system` 19.x `FileSystemFile.move`)
- BAK8-01 high · `tmp.move(destination, { overwrite: true })` deletes the destination and then renames: a kill between the two left no snapshot at all · **fixed** — the writer writes `snapshot.next.json` in full and moves it over `snapshot.json`; a complete `next` found on start is adopted first (`recoverPendingSnapshot`); paradigm 31; checklist Y1.
- BAK8-02 high · a second unreadable snapshot moved onto the single `snapshot.kept.json` with overwrite, erasing the first one kept · **fixed** — `snapshot.kept.<mtime>.json`, a suffix when the stamp collides, every kept file offered / forgotten together; the legacy name still recognised; checklist Y2.
- BAK8-03 med · `parseState` normalised before it validated: `cycleLogs: [{note:'important'}]` became `[]`, a non-list `body.sleep` became empty, silently · **fixed** — `rejectDamagedContainers()` refuses a present container that is not a list / a day log without a day, naming the field; absent containers still read as empty; test.
- BAK8-04 med · onboarding's "Delete it" and the kept-copy card deleted without the durable cleanup marker and hid their cards before the delete ran · **fixed** — both go through `markCleanupPending(target)` → delete → clear; the card stays until the delete succeeds and a failure is shown; checklist Y3.
- BAK8-05 low · the export's `exportedAt` (shown before decrypting) and the KDF parameters were unauthenticated · **fixed** — envelope 2 binds the header as GCM additional data (`headerAad`); envelope 1 files still open; Python recipe updated; tests.
- Checked and clean: cipher suite, CSPRNG use, backup rules (only `files/backup/`), export filenames carry no name, import is replace-not-merge with a rejected higher data version.

**Cycle lens** (script over `buildTimeline`, `nextFireDay`, `cycleInsights`)
- CYC8-01 med · birth-control mode still scheduled the fertile / luteal rules and the sheet still offered luteal · **fixed** — `ReminderContext.birthControl` pauses ovulation-based rules in `nextFire`; the sheet offers only period rules; footnote on the Cycle tab; test.
- CYC8-02 med · a "day N of the period" reminder counted from the predicted start was submitted to the OS and rang while the period was late · **fixed** — `ReminderFire.confirmed`; the planner schedules only confirmed fires; the tab shows the speculative day with "once the period is logged"; paradigm 32; test; checklist Y4.
- CYC8-03 med · an inferred ovulation between two logged starts read as known (`predicted=false` dropped the "(predicted)" suffix) · **fixed** — `CycleDayInfo.estimated` for wording, `predicted` kept for styling; day sheet and calendar a11y label say "(estimated)"; paradigm 33; test.
- CYC8-04 med · symptom burden summed severities, so four cycles with 4/3/2/1 logged days and identical ratings read as "milder with the habit" · **fixed** — mean severity per logged day, NaN (skipped) under `MIN_LOGGED_DAYS_PER_CYCLE = 3`; test fixture extended; test.
- CYC8-05 med · one future-dated start (an import, a wrong clock) anchored every prediction · **fixed** — `historyUpTo(history, today)` for predictions and windows, `periodContaining` keeps showing the logged day, `cycleAlerts(history, today)` adds `future-start`; test.
- Checked and clean: ovulation clamp with low-confidence copy, five-day start spacing, future starts refused by the logging API, end-before-start prevented in the day sheet, NOT_CONTRACEPTION present. "Sharpens after three" wording · **deferred** (low; copy).

**Journey lens** (three personas over 14 days through the selectors)
- JRN8-01 med · a weekly habit done earlier in the week showed as done today (checkbox, "Mark done", planner skipped it) · **fixed** — `HabitView.doneToday` / `dayRatio`; row, detail screen, planner and Today use them ("· done today" suffix for weekly); test.
- JRN8-02 med · the week summary scored a three-session week as 14 % (daily ratios of a weekly habit) · **fixed** — sessions against the quota for non-daily habits; test.
- JRN8-03 med · Today's movement target replaced a non-daily habit's per-day target with `ceil(timesPerPeriod / 7)` (Stair sprint promised 3 a day) · **fixed** — the per-day target while the period quota is unmet.
- JRN8-04 med · the "warming up" highlight averaged fourteen ratios including days before the habit existed, inventing a bad last week · **fixed** — both weeks need four observed days from the creation day.
- JRN8-05 low · weekly streaks labelled "days" · **fixed** — `streakUnit()` shared by highlights and the week summary.
- JRN8-06 low · a Sugar-Shield-only setup opened an empty Movement card · **fixed** — `showMovement` excludes the shield.
- Checked and clean: 03:00 tracking boundary across the DST night, Library preset copy.

**Widget lens** (layout probe at 110×60 … 320×200 dp, font scale 1.0–2.0)
- WID8-01 med · an unchanged headless run did not redraw yesterday's widget (the day line and ratios were stale until the next change) · **fixed** — `nudgeTasks.native` refreshes widgets on the unchanged branch too.
- WID8-02 med · the layout had no font-scale input and a fixed 38 dp label block: at 2× the value and captions clipped or overran the ring · **fixed** — `widgetLayout(…, fontScale)`, `labelBlockHeight`, `fitValueSize`, ring value drawn unscaled (`allowFontScaling` off), labels budgeted; paradigm 35; probe re-run at every size; checklist Y8–Y9.
- WID8-03 med · the declared 110×60 compact widget made a 36 dp ring the tap target · **fixed** — `MIN_TOUCH = 48`, `minHeight` 72 dp (launchers resize existing widgets), the day line drops before the ring shrinks under 72 dp; a one-row widget shows a notice instead of tiles; checklist Y7.
- WID8-04 med · the automatic rotation tap sent the rendered habit id, so a stale drawing logged the wrong snack · **fixed** — click data carries `kind`; `widgetTapActions(…, 'rotation')` resolves the next snack from the newest state; test.
- WID8-05 med · a storage failure in the handler rendered "choose habits" (the empty-config screen) · **fixed** — `WidgetModel.notice` (TAP_FAILED / LOAD_FAILED) drawn on the last good model; checklist Y10.
- Checked and clean: SQLite open waits for migrations; live-store / lock handoff. `index.js` import order · **rejected** (registration runs at entry evaluation before any render; no failure demonstrated).

**Health Connect lens** (against react-native-health-connect 4.1.3)
- HC8-01 med · a drink logged by hand after its import double-counted for ever (the sync marked the external id seen before comparing with manual rows) · **fixed** — an imported row with a manual / widget twin within 5 min and 10 ml is removed on the next sync and not re-imported; paradigm 34; tests; checklist Y11.
- HC8-02 med · two sources' copies of one night or one workout were summed (8 h phone + 7 h 40 watch = a 15 h night) · **fixed** — `distinctSessions` (> half of the shorter overlapping; richest copy stands: stages, then minutes; a generic "Workout" matches any type) under `sleepByDay`, `nightEndingOn`, `countedWorkouts`, and the workouts list; hiding the representative reveals the other; tests; checklist Y12.
- HC8-03 med · after a successful sync the next read started yesterday: a workout that reached Health Connect two days late, or the history of a type granted later, never landed · **fixed** — rolling 7-day window (still capped at 14), `sync.backfilled` per type with a 30-day first read for a newly granted type (existing installs count their current grants as done); tests; checklist Y13.
- HC8-04 low · "N of 7" never said which types; a denied Sleep read as "Nothing in Health Connect yet" · **fixed** — the card lists what is read and what is not allowed (with Permissions), the Body tab names the metrics a missing permission keeps empty; checklist Y14.
- Checked and clean: rationale covers all seven types, background access and the backup disclosure. `getChanges` (change tokens) · **deferred** — the rolling window answers the late-data case; change tokens are an optimisation for a later round.

**Browser e2e (round-7 build):** Today without the trio, cycle guard and the Today switch, the Quick Log ceiling, the Body card and its explanation page — all passed, no console errors.

### Round 1 (2026-10-26 night)

(Ids such as UX-05 / REL-06 are the reviewers' own where they had one; the rest are described by title.)

**Android runtime lens**
- high · SQLite opened from several places (app, headless task, widget handler) could interleave writes · **fixed** — one serialised connection per process.
- high · headless "dirty" flag read-then-cleared loses a write that lands in between · **fixed** — monotonic revision counter.
- med · persistence failure after a write was logged once and forgotten · **fixed** — provider keeps a retry loop and shows the red banner until a flush succeeds.
- med · notification "handled" marker set before the state write; a crash in between dropped the action · **fixed** — queued key, unmarked on failure.
- med · Health Connect paging had no upper bound · **fixed** — 40 pages max, then a per-type error rather than a silently short total.
- low · widget could log steps by hand · **fixed** — `completeFromNudge` returns nothing for `steps`.

**Data-integrity lens**
- high · imported files were trusted after a shallow shape check; a bad record could poison the SQLite store · **fixed** — `validateRecords` over every list, `sanitizeSettings` key-by-key, version check, size cap.
- high · widget/notification step rows summed with the Health Connect total · **fixed** — `SET_AUTO_ENTRY` evicts all non-manual rows; manual stays.
- med · weekly habit "Done" from a notification compared the *period* ratio: could never log once the week was met, and a second press was not idempotent · **fixed** — today's raw value vs per-day target.
- med · YES_NO from a nudge dispatched `SET_ENTRY` on a missing row · **fixed** — `ADD_ENTRY`.
- med · timer-bell session filed under the tap day · **fixed** — day of `endAt`.
- med · weekly/monthly chart ratios counted from the window start, not the period start · **fixed** — `periodDoneOn`.
- low · Erase leaves the seeded Water habit · **fixed (copy)** — "keeps the Water habit and your settings"; by design (the app needs one habit).

**Security / privacy lens**
- high · PBKDF2 iteration count, salt/IV lengths and ciphertext size came from the file unchecked (hang / memory DoS) · **fixed** — `checkEnvelope` before derivation, 2M-iteration cap, 64 MB import cap.
- med · `Math.random` in id/salt paths on native · **fixed** — `expo-crypto` via `secureRandom`.
- med · Android Auto Backup on 9–11 could land the snapshot in a non-encrypted transport · **fixed** — `xml-v28/backup_rules.xml` requires `clientSideEncryption`; 8.x gets no cloud backup (manual export only, said in Settings).
- med · app lock: biometrics "none" left the gate locked forever; errors looked like "none"; lock-after 0 min did not lock on background · **fixed** — explicit `ready / none / error` states, screen-capture protection while locked.
- med · release builds signed with Expo's public debug keystore when the user has not created a key · **fixed (warned)** — Gradle `logger.warn` + guide rewritten; keeping the fallback so the first own-phone build still works.
- low · exported files lingered in the cache dir · **fixed** — purge on start/background.
- low · unused permissions/deps (image picker, location, blur) · **fixed** — removed; manifest verified free of camera/location.

**UX lens**
- UX-01 · stale "arrives in the next milestone" copy; onboarding never asks for notification permission · **fixed**.
- UX-02 · "Pin to Today" did nothing visible · **fixed** — pinned first.
- UX-03 · archived habits unreachable · **fixed** — Archived section with Restore.
- UX (charts) · range chips labelled by raw day counts · **fixed** — 7D/2W/1M/6M/1Y.
- UX-05 · Sugar Shield only reachable when its habit is added · **fixed** — Today footer link always, quick-log entry, Start button on the habit page.
- UX-06 · cycle day sheet dropped the draft on period buttons; "Remove this period" had no confirm · **fixed**.
- UX-07 · sample-data label only on Today · **fixed** — chip on every tab.
- UX-08 · Vitamin C preset default dose · **rejected** — value comes from the user's Cadence spec.
- UX-09 · several 40 dp targets · **fixed** — IconButton/Chip/compact pills get hitSlop to ≥ 48 dp.
- UX (a11y) · chart has no accessible summary · **fixed** — `accessibilityRole="image"` + numeric label.

**Release / docs lens**
- REL-01 · guide called the fallback key "the debug key Android Studio created" · **fixed** — it is Expo's public key; warning + Part 6 rewritten.
- REL-02 · own signing key presented as optional · **fixed** — required before handing out APKs.
- REL-03 · NDK/CMake download not mentioned · **fixed**.
- REL-04 · downgrade advice said "uninstall first" without export · **fixed**.
- REL-05 · Windows: commands only work from PowerShell · **fixed**.
- REL-06 · `pnpm install` on Mac/Windows failed: workspace overrides pinned esbuild/lightningcss/rollup platform binaries to `-` · **fixed** — overrides removed, lockfile regenerated (see journal for the pnpm hoist quirk).
- REL-07 · `sh` preinstall script breaks on Windows · **fixed** — Node script.

**End-to-end tester (web preview, sample data)**
- e2e-1 · Sugar Shield has no entry point unless its habit is added · **fixed** (UX-05).
- e2e-2 · habit detail says "tap a day to fix it" while days before `createdDay` are disabled · **fixed** — copy explains it.
- e2e-3 · meditation Finish before one minute silently discards the session · **fixed** — button says what it logs; footnote for < 1 min.
- e2e-4 · Erase leaves the Water habit · **fixed (copy)**.
- Passed: onboarding both paths, water/snack/mind logging, habit add/edit/archive, backfill, export/import round trip, cycle logging and reminders, settings theme/lock copy, body tab stubs.

### Round 2 (2026-10-26 night)

Reviewers re-read the round-1 result. Ids are theirs where they gave one.

**Android runtime lens**
- AND-01 high · the "handled" key for a notification press was written before the state commit; with the headless task and the foreground listener both seeing a press, one copy could be dropped or applied twice · **fixed** — in-memory claim first, durable mark only after the commit (`beginHandling` / `endHandling`), and the nudge-event ledger (written in the same transaction as the log) makes any replay a no-op.
- AND-02 high · widget task and notification task run on the same headless runtime and could interleave load → apply → persist · **fixed** — one in-process lock (`headlessLock.ts`) around every headless read-modify-write.
- AND-03 med · the provider could hydrate a reloaded state over changes that had not been saved yet · **fixed** — `flush()` reports success; a reload only proceeds when everything on screen is in the database, otherwise it retries on the next check.
- AND-04 med · headless changes were only noticed on foreground, and the revision was read after the initial load (a write in between looked "seen") · **fixed** — revision read before the load; checks on every 30 s tick while active, 4 s after foregrounding, and immediately via an in-runtime event when the headless task shares the process.
- AND-05 med · without exact-alarm access a late alarm was still pending when the app re-planned; it was cancelled and counted as fired (charged to the daily cap, never shown) · **fixed** — overdue entries still pending in the OS are left alone for 30 minutes and are not counted as fired; beyond that they are dropped without charge.
- AND-06 low · a timezone change is not picked up until the next re-plan · **deferred** — no native receiver; the 3-hourly task and the foreground tick correct it. Accepted limitation, noted in the checklist.
- AND-07 med · the Auto Backup snapshot was only refreshed by the foreground app; a phone used mostly from the widget was never backed up · **fixed** — shared `maybeSnapshot` (policy + one-hour throttle) after headless writes and in the 3-hourly task.
- low · a failed re-plan inside the headless button path threw the whole write away · **fixed** — the log is persisted; the re-plan error is logged and corrected by the next plan.

**Data-integrity lens**
- high · imported numbers had no bounds (negative targets, zero intervals, absurd caps could reach the planner loops) · **fixed** — per-field ranges in `validate.ts`, integer checks, settings ranges with defaults as fallback; planner also caps slots per day defensively.
- high · duplicate keys in imported lists (two rules for the same habit and day, two step rows for one day) were accepted and later written with undefined precedence · **fixed** — `uniqueBy` on every list.
- DI2-03 med · the streak engine judged every day of a week by the week's final rule while the Today card used per-day rules; "3 of 4 this week" could disagree with the streak · **fixed** — per-day target in the engine; test covers a mid-week target change.
- DI2-04 med · a strength tick created from a workout survived the workout's deletion (or hiding it in the app) · **fixed** — complete reads (`batch.window`) remove automatic ticks without a qualifying workout; manual ticks are never touched.
- DI2-05 med · drinks imported from another app ignored upstream edits and deletions · **fixed** — edited → updated in place (same external id), deleted → removed; user-logged drinks untouched; partial reads never remove.
- DI2-06 med · steps were aggregated per calendar day but the Steps habit lives on tracking days (4 am boundary) · **fixed** — a second Health Connect aggregate starting at the boundary hour feeds the habit; the Body tab keeps calendar days so numbers match the source app.
- DI2-07 low · changing the daily water goal in Settings did not update the Water habit's rule · **fixed**.
- low · `excluded` on a period was lost on import · **fixed**.
- DI2-09 low · opening the "Set amount" sheet in oz and pressing Set re-rounded 250 ml to 251 ml · **fixed** — an untouched prefill keeps the stored value.
- DI2-10 low · the water card's on-pace check ignored the tap size the planner uses · **fixed** — same half-tap tolerance.
- also: mirrors (steps, sleep, heart, weight, workouts) inside a complete read's window are pruned when the read no longer returns them.

**UX lens**
- high · Sugar Shield promised "a reminder in 20 minutes" even with notifications denied or reminders off · **fixed** — schedules and promises only when it can deliver; otherwise offers to log the squats.
- UX2-02 med · Back during a meditation silently discarded the session and the bell · **fixed** — Keep / Finish · log N min / Discard dialog on Back, header arrow and swipe; reset and kind switch confirm when a minute or more is on the clock.
- med · tapping a cycle, summary or event notification opened a habit page that did not fit · **fixed** — routed to Cycle, Today, or the habit.
- UX2-05 low · remaining sub-48 dp targets (segmented control, avatar, calendar cells, icon picker) · **fixed**.
- UX2-06 low · "Finish · log 12 min" overflowed at the largest font sizes · **fixed** — "Finish" plus a footnote saying what it logs; the full sentence stays in the accessibility label.
- UX2-07 low · heatmap: 182 unlabeled squares, partial vs complete by hue only · **fixed** — spoken summary; complete days carry a dot; legend updated.

**Security / privacy lens**
- med · the backup snapshot's temp file lived inside the backed-up directory · **fixed** — written in `backup-tmp/` outside the backup rules, then moved.
- SEC2-02 med · the import size check trusted the picker's reported size · **fixed** — the cached file's real size first, then the text length; scratch files removed on every path, including failures.
- SEC2-03 low · export scratch file name was predictable · **fixed** — random tag from the secure RNG; still purged after an hour.
- SEC2-04 med · Android Auto Backup was on by default without being said during onboarding · **fixed** — onboarding step "Phone backup" with the switch (default on) and the plain-language consequence either way.

**Release / docs lens**
- REL2-01..05 · the build notes still said "NDK not needed" (RN 0.81 compiles its core: NDK + CMake download), called the fallback key the machine's debug key (it is the template's public key), gave a `gradle.properties` with two different passwords (PKCS12 wants one), a relative APK path in the Finder step, `git pull && pnpm install` on one line (fails in older PowerShell), and an `apksigner` glob that breaks with two build-tools versions · **all fixed** in `BUILD_ANDROID.md` and `GET_IT_ON_YOUR_PHONE.md`.

**End-to-end tester (web preview)**
- Checks 1–6 passed (onboarding both paths, logging, habit edit, backfill, export/import, cycle). Checks 7–8 were interrupted by a transient `slotStep is not defined` that came from my own half-saved edit to the planner, not from the product; re-run is owed and listed below.

### Round 3 (2026-10-26 night)

Fresh reviewer sessions over the round-2 result. Ids are theirs.

**Android runtime lens**
- AND3-01 high · the headless button task read `content.data`, but Android's raw bundle carries the payload as `content.dataString` (JSON text); buttons pressed with the app closed were dropped · **fixed** — `notificationPayload.ts` reads both shapes (and the top-level payload the pure test uses); the foreground listener and the headless task share it; unit test with the raw fixture.
- AND3-02 high · the foreground path still marked a press handled before the provider had persisted it · **fixed** — `commitPending()` resolves when the generation the dispatch created is in the database; `endHandling` waits for it.
- AND3-03 high · a dispatch queued in the same React batch as a HYDRATE was lost · **fixed** — a synchronous dispatch generation counter; a reload proceeds only when the generation it saw is both rendered and committed, otherwise it retries.
- AND3-04 high · the headless lock serialised headless writers against each other but not against the live app: a widget tap could load the database, decide against it and save while the app held unsaved changes · **fixed** — live-store registry: when the provider is alive the headless task hands it a *builder* (`state → actions`) and the provider applies it against its current state and persists; the database path is only used when no app is running.
- AND3-05 high · the merged water + movement nudge recorded the drink as SNOOZED, so a replay could not tell the drink from a snooze and logged it twice · **fixed** — WATER ledger kind written in the same transaction, before the SNOOZED/DONE that follows it; test.
- AND3-06 high · a delayed headless snapshot could recreate a snapshot the user had just erased or opted out of · **fixed** — `maybeSnapshot` takes a state *getter* and re-reads the policy at write time; erase and opt-out go first.
- AND3-07 high · a Health Connect sync in flight across "Remove imported data" wrote its result afterwards · **fixed** — generation guard in `useHealthConnect`: results from before the removal are dropped.
- AND3-08 med · `syncPlan` and `cancelAll` could interleave and restore cancelled notifications · **fixed** — both serialised behind one promise with a generation; a superseded sync schedules nothing and returns `[]`.
- AND3-09 med · a schedule call that threw was still recorded as scheduled · **fixed** — only accepted ids enter the ledger.
- AND3-10 med · the widget task returned before its snapshot write finished (Android may release the runtime) · **fixed** — awaited, outside the lock.

**Data-integrity lens**
- DI3-01 high · the app accepted values its own importer rejects (20,001-character cycle note, amount above 1e9), making the export unrestorable · **fixed** — caps at the writers (`MAX_TEXT` on notes, `MAX_AMOUNT` 1,000,000 in the amount sheet with a hint, name 80 / unit 12 characters); paradigm 16.
- DI3-02 high · the habit editor allowed a Water target up to 100,000, the goal mirror accepted it, `sanitizeSettings` reset it to 2,000 on reload · **fixed** — editor 100–20,000 for Water; goal↔rule mirror clamps the same range on both sides.
- DI3-03 high · "deleted step days retain their automatic habit totals" · **fixed** — complete step reads fill missing window days with 0 so the mirror clears them; manual totals untouched; test. (The reviewer's second example, a strength tick judged by minutes, is working as designed: the threshold is the habit's definition.)
- DI3-04 high · a workout moved upstream to another day kept its old tick when the old day lay outside the read window · **fixed** — the old day of an updated workout is judged again against the merged list; test.
- DI3-05 high · deleted heart measurements survived a complete read · **fixed** — complete reads replace the day's row (several rows for one day are folded first); partial reads fill in; test.
- DI3-06 high · the goal→rule sync overwrote a rule whose cadence change was pending (activating it early) and later reversed the target · **fixed** — the sync updates today's effective rule *and* any future rule, each keeping its own cadence and start.
- DI3-07 med · a monthly quota of 31 could never be met in February · **fixed** — `periodQuota` = min(timesPerPeriod, days in the period) in the engine and the Today card; test.
- DI3-08 med · rotation slots inside a pause consumed the post-pause budget · **fixed** — paused slots are skipped before budgeting (rotation and interval); test.

**UX lens**
- UX3-01 high · the timer could log twice while its leave dialog was open (bell + Finish) · **fixed** — the timer pauses while the dialog is up; `logOnce` guard.
- UX3-02 med · the onboarding backup switch could be pushed offscreen at large text · **fixed** — label takes the remaining width and wraps.
- UX3-03 med · Sugar Shield kept the permission it read on mount after the user enabled notifications in system Settings · **fixed** — re-checked on AppState active and right before scheduling.
- UX3-04 med · custom habit target controls overflowed with large values or fonts · **fixed** — the row wraps; unit input capped.
- UX3-05 med · the complete-day dot disappeared on 360 dp phones (cells < 8 dp) · **fixed** — drawn from 5 dp cells.
- UX3-06 med · onboarding's privacy line contradicted the backup step · **fixed** — copy qualified ("unless you keep the phone backup on").
- UX3-07 low · heatmap legend could not fit at large font scale · **fixed** — wraps.

**Security / privacy lens**
- SEC3-01 high · cycle notifications named the reminder on the lock screen by default · **fixed** — discreet mode is the default (opt into names); existing users keep their choice.
- SEC3-02 high · declining the restore prompt left the snapshot eligible for the next backup · **fixed** — "Start fresh" deletes it.
- SEC3-03 high · imported fixed-time strings bypassed numeric bounds (`"25:99"`, `"noon"`) and reached the planner as NaN · **fixed** — strict `HH:MM` in the validator; the planner skips anything else; test.
- SEC3-04 high · body sync metadata (`lastSyncAt`, `lastError`, `granted`) escaped validation · **fixed** — sanitised in `normalizeBody`; test.
- SEC3-05 med · an interrupted import left the document picker's plaintext copy under `cache/DocumentPicker` · **fixed** — purged with the export scratch files (start-up after an hour, erase immediately).

**Release / docs lens**
- REL3-01..07 · Mac `npm install -g pnpm` can fail with `EACCES` (now a `sudo` path and a table row); signing recipe had no PowerShell form (now has one); build blocks changed directory relative to the previous block (each block now starts from the repository root); the Python decrypt recipe skipped NFKC (added); checklist said 4 am boundary (default is 3 am; rows now test both sides of it); "refuses an update whose number is not higher" (Android rejects only lower; wording fixed in both guides); stale header / test count / RN version (refreshed) · **all fixed**.

**End-to-end tester (web preview)**
- Re-ran checks 7–8 from round 2 plus a regression over the round-2 changes: settings / theme / app-lock copy and the Body stubs **pass**; Sugar Shield's web wording and "Log the squats" **pass**; heatmap legend dot and spoken summary **pass**; "Set amount" leaves an untouched prefill exact **pass**; meditation leave dialog **fail on web only** — `Alert.alert` is a no-op in the browser, so the dialog is a device check (row S4), not a web one; export file name lacked the random tag on web **fixed** this round (native already had it). One console error during the run (`onHeadlessWrite is not defined`) was my own half-saved provider edit, gone on reload.

### Round 4 (2026-10-26 morning)

Fresh reviewer sessions over the round-3 result. Ids are theirs.

**Android runtime lens**
- AND4-01 high · a dispatch that changed nothing (a replayed press the ledger deduped) bumped the generation without producing a render, so `commitPending()` waited forever and the button's "handled" mark never landed · **fixed** — the generation is bumped only when the reducer returned a new object; the live store's `apply` reports `applied: false` and still waits for earlier changes; paradigm 19.
- AND4-02 high · live builders (widget tap, notification button, background re-plan) read `latest.current`, which is React's rendered state — one render behind the app's own dispatches, so two commands in one tick decided against the same base · **fixed** — `pendingRef` holds the newest state synchronously; `apply` folds the builder's actions from it and publishes once; actions use it too.
- AND4-03 high · the background re-plan on a live runtime pulled Health Connect without the in-app generation guard, so a read in flight across Disconnect / Remove imported data landed · **fixed** — a shared body epoch (`src/state/epochs.ts`) bumped by disconnect, remove, erase, sample, restore and `healthConnectEnabled: false`; `performBodySync` returns a builder, applied only when the epoch is unchanged and the setting still on.
- AND4-04 high · headless database paths queued `maybeSnapshot` with the object they had loaded; if the app came alive and erased meanwhile the queued job still wrote the old data · **fixed** — getters that return `null` (stand down) once a live store is registered; the database paths also re-check for a live store before persisting and hand it the builder instead.
- AND4-05 med · the live paths returned right after `apply`, leaving the OS re-plan, the widget redraw and the snapshot to the app's debounced timers — which Android may never run before freezing the app · **fixed** — `replanLive` + awaited widget refresh + snapshot on every live path (notification button, widget tap, background task).
- AND4-06 low · a Fast Refresh remount left a retry timer id behind · **fixed** — cleared and nulled on unmount.

**Data-integrity lens**
- DI4-01 high · a complete heart read with only one of the two heart permissions replaced (and pruned) the other subtype's stored values · **fixed** — `batch.heartSources`; replace/prune touch only the fields the read covered; tests; paradigm 20.
- DI4-02 high · a WATER press on a merged slot that the snooze had re-offered (same id) was treated as a replay and dropped the second drink · **fixed** — a WATER counts as a replay only while the snooze written with it is still running; test.
- DI4-03 med · editing the Water habit's target in the editor set the rule but mirrored the setting only through `setTarget`; the editor path clamped differently · **fixed** — one `syncWaterGoal` (today's rule, pending rules, setting) used by the editor, `setTarget` and `updateSettings`.
- DI4-04 med · the streak prorated the first partial week ("required 2") but the Today card, charts and planner used the full quota ("0 of 4") · **fixed** — `periodRequired(rule, day, createdDay, offDays)` shared by all; test; paradigm 21.

**UX lens**
- UX4-01 med · Sugar Shield "Log & set the walk reminder" could be tapped twice (permission check yields) · **fixed** — single-shot with disabled buttons.
- UX4-02/06 med · stepper value box pushed the + button off narrow cards; 40 dp buttons in a 40 dp row · **fixed** — value shrinks with font fit; row min-height 48; the editor shows the unit once, on the left.
- UX4-03 med · Settings limited the water goal to 1,000–4,000 while the editor allowed 100–20,000 · **fixed** — one exported range (`WATER_GOAL_MIN_ML/MAX_ML`) in Settings, editor and provider.
- UX4-04 low · interval / boundary / mind-minute chips overflowed at large font scale · **fixed** — wrap.
- UX4-05 med · the first tap on Set/Log with the keyboard up only dismissed the keyboard · **fixed** — `keyboardShouldPersistTaps="handled"` on the sheet's scroll view.
- UX4-07 med · light theme green text (`#16A34A`) was 2.9:1 on raised cards · **fixed** — `#166534` (6.3:1) and gold `#7A6016` (5.3:1) for text/icon inks; fills unchanged.
- UX4-08 low · a value off the stepper grid stayed off it (100 → 350 → 600) · **fixed** — snaps to the next grid point.
- UX4-09 low · the amount cap hint said "1,000,000" in an oz sheet · **fixed** — shown in the typed unit.
- UX4-10 low · sheets slid up under "Remove animations" · **fixed** — `animationType="none"` with reduce motion.
- UX4-11 info · "Today shows no name greeting" from the tester · **not a bug** — the name is shown as the avatar initial by design (Settings says so).

**Security / privacy lens**
- SEC4-01 high · cycle day logs from a file: symptom severities, flow and mood were not range-checked (a severity of 4 indexed past the label table) · **fixed** — `mapOf` validator (keys ≤ 64, values 1–3), flow 1–3, mood 1–5; the day sheet also tolerates an unknown severity; tests.
- SEC4-02 · same root as AND4-03 · **fixed** (epoch).
- SEC4-03 · same root as AND4-04 · **fixed** (getter stands down).
- SEC4-04 med · enabling the lock (settings switch, or a restored backup that had it on) did not lock until the next background/foreground, so a restored file's records were visible before the first biometric check · **fixed** — the gate locks on every off → on transition.
- SEC4-05 med · the payload guard checked three fields and trusted the rest (`snackType in SNACK_LABELS` matched prototype keys; a negative `waterMl` logged a negative drink) · **fixed** — `parsePayload` validates every field; wrong optionals are dropped, wrong required fields drop the press; bundle size cap; tests.

**Release / docs lens**
- REL4-01 · same root as AND4-02 · **fixed**.
- REL4-02 med · a meditation finishing while the screen was on logged "now" as the end, so a session that ran out at 02:53 and was noticed at 03:10 moved to the next tracking day, while the end bell's own log (and its dedupe) used the real end · **fixed** — `logMind(kind, minutes, { endAt })`; the timer records the instant the clock reached the total.
- REL4-03..08 · PowerShell 5 does not accept `&&` (split); clone vs pull were one block (split into first time / later); Windows keystore path needs forward slashes (noted); build-tools folder listing could pick `36.0.0-rc1` (filtered to numeric); checklist R1 said step 5 (Android has the backup step first → 6); C1/C3 assumed discreet off (it is the default on → rows rewritten); R11 pointed at `databases` (expo-sqlite uses `files/SQLite`) · **all fixed**; rows T1–T11 added.

**End-to-end tester (web preview)**
- Items 2–10 **pass** (water mirror clamps 100–20,000; editor caps 80/12; amount hint and Log label; "0 of 31 this month"; heatmap dot + legend; discreet on by default; export name with tag; no console errors). Item 1 (name greeting) is UX4-11 above.
- After the fix batch, a second pass over the rewritten write path: two rapid water taps land as 500 ml and survive a reload; Settings goal stops at 100 ml and never shows less; the editor's target mirrors into Settings and back; a yes/no habit toggles on/off cleanly; no error banner. One real finding: a screen opened with no history behind it (`/shield` as a direct URL — on a phone, a notification or widget deep link) called `router.back()`, which is a dev error toast on web and a silent no-op in release, leaving the user on a screen that believed it had closed · **fixed** — `useBackOrHome()` (back when possible, else replace with Today) on Sugar Shield, the meditation timer and the habit page's archive/delete. The "movement 0 / 17 did not change" observation is by design: Sugar Shield squats count for the Sugar Shield habit, not the movement-snack quota.

### Round 5 (2026-10-26 midday)

Fresh reviewer sessions (Android runtime, data, UX, security, release) over the round-4 result, plus a browser e2e pass over the cycle flow. Ids are theirs.

**Android runtime lens**
- AND5-01 high · the headless DB path checked "app not alive" once, before `await replanHeadless`; a provider that hydrated during that await (and registered as the live store) could be overwritten by the job's persist, re-inserting rows the user had just erased · **fixed** — the provider's load + hydrate + `setLiveStore` run under the same headless lock, and the nudge and widget jobs re-check for a live store after the await and hand it the builder instead of writing.
- AND5-02 high · `AppLockGate` turned the lock on in an effect, one frame after the switch — a frame of Settings (or of restored records) could be painted and the modal faded in over it · **fixed** — locked is decided during render (state-from-props pattern) and the modal uses no animation.
- AND5-03 high · the foreground timer logged the session when its clock reached the total, and the end bell logged it again if tapped while Android had paused the JS clock (the screen's `logged` ref is per screen, the bell's dedupe was only on its own side) · **fixed** — `mindSessionExists()` shared by both (AND5-03 = DATA5-02).
- AND5-04 med · after `MAX_SAVE_RETRIES` the retry timer stops; a later `commitPending()` with no new change waited forever (a notification button's "handled" mark never landed) · **fixed** — a waiter in that state starts one more flush, which settles every waiter either way.
- AND5-05 med · the foreground sync (`useHealthConnect`) and the background task's sync could overlap; the older read landing last moved `lastSyncAt` backwards and could re-import a day it had just removed · **fixed** — `performBodySync` is single-flight across callers; the watermark is `max(old, now)`.

**Data lens**
- DATA5-01 high · `scheduleMindEnd` wrote `day: ''` but round 4's `parsePayload` requires `YYYY-MM-DD`, so every tap on the end bell was dropped (nothing logged when the app was closed) · **fixed** — empty day accepted for `MIND_END` only; `mindEndPayload()` builder shared with the parser's test.
- DATA5-02 high · see AND5-03 · **fixed**.
- DATA5-03 high · `evaluateStreak` passed `createdDay` to `periodRequired`, so after a cadence change the first partial period was prorated over the whole period (a weekly habit made monthly on the 26th needed the full 20 days in 6) — a regression from the round-4 "one formula" refactor, and the card/planner/charts made the same mistake · **fixed** — `periodRequired(rule, day, from)` takes the segment start; `segmentStartOn()` derives it for the selectors; `periodDoneOn` counts from the same day; transition tests (daily → weekly, weekly → monthly on a boundary and mid-week).
- DATA5-04 med · `widget/model.ts` captions used `rule.timesPerPeriod` ("0 of 5 days" in a 4-day first week) · **fixed** — `view.periodQuota`; test.
- DATA5-05 low · `BackfillStrip` judged all seven days against today's target · **fixed** — `targetOf(day)` from the rule in force that day.

**UX lens**
- UX5-01 med · the stepper could only step (2,000 → 1,850 ml was six presses) · **fixed** — tapping the number opens a bounded numeric field; typed values are clamped but not snapped; clock steppers take a typed time (`parse` prop, `parseClockInput`).
- UX5-02 med · breathing circle restarted from an inhale after a pause while the label continued from the clock · **fixed** — the circle resumes mid-phase from `elapsedMs`; the phase label is `accessibilityLiveRegion="polite"`.
- UX5-03 med · a closed period's end could only be edited from the history list, never from the calendar day; a future day's sheet offered nothing and explained nothing · **fixed** — "Period lasted until here" / "Period ended here instead" on the latest period started by that day (≤ 14 days, before the next period); future days get a one-line hint. (The e2e tester's step-9 "failure" was this by-design gap.)
- UX5-04 low · cycle calendar cells 42 dp wide on a 360 dp phone · **accepted compromise** — the grid bleeds 12 dp into the card padding (≈46 dp); 48 would need a different card.
- UX5-05 · a greeting by name on Today · **rejected** — the initial avatar is the design (round 4).
- UX5-06 · Sugar Shield squats toward the movement-snack quota · **rejected** — by design, they are their own habit.

**Security lens**
- SEC5-01 med · screenshot protection follows the setting, not the lock state — while the lock is enabled the user cannot take screenshots even when unlocked · **by design, documented** (checklist R4): a secure window is what keeps Recents thumbnails blank the moment the app is backgrounded, before the lock has a chance to engage.
- SEC5-02 low · `MIND_END` payload parsing gained a loophole for empty days · **reviewed** — only for that kind, and the day is never read for it (the logger derives it from the end instant).

**Release / docs lens**
- REL5-01 high · `docs/BUILD_ANDROID.md` was corrupted in round 4 (a `$'` inside a JavaScript `String.replace` replacement spliced the rest of the file into the middle) · **fixed** — restored from history and the round-4 edits re-applied with function replacers; the pitfall is in agent memory.
- REL5-02 · RUNNING_CONTEXT header still said rounds 1–3; checklist L6 did not state the hourly snapshot rule · **fixed**; rows U1–U9 added.

**End-to-end tester (web preview)**
- Cycle flow: period start on 1 Oct moved the existing start, the day log persisted, the calendar and insights agree (steps 1–8 **pass**); step 9 (future day offers no period action) is UX5-03.
- After the fix batch: period end shortened from a day inside it ("Period ended here instead"), extended from a day after it ("Period lasted until here"), removed from its start day, all surviving a reload; future day shows the hint and still takes symptoms **pass**. Meditation finished early → still one log **pass**; breathing resumed in "Long exhale", not from an inhale **pass**. Typed stepper: 1,850 exact, 50 → 100, 99999 → 20,000, + at the ceiling stays, Settings mirrors **pass**. One real finding: a cadence change (weekly → monthly) saved for the next period was invisible on the habit page — the card kept saying "2 days a week" and the tester read it as a failed save · **fixed** — the habit page shows "From Mon 2 Nov: 20 days a month" under the rule (header and Options → Rule) while a rule is pending; the editor already opened on the pending rule. Follow-on: clock steppers (active hours, summary time, cycle reminders) accept a typed time ("9:30 pm", "930", "21:15") via `parseClockInput`; tests.
- Retest **pass**: the caption read `From Nov 2: 20 days a month`, the editor reopened on the pending rule, Library add → archive → restore row, typed `9:30 pm` into a start-time stepper clamped to its 12:00 PM ceiling and `noon` left it alone; no console errors. The retest also showed that switching the plan back to the current rule left a redundant "From Nov 2: 2 days a week" row, and reading the code showed `setTarget` based its new rule on the *latest* rule — a planned monthly rhythm would have started today the moment a target was edited · **fixed** — rule edits go through pure `ruleChangeActions` / `targetChangeActions` in `src/state/commands.ts` (a plan equal to today's rule is called off via the new `REMOVE_RULE` action, which never removes a habit's last rule; a same-cadence change supersedes the plan; a target change keeps today's cadence and carries the number into the plan); 4 tests.
- The only console error (`withHeadlessLock is not defined`) was a half-saved provider edit during the batch, gone on reload.

### Round 6 (2026-10-26 afternoon)

Five lenses not used before (time arithmetic, first build, accessibility, upgrade/data, scale), each a fresh read-only session over the round-5 result with its own scratch reproduction script. Ids are theirs.

**Time / DST / calendar lens**
- TIME6-01 med · `instantOf` on a spring-forward night returned 01:30 for 02:30 (an hour *early*) · **fixed** — a minute the clock skips lands on the moment the clock jumps to (03:30); tests for both transitions and an ordinary day.
- TIME6-02 med · the planner judged "done today" by calendar day: at 00:30 on 1 Nov (tracking day 31 Oct) a 01:30 reminder rang for a habit already done · **fixed** — `PlanInput.boundaryHour`; FIXED and custom-window INTERVAL slots are judged by `trackingDayOf(slot)`; rotation and water keep calendar-day checks (their windows start at 5:00 or later, so both agree there).
- TIME6-03 med · on the fall-back night an interval policy starting at midnight produced two slots with one id; sync's map collapsed them while its loop submitted both · **fixed** — one slot per wall-clock minute id (first keeps it), before cap accounting.
- TIME6-04 med · a clock set back between a snooze and a Done let the snooze win and re-offer a finished nudge · **fixed** — DONE / DISMISSED outrank snooze / swap regardless of timestamps (WATER stays non-terminal: on a merged nudge a drink is followed by the snooze that keeps the movement half open — round 3's design, protected by its test).
- TIME6-05 low · plan cache ignored a zone change within the same minute · **fixed** — key is minute | tracking day | zone.

**First-build / release lens**
- BLD6-01 med · Health Connect's privacy-policy link opened the app on Today; nothing explained the data use · **fixed** — `plugins/withHealthRationale.js` (native trampoline activity for `ACTION_SHOW_PERMISSIONS_RATIONALE`, the Android 14 alias retargeted) → `app/health-privacy.tsx`, offline, reachable from Body → Health Connect too; checklist H2 tightened (cold start), row V1.
- BLD6-02 med · the phone guide called every Play Protect block harmless · **fixed** — the unknown-source prompt and Play Protect's scan / verdict are now described separately, with what each means.
- BLD6-03 med · a signing password with a backslash (or leading space) breaks when pasted into `gradle.properties` · **fixed** — escaping rules in both guides and the `ORG_GRADLE_PROJECT_DT_RELEASE_*` environment-variable alternative.
- BLD6-04 low · version drift across the guides (0.7 / 0.8 / 0.9) · **fixed** — one table, `app.json` named as the source of truth; this round bumps to 0.10.0 / 10.
- Also this round (own finding while wiring the plugin): `SYSTEM_ALERT_WINDOW` shipped in release builds (template default) · **fixed** — `android.blockedPermissions`; the debug source set's own manifest keeps it for the developer overlay (verified in the prebuilt manifest).

**Accessibility lens**
- A11Y6-01 med · typing into a stepper and tapping Save straight away saved the old value (the edit lived in local state until blur) · **fixed** — every keystroke that parses applies immediately; blur only tidies the text.
- A11Y6-02 med · the water goal stepper took a typed number as millilitres even when showing ounces · **fixed** — stepper `parse` prop; `parseVolumeInput(text, units)` for Settings and onboarding, decimal keyboard, unit placeholder.
- A11Y6-03 med · tertiary text 4.2:1 on raised surfaces (both themes) and white on the light primary 4.4:1 · **fixed** — dark tertiary `#85918A`, light tertiary `#5F6B63`, light primary/green `#107A37`; `tests/round6.test.ts` computes the ratios from `constants/colors.ts` (text ≥ 7, secondary/tertiary ≥ 4.5 on bg / surface / raised, button text ≥ 4.5).
- A11Y6-04 med · widget rings and names had no accessibility labels · **fixed** — `ringLabel(tile)` ("Log Water, 1,250 of 2,000 ml") and "Open <habit>".
- A11Y6-05 med · 200 % font size capped globally, including buttons and chips · **fixed** — callout and caption 2×, title2 1.8×, title1 1.6×; the large ring numerals keep their cap by design.

**Upgrade / data-migration lens**
- UPG6-01 high · a restored snapshot from a *newer* build failed parsing silently and the hourly writer overwrote it · **fixed** — `keepUnreadable()` sets it aside as `snapshot.kept.json` before any overwrite; onboarding card "A backup this version can't open" (Keep it for later / Delete it); Settings → Your data row (Try to restore it / Delete it).
- UPG6-02 high · erase / backup opt-out deleted the snapshot only on an in-memory transition; process death or a failed delete left it eligible for Android backup for ever · **fixed** — `backup-cleanup.pending` marker written first, every delete awaited and reported (`deleteSnapshot` throws on a failure), marker cleared last, `cleanupPending()` on every start.
- UPG6-03 high (conditional) · two JavaScript runtimes (headless task + app) could both write SQLite with no shared lock; a stale read-decide-write can resurrect an erased row · **deferred** — a cross-runtime CAS needs a device to prove the scenario exists on this SDK (Expo's headless tasks share the app's runtime in the common case); documented as a residual risk, checklist row V11 with the exact reproduction.
- UPG6-04 med · heart-only history did not count as data worth backing up · **fixed** — `hasUserData` includes `body.heart`; test.
- UPG6-05 med · archived / deleted habits left scheduled one-off events behind · **fixed** — the reducer drops a habit's events on archive and delete; the planner also skips events whose habit is not in `eventHabitIds` (every active habit plus the Sugar Shield placeholder — the Shield habit has an EVENT policy and is not among the planner's habits, which the first attempt got wrong and `tests/planner.test.ts` caught).

**Scale / performance lens** (synthetic 365-day state: 12 habits, 4,000 entries, 3,000 drinks, 1,500 nudge events)
- SCALE6-01 high · a snack amount up to 1,000,000 became that many synchronous dispatches (quadratic array copies: 2.8 s for 30,000 in Node) · **fixed** — `MAX_SNACKS_PER_LOG = 100` enforced in the sheet (hint, button disabled) and at the command boundary; one `LOG_SNACKS` action appends all at once.
- SCALE6-02 high · one water tap recomputed every habit's lifetime streak four times (Today, highlights, planner input, summary text): ~109 ms here, ~435 ms at the 4× phone estimate · **fixed** — `habitView` cached per state and day for stored habits (drafts bypass the cache; `buildHabitView` does the work), so the four callers share one projection per tick.
- SCALE6-03 med · weekly/monthly charts replayed the cadence history twice per plotted day; cold cycle insights 203 ms even with no cycle logs · **fixed** — `segmentFrom` cached per rule-history key with a fast path when one cadence covers the history; `cycleInsights` keyed on the slices it reads (not water) and returns `NO_INSIGHTS` immediately when there are no cycle logs.
- SCALE6-04 med · the 30-second clock tick re-renders every context consumer · **deferred** — the expensive consumers are now served from caches (SCALE6-02/03), so a tick costs a few hundred microseconds of selectors; splitting the context is a larger refactor to do with device profiling in hand.

### Round 7 (2026-10-26 evening)

Five lenses over the round-6 result, each a fresh read-only session with its own scratch scripts (Babel probe with the installed React Compiler, hostile import files, forged notification payloads, SQLite failure injection, a browser e2e pass). Ids are theirs.

**Android platform lens** (read the installed native sources: expo-notifications 57.0.24, expo-background-task 57.0.21, react-native-android-widget 0.24.0, react-native-health-connect 4.1.3)
- PLAT7-01 high · the background re-plan job carried `NetworkType.CONNECTED` (`BackgroundTaskScheduler.kt:107–127`): offline for more than the 36-hour planning horizon, reminders stop, and so does the background Health Connect read · **fixed** — pnpm patch `patches/expo-background-task@57.0.21.patch` (NOT_REQUIRED), registered in `pnpm-workspace.yaml`, verified applied in `node_modules`; paradigm 28; checklist X4; build guide explains how to re-create it if the package moves.
- PLAT7-02 med · exact-alarm denial was invisible (only POST_NOTIFICATIONS was checked) and the "Exact timing" button sent `REQUEST_SCHEDULE_EXACT_ALARM` without the package as data, which shows the list of every app on some phones; expo-notifications falls back to `setAndAllowWhileIdle` (`ExpoSchedulingDelegate.kt:105–119`), so Android 14+ installs run inexact by default · **fixed** — local module `modules/exact-alarms/` (`canScheduleExactAlarms()`, true below API 31, `requireOptionalNativeModule` so a build without it degrades to "unknown"); `exactAlarmsAllowed()` re-read on foreground; Reminders card shows a gold status line and **Allow exact timing** only when it is off; `openExactAlarmSettings()` uses expo-intent-launcher with `package:<id>` and falls back to app settings; copy says "minutes late, longer while the phone sleeps"; phone guide updated; checklist X1. `USE_EXACT_ALARM` deliberately not declared (Play restricts it to alarm-clock apps).
- PLAT7-03 med · granting or revoking exact access did not touch already-submitted requests (Expo returns its own store, not AlarmManager's registrations, and does not listen for the permission-changed broadcast) · **fixed** — the capability is part of the ledger signature, so the next sync (foreground, 3-hourly job, any state change) cancels and re-submits every future request; the mind screen re-submits its bell on foreground; paradigm 29; checklist X2, X3, X5.
- PLAT7-04 med · bottom sheets had a fixed 560 dp body with no window bound: in a ~400 dp split-screen or freeform window the header and close button left the usable area · **fixed** — `Sheet` max height = window height − top inset − 24, body `flexShrink`; checklist X6.
- Checked and clean: BOOT_COMPLETED re-schedules stored triggers; no-open notification actions use broadcasts (no trampoline); the headless task loads the JS app directly (no foreground service); channels and importance coherent; FCM default-channel metadata is inert without Firebase.

**Resilience / failure-injection lens**
- RES7-01 high · onboarding offered a restore only when the snapshot had habits; a heart-only, cycle-only or water-only snapshot was read, not offered, and then overwritten by the hourly writer · **fixed** — eligibility is the shared `hasUserData` (or habits); test.
- RES7-02 high · "Try to restore it" forgot the kept snapshot right after dispatching the import, before the database write committed; SQLITE_FULL or process death between the two lost the only copy · **fixed** — the card awaits `commitPending()` and forgets the kept file only after a successful commit; a failed commit says so and keeps the file.
- RES7-03 med · an accepted import kept unknown fields on every record (25 KB of junk per row round-tripped into every later export and the backup) · **fixed** — `projectRecords` keeps the known keys of every list on import; `parseState` hands the reducer a projected state; tests.
- RES7-04 med · notification responses combined a fresh `Date.now()` with the rendered tracking day, so a tap in the seconds after 03:00 (or after a zone change) logged the new instant under the old day · **fixed** — `NudgeScheduler` builds the command context inside the newest-state callback from one captured instant and `currentZone()`.
- RES7-05 med · the background Health Connect job swallowed exceptions with `console.warn`, so the card promised a "last error" it never showed · **fixed** — both paths write `BODY_SYNC.lastError` (epoch-checked, only while the connection is still on).
- Checked, degraded gracefully, left as is: SQLite open failure at cold start (red banner, no writes), interrupted migrations (transactional), SQLITE_FULL mid-session (five retries then a persistent banner), zone/clock change (next tick), Clear cache (scratch files only), restored stale Health Connect grants (re-checked 1.5 s after start). Drafts in sheets are lost on process death · **accepted** (a draft is not a record; a sheet-level autosave would write half-typed numbers).

**Code-quality lens**
- CODE7-01 high · Quick Log accepted any positive finite water amount while the sheets and the import had ceilings; one 1e12 ml drink made a backup the import then refused · **fixed** — `MAX_WATER_LOG_ML = 20,000` exported by `validate.ts`, enforced in Quick Log (hint, button disabled), the amount sheet, the command boundary and the import; test; checklist X11.
- CODE7-02 med · three volume parsers disagreed ("1,850" was 1,850 ml in Settings and 1.85 in the sheets) · **fixed** — one `parseVolumeInput`: a comma is a thousands separator only when it groups exactly three digits and there is no point; otherwise decimal; tests.
- CODE7-03 med · `scheduleMindEnd(...).catch(() => {})` made a bell the OS refused indistinguishable from one it accepted · **fixed** — the screen shows "The end bell could not be set…" and the session still counts; the discard path cancels only a bell this screen set (also SURF7-04).
- CODE7-04 low · React Compiler bails out of `TrackerProvider`, `NudgeScheduler`, `mind.tsx` (exhaustive-deps suppressions) and `WidgetSync` / `BackupSync` (render-time ref writes) · **partly fixed** — the system bridges update their "latest" refs in `useLayoutEffect`; the provider's render-time ref reads and the suppressed effects stay (they are correct and the bail-out costs nothing measurable; a rewrite to satisfy the compiler is a refactor for a quieter day).
- CODE7-05 low · `isNudgePayload` claimed the original object was a `NudgePayload` while judging the sanitized copy · **fixed** — removed; callers use `parsePayload` and act on its result.
- CODE7-06 low · the Sugar Shield / type / trigger ownership rule lived in three places · **fixed** — `src/domain/habits/snackMatch.ts` serves the selectors and the reducer's undo and clear; tests pin the three cases.

**Attack-surface lens** (scripted payloads against `parsePayload`, the import validator and the exported activity)
- SURF7-01 high · any app can start the exported `MainActivity` with an Expo *push* response whose data looks like one of ours, and log a meditation while the app is locked · **fixed at the JS boundary** — `isOwnTrigger` accepts only responses whose trigger is our local date trigger (or absent, as Expo reports some cold-start responses); forged shapes are dropped before `parsePayload`; test. The activity stays exported (Android needs it for the launcher and our own deep links).
- SURF7-02 med · a finite but absurd timestamp (`1e300`) passed the import and made Today throw in `Intl` for ever · **fixed** — `isInstantMs` (within ±200 years of now, integer) and `isCalendarDay` (a real date, 1970–2200) on every record, setting and period span; imports name the field they refused; tests.
- SURF7-03 med · the same number in a timer-bell payload crashed `trackingDayOf` · **fixed** — `parsePayload` bounds `mind.startAt` and its minutes; test.
- SURF7-04 med · opening `/mind` (deep link, behind the lock) cancelled the global bell of a session the app had been killed in · **fixed** — see CODE7-03.
- Checked and clean: > 50 habit ids rejected, unknown kinds rejected, `__proto__` keys stripped (no pollution), negative sizes dropped, duplicate ids handled, 64 MiB import ceiling intact.

**Product lens**
- PROD7-01 med · two timed reminders at the same minute merged into "Time for a break / Scheduled reminder", losing both habit names · **fixed** — planner candidates carry a `line`; a merge joins "A · B" and titles "Water & a reminder" when water meets a timed habit; tests.
- PROD7-02 med · onboarding promised notifications "only inside your active hours" while the selected-by-default Meditate rings at 07:30; two presets promised weekday selection the editor does not offer · **fixed** — onboarding and preset copy say what the planner does (automatic nudges inside the hours; a fixed time rings at that time; "until your weekly target is met").
- PROD7-03 med · "stays on this phone" on the health rationale, the Cycle tab, Settings and the Body connection card, with cloud backup on by default · **fixed** — paradigm 30.
- PROD7-04 med · "Start empty" and a cycle-only setup still landed on three empty tracker cards; the Cycle card could not be hidden from Today on its own · **fixed** — Today shows Water / Movement / Mind cards only for habits the person has (or logged today), with one explanatory line when none apply; `settings.cycle.showOnToday`; `/cycle` with tracking off shows a turn-on card instead of a blank tab; checklist X7–X9.
- PROD7-05 med · ounces rounded to whole numbers on Today ("+8 oz" for 250 ml) and to one decimal elsewhere · **fixed** — one decimal everywhere, ml stays whole; tests in domain and widget updated.
- PROD7-06 med · "Start fresh" on the onboarding restore card deleted the backup with no confirmation · **fixed** — "Start fresh and delete the backup?" with Keep / Delete; the card leaves only after the delete succeeds, and a failed delete is shown.
- PROD7-07 low · the widget card never said how to add the widget · **fixed** — "To add it: long-press an empty spot → Widgets → Daily Tracker" (Samsung variant noted).
- Also this round (own findings while editing): long habit names are cut at 40 characters in notification titles (`shortName`, test); every Health Connect card state has a "How it works" button (the e2e pass found the web branch without one).

**Browser e2e (round-6 build, before the fixes):** onboarding → Today → Habits → Mind timer → Settings → Body → Cycle all passed; the one failure was the missing "How it works" button on the web Health Connect card (fixed above).

## 7. Backlog and open questions

### For the user (never blocking)
- Private repository or public? (Pushes work either way.)
- What "Fable model" referred to.
- Final app name and icon (placeholder icon is generated with ImageMagick).
- ml vs oz default (onboarding defaults to ml); active hours 9–21 and the 10-nudges/day cap are defaults, both editable.
- Whether Play Store publication is wanted (adaptive icon, feature graphic, privacy policy page, Health Connect declaration, data-safety form, AAB).

### Deferred features (from the plan)
- Steps and cycle tiles in the widget; sleep-stages chart; write-back of water/mind sessions to Health Connect (v2).
- Per-habit notification sounds (deferred in the plan at M2, M3 and M6; still not built). The week-start setting shipped in round 16; reminder set-up inside habit creation in round 17.
- Preset habits added from the Library start with their preset's reminder; since round 19 the Library sheet shows it with Change before adding (days, times, interval, or off); since round 20 an archived preset added again keeps its history and takes the chosen reminder.
- Settings → Time format (Automatic / 12-hour / 24-hour) shipped in round 20; the app's dates stay English (month and weekday names) — a translated UI is not planned.
- An automatic luteal symptom check-in (a cycle reminder anchored "into the luteal phase" stands in).
- PIPE10-03 — reconstruction of merged reminders scheduled by v0.12 (they are replaced on the first sync after the update).

### Device verification owed
- `docs/DEVICE_CHECKLIST.md` rows N1–N17, W1–W8, H1–H9, C1–C4, L1–L10, R1–R12, S1–S10, T1–T11, U1–U11, V1–V11, X1–X11, Y1–Y14, Z1–Z13, AA1–AA16, AB1–AB11, AC1–AC8, AD1–AD7, AE1–AE6, AF1–AF5, AG1–AG6, AH1–AH2, AI1–AI3, AJ1–AJ4, AK1–AK4, AL1–AL3, AM1–AM4 have never been run on hardware. First build on the laptop is the next real milestone — and the reminder self-test (Settings → Reminders → Test) is the first thing to run on it.
- Residual risk carried knowingly: two JavaScript runtimes writing SQLite at once (UPG6-03, row V11). If the device run shows a lost write there, the fix is a database revision compared inside the write transaction.
- Rows added in round 7: X1–X5 (exact alarms and the offline re-plan — the two library defaults the platform lens read in the sources), X6 (sheets in a short window), X7–X9 (Today without the trio, cycle off / hidden), X10–X11 (long titles, the drink ceiling).
- Rows added in round 8: Y1–Y3 (snapshot replacement, kept copies, journaled deletes), Y4–Y6 (speculative and birth-control reminders, estimated wording), Y7–Y10 (widget sizes, font scale, notice), Y11–Y14 (drink reconcile, one night across sources, late records and backfill, permission names).
- Rows added in round 9: Z1–Z6 (deliveries before planning, merged notifications, evening snoozes, the hours before the boundary, a met weekly quota, the live countdown), Z7–Z9 (one-to-one drink twins, a re-granted type, "when the period begins"), Z10–Z13 (compact ring values, stepper hints, row labels, the water button's tap size).
- Rows added in round 11: AB1–AB3 (re-rings spend, erase forgets, a kill between the OS change and the record), AB4–AB7 (paused edits, the next-reminder line, weekdays), AB8–AB11 (tap-and-Done, freezes, the Water door, a widget tap under a failed save).
- Rows added in round 12: AC1 (a replace under a sync in flight), AC2–AC3 (a press under a kill, a replayed press), AC4 (a failed sync shows and retries), AC5 (PLAT12-03: a reboot with an expired alarm — measures the phantom), AC6–AC7 (across-the-boundary set times, the next-ring wording at night), AC8 (water copy in ounces).
- Rows added in round 13: AD1 (a refused schedule shows and retries), AD2 (a restore whose save fails does not inherit the old rings), AD3 (the launch press under a kill), AD4 (the Logged list and Remove from the widget's double tap), AD5 (a deep link under the lock), AD6 (`preset=__proto__` from another app), AD7 (Fix an older day).
- Rows added in round 14: AE1 (a crash during a failing save, then an erase — nothing comes back), AE2 (a press under a failed save: widget and backup honest, the press replays), AE3 (a database that cannot open shows Try again and cancels nothing), AE4 (Cards on Today), AE5 (a month picker months back, AA inks), AE6 (Clear day confirmed, the calendars under TalkBack).
- Rows added in round 15: AF1 (a fresh Android 13 install shows "Allow notifications"; denied twice reads as blocked; switched off in the app's settings reads as blocked), AF2 (backup turned off under a failed save: no snapshot comes back within the hour), AF3 (Undo after Remove and after Clear day, the exact times back; a toast hidden by an erase), AF4 (the Steps card from a hand-logged Steps habit, then from Health Connect once it delivers), AF5 (a reminder edit on one habit does not stall Today; a Health Connect read does not re-plan).
- Rows added in round 16: AG1 (Sunday-first weeks: counts, grids, the summary's day), AG2 (Undo under a sync), AG3 (the 25-hour night's slots and the rotation's turns), AG4 (the countdown across the fold), AG5 (nights across zones), AG6 (a widget tap under a slow background).
- Rows added in round 17: AH1 (a habit created with a set-times reminder rings at that time on those days, with the app killed), AH2 (a widget tap whose re-plan fails — airplane mode plus a full disk is hard to stage; at least: the tap survives a kill right after it and never shows "could not be saved" once the tile moved).
- Rows added in round 18: AI1 (a crash-and-recover with reminders off: no alarm comes back), AI2 (a meditation stopped within a second of starting: no bell rings), AI3 (the creation form's Daily maximum follows the time rows).
- Rows added in round 19: AJ1 (a preset added with chosen days rings on those days only, app killed), AJ2 (a one-minute "Other" meditation's end bell), AJ3 (TalkBack announces checked / selected / disabled on day letters, chips, done rows and past-days cells), AJ4 (About shows the app.json version on the installed build).
- Rows added in round 20: AK1 (a phone set to 24-hour time writes every time "21:30" under Automatic, and follows the switch when it is flipped in the background), AK2 (an archived preset added again with chosen days rings on those days and keeps its history), AK3 (an encrypted export of a large state keeps the busy label moving and Cancel responsive), AK4 (amounts typed on German and Arabic keyboards); AJ4 now expects 0.24.0.
- Rows added in round 21: AL1 (the reminder self-test on a locked phone, then with the app killed; "No" lists the checks), AL2 (Cancel during an unlock: no replace confirmation afterwards; a wrong password's error does not reach the next sheet), AL3 (a crafted backup with a fractional rotation offset is refused at import).
- Rows added in round 22: AM1 (TalkBack: a sheet announces its title on open, headings are reachable by heading navigation on Today, Settings and a habit page), AM2 (a 320-dp-class phone or display size "Largest": the rings card stacks, "Done now" / "+250 ml" / "Period started today" whole, the Log sheet's button inside the sheet), AM3 (the self-test's Cancel under a refused cancel — hard to stage; at least: Send twice quickly leaves one ring, Cancel leaves none), AM4 (a test sent on a fresh install before any reminder was planned still rings — the channel exists); AJ4 now expects 0.26.0.
- PLAT12-03 (deferred): after a reboot Android drops expired one-shot alarms before Expo's boot receiver runs; the next sync reads them as rung and the daily cap is spent a slot early. A fix needs a Kotlin boot receiver that records the boot instant for the JavaScript side; AC5 measures how often it bites.
- Rows added in round 10: AA1–AA8 (occurrences, the journal under a lost save, a clock set back, yesterday's tap, exempt rings, missed mornings, night-owl hours, the background re-plan), AA9–AA16 (rest of today, the reminder editor on custom / preset / movement habits, ounces everywhere, Body extrema, freezes by cadence, confirmations).
- Deferred from round 8: Health Connect change tokens (`getChanges`) as an optimisation over the rolling window; "sharpens after three" copy.
- Not compile-verified here: `modules/exact-alarms/` (Kotlin) — the first laptop build either compiles it or deletes the folder (the app degrades to "exact timing unknown").
