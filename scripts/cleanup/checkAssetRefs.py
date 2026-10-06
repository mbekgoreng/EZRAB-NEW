"""Reference checker: for each asset under src/assets and public, search the codebase. Read-only."""
import os, json, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# Where references may live
CODE_DIRS = ['src', 'server', 'scripts', 'public', 'docs', 'supabase']
CODE_FILES = ['index.html', 'vite.config.ts', 'package.json', 'tsconfig.json']
EXTS = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.html', '.css', '.md', '.py', '.yaml', '.yml'}

ASSET_DIRS = ['src/assets', 'public']

def build_corpus():
    """Return list of (relpath, text) for searchable files."""
    corpus = []
    for d in CODE_DIRS:
        p = os.path.join(ROOT, d)
        if not os.path.isdir(p):
            continue
        for dp, dn, fn in os.walk(p):
            dn[:] = [x for x in dn if x not in {'.git', 'node_modules'}]
            for f in fn:
                ext = os.path.splitext(f)[1].lower()
                if ext not in EXTS:
                    continue
                fp = os.path.join(dp, f)
                try:
                    with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
                        corpus.append((os.path.relpath(fp, ROOT), fh.read()))
                except OSError:
                    continue
    for f in CODE_FILES:
        fp = os.path.join(ROOT, f)
        if os.path.isfile(fp):
            try:
                with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
                    corpus.append((f, fh.read()))
            except OSError:
                pass
    return corpus

def main():
    corpus = build_corpus()
    print(f"corpus files: {len(corpus)}")

    results = []
    for adir in ASSET_DIRS:
        base = os.path.join(ROOT, adir)
        if not os.path.isdir(base):
            continue
        for dp, dn, fn in os.walk(base):
            for f in fn:
                fp = os.path.join(dp, f)
                rel = os.path.relpath(fp, ROOT)
                size = os.path.getsize(fp)
                name = f
                stem = os.path.splitext(f)[0]
                hits = []
                for crel, text in corpus:
                    if crel == rel:
                        continue
                    if name in text or stem in text:
                        hits.append(crel)
                results.append({
                    'path': rel,
                    'size': size,
                    'mb': round(size / 1048576, 3),
                    'referenced_by': hits[:12],
                    'ref_count': len(hits),
                })

    results.sort(key=lambda r: -r['size'])
    out = os.path.join(ROOT, 'scripts', 'cleanup', 'asset_refs.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=1)

    print()
    print("=== ASSETS >= 1 MB ===")
    for r in results:
        if r['size'] >= 1024 * 1024:
            flag = 'REF' if r['ref_count'] else '*** UNREFERENCED ***'
            print(f"{r['mb']:>8,.2f} MB  [{r['ref_count']:>2} refs] {flag:<20} {r['path']}")

    unref = [r for r in results if r['ref_count'] == 0]
    print()
    print(f"=== UNREFERENCED ASSETS: {len(unref)} files, {sum(x['size'] for x in unref)/1048576:,.2f} MB ===")
    for r in unref:
        print(f"{r['mb']:>8,.2f} MB  {r['path']}")

if __name__ == '__main__':
    main()
