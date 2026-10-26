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
2. **Node 22 or 24** and **pnpm 10** (the repo refuses npm/yarn on purpose):
   ```bash
   corepack enable && corepack prepare pnpm@10 --activate   # or: npm i -g pnpm@10
   ```
3. **Phone**: Settings → About → tap *Build number* 7× → Developer options → *USB debugging* on.
   Plug in, accept the fingerprint prompt, check `adb devices` lists it as `device`.
   (Wireless debugging works too: pair in Developer options, then `adb pair` / `adb connect`.)

## Every build

```bash
git clone https://github.com/aman161upadhyay/daily_tracker.git   # first time; later: git pull
cd daily_tracker
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
- The first Gradle run downloads ~1 GB (Gradle, AGP, the NDK is **not** needed). Later runs are
  incremental.
- `run:android` leaves Metro running; the phone loads JavaScript from the laptop over USB
  (`adb reverse`), so edits reload live. Quit with Ctrl-C; the installed app keeps the last bundle
  it loaded and will try to reconnect to Metro on the next launch — for a build that works without
  the laptop use the release variant below.
- Debug APK, if you want to keep it: `android/app/build/outputs/apk/debug/app-debug.apk`.

## A standalone APK (no laptop needed after install)

```bash
cd artifacts/daily-tracker/android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

The Expo template signs *release* builds with your machine's **debug keystore**
(`~/.android/debug.keystore`). That is fine for a phone you own, with one rule: Android only
updates an app signed with the same key, so **keep building on the same machine** (or copy that
keystore over). To be independent of the laptop, create a real key once and use it from then on:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore ~/keystores/daily-tracker-release.jks \
  -alias daily-tracker -keyalg RSA -keysize 2048 -validity 10000
```
Then in `~/.gradle/gradle.properties` (never in the repo):
```
DAILY_TRACKER_STORE_FILE=/Users/you/keystores/daily-tracker-release.jks
DAILY_TRACKER_STORE_PASSWORD=…
DAILY_TRACKER_KEY_ALIAS=daily-tracker
DAILY_TRACKER_KEY_PASSWORD=…
```
and point `android/app/build.gradle`'s `signingConfigs.release` at those properties (the
Expo/React Native docs show the exact block). Because `android/` is regenerated, keep that edit
as a small config plugin or re-apply it after each `--clean` prebuild. Back the keystore up twice.
Switching from debug-key builds to the new key means uninstalling once (data is lost — export
first from Settings → Your data).

Every later install must raise `expo.android.versionCode` in `app.json` (M3 shipped 3, M4 ships 4).

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
| Widget not in the picker | The build predates the plugin: run prebuild with `--clean`, rebuild, and reinstall. Some launchers need a reboot to list new widgets. |
| Widget shows "Open Daily Tracker…" | Fresh install with no habits yet: finish onboarding, then the widget redraws. |
| Red screen `AndroidWidget could not be found` | Only possible in Expo Go. Expo Go has no widget module; use the dev build. |
| App opens to a white screen after Ctrl-C on Metro | Debug builds need Metro. Start `pnpm exec expo start` again, or install the release variant. |
| Body tab says "Not installed" on Android 14+ | Health Connect is disabled in system settings: Settings → Apps → Health Connect → enable, or the manifest `<queries>` entry is missing (run prebuild with `--clean`). |
| Permission sheet is empty or crashes back | The build predates M4's manifest permissions, or the Health Connect app is outdated — update it from the Play Store. |
