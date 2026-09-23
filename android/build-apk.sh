#!/usr/bin/env bash
# Build a debug APK with Android Studio's SDK.
# Requires: JDK 17+ and Android SDK (ANDROID_HOME).
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v java >/dev/null; then
  echo "Install JDK 17, then Android Studio SDK, then re-run."
  exit 1
fi
if [ ! -f gradlew ]; then
  echo "Open this folder in Android Studio once (it generates the Gradle wrapper), then run this script."
  exit 1
fi
./gradlew :app:assembleRelease
echo "APK: app/build/outputs/apk/release/app-release.apk"
