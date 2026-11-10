"""Install outside candidate releases, with an independently managed, read-only digest allowlist."""
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys


def fingerprint(root):
    # Node resolves code from these trees. npm links must stay within the dependency tree.
    root = root.resolve(strict=True)
    h = hashlib.sha256()
    for name in ('src', 'contracts/schemas', 'node_modules', 'package.json', 'package-lock.json'):
        top = root / name
        if top.is_symlink() or not top.exists():
            raise ValueError('incomplete reader artifact')
        for p in sorted(top.rglob('*')) if top.is_dir() else [top]:
            if p.is_symlink():
                target = p.resolve(strict=True)
                if top not in target.parents or not target.is_file():
                    raise ValueError('external reader symlink')
                content = b'link:' + os.readlink(p).encode()
            elif p.is_file():
                content = p.read_bytes()
            elif p.is_dir():
                continue
            else:
                raise ValueError('invalid reader artifact')
            h.update(str(p.relative_to(root)).encode() + b'\0' + hashlib.sha256(content).digest())
    return h.hexdigest()


def main():
    a = argparse.ArgumentParser()
    a.add_argument('root', type=Path)
    a.add_argument('allowlist', type=Path)
    a.add_argument('action', choices=('check', 'api', 'worker'))
    a.add_argument('--node', default='/opt/node26/bin/node')
    args = a.parse_args()
    root = args.root.resolve(strict=True)
    try:
        # Never generate or update this list during launch. A capability label in the target is insufficient.
        if fingerprint(root) not in args.allowlist.read_text().splitlines():
            raise ValueError('reader below trusted rollback floor')
        os.chdir(root)
        subprocess.run([args.node, 'src/e1/preflight.js'], check=True)
        if args.action != 'check':
            entry = 'src/server.js' if args.action == 'api' else 'src/worker.js'
            os.execv(args.node, [args.node, entry])
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print('E1 reader preflight denied:', exc, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
