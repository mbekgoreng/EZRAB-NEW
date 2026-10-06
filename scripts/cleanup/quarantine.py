"""Move manifest entries to a quarantine folder OUTSIDE the repo (same volume => instant).
Batches of 10 with verification. Writes a move log for restore."""
import os, json, shutil, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
QUAR = os.path.abspath(os.path.join(ROOT, '..', '.ezrab-cleanup-quarantine-2026-10-04'))
BATCH = 10

def main():
    manifest = json.load(open(os.path.join(ROOT, 'scripts', 'cleanup', 'cleanup-manifest-before-delete.json'), encoding='utf-8'))
    entries = [e for e in manifest['entries'] if e['confidence'] >= 0.95]
    os.makedirs(QUAR, exist_ok=True)

    log = []
    moved = 0
    failed = []
    bytes_moved = 0

    for i in range(0, len(entries), BATCH):
        batch = entries[i:i + BATCH]
        print(f"--- BATCH {i//BATCH + 1} ({len(batch)} entries) ---")
        for e in batch:
            src = os.path.join(ROOT, e['path'].replace('/', os.sep))
            if not os.path.exists(src):
                print(f"   SKIP (missing): {e['path']}")
                continue
            dst = os.path.join(QUAR, e['path'].replace('/', os.sep))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            try:
                shutil.move(src, dst)
                ok = (not os.path.exists(src)) and os.path.exists(dst)
                if ok:
                    moved += 1
                    bytes_moved += e['size_bytes']
                    log.append({'path': e['path'], 'size_bytes': e['size_bytes'], 'category': e['category'], 'quarantined_to': dst.replace('\\', '/'), 'moved': True})
                    print(f"   MOVED  {e['size_mb']:>9,.3f} MB  {e['path']}")
                else:
                    failed.append(e['path'])
                    print(f"   FAIL(verify) {e['path']}")
            except Exception as ex:
                failed.append(e['path'])
                print(f"   FAIL {e['path']}: {ex}")
        # verify batch
        missing_ok = all(not os.path.exists(os.path.join(ROOT, e['path'].replace('/', os.sep))) for e in batch)
        print(f"   batch verify: {'OK' if missing_ok else 'PROBLEM'}")

    out = {'quarantine': QUAR.replace('\\', '/'), 'moved': moved, 'bytes_moved': bytes_moved,
           'mb_moved': round(bytes_moved / 1048576, 2), 'failed': failed, 'log': log}
    with open(os.path.join(ROOT, 'scripts', 'cleanup', 'quarantine-log.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1)

    print()
    print(f"MOVED {moved} entries, {out['mb_moved']:,.2f} MB -> {QUAR}")
    if failed:
        print(f"FAILED: {failed}")
        sys.exit(1)

if __name__ == '__main__':
    main()
