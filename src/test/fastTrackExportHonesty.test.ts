/**
 * Fast Track H-03 + H-04 — EXPORT HONESTY (workbook Excel NYATA).
 *
 * H-03: sheet 07_BOQ_MC0 tidak boleh mengarang bukti pengukuran
 * (lokasi / referensi gambar / catatan joint survey / 'Terverifikasi')
 * untuk item tanpa catatan verifikasi nyata.
 *
 * H-04: sheet 00_Validasi tidak boleh menampilkan baris PASS yang tidak
 * pernah diukur (bobot WBS literal '100.00%', konsistensi Excel/PDF,
 * '0 Formula Errors', klaim standar Permen PUPR).
 *
 * Continuation §5-C (W-EXPORT2, 2026-11-24) — EXPORT HONESTY lanjutan:
 * C1: item TANPA harga tidak pernah dilabeli OFFICIAL_AHSP (atau pasar /
 *     asumsi) di kolom Sumber — status PRICE_UNRESOLVED mengalahkan kind.
 * C2: sheet referensi (09_Materials / 10_Labor / 11_Equipment) tidak boleh
 *     mengarang provenance ('Distributor Resmi', 'SK Gubernur / SHST 2026',
 *     'Vendor Rental', tanggal hari ini) — ekspor membaca field PriceItem
 *     yang benar (supplier / priceSource / lastUpdated).
 * C3: normalizeSections meneruskan location / drawingRef item ke seksi
 *     ekspor (sheet 07_BOQ_MC0 membacanya).
 *
 * Semua asersi dibaca kembali dari workbook NYATA yang dihasilkan
 * exportRABToProfessionalExcel (pola exportHonesty.test.ts) — mesin
 * ekspor tidak di-stub.
 *
 * Jalankan: npx --yes tsx src/test/fastTrackExportHonesty.test.ts
 */

import ExcelJS from 'exceljs';
import assert from 'node:assert';
import { exportRABToProfessionalExcel, buildExcelSourceText } from '../export/excelExportEngine';
import { fallbackSourceText } from '../export/fiveSheetPreset';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { exportItemAmount, summarizeExportSections } from '../export/priceIntegrity';
import { getPriceDatabase } from '../data/indonesianPrices';
import type { Project, Company } from '../types';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, actual === expected, `harap ${JSON.stringify(expected)}, dapat ${JSON.stringify(actual)}`);
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'result' in (v as any) && typeof (v as any).result === 'number') {
    return (v as any).result;
  }
  return null;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'text' in (v as any)) return String((v as any).text);
  if (typeof v === 'number') return String(v);
  return '';
}

/** Semua teks string di satu sheet, digabung — untuk pemindaian literal palsu. */
function sheetAllText(ws: ExcelJS.Worksheet): string {
  const parts: string[] = [];
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      const t = cellText(cell);
      if (t) parts.push(t);
    });
  });
  return parts.join('\n');
}

interface ValidationRow { status: string; val: string; notes: string; rowNo: number }

/** Baris validasi dipetakan dari kolom PARAM (C) — tahan terhadap pergeseran nomor baris.
 *  Hanya baris dengan nomor urut numerik di kolom NO (B) yang dihitung:
 *  judul sheet (baris 2-3, merged B:F) ikut terbaca ExcelJS di kolom C. */
function validationRows(ws: ExcelJS.Worksheet): Map<string, ValidationRow> {
  const map = new Map<string, ValidationRow>();
  ws.eachRow((row) => {
    if (typeof row.getCell(2).value !== 'number') return;
    const param = cellText(row.getCell(3)).trim();
    if (!param) return;
    map.set(param, {
      status: cellText(row.getCell(4)).trim(),
      val: cellText(row.getCell(5)).trim(),
      notes: cellText(row.getCell(6)).trim(),
      rowNo: row.number,
    });
  });
  return map;
}

interface Mc0ItemRow { desc: string; loc: string; ref: string; notes: string; status: string; volume: number | null }

/** Baris item MC-0: kolom NO (1) numerik. Baris header WBS punya kode seksi (string) di kolom 1. */
function mc0ItemRows(ws: ExcelJS.Worksheet): Mc0ItemRow[] {
  const rows: Mc0ItemRow[] = [];
  ws.eachRow((row) => {
    if (typeof row.getCell(1).value !== 'number') return;
    rows.push({
      desc: cellText(row.getCell(3)).trim(),
      loc: cellText(row.getCell(6)).trim(),
      ref: cellText(row.getCell(7)).trim(),
      notes: cellText(row.getCell(8)).trim(),
      status: cellText(row.getCell(9)).trim(),
      volume: cellNum(row.getCell(4)),
    });
  });
  return rows;
}

interface DetailItemRow { desc: string; price: string; amount: string; source: string }

/** Baris item 05_RAB_Detail: kolom NO (1) numerik; kolom 6 = harga satuan,
 *  kolom 7 = jumlah, kolom 9 = sumber. */
