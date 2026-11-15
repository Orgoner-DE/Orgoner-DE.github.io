#!/usr/bin/env bash
# Baut Funkhaus.apk ohne Gradle (Ubuntu-Pakete: aapt apksigner dalvik-exchange zipalign android-sdk-platform-23).
# Signatur: KEYSTORE (Standard ~/.android-keys/funkhaus.jks), Passwort in KS_PASS.
set -euo pipefail
cd "$(dirname "$0")"
SDK=/usr/lib/android-sdk
JAR=$SDK/platforms/android-23/android.jar
# Framework-Ressourcen API 34 (resources.arsc aus org.robolectric:android-all:14-robolectric-10818077)
FRAMEWORK_RES=${FRAMEWORK_RES:-$HOME/.android-keys/framework-res-34.jar}
DX=$SDK/build-tools/debian/dx
OUT=build
KEYSTORE=${KEYSTORE:-$HOME/.android-keys/funkhaus.jks}
KS_PASS=${KS_PASS:?KS_PASS setzen}
VERSION=$(grep -o 'android:versionName="[^"]*"' AndroidManifest.xml | cut -d'"' -f2)

rm -rf "$OUT"; mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/assets/www/icons"
cp ../index.html ../manifest.webmanifest "$OUT/assets/www/"
cp ../icons/* "$OUT/assets/www/icons/"

aapt package -f -m -J "$OUT/gen" -M AndroidManifest.xml -S res -A "$OUT/assets" -I "$FRAMEWORK_RES" \
  --min-sdk-version 23 --target-sdk-version 34 -F "$OUT/unsigned.apk"
javac -nowarn -source 8 -target 8 -encoding UTF-8 -bootclasspath "$JAR" -d "$OUT/classes" \
  $(find src "$OUT/gen" -name '*.java') 2>&1 | grep -v "bootstrap\|^warning\|^1 warning\|^Note" || true
"$DX" --dex --min-sdk-version=23 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --out "$OUT/Funkhaus-$VERSION.apk" "$OUT/aligned.apk"
apksigner verify --print-certs "$OUT/Funkhaus-$VERSION.apk" | head -2
echo "Fertig: $OUT/Funkhaus-$VERSION.apk"
