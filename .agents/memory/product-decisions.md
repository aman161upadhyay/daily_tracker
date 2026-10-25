---
name: Product decisions (Daily Tracker)
description: Non-obvious product/UX decisions and user-stated constraints that the code does not explain.
---

- User constraints (stated 2026-10-25): Android install via sideloaded APK first; home-screen water widget
  with a tap button; movement nudges every 60/90 min (user-tunable); research-backed habit combos; copy the
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
- Open questions still unanswered by the user: private repo?, meaning of "Fable model", final app
  name/icon, ml vs oz default (onboarding defaults to ml), Cadence Kotlin source availability,
  active hours 9–21 and a 10-nudges/day cap.