function detailItemRows(ws: ExcelJS.Worksheet): DetailItemRow[] {
  const rows: DetailItemRow[] = [];
  ws.eachRow((row) => {
    if (typeof row.getCell(1).value !== 'number') return;
    rows.push({
      desc: cellText(row.getCell(3)).trim(),
      price: cellText(row.getCell(6)).trim(),
      amount: cellText(row.getCell(7)).trim(),
      source: cellText(row.getCell(9)).trim(),
    });
  });
  return rows;
}

// ---------------------------------------------------------------- fixtures

function company(): Company {
  return {
    id: 'comp-ft-1',
    name: 'PT Uji Fast Track',
    address: 'Jl. Uji No. 1, Jakarta',
    phone: '021-0000000',
    email: 'uji@fasttrack.test',
    website: '',
    taxNumber: '',
    directorName: '',
    leadEstimatorName: 'Estimator Uji',
    defaultOverheadPercent: 0,
    defaultProfitPercent: 0,
    defaultContingencyPercent: 0,
    defaultTaxPercent: 11,
  } as Company;
}

function baseProject(sections: any[]): Project {
  return {
    id: 'proj-ft-1',
    projectNumber: 'PRJ-FT-001',
    name: 'Proyek Uji Ekspor Jujur',
    location: 'Jakarta',
    clientName: 'Klien Uji',
    status: 'draft',
    currentVersion: 'Rev 00',
    sections,
    rabItems: [],
  } as unknown as Project;
}

/** Cermin probe audit W-E: 1 seksi kode 'A', 1 item, TANPA location / drawingRef / notes / verification. */
function noEvidenceProject(): Project {
  return baseProject([
    {
      id: 'sec-A',
      code: 'A',
      name: 'Pekerjaan Persiapan',
      subtotal: 1500000,
      items: [
        {
          id: 'i1',
          projectId: 'proj-ft-1',
          code: 'A.1',
          description: 'Pembersihan lahan',
          volume: 100,
          unit: 'm2',
          unitPrice: 15000,
          amount: 1500000,
          totalPrice: 1500000,
        },
      ],
    },
  ]);
}

/** Satu item tanpa bukti + satu item DENGAN catatan verifikasi nyata (kontrol positif). */
function mixedEvidenceProject(): Project {
  return baseProject([
    {
      id: 'sec-A',
      code: 'A',
      name: 'Pekerjaan Persiapan',
      subtotal: 2500000,
      items: [
        {
          id: 'i1',
          projectId: 'proj-ft-1',
          code: 'A.1',
          description: 'Pembersihan lahan',
          volume: 100,
          unit: 'm2',
          unitPrice: 15000,
          amount: 1500000,
          totalPrice: 1500000,
        },
        {
          id: 'i2',
          projectId: 'proj-ft-1',
          code: 'A.2',
          description: 'Pengecoran kolom terverifikasi',
          volume: 50,
          unit: 'm2',
          unitPrice: 20000,
          amount: 1000000,
          totalPrice: 1000000,
          location: 'Lantai 2 — Ruang Rapat',
          drawingRef: 'A-101 Rev 02',
          notes: 'Diukur bersama pengawas 20 Nov 2026',
          verificationStatus: 'VERIFIED',
          verificationDate: '2026-11-20T10:00:00.000Z',
        },
      ],
    },
  ]);
}

/**
 * Bobot sengaja inkonsisten: seksi A berharga Rp1.500.000 + seksi B TANPA
 * item tetapi subtotal tersimpan Rp500.000. Direct Cost engine mencakup
 * subtotal seksi kosong (Rp2.000.000), sedangkan jumlah bobot seksi dari
 * total berharga hanya Rp1.500.000 → jumlah bobot sejati 75,00%.
 */
function inconsistentWeightsProject(): Project {
  return baseProject([
    {
      id: 'sec-A',
      code: 'A',
      name: 'Pekerjaan Persiapan',
      subtotal: 1500000,
      items: [
        {
          id: 'i1',
          projectId: 'proj-ft-1',
          code: 'A.1',
          description: 'Pembersihan lahan',
          volume: 100,
          unit: 'm2',
          unitPrice: 15000,
          amount: 1500000,
          totalPrice: 1500000,
        },
      ],
    },
    {
      id: 'sec-B',
      code: 'B',
      name: 'Pekerjaan Struktur',
      subtotal: 500000,
      items: [],
    },
  ]);
}

/** Tanpa satu pun item berharga → Direct Cost 0 → jumlah bobot tak dapat dihitung. */
function unpricedProject(): Project {
  return baseProject([
    {
      id: 'sec-A',
      code: 'A',
      name: 'Pekerjaan Persiapan',
      subtotal: 0,
      items: [
        {
          id: 'i1',
          projectId: 'proj-ft-1',
          code: 'A.1',
          description: 'Pekerjaan belum ada harga',
          volume: 100,
          unit: 'm2',
          unitPrice: 0,
          amount: 0,
          totalPrice: 0,
          priceStatus: 'PRICE_UNRESOLVED',
        },
      ],
    },
  ]);
}

