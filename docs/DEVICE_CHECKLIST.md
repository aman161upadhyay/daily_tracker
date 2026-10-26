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
| W3 | Tap to log, app in background | Home button; tap the water ring twice, then the movement ring | Water value rises by one tap size each time (e.g. 0 ml → 250 ml → 500 ml) within a few seconds (the first tap after the app was swiped away starts a background runtime, 2–3 s on a mid-range phone; later taps are quicker); movement count +1 and the tile's name changes to the next snack in the rotation; open the app → Today shows the same numbers (source "widget") |
| W4 | Tap with the app swiped away | Swipe the app from Recents; tap a ring | Same as W3 (headless task, no app window opens). If the value does not change, note the Android version and whether battery optimisation is on for the app |
| W5 | Tap the name / background | Tap "Water"; go back; tap the empty card area | Name opens the app on that habit's page; background opens the app on Today |
| W6 | Stays in sync | In the app, log water, archive a habit, change the widget picks in Settings, change units to oz | Widget redraws within a few seconds each time (the app's own redraw is debounced, 400 ms after the last change); after a notification "Done" with the app closed the widget also updates |
| W7 | Day rollover & reboot | Leave it overnight (3 am boundary); reboot the phone | Morning: zeros again by the next periodic update (≤ 30 min after 3 am) or immediately after opening the app; after reboot: current values, not an empty card |
| W8 | Yes/no habit | Choose a yes/no habit in Settings; tap its ring twice | First tap: ring full, "✓", caption "Done"; second tap: nothing changes (no double log) |

## H — Health Connect (M4)

Before starting: install or update Health Connect (built in on Android 14+; Play Store on 9–13) and turn on
"sync with Health Connect" inside Samsung Health / Fitbit / Google Fit, then wait for one sync. Add the Steps habit
from the Library so the auto-fill has somewhere to land.

| # | Scenario | Steps | Expect |
|---|---|---|---|
| H1 | Status card | Open the Body tab before installing Health Connect (older Android) / after installing | "Not installed" card with Install → Play Store; after install and "I installed it", the card becomes "Ready to connect" |
| H2 | Permissions | Body tab → Connect | Health Connect's own sheet lists exactly the eight types (steps, sleep, exercise, heart rate, resting heart rate, weight, hydration, background). The "privacy policy" link opens **"Your health data"** (the rationale screen, not Today) — test it once with the app open and once after swiping the app away (cold start through `HealthRationaleActivity`); Done returns to Health Connect's sheet or to Today, never to a blank screen. Allow all |
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
| C1 | Lock-screen privacy | Settings → Cycle → **Discreet notifications off** (it is on by default); let the Vitamin C reminder fire while the phone is locked | On the lock screen the notification shows only the app name / "Contents hidden" (channel is PRIVATE); the title "Vitamin C" appears once unlocked. Android → App info → Notifications → Cycle shows "Lock screen: hide sensitive content" |
| C2 | Discreet wording (the default) | Leave Discreet notifications on; move the reminder time to a minute ahead; wait | Title "Daily Tracker", body "You have a reminder." both in the shade and on the lock screen; tapping opens the Cycle tab |
| C3 | Expected-day prompt | Discreet notifications off; set the typical length so the expected day is today; no period logged | At 9:00 a "Cycle" notification ("Around the expected day — log it when it starts."); with Discreet on it reads "You have a reminder." instead; logging "Period started today" removes any pending copy |
| C4 | Late suppression | Make the period 2 days late (log the last start ≥ typical + 2 days ago) | Cycle tab shows "n days late" and "Cycle reminders pause while the period is late"; no Vitamin C notification arrives until a start is logged |

## L — Lock, backup, release (M6)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| L1 | App lock on open | Settings → Privacy → App lock on (needs a screen lock on the phone); swipe the app away; open it | The lock screen (padlock, "Locked. Widgets and reminders keep working.") appears and the fingerprint / PIN prompt opens by itself; cancelling leaves the Unlock button; unlocking shows Today |
| L2 | Lock after delay | Set "Lock again after" to 1 min; go Home for 20 s and come back; then for 90 s and come back | No prompt after 20 s; prompt after 90 s. "Right away" prompts even after a 2 s switch |
| L3 | Locked widget still logs | While the app is locked, tap "+" on the water tile of the widget and the "Done" button of a nudge notification | Both log (widget count rises, notification clears); opening the app still asks to unlock and then shows the new entries |
| L4 | No screen lock | Remove the phone's screen lock (or use a phone without one) and open Settings | App lock switch is off and disabled with the hint to set up a screen lock first; an already-enabled lock lets the app open instead of trapping the user |
| L5 | Encrypted export round-trip | Settings → Your data → Export backup with password `test-pass-1`; share to Files; Import backup → choose that file | Import asks for the password; a wrong one says "Wrong password, or the file is damaged."; the right one shows the replace confirmation and imports |
| L6 | Auto Backup snapshot | Use the app for a minute, leave it; `adb shell run-as com.amanupadhyay.dailytracker ls -l files/backup` (debug build) | `snapshot.json` exists; it is rewritten at most once an hour (a second check within the hour shows the same timestamp — by design, not a missed write); "Erase everything" removes it |
| L7 | Restore prompt | `adb shell bmgr backupnow com.amanupadhyay.dailytracker`; uninstall; reinstall; `adb shell bmgr restore <token> com.amanupadhyay.dailytracker`; open the app | Onboarding shows the gold "Welcome back" card with the habit / log counts; "Restore it" lands on Today with the data; "Start fresh" hides the card |
| L8 | Light theme | Settings → Appearance → Light, then System with the phone in dark mode | Light: light header, tab bar and cards, green buttons with white text, all text readable. System: follows the phone's setting live |
| L9 | Large text + reduce motion | Phone Display → Font size largest, Accessibility → Remove animations | Today's rings and numbers stay inside their cards (titles cap their growth; body copy grows); press-scale, ring fill and bar animations are instant; the breathing circle still breathes |
| L10 | Release signature | `apksigner verify --print-certs app-release.apk` after the M6 recipe | Certificate is the one from `keytool`, not `CN=Android Debug`; `adb install -r` over a previous release build succeeds |

## R — Council round 1 follow-ups (2026-10-26)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| R1 | Notification step in onboarding | Fresh install → onboarding step 6 "Reminders" on Android (step 5 elsewhere; the Android "Phone backup" step comes before it) → Allow notifications | System prompt appears; the step shows "Notifications allowed"; denying shows the "off for this app" copy and Settings → Reminders offers Open settings |
| R2 | Lock state: no screen lock while enabled | Enable App lock, then remove the phone's screen lock, reopen the app | The gate steps aside (no trap); Settings shows the lock as unavailable |
| R3 | Lock state: biometric error | Enable App lock; cover the sensor / fail the fingerprint five times | Gate stays locked with "Try again"; a later success unlocks; no loop of prompts after Cancel |
| R4 | Screenshots while locked | Lock the app, try a screenshot and open Recents | Screenshot blocked / recents thumbnail blank while the App lock setting is on — including after unlocking (the secure flag follows the *setting*, so a locked-enabled app never leaks a Recents thumbnail); allowed again once App lock is turned off |
| R5 | Release-key warning | Build release without `DT_RELEASE_*` set | Gradle prints the `WARNING: DT_RELEASE_STORE_FILE is not set` line; with the properties set, no warning and L10 passes |
| R6 | Auto Backup per Android version | Android 9–11 device: `adb shell bmgr backupnow`; Android 8.x device: Settings → Your data | 9–11: backup runs only with a device lock (client-side encryption); 8.x: card says cloud backup needs Android 9 and offers Export |
| R7 | Steps ownership | Grant Health Connect steps; tap the Steps habit in the widget / press Done on a Steps nudge (none should exist) | Steps never appear as a widget tile action and no nudge offers Done for steps; the Steps value equals Health Connect's total |
| R8 | Weekly habit Done from a notification | Strength session (2× / week) already met this week; press Done on its nudge | Today gets one entry; pressing Done again adds nothing |
| R9 | Timer bell across the day boundary | Day boundary at its default 3 am. Start a 13-min meditation at 02:40, lock the phone, tap the bell later in the morning; then a 13-min one at 02:55 | Each session shows on the tracking day it *ended* on: the first (ended 02:53) on the previous day, the second (ended 03:08) on the new day |
| R10 | Headless write while the app is open | Keep Today open; press Done on a nudge from the shade | Today updates within a second without reopening; nothing is logged twice |
| R11 | Persist failure banner | `adb shell run-as <package> chmod 000 files/SQLite` (debug build; the database is `files/SQLite/dailytracker.db`) then log water | Red banner appears; after `chmod 771 files/SQLite` it clears on the next write |
| R12 | Sugar Shield entry points | Without the Sugar Shield habit: Today Movement card footer, the Log sheet's "Before something sweet", then add the habit and open its page | All three open /shield; the habit page has "Start Sugar Shield" |

## S — Council round 2 follow-ups (2026-10-26)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| S1 | Widget tap and notification button together | With the app closed: press Done on a nudge in the shade and tap a widget tile within the same second | Both logs land exactly once; widget and Today agree after opening the app |
| S2 | Button press while the app is open behind the shade | App open on Today, pull the shade, press Done | Today shows the log within a second (no foreground change needed) |
| S3 | Late alarm (inexact) | Android 14+, exact alarms *not* allowed; wait for a nudge that arrives a few minutes late, then open the app right after its planned time but before it arrived | The pending notification still arrives; the daily cap is not charged twice; a nudge over 30 min late is dropped quietly |
| S4 | Leaving the meditation timer | Start a 5-minute meditation, after 90 s press the system Back | Dialog: Keep timing / Finish · log 2 min / Discard; Back under one minute offers Keep / Discard only; the header arrow and the Finish button behave the same |
| S5 | Onboarding backup step | Fresh install (Android) | Step 5 "Phone backup" with the switch on; turning it off and finishing leaves Settings → Android phone backup off and no `files/backup/snapshot.json` is written |
| S6 | Health Connect: tracking-day steps | Day boundary at its default 3 am; walk 500 steps at 02:30 and 500 more at 03:30 | Body tab counts all 1,000 on the calendar day; the Steps habit puts the 02:30 steps on the previous tracking day and the 03:30 steps on the new one |
| S7 | Health Connect: upstream deletion | Delete a strength session and a drink in the source app, then Sync now | The automatic Strength tick and the imported drink disappear; manual logs stay; a drink edited upstream shows the new amount |
| S8 | Widget-only day | Log only from the widget for a day with phone backup on | `files/backup/snapshot.json` is at most an hour older than the last widget tap (check with `adb shell run-as … ls -l files/backup`) |
| S9 | Export file name | Settings → Your data → Export backup, cancel the share sheet, repeat | Two files `daily-tracker-YYYY-MM-DD-xxxx.json` with different tags in the cache dir; gone after an hour / next start |
| S10 | Heatmap with TalkBack | Habit page, 26-week heatmap | One spoken summary ("… of … days complete, longest run …"); complete days show a dot, not only a colour |

## T — Council round 4 follow-ups (2026-10-26)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| T1 | Lock prompts the moment it is enabled | Settings → Privacy → App lock on | The lock screen appears at once and the fingerprint / PIN prompt opens; unlocking returns to Settings with the switch on |
| T2 | Restored backup that had the lock on | Export from a phone with App lock on; fresh install → welcome → Restore that file | The lock screen appears before any record is shown; after unlocking, Today shows the restored data |
| T3 | Mind timer finishing in the foreground across the day boundary | Day boundary 3 am; start a 13-min meditation at 02:35 and keep the screen on until it ends (02:48); then one at 02:50 (ends 03:03) | The first session is on the previous tracking day, the second on the new one — the day each *ended* on, the same as the end bell logs (R9); the Habit page and Today agree |
| T4 | Two live writes before a render | App open on Today; tap the widget water tile and press Done on a nudge within the same second | Both land exactly once; the widget, the notification and Today agree; nothing is logged twice after reopening |
| T5 | Water goal from the editor | Habits → Water → Edit → set the target to 1,750 with the stepper (100 → 250 → 500 … snaps to the grid) and save | Settings → Water → Daily goal shows 1,750 ml; Today's hydration ring uses it; the editor and Settings both refuse to go below 100 ml or above 20,000 ml |
| T6 | Shield finish, double tap | Open Sugar Shield, let the squats end, tap "Log & set the walk reminder" twice quickly | One squat log, one walk reminder; the buttons grey out after the first tap |
| T7 | Sheets with the keyboard up | Habit page → Log → type an amount → tap Log while the keyboard is still open | Logs on the first tap (the keyboard closing does not eat it) |
| T8 | Reduced motion | Android → Accessibility → Remove animations; open any sheet | The sheet appears without the slide-up |
| T9 | Light theme inks | Settings → Appearance → Light; look at a habit's evidence link, a "done" tick, the active tab | Green and gold text/icons are deep enough to read on the raised cards (no pale lime text) |
| T11 | Deep-linked screen closes properly | Swipe the app away; tap the end bell of a meditation (opens the timer) or the widget name of the Sugar Shield habit, then finish / leave the screen | The screen closes to Today instead of staying put (no history behind it to go back to) |
| T10 | Health Connect with one heart permission | Grant only Heart rate (not Resting heart rate), Sync now, then grant both and sync again | The first sync keeps any resting values already imported; the second fills both; removing a resting record upstream and syncing removes only that value |

## U — Council round 5 follow-ups (2026-10-26)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| U1 | End bell tapped while the timer screen is paused by Android | Start a 5-min meditation, lock the phone, wait for the bell, tap the bell (not the notification body), then unlock and return to the app | Exactly one 5-min session on the Habit page and Today; the timer screen shows Done without adding a second one |
| U2 | End bell with the app swiped away | Start a 5-min breathing session, swipe the app away, wait for the bell, tap it | The app opens on the timer; one session is logged for the day the bell rang (check the Habit page) |
| U3 | Lock switch: no unlocked frame | Settings → Privacy → App lock on, watch closely | The lock screen is the very next frame — no flash of Settings between the switch and the lock |
| U4 | Cadence change mid-month | Habits → a weekly 3×/week habit → Edit → Monthly 20×/month → Save (late in the month) | The card shows "0 of N this month" with N prorated to the days left in the segment (not 20); the streak keeps its earlier weeks; the widget tile's caption shows the same N |
| U5 | Typed stepper value | Habits → Water → Edit → tap the number in the stepper → type 1850 → Done | 1,850 ml is accepted as typed (no snap to the 250 grid); typing 50 gives 100 (the floor), typing 99999 gives 20,000 (the ceiling); the next + press goes to 2,000 |
| U10 | Typed clock time | Settings → Nudges → active hours → tap the start time → type 7:45 → Done; then tap the end time, type 930p | 7:45 AM / 9:30 PM; typing "noon" leaves the old value; the Android keyboard that opens lets you type a colon (it is the default keyboard, not the number pad) |
| U11 | Pending rhythm is visible | Habits → a weekly habit → Edit → Monthly, 20 days → Save | The habit page shows "From <next Monday>: 20 days a month" under the rule; Edit reopens on Monthly/20; Today's card keeps the weekly wording until that day |
| U6 | Breathing guide resume | Mind → Breathing → start, pause mid "Long exhale", resume | The circle continues shrinking (it does not restart from an inhale); the phase label and the circle agree; TalkBack announces each phase change |
| U7 | Period end moved from the calendar | Cycle → tap a day two days after a closed period's end → "Period lasted until here" | The period extends to that day; tapping a day inside the period and choosing "Period ended here instead" shortens it; a future day shows the hint instead of period buttons |
| U8 | Widget tap and app launch together | Swipe the app away; tap a widget tile and immediately open the app from the launcher | The tap lands exactly once (Today shows it after the first reload tick, at the latest after 30 s); no "could not save" banner |
| U9 | Health Connect: foreground and background sync overlapping | Enable background sync; open the app at a moment the 3-hourly task is due (or trigger it with `adb shell cmd jobscheduler run`) and press Sync now at the same time | Body screen shows one consistent result; the "last synced" time never moves backwards; no duplicate step totals |

## V — Council round 6 follow-ups (2026-10-26)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| V1 | Rationale from Android 14's permission manager | Settings → Security & privacy → Privacy → Health Connect → App permissions → Daily Tracker → the privacy / "manage data" link | "Your health data" opens (VIEW_PERMISSION_USAGE alias → `HealthRationaleActivity`); no chooser, no crash |
| V2 | Typed target then Save | Habits → a count habit → Edit → tap the target number → type 12 → tap Save straight away (do not press Done on the keyboard) | The saved target is 12; reopening Edit shows 12 |
| V3 | Water goal typed in ounces | Settings → Units → oz; Settings → Water goal → tap the number → type 64 → Done | 64 oz is accepted as 64 oz (about 1,893 ml), not 64 ml; the stepper shows "64 oz"; the placeholder reads "64 oz" while empty |
| V4 | Snack backfill ceiling | Habits → Squat snack → a past day → Set amount → type 500 | Set is disabled and the hint says "That is more than 100 snacks — check the number"; typing 100 logs 100 snacks in one step (no freeze, no partial save; the day shows 100) |
| V5 | Backup this build cannot read | On a phone with an Auto Backup snapshot from a *newer* app version (or edit `files/backup/snapshot.json` with `run-as` so `"version"` is 99), reinstall this build | Onboarding shows "A backup this version can't open" with Keep it for later / Delete it; after Keep, using the app for an hour moves the file to `snapshot.kept.json` and writes a fresh `snapshot.json`; Settings → Your data shows "Try to restore it" |
| V6 | Erase interrupted | Settings → Your data → Erase everything, and kill the app (`adb shell am force-stop`) within the same second | On the next start `files/backup/` is empty and `backup-cleanup.pending` is gone (`run-as … ls files`); no old snapshot is left for Android to back up |
| V7 | Release APK has no "draw over other apps" | Install the release APK; Settings → Apps → Daily Tracker → Permissions / "Display over other apps" | The app is not listed under "Display over other apps" (the debug build is — by design) |
| V8 | TalkBack on the widget | TalkBack on; focus each widget tile | The ring reads "Log <habit>, <progress>" and the name reads "Open <habit>"; double-tap on the ring logs once |
| V9 | 200 % font size | Settings → Display → Font size largest, and Display size largest | Button labels, chips and captions scale (up to 2×); only ring numerals and the large titles stay capped; nothing overlaps or is cut off on Today, Settings and the habit editor |
| V10 | 1:30 am reminder on the night the clocks go back (1 Nov 2026) | Set a fixed reminder at 01:30 on a habit, mark the habit done at 00:30 | No 01:30 reminder that night (the slot belongs to the tracking day already done); the 9:00 reminder next morning arrives once |
| V11 | Two runtimes at once (residual risk, deferred) | Swipe the app away; tap a widget tile and, within the same second, open the app from the launcher and log something else on Today | Both logs survive a reload. Known residual risk: the headless writer and the app can be two separate JavaScript runtimes with no shared lock; a stale write would show as one of the two logs missing. Report it with `adb logcat` if it happens |

## X — Council round 7 follow-ups (2026-10-26)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| X1 | Exact-alarm status (Android 14+) | Fresh install → allow notifications → Settings → Reminders | A gold line "Android is delivering reminders late…" and an **Allow exact timing** button; tap → the system "Alarms & reminders" page for this app (not the list of every app); allow; back in the app the line and the button are gone without restarting |
| X2 | Exact grant repairs pending alarms | With exact timing still off, set a fixed reminder 10 minutes ahead; then allow exact timing and return to the app | `adb shell dumpsys alarm \| grep -A3 dailytracker` shows the alarm re-registered as exact (type RTC_WAKEUP with no window); it rings at the minute |
| X3 | Exact revoke | Allow exact timing, schedule a reminder, revoke it in system settings, reopen the app | The reminder is re-submitted inexact and still arrives (late is acceptable); nothing is silently lost |
| X4 | Offline for a day and a half | Airplane mode on; leave the app closed for > 36 h (or set the device clock forward in steps of a few hours and wait for the 3-hourly task) | Reminders keep coming after the 36-hour horizon: the background task runs without a network (patched `expo-background-task`); `adb shell dumpsys jobscheduler \| grep -B2 -A8 dailytracker` shows no `Requires: net` constraint |
| X5 | Bell after returning from settings | Start a 5-minute meditation, go to the Alarms & reminders page, allow, come back | One bell at the end (the bell is re-submitted on return, same id, no duplicate) |
| X6 | Sheets in a short window | Split-screen the app with another app (or a tablet / foldable in landscape); open the habit editor and a cycle day sheet | The sheet's header and close button stay inside the window; the body scrolls |
| X7 | Today without the trio | Onboarding with only "Steps" and "Journal" selected (deselect water, movement, meditate) | Today shows the rings card, no Water / Movement / Mind cards, one line saying they appear once added; adding Water from the Library brings its card back |
| X8 | Cycle off → link | Cycle tracking off; open `adb shell am start -a android.intent.action.VIEW -d daily-tracker://cycle` | A "Cycle tracking is off" card with Turn on / Back to Today, no blank or broken page |
| X9 | Cycle hidden from Today | Cycle on; Settings → Day & cycle → Show on Today off | The Cycle card leaves Today; the Cycle tab stays |
| X10 | Long habit name in a notification | Name a habit 70 characters, give it a fixed time | The notification title is cut with "…" at about 40 characters; the body is intact |
| X11 | Quick Log ceiling | Today → + → water → type 50000 | The field refuses it (hint shows the 20,000 ml / 676 oz ceiling); 20000 is accepted |

## Recording results

Add a dated line under the milestone in `docs/IMPLEMENTATION_PLAN.md` ("Device run YYYY-MM-DD, Pixel 7 / Android 15: N1–N17, X1–X11 pass except …") and open follow-ups for anything that failed.
