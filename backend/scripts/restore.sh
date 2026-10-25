#!/usr/bin/env bash
# CampusConnect MongoDB restore (mongorestore).
#
# DANGER: restoring overwrites documents in the target database. By default
# this script does NOT drop the database first; pass --drop explicitly to
# replace it. Always restore to a throwaway database first and smoke-test.
# Usage:
#   MONGODB_URI="mongodb+srv://..." bash scripts/restore.sh <dump-dir> [--drop]
#   bash scripts/restore.sh --help
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: MONGODB_URI=\"mongodb+srv://...\" bash scripts/restore.sh <dump-dir> [--drop]"
  echo "Restores a mongodump directory into the database in MONGODB_URI."
  echo "Without --drop, documents are upserted/merged; with --drop, collections are dropped first."
  echo "Requires: mongorestore (MongoDB Database Tools) and MONGODB_URI."
  exit 0
fi

DUMP_DIR="${1:-}"
DROP_FLAG=""
if [[ "${2:-}" == "--drop" ]]; then
  DROP_FLAG="--drop"
fi

if [[ -z "$DUMP_DIR" || ! -d "$DUMP_DIR" ]]; then
  echo "ERROR: pass an existing dump directory, e.g. bash scripts/restore.sh ./backups/campusradius-20260101-120000" >&2
  exit 2
fi
if ! command -v mongorestore >/dev/null 2>&1; then
  echo "ERROR: mongorestore not found. Install MongoDB Database Tools first." >&2
  exit 2
fi
if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "ERROR: MONGODB_URI is not set. Set it to the Atlas connection string (never commit it)." >&2
  exit 2
fi

if [[ -n "$DROP_FLAG" ]]; then
  read -r -p "This will DROP collections before restoring into the target database. Type YES to continue: " confirm
  if [[ "$confirm" != "YES" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# shellcheck disable=SC2086
mongorestore --uri "$MONGODB_URI" $DROP_FLAG "$DUMP_DIR"
echo "Restore complete from $DUMP_DIR"