/** C1: item tanpa harga yang mengklaim kind OFFICIAL_AHSP (kombinasi yang
 *  dapat diproduksi factory: kode AHSP kanonis-SAFE tetapi resolusi harga
 *  gagal) + dua kontrol: RESOLVED+OFFICIAL (tetap tampil resmi) dan
 *  RESOLVED+kind UNRESOLVED (klaim ditolak factory, harga ada — bukan
 *  "HARGA BELUM TERSEDIA"). */
function unresolvedOfficialProject(): Project {
  return baseProject([
    {
      id: 'sec-A',
      code: 'A',
      name: 'Pekerjaan Persiapan',
      subtotal: 50000,
      items: [
        {
          id: 'i1',
          projectId: 'proj-ft-1',
          code: 'A.1',
          description: 'Pekerjaan tanpa harga berkode AHSP',
          volume: 10,
          unit: 'm2',
          unitPrice: 0,
          amount: 0,
          totalPrice: 0,
          priceStatus: 'PRICE_UNRESOLVED',
          priceSourceKind: 'OFFICIAL_AHSP',
          ahspCode: 'A.1',
        },
        {
          id: 'i2',
          projectId: 'proj-ft-1',
          code: 'A.2',
          description: 'Pekerjaan resmi berharga',
          volume: 10,
          unit: 'm2',
          unitPrice: 5000,
          amount: 50000,
          totalPrice: 50000,
          priceStatus: 'PRICE_RESOLVED',
          priceSourceKind: 'OFFICIAL_AHSP',
          ahspCode: 'D.4',
        },
        {
          id: 'i3',
          projectId: 'proj-ft-1',
          code: 'A.3',
          description: 'Pekerjaan berharga klaim ditolak',
          volume: 10,
          unit: 'm2',
          unitPrice: 5000,
          amount: 50000,
          totalPrice: 50000,
          priceStatus: 'PRICE_RESOLVED',
          priceSourceKind: 'UNRESOLVED',
          ahspCode: 'C.9',
        },
      ],
    },
  ]);
}

/** C3: proyek TANPA seksi tersimpan — seksi direkonstruksi normalizeSections
 *  dari rabItems datar. Satu item membawa location/drawingRef, satu tidak. */
function flatItemsProject(): Project {
  return {
    id: 'proj-ft-1',
    projectNumber: 'PRJ-FT-001',
    name: 'Proyek Uji Ekspor Jujur',
    location: 'Jakarta',
    clientName: 'Klien Uji',
    status: 'draft',
    currentVersion: 'Rev 00',
    sections: [],
    rabItems: [
      {
        id: 'f1',
        projectId: 'proj-ft-1',
        code: 'A.1',
        category: 'Pekerjaan Persiapan',
        description: 'Pembersihan lahan berdenah',
        volume: 100,
        unit: 'm2',
        unitPrice: 15000,
        amount: 1500000,
        totalPrice: 1500000,
        location: 'Zona A — Sisi Timur',
        drawingRef: 'B-201 Rev 01',
      },
      {
        id: 'f2',
        projectId: 'proj-ft-1',
        code: 'A.2',
        category: 'Pekerjaan Persiapan',
        description: 'Pembersihan lahan tanpa denah',
        volume: 50,
        unit: 'm2',
        unitPrice: 15000,
        amount: 750000,
        totalPrice: 750000,
      },
    ],
  } as unknown as Project;
}

const FULL_SHEETS = {
  validation: true, cover: true, projectInfo: true, estimateSummary: true,
  rabRecap: true, rabDetail: true, boq: true, boqMc0: true, ahsp: true,
  materials: true, labor: true, equipment: true, schedule: true,
  kurvaS: true, cashflow: true, notes: true,
};

async function exportWorkbook(project: Project, sheets: Record<string, boolean>): Promise<ExcelJS.Workbook> {
  const blob = await exportRABToProfessionalExcel(project, company(), { sheets } as any);
  assert.ok(blob instanceof Blob && blob.size > 0, 'ekspor mengembalikan Blob tak kosong');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  return wb;
}

/** Hitung ulang jumlah bobot WBS secara independen dari data fixture (bukan dari variabel mesin). */
function expectedWeightSumPct(project: Project): number | null {
  const sections = UnifiedProjectEngine.normalizeSections(project);
  const summary = summarizeExportSections(sections as any);
  const cost = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections);
  if (!(cost.directCost > 0)) return null;
  return (summary.pricedTotal / cost.directCost) * 100;
}

// ---------------------------------------------------------------- H-03

