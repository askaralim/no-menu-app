#!/usr/bin/env bash
# Smoke-test Tap List public RPCs (anon). Run after applying taplist_mvp_patch.sql.
#
# Usage:
#   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=eyJ... ./scripts/taplist_rpc_smoke.sh
set -euo pipefail

: "${SUPABASE_URL:?Set SUPABASE_URL (e.g. https://your-project.supabase.co)}"
: "${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY (Publishable/anon key)}"

RPC_BASE="${SUPABASE_URL%/}/rest/v1/rpc"

echo "POST get_public_taplist_bars (Shanghai)..."
bars_json="$(curl -sS -X POST "$RPC_BASE/get_public_taplist_bars" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_city": "Shanghai"}')"
echo "${bars_json:0:400}"
echo ""

BARS_JSON="$bars_json" python3 -c '
import json, os
bars = json.loads(os.environ["BARS_JSON"])
if isinstance(bars, list) and bars:
    sc = bars[0].get("status_counts")
    assert sc is not None, "status_counts missing on bar row"
    for key in ("上新", "在售", "少量", "售罄", "即将上新"):
        assert key in sc, sc
    print("OK: status_counts present on bars")
    if len(bars) >= 2:
        def menu_ts(bar):
            raw = bar.get("last_menu_updated_at")
            if not raw:
                return None
            from datetime import datetime
            s = raw.replace("Z", "+00:00")
            try:
                return datetime.fromisoformat(s).timestamp()
            except ValueError:
                return None
        for i in range(len(bars) - 1):
            a, b = menu_ts(bars[i]), menu_ts(bars[i + 1])
            if a is not None and b is not None:
                assert a >= b, f"bars not ordered newest-first: {bars[i].get('slug')} before {bars[i+1].get('slug')}"
        print("OK: bars ordered by last_menu_updated_at (newest first)")
'
echo ""

first_slug="$(echo "$bars_json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['slug'] if isinstance(d,list) and d else '')")" || true
if [[ -z "$first_slug" ]]; then
  echo "WARN: No bars in Shanghai — apply patch + set tenant is_public_visible and city; exiting 0."
  exit 0
fi

echo "POST get_public_taplist_tenant slug=$first_slug..."
tenant_body="$(python3 -c "import json,sys; print(json.dumps({'p_slug': sys.argv[1]}))" "$first_slug")"
tenant_json="$(curl -sS -X POST "$RPC_BASE/get_public_taplist_tenant" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "$tenant_body")"

echo "${tenant_json:0:500}"
echo ""

tenant_id="$(echo "$tenant_json" | python3 -c "import json,sys; j=json.load(sys.stdin); print(j.get('tenant',{}).get('id','') if j.get('ok') else '')")"
if [[ -z "$tenant_id" ]]; then
  echo "ERROR: get_public_taplist_tenant did not return ok tenant"
  exit 1
fi

echo "POST get_public_taplist_drinks..."
drinks_json="$(curl -sS -X POST "$RPC_BASE/get_public_taplist_drinks" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"p_tenant_id\": \"$tenant_id\"}")"
echo "${drinks_json:0:600}"
echo ""

DRINKS_JSON="$drinks_json" python3 -c '
import json, os
j = json.loads(os.environ["DRINKS_JSON"])
assert j.get("ok") is True, j
for d in (j.get("drinks") or [])[:5]:
    if "volume_ml" in d:
        raise SystemExit("drinks must not expose top-level volume_ml")
    for so in d.get("serving_options") or []:
        if "price" not in so:
            raise SystemExit("serving_options missing price")
print("OK: shape checks passed")
'

echo "POST search_public_taplist (IPA)..."
search_json="$(curl -sS -X POST "$RPC_BASE/search_public_taplist" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_city": "Shanghai", "p_query": "IPA"}')"
echo "${search_json:0:400}"
echo ""

SEARCH_JSON="$search_json" python3 -c '
import json, os
j = json.loads(os.environ["SEARCH_JSON"])
assert j.get("ok") is True, j
for row in j.get("results") or []:
    assert "drink_id" in row and "tenant_slug" in row, row
print("OK: search_public_taplist shape checks passed")
'

echo "taplist_rpc_smoke: OK"
