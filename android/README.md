# VRCX with Mods for Android

An independent Android host for this fork's MIT-licensed VRCX frontend and four
bundled mods. Android 11 or newer is required; keep Android System WebView updated.

This first alpha includes standalone VRChat login and 2FA, the existing friends,
feed, invites, search, favorites and profiles, and mobile layouts for Status
Tracker, Friend Care, Orbit Graph and Global DB / Pool Chat. Global DB membership,
token and initial-sync requirements are the same as desktop.

The app uses native HTTPS requests and private SQLite storage. Configuration,
saved sessions and pool tokens are protected by Android Keystore. Remembering an
account stores its session rather than its password. Android backup is disabled.

## Desktop history

Close VRCX on the PC, copy `VRCX.sqlite3` to the phone, and choose **Phone settings →
Import desktop history**. This imports world visits and player join/leave rows,
without copying accounts, passwords, cookies or settings. Repeating the import
does not duplicate records. Friend Care and Orbit Graph can use these visits.
Status Tracker starts recording the status/feed events received by this phone;
the import does not include desktop status feeds.

The app does not capture desktop game logs. Live PC log streaming, automatic
desktop history sync, VR overlays, the desktop voice sidecar and background
connection reliability are not included in this alpha. Keep the app open for live
updates; Android may pause it in the background. Image/file uploads through the
desktop native WebApi upload helpers are currently unavailable. Pool chat's
ordinary media picker uses Android's document picker.

## Build

Use Node 24+, JDK 17+ and Android SDK platform/build-tools 35. Set `JAVA_HOME` and
`ANDROID_HOME` to those installations.

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --ignore-scripts
npm run build:android
cd android
./gradlew assembleDebug
```

The APK is `android/app/build/outputs/apk/debug/app-debug.apk`. For a signed release,
set `VRCX_ANDROID_KEYSTORE`, `VRCX_ANDROID_STORE_PASSWORD`, `VRCX_ANDROID_KEY_ALIAS`
and optionally `VRCX_ANDROID_KEY_PASSWORD`, then run `./gradlew assembleRelease`.
Keep the signing key to preserve update compatibility. Never commit signing keys.

## Checks

```sh
npx vitest run src/mods src/platform/android/__tests__ src/services/__tests__/config.test.js src/stores/__tests__/authLoginFailureToast.test.js
cd android
./gradlew connectedDebugAndroidTest
```

Native instrumentation covers SQL parameter binding and types, encrypted settings,
cookie scopes, origin checks and history-import deduplication. The optional
`android/smoke.mjs` checks a debuggable WebView on an **isolated emulator with no
personal accounts**, including login, phone settings and all five mod routes using
synthetic data. It refuses saved accounts and writes screenshots plus its report.

Forward the emulator's `webview_devtools_remote_<pid>` socket to a local port,
then run `node android/smoke.mjs http://127.0.0.1:<port>`. Release builds disable
WebView debugging. Synthetic UI checks do not prove authenticated VRChat, live
pool-server or physical-phone behavior.

The native host and mod changes are under the repository's MIT licence. VRCX and
VRChat are credited in the app; this project is not affiliated with VRChat Inc.
