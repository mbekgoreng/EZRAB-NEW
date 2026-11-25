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
 *
 * PERUBAHAN PERILAKU §4.1 (keputusan owner, directive P1 2026-11-24 /
 * OD-1 — perubahan yang disengaja, BUKAN pelemahan): navigasi bahasa
 * alami DIHAPUS. "buka ahsp" dan sinonim natural lainnya kini 'none'
 * (sampai ke AI sebagai percakapan biasa); hanya perintah slash yang
 * menavigasi. Tes-tes di bawah yang dulu mem-pin navigasi NL kini
 * mem-pin perilaku baru ini.
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
    expect(NAV_ENTRIES.length).toBe(33); // 30 target brief + jadwal + analisa-harga RAB + informasi-proyek (entri sah: fitur Informasi Proyek, commit 8295c74; ekspektasi 32 basi — ditutup audit R-06 2026-11-04)
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
    // W-A-05 (§4.1): tanpa entri mirip → petunjuk /help, tanpa chip acak.
    const r2 = resolveNavCommand('/zzz-tidak-ada');
    expect(r2.mode).toBe('suggest');
    if (r2.mode === 'suggest') {
      expect(r2.candidates).toEqual([]);
      expect(r2.message).toContain('/help');
    }
  });

  it('"/" telanjang → petunjuk /help, bukan 33 chip "tidak dikenal" (W-A-06 §4.1)', () => {
    const r = resolveNavCommand('/');
    expect(r.mode).toBe('suggest');
    if (r.mode === 'suggest') {
      expect(r.candidates).toEqual([]);
      expect(r.message).not.toContain('tidak dikenal');
      expect(r.message).toContain('/help');
    }
  });

  it('slash legacy tetap didelegasikan ke routeIntent (mode none)', () => {
    for (const s of ['/dokumen', '/dashboard', '/help', '/game']) {
      expect(resolveNavCommand(s).mode, s).toBe('none');
    }
  });

  it('slash tengah-pesan sesudah kesopanan/verba tetap menavigasi (§4.1)', () => {
    // Isi operatif pesan adalah perintah slash-nya; awalan hanya sopan santun.
    const r1 = resolveNavCommand('tolong buka /ahsp');
    expect(r1.mode).toBe('direct');
    if (r1.mode === 'direct') {
      expect(r1.entry.id).toBe('ahsp');
      expect(r1.ahspQuery).toBeUndefined(); // W-A-03: tanpa q sampah "tolong /"
    }
    const r2 = resolveNavCommand('buka /ahsp');
    expect(r2.mode).toBe('direct');
    if (r2.mode === 'direct') expect(r2.ahspQuery).toBeUndefined();
    // ...tetapi slash di tengah kalimat penjelasan / dalam kutip TIDAK dieksekusi.
    expect(resolveNavCommand('Explain the /ahsp command').mode).toBe('none');
    expect(resolveNavCommand('tolong jelaskan /ahsp').mode).toBe('none');
    expect(resolveNavCommand('"/ahsp"').mode).toBe('none');
    expect(resolveNavCommand('buka "/ahsp"').mode).toBe('none');
  });

  it('negasi tidak pernah menavigasi (W-A-01 §4.1)', () => {
    for (const s of [
      'jangan buka ahsp',
      'saya tidak mau buka ahsp',
      'jangan buka /ahsp',
      'tidak usah buka /rab',
      'buka /ahsp, jangan yang lain',
      'I do not want to open /ahsp',
    ]) {
      expect(resolveNavCommand(s).mode, s).toBe('none');
    }
  });
});

