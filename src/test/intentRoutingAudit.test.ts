/**
 * Test: Audit Routing Intent Chat AI (2026-10-23)
 *
 * Regresi untuk celah routing intent yang ditemukan probe matriks frasa
 * natural (~/workspace/qa-paper/intent-probe.ts, 73 frasa): frasa umum yang
 * sebelumnya jatuh UNKNOWN ke AI atau salah intent, kini ter-route lokal
 * dengan benar. Sekaligus penjaga: perintah spesifik yang sudah benar
 * TIDAK boleh tertelan pola baru (klarifikasi / sapaan / navigasi).
 */
import { describe, it, expect } from 'vitest';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';

describe('Audit routing intent 2026-10-23 — celah yang diperbaiki', () => {
  it('sapaan "selamat pagi" -> GREETING (dulu UNKNOWN)', () => {
    expect(routeIntent('selamat pagi').intent).toBe('GREETING');
    expect(routeIntent('selamat malam').intent).toBe('GREETING');
  });

  it('sapaan dengan panggilan "halo kak" -> GREETING (dulu UNKNOWN)', () => {
    expect(routeIntent('halo kak').intent).toBe('GREETING');
    expect(routeIntent('hai ezrab').intent).toBe('GREETING');
  });

  it('"lihat template" tanpa kata rab -> OPEN_TEMPLATE (dulu UNKNOWN)', () => {
    expect(routeIntent('lihat template').intent).toBe('OPEN_TEMPLATE');
    expect(routeIntent('tampilkan template').intent).toBe('OPEN_TEMPLATE');
  });

  it('"lihat laporan proyek" -> OPEN_REPORTS, bukan OPEN_PROJECTS (dulu salah intent)', () => {
    expect(routeIntent('lihat laporan proyek').intent).toBe('OPEN_REPORTS');
    expect(routeIntent('tampilkan laporan proyek saya').intent).toBe('OPEN_REPORTS');
  });

  it('"buka pengaturan" -> OPEN_SETTINGS (dulu UNKNOWN; dulu hanya slash)', () => {
    expect(routeIntent('buka pengaturan').intent).toBe('OPEN_SETTINGS');
    expect(routeIntent('ke pengaturan').intent).toBe('OPEN_SETTINGS');
  });

  it('"cari harga satuan <objek>" -> SEARCH_AHSP dengan param (dulu UNKNOWN)', () => {
    const r = routeIntent('cari harga satuan beton k225');
    expect(r.intent).toBe('SEARCH_AHSP');
    expect(r.param).toBe('beton k225');
  });

  it('"buatkan desain rumah 5x10" -> CREATE_RAB_SUMMARY (dulu UNKNOWN; tetap bukan DIRECT)', () => {
    expect(routeIntent('buatkan desain rumah 5x10').intent).toBe('CREATE_RAB_SUMMARY');
  });

  it('"total rab proyek ini berapa?" -> QUERY_PROJECT_TOTAL (dulu UNKNOWN)', () => {
    expect(routeIntent('total rab proyek ini berapa?').intent).toBe('QUERY_PROJECT_TOTAL');
  });

  it('"proyek saya apa saja?" -> QUERY_PROJECT_LIST (dulu UNKNOWN)', () => {
    expect(routeIntent('proyek saya apa saja?').intent).toBe('QUERY_PROJECT_LIST');
  });
});

describe('Audit routing intent 2026-10-23 — penjaga anti-tertelan', () => {
  it('sapaan + perintah kerja tidak tertelan GREETING', () => {
    expect(routeIntent('halo, buatkan rab rumah type 45').intent).toBe('CREATE_RAB_DIRECT');
    expect(routeIntent('pagi ini kita bahas proyek').intent).not.toBe('GREETING');
  });

  it('"buka daftar proyek" tetap OPEN_PROJECTS (penjaga laporan tidak merusak jalur proyek)', () => {
    expect(routeIntent('buka daftar proyek').intent).toBe('OPEN_PROJECTS');
    expect(routeIntent('daftar proyek saya').intent).toBe('OPEN_PROJECTS');
  });

  it('"buka pengaturan rab" tidak masuk OPEN_SETTINGS global', () => {
    expect(routeIntent('buka pengaturan rab').intent).not.toBe('OPEN_SETTINGS');
  });

  it('kata telanjang tetap klarifikasi, bukan navigasi/pencarian', () => {
    expect(routeIntent('template').intent).toBe('CLARIFY_TOPIC');
    expect(routeIntent('ahsp').intent).toBe('CLARIFY_TOPIC');
    expect(routeIntent('cek harga').intent).toBe('CLARIFY_TOPIC');
  });

  it('perintah spesifik tidak tertelan klarifikasi', () => {
    expect(routeIntent('cari ahsp beton k-225').intent).toBe('SEARCH_AHSP');
    expect(routeIntent('buka template rab').intent).toBe('OPEN_TEMPLATE');
    expect(routeIntent('buatkan rab rumah type 45').intent).toBe('CREATE_RAB_DIRECT');
  });

  it('"cari harga satuan" telanjang tetap klarifikasi SEARCH_AHSP (bukan langsung jawab)', () => {
    const r = routeIntent('cari harga satuan');
    expect(r.intent).toBe('SEARCH_AHSP');
    expect(r.needsClarification).toBe(true);
  });
});
