/**
 * P0-B EXPORT OUTPUT TEST — isi berkas Excel/PDF aktual tidak boleh
 * mengandung identitas fiktif yang menyamar sebagai fakta.
 *
 * Menghasilkan workbook Excel nyata via exportRABToProfessionalExcel,
 * memuat ulang buffer-nya, dan memeriksa sel cover + metadata.
 *
 * Jalankan: npx tsx src/test/exportHonesty.test.ts
 */

import ExcelJS from 'exceljs';
import { exportRABToProfessionalExcel } from '../export/excelExportEngine';
import { FORBIDDEN_IDENTITY_MARKERS } from '../lib/scheduleHonesty';
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

function emptyCompany(): Company {
  return {
    id: 'comp-1',
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    taxNumber: '',
    directorName: '',
    leadEstimatorName: '',
    defaultOverheadPercent: 5,
    defaultProfitPercent: 10,
    defaultContingencyPercent: 5,
    defaultTaxPercent: 11,
  } as Company;
}

function sampleProject(): Project {
  return {
    id: 'proj-test-1',
    projectNumber: 'PRJ-TEST-001',
    name: 'Proyek Uji Kejujuran',
    location: 'Jakarta',
    clientName: 'Klien Uji',
    status: 'draft',
    sections: [
      {
        code: 'A',
        name: 'Pekerjaan Persiapan',
        items: [
          {
            id: 'i1',
            projectId: 'proj-test-1',
            code: 'A.1',
            description: 'Pembersihan lahan',
            volume: 100,
            unit: 'm2',
            unitPrice: 15000,
            amount: 1500000,
          },
        ],
      },
    ],
    rabItems: [],
  } as unknown as Project;
}

async function main(): Promise<void> {
  console.log('\n[1] Ekspor Excel dengan identitas perusahaan KOSONG:');
  const blob = await exportRABToProfessionalExcel(sampleProject(), emptyCompany(), {
    preset: 'COMPLETE_PACKAGE',
  } as any);
  check('ekspor mengembalikan Blob', blob instanceof Blob && blob.size > 0, `size=${blob.size}`);

  const buf = Buffer.from(await blob.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  // Kumpulkan semua teks dari semua sheet + metadata
  const texts: string[] = [];
  wb.eachSheet((ws) => {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const v = cell.value;
        if (typeof v === 'string') texts.push(v);
        else if (v && typeof v === 'object' && 'text' in (v as any)) texts.push(String((v as any).text));
      });
    });
  });
  texts.push(wb.creator || '', wb.lastModifiedBy || '');
  const all = texts.join('\n');

  const found = FORBIDDEN_IDENTITY_MARKERS.filter((m) => all.includes(m));
  check('tidak ada marker identitas palsu di Excel', found.length === 0,
    found.length ? `ditemukan: ${found.join(', ')}` : '');
  check('metadata creator jujur (tanpa nama palsu)',
    !FORBIDDEN_IDENTITY_MARKERS.some((m) => (wb.creator || '').includes(m)),
    `creator="${wb.creator}"`);

  console.log('\n[2] Ekspor Excel dengan identitas perusahaan NYATA:');
  const realCompany = { ...emptyCompany(), name: 'PT Maju Jaya Abadi', taxNumber: '12.345.678.9-012.345' };
  const blob2 = await exportRABToProfessionalExcel(sampleProject(), realCompany, {
    preset: 'COMPLETE_PACKAGE',
  } as any);
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(Buffer.from(await blob2.arrayBuffer()));
  const texts2: string[] = [];
  wb2.eachSheet((ws) => {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'string') texts2.push(cell.value);
      });
    });
  });
  const all2 = texts2.join('\n');
  check('nama perusahaan nyata muncul di cover', all2.includes('PT MAJU JAYA ABADI'));
  const found2 = FORBIDDEN_IDENTITY_MARKERS.filter((m) => all2.includes(m));
  check('tidak ada marker palsu tercampur', found2.length === 0,
    found2.length ? `ditemukan: ${found2.join(', ')}` : '');

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) {
    console.log('GAGAL:', failures.join(' | '));
    process.exit(1);
  } else {
    console.log('SEMUA TEST EXPORT HONESTY LOLOS');
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
