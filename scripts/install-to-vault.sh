#!/bin/sh
# Copies the built plugin into an existing vault. Needs no Node or npm, so it
# can run on the machine that holds the vault; build first with
# `npm run build` (for example in the dev container).
#
# Usage: scripts/install-to-vault.sh <path to vault>

set -eu

plugin_id="pinpoint-media-notes"
repo=$(cd "$(dirname "$0")/.." && pwd)

if [ "$#" -ne 1 ]; then
	echo "Usage: $0 <path to vault>" >&2
	exit 1
fi
vault=$1

if [ ! -d "$vault" ]; then
	echo "Not a folder: $vault" >&2
	exit 1
fi
if [ ! -d "$vault/.obsidian" ]; then
	echo "No .obsidian folder in $vault. Is this a vault that Obsidian has opened?" >&2
	exit 1
fi
if [ ! -f "$repo/main.js" ]; then
	echo "No main.js in $repo. Run \`npm run build\` first." >&2
	exit 1
fi
if grep -q "sourceMappingURL=data:" "$repo/main.js"; then
	echo "main.js is a development build (npm run dev). Run \`npm run build\` first." >&2
	exit 1
fi

target="$vault/.obsidian/plugins/$plugin_id"
mkdir -p "$target"
# data.json (the plugin's settings) is left alone.
cp "$repo/main.js" "$repo/manifest.json" "$target/"

echo "Installed into $target"
echo "In Obsidian: enable the plugin under Settings → Community plugins,"
echo "or turn it off and on again if it was already enabled."
