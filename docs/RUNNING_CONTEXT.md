# Running context — Daily Tracker

The hand-over file. It is kept current by whoever (human or agent) works on the project and is the
first thing to read after `replit.md`. It answers: what exists, why it is the way it is, how work is
verified, what happened step by step, and what is still open. Append to the journal; never rewrite
history.

Last updated: 2026-10-26 (overnight autonomous session, see journal).

---

## 1. Status at a glance

| | |
|---|---|
| App | Daily Tracker — private Android tracker: habits · water · movement snacks · meditation · opt-in cycle · home-screen widget · configurable nudges · Health Connect import · app lock · encrypted backups |
| Code | `artifacts/daily-tracker/` — Expo SDK 57, React Native 0.86, TypeScript, Expo Router, expo-sqlite |
| Version | `app.json` `version 0.6.0`, `versionCode 6`, tag `v0.6` (M6 complete) |
| Repo | https://github.com/aman161upadhyay/daily_tracker.git, branch `main`, commits authored as Aman |
| Milestones | M0 skeleton ✅ · M1 storage/streaks/onboarding ✅ · M2 nudges/notifications ✅ · M3 widget ✅ · M4 Health Connect/Body ✅ · M5 cycle ✅ · M6 theme/lock/backup/signing ✅ (`docs/IMPLEMENTATION_PLAN.md`) |
| Verified here | type-check, 170 unit tests, Android Metro bundle, Hermes bytecode compile, `expo prebuild` manifest/gradle checks, web walkthroughs by a browser-driving tester |
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
| 2026-10-26 night | User went to sleep with the standing instruction: run an adversarial council loop, fix, test end to end, keep pushing, maintain this file and a plain-language phone guide, ask nothing. Wrote `docs/GET_IT_ON_YOUR_PHONE.md` and this file; README refreshed (it still described Drizzle/Vitest/npm) | see §6 |

(Entries for each council round follow below as they happen.)

## 6. Council log

Format per round: lens → findings (severity · title · disposition · commit). Dispositions: **fixed**,
**rejected** (reason), **deferred** (needs user/phone).

_Round 1 — pending (see journal)._

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
- `docs/DEVICE_CHECKLIST.md` rows N1–N17, W1–W8, H1–H9, C1–C4, L1–L10 have never been run on hardware. First build on the laptop is the next real milestone.
