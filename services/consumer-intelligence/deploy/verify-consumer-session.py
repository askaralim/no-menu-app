#!/usr/bin/env python3
"""Manual loopback smoke check. Never persist a consumer's access token."""
import argparse
import base64
import getpass
import json
import re
import sys
import time
import urllib.request
import uuid


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def consumer_token(token):
    # Input guard only; the API still verifies the token with Supabase Auth.
    try:
        parts = token.split('.')
        claims = json.loads(base64.urlsafe_b64decode(parts[1] + '=' * (-len(parts[1]) % 4)))
        return (len(parts) == 3 and claims.get('role') == 'authenticated'
                and bool(claims.get('sub')) and claims.get('exp', 0) > time.time())
    except (ValueError, IndexError, TypeError, AttributeError):
        return False


def request(token, method, path, payload=None):
    headers = {'Authorization': 'Bearer ' + token}
    data = None
    if payload is not None:
        headers['Content-Type'] = 'application/merge-patch+json'
        data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request('http://127.0.0.1:8791' + path,
                                 data=data, headers=headers, method=method)
    # Never forward the token through a proxy or a redirected endpoint.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(req, timeout=20) as response:
        if response.status != 200:
            raise ValueError('Unexpected status')
        return json.loads(response.read().decode('utf-8'))


def verify(token, city, call=request):
    profile_path = '/api/consumer/v1/profile'
    before = call(token, 'GET', profile_path)
    patched = call(token, 'PATCH', profile_path, {})
    after = call(token, 'GET', profile_path)
    fields = ('consumer_username', 'is_default', 'home_city_code')
    if not all(k in value for value in (before, patched, after) for k in fields):
        raise ValueError('Incomplete profile')
    if not all(before[k] == patched[k] == after[k] for k in fields):
        raise ValueError('Profile changed during verification')
    path = ('/api/feed/v1/new-beers?city_code=' + city
            + '&mode=for_you&surface=home&limit=2&feed_instance_id=' + str(uuid.uuid4()))
    feed = call(token, 'GET', path)
    status = feed.get('personalization', {}).get('status')
    if (feed.get('mode') != 'for_you' or feed.get('city_code') != city
            or status not in ('eligible', 'cold_start') or not isinstance(feed.get('items'), list)):
        raise ValueError('Unexpected feed response')
    # Allowlist output: no username, user ID, token, instance or item payload.
    return {'profile_read': 'passed', 'empty_patch_preserved_profile': 'passed',
            'authenticated_feed': 'passed', 'personalization': status,
            'snapshot_state': (feed.get('snapshot') or {}).get('state'),
            'item_count': len(feed['items'])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--city-code', default='shanghai')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z][a-z0-9_-]{0,63}', args.city_code):
        parser.error('Invalid city code')
    if not sys.stdin.isatty():
        print('Run interactively in the ECS terminal; do not pass tokens as arguments.')
        return 2
    print('Uses GET Profile, PATCH {}, GET Profile, and For You (one saved Feed instance).')
    print('No city/username change, analytics events, identity links, or token files.')
    try:
        token = getpass.getpass('Consumer access token (hidden; not service_role/refresh token): ').strip()
        if not consumer_token(token):
            print('Rejected: provide an unexpired consumer access token.')
            return 2
        print(json.dumps(verify(token, args.city_code)))
        return 0
    except (Exception, KeyboardInterrupt):
        # Upstream errors and response bodies may contain private information.
        print('Verification incomplete. Check session expiry and server request-status logs; no token saved.')
        return 1


if __name__ == '__main__':
    sys.exit(main())
