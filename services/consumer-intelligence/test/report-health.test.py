import importlib.util
import io
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('health', Path(__file__).resolve().parents[1] / 'deploy/report-health.py')
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)


def result(stdout, code=0):
    return subprocess.CompletedProcess([], code, stdout, 'sensitive diagnostic must not be logged')


class Response(io.StringIO):
    status = 200


class HealthTests(unittest.TestCase):
    def check(self, ops=None, timer='active', worker='success', api_error=None):
        ops = ops or result('{"status":"ok","refresh_queue":{"attention_required":false}}')
        with patch.object(health, 'run', side_effect=[ops, result(timer), result(worker)]), \
                patch.object(health.urllib.request, 'build_opener') as opener:
            if api_error:
                opener.return_value.open.side_effect = api_error
            else:
                opener.return_value.open.return_value = Response('{"status":"ready"}')
            return health.check_health()

    def test_healthy(self):
        self.assertTrue(all(self.check().values()))

    def test_stale_and_failed_checks(self):
        for ops in [result('{"status":"degraded"}', 1), result('private error', 2),
                    subprocess.TimeoutExpired('node', 20)]:
            with self.subTest(ops=ops):
                self.assertFalse(self.check(ops=ops)['projections'])

    def test_pending_queue(self):
        checks = self.check(ops=result('{"status":"ok","refresh_queue":{"attention_required":true}}'))
        self.assertTrue(checks['projections'])
        self.assertFalse(checks['refresh_queue'])

    def test_worker_and_api_failures(self):
        self.assertFalse(self.check(timer='inactive')['worker_timer'])
        self.assertFalse(self.check(worker='exit-code')['worker_result'])
        self.assertFalse(self.check(api_error=OSError('unreachable'))['api_ready'])

    def test_upload_is_single_gauge_and_role_based(self):
        for healthy in [True, False]:
            with patch.object(health, 'run', return_value=result('{"Code":"200"}')) as run:
                self.assertTrue(health.report_health(healthy, 'test-role'))
                args = run.call_args[0][0]
                self.assertEqual(args[args.index('--mode') + 1], 'EcsRamRole')
                self.assertEqual(args[args.index('--MetricList.1.Type') + 1], '0')
                values = json.loads(args[args.index('--MetricList.1.Values') + 1])
                self.assertEqual(values, {'value': int(healthy)})

    def test_upload_failure_never_claims_success(self):
        for response in [result('{"Code":"206"}'), result('{"Code":"500"}'),
                         result('{"Code":"200"}', 1), result('bad response'),
                         subprocess.TimeoutExpired('aliyun', 12)]:
            with self.subTest(response=response), patch.object(health, 'run', side_effect=[response]):
                self.assertFalse(health.report_health(True, 'test-role'))

    def test_degraded_still_uploads_zero_and_logs_no_secrets(self):
        with patch.object(health.sys, 'argv', ['report-health.py']), \
                patch.dict(health.os.environ, {'CI_CLOUDMONITOR_ROLE': 'test-role'}), \
                patch.object(health, 'check_health', return_value={'projections': False}), \
                patch.object(health, 'report_health', return_value=True) as report, \
                patch('sys.stdout', new_callable=io.StringIO) as output:
            self.assertEqual(health.main(), 1)
            report.assert_called_once_with(False, 'test-role')
            self.assertEqual(json.loads(output.getvalue())['cloudmonitor'], 'accepted')

    def test_missing_role_fails_without_upload(self):
        with patch.object(health.sys, 'argv', ['report-health.py']), \
                patch.dict(health.os.environ, {}, clear=True), \
                patch.object(health, 'check_health', return_value={'projections': True}), \
                patch.object(health, 'report_health') as report, \
                patch('sys.stdout', new_callable=io.StringIO):
            self.assertEqual(health.main(), 2)
            report.assert_not_called()

    def test_check_only_never_uploads(self):
        with patch.object(health.sys, 'argv', ['report-health.py', '--check-only']), \
                patch.object(health, 'check_health', return_value={'projections': True}), \
                patch.object(health, 'report_health') as report, \
                patch('sys.stdout', new_callable=io.StringIO):
            self.assertEqual(health.main(), 0)
            report.assert_not_called()


if __name__ == '__main__':
    unittest.main()
