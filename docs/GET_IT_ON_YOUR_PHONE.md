# Getting Daily Tracker onto your Android phone — step by step

This is written for someone who has never built an Android app. Every step says what to type and
what you should see. The technical version of the same recipe lives in `docs/BUILD_ANDROID.md`;
you do not need it.

**What you will end up with:** the real app installed on your phone — widget, reminders with
buttons, Health Connect import, app lock, backups — working without the laptop, and a single
`.apk` file you can send to friends.

**How long:** about an hour for the one-time setup (mostly downloads), 10–20 minutes for the first
build, 3–5 minutes for every build after that.

---

## Part 0 — The 2-minute preview (optional, limited)

If you just want to *see* the app before setting anything up:

1. Install **Expo Go** from the Play Store on your phone.
2. Open the Replit project, run it, and scan the QR code shown for the `expo` app with Expo Go.

This shows the whole interface and lets you log things, but the widget, Health Connect, and
reminder buttons with the app closed do **not** work in Expo Go. Those need the real build below.

---

## Part 1 — One-time setup on your computer

You need four things: **Android Studio** (makes Android apps), **Node** (runs the build tools),
**pnpm** (installs the project's parts), and **Git** (downloads the project). Pick your computer.

### On a Mac

1. **Android Studio.** Download from https://developer.android.com/studio and drag it to
   Applications. Open it once, choose *Standard* setup, accept the licences, and let it download
   the Android SDK. Close it when the welcome window appears.
2. **Node.** Download the **LTS** installer from https://nodejs.org and run it.
3. **Git.** Open *Terminal* (Applications → Utilities → Terminal, or press ⌘-Space and type
   `Terminal`). Type `git --version` and press Enter. If a window offers to install *command line
   developer tools*, click Install and wait.
4. **pnpm.** In Terminal:
   ```bash
   npm install -g pnpm@10
   ```
   If that stops with `EACCES` or `permission denied` (common with the Node installer, which puts
   its folder under the Mac's protection), run it once with `sudo` in front — it asks for your Mac
   login password, and nothing shows while you type it:
   ```bash
   sudo npm install -g pnpm@10
   ```
5. **Tell the terminal where Android Studio put things.** Still in Terminal, paste these four
   lines one at a time (each adds a line to a settings file called `.zshrc`):
   ```bash
   echo 'export ANDROID_HOME="$HOME/Library/Android/sdk"' >> ~/.zshrc
   echo 'export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"' >> ~/.zshrc
   echo 'export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```
6. **Check.** Type each of these; each should print a version number, not "command not found":
   ```bash
   node -v        # v22 or v24
   pnpm -v        # 10.x
   git --version
   java -version  # 17 or 21
   adb version
   ```

### On Windows

1. **Android Studio.** Download from https://developer.android.com/studio and run the installer
   with the defaults. Open it once, choose *Standard* setup, accept the licences, and let it
   download the Android SDK. Close it when the welcome window appears.
2. **Node.** Download the **LTS** installer from https://nodejs.org and run it (defaults are fine).
3. **Git.** Download from https://git-scm.com/download/win and install with the defaults.
4. **pnpm.** Open *PowerShell* (press the Windows key, type `PowerShell`, Enter) and type:
   ```powershell
   npm install -g pnpm@10
   ```
   If PowerShell complains that running scripts is disabled, type
   `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, answer `Y`, and try again.
5. **Tell Windows where Android Studio put things.** In PowerShell, paste these lines one at a time:
   ```powershell
   [Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
   [Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
   [Environment]::SetEnvironmentVariable("Path", "$env:LOCALAPPDATA\Android\Sdk\platform-tools;C:\Program Files\Android\Android Studio\jbr\bin;" + [Environment]::GetEnvironmentVariable("Path", "User"), "User")
   ```
   Then **close PowerShell and open it again** (the new settings only apply to new windows).
6. **Check.** Type each of these; each should print a version number:
   ```powershell
   node -v        # v22 or v24
   pnpm -v        # 10.x
   git --version
   java -version  # 17 or 21
   adb version
   ```
7. **Two Windows-only rules:** keep the project in a short folder path such as `C:\dev`
   (long paths break Android builds; create it with `mkdir C:\dev` if it does not exist), and
   run every command in this guide from *PowerShell*, not from Git Bash or the old Command Prompt
   (`pnpm` needs the Part 1 settings, which only PowerShell picks up).

### Your phone

1. Settings → *About phone* → tap **Build number** seven times (you will see "You are now a
   developer"). On Samsung phones it is under About phone → Software information.
2. Settings → *System* → **Developer options** → turn on **USB debugging**.
3. Plug the phone into the computer with a cable that carries data (the charger cable usually
   does). On the phone, choose *File transfer* if asked, and tap **Allow** on the
   "Allow USB debugging?" box (tick *Always allow from this computer*).
4. On the computer type `adb devices`. You should see one line with a long code followed by
   `device`. If it says `unauthorized`, look at the phone for the Allow box. If nothing is
   listed, try another cable or USB port.

The phone needs Android 8 or newer. Health Connect is built into Android 14+; on Android 9–13
install the free **Health Connect** app from the Play Store first.

---

## Part 2 — Get the project and build the app

Open Terminal (Mac) or PowerShell (Windows). The commands are the same on both unless noted.

1. **Download the project** (only the first time):
   ```bash
   cd ~            # Windows: cd C:\dev
   git clone https://github.com/aman161upadhyay/daily_tracker.git
   cd daily_tracker
   ```
2. **Install the project's parts** (run from the `daily_tracker` folder; 2–5 minutes the first time):
   ```bash
   pnpm install
   ```
   You should see it finish without red `ERR` lines. Warnings in yellow are fine.
3. **Go into the app folder:**
   ```bash
   cd artifacts/daily-tracker
   ```
4. **Generate the Android project** (turns `app.json` + the plugins into a real Android project
   in a folder called `android/`; 30–60 seconds):
   ```bash
   pnpm exec expo prebuild --platform android --clean
   ```
   If it asks "Continue?" or about overwriting, answer `y`. The `android/` folder it creates is
   disposable — never edit it; this command rebuilds it every time.
5. **Build and install the app on your phone** (10–20 minutes the first time — it downloads about
   1 GB of build tools, including the Android NDK and CMake, by itself; you never install those by
   hand. Later builds take a few minutes):
   ```bash
   pnpm exec expo run:android --variant release
   ```
   You will see hundreds of lines ending with `BUILD SUCCESSFUL`, then the app opens on your
   phone. If the terminal keeps running afterwards, press **Ctrl-C** — the installed app does not
   need the computer any more.

   The file you just installed is also saved at
   `artifacts/daily-tracker/android/app/build/outputs/apk/release/app-release.apk`. That is the
   file to send to friends (Part 4) — but read Part 6 first: until you create your own signing
   key, the build prints a `WARNING: DT_RELEASE_STORE_FILE is not set` line and signs the app with
   a public test key. Fine for your own phone, not for an APK you hand out.

> **Why `--variant release`?** Without it you get a *debug* build that only runs while the
> computer feeds it code over the cable. The release build has everything inside it.

---

## Part 3 — Set up the phone so everything works

Do these once, in the app and in the phone's Settings:

1. **Onboarding.** Open the app, enter your name, pick your habits, choose whether to track your
   cycle. Nothing leaves the phone unless you keep **Include in Android phone backup** on (it is on
   by default): then Android keeps an encrypted copy with your Google account for a new phone, the
   same way it backs up other apps. There is no server of ours either way.
2. **Notifications.** In the app: Settings (the letter in the top-right of Today) → *Reminders* →
   **Allow notifications** → Allow on the system box. If the card then shows **Allow exact
   timing** (Android 14 and newer start with it off), tap it and allow *Alarms & reminders* on the
   Android screen that opens; the button disappears once it is on. Without it, reminders arrive
   minutes late — longer while the phone sleeps — and the meditation bell can be late too.
3. **Battery.** Phone Settings → Apps → Daily Tracker → *Battery* → **Unrestricted** (Samsung:
   also Settings → Battery → Background usage limits → make sure Daily Tracker is not in
   "Sleeping apps"). Otherwise the phone may silence reminders after a few days.
4. **Widget.** Long-press an empty part of your home screen → *Widgets* → find *Daily Tracker* →
   drag it onto the screen. Resize it by long-pressing it (it needs about two rows of height; at
   its smallest it shows one line of text instead of rings). Choose which habits it shows in the
   app: Settings → *Widget*. Tapping a ring logs that habit; tapping a name opens it. Under the
   tiles it shows the day it is counting for, which matters after midnight: a drink at 1 am still
   belongs to "yesterday" until 3 am. If it ever says "Couldn't log — open the app", open the app
   once; the next tap works again.
5. **Health Connect** (steps, sleep, workouts, heart rate, weight, drinks from Samsung Health,
   Google Fit, Garmin, Fitbit, etc.):
   - Make sure your fitness app writes to Health Connect: Samsung Health → Settings → *Health
     Connect* → turn on the data types; Google Fit → Profile → Settings → *Sync Fit with Health
     Connect*.
   - In Daily Tracker: *Body* tab → **Connect** → tick the data types → Allow. You can also allow
     *background access* so it imports while the app is closed.
6. **App lock** (optional): Settings → *Privacy* → App lock. It uses your phone's fingerprint/PIN,
   so the phone must have a screen lock set. Widgets and reminder buttons keep working while locked.
7. **Backups.** Settings → *Your data* → **Export backup** creates a file you can save to Drive or
   send to yourself. Type a password there if you want the file encrypted (there is no recovery if
   you forget it). **Import backup** restores it. Android's own backup also keeps a copy and offers
   "Welcome back → Restore it" when you set up a new phone.

Then try the list in `docs/DEVICE_CHECKLIST.md` if you want to check every feature carefully.

---

## Part 4 — Sharing the app with friends

1. Find the file on your computer. The full path is
   `~/daily_tracker/artifacts/daily-tracker/android/app/build/outputs/apk/release/app-release.apk`
   on a Mac (Finder → Go → Go to Folder…, paste exactly that, including the `~`) and
   `C:\dev\daily_tracker\artifacts\daily-tracker\android\app\build\outputs\apk\release\app-release.apk`
   on Windows (paste it into the File Explorer address bar).
   Rename a copy to something like `DailyTracker-0.19.apk` (the `version` from `app.json`) if you like.
2. Send it any way you want: Google Drive link, WhatsApp, email, AirDrop-style apps.
3. On their phone they tap the file. Android asks to allow installing from that app (Files,
   Chrome, WhatsApp…) → **Allow** → **Install**. Two different prompts can appear, and they mean
   different things:
   - *"For your security, your phone is not allowed to install unknown apps from this source"* is
     the ordinary unknown-source check: **Settings** → allow for that app → back → **Install**.
   - A **Play Protect** sheet ("Unsafe app blocked" / "App scan recommended") is Google's scanner
     reacting to an app it has never seen. *Scan app* is fine to accept (it uploads the APK to
     Google for a check); if it then still says *blocked*, tap *More details* → *Install anyway*.
     The verdict means "unknown to Google", not "harmful" — this app has no network code and the
     source is on GitHub — but a friend should hear that from you before they tap.
4. They then do Part 3 on their own phone.

Later versions install over the old one as long as they are signed with the same key (Part 6).
Friends never need to uninstall. Hand out APKs only after Part 6 is done: an APK signed with the
public test key could be "updated" by anyone who builds this project.

---

## Part 5 — Updating the app later

Whenever the code on GitHub changes:

```bash
cd ~/daily_tracker                  # Windows: cd C:\dev\daily_tracker
git pull
pnpm install
cd artifacts/daily-tracker
pnpm exec expo prebuild --platform android --clean
pnpm exec expo run:android --variant release
```

Your data stays on the phone; an update never erases it. (Each release raises the app's
`versionCode` in `app.json`. Android installs a build whose number is the same or higher over the
old one — so a rebuild of the same version still installs — and refuses only a *lower* number;
raising it on every release keeps everyone's phones moving forward.)

---

## Part 6 — Your own signing key (recommended once friends use the app)

Android ties an app to the key it was signed with. Until you do this part, release builds are
signed with the *debug key* that ships inside every Expo project — the same public key on
everyone's computer, which is why the build prints a warning about it. On your own phone that is
harmless. For friends it is not: anyone who builds this project could install an "update" over
your app on their phones. A key of your own, backed up, fixes that and also survives a lost or
replaced computer. Do this once, before the first APK you hand out.

1. Create the key (answer the questions; the passwords are yours to choose and remember):
   ```bash
   mkdir -p ~/keystores          # Windows: mkdir $HOME\keystores
   keytool -genkeypair -v -storetype PKCS12 -keystore ~/keystores/daily-tracker-release.jks -alias daily-tracker -keyalg RSA -keysize 2048 -validity 10000
   ```
   (On Windows write the path as `$HOME\keystores\daily-tracker-release.jks`.)
2. **Back the file up in two places** (a USB stick and a cloud drive). Losing it means a new app
   name for everyone.
3. Tell the build about it by creating a text file called `gradle.properties` inside a folder
   `.gradle` in your home folder (Mac: `~/.gradle/gradle.properties`; Windows:
   `C:\Users\<you>\.gradle\gradle.properties`) with four lines:
   ```
   DT_RELEASE_STORE_FILE=/Users/<you>/keystores/daily-tracker-release.jks
   DT_RELEASE_STORE_PASSWORD=the password you chose
   DT_RELEASE_KEY_ALIAS=daily-tracker
   DT_RELEASE_KEY_PASSWORD=the same password again
   ```
   (This kind of key file keeps one password for the file and the key inside it — if `keytool`
   asked for a second one, press Enter to reuse the first. Write the same password on both lines.)
   On Windows write the path with forward slashes: `C:/Users/<you>/keystores/daily-tracker-release.jks`.
   Pick a password **without a backslash (`\`) and not starting with a space, `#` or `!`** — in this
   kind of file those characters are read specially, and a build would then fail with "keystore
   password was incorrect" even though the password is right. This file is outside the project, so
   it is never uploaded to GitHub.
4. Build again (Part 5). The app on **your** phone must be uninstalled once before the newly signed
   build installs (Android refuses a different key): in the app, Settings → Your data → Export
   backup first, uninstall, build/install, then Import backup. Friends who got an APK *before* this
   step have to do the same once; everyone who gets an APK *after* it never will.

---

## Part 7 — When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `command not found` / `not recognized` (pnpm, adb, java) | The terminal does not know the new settings yet | Close the terminal, open a new one, try again. On Mac also run `source ~/.zshrc`. |
| `EACCES` / `permission denied` while installing pnpm (Mac) | npm's folder belongs to the system | `sudo npm install -g pnpm@10` (Part 1, Mac step 4). |
| `SDK location not found` | The build cannot find Android Studio's SDK | Check Part 1 step 5 (`ANDROID_HOME`). Mac path `~/Library/Android/sdk`, Windows `%LOCALAPPDATA%\Android\Sdk`. |
| `JAVA_HOME is not set` or `Unsupported class file major version` | Wrong or missing Java | Set `JAVA_HOME` to Android Studio's `jbr` folder as in Part 1 step 5. |
| `adb devices` shows nothing | Phone not visible | Different cable/port, USB debugging on, choose *File transfer* on the phone, tap Allow. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | The app on the phone was signed with a different key | Export a backup in the app, uninstall it, install again, import. |
| `INSTALL_FAILED_VERSION_DOWNGRADE` | The phone has a newer version number | `git pull` to get the latest code. If you really want the older build: in the app, Settings → Your data → Export backup, then uninstall, install, import. An older build reads a newer backup but may not keep everything the newer one recorded (for example v0.12 drops the link between the parts of a merged reminder) — logs, habits and settings are kept. |
| `Could not resolve …` / `Connection timed out` during the build | A download failed | Check the internet (turn off VPN), run the same command again — it continues where it stopped. |
| `Filename too long` (Windows) | Project folder path too deep | Move the project to `C:\dev\daily_tracker`. |
| `EPERM` / `EBUSY` / file in use (Windows) | Another program holds a file | Close Android Studio and any Explorer window inside the project; try again. |
| The app opens with "Unable to load script" | You installed the debug build | Run the build again with `--variant release`. |
| Reminders arrive late or not at all | Exact alarms or battery settings | Part 3 steps 2–3. |
| Widget says "Open Daily Tracker to choose habits…" or looks empty | The app has not run since install, or no habits yet | Open the app once (finish onboarding); the widget redraws within a minute. |
| Widget says "Couldn't log — open the app" | The phone refused the write (storage full, or the app's data is being restored) | Open the app once — if it opens normally, tap the widget again. If the app shows a red banner, free some storage. |
| Body shows one night / one workout where two apps recorded it | By design | Two sources' copies of the same night or workout count once (the one with sleep stages wins). Hide a workout to see the other copy. |
| A drink logged in both apps counts once | By design | A glass logged here within five minutes of the same amount in the other app is treated as the same drink; the import leaves on the next sync. |
| Body tab says Health Connect is not available | Health Connect missing on this phone | Android 9–13: install *Health Connect* from the Play Store; Android 8 is too old for imports. |
| Play Protect blocks the install on a friend's phone | Google's scanner has never seen this APK (it is not from the Play Store) | *Scan app* if offered, then *More details* → *Install anyway*. The unknown-source prompt is a different, ordinary step: *Settings* → allow for the app they opened the file with. |
| Build fails with something else | — | Copy the last 30 lines of the terminal into the Replit chat; the agent reads them. |

---

## Part 8 — The short version, once it all works

```bash
cd ~/daily_tracker/artifacts/daily-tracker        # Windows: C:\dev\daily_tracker\artifacts\daily-tracker
git pull
pnpm install
pnpm exec expo prebuild --platform android --clean
pnpm exec expo run:android --variant release
```

APK for friends: `android/app/build/outputs/apk/release/app-release.apk`.
