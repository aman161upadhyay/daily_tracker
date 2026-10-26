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
- Craft & learning presets carry honest evidence labels (read-before-bed Emerging; technical reading
  Moderate; write Moderate; build-with-AI Emerging = habit-formation evidence, not a productivity claim).
- Open questions still unanswered by the user: private repo?, meaning of "Fable model", final app
  name/icon, ml vs oz default (onboarding defaults to ml), Cadence Kotlin source availability,
  active hours 9–21 and a 10-nudges/day cap.
