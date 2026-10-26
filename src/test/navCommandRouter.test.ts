/**
 * Test: Command Router & Direct Feature Shortcuts (2026-10-26)
 *
 * Menguji registry navigasi chat (navRegistry.ts) secara murni:
 * - id unik, slash unik, target terverifikasi lewat routeForMenu +
 *   parseWorkspaceRoute ASLI (bukan route karangan);
 * - /ahsp → AHSP; /spreadsheet → Spreadsheet RAB (BUKAN RAB umum);
 * - semua slash command, sinonim Indonesia, submenu spesifik menang;
 * - pertanyaan informasional & ambigu TIDAK auto-navigasi;
 * - navigasi via router internal (tidak ada window.open/popup/tab baru
 *   di registry/resolver — dibuktikan lewat navPathForEntry + audit string
 *   sumber, karena window.open tidak pernah dipanggil modul ini);
 * - resolver murni: tanpa mutasi input, tanpa efek samping, deterministik.
 *
 * BATAS: tes ini tidak menguji render browser (BLOCKED dari sandbox:
 * SSO Vercel + gerbang akses). Rendering 390px & perubahan URL nyata di
 * Preview harus dicek owner setelah push.
 */
import { describe, it, expect } from 'vitest';
import {
  NAV_ENTRIES,
  NAV_BY_ID,
  extractSlashToken,
  filterSlashEntries,
  navPathForEntry,
  resolveNavCommand,
  suggestSlash,
} from '../ai-tools/ezrab-ai/navRegistry';
import { parseWorkspaceRoute } from '../routing/routes';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const direct = (text: string) => {
  const r = resolveNavCommand(text);
  if (r.mode !== 'direct') throw new Error(`Expected direct for "${text}", got ${r.mode}`);
  return r.entry;
};

describe('navRegistry: struktur', () => {
  it('id unik, slash unik, semua entry punya label + deskripsi', () => {
    const ids = NAV_ENTRIES.map((e) => e.id);
    const slashes = NAV_ENTRIES.map((e) => e.slash);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slashes).size).toBe(slashes.length);
    expect(NAV_ENTRIES.length).toBe(32); // 30 target brief + jadwal + analisa-harga RAB
    for (const e of NAV_ENTRIES) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.description.length).toBeGreaterThan(0);
      expect(e.slash.startsWith('/')).toBe(true);
      expect(e.aliases.length).toBeGreaterThan(0);
      expect(NAV_BY_ID[e.id]).toBe(e);
    }
  });

  it('setiap entry menu memetakan ke route valid lewat router asli', () => {
    for (const e of NAV_ENTRIES) {
      if (e.special === 'tutorial') {
        expect(e.menu).toBeNull();
        expect(navPathForEntry(e)).toBeNull();
        continue;
      }
      const path = navPathForEntry(e, null);
      expect(path, `entry ${e.id}`).not.toBeNull();
      const parsed = parseWorkspaceRoute(path as string, '');
      expect(parsed.status, `entry ${e.id} -> ${path}`).toBe('ok');
    }
  });

  it('entry proyek berfilter memakai filter yang diakui WorkspaceView', () => {
    const allowed = ['Semua Proyek', 'Draft', 'Sedang Dikerjakan', 'Selesai', 'Arsip'];
    for (const e of NAV_ENTRIES.filter((x) => x.projectFilter)) {
      expect(allowed).toContain(e.projectFilter);
      expect(e.menu).toBe('proyek');
    }
    expect(NAV_ENTRIES.filter((x) => x.projectFilter).length).toBe(5);
  });

  it('registry tidak mengandung URL eksternal / popup / tab baru', () => {
    const src = readFileSync(resolve(__dirname, '../ai-tools/ezrab-ai/navRegistry.ts'), 'utf8');
    expect(src).not.toMatch(/window\.open/);
    expect(src).not.toMatch(/https?:\/\//);
    expect(src).not.toMatch(/_blank/);
  });
});

