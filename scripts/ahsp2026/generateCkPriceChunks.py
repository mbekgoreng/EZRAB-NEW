#!/usr/bin/env python3
"""
Regenerate the chunked Cipta Karya runtime price modules from canonical data.

CANONICAL SOURCE
    data/ahsp2026/excel_extracted/upah_bahan.json
    (Sheet "Upah Bahan", SE Bina Konstruksi No. 47/SE/Dk/2026 Cipta Karya
    workbook. Cross-checked against data/ahsp2026/validated/ahsp_2026_hsd_ck.json,
    which carries the same rows plus sourceSheet/sourceRow provenance.)

GENERATED OUTPUT (never edit by hand)
    src/data/nationalCostDatabase/ckPriceChunks/labor.ts
    src/data/nationalCostDatabase/ckPriceChunks/equipment.ts
    src/data/nationalCostDatabase/ckPriceChunks/materials00.ts
    src/data/nationalCostDatabase/ckPriceChunks/materials01.ts
    src/data/nationalCostDatabase/ckPriceChunks/materials02.ts
    src/data/nationalCostDatabase/ckPriceChunks/materials03.ts

HISTORY / LAYOUT CONTRACT
    The chunked layout was committed in Oct 2026 ("Sync data AHSP Cipta Karya
    2026 (chunked)", batches 14-18) WITHOUT its generator. The only in-repo
    CK generator, scripts/ahsp2026/generateCiptaKaryaPricesModule.py, writes
    the OBSOLETE single-file layout and must not be run against the chunked
    tree. This script is the rebuilt generator for the chunked layout.

    Layout facts reverse-engineered and VERIFIED by byte-identical
    reproduction of the five unchanged chunks (2026-11-19, W2 Phase 2):
      * Entry filter: identical `is_clean` rule as
        generateCiptaKaryaPricesModule.py (drops the single numeric-artifact
        labor row {"name": "2", "unit": "3", "price": 4.0}; nothing else).
      * Serializer: Python json.dumps(entry, ensure_ascii=False,
        separators=(',', ':')) with key order code/name/unit/price, entries
        joined by ','. Floats keep Python repr (385000.0, never 385000).
        No single-quote escaping (plain JSON escaping only).
      * File template: import-type line, blank line, single export line,
        trailing newline after `];`.
      * Materials split: FIXED counts [753, 808, 803, 711]. No greedy
        byte/char budget reproduces the committed boundaries (chunk0 file
        bytes 65983 exceed chunk1+next-entry 65876, so no single threshold
        fits; sourceRow boundaries 812/813, 1629/1630, 2440/2441 are not
        round either). The split points are therefore preserved layout
        constants. If the canonical material count changes, this script
        REFUSES to run until MATERIAL_CHUNK_COUNTS is updated deliberately
        (a layout change, not a silent re-chunk).

USAGE
    python3 scripts/ahsp2026/generateCkPriceChunks.py --check
        Regenerate into a scratch dir and byte-compare against the committed
        chunks. Exit 0 only if every file matches, except that differences
        are REPORTED with first-diff context (exit 2) instead of hidden.
    python3 scripts/ahsp2026/generateCkPriceChunks.py --write
        Regenerate the six chunk files in place. Files whose bytes are
        unchanged are left untouched (mtime preserved).

    Default mode is --check (safe). Run from the repo root.
"""

import argparse
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UB_PATH = os.path.join(REPO_ROOT, "data", "ahsp2026", "excel_extracted", "upah_bahan.json")
CHUNK_DIR = os.path.join(
    REPO_ROOT, "src", "data", "nationalCostDatabase", "ckPriceChunks"
)

# Preserved layout constants (see header). Sum must equal the clean material count.
MATERIAL_CHUNK_COUNTS = [753, 808, 803, 711]
EXPECTED_CLEAN_COUNTS = {"labor": 44, "materials": 3075, "equipment": 204}

HEADER_TEMPLATE = (
    "import type {{ CiptaKaryaPriceEntry }} from "
    "'../officialCiptaKaryaPrices2026';\n"
    "\n"
    "export const {name}: CiptaKaryaPriceEntry[] = [{{joined}}];\n"
)


