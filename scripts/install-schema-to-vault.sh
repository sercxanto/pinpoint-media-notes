#!/bin/sh
# Copies the schema notes in docs/schema/ into an existing vault: the
# templates into one folder, the conventions notes into another. Needs no
# Node or npm, so it can run on the machine that holds the vault.
#
# Usage: scripts/install-schema-to-vault.sh [options] <path to vault>
#
#   --diff               show what would change, change nothing
#   --templates <dir>    templates folder in the vault (default: Obsidian/Templates)
#   --conventions <dir>  conventions folder in the vault (default: Obsidian/Conventions)
#
# Folders are relative to the vault. Only the notes from docs/schema/ are
# written; other notes in those folders are left alone. A note edited in the
# vault is overwritten, so run with --diff first and copy edits back into the
# repository before installing.

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd)
schema="$repo/docs/schema"
templates_dir="Obsidian/Templates"
conventions_dir="Obsidian/Conventions"
diff_only=false

usage() {
	echo "Usage: $0 [--diff] [--templates <dir>] [--conventions <dir>] <path to vault>" >&2
	exit 1
}

while [ "$#" -gt 0 ]; do
	case $1 in
	--diff) diff_only=true ;;
	--templates)
		[ "$#" -ge 2 ] || usage
		templates_dir=$2
		shift
		;;
	--conventions)
		[ "$#" -ge 2 ] || usage
		conventions_dir=$2
		shift
		;;
	-*) usage ;;
	*) break ;;
	esac
	shift
done
[ "$#" -eq 1 ] || usage
vault=$1

if [ ! -d "$vault" ]; then
	echo "Not a folder: $vault" >&2
	exit 1
fi
if [ ! -d "$vault/.obsidian" ]; then
	echo "No .obsidian folder in $vault. Is this a vault that Obsidian has opened?" >&2
	exit 1
fi

# Where a schema note goes, by the end of its name.
target_dir() {
	case $1 in
	*" Template.md") echo "$templates_dir" ;;
	*" Conventions.md") echo "$conventions_dir" ;;
	*) return 1 ;;
	esac
}

# Check every note before touching anything.
for source in "$schema"/*.md; do
	name=$(basename "$source")
	if ! target_dir "$name" >/dev/null; then
		echo "Neither a template nor a conventions note: docs/schema/$name" >&2
		exit 1
	fi
done

new=0
changed=0
unchanged=0
for source in "$schema"/*.md; do
	name=$(basename "$source")
	relative="$(target_dir "$name")/$name"
	target="$vault/$relative"

	if [ ! -f "$target" ]; then
		status="new"
		new=$((new + 1))
	elif cmp -s "$source" "$target"; then
		status="unchanged"
		unchanged=$((unchanged + 1))
	else
		status="changed"
		changed=$((changed + 1))
	fi

	printf '%-10s %s\n' "$status" "$relative"

	if [ "$diff_only" = true ]; then
		# "-" is the vault's version, "+" the repository's: what installing would do.
		if [ "$status" = "changed" ]; then
			diff -u --label "vault: $relative" --label "repository: docs/schema/$name" \
				"$target" "$source" || true
			echo
		fi
	elif [ "$status" != "unchanged" ]; then
		mkdir -p "$(dirname "$target")"
		cp "$source" "$target"
	fi
done

if [ "$diff_only" = true ]; then
	echo "$new new, $changed changed, $unchanged unchanged. Nothing was written (--diff)."
else
	echo "$new new, $changed changed, $unchanged unchanged. Installed into $vault"
fi
