/**
 * I18N DICTIONARY PARITY + KEY-EXISTENCE GUARD — program i18n 2026-11-27.
 *
 * Mengunci temuan audit & perbaikan program ganti bahasa:
 *  1. Paritas kunci: ke-4 locale punya set kunci yang IDENTIK (tipe
 *     `Dictionary = typeof id` hanya menjamin bentuk, bukan isi).
 *  2. Tidak ada nilai kosong tak disengaja (pengecualian: 2 suffix halaman
 *     yang memang "" di id/en/ms dan " 页"/"页" di zh).
 *  3. Perbaikan kamus Melayu (D1): istilah Indonesia-spesifik tidak boleh
 *     kembali ke nilai ms (Tenggat/Kesiapan/Selisih/Rata kiri-kanan/opname),
 *     dan 8 nilai perbaikan dipin eksplisit.
 *  4. Kunci-kunci yang pernah hilang saat merge (banner_ez_a, instr_hint,
 *     ahsp_match, confirm_too, lib.title_view) ada + tidak kosong di
 *     ke-4 locale — fallback fail-open akan menampilkan raw key bila hilang.
 *  5. Setiap t('literal') di src (di luar src/test) ada di kamus id —
 *     pemanggilan kunci yang tak ada adalah bug senyap (raw key tampil).
 *
 * Plain-tsx (pola docStudioUi.test.ts, check()) — BUKAN vitest.
 * Jalankan: npx --yes tsx src/test/i18nDictionaryParity.test.ts
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { dictionaries } from '../i18n/dictionaries';

type Flat = Record<string, string>;
function flatten(o: unknown, prefix: string, out: Flat): void {
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, p, out);
    else out[p] = v as string;
  }
}

async function main(): Promise<void> {
  const langs = ['id', 'en', 'zh', 'ms'] as const;
  const flat: Record<string, Flat> = {};
  for (const lang of langs) { flat[lang] = {}; flatten((dictionaries as any)[lang], '', flat[lang]); }

  console.log('\n[1] Paritas kunci per locale:');
  const counts = langs.map((l) => Object.keys(flat[l]).length);
  check('jumlah kunci sama di 4 locale', counts.every((c) => c === counts[0]), counts.join('/'));
  const idKeys = new Set(Object.keys(flat.id));
  for (const lang of ['en', 'zh', 'ms'] as const) {
    const missing = [...idKeys].filter((k) => !(k in flat[lang]));
    const extra = Object.keys(flat[lang]).filter((k) => !idKeys.has(k));
    check(`set kunci ${lang} identik dengan id`, missing.length === 0 && extra.length === 0,
      `hilang: ${missing.slice(0, 3).join(', ')} | lebih: ${extra.slice(0, 3).join(', ')}`);
  }

  console.log('\n[2] Nilai kosong:');
  const allowedEmpty = new Set(['ai.ded.result.page_abbr_suffix', 'ai.doc.ana.page_abbr_suffix']);
  for (const lang of langs) {
    const empty = Object.entries(flat[lang]).filter(([k, v]) => v.trim() === '' && !allowedEmpty.has(k));
    check(`tidak ada nilai kosong tak disengaja (${lang})`, empty.length === 0, empty.slice(0, 3).map(([k]) => k).join(', '));
  }

  console.log('\n[3] Kamus Melayu — istilah Indonesia-spesifik tidak kembali:');
  const banned: Array<[string, RegExp]> = [
    ['Tenggat', /Tenggat/],
    ['Kesiapan', /Kesiapan/],
    ['Selisih', /Selisih/],
    ['Rata kiri/kanan', /Rata (kiri|kanan)/],
    ['opname', /opname/i],
  ];
  for (const [name, rx] of banned) {
    const hits = Object.entries(flat.ms).filter(([, v]) => rx.test(v)).map(([k]) => k);
    check(`nilai ms bebas "${name}"`, hits.length === 0, hits.slice(0, 3).join(', '));
  }
  const msPins: Array<[string, string]> = [
    ['ai.doc.create.tb_left', 'Jajar kiri'],
    ['ai.doc.create.tb_right', 'Jajar kanan'],
    ['ai.doc.create.tb_justify', 'Jajar selaras'],
    ['proj.all.sort_due', 'Tarikh akhir terdekat'],
    ['proj.all.th_due', 'Tarikh akhir'],
    ['proj.all.edit_due', 'Tarikh akhir'],
    ['proj.all.progress_behind_a', 'Perbezaan'],
    ['proj.all.stat_attention_sub', 'Tarikh akhir lepas / perlu tindakan'],
  ];
  for (const [key, want] of msPins) {
    check(`ms ${key} = "${want}"`, flat.ms[key] === want, `dapat: ${JSON.stringify(flat.ms[key])}`);
  }

  console.log('\n[4] Kunci yang pernah hilang (fail-open = raw key tampil):');
  const mustExist = [
    'ai.ded.result.banner_ez_a',
    'ai.doc.create.instr_hint',
    'ai.ded.result.ahsp_match',
    'ai.ded.result.confirm_too',
    'ai.doc.lib.title_view',
  ];
  for (const key of mustExist) {
    const ok = langs.every((l) => typeof flat[l][key] === 'string' && flat[l][key].trim() !== '');
    check(`kunci ada + tidak kosong di 4 locale: ${key}`, ok);
  }
  check('id instr_hint memuat 5 frasa kunci placeholder',
    ['AI hanya memakai instruksi ini', 'data pada ringkasan konteks', 'ditandai [ISI: ...]', 'tidak dikarang', 'dalam Bahasa Indonesia']
      .every((f) => flat.id['ai.doc.create.instr_hint'].includes(f)));

  console.log('\n[5] Semua t(\'literal\') di src ada di kamus id:');
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const used = new Set<string>();
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) { if (e !== 'test') walk(p); continue; }
      if (!/\.(tsx?|mts|cts)$/.test(e)) continue;
      if (p.endsWith('src/i18n/dictionaries.ts')) continue;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/\bt\(['"]([A-Za-z0-9_.]+)['"]\)/g)) used.add(m[1]);
    }
  };
  walk(join(repoRoot, 'src'));
  const missing = [...used].filter((k) => !(k in flat.id));
  check(`t('literal') terpakai: ${used.size} kunci, 0 hilang`, missing.length === 0, missing.slice(0, 5).join(', '));

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) { console.log('GAGAL:', failures.join(' | ')); process.exitCode = 1; }
  else console.log('SEMUA TEST I18N DICTIONARY PARITY LOLOS');
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