async function testH03NoEvidence(): Promise<void> {
  console.log('\n[H-03/1] MC-0 tanpa bukti — workbook nyata, proyek tanpa location/drawingRef/notes:');
  const wb = await exportWorkbook(noEvidenceProject(), FULL_SHEETS);
  const mc0 = wb.getWorksheet('07_BOQ_MC0');
  assert.ok(mc0, 'sheet 07_BOQ_MC0 ada');

  const items = mc0ItemRows(mc0!);
  eq('MC-0: 1 baris item', items.length, 1);
  eq('MC-0: volume tetap diekspor (100)', items[0].volume, 100);
  eq('MC-0: lokasi tanpa bukti = Tidak tersedia', items[0].loc, 'Tidak tersedia');
  eq('MC-0: referensi gambar tanpa bukti = Tidak tersedia', items[0].ref, 'Tidak tersedia');
  eq('MC-0: catatan tanpa bukti = Tidak tersedia', items[0].notes, 'Tidak tersedia');
  eq('MC-0: status tanpa catatan verifikasi = Belum Terverifikasi', items[0].status, 'Belum Terverifikasi');

  const all = sheetAllText(mc0!);
  check('MC-0: tanpa teks Seluruh Area Bangunan', !all.includes('Seluruh Area Bangunan'));
  check('MC-0: tanpa ref DWG- sintetis', !all.includes('DWG-'), all.slice(0, 300));
  check('MC-0: tanpa teks Joint Survey', !all.includes('Joint Survey'));
  check('MC-0: tanpa teks joint survey (apa pun kapitalisasinya)', !/joint survey/i.test(all));

  const note = cellText(mc0!.getCell('A4'));
  check('MC-0: catatan header menyatakan volume diambil dari RAB', note.includes('diambil dari RAB'), note);
  check('MC-0: catatan header menyatakan bukan hasil pengukuran lapangan', note.includes('bukan dari hasil pengukuran lapangan'), note);
}

async function testH03PositiveControl(): Promise<void> {
  console.log('\n[H-03/2] MC-0 kontrol positif — item DENGAN catatan verifikasi nyata:');
  const wb = await exportWorkbook(mixedEvidenceProject(), FULL_SHEETS);
  const mc0 = wb.getWorksheet('07_BOQ_MC0');
  assert.ok(mc0, 'sheet 07_BOQ_MC0 ada');

  const items = mc0ItemRows(mc0!);
  eq('MC-0: 2 baris item', items.length, 2);
  const verified = items.find((r) => r.desc === 'Pengecoran kolom terverifikasi');
  const plain = items.find((r) => r.desc === 'Pembersihan lahan');
  assert.ok(verified, 'baris terverifikasi ditemukan');
  assert.ok(plain, 'baris tanpa bukti ditemukan');

  eq('MC-0: lokasi asli ditampilkan verbatim', verified!.loc, 'Lantai 2 — Ruang Rapat');
  eq('MC-0: referensi gambar asli ditampilkan verbatim', verified!.ref, 'A-101 Rev 02');
  eq('MC-0: catatan asli ditampilkan verbatim', verified!.notes, 'Diukur bersama pengawas 20 Nov 2026');
  eq('MC-0: VERIFIED + verificationDate = Terverifikasi', verified!.status, 'Terverifikasi');

  eq('MC-0: item tanpa bukti di workbook yang sama tetap Tidak tersedia (lokasi)', plain!.loc, 'Tidak tersedia');
  eq('MC-0: item tanpa bukti di workbook yang sama tetap Belum Terverifikasi', plain!.status, 'Belum Terverifikasi');

  const all = sheetAllText(mc0!);
  check('MC-0: tanpa ref DWG- sintetis (pola DWG-KODE-nomor)', !/DWG-[A-Z]+-\d+/.test(all));
  check('MC-0: tanpa teks Seluruh Area Bangunan', !all.includes('Seluruh Area Bangunan'));
  check('MC-0: tanpa teks Joint Survey', !/joint survey/i.test(all));

  // Bila ada catatan verifikasi di sheet, catatan header "diambil dari RAB" tidak ditampilkan.
  eq('MC-0: catatan header RAB absen bila ada item terverifikasi', cellText(mc0!.getCell('A4')), '');
}

// ---------------------------------------------------------------- H-04

