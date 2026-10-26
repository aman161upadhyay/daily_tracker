# Device checklist

Things that can only be verified on a real Android phone (Expo Go stubs notifications' background parts,
widgets and Health Connect). Run after each native build; tick the row in the PR / commit message.
Ported from Cadence E1–E17 where the behaviour carried over.

**Build under test:** dev build or release APK from the laptop (`docs/BUILD_ANDROID.md`). Phone: Android 12+ (exact alarms need the user's grant from 12, notifications need runtime
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

## W — Widget (M3)

The widget is one app-widget ("Daily Tracker" in the picker), resizable. Up to three tiles: the habits chosen in
Settings → Home-screen widget, in that order, or automatically water · the snack that is up next in the movement
rotation · mind. Tap a ring = log its natural unit (one tap of water, one snack set, the day's target for a
count/timer habit, "done" for a yes/no habit); tap the name = open that habit; tap the background = open the app.

| # | Scenario | Steps | Expect |
|---|---|---|---|
| W1 | Add widget | Long-press home screen → Widgets → Daily Tracker → place it at 4×2 | Three tiles with rings, values and names in the app's fonts/colours (Manrope, teal/green/violet on the dark card with the gold hairline); the preview in the picker matches |
| W2 | Sizes | Resize to 2×2, then to 4×1 | 2×2: one big ring (the first habit); 4×1: three small rings beside their text. Nothing clipped or overlapping; names truncate with "…" |
| W3 | Tap to log, app in background | Home button; tap the water ring twice, then the movement ring | Water value rises by one tap size each time (e.g. 0 ml → 250 ml → 500 ml) within a second; movement count +1 and the tile's name changes to the next snack in the rotation; open the app → Today shows the same numbers (source "widget") |
| W4 | Tap with the app swiped away | Swipe the app from Recents; tap a ring | Same as W3 (headless task, no app window opens). If the value does not change, note the Android version and whether battery optimisation is on for the app |
| W5 | Tap the name / background | Tap "Water"; go back; tap the empty card area | Name opens the app on that habit's page; background opens the app on Today |
| W6 | Stays in sync | In the app, log water, archive a habit, change the widget picks in Settings, change units to oz | Widget redraws within a second each time; after a notification "Done" with the app closed the widget also updates |
| W7 | Day rollover & reboot | Leave it overnight (3 am boundary); reboot the phone | Morning: zeros again by the next periodic update (≤ 30 min after 3 am) or immediately after opening the app; after reboot: current values, not an empty card |
| W8 | Yes/no habit | Choose a yes/no habit in Settings; tap its ring twice | First tap: ring full, "✓", caption "Done"; second tap: nothing changes (no double log) |

## H — Health Connect (M4)

Before starting: install or update Health Connect (built in on Android 14+; Play Store on 9–13) and turn on
"sync with Health Connect" inside Samsung Health / Fitbit / Google Fit, then wait for one sync. Add the Steps habit
from the Library so the auto-fill has somewhere to land.

| # | Scenario | Steps | Expect |
|---|---|---|---|
| H1 | Status card | Open the Body tab before installing Health Connect (older Android) / after installing | "Not installed" card with Install → Play Store; after install and "I installed it", the card becomes "Ready to connect" |
| H2 | Permissions | Body tab → Connect | Health Connect's own sheet lists exactly the eight types (steps, sleep, exercise, heart rate, resting heart rate, weight, hydration, background). The "privacy policy" link opens the app (rationale intent, no crash). Allow all |
| H3 | First sync | Right after allowing | Card reads "Connected · 7 of 7 data types · Synced hh:mm"; Steps/Sleep/Resting HR/Weight/Workouts cards show the phone's real numbers for the last 30 days (compare with the source app). Empty types show "Nothing in Health Connect yet", not zero |
| H4 | Steps auto-fill | Today / Habits → Steps | Today's total equals the Body tab value; the entry is marked automatic. Type a total by hand → it replaces the automatic one; Sync now does not bring the automatic one back |
| H5 | Workout tick | Log a strength workout of ≥ 15 min in the source app, wait for it to reach Health Connect, Sync now | Strength session is ticked once for that day; a walk does not tick it. Hide the session on the Workouts page → it stays hidden after another Sync now |
| H6 | Water import | Log 300 ml in Samsung Health; Sync now | One 300 ml entry appears in the water log (source Health Connect). Log the same amount in both apps within 5 min → only one entry |
| H7 | Partial permissions | Health Connect app → Daily Tracker → turn off Sleep; Sync now | Card says "6 of 7"; the Sleep card shows the last imported nights but no new ones; no error for the other types. Turn everything off → the app says access was removed and offers Connect again |
| H8 | Background | Allow background access; leave the phone overnight with the app closed | Morning: last-night sleep and the step count are already there when the app opens (Synced time earlier than the open). If not, note whether battery optimisation is on for the app |
| H9 | Remove and reconnect | Settings → Connections → Remove imported data (accept) | Body tab empty again, automatic steps/strength/water entries gone, manual ones kept; Connect again re-reads 30 days without duplicates |

## C — Cycle notifications (M5)

Before starting: Settings → Cycle tracking on; log a period start about 23 days ago through the calendar (so the
"Vitamin C" reminder — 5 days before the expected start — falls on today or tomorrow). Everything else about the
cycle (phases, calendar, day sheet, insights) was verified in the web preview and needs no phone step.

| # | Scenario | Steps | Expect |
|---|---|---|---|
| C1 | Lock-screen privacy | Let the Vitamin C reminder fire while the phone is locked | On the lock screen the notification shows only the app name / "Contents hidden" (channel is PRIVATE); the title "Vitamin C" appears once unlocked. Android → App info → Notifications → Cycle shows "Lock screen: hide sensitive content" |
| C2 | Discreet wording | Settings → Discreet notifications on; move the reminder time to a minute ahead; wait | Title "Daily Tracker", body "You have a reminder." both in the shade and on the lock screen; tapping opens the Cycle tab |
| C3 | Expected-day prompt | Set the typical length so the expected day is today; no period logged | At 9:00 a "Cycle" notification ("Around the expected day — log it when it starts."); logging "Period started today" removes any pending copy |
| C4 | Late suppression | Make the period 2 days late (log the last start ≥ typical + 2 days ago) | Cycle tab shows "n days late" and "Cycle reminders pause while the period is late"; no Vitamin C notification arrives until a start is logged |

## L — Lock, backup, release (M6)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| L1 | App lock on open | Settings → Privacy → App lock on (needs a screen lock on the phone); swipe the app away; open it | The lock screen (padlock, "Locked. Widgets and reminders keep working.") appears and the fingerprint / PIN prompt opens by itself; cancelling leaves the Unlock button; unlocking shows Today |
| L2 | Lock after delay | Set "Lock again after" to 1 min; go Home for 20 s and come back; then for 90 s and come back | No prompt after 20 s; prompt after 90 s. "Right away" prompts even after a 2 s switch |
| L3 | Locked widget still logs | While the app is locked, tap "+" on the water tile of the widget and the "Done" button of a nudge notification | Both log (widget count rises, notification clears); opening the app still asks to unlock and then shows the new entries |
| L4 | No screen lock | Remove the phone's screen lock (or use a phone without one) and open Settings | App lock switch is off and disabled with the hint to set up a screen lock first; an already-enabled lock lets the app open instead of trapping the user |
| L5 | Encrypted export round-trip | Settings → Your data → Export backup with password `test-pass-1`; share to Files; Import backup → choose that file | Import asks for the password; a wrong one says "Wrong password, or the file is damaged."; the right one shows the replace confirmation and imports |
| L6 | Auto Backup snapshot | Use the app for a minute, leave it; `adb shell run-as com.amanupadhyay.dailytracker ls -l files/backup` (debug build) | `snapshot.json` exists and is newer than the last foreground; "Erase everything" removes it |
| L7 | Restore prompt | `adb shell bmgr backupnow com.amanupadhyay.dailytracker`; uninstall; reinstall; `adb shell bmgr restore <token> com.amanupadhyay.dailytracker`; open the app | Onboarding shows the gold "Welcome back" card with the habit / log counts; "Restore it" lands on Today with the data; "Start fresh" hides the card |
| L8 | Light theme | Settings → Appearance → Light, then System with the phone in dark mode | Light: light header, tab bar and cards, green buttons with white text, all text readable. System: follows the phone's setting live |
| L9 | Large text + reduce motion | Phone Display → Font size largest, Accessibility → Remove animations | Today's rings and numbers stay inside their cards (titles cap their growth; body copy grows); press-scale, ring fill and bar animations are instant; the breathing circle still breathes |
| L10 | Release signature | `apksigner verify --print-certs app-release.apk` after the M6 recipe | Certificate is the one from `keytool`, not `CN=Android Debug`; `adb install -r` over a previous release build succeeds |

## Recording results

Add a dated line under the milestone in `docs/IMPLEMENTATION_PLAN.md` ("Device run YYYY-MM-DD, Pixel 7 / Android 15: N1–N17 pass except …") and open follow-ups for anything that failed.
