# Running context — Daily Tracker

The hand-over file. It is kept current by whoever (human or agent) works on the project and is the
first thing to read after `replit.md`. It answers: what exists, why it is the way it is, how work is
verified, what happened step by step, and what is still open. Append to the journal; never rewrite
history.

Last updated: 2026-10-26, autonomous session (council rounds 1–5 fixed; see journal and §6).

---

## 1. Status at a glance

| | |
|---|---|
| App | Daily Tracker — private Android tracker: habits · water · movement snacks · meditation · opt-in cycle · home-screen widget · configurable nudges · Health Connect import · app lock · encrypted backups |
| Code | `artifacts/daily-tracker/` — Expo SDK 57, React Native 0.86, TypeScript, Expo Router, expo-sqlite |
| Version | `app.json` `version 0.9.0`, `versionCode 9`, tag `v0.9` (M6 complete + council rounds 1–5) |
| Repo | https://github.com/aman161upadhyay/daily_tracker.git, branch `main`, commits authored as Aman |
| Milestones | M0 skeleton ✅ · M1 storage/streaks/onboarding ✅ · M2 nudges/notifications ✅ · M3 widget ✅ · M4 Health Connect/Body ✅ · M5 cycle ✅ · M6 theme/lock/backup/signing ✅ (`docs/IMPLEMENTATION_PLAN.md`) |
| Verified here | type-check (three packages), 245 unit tests, Android Metro bundle, Hermes bytecode compile, `expo export` release bundle, `expo prebuild` manifest/gradle checks, web walkthroughs by a browser-driving tester |
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

(Entries for each council round follow below as they happen.)

## 6. Council log

Format per round: lens → findings (severity · title · disposition · commit). Dispositions: **fixed**,
**rejected** (reason), **deferred** (needs user/phone).

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

## 7. Backlog and open questions

### For the user (never blocking)
- Private repository or public? (Pushes work either way.)
- What "Fable model" referred to.
- Final app name and icon (placeholder icon is generated with ImageMagick).
- ml vs oz default (onboarding defaults to ml); active hours 9–21 and the 10-nudges/day cap are defaults, both editable.
- Whether Play Store publication is wanted (adaptive icon, feature graphic, privacy policy page, Health Connect declaration, data-safety form, AAB).

### Deferred features (from the plan)
- Steps and cycle tiles in the widget; sleep-stages chart; write-back of water/mind sessions to Health Connect (v2).

### Device verification owed
- `docs/DEVICE_CHECKLIST.md` rows N1–N17, W1–W8, H1–H9, C1–C4, L1–L10, R1–R12, S1–S10, T1–T11, U1–U11 have never been run on hardware. First build on the laptop is the next real milestone.
- Rows added this round: R9 and S6 now test both sides of the 3 am boundary; W4/W6/N-rows exercise the live-store path (app open vs swiped away) — both paths must log exactly once.
