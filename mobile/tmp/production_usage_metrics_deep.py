"""Read-only supplemental production metrics for stage review.

Same auth pattern as production_usage_metrics.py. Prints JSON only.
"""

import json
import re
import subprocess
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

PROJECT_REF = "agtujigvxxdppngirqtu"
BASE_URL = f"https://{PROJECT_REF}.supabase.co"


def get_service_key():
    raw = subprocess.check_output(
        [
            "supabase",
            "projects",
            "api-keys",
            "--project-ref",
            PROJECT_REF,
            "-o",
            "json",
        ],
        text=True,
    )
    keys = json.loads(raw)
    for item in keys:
        if item.get("name") == "service_role":
            key = item.get("api_key") or item.get("key")
            if key:
                return key
    raise RuntimeError("service_role key not found")


SERVICE_KEY = get_service_key()
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
}


def get_json(url, extra_headers=None):
    headers = dict(HEADERS)
    if extra_headers:
        headers.update(extra_headers)
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_table(table, columns):
    rows = []
    offset = 0
    page_size = 1000
    while True:
        query = urllib.parse.urlencode({"select": columns})
        page = get_json(
            f"{BASE_URL}/rest/v1/{table}?{query}",
            {"Range": f"{offset}-{offset + page_size - 1}"},
        )
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows


def parse_time(value):
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    match = re.match(r"^(.*\.)(\d+)([+-]\d\d:\d\d)$", normalized)
    if match:
        fraction = (match.group(2) + "000000")[:6]
        normalized = f"{match.group(1)}{fraction}{match.group(3)}"
    return datetime.fromisoformat(normalized)


def display_tenant(tenant):
    return (
        tenant.get("display_name")
        or tenant.get("name")
        or tenant.get("slug")
        or "未命名门店"
    ).strip()


def main():
    now = datetime.now(timezone.utc)
    tenants = fetch_table(
        "tenants",
        "id,name,display_name,slug,status,is_public_visible,ordering_enabled,owner_claimed_at,last_menu_updated_at,city",
    )
    roles = fetch_table("user_roles", "user_id,tenant_id,role,created_at")
    status_events = fetch_table(
        "drink_status_events", "tenant_id,actor_user_id,created_at,to_status"
    )
    follows = fetch_table(
        "user_bar_follows", "user_id,tenant_id,notify_new_taps,created_at"
    )
    drink_venues = fetch_table(
        "user_drink_venues", "user_id,tenant_id,light_id,first_drank_at"
    )

    tenant_by = {t["id"]: t for t in tenants}
    public = [
        t
        for t in tenants
        if t.get("status") == "active"
        and t.get("is_public_visible")
        and t.get("slug") != "__platform__"
    ]
    merchant_roles = [
        r
        for r in roles
        if r.get("role") in ("owner", "staff")
        and tenant_by.get(r.get("tenant_id"), {}).get("slug") != "__platform__"
    ]
    tenant_members = defaultdict(set)
    for role in merchant_roles:
        tenant_members[role["tenant_id"]].add(role["user_id"])
    member_pairs = {(r["tenant_id"], r["user_id"]) for r in merchant_roles}

    public_without = [
        display_tenant(t)
        for t in sorted(
            [t for t in public if t["id"] not in tenant_members],
            key=lambda x: (x.get("city") or "", display_tenant(x)),
        )
    ]

    recent = Counter()
    by_tenant_7 = Counter()
    by_tenant_30 = Counter()
    to_status_30 = Counter()
    for event in status_events:
        if (
            not event.get("actor_user_id")
            or (event["tenant_id"], event["actor_user_id"]) not in member_pairs
        ):
            continue
        ts = parse_time(event.get("created_at"))
        if not ts:
            continue
        age = (now - ts).total_seconds()
        if age <= 7 * 86400:
            recent["7d"] += 1
            by_tenant_7[event["tenant_id"]] += 1
        if age <= 14 * 86400:
            recent["14d"] += 1
        if age <= 30 * 86400:
            recent["30d"] += 1
            by_tenant_30[event["tenant_id"]] += 1
            to_status_30[event.get("to_status")] += 1

    fresh = Counter()
    for tenant in public:
        ts = parse_time(tenant.get("last_menu_updated_at"))
        if not ts:
            fresh["unknown"] += 1
            continue
        age = (now - ts).total_seconds() / 86400
        if age <= 1:
            fresh["<=1d"] += 1
        elif age <= 3:
            fresh["<=3d"] += 1
        elif age <= 7:
            fresh["<=7d"] += 1
        elif age <= 14:
            fresh["<=14d"] += 1
        elif age <= 30:
            fresh["<=30d"] += 1
        else:
            fresh[">30d"] += 1

    follow_by_bar = Counter(f["tenant_id"] for f in follows)
    venue_by_bar = Counter(d["tenant_id"] for d in drink_venues)

    report = {
        "as_of": datetime.now().astimezone().isoformat(timespec="seconds"),
        "supply": {
            "public_active": len(public),
            "public_with_owner_staff": sum(1 for t in public if t["id"] in tenant_members),
            "public_without_owner_staff": len(public_without),
            "public_without_names": public_without,
            "public_freshness": dict(fresh),
            "ordering_enabled_names": [
                display_tenant(t)
                for t in tenants
                if t.get("ordering_enabled") and t.get("slug") != "__platform__"
            ],
        },
        "pos_recent": {
            "member_status_events": dict(recent),
            "active_maintainer_bars_7d": len(by_tenant_7),
            "active_maintainer_bars_30d": len(by_tenant_30),
            "top_7d": [
                {"name": display_tenant(tenant_by[tid]), "events": n}
                for tid, n in by_tenant_7.most_common(10)
            ],
            "status_mix_30d": dict(to_status_30),
        },
        "demand": {
            "follow_rows": len(follows),
            "followed_bars": len(follow_by_bar),
            "top_followed": [
                {"name": display_tenant(tenant_by[tid]), "follows": n}
                for tid, n in follow_by_bar.most_common(10)
                if tid in tenant_by
            ],
            "drink_venue_rows": len(drink_venues),
            "drink_venue_bars": len(venue_by_bar),
            "top_drink_venues": [
                {"name": display_tenant(tenant_by[tid]), "records": n}
                for tid, n in venue_by_bar.most_common(10)
                if tid in tenant_by
            ],
        },
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