describe('navRegistry: slash command', () => {
  it('/ahsp → AHSP (ahsp-2026), bukan laporan', () => {
    expect(direct('/ahsp').id).toBe('ahsp');
    expect(direct('/ahsp').menu).toBe('ahsp-2026');
    expect(navPathForEntry(direct('/ahsp'), null)).toBe('/app/ahsp');
  });

  it('/spreadsheet → Spreadsheet RAB (rab-spreadsheet), BUKAN rab-estimasi', () => {
    const e = direct('/spreadsheet');
    expect(e.id).toBe('spreadsheet-rab');
    expect(e.menu).toBe('rab-spreadsheet');
    expect(e.menu).not.toBe('rab-estimasi');
    expect(navPathForEntry(e, null)).toContain('spreadsheet');
  });

  it('semua slash command registry resolve direct ke entry-nya', () => {
    for (const e of NAV_ENTRIES) {
      expect(direct(e.slash).id, `slash ${e.slash}`).toBe(e.id);
    }
  });

  it('slash tak dikenal → saran masuk akal, bukan error/navigasi acak', () => {
    const r = resolveNavCommand('/spradshet');
    expect(r.mode).toBe('suggest');
    if (r.mode === 'suggest') {
      expect(r.candidates.length).toBeGreaterThan(0);
      expect(r.candidates[0].id).toBe('spreadsheet-rab');
    }
    const r2 = resolveNavCommand('/zzz-tidak-ada');
    expect(r2.mode).toBe('suggest');
  });

  it('slash legacy tetap didelegasikan ke routeIntent (mode none)', () => {
    for (const s of ['/dokumen', '/dashboard', '/help', '/game']) {
      expect(resolveNavCommand(s).mode, s).toBe('none');
    }
  });
});

describe('navRegistry: bahasa alami Indonesia', () => {
  it('sinonim natural → target benar', () => {
    expect(direct('buka AHSP').id).toBe('ahsp');
    expect(direct('bukain spreadsheet').id).toBe('spreadsheet-rab');
    expect(direct('tampilin kalkulator volume').id).toBe('kalkulator-volume');
    expect(direct('pergi ke laporan').id).toBe('laporan');
    expect(direct('masuk ke dokumen proyek').id).toBe('dokumen-proyek');
    expect(direct('lihat proyek selesai').id).toBe('proyek-selesai');
    expect(direct('buka proyek draft').id).toBe('proyek-draft');
    expect(direct('buka proyek yang sedang dikerjakan').id).toBe('proyek-aktif');
    expect(direct('buka jadwal dan manajemen').id).toBe('jadwal-manajemen');
    expect(direct('buka kurva s').id).toBe('kurva-s');
    expect(direct('buka template rab').id).toBe('template-rab');
    expect(direct('buka tutorial').id).toBe('tutorial');
    expect(direct('buka keuangan proyek').id).toBe('keuangan-proyek');
    expect(direct('ke ahsp').id).toBe('ahsp');
  });

  it('submenu spesifik menang atas induk', () => {
    expect(direct('buka spreadsheet rab').id).toBe('spreadsheet-rab');
    expect(direct('buka rekapitulasi rab').id).toBe('rekap-rab');
    expect(direct('buka rekapitulasi qto').id).toBe('rekap-qto');
    expect(direct('buka analisa harga rab').id).toBe('rab-analisa-harga');
    expect(direct('buka analisa harga').id).toBe('ahsp'); // tanpa qualifier = AHSP
    expect(direct('buka proyek selesai').id).toBe('proyek-selesai');
    expect(direct('buka jadwal manajemen').id).toBe('jadwal-manajemen');
    expect(direct('buka jadwal').id).toBe('jadwal');
    expect(direct('buka pengaturan rab').id).toBe('pengaturan-rab');
    expect(direct('buka pengaturan').id).toBe('pengaturan');
    expect(direct('buka dokumen proyek').id).toBe('dokumen-proyek');
  });

  it('pertanyaan informasional TIDAK auto-navigasi', () => {
    expect(resolveNavCommand('Apa itu AHSP?').mode).toBe('none');
    expect(resolveNavCommand('apa itu ahsp 2026').mode).toBe('none');
    expect(resolveNavCommand('jelaskan ahsp').mode).toBe('none');
    expect(resolveNavCommand('ahsp').mode).toBe('none');
    expect(resolveNavCommand('template').mode).toBe('none');
    expect(resolveNavCommand('rab').mode).toBe('none');
  });

  it('ambigu → pilihan chip, tanpa navigasi', () => {
    const r1 = resolveNavCommand('spreadsheet');
    expect(r1.mode).toBe('ambiguous');
    if (r1.mode === 'ambiguous') expect(r1.candidates[0].id).toBe('spreadsheet-rab');
    const r2 = resolveNavCommand('laporan');
    expect(r2.mode).toBe('ambiguous');
    const r3 = resolveNavCommand('proyek');
    expect(r3.mode).toBe('ambiguous');
    if (r3.mode === 'ambiguous') expect(r3.candidates.length).toBe(5);
    const r4 = resolveNavCommand('buka rekapitulasi');
    expect(r4.mode).toBe('ambiguous');
    if (r4.mode === 'ambiguous') expect(r4.candidates.length).toBe(2);
  });

  it('cara membuka → saran chip saja, bukan auto-nav', () => {
    const r = resolveNavCommand('bagaimana cara membuka ahsp');
    expect(r.mode).toBe('suggest');
    if (r.mode === 'suggest') expect(r.entry.id).toBe('ahsp');
  });

  it('campuran info+perintah → jawaban singkat + chip (AHSP)', () => {
    const r = resolveNavCommand('jelaskan AHSP lalu buka halamannya');
    expect(r.mode).toBe('suggest');
    if (r.mode === 'suggest') {
      expect(r.entry.id).toBe('ahsp');
      expect(r.message).toContain('koefisien');
      expect(r.candidates[0].id).toBe('ahsp');
    }
  });

  it('pesan sangat panjang dengan frasa nav → saran, bukan direct', () => {
    const long = `Berikut isi dokumen proyek saya yang panjang sekali. ${'Kata pengantar dan uraian pekerjaan '.repeat(8)}Tolong buka spreadsheet rab untuk memeriksa angka.`;
    expect(long.length).toBeGreaterThan(160);
    const r = resolveNavCommand(long);
    expect(r.mode).toBe('suggest');
  });
});

