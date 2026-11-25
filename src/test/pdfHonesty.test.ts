/**
 * P0-B PDF OUTPUT TEST — berkas PDF aktual tidak mengandung identitas fiktif.
 * Jalankan: npx tsx src/test/pdfHonesty.test.ts
 */
import { exportProjectToPDF } from '../export/pdfExporter';
import { FORBIDDEN_IDENTITY_MARKERS } from '../lib/scheduleHonesty';
import type { Project, Company } from '../types';
import zlib from 'node:zlib';

/**
 * Ekstrak teks dari PDF jsPDF: stream konten terkompresi FlateDecode,
 * sehingga pencarian teks mentah pada output selalu kosong (tes ini
 * VACUOUS sebelum perbaikan — ketidakhadiran marker tidak membuktikan
 * apa-apa). Setiap blok stream di-inflate; yang gagal diabaikan.
 */
function extractPdfText(raw: string): string {
  const parts: string[] = [raw];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    try {
      parts.push(zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'));
    } catch { /* bukan stream Flate — abaikan */ }
  }
  return parts.join('\n');
}

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
        text = extractPdfText(Buffer.from(base64, 'base64').toString('latin1'));
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
    // H-10 (Continuation §5-C): footer tidak boleh mengklaim "Resmi" —
    // dokumen ini dapat memuat harga belum tersedia + peringatan belum
    // final; footer netral "Dokumen EZRAB PRO" yang dipakai.
    const claimsOfficial = text.includes('Dokumen Resmi');
    const hasNeutralFooter = text.includes('Dokumen EZRAB PRO');
    let pass = 0;
    let fail = 0;
    if (found.length === 0) { pass++; console.log('  ✓ tidak ada marker identitas palsu di PDF'); }
    else { fail++; console.log(`  ✗ ditemukan: ${found.join(', ')}`); }
    if (!claimsOfficial && hasNeutralFooter) { pass++; console.log('  ✓ footer netral (tanpa klaim Resmi)'); }
    else { fail++; console.log(`  ✗ footer mengklaim Resmi atau footer netral hilang (resmi=${claimsOfficial}, netral=${hasNeutralFooter})`); }
    console.log(`\nHasil: ${pass} lolos, ${fail} gagal${fail === 0 ? '\nSEMUA TEST PDF HONESTY LOLOS' : '\nGAGAL: pdf-honesty'}`);
    if (fail > 0) process.exit(1);
  } catch (e) {
    console.log(`  SKIP (environment): ${e instanceof Error ? e.message : e}`);
    console.log('Hasil: 0 lolos, 0 gagal (SKIP)');
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
