import json
import re
import subprocess
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime


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
        return json.loads(response.read().decode("utf-8")), dict(response.headers)


def fetch_table(table, columns):
    rows = []
    offset = 0
    page_size = 1000
    while True:
        query = urllib.parse.urlencode({"select": columns})
        page, _ = get_json(
            f"{BASE_URL}/rest/v1/{table}?{query}",
            {"Range": f"{offset}-{offset + page_size - 1}"},
        )
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows


def fetch_auth_users():
    users = []
    page = 1
    while True:
        payload, _ = get_json(
            f"{BASE_URL}/auth/v1/admin/users?page={page}&per_page=1000"
        )
        batch = payload.get("users", payload if isinstance(payload, list) else [])
        users.extend(batch)
        if len(batch) < 1000:
            break
        page += 1
    return users


def parse_time(value):
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    match = re.match(r"^(.*\.)(\d+)([+-]\d\d:\d\d)$", normalized)
    if match:
        fraction = (match.group(2) + "000000")[:6]
        normalized = f"{match.group(1)}{fraction}{match.group(3)}"
    return datetime.fromisoformat(normalized)


def has_apple_identity(user):
    if any(i.get("provider") == "apple" for i in user.get("identities") or []):
        return True
    app_metadata = user.get("app_metadata") or {}
    return app_metadata.get("provider") == "apple" or "apple" in (app_metadata.get("providers") or [])


def display_tenant(tenant):
    return (tenant.get("display_name") or tenant.get("name") or tenant.get("slug") or "未命名门店").strip()


