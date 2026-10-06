"""Forensic size scanner for EZRAB repository. Read-only."""
import os
import sys
import json
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

SKIP_DIRS = set()

def walk():
    """Yield (abspath, size)."""
    for dirpath, dirnames, filenames in os.walk(ROOT):
        # prune
        dirnames[:] = [d for d in dirnames if os.path.join(dirpath, d) not in SKIP_DIRS]
        for fn in filenames:
            p = os.path.join(dirpath, fn)
            try:
                st = os.stat(p)
            except OSError:
                continue
            yield p, st.st_size

def main():
    total = 0
    count = 0
    per_top = defaultdict(lambda: [0, 0])   # top-level dir -> [bytes, files]
    per_top2 = defaultdict(lambda: [0, 0])  # top-2 level
    all_files = []

    for p, size in walk():
        total += size
        count += 1
        rel = os.path.relpath(p, ROOT)
        parts = rel.split(os.sep)
        top = parts[0] if len(parts) > 1 else '(root files)'
        per_top[top][0] += size
        per_top[top][1] += 1
        if len(parts) > 1:
            key = parts[0] + '/' + parts[1]
        else:
            key = '(root files)'
        per_top2[key][0] += size
        per_top2[key][1] += 1
        all_files.append((size, rel))

    all_files.sort(reverse=True)

    out = {
        'root': ROOT,
        'total_bytes': total,
        'total_files': count,
        'total_gb': round(total / (1024**3), 4),
        'per_top': {k: {'bytes': v[0], 'files': v[1], 'mb': round(v[0]/(1024**2), 2)} for k, v in sorted(per_top.items(), key=lambda x: -x[1][0])},
        'per_top2': {k: {'bytes': v[0], 'files': v[1], 'mb': round(v[0]/(1024**2), 2)} for k, v in sorted(per_top2.items(), key=lambda x: -x[1][0])[:60]},
        'top300': [{'size': s, 'path': p, 'mb': round(s/(1024**2), 3)} for s, p in all_files[:300]],
    }

    outpath = os.path.join(ROOT, 'scripts', 'cleanup', 'scan_result.json')
    os.makedirs(os.path.dirname(outpath), exist_ok=True)
    with open(outpath, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1)

    print(f"TOTAL: {out['total_gb']} GB ({total} bytes) / {count} files")
    print()
    print("=== PER TOP-LEVEL (MB) ===")
    for k, v in list(out['per_top'].items())[:40]:
        print(f"{v['mb']:>12,.2f} MB  {v['files']:>7} files  {k}")

if __name__ == '__main__':
    main()
