/**
 * RECONCILE — compare repo AHSP dataset against the official Lampiran II text.
 *
 * Stage 1 (this script): locate where each AHSP code appears in the official
 * document, and dump the surrounding page text so the real table structure can
 * be inspected before any parser is written.
 *
 * Read-only. Writes nothing.
 *
 * Usage:
 *   npx tsx scripts/reconcileLampiranII.ts find 2.1.(1)
 *   npx tsx scripts/reconcileLampiranII.ts find 2.1.(1) 2.2.(1) 3.1.(1)
 *   npx tsx scripts/reconcileLampiranII.ts page 2100
 *   npx tsx scripts/reconcileLampiranII.ts stats
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { BINA_MARGA_AHSP_2026_DATASET } from '../src/data/nationalCostDatabase/binaMargaAHSPDataset';

const CACHE = path.join(process.cwd(), 'docs', '_audit', 'lampiran2-pages.jsonl');

interface PageRecord { page: number; chars: number; lines: string[] }

function loadCache(): PageRecord[] {
  if (!fs.existsSync(CACHE)) {
    console.error(`Cache not found: ${CACHE}\nRun: npx tsx scripts/extractLampiranII.ts`);
    process.exit(1);
  }
  return fs
    .readFileSync(CACHE, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as PageRecord);
}

/** TOC pages announce themselves with this header. */
function isTocPage(rec: PageRecord): boolean {
  const head = rec.lines.slice(0, 12).join(' ');
  return /DAFTAR ISI/i.test(head);
}

const cache = loadCache();
const tocPages = cache.filter(isTocPage).map((r) => r.page);
const lastToc = tocPages.length > 0 ? Math.max(...tocPages) : 0;

const cmd = process.argv[2] || 'stats';

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (cmd === 'stats') {
  console.log('='.repeat(78));
  console.log('LAMPIRAN II — CACHE STATISTICS');
  console.log('='.repeat(78));
  console.log(`  halaman cache       : ${cache.length}`);
  console.log(`  halaman TOC         : ${tocPages.length}  (${tocPages[0]}..${lastToc})`);
  console.log(`  total karakter      : ${cache.reduce((a, r) => a + r.chars, 0).toLocaleString('id-ID')}`);
  console.log('');

  // Which pages carry the AHSP analysis header?
  const markers = [
    { label: 'Harga Satuan Pekerjaan', re: /Harga Satuan Pekerjaan/i },
    { label: 'TENAGA', re: /\bTENAGA\b/ },
    { label: 'BAHAN', re: /\bBAHAN\b/ },
    { label: 'PERALATAN', re: /\bPERALATAN\b/ },
    { label: 'Koefisien', re: /Koefisien/i },
    { label: 'Jumlah Harga', re: /Jumlah Harga/i },
  ];
  console.log('  --- penanda struktural ---');
  for (const m of markers) {
    const pages = cache.filter((r) => r.lines.some((l) => m.re.test(l)));
    console.log(`  ${m.label.padEnd(24)} : ${String(pages.length).padStart(5)} halaman`);
  }
  console.log('');

  console.log('  --- dataset repo ---');
  console.log(`  item BINA_MARGA     : ${BINA_MARGA_AHSP_2026_DATASET.length}`);
  const withLabor = BINA_MARGA_AHSP_2026_DATASET.filter((i: any) => (i.laborComponents || []).length > 0).length;
  const withMat = BINA_MARGA_AHSP_2026_DATASET.filter((i: any) => (i.materialComponents || []).length > 0).length;
  const withEquip = BINA_MARGA_AHSP_2026_DATASET.filter((i: any) => (i.equipmentComponents || []).length > 0).length;
  console.log(`    punya tenaga      : ${withLabor}`);
  console.log(`    punya bahan       : ${withMat}`);
  console.log(`    punya peralatan   : ${withEquip}`);
  const sourcePages = new Set(BINA_MARGA_AHSP_2026_DATASET.map((i: any) => i.sourcePage));
  console.log(`    sourcePage unik   : ${sourcePages.size}  (min=${Math.min(...[...sourcePages] as number[])}, max=${Math.max(...[...sourcePages] as number[])})`);
}

if (cmd === 'page') {
  const target = Number(process.argv[3]);
  const rec = cache.find((r) => r.page === target);
  if (!rec) {
    console.error(`Page ${target} not in cache.`);
    process.exit(1);
  }
  console.log(`--- PAGE ${rec.page} (${rec.chars} chars, ${rec.lines.length} lines) ---`);
  rec.lines.forEach((l, i) => console.log(`${String(i + 1).padStart(4)}| ${l}`));
}

if (cmd === 'find') {
  const codes = process.argv.slice(3);
  if (codes.length === 0) {
    console.error('Usage: reconcileLampiranII.ts find <code> [code...]');
    process.exit(1);
  }

  console.log('='.repeat(78));
  console.log('LOCATE AHSP CODES IN OFFICIAL DOCUMENT');
  console.log('='.repeat(78));
  console.log(`TOC berakhir di halaman ${lastToc}; body dimulai setelahnya.`);
  console.log('');

  for (const code of codes) {
    const re = new RegExp(`(^|\\s)${esc(code)}(\\s|$)`);
    const bodyHits = cache.filter((r) => r.page > lastToc && r.lines.some((l) => re.test(l)));
    const tocHits = cache.filter((r) => r.page <= lastToc && r.lines.some((l) => re.test(l)));

    const repoItem: any = BINA_MARGA_AHSP_2026_DATASET.find(
      (i: any) => i.code === code || i.codeNormalized === code,
    );

    console.log('─'.repeat(78));
    console.log(`KODE ${code}`);
    console.log(`  di TOC            : ${tocHits.length} halaman  ${tocHits.slice(0, 6).map((r) => r.page).join(', ')}`);
    console.log(`  di body           : ${bodyHits.length} halaman  ${bodyHits.slice(0, 8).map((r) => r.page).join(', ')}`);
    if (repoItem) {
      console.log(`  dataset repo      : "${repoItem.name}"`);
      console.log(`    satuan           : ${repoItem.unit}`);
      console.log(`    sourcePage       : ${repoItem.sourcePage}   <-- dibandingkan dengan halaman body nyata`);
      console.log(`    status           : ${repoItem.status}`);
      console.log(`    tenaga           : ${(repoItem.laborComponents || []).map((c: any) => `${c.name} ${c.coefficient}${c.unit}`).join(' | ') || '(kosong)'}`);
      console.log(`    bahan            : ${(repoItem.materialComponents || []).map((c: any) => `${c.name} ${c.coefficient}${c.unit}`).join(' | ') || '(kosong)'}`);
      console.log(`    peralatan        : ${(repoItem.equipmentComponents || []).map((c: any) => `${c.name} ${c.coefficient}${c.unit}`).join(' | ') || '(kosong)'}`);
    } else {
      console.log(`  dataset repo      : TIDAK ADA`);
    }

    // Dump the first body hit so the real official table can be inspected.
    if (bodyHits.length > 0) {
      const rec = bodyHits[0];
      const idx = rec.lines.findIndex((l) => re.test(l));
      const from = Math.max(0, idx - 8);
      const to = Math.min(rec.lines.length, idx + 45);
      console.log('');
      console.log(`  --- HALAMAN RESMI ${rec.page} (baris ${from + 1}..${to}) ---`);
      rec.lines.slice(from, to).forEach((l, i) => console.log(`  ${String(from + i + 1).padStart(4)}| ${l}`));
    }
    console.log('');
  }
}
