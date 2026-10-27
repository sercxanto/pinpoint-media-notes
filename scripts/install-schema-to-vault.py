#!/usr/bin/env python3
"""Copies the schema notes in docs/schema/ into an existing vault.

The templates go into one folder, the conventions notes into another. Needs
only Python 3, no Node or npm, so it can run on the machine that holds the
vault, Windows included.

Usage: python3 scripts/install-schema-to-vault.py [options] <path to vault>

  --diff               show what would change, change nothing
  --templates <dir>    templates folder in the vault (default: Obsidian/Templates)
  --conventions <dir>  conventions folder in the vault (default: Obsidian/Conventions)

Folders are relative to the vault. Only the notes from docs/schema/ are
written; other notes in those folders are left alone. A note edited in the
vault is overwritten, so run with --diff first and copy edits back into the
repository before installing.
"""

import argparse
import difflib
import shutil
import sys
from pathlib import Path
from typing import Optional

REPO = Path(__file__).resolve().parent.parent
SCHEMA = REPO / "docs" / "schema"


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(1)


def target_dir(name: str, templates_dir: str, conventions_dir: str) -> Optional[str]:
    """Where a schema note goes, by the end of its name."""
    if name.endswith(" Template.md"):
        return templates_dir
    if name.endswith(" Conventions.md"):
        return conventions_dir
    return None


def read_lines(path: Path) -> list:
    # newline="" keeps line endings as they are, so a note that differs only
    # in them still shows a diff.
    with path.open(encoding="utf-8", errors="replace", newline="") as file:
        lines = file.readlines()
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n\\ No newline at end of file\n"
    return lines


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Copy the schema notes into a vault.")
    parser.add_argument("--diff", action="store_true", help="show what would change, change nothing")
    parser.add_argument(
        "--templates",
        default="Obsidian/Templates",
        metavar="DIR",
        help="templates folder in the vault (default: %(default)s)",
    )
    parser.add_argument(
        "--conventions",
        default="Obsidian/Conventions",
        metavar="DIR",
        help="conventions folder in the vault (default: %(default)s)",
    )
    parser.add_argument("vault", type=Path, help="path to the vault")
    args = parser.parse_args()
    vault = args.vault

    if not vault.is_dir():
        fail(f"Not a folder: {vault}")
    if not (vault / ".obsidian").is_dir():
        fail(f"No .obsidian folder in {vault}. Is this a vault that Obsidian has opened?")

    sources = sorted(SCHEMA.glob("*.md"))

    # Check every note before touching anything.
    for source in sources:
        if target_dir(source.name, args.templates, args.conventions) is None:
            fail(f"Neither a template nor a conventions note: docs/schema/{source.name}")

    counts = {"new": 0, "changed": 0, "unchanged": 0}
    for source in sources:
        relative = f"{target_dir(source.name, args.templates, args.conventions)}/{source.name}"
        target = vault / relative

        if not target.is_file():
            status = "new"
        elif source.read_bytes() == target.read_bytes():
            status = "unchanged"
        else:
            status = "changed"
        counts[status] += 1

        print(f"{status:<10} {relative}")

        if args.diff:
            # "-" is the vault's version, "+" the repository's: what installing would do.
            if status == "changed":
                sys.stdout.writelines(
                    difflib.unified_diff(
                        read_lines(target),
                        read_lines(source),
                        fromfile=f"vault: {relative}",
                        tofile=f"repository: docs/schema/{source.name}",
                    )
                )
                print()
        elif status != "unchanged":
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)

    summary = f"{counts['new']} new, {counts['changed']} changed, {counts['unchanged']} unchanged."
    if args.diff:
        print(f"{summary} Nothing was written (--diff).")
    else:
        print(f"{summary} Installed into {vault}")


if __name__ == "__main__":
    main()