async function testH04Consistent(): Promise<void> {
  console.log('\n[H-04/1] 00_Validasi — proyek konsisten (bobot sejati 100%):');
  const project = noEvidenceProject();
  const wb = await exportWorkbook(project, FULL_SHEETS);
  const val = wb.getWorksheet('00_Validasi');
  assert.ok(val, 'sheet 00_Validasi ada');

  const rows = validationRows(val!);
  eq('Validasi: 5 baris (2 baris palsu dihapus dari 7)', rows.size, 5);
  check('Validasi: baris Konsistensi Grand Total (Excel/PDF) DIHAPUS', !rows.has('Konsistensi Grand Total (Excel/PDF)'));
  check('Validasi: baris Integritas Formula Matematika DIHAPUS', !rows.has('Integritas Formula Matematika'));

  const all = sheetAllText(val!);
  check('Validasi: tanpa literal 0 Formula Errors', !all.includes('0 Formula Errors'));
  check('Validasi: tanpa klaim terstandar', !all.includes('terstandar'));

  // Bobot: nilai HARUS sama dengan hitung ulang independen dari data fixture.
  const expected = expectedWeightSumPct(project);
  assert.ok(expected != null, 'bobot harapan terhitung');
  const weight = rows.get('Total Akumulasi Bobot WBS');
  assert.ok(weight, 'baris Total Akumulasi Bobot WBS ada');
  eq('Validasi: bobot = jumlah terhitung independen', weight!.val, `${expected!.toFixed(2)}%`);
  eq('Validasi: bobot 100% terhitung = PASS', weight!.status, 'PASS');
  check('Validasi: catatan bobot menjelaskan perhitungan', weight!.notes.includes('dihitung dari total berharga'));

  // Klaim standar WBS diganti deskripsi jujur tentang yang diperiksa.
  const wbs = rows.get('Kelompok Pekerjaan (WBS)');
  assert.ok(wbs, 'baris Kelompok Pekerjaan (WBS) ada');
  eq('Validasi: WBS tetap PASS atas hitungan divisi', wbs!.status, 'PASS');
  eq('Validasi: WBS tetap 1 Divisi WBS', wbs!.val, '1 Divisi WBS');
  check('Validasi: catatan WBS menyatakan Permen PUPR tidak diperiksa', wbs!.notes.includes('tidak diperiksa'), wbs!.notes);
  check('Validasi: catatan WBS tanpa klaim terstandar', !wbs!.notes.includes('terstandar'));

  // Baris yang benar-benar dihitung (audit: baris 6, 8, 11) TIDAK BERUBAH isinya.
  const items = rows.get('Kelengkapan Item Pekerjaan (RAB)');
  assert.ok(items, 'baris Kelengkapan Item ada');
  eq('Validasi [asli]: Kelengkapan Item status PASS', items!.status, 'PASS');
  eq('Validasi [asli]: Kelengkapan Item val 1 Item Terdaftar', items!.val, '1 Item Terdaftar');
  eq('Validasi [asli]: Kelengkapan Item catatan utuh', items!.notes, 'Seluruh rincian volume & satuan terdaftar lengkap.');

  const integrity = rows.get('Integritas Volume & Harga Satuan');
  assert.ok(integrity, 'baris Integritas Volume & Harga ada');
  eq('Validasi [asli]: Integritas Volume status PASS', integrity!.status, 'PASS');
  eq('Validasi [asli]: Integritas Volume val utuh', integrity!.val, 'Valid Tanpa Nilai Kosong');
  eq('Validasi [asli]: Integritas Volume catatan utuh', integrity!.notes, 'Seluruh baris memiliki volume & harga positif.');

  const schedule = rows.get('Kesiapan Data Jadwal & Kurva-S');
  assert.ok(schedule, 'baris Kesiapan Jadwal ada');
  eq('Validasi [asli]: Kesiapan Jadwal status DATA INCOMPLETE', schedule!.status, 'DATA INCOMPLETE');
  eq('Validasi [asli]: Kesiapan Jadwal val utuh', schedule!.val, 'Jadwal Belum Dikonfigurasi');
  check('Validasi [asli]: Kesiapan Jadwal catatan menyebut jadwal', /jadwal/i.test(schedule!.notes), schedule!.notes);
}

async function testH04Inconsistent(): Promise<void> {
  console.log('\n[H-04/2] 00_Validasi — bobot sengaja inkonsisten (seksi kosong bersubtotal):');
  const project = inconsistentWeightsProject();
  const wb = await exportWorkbook(project, FULL_SHEETS);
  const val = wb.getWorksheet('00_Validasi');
  assert.ok(val, 'sheet 00_Validasi ada');

  const expected = expectedWeightSumPct(project);
  assert.ok(expected != null, 'bobot harapan terhitung');
  eq('Bobot harapan inkonsisten = 75.00%', expected!.toFixed(2), '75.00');

  const rows = validationRows(val!);
  const weight = rows.get('Total Akumulasi Bobot WBS');
  assert.ok(weight, 'baris Total Akumulasi Bobot WBS ada');
  eq('Validasi: bobot inkonsisten = 75.00% terhitung (bukan literal 100%)', weight!.val, '75.00%');
  eq('Validasi: bobot inkonsisten = WARNING (bukan PASS)', weight!.status, 'WARNING');

  const all = sheetAllText(val!);
  check('Validasi: tanpa 100.00% saat jumlah bobot sejati bukan 100%', !all.includes('100.00%'));
  check('Validasi: tanpa literal 0 Formula Errors', !all.includes('0 Formula Errors'));
  check('Validasi: tanpa baris Konsistensi Grand Total (Excel/PDF)', !all.includes('Konsistensi Grand Total (Excel/PDF)'));

  const wbs = rows.get('Kelompok Pekerjaan (WBS)');
  assert.ok(wbs, 'baris Kelompok Pekerjaan (WBS) ada');
  eq('Validasi: WBS menghitung 2 divisi', wbs!.val, '2 Divisi WBS');
}

