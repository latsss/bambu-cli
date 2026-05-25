#!/usr/bin/env sh
# Bambu CLI installer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/latsss/bambu-cli/main/install.sh | sh
#
# Options (set via env or flag):
#   BINDIR=/path        install destination (default: $HOME/.local/bin)
#   VERSION=v1.2.3      install a specific tag (default: latest release)
#
# Examples:
#   curl -fsSL .../install.sh | sh
#   curl -fsSL .../install.sh | BINDIR=/usr/local/bin sudo sh
#   curl -fsSL .../install.sh | VERSION=v1.1.0 sh

set -eu

REPO="latsss/bambu-cli"
BINDIR="${BINDIR:-$HOME/.local/bin}"
VERSION="${VERSION:-latest}"

# --- detect platform -------------------------------------------------------
os_raw="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch_raw="$(uname -m)"

case "$os_raw" in
    darwin) os=darwin ;;
    linux)  os=linux ;;
    *)
        echo "❌ Unsupported OS: $os_raw"
        echo "   This installer supports macOS and Linux. For Windows, download manually:"
        echo "   https://github.com/$REPO/releases"
        exit 1
        ;;
esac

case "$arch_raw" in
    x86_64|amd64) arch=x64 ;;
    arm64|aarch64) arch=arm64 ;;
    *)
        echo "❌ Unsupported architecture: $arch_raw"
        exit 1
        ;;
esac

# Linux arm64 isn't built yet (would just need adding to the GH Actions matrix).
if [ "$os" = "linux" ] && [ "$arch" = "arm64" ]; then
    echo "❌ Linux arm64 binaries are not built yet."
    echo "   Track or open an issue at https://github.com/$REPO/issues"
    exit 1
fi

asset="bambu-cli-${os}-${arch}"

# --- resolve download URL --------------------------------------------------
if [ "$VERSION" = "latest" ]; then
    api_url="https://api.github.com/repos/$REPO/releases/latest"
else
    api_url="https://api.github.com/repos/$REPO/releases/tags/$VERSION"
fi

echo "==> Looking up $VERSION release for $os/$arch ..."
release_json="$(curl -fsSL "$api_url")"
download_url="$(printf '%s' "$release_json" \
    | grep -E "\"browser_download_url\".*${asset}\"" \
    | head -n1 \
    | sed -E 's/.*"(https:[^"]+)".*/\1/')"

if [ -z "$download_url" ]; then
    echo "❌ Could not find asset '$asset' in $VERSION release."
    echo "   See https://github.com/$REPO/releases"
    exit 1
fi

# --- download --------------------------------------------------------------
mkdir -p "$BINDIR"
dest="$BINDIR/bambu-cli"
tmp="$(mktemp -t bambu-cli.XXXXXX)"
trap 'rm -f "$tmp"' EXIT INT TERM

echo "==> Downloading $(basename "$download_url")"
curl -fsSL "$download_url" -o "$tmp"
chmod +x "$tmp"
mv "$tmp" "$dest"

echo
echo "✅ Installed $dest"

# --- PATH hint -------------------------------------------------------------
case ":$PATH:" in
    *":$BINDIR:"*) ;;
    *)
        echo
        echo "ℹ️  $BINDIR is not on your PATH. Add it to your shell rc, e.g.:"
        echo "     echo 'export PATH=\"$BINDIR:\$PATH\"' >> ~/.zshrc"
        echo "     source ~/.zshrc"
        ;;
esac

echo
"$dest" --version >/dev/null 2>&1 && "$dest" --version || true
echo "Run 'bambu-cli --help' to get started."
