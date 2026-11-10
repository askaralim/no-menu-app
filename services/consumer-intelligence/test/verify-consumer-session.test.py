import base64
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import time
import unittest
from unittest.mock import patch
from urllib.parse import parse_qsl, urlsplit

spec = importlib.util.spec_from_file_location('verify_session', Path(__file__).resolve().parents[1] / 'deploy/verify-consumer-session.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def token(role='authenticated', expiry=None):
    claims = {'sub': 'test-user', 'role': role, 'exp': expiry or time.time() + 300}
    body = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
    return 'header.' + body + '.signature'


class SessionCheckTest(unittest.TestCase):
    def test_rejects_privileged_expired_and_malformed_inputs(self):
        self.assertTrue(module.consumer_token(token()))
        for value in (token('service_role'), token('anon'), token(expiry=1), '', 'refresh-token', 'a.e30.c'):
            self.assertFalse(module.consumer_token(value))

    def test_noop_patch_and_feed_output_does_not_leak_private_fields(self):
        calls = []
        profile = {'consumer_username': 'private-name', 'is_default': False, 'home_city_code': None}
        def call(secret, method, path, payload=None):
            calls.append((method, path, payload))
            if path.endswith('/profile'):
                return dict(profile)
            return {'mode': 'for_you', 'city_code': 'shanghai', 'personalization': {'status': 'eligible'},
                    'snapshot': {'state': 'fresh'}, 'items': [{'beer_name': 'private-item'}]}
        result = module.verify('private-token', 'shanghai', call)
        self.assertEqual([c[0] for c in calls], ['GET', 'PATCH', 'GET', 'GET'])
        self.assertEqual(calls[1][2], {})
        self.assertEqual(result['item_count'], 1)
        self.assertNotIn('private', json.dumps(result))
        self.assertNotIn('analytics', calls[-1][1])
        # Validate the emitted request with the API's actual shared schema;
        # a permissive HTTP stub alone misses invalid surface/limit values.
        query = dict(parse_qsl(urlsplit(calls[-1][1]).query))
        query['limit'] = int(query['limit'])
        checked = subprocess.run(['node', '--input-type=module', '-e',
            "import {readFileSync} from 'node:fs'; import {valid} from './src/schema.js'; "
            "process.exit(valid('feed/request.schema.json', JSON.parse(readFileSync(0,'utf8'))) ? 0 : 1)"],
            input=json.dumps(query), universal_newlines=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=str(Path(__file__).resolve().parents[1]), timeout=15)
        self.assertEqual(checked.returncode, 0, 'Smoke request violates the shared Feed contract')

    def test_profile_change_fails_before_creating_feed_instance(self):
        count = [0]
        def call(*args):
            count[0] += 1
            return {'consumer_username': 'same', 'is_default': False,
                    'home_city_code': None if count[0] == 1 else 'shanghai'}
        with self.assertRaises(ValueError):
            module.verify('token', 'shanghai', call)
        self.assertEqual(count[0], 3)

    def test_refuses_redirect(self):
        self.assertIsNone(module.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.invalid'))

    def test_noninteractive_use_never_reads_token(self):
        with patch.object(module.sys, 'argv', ['verify']), patch.object(module.sys.stdin, 'isatty', return_value=False), patch.object(module.getpass, 'getpass') as prompt, patch('sys.stdout', new_callable=io.StringIO):
            self.assertEqual(module.main(), 2)
            prompt.assert_not_called()

    def test_failure_does_not_print_exception_or_token(self):
        with patch.object(module.sys, 'argv', ['verify']), patch.object(module.sys.stdin, 'isatty', return_value=True), patch.object(module.getpass, 'getpass', return_value=token()), patch.object(module, 'verify', side_effect=ValueError('secret-response-token')), patch('sys.stdout', new_callable=io.StringIO) as output:
            self.assertEqual(module.main(), 1)
            self.assertNotIn('secret-response-token', output.getvalue())


if __name__ == '__main__':
    unittest.main()
