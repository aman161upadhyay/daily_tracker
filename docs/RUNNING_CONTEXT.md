# Running context — Daily Tracker

The hand-over file. It is kept current by whoever (human or agent) works on the project and is the
first thing to read after `replit.md`. It answers: what exists, why it is the way it is, how work is
verified, what happened step by step, and what is still open. Append to the journal; never rewrite
history.

Last updated: 2026-10-26, overnight autonomous session (council rounds 1–3 fixed; see journal and §6).

---

## 1. Status at a glance

| | |
|---|---|
| App | Daily Tracker — private Android tracker: habits · water · movement snacks · meditation · opt-in cycle · home-screen widget · configurable nudges · Health Connect import · app lock · encrypted backups |
| Code | `artifacts/daily-tracker/` — Expo SDK 57, React Native 0.86, TypeScript, Expo Router, expo-sqlite |
| Version | `app.json` `version 0.7.0`, `versionCode 7`, tag `v0.7` (M6 complete + council rounds 1–3) |
| Repo | https://github.com/aman161upadhyay/daily_tracker.git, branch `main`, commits authored as Aman |
| Milestones | M0 skeleton ✅ · M1 storage/streaks/onboarding ✅ · M2 nudges/notifications ✅ · M3 widget ✅ · M4 Health Connect/Body ✅ · M5 cycle ✅ · M6 theme/lock/backup/signing ✅ (`docs/IMPLEMENTATION_PLAN.md`) |
| Verified here | type-check (three packages), 215 unit tests, Android Metro bundle, Hermes bytecode compile, `expo export` release bundle, `expo prebuild` manifest/gradle checks, web walkthroughs by a browser-driving tester |
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
- `docs/DEVICE_CHECKLIST.md` rows N1–N17, W1–W8, H1–H9, C1–C4, L1–L10, R1–R12, S1–S10 have never been run on hardware. First build on the laptop is the next real milestone.
- Rows added this round: R9 and S6 now test both sides of the 3 am boundary; W4/W6/N-rows exercise the live-store path (app open vs swiped away) — both paths must log exactly once.
