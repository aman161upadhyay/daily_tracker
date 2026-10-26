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

## Y — Council round 8 follow-ups (2026-10-26)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| Y1 | Snapshot write interrupted | With habits logged, `adb shell run-as com.amanupadhyay.dailytracker ls -la files/backup` while the app is in use; then force-stop the app the moment it goes to the background (the snapshot is written on leaving) | Only `snapshot.json` remains after the next start; if a `snapshot.next.json` was left behind it is adopted (same bytes become `snapshot.json`), never a half file as the only copy |
| Y2 | Two unreadable snapshots | Repeat V5 twice (two different `"version": 99` files, an hour apart) | Two `snapshot.kept.<number>.json` files sit next to a fresh `snapshot.json`; Settings → Your data lists "Try to restore it" and "Forget it" for each; forgetting one leaves the other |
| Y3 | "Delete it" interrupted | V5 → tap **Delete it** and force-stop within the same second | After the next start the unreadable file is gone and onboarding no longer offers it (`backup-cleanup.pending` is cleared); a failed delete (make the file read-only with `run-as … chmod 444`) keeps the card and shows the failure |
| Y4 | Period-day reminder before the period is logged | Cycle on; add a reminder "Period · day 3"; look at Reminders on the Cycle tab after the last logged period's third day has passed | The reminder shows its next day with "once the period is logged" and no notification is scheduled for it (`adb shell dumpsys notification --noredact | grep cycle:r` shows none); logging the period start schedules it for start + 2 |
| Y5 | Birth control pauses ovulation rules | Settings → Day & cycle → Hormonal birth control on | Fertile / luteal reminders disappear from the upcoming list with a footnote; the reminder sheet offers only Period phase; the ovulation marker is gone from the calendar |
| Y6 | Estimated wording | Open any day between two logged periods in the cycle calendar | The sheet says the phase "(estimated)"; a day inside a logged period does not; TalkBack reads the same |
| Y7 | Smallest widget | Add the widget and resize it to the smallest size the launcher allows | It is at least 72 dp tall; one tile's ring is at least 48 dp; a size with no room for tiles shows a one-line notice instead of clipped rings |
| Y8 | Widget at 200 % font | Settings → Display → Font size largest; look at the widget | The ring numerals stay the same size (dp), the names and captions grow until the ring would shrink under 72 dp, then the day line goes first; nothing clips |
| Y9 | Widget day line | Default widget size at normal font | A "Today · <date>" line under the tiles; at the smallest size it is gone |
| Y10 | Widget storage failure | `adb shell run-as … chmod 000 files/SQLite` (or fill the storage), then tap a widget tile | The widget shows "Couldn't log — open the app" on the last good tiles, not the "choose habits" screen; restoring permissions and tapping again logs |
| Y11 | Drink in two apps | Log 250 ml in Samsung Health at 10:00; let Daily Tracker sync; then tap +250 ml in Daily Tracker at 10:02; sync again (Body → Sync now) | Today shows 250 ml, not 500; the water log keeps the manual entry; a 500 ml tap or one 10 minutes later stays a second drink |
| Y12 | One night, two sources | A night recorded by the phone and by a watch app (both write to Health Connect) | Body → Sleep shows one night (the copy with stages if either has them), not the sum; Workouts: a session recorded by the watch and by Strava shows as one row; hiding it reveals the other copy |
| Y13 | Late workout and a later grant | Sync; then add a workout dated two days ago in another app; sync again. Then allow Weight in Health Connect permissions (previously off) and sync | The workout appears for its own day; the weight history for the last 30 days appears, not only since the last sync |
| Y14 | A permission left off | Connect with Sleep denied | The connection card says "Reading …" and "Not allowed: sleep …" with a Permissions button; the Body tab names Sleep as kept empty by the permission, not "Nothing in Health Connect yet" |

