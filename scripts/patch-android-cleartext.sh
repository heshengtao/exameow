#!/usr/bin/env bash
# Release builds block cleartext traffic. The MCP bridge talks to the app's own
# loopback listener over ws://127.0.0.1, so allow loopback only.
#
# Run after `pnpm tauri android init` (CI does this) and before the Gradle build.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/src-tauri/gen/android/app/src/main"

if [ ! -d "$APP_DIR" ]; then
  echo "patch-android-cleartext: no generated Android project, skipping"
  exit 0
fi

mkdir -p "$APP_DIR/res/xml"
cat > "$APP_DIR/res/xml/network_security_config.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Release builds stay HTTPS-only, except for the local MCP bridge. -->
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">localhost</domain>
    </domain-config>
</network-security-config>
XML

python3 - "$APP_DIR/AndroidManifest.xml" <<'PY'
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
    manifest = fh.read()

if "android:networkSecurityConfig" in manifest:
    print("patch-android-cleartext: manifest already patched")
    sys.exit(0)

needle = "<application\n"
if needle not in manifest:
    needle = "<application "
if needle not in manifest:
    raise SystemExit("patch-android-cleartext: <application> tag not found")

manifest = manifest.replace(
    needle,
    needle + '        android:networkSecurityConfig="@xml/network_security_config"\n',
    1,
)
with open(path, "w", encoding="utf-8") as fh:
    fh.write(manifest)
print("patch-android-cleartext: manifest patched")
PY
