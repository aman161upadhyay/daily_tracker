# Building the Android app on the laptop

Replit runs the web preview and Expo Go; it cannot run the Android SDK. Anything native — the
home-screen widget, notification buttons with the app closed, Health Connect — needs a
build made on a machine with Android Studio. This is that recipe. It takes about 15 minutes the
first time and 2–3 minutes after that.

## One-time setup

1. **Android Studio** (current stable) with the default SDK. In *SDK Manager* make sure these are
   installed: *Android SDK Platform 36* (or whatever `expo prebuild` asks for), *Android SDK
   Build-Tools*, *Android SDK Platform-Tools* (adb), *Android SDK Command-line Tools*. Add to your
   shell profile (macOS/Linux; on Windows use the environment-variables dialog):
   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"        # Linux: $HOME/Android/Sdk
   export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
   ```
   A JDK 17 or newer is required; Android Studio's bundled one works (`JAVA_HOME` → the
   `jbr` folder inside the Android Studio install) and so does Temurin 17/21.
2. **Node 22 or 24** and **pnpm 10** (the repo refuses npm/yarn on purpose). Two commands, one per
   line (Windows PowerShell 5 does not understand `&&`):
   ```bash
   corepack enable
   corepack prepare pnpm@10 --activate
   ```
   or simply `npm i -g pnpm@10`.
3. **Phone**: Settings → About → tap *Build number* 7× → Developer options → *USB debugging* on.
   Plug in, accept the fingerprint prompt, check `adb devices` lists it as `device`.
   (Wireless debugging works too: pair in Developer options, then `adb pair` / `adb connect`.)

## Every build

First time only — get the code:
```bash
git clone https://github.com/aman161upadhyay/daily_tracker.git
cd daily_tracker
```
Every later time — update it (from inside the `daily_tracker` folder):
```bash
git pull
```
Then build and install (from inside the `daily_tracker` folder):
```bash
pnpm install                       # repo root: installs every workspace and applies patches/*.patch
cd artifacts/daily-tracker
pnpm exec expo prebuild --platform android --clean   # regenerates android/ from app.json + plugins
pnpm exec expo run:android         # builds the debug app, installs it on the phone, starts Metro
```

What to expect:
- `prebuild` is where the widget comes from: the `react-native-android-widget` plugin in `app.json`
  writes the widget provider, copies `assets/fonts/*.ttf` and `assets/widget/preview.png` into the
  Android project. `android/` is generated and git-ignored; never edit it by hand (changes would be
  lost on the next `--clean`). It may also touch `package.json` to list `expo`/`react`/`react-native`
  under `dependencies` — they already are, so the tree should stay clean.
- The first Gradle run downloads 1–2 GB: Gradle, the Android Gradle plugin, and — because React
  Native 0.86 (the version `package.json` pins for Expo SDK 57) builds its native core from
  source — the **NDK and CMake** (the SDK manager fetches the versions the project asks for; accept
  the licences when prompted). Later runs are incremental.
- `run:android` leaves Metro running; the phone loads JavaScript from the laptop over USB
  (`adb reverse`), so edits reload live. Quit with Ctrl-C; the installed app keeps the last bundle
  it loaded and will try to reconnect to Metro on the next launch — for a build that works without
  the laptop use the release variant below.
- Debug APK, if you want to keep it: `android/app/build/outputs/apk/debug/app-debug.apk`.
- **Two pieces of native code live in this repo, not in a package.** `patches/expo-background-task@57.0.21.patch`
  (applied by `pnpm install`; it is listed under `patchedDependencies` in `pnpm-workspace.yaml`)
  removes the "network connected" constraint that the background-task scheduler puts on every job —
  without it an offline phone stops re-planning reminders after about 36 hours. If the install ever
  prints a patch-apply failure, the package version moved: run `pnpm patch expo-background-task`,
  re-apply the one-line change in `BackgroundTaskScheduler.kt` (`NetworkType.CONNECTED` →
  `NetworkType.NOT_REQUIRED`) and `pnpm patch-commit`. The second is `modules/exact-alarms/`, a
  30-line local Expo module that asks `AlarmManager.canScheduleExactAlarms()`, so Settings can say
  whether "Alarms & reminders" is allowed. Expo's autolinking picks it up from the `modules/` folder;
  it needs nothing in `app.json`. **Escape hatch:** if the Kotlin in it fails to compile on your
  machine, delete the folder and build again — the app then simply cannot tell whether exact timing
  is on (it says so in Settings) and everything else works.
- **Prebuild check** (30 seconds, catches a plugin that silently stopped applying):
  `android/app/src/main/AndroidManifest.xml` must show `android:fullBackupContent` and
  `android:dataExtractionRules` on `<application>`; an `<activity android:name=".HealthRationaleActivity">`
  with the `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` filter (and **not** that filter on
  `.MainActivity`); the `ViewPermissionUsageActivity` alias targeting `.HealthRationaleActivity`;
  and `SYSTEM_ALERT_WINDOW` carrying `tools:node="remove"` (the debug source set keeps it for the
  developer overlay; release builds drop it). `android/app/src/main/java/com/amanupadhyay/dailytracker/`
  must contain `HealthRationaleActivity.kt`. `plugins/withHealthRationale.js` must stay listed
  **before** `react-native-health-connect` in `app.json` — Expo runs a later plugin's manifest edit
  first, so a later position would be overwritten.

## A standalone APK (no laptop needed after install)

Every block in this file starts from the **repository root** (the `daily_tracker` folder) unless it
says otherwise; `cd` back there first if the previous block left you deeper.

```bash
cd artifacts/daily-tracker/android       # Windows PowerShell: cd artifacts\daily-tracker\android
./gradlew assembleRelease                # Windows PowerShell: .\gradlew.bat assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

**16 KB page-size check (once per dependency change).** Android 15+ phones can run with 16 KB
memory pages, and Play requires it for new uploads; every native library in the APK must be
aligned for it. The sources in this dependency set enable the flag (React Native, expo-modules-core,
expo-sqlite), but only the built APK proves it:
`$ANDROID_HOME/build-tools/<version>/zipalign -c -P 16 -v 4 app/build/outputs/apk/release/app-release.apk | tail -3`
must end in `Verification succesful` (sic), and the APK must install and open on a 16 KB emulator
image (Android Studio → Device Manager → a system image marked "16 KB page size") or on a Pixel
with Developer options → "Boot with 16 KB page size". A failure names the `.so`; the fix is updating
that package, not the app.

Without a release key configured (next section) the Expo template signs *release* builds with the
**debug keystore that ships inside the generated project** (`android/app/debug.keystore` — the same
public key every Expo project has, not one your machine created). That is fine for a phone you
own; it is not fine for an APK you hand out, because anyone who builds this project holds the same
key and could ship an "update" to it. Android only updates an app signed with the same key, so
switching to your own key later means uninstalling once (export first).

## Release signing (M6) — do this once

`plugins/withReleaseSigning.js` adds a `release` signing config to the generated
`android/app/build.gradle` that reads four Gradle properties. Nothing secret lives in the repo and
the block survives every `--clean` prebuild.

1. Create the key once and back it up twice (a lost key means a new package name for everyone).
   Mac / Linux:
   ```bash
   mkdir -p ~/keystores
   keytool -genkeypair -v -storetype PKCS12 -keystore ~/keystores/daily-tracker-release.jks -alias daily-tracker -keyalg RSA -keysize 2048 -validity 10000
   ```
   Windows PowerShell (one line; no `\` continuation, no `&&`):
   ```powershell
   mkdir $HOME\keystores
   keytool -genkeypair -v -storetype PKCS12 -keystore $HOME\keystores\daily-tracker-release.jks -alias daily-tracker -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Put the credentials in `~/.gradle/gradle.properties` (your home directory, never the repo —
   on Windows that is `C:\Users\<you>\.gradle\gradle.properties`; create the file if it is missing):
   ```
   DT_RELEASE_STORE_FILE=/Users/you/keystores/daily-tracker-release.jks
   DT_RELEASE_STORE_PASSWORD=…
   DT_RELEASE_KEY_ALIAS=daily-tracker
   DT_RELEASE_KEY_PASSWORD=…
   ```
   On Windows write the path with forward slashes, `DT_RELEASE_STORE_FILE=C:/Users/<you>/keystores/daily-tracker-release.jks`
   (a backslash in a properties file is an escape character, so `C:\Users` would be read as `C:Users`).
   The same rule applies to the passwords: a `\` inside one must be written `\\`, and a password
   that starts with a space loses it (Java properties trim leading whitespace; `!` and `#` are fine
   except as the very first character, where they start a comment). Simplest: choose a password
   without backslashes or leading spaces. Alternatively keep the file password-free and pass the
   secrets as environment variables for the one build command — Gradle reads
   `ORG_GRADLE_PROJECT_DT_RELEASE_STORE_PASSWORD` (and the same prefix for the other three) as
   project properties, no escaping involved:
   ```bash
   ORG_GRADLE_PROJECT_DT_RELEASE_STORE_FILE=$HOME/keystores/daily-tracker-release.jks \
   ORG_GRADLE_PROJECT_DT_RELEASE_STORE_PASSWORD='…' ORG_GRADLE_PROJECT_DT_RELEASE_KEY_ALIAS=daily-tracker \
   ORG_GRADLE_PROJECT_DT_RELEASE_KEY_PASSWORD='…' ./gradlew assembleRelease
   ```
   With a PKCS12 keystore (the `-storetype PKCS12` above) use the **same password** for the store and
   the key — `keytool` warns that different ones are not supported. When the properties are absent
   the release build type falls back to the template's public debug keystore, so the command below
   always works; only the signature differs (and Gradle prints a warning).
3. Build, verify the signature, install (from the repository root). Mac / Linux:
   ```bash
   cd artifacts/daily-tracker
   pnpm exec expo prebuild --platform android --clean
   cd android
   ./gradlew assembleRelease
   "$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME"/build-tools | grep -E '^[0-9.]+$' | sort -V | tail -1)/apksigner" verify --print-certs app/build/outputs/apk/release/app-release.apk
   adb install -r app/build/outputs/apk/release/app-release.apk
   ```
   Windows PowerShell:
   ```powershell
   cd artifacts\daily-tracker
   pnpm exec expo prebuild --platform android --clean
   cd android
   .\gradlew.bat assembleRelease
   $tools = Get-ChildItem "$env:ANDROID_HOME\build-tools" | Where-Object { $_.Name -match '^[0-9.]+$' } | Sort-Object { [version]$_.Name } | Select-Object -Last 1
   & "$($tools.FullName)\apksigner.bat" verify --print-certs app\build\outputs\apk\release\app-release.apk
   adb install -r app\build\outputs\apk\release\app-release.apk
   ```
   `apksigner` must print the certificate you created (CN from the `keytool` prompts), not
   `CN=Android Debug`. Switching an installed debug-key build to the release key means
   uninstalling once (Android refuses a different signer): **export a backup first** from
   Settings → Your data, install, then import it. Friends install the same APK from any shared
   file; later versions update in place as long as they come from this key.

`versionCode` discipline: Android installs a same-signer build whose `versionCode` is equal **or**
higher over the existing one and rejects only a lower one (`INSTALL_FAILED_VERSION_DOWNGRADE`).
This project still raises `expo.android.versionCode` in `app.json` on every release (M3 shipped 3,
M4 4, M5 5, M6 6, then one per council round: round 3 → 7, round 4 → 8, round 5 → 9, round 6 → 10, round 7 → 11, round 8 → 12, round 9 → 13, round 10 → 14, round 11 → 15)
so that "which build is this phone on" has one answer; `version` follows the tag (`0.26.0` = `v0.26`).
`app.json` is the source of truth; when this paragraph and `app.json` disagree, `app.json` is right.

Google Play is deliberately not part of this recipe; `./gradlew bundleRelease` produces the AAB if
that day comes, and the remaining items (feature graphic, privacy policy, Health Connect
declaration, data-safety form) are listed in `docs/IMPLEMENTATION_PLAN.md` M6.

## Backups (M6)

Two independent mechanisms, both leaving the live SQLite database alone:

- **Android Auto Backup.** `plugins/withBackupRules.js` restricts the backup to `files/backup/`
  (and switches it off on phones that cannot encrypt it with their own lock screen). The app keeps
  `files/backup/snapshot.json` there — a plain export, refreshed on start and when leaving the app,
  at most hourly, never for sample data, deleted by "Erase everything" (the intent to delete is
  recorded in a marker file outside the backup directory first and finished on the next start if
  the app died before the delete ran). After a factory reset or a new phone, Android restores that
  file, the database is empty, and onboarding opens with "Welcome back → Restore it / Start fresh".
  The writer never overwrites `snapshot.json` in place: it writes the whole export to
  `snapshot.next.json` first and then moves that over the old file (a complete `snapshot.next.json`
  found on start outranks whatever `snapshot.json` holds — the app died between the two steps),
  so a crash mid-write cannot leave a half file as the only copy. A restored snapshot that this
  build cannot read (written by a newer app, or damaged) is never overwritten: onboarding offers
  "Keep it for later / Delete it", the hourly writer moves it to `snapshot.kept.<ms>.json` (one
  file per kept copy, still inside the backed-up directory; older builds used `snapshot.kept.json`),
  and Settings → Your data offers "Try to restore it" once the app has been updated. To rehearse
  without a reset:
  `adb shell bmgr backupnow com.amanupadhyay.dailytracker`, uninstall, reinstall, and
  `adb shell bmgr restore <token> com.amanupadhyay.dailytracker` (tokens from `adb shell bmgr list sets`;
  `adb shell bmgr enable true` and a Google account on the phone are prerequisites).
- **Export with a password.** Settings → Your data → Export backup → type a password. The file is
  AES-256-GCM with a PBKDF2-SHA256 key (200,000 iterations, 16-byte salt, 12-byte IV, all written in
  the file, tag appended to the ciphertext). Files written since v0.12 carry `"envelope": 2`: the
  header fields are authenticated as GCM additional data, so an edited iteration count, salt, IV
  or export date fails to open instead of silently decrypting with the wrong key. Envelope 1 files
  (no additional data) still open. Without this app, for example in Python:
  ```python
  import json, base64, hashlib, unicodedata
  from cryptography.hazmat.primitives.ciphers.aead import AESGCM   # pip install cryptography
  f = json.load(open('daily-tracker-2026-10-26-k3f9a2.json'))
  password = unicodedata.normalize('NFKC', 'your password')      # the app normalises the same way
  key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), base64.b64decode(f['salt']), f['iterations'], 32)
  aad = None
  if f.get('envelope') == 2:                                      # header authenticated since v0.12
      aad = '|'.join(['daily-tracker', str(f['envelope']), f['kdf'], str(f['iterations']), f['salt'], f['cipher'], f['iv'], f.get('exportedAt', '')]).encode('utf-8')
  print(AESGCM(key).decrypt(base64.b64decode(f['iv']), base64.b64decode(f['ciphertext']), aad).decode())
  ```
  Passwords are NFKC-normalised before hashing (so a password typed with a full-width or decomposed
  character still opens the file); the recipe above does the same. There is no recovery for a
  forgotten password.

## After installing: the device checklist

Run `docs/DEVICE_CHECKLIST.md`. Widget rows W1–W8 are from M3; Health Connect rows H1–H9 are new
in M4. N6 ("Done with the app swiped away") and N17 are worth re-running because the headless
tasks are registered from the entry file (`index.js`), which is what runs when Android starts the
app without a screen.

Health Connect notes: the phone needs the Health Connect app (built into Android 14+; on Android
9–13 install it from the Play Store — the Body tab offers the link) and `minSdkVersion` is now 26,
so Android 8.0 is the floor. The permission sheet only lists the data types declared in the
manifest (`app.json` → `android.permissions`); if a type is missing there, it is silently absent
from the sheet rather than denied. A debug build on an Android 14+ phone sometimes needs one
reboot before Health Connect shows the app in its list.

## When something fails

| Symptom | Cause / fix |
|---|---|
| `Use pnpm instead` during install | You ran npm/yarn. Use `pnpm install` at the repo root. |
| `SDK location not found` | `ANDROID_HOME` not exported, or create `android/local.properties` with `sdk.dir=/path/to/sdk` (git-ignored). |
| `Unsupported class file major version` / Gradle JVM errors | Wrong JDK on `PATH`. Point `JAVA_HOME` at a JDK 17+. |
| `modules/exact-alarms` fails to compile | Delete the `modules/exact-alarms/` folder and rebuild (see "Every build" above). Settings then shows the neutral "Exact timing" button instead of the exact status. |
| `patch-package` / `pnpm patch` apply error on install | `expo-background-task` moved past 57.0.21. Re-create the patch as described above, or remove the `patchedDependencies` entry to build without it (reminders then re-plan only while online). |
| Widget not in the picker | The build predates the plugin: run prebuild with `--clean`, rebuild, and reinstall. Some launchers need a reboot to list new widgets. |
| Widget shows "Open Daily Tracker…" | Fresh install with no habits yet: finish onboarding, then the widget redraws. |
| Red screen `AndroidWidget could not be found` | Only possible in Expo Go. Expo Go has no widget module; use the dev build. |
| App opens to a white screen after Ctrl-C on Metro | Debug builds need Metro. Start `pnpm exec expo start` again, or install the release variant. |
| Body tab says "Not installed" on Android 14+ | Health Connect is disabled in system settings: Settings → Apps → Health Connect → enable, or the manifest `<queries>` entry is missing (run prebuild with `--clean`). |
| Permission sheet is empty or crashes back | The build predates M4's manifest permissions, or the Health Connect app is outdated — update it from the Play Store. |
