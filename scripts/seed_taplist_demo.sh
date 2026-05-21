#!/usr/bin/env bash
# Load Tap List UI demo data: 4 bars × 5 beers (Shanghai, public).
#
# Usage:
#   ./scripts/seed_taplist_demo.sh
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres ./scripts/seed_taplist_demo.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL_FILE="$ROOT/supabase/seed_taplist_demo_bars.sql"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "Missing $SQL_FILE" >&2
  exit 1
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "Applying seed via DATABASE_URL..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
elif command -v psql >/dev/null 2>&1; then
  DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-54322}"
  DB_USER="${DB_USER:-postgres}"
  DB_NAME="${DB_NAME:-postgres}"
  DB_PASSWORD="${DB_PASSWORD:-postgres}"
  echo "Applying seed to $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME ..."
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
else
  echo "Install psql or set DATABASE_URL, then re-run." >&2
  exit 1
fi

echo ""
echo "Done. Demo bar slugs: taplist-demo-1 … taplist-demo-4"
echo "Open taplist-mobile Tonight (Shanghai) or:"
echo "  curl -s \"\$SUPABASE_URL/rest/v1/rpc/get_public_taplist_bars\" \\"
echo "    -H \"apikey: \$SUPABASE_ANON_KEY\" -H \"Authorization: Bearer \$SUPABASE_ANON_KEY\" \\"
echo "    -H \"Content-Type: application/json\" -d '{\"p_city\":\"Shanghai\"}' | head -c 500"
