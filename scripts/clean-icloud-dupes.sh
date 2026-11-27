#!/usr/bin/env bash
# Targeted cleanup for iCloud Drive sync-conflict duplicates.
#
# When iCloud Drive can't merge a file edit cleanly, it creates a "<name> 2.<ext>"
# copy alongside the original. After a few rebuilds these accumulate fast — the
# project currently has ~300 of them lingering in dist/ from prior build cycles.
#
# This script finds every "* 2.*" file under dist/ and removes them.
# Safe to run repeatedly. Files are regenerated on the next build, so deletion
# is non-destructive.
#
# Usage:
#   bash scripts/clean-icloud-dupes.sh             # dry-run + summary
#   bash scripts/clean-icloud-dupes.sh --delete    # actually remove files
#
# Or via npm:
#   npm run clean:dupes              # dry-run
#   npm run clean:dupes -- --delete  # do it
set -euo pipefail
cd "$(dirname "$0")/.."

DELETE=0
for arg in "$@"; do
  [[ "$arg" == "--delete" ]] && DELETE=1
done

# Match "anything 2.ext" — the macOS iCloud conflict-rename pattern.
mapfile -d '' files < <(find dist -type f -name "* 2.*" -print0 2>/dev/null || true)

count="${#files[@]}"
if [[ "$count" -eq 0 ]]; then
  echo "✓ No iCloud duplicates found under dist/."
  exit 0
fi

echo "Found $count iCloud-conflict files under dist/."
if [[ "$DELETE" -eq 0 ]]; then
  echo ""
  echo "Sample (first 10):"
  for ((i=0; i<10 && i<count; i++)); do echo "  ${files[$i]}"; done
  echo ""
  echo "Run with --delete (or: npm run clean:dupes -- --delete) to remove all $count."
  exit 0
fi

removed=0
failed=0
for f in "${files[@]}"; do
  if rm -f "$f" 2>/dev/null; then
    removed=$((removed+1))
  else
    failed=$((failed+1))
  fi
done

echo "✓ Removed $removed iCloud-conflict files."
if [[ "$failed" -gt 0 ]]; then
  echo "⚠ $failed files could not be removed (likely currently locked by iCloud sync — try again in a moment)."
fi
