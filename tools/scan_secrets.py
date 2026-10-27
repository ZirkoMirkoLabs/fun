"""Dependency-free secret guard. Never prints matched secret values.

Default: working tree (including ignored files, excluding Git/dependency caches).
--staged: scan the complete Git index, not working-tree versions.
--history: scan git log -p AND every reachable historical blob/path on all refs.
Hooks are a guardrail, not a guarantee: Git permits --no-verify.
"""
import argparse
import re
import subprocess
from pathlib import Path

SKIP = {'.git', 'node_modules', '.wrangler', '__pycache__', '.venv', 'venv'}
PATTERNS = {
    'private key': rb'-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----',
    'GitHub token': rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b',
    'AWS access key': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'Google API key': rb'\bAIza[0-9A-Za-z_-]{35}\b',
    'Stripe live key': rb'\b[rs]k_live_[0-9A-Za-z]{16,}\b',
    'Slack token': rb'\bxox[baprs]-[0-9A-Za-z-]{20,}\b',
    'OpenAI/Anthropic key': rb'\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{32,}\b',
    'credential in URL': rb'https?://[^\s/:<>"\']+:[^\s/@<>"\']{5,}@',
    'assigned credential': rb'''(?i)["']?(?:[a-z0-9_]*api[_-]?key|[a-z0-9_]*api[_-]?token|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret|token|secret[_-]?key)["']?\s*[:=]\s*["']([A-Za-z0-9_+/=-]{20,})["']''',
}
COMPILED = {name: re.compile(pattern) for name, pattern in PATTERNS.items()}


def forbidden_path(name):
    parts = Path(name).parts
    return any(p.lower() == '.env' or p.lower().startswith('.env.') or
               p.lower() == '.dev.vars' or p.lower().startswith('.dev.vars.') or
               p.lower() in {'id_rsa', 'id_ed25519', 'credentials.json', 'service-account.json'} or
               p.lower().endswith(('.pem', '.key', '.p12', '.pfx')) for p in parts)


def findings(name, data):
    issues = [f'{name}: forbidden credential file'] if forbidden_path(name) else []
    for label, pattern in COMPILED.items():
        if pattern.search(data):
            issues.append(f'{name}: possible {label} (value redacted)')
    return issues


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])


def scan_worktree(root):
    issues = []
    # Path.walk lets us prune caches, but Python 3.10 is also supported.
    import os
    for folder, dirs, files in os.walk(root, followlinks=False):
        for directory in dirs:
            path = Path(folder) / directory
            if directory not in SKIP and path.is_symlink():
                issues.append(f'{path.relative_to(root)}: symlink directories are not allowed')
        dirs[:] = [d for d in dirs if d not in SKIP]
        for name in files:
            path = Path(folder) / name
            rel = path.relative_to(root).as_posix()
            if path.is_symlink():
                issues.append(f'{rel}: symlinks are not allowed')
            else:
                issues.extend(findings(rel, path.read_bytes()))
    return issues


def scan_index(root):
    issues = []
    # Scan all staged blobs, including files whose worktree copy was cleaned later.
    for entry in git(root, 'ls-files', '--stage', '-z').split(b'\0'):
        if not entry:
            continue
        meta, raw = entry.split(b'\t', 1)
        mode, oid, stage = meta.split()
        name = raw.decode('utf-8', 'replace')
        if mode in {b'120000', b'160000'} or stage != b'0':
            issues.append(f'{name}: symlink, submodule or unresolved index entry')
        issues.extend(findings(name, git(root, 'cat-file', 'blob', oid.decode())))
    return issues


def scan_history(root):
    issues = findings('git log --all -p', git(root, 'log', '--all', '-p', '--no-ext-diff', '--format=fuller'))
    objects = git(root, 'rev-list', '--objects', '--all').splitlines()
    blobs = 0
    for entry in objects:
        oid, _, raw = entry.partition(b' ')
        if git(root, 'cat-file', '-t', oid.decode()).strip() != b'blob':
            continue
        blobs += 1
        name = raw.decode('utf-8', 'replace')
        issues.extend(findings(f'history {oid.decode()[:12]} {name}', git(root, 'cat-file', 'blob', oid.decode())))
    print(f'History: {blobs} reachable blobs plus all commit patches checked')
    return issues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--staged', action='store_true')
    parser.add_argument('--history', action='store_true')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    issues = scan_index(args.root) if args.staged else scan_worktree(args.root)
    if args.history:
        issues += scan_history(args.root)
    for issue in sorted(set(issues)):
        print(issue)
    print(f'Secret scan: {len(set(issues))} finding(s); no secret values printed')
    return bool(issues)


if __name__ == '__main__':
    raise SystemExit(main())
