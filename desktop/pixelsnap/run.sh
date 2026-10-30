#!/bin/sh
set -eu
PIXELSNAP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if command -v uv >/dev/null 2>&1; then
    PIXELSNAP_UV=$(command -v uv)
elif [ -x "$HOME/.local/bin/uv" ]; then
    PIXELSNAP_UV="$HOME/.local/bin/uv"
else
    echo 'Installing uv and a managed Python for PixelSnap...' >&2
    installer=$(mktemp)
    trap 'rm -f "$installer"' EXIT HUP INT TERM
    if ! curl -LsSf https://astral.sh/uv/0.13.6/install.sh -o "$installer"; then
        echo 'PixelSnap setup failed: install curl and check network/proxy access to astral.sh.' >&2
        exit 3
    fi
    if ! sh "$installer"; then
        echo 'uv installation failed. See the installer error above and rerun.' >&2
        exit 3
    fi
    rm -f "$installer"
    trap - EXIT HUP INT TERM
    PIXELSNAP_UV="$HOME/.local/bin/uv"
fi
export PIXELSNAP_UV
exec "$PIXELSNAP_UV" run --no-project --python 3.12 "$PIXELSNAP_DIR/bootstrap.py" "$@"