## Z — Council round 9 follow-ups (2026-10-26)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| Z1 | Delivered while closed, then a re-plan | Reminders on, cap set to 2 (Settings → Reminders); force-stop the app; let two movement nudges ring; open the app | The cap shows 2 of 2 used for the day and no third automatic nudge is scheduled (`adb shell dumpsys notification --noredact` lists none for today); the two rings appear in the ledger once each |
| Z2 | Merged notification, one action | Two reminders set within five minutes of each other (a fixed time at 10:00 and one at 10:02) | One notification arrives naming both; Snooze on it brings back one notification 15 minutes later, never one of the two alone two minutes after; the daily cap counts one |
| Z3 | Snooze late in the evening | Active hours end at 21:00; snooze an automatic movement nudge at 20:50 | No movement nudge rings at 21:05; the series resumes the next morning; a fixed clock time snoozed at the same moment still rings at 21:05 |
| Z4 | After midnight, before the boundary | Tracking day starts at 3 am; at 00:30 look at Today and the Reminders card | Today still shows the evening's day; a 1:00 am fixed reminder is skipped when that habit was done in the evening; the cap is not reset until 3 am |
| Z5 | Weekly quota met on Monday | A 2×/week habit with a fixed daily time; log it twice on Monday | No reminder for it Tuesday–Sunday; Monday of the next week rings again |
| Z6 | Live nudge after everything is done | Log every movement habit (or let their quotas fill); look at the Today movement card | No "next nudge" countdown is shown; it returns the next day |
| Z7 | Two drinks in the other app | In Samsung Health log 250 ml at 10:00 and 250 ml at 10:08; tap +250 ml here at 10:04; sync | Today shows 500 ml, not 250: only the nearer import is treated as the copy of the tap |
| Z8 | A weight permission revoked and re-granted | Allow Weight, sync, revoke Weight in Health Connect, sync, allow it again, sync | The weight history for the last 30 days comes back, not only days since the last sync |
| Z9 | "When the period begins" | A period reminder "Period · day 0 (when it begins)"; log a period start today | The reminder fires today at its time (not in four weeks) |
| Z10 | Smallest widget, long value | Water goal in ounces with a four-digit total (or 20,000 ml) at the smallest widget size | The ring shows "1.9k" / "20k" rather than "1,8…"; TalkBack still reads the full amount |
| Z11 | Stepper hints | TalkBack on; focus the water goal stepper in Settings and onboarding, then an active-hours stepper | "Tap to type an amount" with ml or oz bounds for the water goal; "Tap to type a time" for the hours; the onboarding bounds read in the unit shown |
| Z12 | Row actions | TalkBack on the Habits list on Today: a count habit, an amount habit, a plain timer habit, a meditation habit | Labels read "Add one to …", "Log an amount for …", "Log time for …", "Start … timer" and the tap does what the label says |
| Z13 | Water button follows "One tap adds" | Settings → Water → One tap adds 350 ml | Today's water button reads +350 ml and logs 350 ml (330 is not a preset; type it) |

## AA — Council round 10 follow-ups (2026-10-26)

