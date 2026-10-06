"""Precise (exact-filename) orphan detector for src/assets and public. Read-only."""
import os, json

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SEARCH_DIRS = ['src', 'server', 'scripts', 'docs', 'supabase']
SEARCH_FILES = ['index.html', 'vite.config.ts', 'package.json']
EXTS = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.html', '.css', '.md', '.py', '.yaml', '.yml', '.toml'}
SCAN_DIRS = ['src/assets', 'public']

def corpus():
    out = []
    for d in SEARCH_DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for dp, dn, fn in os.walk(base):
            dn[:] = [x for x in dn if x not in {'.git', 'node_modules'}]
            # exclude our own scan output (it lists every filename -> false negatives)
            if 'cleanup' in dp.replace('\\', '/').split('/'):
                continue
            for f in fn:
                if os.path.splitext(f)[1].lower() not in EXTS:
                    continue
                p = os.path.join(dp, f)
                try:
                    with open(p, 'r', encoding='utf-8', errors='ignore') as fh:
                        out.append((os.path.relpath(p, ROOT), fh.read()))
                except OSError:
                    pass
    for f in SEARCH_FILES:
        p = os.path.join(ROOT, f)
        if os.path.isfile(p):
            try:
                with open(p, 'r', encoding='utf-8', errors='ignore') as fh:
                    out.append((f, fh.read()))
            except OSError:
                pass
    return out

def main():
    cp = corpus()
    orphans = []
    for sd in SCAN_DIRS:
        base = os.path.join(ROOT, sd)
        if not os.path.isdir(base):
            continue
        for dp, dn, fn in os.walk(base):
            for f in fn:
                p = os.path.join(dp, f)
                rel = os.path.relpath(p, ROOT)
                # EXACT filename match only
                hits = [c for c, t in cp if c != rel and f in t]
                if not hits:
                    orphans.append({'path': rel.replace('\\', '/'), 'size': os.path.getsize(p)})

    orphans.sort(key=lambda o: -o['size'])
    total = sum(o['size'] for o in orphans)
    with open(os.path.join(ROOT, 'scripts', 'cleanup', 'orphan_assets.json'), 'w', encoding='utf-8') as fh:
        json.dump({'total_bytes': total, 'count': len(orphans), 'orphans': orphans}, fh, indent=1)

    print(f"EXACT-MATCH ORPHANS: {len(orphans)} files, {total/1048576:,.2f} MB")
    print()
    for o in orphans:
        print(f"{o['size']/1048576:>8,.3f} MB  {o['path']}")

if __name__ == '__main__':
    main()
