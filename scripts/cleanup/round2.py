"""Round-2 cleanup: build manifest for Tier 1 + Tier 3 + Tier 2 orphans, quarantine, verify."""
import os, json, shutil, sys, hashlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
QUAR = os.path.abspath(os.path.join(ROOT, '..', '.ezrab-cleanup-quarantine-round2-2026-10-05'))

# Explicitly preserved despite being "orphans" — browser convention / brand fallback
KEEP = {'public/favicon.ico', 'public/favicon.png'}

def size_of(p):
    if os.path.isfile(p):
        return os.path.getsize(p)
    if os.path.isdir(p):
        t = 0
        for dp, dn, fn in os.walk(p):
            for f in fn:
                try:
                    t += os.path.getsize(os.path.join(dp, f))
                except OSError:
                    pass
        return t
    return 0

def count_of(p):
    if os.path.isfile(p):
        return 1
    if os.path.isdir(p):
        n = 0
        for dp, dn, fn in os.walk(p):
            n += len(fn)
        return n
    return 0

def main():
    entries = []

    # --- TIER 1: regenerable ---
    entries.append(('dist', 'E_GENERATED', 'Vite build output; regenerate with `npm run build`.', 0.99))
    entries.append(('build.log', 'G_TEMPORARY', 'Build log at repo root.', 0.98))
    entries.append(('package.json.bak', 'I_OBSOLETE', 'Stale backup of package.json (package.json is authoritative).', 0.97))

    # --- TIER 1: python bytecode caches ---
    for base in ('EZRAB-LOCAL-AI/.python', 'EZRAB-LOCAL-AI/.venv'):
        for dp, dn, fn in os.walk(os.path.join(ROOT, base)):
            if os.path.basename(dp) == '__pycache__':
                rel = os.path.relpath(dp, ROOT).replace('\\', '/')
                entries.append((rel, 'F_CACHE', f'Python bytecode cache inside {base}; recompiled on import.', 0.98))

    # --- TIER 2: verified orphan assets ---
    orph = json.load(open(os.path.join(ROOT, 'scripts', 'cleanup', 'orphan_assets.json'), encoding='utf-8'))
    for o in orph['orphans']:
        if o['path'] in KEEP:
            continue
        entries.append((o['path'], 'K_ORPHAN', 'Exact-filename search across src/, server/, scripts/, docs/, index.html found 0 references (no import.meta.glob, no dynamic path).', 0.96))

    # --- TIER 3: git dangling temp objects ---
    for dp, dn, fn in os.walk(os.path.join(ROOT, '.git')):
        for f in fn:
            if f.startswith('tmp_obj_'):
                rel = os.path.relpath(os.path.join(dp, f), ROOT).replace('\\', '/')
                entries.append((rel, 'G_TEMPORARY', 'Dangling git temp object left by an interrupted object write; not a valid object name (git objects are 40-hex). Not history.', 0.97))

    # build manifest
    manifest, total = [], 0
    for path, cat, reason, conf in entries:
        ap = os.path.join(ROOT, path.replace('/', os.sep))
        if not os.path.exists(ap):
            continue
        s = size_of(ap)
        total += s
        manifest.append({'path': path, 'size_bytes': s, 'size_mb': round(s / 1048576, 3),
                         'files': count_of(ap), 'category': cat, 'reason': reason, 'confidence': conf})

    manifest.sort(key=lambda e: -e['size_bytes'])
    out = {'root': ROOT.replace('\\', '/'), 'generated_at': '2026-10-05', 'entry_count': len(manifest),
           'total_bytes': total, 'total_mb': round(total / 1048576, 2), 'preserved_despite_orphan': sorted(KEEP),
           'entries': manifest}
    with open(os.path.join(ROOT, 'scripts', 'cleanup', 'cleanup-manifest-round2.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1)

    print(f"ROUND-2 MANIFEST: {len(manifest)} entries, {out['total_mb']:,.2f} MB")
    by = {}
    for e in manifest:
        c = by.setdefault(e['category'], [0, 0])
        c[0] += 1
        c[1] += e['size_bytes']
    for k in sorted(by):
        print(f"  {k:<14} {by[k][0]:>4} entries  {by[k][1]/1048576:>10,.2f} MB")
    print(f"\npreserved despite orphan: {sorted(KEEP)}")

    # --- quarantine ---
    os.makedirs(QUAR, exist_ok=True)
    moved = 0; bytes_moved = 0; failed = []; log = []
    BATCH = 10
    for i in range(0, len(manifest), BATCH):
        batch = manifest[i:i + BATCH]
        for e in batch:
            src = os.path.join(ROOT, e['path'].replace('/', os.sep))
            if not os.path.exists(src):
                continue
            dst = os.path.join(QUAR, e['path'].replace('/', os.sep))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            try:
                shutil.move(src, dst)
                if (not os.path.exists(src)) and os.path.exists(dst):
                    moved += 1; bytes_moved += e['size_bytes']
                    log.append({'path': e['path'], 'size_bytes': e['size_bytes'], 'category': e['category']})
                else:
                    failed.append(e['path'])
            except Exception as ex:
                failed.append(f"{e['path']}: {ex}")
        print(f"  batch {i//BATCH+1}: ok")

    with open(os.path.join(ROOT, 'scripts', 'cleanup', 'quarantine-log-round2.json'), 'w', encoding='utf-8') as f:
        json.dump({'quarantine': QUAR.replace('\\', '/'), 'moved': moved,
                   'mb_moved': round(bytes_moved / 1048576, 2), 'failed': failed, 'log': log}, f, indent=1)

    print(f"\nMOVED {moved} entries, {bytes_moved/1048576:,.2f} MB -> {QUAR}")
    if failed:
        print("FAILED:", failed)
        sys.exit(1)

if __name__ == '__main__':
    main()
