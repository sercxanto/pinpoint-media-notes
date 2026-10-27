#!/usr/bin/env python3
"""Copies the built plugin into an existing vault.

Needs only Python 3, no Node or npm, so it can run on the machine that holds
the vault, Windows included; build first with `npm run build` (for example in
the dev container).

Usage: python3 scripts/install-to-vault.py <path to vault>
"""

import argparse
import shutil
import sys
from pathlib import Path

PLUGIN_ID = "pinpoint-media-notes"
REPO = Path(__file__).resolve().parent.parent


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(1)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Copy the built plugin into a vault.")
    parser.add_argument("vault", type=Path, help="path to the vault")
    vault = parser.parse_args().vault

    if not vault.is_dir():
        fail(f"Not a folder: {vault}")
    if not (vault / ".obsidian").is_dir():
        fail(f"No .obsidian folder in {vault}. Is this a vault that Obsidian has opened?")
    main_js = REPO / "main.js"
    if not main_js.is_file():
        fail(f"No main.js in {REPO}. Run `npm run build` first.")
    if b"sourceMappingURL=data:" in main_js.read_bytes():
        fail("main.js is a development build (npm run dev). Run `npm run build` first.")

    target = vault / ".obsidian" / "plugins" / PLUGIN_ID
    target.mkdir(parents=True, exist_ok=True)
    # data.json (the plugin's settings) is left alone.
    for name in ("main.js", "manifest.json"):
        shutil.copyfile(REPO / name, target / name)

    print(f"Installed into {target}")
    print("In Obsidian: enable the plugin under Settings → Community plugins,")
    print("or turn it off and on again if it was already enabled.")


if __name__ == "__main__":
    main()
