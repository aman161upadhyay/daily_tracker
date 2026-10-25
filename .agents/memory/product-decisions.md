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
  history keeps the old target.
- Adherence colors go on fills only, never text (contrast); gold frame = "in flow" (≥ 90 % adherence).
- Open questions still unanswered by the user: private repo?, meaning of "Fable model", final app
  name/icon, ml vs oz default, cycle opt-in at onboarding vs Settings, Cadence Kotlin source availability,
  active hours 9–21 and a 10-nudges/day cap.
