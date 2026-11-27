#!/usr/bin/env bash
# Clean stale dist/ artifacts that prior builds (or iCloud sync conflicts)
# left behind. Safe to run any time — anything removed will be regenerated
# by the next `npm run build`.
#
# Removes:
#   1. dist/fonts/        — wiped entirely; build copies only the 6
#                           referenced .woff2 files (~239KB instead of 929KB).
#                           Eliminates iCloud "<name> 2.woff2" duplicates and
#                           unused -500 / -600 weight files.
#   2. dist/directors/    — wiped; build regenerates only the 1,165 living
#                           director pages, skipping 7 zero-film orphans.
#   3. dist/studios/      — wiped; build regenerates only the 692 living
#                           studio pages, skipping 91 zero-film orphans.
#   4. dist/films/        — Optional. Skipped by default because regenerating
#                           2,330 film pages takes time. Pass --films to wipe.
#                           Useful if iCloud "<film> 2.html" duplicates have
#                           accumulated and `npm run build` is choking on
#                           EDEADLK locks. Otherwise leave it.
#
# Usage:
#   npm run clean              # fonts + directors + studios
#   npm run clean -- --films   # also wipe + regenerate film pages
#   npm run clean -- --dry-run # show what would be removed
set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=0
FILMS=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --films)   FILMS=1   ;;
    *)         echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "would: $*"
  else
    echo "$*"
    eval "$@"
  fi
}

echo "Cleaning stale dist/ artifacts..."

run "rm -rf dist/fonts"
run "rm -rf dist/directors"
run "rm -rf dist/studios"
if [[ "$FILMS" -eq 1 ]]; then
  run "rm -rf dist/films"
fi

if [[ "$DRY_RUN" -eq 0 ]]; then
  echo ""
  echo "Cleanup complete. Now run:"
  echo "  npm run build"
  echo ""
  echo "The build will regenerate the wiped folders cleanly."
fi
