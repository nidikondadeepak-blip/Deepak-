# Konoha: Shadow of the Leaf

3D Hidden Leaf Village game (browser + Android).

## Play in browser

Serve the folder over HTTP and open `index.html`.

**Desktop:** WASD, mouse look, click Rasengan, Space jump, E talk.  
**Phone:** left stick, drag right side to look, Jump / Rasengan / Talk.

## Android APK

This sandbox cannot compile an APK (no JDK / Android SDK). The full Android WebView app is in `android/`.

1. Install [Android Studio](https://developer.android.com/studio) (JDK 17 + SDK).
2. Open the `android/` folder.
3. Build → Generate Signed Bundle / APK, or run:

```bash
cd android
# first open in Android Studio so the Gradle wrapper is created
./gradlew :app:assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

The app loads the game from assets and needs **Internet** for Three.js from the CDN.
