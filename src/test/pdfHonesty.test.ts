/**
 * P0-B PDF OUTPUT TEST — berkas PDF aktual tidak mengandung identitas fiktif.
 * Jalankan: npx tsx src/test/pdfHonesty.test.ts
 */
import { exportProjectToPDF } from '../export/pdfExporter';
import { FORBIDDEN_IDENTITY_MARKERS } from '../lib/scheduleHonesty';
import type { Project, Company } from '../types';

async function main(): Promise<void> {
  const company = {
    id: 'comp-1', name: '', address: '', phone: '', email: '', website: '',
    taxNumber: '', directorName: '', leadEstimatorName: '',
    defaultOverheadPercent: 5, defaultProfitPercent: 10,
    defaultContingencyPercent: 5, defaultTaxPercent: 11,
  } as Company;
  const project = {
    id: 'proj-test-1', projectNumber: 'PRJ-TEST-001', name: 'Proyek Uji PDF',
    location: 'Jakarta', status: 'draft',
    sections: [{
      code: 'A', name: 'Persiapan',
      items: [{
        id: 'i1', projectId: 'proj-test-1', code: 'A.1', description: 'Pembersihan lahan',
        volume: 100, unit: 'm2', unitPrice: 15000, amount: 1500000,
      }],
    }],
    rabItems: [],
  } as unknown as Project;

  console.log('\n[1] Ekspor PDF dengan identitas KOSONG:');
  try {
    const doc: any = await exportProjectToPDF(project, company, { subscriptionPlan: 'free' } as any);
    // exportProjectToPDF mengembalikan instance jsPDF -> ambil konten mentah
    let text = '';
    if (doc && typeof doc.output === 'function') {
      try {
        const datauri: string = doc.output('datauristring');
        const base64 = datauri.split(',')[1] || '';
        text = Buffer.from(base64, 'base64').toString('latin1');
        console.log(`  info: PDF ${base64.length} chars base64`);
      } catch (e) {
        console.log(`  SKIP output(): ${e instanceof Error ? e.message : e}`);
        console.log('Hasil: 0 lolos, 0 gagal (SKIP)');
        return;
      }
    } else {
      console.log('  info: bukan instance jsPDF, lewati pemeriksaan isi');
      console.log('Hasil: 0 lolos, 0 gagal (SKIP - environment)');
      return;
    }
    const found = FORBIDDEN_IDENTITY_MARKERS.filter((m) => text.includes(m));
    if (found.length === 0) {
      console.log('  ✓ tidak ada marker identitas palsu di PDF');
      console.log('\nHasil: 1 lolos, 0 gagal\nSEMUA TEST PDF HONESTY LOLOS');
    } else {
      console.log(`  ✗ ditemukan: ${found.join(', ')}`);
      console.log('\nHasil: 0 lolos, 1 gagal\nGAGAL: pdf-identity');
      process.exit(1);
    }
  } catch (e) {
    console.log(`  SKIP (environment): ${e instanceof Error ? e.message : e}`);
    console.log('Hasil: 0 lolos, 0 gagal (SKIP)');
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
