"""Duplicate detector via SHA256, size-grouped for speed. Read-only."""
import os, json, hashlib
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SKIP = {'.git'}
MIN_SIZE = 50 * 1024  # only consider >= 50 KB

def collect():
    by_size = defaultdict(list)
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP]
        for f in fn:
            p = os.path.join(dp, f)
            try:
                s = os.path.getsize(p)
            except OSError:
                continue
            if s >= MIN_SIZE:
                by_size[s].append(p)
    return by_size

def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

def main():
    by_size = collect()
    dup_groups = []
    for size, paths in by_size.items():
        if len(paths) < 2:
            continue
        by_hash = defaultdict(list)
        for p in paths:
            try:
                by_hash[sha256(p)].append(p)
            except OSError:
                continue
        for h, ps in by_hash.items():
            if len(ps) > 1:
                dup_groups.append({'size': size, 'hash': h, 'paths': [os.path.relpath(x, ROOT) for x in ps]})

    dup_groups.sort(key=lambda g: -g['size'] * (len(g['paths']) - 1))
    wasted = sum(g['size'] * (len(g['paths']) - 1) for g in dup_groups)

    out = {'root': ROOT, 'min_size': MIN_SIZE, 'groups': dup_groups,
           'total_wasted_bytes': wasted, 'total_wasted_mb': round(wasted / 1048576, 2)}
    with open(os.path.join(ROOT, 'scripts', 'cleanup', 'duplicates.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1)

    print(f"DUPLICATE GROUPS: {len(dup_groups)}  |  RECLAIMABLE: {out['total_wasted_mb']:,.2f} MB")
    print()
    for g in dup_groups[:60]:
        print(f"{g['size']/1048576:>8,.2f} MB x{len(g['paths'])}  {g['hash'][:12]}")
        for p in g['paths']:
            print(f"           {p}")
        print()

if __name__ == '__main__':
    main()
