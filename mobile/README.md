# Financer Android app

A Capacitor shell around https://financer.my.id plus native Kotlin features
(the bank/e-wallet notification listener in `android/app/src/main/java/id/my/financer/app/`).

## Build
Needs JDK 21 and the Android SDK (`ANDROID_HOME`, or `android/local.properties` with `sdk.dir=`).

- Test APK: `npm run apk:debug` → `android/app/build/outputs/apk/debug/app-debug.apk`
- Play upload (AAB): `npm run aab:release` → `android/app/build/outputs/bundle/release/app-release.aab`

Bump `versionCode` (and `versionName`) in `android/app/build.gradle` for every upload to Play.

## Signing
Release builds are signed with the **upload key** described in `android/keystore.properties`
(never committed). On the build server the key lives in `/data/workspace/financer-secrets/`.
Keep an offline backup of `financer-upload.jks` and its password: with Play App Signing,
Google holds the app-signing key, and a lost upload key can be reset through Play Console
support, but it is slow.

## Icons
`node mobile/tools/make-icons.cjs` (from the repo root) regenerates launcher icons and splash
images from `web/public/brand/`.