def is_clean(entry):
    """Same rule as scripts/ahsp2026/generateCiptaKaryaPricesModule.py."""
    name = entry.get("name", "").strip()
    price = entry.get("price", 0)
    if not name or name in ["1", "2", "3", "4", "5", "6", "7", "8", "9"]:
        return False
    if name.lower() in ["uraian", "satuan", "harga", "jumlah"]:
        return False
    if not isinstance(price, (int, float)) or price <= 0:
        return False
    return True


def canonical_entry(entry):
    """Rebuild with fixed key order; values passed through untouched."""
    return {
        "code": entry.get("code", ""),
        "name": entry.get("name", ""),
        "unit": entry.get("unit", ""),
        "price": entry.get("price"),
    }


def serialize(entries):
    return ",".join(
        json.dumps(e, ensure_ascii=False, separators=(",", ":")) for e in entries
    )


def render_chunk(const_name, entries):
    return HEADER_TEMPLATE.format(name=const_name).replace(
        "{joined}", serialize(entries)
    )


def build_all():
    with open(UB_PATH, "r", encoding="utf-8") as f:
        ub = json.load(f)
    clean = {k: [canonical_entry(e) for e in ub[k] if is_clean(e)] for k in
             ("labor", "materials", "equipment")}
    for key, expected in EXPECTED_CLEAN_COUNTS.items():
        got = len(clean[key])
        if got != expected:
            raise SystemExit(
                "LAYOUT GUARD: clean %s count is %d, expected %d. "
                "Canonical data changed; update EXPECTED_CLEAN_COUNTS and "
                "MATERIAL_CHUNK_COUNTS deliberately, do not re-chunk silently."
                % (key, got, expected)
            )
    if sum(MATERIAL_CHUNK_COUNTS) != len(clean["materials"]):
        raise SystemExit(
            "LAYOUT GUARD: MATERIAL_CHUNK_COUNTS sums to %d but clean "
            "materials = %d." % (sum(MATERIAL_CHUNK_COUNTS), len(clean["materials"]))
        )
    files = {}
    files["labor.ts"] = render_chunk("LABOR", clean["labor"])
    files["equipment.ts"] = render_chunk("EQUIPMENT", clean["equipment"])
    offset = 0
    for i, count in enumerate(MATERIAL_CHUNK_COUNTS):
        files["materials%02d.ts" % i] = render_chunk(
            "MATERIALS_%02d" % i, clean["materials"][offset:offset + count]
        )
        offset += count
    return files


def first_diff(a, b):
    n = min(len(a), len(b))
    for i in range(n):
        if a[i] != b[i]:
            return i, a[max(0, i - 80):i + 80], b[max(0, i - 80):i + 80]
    if len(a) != len(b):
        return n, a[max(0, n - 80):n + 80], b[max(0, n - 80):n + 80]
    return None, "", ""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="byte-compare regenerated output (default)")
    parser.add_argument("--write", action="store_true",
                        help="regenerate the chunk files in place")
    args = parser.parse_args()
    if args.write and args.check:
        parser.error("--check and --write are mutually exclusive")
    mode_write = args.write

    files = build_all()
    mismatches = []
    for fname in sorted(files):
        target = os.path.join(CHUNK_DIR, fname)
        new_bytes = files[fname].encode("utf-8")
        with open(target, "rb") as f:
            old_bytes = f.read()
        if old_bytes == new_bytes:
            print("IDENTICAL  %s (%d bytes)" % (fname, len(new_bytes)))
        else:
            pos, old_ctx, new_ctx = first_diff(old_bytes, new_bytes)
            print("DIFFERS    %s (committed %d bytes, regenerated %d bytes, "
                  "first diff at byte %s)" % (fname, len(old_bytes),
                                              len(new_bytes), pos))
            print("  committed : %r" % old_ctx)
            print("  regenerated: %r" % new_ctx)
            mismatches.append(fname)
            if mode_write:
                with open(target, "wb") as f:
                    f.write(new_bytes)
                print("  -> rewrote %s" % target)
    if mismatches and not mode_write:
        print("CHECK FAILED: %d file(s) differ: %s"
              % (len(mismatches), ", ".join(mismatches)))
        return 2
    if mode_write:
        print("WRITE DONE: %d file(s) rewritten, %d identical."
              % (len(mismatches), len(files) - len(mismatches)))
    else:
        print("CHECK PASSED: all %d chunk files byte-identical." % len(files))
    return 0


if __name__ == "__main__":
    sys.exit(main())
