#!/usr/bin/env python3
"""Independent systemd check; report one health gauge using the ECS RAM role.

Never log subprocess output: database and cloud errors can contain credentials.
No data leaves ECS except a 0/1 gauge and fixed service/environment dimensions.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request


def run(command, timeout):
    return subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          universal_newlines=True, timeout=timeout, check=False)


def check_health():
    checks = {}
    try:
        result = run(['/opt/node26/bin/node', 'src/ops-check.js'], 20)
        report = json.loads(result.stdout)
        checks['projections'] = result.returncode == 0 and report.get('status') == 'ok'
        checks['refresh_queue'] = report.get('refresh_queue', {}).get('attention_required') is False
    except (OSError, ValueError, subprocess.TimeoutExpired):
        checks['projections'] = False
        checks['refresh_queue'] = False
    try:
        # The loopback probe must not use HTTP proxy environment settings.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open('http://127.0.0.1:8791/readyz', timeout=3) as response:
            checks['api_ready'] = response.status == 200 and json.load(response).get('status') == 'ready'
    except (OSError, ValueError):
        checks['api_ready'] = False
    for name, command, expected in [
        ('worker_timer', ['systemctl', 'is-active', 'consumer-intelligence-worker.timer'], 'active'),
        ('worker_result', ['systemctl', 'show', 'consumer-intelligence-worker.service', '--property=Result', '--value'], 'success'),
    ]:
        try:
            result = run(command, 3)
            checks[name] = result.returncode == 0 and result.stdout.strip() == expected
        except (OSError, subprocess.TimeoutExpired):
            checks[name] = False
    return checks


def report_health(healthy, role):
    value = int(healthy)
    # The deployed CLI/API rejects Type=1 aggregates. Raw-value reporting works,
    # but requires an account/billing check before enabling the timer.
    values = {'value': value}
    command = [
        '/usr/local/bin/aliyun', 'cms', 'PutCustomMetric',
        '--config-path', 'deploy/cloudmonitor-cli.json',
        '--mode', 'EcsRamRole', '--ram-role-name', role, '--region', 'cn-shanghai', '--secure',
        '--connect-timeout', '3', '--read-timeout', '5', '--retry-count', '0',
        '--MetricList.1.MetricName', 'nomenu_ci_health', '--MetricList.1.GroupId', '0',
        '--MetricList.1.Type', '0',
        '--MetricList.1.Time', str(int(time.time() * 1000)),
        '--MetricList.1.Dimensions', json.dumps({'service': 'consumer-intelligence', 'environment': 'production'}),
        '--MetricList.1.Values', json.dumps(values),
    ]
    try:
        result = run(command, 12)
        response = json.loads(result.stdout)
        # CLI exit code alone is insufficient; 206 is partial failure.
        return result.returncode == 0 and isinstance(response, dict) and str(response.get('Code')) == '200'
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return False


def main():
    check_only = sys.argv[1:] == ['--check-only']
    if sys.argv[1:] and not check_only:
        print(json.dumps({'code': 'INVALID_ARGUMENTS'}))
        return 2
    checks = check_health()
    healthy = all(checks.values())
    output = {'status': 'ok' if healthy else 'degraded', 'checks': checks}
    if check_only:
        output['cloudmonitor'] = 'not_attempted'
        print(json.dumps(output))
        return 0 if healthy else 1
    role = os.environ.get('CI_CLOUDMONITOR_ROLE', '')
    sent = bool(role) and report_health(healthy, role)
    output['cloudmonitor'] = 'accepted' if sent else 'failed'
    print(json.dumps(output))
    return (0 if healthy else 1) if sent else 2


if __name__ == '__main__':
    sys.exit(main())
