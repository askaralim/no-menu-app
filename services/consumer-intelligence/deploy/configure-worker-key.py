#!/usr/bin/env python3
"""Run interactively as root on ECS; never pass the key as a command argument."""
import base64
import getpass
import json
import os
import tempfile
from pathlib import Path


def main():
    if os.geteuid() != 0:
        raise ValueError('Run as root on the Shanghai ECS')
    target = Path('/etc/no-menu/consumer-intelligence-worker.env')
    current = target.read_text()
    key = getpass.getpass('Supabase legacy service_role JWT (hidden): ').strip()
    parts = key.split('.')
    if len(parts) != 3 or any(c.isspace() for c in key):
        raise ValueError('Use the legacy service_role JWT, not anon or an account password')
    claims = json.loads(base64.urlsafe_b64decode(parts[1] + '=' * (-len(parts[1]) % 4)))
    # This catches copying the wrong key; Supabase verifies authenticity on use.
    if claims.get('role') != 'service_role' or claims.get('ref') != 'agtujigvxxdppngirqtu':
        raise ValueError('Wrong key role or project')
    lines = [line for line in current.splitlines()
             if not line.startswith('SUPABASE_SERVICE_ROLE_KEY=')]
    lines.append('SUPABASE_SERVICE_ROLE_KEY=' + key)
    with tempfile.NamedTemporaryFile(mode='w', dir=str(target.parent),
                                     prefix='.ci-worker-', delete=False) as output:
        os.fchmod(output.fileno(), 0o600)
        output.write('\n'.join(lines) + '\n')
        output.flush()
        os.fsync(output.fileno())
        temporary = output.name
    os.replace(temporary, str(target))
    print('Saved to Worker configuration only. No service was started.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, EOFError):
        raise SystemExit('Not saved: check the key type, project and root terminal. No key is printed.')