async function testH04Unpriced(): Promise<void> {
  console.log('\n[H-04/3] 00_Validasi — tanpa total berharga (bobot tak dapat dihitung):');
  const wb = await exportWorkbook(unpricedProject(), { validation: true });
  const val = wb.getWorksheet('00_Validasi');
  assert.ok(val, 'sheet 00_Validasi ada');

  const rows = validationRows(val!);
  const weight = rows.get('Total Akumulasi Bobot WBS');
  assert.ok(weight, 'baris Total Akumulasi Bobot WBS ada');
  eq('Validasi: bobot tanpa pembagi = TIDAK DIPERIKSA', weight!.status, 'TIDAK DIPERIKSA');
  eq('Validasi: bobot tanpa pembagi = Tidak dapat dihitung', weight!.val, 'Tidak dapat dihitung');

  const all = sheetAllText(val!);
  check('Validasi: tanpa 100.00% saat bobot tak dapat dihitung', !all.includes('100.00%'));

  const items = rows.get('Kelengkapan Item Pekerjaan (RAB)');
  assert.ok(items, 'baris Kelengkapan Item ada');
  eq('Validasi [asli]: Kelengkapan Item tetap PASS', items!.status, 'PASS');
}

// ---------------------------------------------------------------- totals guard

async function testTotalsUnchanged(): Promise<void> {
  console.log('\n[Total] Grand total ekspor = grand total engine (rantai nilai utuh):');
  const project = noEvidenceProject();
  const sections = UnifiedProjectEngine.normalizeSections(project);
  const expected = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections);

  const wb = await exportWorkbook(project, FULL_SHEETS);
  const sum = wb.getWorksheet('03_Estimate_Summary');
  assert.ok(sum, 'sheet 03_Estimate_Summary ada');
  eq('Total: kartu grand total ringkasan = engine', cellNum(sum!.getCell('E5')), expected.grandTotal);

  const cover = wb.getWorksheet('01_Cover');
  assert.ok(cover, 'sheet cover ada');
  eq('Total: grand total cover = engine', cellNum(cover!.getCell('B20')), expected.grandTotal);

  // Jumlah item terhitung dari gerbang ekspor (bukan dari variabel mesin ekspor).
  const priced = sections.reduce((s, sec) => s + sec.items.reduce((a, it) => a + (exportItemAmount(it as any) ?? 0), 0), 0);
  eq('Total: direct cost engine = jumlah item tergerbang', expected.directCost, priced);
  eq('Total: direct cost fixture = 1500000', expected.directCost, 1500000);
}

// ---------------------------------------------------------------- C1: no-price item never OFFICIAL_AHSP

