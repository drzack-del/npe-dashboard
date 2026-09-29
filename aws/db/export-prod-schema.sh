#!/bin/bash
# Downloads the STRUCTURE of the production CadenceIQ database (tables, columns, security
# policies, functions) with no patient or staff data, so the local tests can use the real
# blueprint instead of the reconstructed one.
#
# Safe by construction:
#   * --schema-only: pg_dump writes table definitions, never table rows.
#   * pg_dump only reads, inside a read-only transaction; it cannot change anything.
#   * Only the app's own schemas (public, private) are exported.
#   * The password is typed here, hidden, and handed only to pg_dump. It is not saved.
#
# Run from the repo root:  bash aws/db/export-prod-schema.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
pg_dump="$here/local-app/bin/pgsql/bin/pg_dump"
out_dir="$here/prod-schema"
out="$out_dir/production-schema.sql"

# Supabase session pooler for this project (from supabase/.temp/pooler-url). Supports IPv4,
# unlike the direct db.<ref>.supabase.co address.
host="aws-1-us-east-1.pooler.supabase.com"
user="postgres.flhvblepqsuvsmscmmxm"

if [ ! -x "$pg_dump" ]; then
  echo "pg_dump is missing at $pg_dump (see aws/db/README.md)." >&2
  exit 1
fi

echo "This copies the production database STRUCTURE only (no patient data)."
echo "Password: Supabase dashboard > Project Settings > Database > database password."
read -r -s -p "Supabase database password (hidden): " password
echo
[ -n "$password" ] || { echo "No password entered; nothing done." >&2; exit 1; }

mkdir -p "$out_dir"
PGPASSWORD="$password" PGSSLMODE=require PGCONNECT_TIMEOUT=20 "$pg_dump" \
  --host="$host" --port=5432 --username="$user" --dbname=postgres \
  --schema-only --schema=public --schema=private \
  --no-password --file="$out.partial"
unset password

mv "$out.partial" "$out"
echo
echo "Done: $(wc -l < "$out" | tr -d ' ') lines of structure saved to aws/db/prod-schema/production-schema.sql"
echo "Tables:   $(grep -c '^CREATE TABLE' "$out")"
echo "Policies: $(grep -c '^CREATE POLICY' "$out")"
echo "Rows of data copied: 0 (structure only)"
