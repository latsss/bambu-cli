#!/usr/bin/env bash
# Build a Node SEA single-file executable for the current OS/arch.
# Usage: npm run build:sea  (or: bash scripts/build-sea.sh)
#
# Output: dist/bambu-cli
#
# Requirements: Node 22+ (24 recommended), npx postject (auto-fetched), codesign on macOS.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OS_RAW="$(uname -s)"
ARCH="$(uname -m)"
# NODE_BIN can be overridden (used by CI to cross-build for a different target arch
# by pointing this at a downloaded node binary of the desired platform).
NODE_BIN="${NODE_BIN:-$(command -v node)}"
OUT_DIR="dist"
OUT_BIN="$OUT_DIR/bambu-cli"

case "$OS_RAW" in
    Darwin*) OS=Darwin ;;
    Linux*)  OS=Linux ;;
    MINGW*|MSYS*|CYGWIN*)
        OS=Windows
        OUT_BIN="$OUT_BIN.exe"
        # On Git Bash, command -v gives a unix path; we want the actual .exe
        NODE_BIN="$(cygpath -u "$(node -e 'process.stdout.write(process.execPath)')" 2>/dev/null || echo "$NODE_BIN")"
        ;;
    *) OS="$OS_RAW" ;;
esac

echo "== bambu-cli SEA build =="
echo "  node:   $NODE_BIN ($(node --version))"
echo "  target: $OS/$ARCH"
echo "  output: $OUT_BIN"
echo

mkdir -p "$OUT_DIR"

echo "[1/5] Bundling with esbuild..."
npm run --silent bundle

echo "[2/5] Generating SEA blob..."
cat > "$OUT_DIR/sea-config.json" <<EOF
{
  "main": "$OUT_DIR/bambu-cli.cjs",
  "output": "sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
EOF
node --experimental-sea-config "$OUT_DIR/sea-config.json"

echo "[3/5] Copying node binary..."
cp "$NODE_BIN" "$OUT_BIN"
if [ "$OS" = "Darwin" ]; then
    codesign --remove-signature "$OUT_BIN"
fi

echo "[4/5] Injecting SEA blob..."
POSTJECT_ARGS=(
    "$OUT_BIN"
    NODE_SEA_BLOB
    sea-prep.blob
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
)
if [ "$OS" = "Darwin" ]; then
    POSTJECT_ARGS+=(--macho-segment-name NODE_SEA)
fi
npx --yes postject@1.0.0-alpha.6 "${POSTJECT_ARGS[@]}"

if [ "$OS" = "Darwin" ]; then
    echo "[5/5] Ad-hoc codesigning..."
    codesign --sign - "$OUT_BIN"
else
    echo "[5/5] (skipped — no codesign needed on $OS)"
fi

rm -f sea-prep.blob

echo
echo "✅ Built $OUT_BIN ($(du -h "$OUT_BIN" | cut -f1))"
echo "   Try: $OUT_BIN --help"