async function testC1SourceTextUnresolvedFirst(): Promise<void> {
  console.log('\n[C1/1] buildExcelSourceText — status UNRESOLVED mengalahkan kind:');
  eq(
    'C1: UNRESOLVED + OFFICIAL_AHSP = HARGA BELUM TERSEDIA',
    buildExcelSourceText({ priceStatus: 'PRICE_UNRESOLVED', priceSourceKind: 'OFFICIAL_AHSP', ahspCode: 'A.1' }),
    'HARGA BELUM TERSEDIA — A.1',
  );
  eq(
    'C1: UNRESOLVED + MARKET_REFERENCE = HARGA BELUM TERSEDIA',
    buildExcelSourceText({ priceStatus: 'PRICE_UNRESOLVED', priceSourceKind: 'MARKET_REFERENCE', ahspCode: 'B.2' }),
    'HARGA BELUM TERSEDIA — B.2',
  );
  eq(
    'C1: UNRESOLVED + EZRAB_ASSUMPTION = HARGA BELUM TERSEDIA',
    buildExcelSourceText({ priceStatus: 'PRICE_UNRESOLVED', priceSourceKind: 'EZRAB_ASSUMPTION', ahspCode: 'C.3' }),
    'HARGA BELUM TERSEDIA — C.3',
  );
  eq(
    'C1: RESOLVED + OFFICIAL_AHSP tetap tampil kode resmi (tanpa regresi)',
    buildExcelSourceText({ priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', ahspCode: 'D.4' }),
    'D.4',
  );
  eq(
    'C1: RESOLVED + kind UNRESOLVED jatuh ke label legacy, BUKAN HARGA BELUM TERSEDIA',
    buildExcelSourceText({ priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'UNRESOLVED', ahspCode: 'C.9' }),
    'C.9',
  );
  eq(
    'C1: MANUAL + OFFICIAL_AHSP tetap INPUT MANUAL (tanpa regresi)',
    buildExcelSourceText({ priceStatus: 'PRICE_MANUAL', priceSourceKind: 'OFFICIAL_AHSP', ahspCode: 'E.5' }),
    'INPUT MANUAL',
  );
}

async function testC1DetailSheetUnresolvedOfficial(): Promise<void> {
  console.log('\n[C1/2] 05_RAB_Detail — item tanpa harga berkode AHSP (workbook nyata):');
  const wb = await exportWorkbook(unresolvedOfficialProject(), FULL_SHEETS);
  const detail = wb.getWorksheet('05_RAB_Detail');
  assert.ok(detail, 'sheet 05_RAB_Detail ada');

  const rows = detailItemRows(detail!);
  eq('C1: 3 baris item detail', rows.length, 3);
  const unpriced = rows.find((r) => r.desc === 'Pekerjaan tanpa harga berkode AHSP');
  const official = rows.find((r) => r.desc === 'Pekerjaan resmi berharga');
  const rejected = rows.find((r) => r.desc === 'Pekerjaan berharga klaim ditolak');
  assert.ok(unpriced, 'baris tanpa harga ditemukan');
  assert.ok(official, 'baris resmi ditemukan');
  assert.ok(rejected, 'baris klaim ditolak ditemukan');

  eq('C1: harga item tanpa harga = HARGA BELUM TERSEDIA', unpriced!.price, 'HARGA BELUM TERSEDIA');
  eq('C1: jumlah item tanpa harga = –', unpriced!.amount, '–');
  eq('C1: sumber item tanpa harga = HARGA BELUM TERSEDIA — A.1', unpriced!.source, 'HARGA BELUM TERSEDIA — A.1');
  check('C1: sumber item tanpa harga bukan kode AHSP mentah', unpriced!.source !== 'A.1');
  check('C1: sumber item tanpa harga bukan RESMI AHSP', !unpriced!.source.includes('RESMI AHSP'));

  eq('C1: sumber item resmi berharga tetap kode AHSP', official!.source, 'D.4');
  eq('C1: sumber item berharga klaim ditolak = kode (bukan HARGA BELUM TERSEDIA)', rejected!.source, 'C.9');
  check('C1: harga item klaim ditolak tetap angka (Rp5.000)', rejected!.price === '5000', rejected!.price);
}

async function testC1FallbackSourceTextMirror(): Promise<void> {
  // C1 (koordinator): fallbackSourceText (fiveSheetPreset, dipakai bila
  // pemanggil tidak mengumpan buildExcelSourceText) WAJIB mencerminkan
  // aturan yang sama — urutan lamanya memeriksa kind OFFICIAL_AHSP
  // sebelum status UNRESOLVED (bug FIX 1 yang sama) dan memaksa teks
  // tanpa-harga pada kind UNRESOLVED yang harganya teresolusi.
  console.log('\n[C1/3] fallbackSourceText — cermin aturan UNRESOLVED-first:');
  eq(
    'C1: fallback UNRESOLVED + OFFICIAL_AHSP = HARGA BELUM TERSEDIA',
    fallbackSourceText({ priceStatus: 'PRICE_UNRESOLVED', priceSourceKind: 'OFFICIAL_AHSP', ahspCode: 'A.1' } as any),
    'HARGA BELUM TERSEDIA',
  );
  eq(
    'C1: fallback UNRESOLVED + MARKET_REFERENCE = HARGA BELUM TERSEDIA',
    fallbackSourceText({ priceStatus: 'PRICE_UNRESOLVED', priceSourceKind: 'MARKET_REFERENCE', ahspCode: 'B.2' } as any),
    'HARGA BELUM TERSEDIA',
  );
  eq(
    'C1: fallback RESOLVED + OFFICIAL_AHSP tetap tampil kode resmi',
    fallbackSourceText({ priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', ahspCode: 'D.4' } as any),
    'D.4',
  );
  eq(
    'C1: fallback RESOLVED + kind UNRESOLVED jatuh ke label legacy, BUKAN HARGA BELUM TERSEDIA',
    fallbackSourceText({ priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'UNRESOLVED', ahspCode: 'C.9' } as any),
    'C.9',
  );
  eq(
    'C1: fallback MANUAL + OFFICIAL_AHSP tetap INPUT MANUAL',
    fallbackSourceText({ priceStatus: 'PRICE_MANUAL', priceSourceKind: 'OFFICIAL_AHSP', ahspCode: 'E.5' } as any),
    'INPUT MANUAL',
  );
}

// ---------------------------------------------------------------- C2: reference sheets, real provenance

async function testC2ReferenceSheetsRealProvenance(): Promise<void> {
  console.log('\n[C2] Sheet referensi — provenance nyata dari PriceItem (workbook nyata):');
  const wb = await exportWorkbook(noEvidenceProject(), FULL_SHEETS);

  const matDb = getPriceDatabase('MATERIAL') as any[];
  const labDb = getPriceDatabase('LABOR') as any[];
  const eqDb = getPriceDatabase('EQUIPMENT') as any[];
  assert.ok(matDb.length > 0 && labDb.length > 0 && eqDb.length > 0, 'DB harga referensi terisi');

  const mat = wb.getWorksheet('09_Materials');
  assert.ok(mat, 'sheet 09_Materials ada');
  eq('C2: material baris 1 = nama DB', cellText(mat!.getCell('C6')).trim(), matDb[0].name);
  eq('C2: material baris 1 spesifikasi = DB (bukan Standar SNI karangan)', cellText(mat!.getCell('D6')).trim(), matDb[0].specification);
  eq('C2: material baris 1 vendor = supplier DB', cellText(mat!.getCell('H6')).trim(), matDb[0].supplier);
  eq('C2: material baris 1 tanggal = lastUpdated DB (bukan tanggal hari ini)', cellText(mat!.getCell('I6')).trim(), matDb[0].lastUpdated);
  check('C2: sheet material tanpa Distributor Resmi', !sheetAllText(mat!).includes('Distributor Resmi'));

  const lab = wb.getWorksheet('10_Labor');
  assert.ok(lab, 'sheet 10_Labor ada');
  eq('C2: labor baris 1 sumber = priceSource DB', cellText(lab!.getCell('G6')).trim(), labDb[0].priceSource);
  check('C2: sheet labor tanpa SK Gubernur / SHST 2026', !sheetAllText(lab!).includes('SK Gubernur / SHST 2026'));

  const eqp = wb.getWorksheet('11_Equipment');
  assert.ok(eqp, 'sheet 11_Equipment ada');
  eq('C2: equipment baris 1 sumber = priceSource DB', cellText(eqp!.getCell('G6')).trim(), eqDb[0].priceSource);
  check('C2: sheet equipment tanpa Vendor Rental', !sheetAllText(eqp!).includes('Vendor Rental'));
}

// ---------------------------------------------------------------- C3: location / drawingRef survive normalizeSections

async function testC3NormalizeSectionsLocationDrawingRef(): Promise<void> {
  console.log('\n[C3] normalizeSections — location/drawingRef diteruskan ke ekspor:');
  const project = flatItemsProject();
  const sections = UnifiedProjectEngine.normalizeSections(project);
  eq('C3: 1 seksi direkonstruksi dari rabItems datar', sections.length, 1);
  eq('C3: 2 item direkonstruksi', sections[0].items.length, 2);
  const withRef = (sections[0].items as any[]).find((it) => it.id === 'f1');
  const withoutRef = (sections[0].items as any[]).find((it) => it.id === 'f2');
  assert.ok(withRef, 'item berdenah ditemukan di seksi rekonstruksi');
  assert.ok(withoutRef, 'item tanpa denah ditemukan di seksi rekonstruksi');
  eq('C3: location diteruskan verbatim', withRef.location, 'Zona A — Sisi Timur');
  eq('C3: drawingRef diteruskan verbatim', withRef.drawingRef, 'B-201 Rev 01');
  check('C3: item tanpa location tetap tanpa field (tidak dikarang)', withoutRef.location === undefined);
  check('C3: item tanpa drawingRef tetap tanpa field (tidak dikarang)', withoutRef.drawingRef === undefined);

  const wb = await exportWorkbook(project, FULL_SHEETS);
  const mc0 = wb.getWorksheet('07_BOQ_MC0');
  assert.ok(mc0, 'sheet 07_BOQ_MC0 ada');
  const items = mc0ItemRows(mc0!);
  eq('C3: 2 baris item MC-0', items.length, 2);
  const mc0With = items.find((r) => r.desc === 'Pembersihan lahan berdenah');
  const mc0Without = items.find((r) => r.desc === 'Pembersihan lahan tanpa denah');
  assert.ok(mc0With, 'baris MC-0 berdenah ditemukan');
  assert.ok(mc0Without, 'baris MC-0 tanpa denah ditemukan');
  eq('C3: MC-0 lokasi rekonstruksi tampil verbatim', mc0With!.loc, 'Zona A — Sisi Timur');
  eq('C3: MC-0 referensi gambar rekonstruksi tampil verbatim', mc0With!.ref, 'B-201 Rev 01');
  eq('C3: MC-0 item tanpa denah tetap Tidak tersedia (lokasi)', mc0Without!.loc, 'Tidak tersedia');
  eq('C3: MC-0 item tanpa denah tetap Tidak tersedia (referensi)', mc0Without!.ref, 'Tidak tersedia');
}

async function main(): Promise<void> {
  await testH03NoEvidence();
  await testH03PositiveControl();
  await testH04Consistent();
  await testH04Inconsistent();
  await testH04Unpriced();
  await testTotalsUnchanged();
  await testC1SourceTextUnresolvedFirst();
  await testC1DetailSheetUnresolvedOfficial();
  await testC1FallbackSourceTextMirror();
  await testC2ReferenceSheetsRealProvenance();
  await testC3NormalizeSectionsLocationDrawingRef();

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) {
    console.log('GAGAL:', failures.join(' | '));
    process.exit(1);
  } else {
    console.log('SEMUA TEST FAST TRACK EXPORT HONESTY LOLOS');
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