| # | Check | Steps | Expected |
|---|---|---|---|
| AA1 | A snoozed nudge rings once more and is counted once more | Cap 3; let a movement nudge ring; tap Snooze; let it ring again; open the app | Only one more automatic nudge is scheduled for the day (`adb shell dumpsys notification --noredact` lists one); the snoozed slot is not offered a third time |
| AA2 | Lost save does not lose a delivery | Let a nudge ring while the app is closed; force-stop the app the moment it is opened (before the sync finishes); open again | The ring is counted exactly once (not zero, not twice) |
| AA3 | Clock set back | Let a nudge ring; set the phone's clock back two hours (automatic time off); open the app | The delivered nudge is not rescheduled; it stays counted |
| AA4 | Yesterday's notification tapped today | Cap 2; leave an evening nudge in the shade past 3 am; tap its body in the morning | Two automatic nudges are still scheduled for today (the tap counted on yesterday) |
| AA5 | Weekly summary and cycle prompt are outside the cap | Cap 2; let the weekly summary and a cycle prompt ring in one day | Two movement/habit nudges are still scheduled for the day |
| AA6 | Interval habit with missed morning | A custom habit "Every so often, 60 min, at most 2 a day"; phone off from 9 to 13; open the app at 14:00 | Two reminders are still scheduled for the afternoon (missed slots did not spend the allowance) |
| AA7 | Night-owl active hours | Active hours 00:00–08:00; every movement habit done for the day | Reminders are scheduled from 3 am on (tomorrow's tracking day), none before |
| AA8 | Background import re-plans | Water reminders on; drink to the goal in another app while Daily Tracker is closed; wait for the background import (or trigger it with `adb shell cmd jobscheduler run`) | The pending water reminders are cancelled without opening the app |
| AA9 | Rest of today | Pause "Rest of today" at 21:30 (after active hours) | Reminders stay paused until 3 am, including a 23:00 set time |
| AA10 | Reminder editor | A custom habit → Reminders → Set up → Set times 08:00 and 19:00, only when behind, at most 2 → Save | The card reads "At 8:00 AM and 7:00 PM when behind"; both ring on a day the habit is not done (the 19:00 one is skipped once the day is 60% done) |
| AA11 | Preset reminder changed | Meditate → Reminders → Change → move 07:30 to 06:45 | The 06:45 reminder rings the next morning; the old 07:30 does not |
| AA12 | Movement habit editor | Squat snack → Reminders → Change | The modes are Rotation / Set times / Off; Rotation describes the shared interval |
| AA13 | Water in ounces everywhere | Units oz; log 250 ml via the quick action | Today's card, the habit row, the detail header, the chart's goal line and the backfill strip all read 8.5 oz; Edit shows the target in oz and saving an untouched 67.6 oz leaves 2,000 ml |
| AA14 | Body extrema over long ranges | A high value months ago; open Steps → 6M and Y | Best / Lowest reflect the whole range, not the last 30 days |
| AA15 | Freezes follow the cadence | Create a weekly custom habit | The editor's freezes default to 1 (0 for monthly, 2 for daily) |
| AA16 | Destructive taps confirm | Delete a cycle reminder; trash a drink | Each asks first |

### AB — round 11 (deliveries per occurrence, bookkeeping intents, the editor's edges, weekdays)

| # | Check | Steps | Expected |
|---|---|---|---|
| AB1 | A re-ring spends again | Cap 3; a custom habit with Set times 07:30, at most 2; let it ring, tap Snooze, let it ring again | No further set-time reminder for that habit today; the habit's two were spent by the two rings (`adb shell dumpsys notification --noredact`) |
| AB2 | Erase and restore forget the old alarms | Let a nudge ring and leave it in the shade; Settings → Erase everything → "Explore with sample data" | The old ring is not counted against the sample state; no alarm from the old state fires later (dumpsys lists only the new plan) |
| AB3 | Killed between the OS change and the record | Change a reminder time and kill the app at once (`adb shell am kill <package>` within a second); reopen | The old time never rings; the new one rings once; nothing rings twice |
| AB4 | A paused schedule edited | Habit → Remind me switch off → Change → add a time → Save | The card reads "Paused · At …"; the switch stays off; turning it on schedules both times |
| AB5 | The next-reminder line | Set times 16:00 on a habit not yet done | The card reads "Next: today at 4:00 PM" and it rings then; once the habit is done for the day it reads "Done for today: nothing more rings." |
| AB6 | Weekdays | Strength session → Reminders → Change → On: M, W, F → Save (on a Tuesday) | The card reads "At 6:00 PM on Mon, Wed and Fri", the line "Next: Wed …"; nothing rings on Tuesday; Wednesday's rings |
| AB7 | The last weekday stays | In the editor, tap the only selected day | It stays selected (Off is a mode, not an empty week) |
| AB8 | Tap-and-Done keeps a formatted value | Units oz; Edit habit on Water; tap the target value; press Done without typing | The target is still 2,000 ml (67.6 oz) |
| AB9 | Freezes you set survive a cadence change | New custom habit; set freezes to 2 while Daily; switch to Weekly | Freezes stay 2 (an untouched value follows the cadence: 1) |
| AB10 | The Water summary opens the Library on Water | Archive Water; log a drink from the widget; tap the Water summary on Today | The Library sheet opens on Water with "Add to my habits" |
| AB11 | Widget tap when the save fails | (If storage can be filled) fill the phone's storage; tap a widget tile | The widget shows the pre-tap numbers with "That tap could not be saved. Open Daily Tracker and log it there."; the app shows its storage error |

### AC — round 12 (records beside the state, the press inbox, sync health, wording)

| # | Check | Steps | Expected |
|---|---|---|---|
| AC1 | A replace under a sync in flight | Let a nudge ring and leave it in the shade; Settings → Erase everything → sample data, then at once change a reminder time | The old ring is not counted against the new state; `dumpsys notification --noredact` lists only the new plan; no "Could not save" banner |
| AC2 | A press under a kill | With the app closed, press Done on a nudge and kill the process within a second (`adb shell am kill <package>`); open the app | The entry is logged (at the press's time) — on opening at the latest; it is logged once |
| AC3 | A replayed press is one press | Repeat AC2 with Snooze; open the app | One SNOOZED event for the slot; the snooze ends 15 minutes after the press, not after the reopening |
| AC4 | A failed sync shows and retries | Revoke notification permission while the app is open, change a reminder, re-grant | Settings → Reminders shows "The last reminder update failed (…)" while it fails; the line clears within a minute of the retry succeeding |
| AC5 | A reboot with an expired alarm (PLAT12-03, measures the phantom) | Set a reminder two minutes ahead; power off before it rings; power on five minutes later; open the app | Expected today: the reminder does not ring (Android dropped it) and the habit's limit shows it spent (a phantom). Record whether this happens — it decides whether the Kotlin boot receiver is built |
| AC6 | Set times across the boundary | Two habits with set times 02:59 and 03:00; wait | Two notifications, a minute apart, never merged; the 02:59 one counts for the day before |
| AC7 | Next-ring wording at night | A set time 01:00; look at the card at 23:00 | "Next: tomorrow at 1:00 AM" (not "today"); the Settings preview says "Tomorrow 1:00 AM" |
| AC8 | Water copy in ounces | Units oz; fall behind pace; wait for a water check | The notification says "About 8.5 oz behind pace", not ml |

### AD — round 13 (refused OS calls, replace fences, the launch press, the lock, the Logged list)

| # | Check | Steps | Expected |
|---|---|---|---|
| AD1 | A refused schedule shows and retries | Deny "Alarms & reminders" (exact alarms) if the phone offers it, or revoke notification permission mid-sync; change a reminder | Settings → Reminders shows "… could not be scheduled. Will try again."; within a minute of re-granting the line clears and `dumpsys notification --noredact` lists the plan |
| AD2 | A restore whose save fails keeps the old rings out | Let a nudge ring and leave it; fill the storage (or use a backup file large enough to make the write slow) and Restore | The restored state's habit limits show no spent slot from the old ring; after the save succeeds the schedule is the restored state's only |
| AD3 | The launch press under a kill | With the app closed, tap the body of a nudge (not a button) so the app launches; kill it within a second of the first frame; open it again | The tap's navigation is not required, but the press is handled once: no duplicate FIRED / TAP rows (Settings → Export, inspect `nudgeEvents`) |
| AD4 | The Logged list and an exact Remove | From the widget tap water twice by mistake; open the habit page | "Logged" lists both drinks with "· widget" and the times; Remove on one takes off exactly 250 ml; the other stays with its time |
| AD5 | A deep link under the lock | App lock "Right away"; leave and reopen, cancel the prompt; from a terminal `adb shell am start -a android.intent.action.VIEW -d "daily-tracker://habits?preset=meditate&t=1"` | Nothing appears above the lock screen; after unlocking, the Meditate sheet is showing |
| AD6 | A hostile preset id | `adb shell am start -a android.intent.action.VIEW -d "daily-tracker://habits?preset=__proto__"` (and `constructor`) | The Habits tab shows, no sheet, no error screen |
| AD7 | Fix an older day | On a habit older than a week tap "Fix an older day" under the 26-week heatmap; pick a day two weeks back; set an amount | The day's cell in the heatmap and the 2W chart update; "Logged → Show the last 7 days" is unaffected (the day is older); for a yes/no habit the picker's day flips in place |

### AE — round 14 (a retired provider, a failed start, honest follow-ups, the card picker)

| # | Check | Steps | Expected |
|---|---|---|---|
| AE1 | A crash during a failing save, then an erase | Fill the storage until saves fail (the red banner shows); force a render crash (dev: throw from a screen; release: not reproducible by hand — note it) and tap "Try again" on the error screen; Settings → Erase everything | After the erase nothing comes back: no drink or habit from before the crash reappears after a minute (the retired provider's retry must not write) |
| AE2 | A notification press under a failed save | Storage full as in AE1; press "Done" on a movement nudge from the shade | The banner shows the failed save; the widget keeps the state on disk (no new snack); Settings → Backup shows no new snapshot time; once storage is freed and the app reopened, the press is applied once |
| AE3 | The database cannot open at start | Corrupt or lock the database file (dev: rename `files/SQLite/tracker.db` to a directory, or `chmod 000` on a rooted device); open the app | "Your data could not be opened" with "Try again" — no onboarding, no empty Today; `dumpsys notification` still lists the planned reminders (none were cancelled); restore the file, tap "Try again", the data is back |
| AE4 | Cards on Today | Today → "Choose cards": switch Steps and Sleep on, move Water below Mind; Settings → Today shows the same; turn cycle tracking off and on | The cards reorder at once; Steps / Sleep show a "Nothing from Health Connect yet" door until data arrives; the cycle row disappears from the picker while tracking is off and its card returns where it was switched on |
| AE5 | Fix a day months back | On the Water habit, after at least seven months of data (sample data or a restored backup): "Fix an older day", go back seven or more months | Days with drinks show a ring or a full disc (not blank); a full day's number reads clearly on the disc in both themes; the grid's cells are at least 48 dp wide on a 360 dp screen |
| AE6 | Clear day and the readers | On an older day with several drinks tap "Clear day"; with TalkBack on, swipe through the picker's month title and a day of last year | "Clear …?" names the day and the amount before anything happens; the title announces the month when it changes and says "Jumps to this month" only away from it; days of another year are read with their year |

### AF — round 15 (the permission on Android 13, the snapshot's veto, Undo, the Steps fallback, memo boundaries)

| # | Check | Steps | Expected |
|---|---|---|---|
| AF1 | A fresh install on Android 13+ | Install, finish onboarding to the Reminders step; deny the system dialog once, then again; in another run allow it and switch notifications off in Android's app settings | The step shows "Allow notifications" (not "Notifications are off"); after the first deny the button stays and asks again; after the second it reads "Notifications are off … Settings → Reminders" and the Reminders card says "Blocked in system settings" with "Open settings"; the switched-off case also reads blocked |
| AF2 | Backup off under a failed save | Settings → Backup on, wait for a snapshot (the time shows); fill the storage until saves fail (red banner); turn the backup off; background and foreground the app a few times over an hour | Settings → Backup shows no snapshot time coming back and `files/backup/` stays empty (a device file browser or `run-as` on a debug build) |
| AF3 | Undo | Water habit → Logged list → trash icon on a 9 am drink → Remove; tap Undo. Then "Set" today → "Clear day" → confirm → Undo. Then remove a drink and Erase everything from Settings before the toast goes | "Removed 250 ml at 9:00 AM · Undo" at the bottom above the tab bar; after Undo the row is back at 9:00 AM (not now); "Cleared 500 ml today · Undo" brings both drinks back with their times; the toast disappears with the erase and nothing comes back; with TalkBack the toast is announced with "Undo available" and stays 12 s |
| AF4 | The Steps card from the habit | Add the Steps habit, log 4,000 steps by hand, pin Steps (Today → Choose cards); later connect Health Connect with a steps source | The card shows 4,000 of the goal with a 7-day chart at once; after Health Connect delivers, its figure takes over (calendar day) |
| AF5 | Render-thread costs | With a year or more of data: change one habit's reminder; let Health Connect sync in the foreground; open and close a sheet on Today with hidden cards | No visible stall on Today after the reminder edit; no stall when the Body figures update; the sheet opens and closes without a hitch (nothing above ~16 ms in the JS profiler for these three, if measured) |

## Recording results

Add a dated line under the milestone in `docs/IMPLEMENTATION_PLAN.md` ("Device run YYYY-MM-DD, Pixel 7 / Android 15: N1–N17, Y1–Y14, Z1–Z13, AA1–AA16, AB1–AB11, AC1–AC8, AD1–AD7, AE1–AE6, AF1–AF5 pass except …") and open follow-ups for anything that failed.