describe('navRegistry: kemurnian resolver', () => {
  it('deterministik & tanpa mutasi input', () => {
    const input = 'Buka Spreadsheet RAB';
    const a = resolveNavCommand(input);
    const b = resolveNavCommand(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(input).toBe('Buka Spreadsheet RAB');
    expect(a.mode).toBe('direct');
  });
});

describe('slash menu helpers', () => {
  it('extractSlashToken: posisi kursor & pola', () => {
    expect(extractSlashToken('/', 1)).toBe('');
    expect(extractSlashToken('/spr', 4)).toBe('spr');
    expect(extractSlashToken('tolong /ahsp', 12)).toBe('ahsp');
    expect(extractSlashToken('buka ahsp', 9)).toBeNull();
    expect(extractSlashToken('/ahsp beton', 5)).toBe('ahsp');
    expect(extractSlashToken('/ahsp beton', 12)).toBeNull();
  });

  it('filterSlashEntries: kosong = semua, prefix/substring bekerja', () => {
    expect(filterSlashEntries('').length).toBe(32);
    const spr = filterSlashEntries('spr');
    expect(spr.some((e) => e.id === 'spreadsheet-rab')).toBe(true);
    const proyek = filterSlashEntries('proyek');
    expect(proyek.length).toBeGreaterThanOrEqual(5);
    expect(filterSlashEntries('zzz-tidak-ada').length).toBe(0);
  });

  it('suggestSlash: query kosong = semua; fallback 4 terpakai', () => {
    expect(suggestSlash('').length).toBe(32);
    expect(suggestSlash('/zzz-tidak-ada').map((e) => e.id)).toContain('spreadsheet-rab');
  });
});

describe('navRegistry: jalur router internal', () => {
  it('navPathForEntry memakai routeForMenu resmi (bukan string karangan)', () => {
    expect(navPathForEntry(NAV_BY_ID['kalkulator-volume'], null)).toBe('/app/volume-calculation');
    expect(navPathForEntry(NAV_BY_ID['laporan'], null)).toBe('/app/reports');
    expect(navPathForEntry(NAV_BY_ID['template-rab'], null)).toBe('/app/template-rab');
    expect(navPathForEntry(NAV_BY_ID['proyek-semua'], null)).toBe('/app/projects');
    expect(navPathForEntry(NAV_BY_ID['proyek-semua'], 'PRJ-1')).toBe('/app/projects');
    expect(navPathForEntry(NAV_BY_ID['spreadsheet-rab'], 'PRJ-1')).toBe('/app/projects/PRJ-1/estimate?tab=spreadsheet');
  });
});
