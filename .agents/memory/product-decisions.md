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
- Craft & learning presets carry honest evidence labels (read-before-bed Emerging; technical reading
  Moderate; write Moderate; build-with-AI Emerging = habit-formation evidence, not a productivity claim).
- Open questions still unanswered by the user: private repo?, meaning of "Fable model", final app
  name/icon, ml vs oz default (onboarding defaults to ml), Cadence Kotlin source availability,
  active hours 9–21 and a 10-nudges/day cap.