def main():
    users = fetch_auth_users()
    user_by_id = {u["id"]: u for u in users}

    tenants = fetch_table(
        "tenants",
        "id,name,display_name,slug,status,is_public_visible,ordering_enabled,owner_claimed_at,last_menu_updated_at",
    )
    tenant_by_id = {t["id"]: t for t in tenants}
    roles = fetch_table("user_roles", "user_id,tenant_id,role,created_at")
    status_events = fetch_table(
        "drink_status_events", "tenant_id,actor_user_id,created_at,to_status"
    )
    audit_events = fetch_table(
        "audit_events", "tenant_id,actor_user_id,event_type,created_at"
    )
    profiles = fetch_table(
        "user_profiles",
        "user_id,consumer_username,consumer_username_is_default,created_at,updated_at",
    )
    follows = fetch_table(
        "user_bar_follows", "user_id,tenant_id,notify_new_taps,created_at"
    )
    drink_lights = fetch_table(
        "user_drink_lights", "id,user_id,product_id,provisional_drink_id,first_lit_at"
    )
    drink_venues = fetch_table(
        "user_drink_venues", "user_id,tenant_id,light_id,first_drank_at"
    )

    merchant_roles = [
        r
        for r in roles
        if r.get("role") in ("owner", "staff")
        and tenant_by_id.get(r.get("tenant_id"), {}).get("slug") != "__platform__"
    ]
    member_pairs = {(r["tenant_id"], r["user_id"]) for r in merchant_roles}
    tenant_member_roles = defaultdict(list)
    for role in merchant_roles:
        tenant_member_roles[role["tenant_id"]].append(role)

    logged_in_tenant_ids = {
        tenant_id
        for tenant_id, member_rows in tenant_member_roles.items()
        if any(user_by_id.get(r["user_id"], {}).get("last_sign_in_at") for r in member_rows)
    }

    strict_maintained_tenant_ids = {
        event["tenant_id"]
        for event in status_events
        if event.get("actor_user_id")
        and (event["tenant_id"], event["actor_user_id"]) in member_pairs
    }
    strict_logged_in_tenant_ids = strict_maintained_tenant_ids & logged_in_tenant_ids

    member_audit_tenant_ids = {
        event["tenant_id"]
        for event in audit_events
        if event.get("tenant_id")
        and event.get("actor_user_id")
        and (event["tenant_id"], event["actor_user_id"]) in member_pairs
        and event.get("event_type")
        in ("tenant_published", "tenant_unpublished", "tenant_public_price_mode_changed")
    }

    inferred_after_claim = set()
    for tenant_id in logged_in_tenant_ids:
        tenant = tenant_by_id[tenant_id]
        menu_time = parse_time(tenant.get("last_menu_updated_at"))
        role_times = [
            parse_time(r.get("created_at"))
            for r in tenant_member_roles[tenant_id]
            if parse_time(r.get("created_at"))
        ]
        if menu_time and role_times and menu_time >= min(role_times):
            inferred_after_claim.add(tenant_id)

    broad_tenant_ids = logged_in_tenant_ids & (
        strict_maintained_tenant_ids | member_audit_tenant_ids | inferred_after_claim
    )

    apple_user_ids = {u["id"] for u in users if has_apple_identity(u)}
    apple_signed_in_user_ids = {
        u["id"] for u in users if has_apple_identity(u) and u.get("last_sign_in_at")
    }
    anonymous_user_ids = {u["id"] for u in users if u.get("is_anonymous") is True}
    custom_name_user_ids = {
        p["user_id"]
        for p in profiles
        if p.get("consumer_username")
        and p.get("consumer_username_is_default") is False
    }
    profile_user_ids = {p["user_id"] for p in profiles if p.get("consumer_username")}
    follow_user_ids = {f["user_id"] for f in follows}
    notified_follow_user_ids = {
        f["user_id"] for f in follows if f.get("notify_new_taps") is True
    }
    drink_user_ids = {d["user_id"] for d in drink_lights}
    venue_user_ids = {d["user_id"] for d in drink_venues}
    consumer_observed_user_ids = (
        apple_user_ids | anonymous_user_ids | profile_user_ids | follow_user_ids | drink_user_ids
    )
    engaged_user_ids = custom_name_user_ids | follow_user_ids | drink_user_ids

    report = {
        "as_of": datetime.now().astimezone().isoformat(timespec="seconds"),
        "pos": {
            "merchant_tenants_with_owner_or_staff": len(tenant_member_roles),
            "merchant_users": len({r["user_id"] for r in merchant_roles}),
            "tenants_with_member_logged_in": len(logged_in_tenant_ids),
            "strict_self_maintained_tenants": len(strict_logged_in_tenant_ids),
            "strict_self_maintained_names": sorted(
                display_tenant(tenant_by_id[x]) for x in strict_logged_in_tenant_ids
            ),
            "strict_status_events": sum(
                1
                for event in status_events
                if event.get("actor_user_id")
                and (event["tenant_id"], event["actor_user_id"]) in member_pairs
            ),
            "member_public_setting_tenants": len(member_audit_tenant_ids),
            "broad_likely_self_maintained_tenants": len(broad_tenant_ids),
            "broad_likely_names": sorted(
                display_tenant(tenant_by_id[x]) for x in broad_tenant_ids
            ),
            "ordering_enabled_tenants": sum(
                1
                for tenant_id in tenant_member_roles
                if tenant_by_id[tenant_id].get("ordering_enabled") is True
            ),
        },
        "taplist": {
            "auth_users_total": len(users),
            "observed_consumer_accounts": len(consumer_observed_user_ids),
            "anonymous_accounts_current": len(anonymous_user_ids),
            "apple_linked_users": len(apple_user_ids),
            "apple_linked_and_signed_in": len(apple_signed_in_user_ids),
            "custom_username_users": len(custom_name_user_ids),
            "follow_users": len(follow_user_ids),
            "follow_rows": len(follows),
            "followed_bars": len({f["tenant_id"] for f in follows}),
            "notification_enabled_users": len(notified_follow_user_ids),
            "drink_checkin_users": len(drink_user_ids),
            "unique_user_drinks": len(drink_lights),
            "venue_checkin_users": len(venue_user_ids),
            "unique_user_drink_venues": len(drink_venues),
            "engaged_users_any_name_follow_checkin": len(engaged_user_ids),
            "apple_and_custom_name": len(apple_user_ids & custom_name_user_ids),
            "apple_and_follow": len(apple_user_ids & follow_user_ids),
            "apple_and_checkin": len(apple_user_ids & drink_user_ids),
            "apple_name_follow_checkin_all": len(
                apple_user_ids & custom_name_user_ids & follow_user_ids & drink_user_ids
            ),
        },
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
