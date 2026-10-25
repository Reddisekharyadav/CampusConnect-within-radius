#!/usr/bin/env bash
# CampusConnect MongoDB backup (mongodump).
#
# UNEXECUTED against any real cluster: this script is documentation + tooling
# for the deployment step in DEPLOYMENT.md. It only runs when MONGODB_URI is
# set (Atlas M0 has no point-in-time backup, so this dump is the backup).
# Usage:
#   MONGODB_URI="mongodb+srv://..." bash scripts/backup.sh [output-dir]
#   bash scripts/backup.sh --help
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: MONGODB_URI=\"mongodb+srv://...\" bash scripts/backup.sh [output-dir]"
  echo "Writes a mongodump to <output-dir>/campusradius-<timestamp> (default: ./backups)."
  echo "Requires: mongodump (MongoDB Database Tools) and MONGODB_URI."
  exit 0
fi

OUT_DIR="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$OUT_DIR/campusradius-$STAMP"

if ! command -v mongodump >/dev/null 2>&1; then
  echo "ERROR: mongodump not found. Install MongoDB Database Tools first." >&2
  exit 2
fi
if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "ERROR: MONGODB_URI is not set. Set it to the Atlas connection string (never commit it)." >&2
  exit 2
fi

mkdir -p "$DEST"
mongodump --uri "$MONGODB_URI" --out "$DEST"
echo "Backup written to $DEST"
echo "To restore: MONGODB_URI=\"...\" bash scripts/restore.sh $DEST"