describe('navRegistry: bahasa alami Indonesia (§4.1 — TIDAK menavigasi)', () => {
  it('sinonim natural → none (sampai ke AI, bukan navigasi)', () => {
    for (const s of [
      'buka AHSP',
      'bukain spreadsheet',
      'tampilin kalkulator volume',
      'pergi ke laporan',
      'masuk ke dokumen proyek',
      'lihat proyek selesai',
      'buka proyek draft',
      'buka proyek yang sedang dikerjakan',
      'buka jadwal dan manajemen',
      'buka kurva s',
      'buka template rab',
      'buka tutorial',
      'buka keuangan proyek',
      'ke ahsp',
    ]) {
      expect(resolveNavCommand(s).mode, s).toBe('none');
    }
  });

  it('submenu spesifik bahasa alami → none (bukan direct)', () => {
    for (const s of [
      'buka spreadsheet rab',
      'buka rekapitulasi rab',
      'buka rekapitulasi qto',
      'buka analisa harga rab',
      'buka analisa harga',
      'buka proyek selesai',
      'buka jadwal manajemen',
      'buka jadwal',
      'buka pengaturan rab',
      'buka pengaturan',
      'buka dokumen proyek',
    ]) {
      expect(resolveNavCommand(s).mode, s).toBe('none');
    }
  });

  it('pertanyaan informasional TIDAK auto-navigasi', () => {
    expect(resolveNavCommand('Apa itu AHSP?').mode).toBe('none');
    expect(resolveNavCommand('apa itu ahsp 2026').mode).toBe('none');
    expect(resolveNavCommand('jelaskan ahsp').mode).toBe('none');
    expect(resolveNavCommand('ahsp').mode).toBe('none');
    expect(resolveNavCommand('template').mode).toBe('none');
    expect(resolveNavCommand('rab').mode).toBe('none');
  });

  it('nama target telanjang → none (sampai ke AI, bukan chip ambigu) (§4.1)', () => {
    for (const s of ['spreadsheet', 'laporan', 'proyek', 'database', 'buka rekapitulasi']) {
      expect(resolveNavCommand(s).mode, s).toBe('none');
    }
  });

  it('cara membuka → none (dijawab AI, bukan chip shortcut) (§4.1)', () => {
    expect(resolveNavCommand('bagaimana cara membuka ahsp').mode).toBe('none');
  });

  it('campuran info+perintah → none (dijawab AI) (§4.1)', () => {
    expect(resolveNavCommand('jelaskan AHSP lalu buka halamannya').mode).toBe('none');
  });

  it('pesan sangat panjang dengan frasa nav → none (dijawab AI) (§4.1)', () => {
    const long = `Berikut isi dokumen proyek saya yang panjang sekali. ${'Kata pengantar dan uraian pekerjaan '.repeat(8)}Tolong buka spreadsheet rab untuk memeriksa angka.`;
    expect(long.length).toBeGreaterThan(160);
    expect(resolveNavCommand(long).mode).toBe('none');
  });
});

describe('navRegistry: kemurnian resolver', () => {
  it('deterministik & tanpa mutasi input', () => {
    const input = 'Buka Spreadsheet RAB';
    const a = resolveNavCommand(input);
    const b = resolveNavCommand(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(input).toBe('Buka Spreadsheet RAB');
    expect(a.mode).toBe('none'); // §4.1: bahasa alami tidak menavigasi
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
    expect(filterSlashEntries('').length).toBe(33); // selaras jumlah registri (lihat R-06)
    const spr = filterSlashEntries('spr');
    expect(spr.some((e) => e.id === 'spreadsheet-rab')).toBe(true);
    const proyek = filterSlashEntries('proyek');
    expect(proyek.length).toBeGreaterThanOrEqual(5);
    expect(filterSlashEntries('zzz-tidak-ada').length).toBe(0);
  });

  it('suggestSlash: query kosong = [] (W-A-06); tanpa kemiripan = [] tanpa fallback (W-A-05)', () => {
    expect(suggestSlash('')).toEqual([]);
    expect(suggestSlash('/zzz-tidak-ada')).toEqual([]);
    expect(suggestSlash('/admin')).toEqual([]);
    // Kemiripan nyata tetap disarankan (bukan fallback buta).
    expect(suggestSlash('/spradshet').map((e) => e.id)).toContain('spreadsheet-rab');
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
