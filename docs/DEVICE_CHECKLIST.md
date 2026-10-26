# Device checklist

Things that can only be verified on a real Android phone (Expo Go stubs notifications' background parts,
widgets and Health Connect). Run after each native build; tick the row in the PR / commit message.
Ported from Cadence E1–E17 where the behaviour carried over.

**Build under test:** dev build from `npx expo prebuild -p android && npx expo run:android` (debug) or the
release APK. Phone: Android 12+ (exact alarms need the user's grant from 12, notifications need runtime
permission from 13).

## G — Expo Go (Replit's Android emulator, or the QR code on a phone)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| G1 | Cold start | Open the project in Expo Go on Android | Onboarding (fresh) or Today — no red error screen. Known past failures: missing FCM topic module (patched, see replit.md) and a self-importing `.native` module (both fixed 2026-10-26) |
| G2 | Local nudges in Expo Go | Allow notifications, set the movement interval to 45 min | Nudges arrive while the app is open or in the background; the Done/Snooze buttons work while Expo Go is alive. With Expo Go swiped away they do **not** (that is the dev build's job — N6) |

## N — Notifications (M2)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| N1 | Permission flow | Fresh install → finish onboarding → Settings → Reminders | "Allow notifications" button → system prompt → row shows "Notifications allowed"; denying shows "Blocked in system settings" + Open settings |
| N2 | Exact timing | Settings → Reminders → Exact timing | Opens Android's "Alarms & reminders" screen for the app; after allowing, nudges arrive on the planned minute (compare "Next up" with the actual delivery) |
| N3 | Channels | Android Settings → Apps → Daily Tracker → Notifications | Five channels: Movement & habit nudges, Water, Weekly summary (low), Cycle, Timer (high) |
| N4 | Rotation nudge, app in foreground | Set interval 45 min, wait for the slot (or move the clock) | Banner "Movement snack" with Done · In 15 min · Swap; the Today card shows the same snack and time |
| N5 | Done from the notification, app in background | Home button, wait for a nudge, press Done | Notification disappears without opening the app; reopen → the snack is logged with trigger NUDGE, rotation advanced, the "Next up" list moved on |
| N6 | Done with the app swiped away | Swipe the app from Recents, wait for a nudge, press Done | Same as N5 (headless task). If the snack is missing after reopening, note the Android version — fallback is to open the app on tap |
| N7 | Snooze / Swap | Press "In 15 min" on one nudge; press Swap on another | Snoozed one returns in 15 min with the same snack; swapped one returns within a minute with the other snack; later slots keep their times |
| N8 | Water pace | Log nothing until mid-morning | "Water" nudge with "+250 ml" (your tap size) · In 15 min; log enough to be on pace → the next water check disappears from "Next up" |
| N9 | Merged nudge | Make a water check land within 5 min of a movement slot | One notification "Water & a movement snack" with Done · +ml · In 15 min; +ml logs water and keeps the movement half for 15 min |
| N10 | Daily cap & active hours | Set cap 3; wait past three nudges; also check after the active-hours end | Nothing more that day; nothing after the end; FIXED times you set (e.g. 21:30 reading) still fire |
| N11 | Doze | `adb shell dumpsys deviceidle force-idle`, wait for a slot | With exact timing allowed: on time; without: within Android's maintenance window (minutes late is expected, document how late) |
| N12 | Reboot / time zone | Reboot; separately, change the device time zone | Nudges continue after reboot (BOOT_COMPLETED re-schedules; the 3-hourly task re-plans); after a zone change the next re-plan uses wall-clock slots in the new zone |
| N13 | Mind timer bell | Start a 5-min meditation, lock the phone | Bell notification at the end; session logged when you return. Pause/finish early → no bell |
| N14 | Sugar Shield | Today → Sugar Shield → Start → finish → "Log & set the walk reminder" | Squat logged under Sugar Shield (not the rotation); "Post-meal walk" notification 20 min later with Did it · In 15 min; Did it logs a walk |
| N15 | Weekly summary | Sunday at the chosen time (or set the time to a minute ahead) | One "Your week" notification; tap opens Today; never a second one the same day |
| N16 | Pause | Settings → Pause → 2 hours | "Next up" starts after the pause; switch Reminders off entirely → all scheduled notifications cancelled (`adb shell dumpsys notification --noredact | grep dailytracker` is empty of ours) |
| N17 | Headless write + foreground | Press Done on a nudge while the app is in the background, then open the app | The log is visible immediately (provider reloads from SQLite on foreground); make another change → both survive a restart |

## W — Widget (M3, placeholder rows)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| W1 | Add widget | Long-press home screen → Widgets → Daily Tracker | The habits chosen in Settings → Home-screen widget (or the automatic three) with one-tap logging |
| W2 | Widget with the app swiped away | Swipe the app away; tap a widget action | Value updates within seconds; open app → same value |
| W3 | After reboot | Reboot | Widget shows current values, not zeros |

## H — Health Connect (M4, placeholder)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| H1 | Permission | Body tab → Connect | Health Connect permission screen; steps/sleep/heart cards fill in after approval |

## Recording results

Add a dated line under the milestone in `docs/IMPLEMENTATION_PLAN.md` ("Device run YYYY-MM-DD, Pixel 7 / Android 15: N1–N17 pass except …") and open follow-ups for anything that failed.
