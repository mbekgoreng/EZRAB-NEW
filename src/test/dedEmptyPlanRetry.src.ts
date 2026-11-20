/**
 * dedEmptyPlanRetry.src.ts — RETRY BILA HASIL 0 ITEM (DED Full AI).
 *
 * Insiden live 2026-11-20 21:17-21:18 (Preview brxi1ux47): DED Full AI
 * (Cepat) pada PDF gambar rumah 1 lantai selesai end-to-end via ArxPay
 * (HTTP 200) tetapi menghasilkan 0 item — kedua jawaban model tepat
 * 8000 output token (plafon sisi ArxPay; Full AI Cepat meminta 16000),
 * rencana terpotong, dan pipeline menerima rencana kosong sebagai
 * sukses diam-diam: retry pecah-grup hanya jalan bila extractJson
 * MELEMPAR (JSON invalid), bukan bila items kosong.
 *
 * Perbaikan (src/ai-tools/ded-full-ai/service.ts, loop kelompok):
 * rencana yang ter-parse VALID tetapi 0 item kini diperlakukan SAMA
 * seperti JSON invalid — pecah grup dua + jalankan ulang (batas
 * kedalaman 2, sama seperti INVALID_JSON); bila tak bisa dipecah lagi,
 * grup dicatat failedGroups code EMPTY_PLAN (bukan sukses diam-diam).
 * Grup berisi (>=1 item) tidak berubah perilakunya.
 *
 * Suite ini skrip asersi tsx polos (pola dedPdfjsCompat.src.ts):
 * PDF sintetis minimal dibangun di dalam tes, aiToolsProviderClient
 * di-stub per skenario — TANPA panggilan AI berbayar, tanpa jaringan.
 * Jalankan dari ROOT repo: npx --yes tsx src/test/dedEmptyPlanRetry.src.ts
 * (setiap execute() Full AI memakai minimum 3 detik — total ~30 detik.)
 */
import { fullAiDedService } from '../ai-tools/ded-full-ai/service';
import { aiToolsProviderClient } from '../ai-tools/providerClient';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------------------------------------------------------------------------
// PDF sintetis minimal (generator yang sama dengan probe /tmp/probe-pdf.mjs)
// ---------------------------------------------------------------------------
function escapePdfText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(pageTexts: string[]): Buffer {
  const objects: string[] = [];
  const n = pageTexts.length;
  const fontObj = 3 + n;
  const contentStart = fontObj + 1;
  const kids = pageTexts.map((_, i) => `${3 + i} 0 R`).join(' ');
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
  for (let i = 0; i < n; i++) {
    objects[3 + i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentStart + i} 0 R >>`;
  }
  objects[fontObj] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (let i = 0; i < n; i++) {
    const stream = `BT /F1 12 Tf 72 720 Td (${escapePdfText(pageTexts[i])}) Tj ET`;
    objects[contentStart + i] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  const total = contentStart + n;
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < total; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

// ---------------------------------------------------------------------------
// Mock client: aiToolsProviderClient.execute di-stub per skenario.
// Bentuk hasil mengikuti AiToolsSuccess (providerClient.ts:179).
// Harga mock = nilai CONTOH skema di prompts.ts (85000 dst.) — fixture tes
// semata, bukan harga pasar, bukan harga AHSP.
// ---------------------------------------------------------------------------
const M1 = 'MARKER-HALAMAN-SATU';
const M2 = 'MARKER-HALAMAN-DUA';
const M3 = 'MARKER-HALAMAN-TIGA';
const M4 = 'MARKER-HALAMAN-EMPAT';

const itemPondasi = {
  no: 1, name: 'Galian tanah pondasi', category: 'Tanah', wbsGroup: 'Pekerjaan Tanah dan Pondasi',
  qty: 9.6, unit: 'm3', formula: '30 x 0.32', provenance: 'DERIVED',
  assumptions: 'panjang pondasi 30m dari keliling', price: 85000, priceUnit: 'm3', priceSource: 'AI_ESTIMATE',
};
const itemDinding = {
  no: 2, name: 'Dinding bata merah', category: 'Dinding', wbsGroup: 'Pekerjaan Dinding',
  qty: 42, unit: 'm2', formula: '60 x 0.7', provenance: 'DERIVED',
  assumptions: 'keliling dinding 60m', price: 95000, priceUnit: 'm2', priceSource: 'AI_ESTIMATE',
};
const itemAtap = {
  no: 3, name: 'Rangka atap baja ringan', category: 'Atap', wbsGroup: 'Pekerjaan Atap',
  qty: 86, unit: 'm2', formula: '86', provenance: 'ASSUMPTION',
  assumptions: 'luas denah 86 m2', price: 125000, priceUnit: 'm2', priceSource: 'AI_ESTIMATE',
};
const itemLantai = {
  no: 4, name: 'Lantai keramik', category: 'Lantai', wbsGroup: 'Pekerjaan Lantai',
  qty: 80, unit: 'm2', formula: '80', provenance: 'DERIVED',
  assumptions: 'luas lantai 80 m2', price: 75000, priceUnit: 'm2', priceSource: 'AI_ESTIMATE',
};

type Behavior = (prompt: string) => unknown;
let behavior: Behavior = () => ({ items: [] });
let callCount = 0;
let callPrompts: string[] = [];

const origExecute = aiToolsProviderClient.execute.bind(aiToolsProviderClient);
(aiToolsProviderClient as any).execute = async (request: any) => {
  callCount++;
  callPrompts.push(String(request?.prompt || ''));
  const payload = behavior(String(request?.prompt || ''));
  return {
    success: true,
    content: typeof payload === 'string' ? payload : JSON.stringify(payload),
    structured: null,
    requestId: `mock-req-${callCount}`,
    provider: 'mock',
    model: 'mock-model',
    usage: { inputTokens: 10, outputTokens: 20, cachedTokens: null },
  };
};

function resetMock(next: Behavior) {
  behavior = next;
  callCount = 0;
  callPrompts = [];
}

async function runDed(buffer: Buffer, fileName: string): Promise<any> {
  return fullAiDedService.execute({
    fileName,
    buffer,
    projectType: 'Rumah Tinggal',
    mode: 'FAST',
    policy: 'FULL_AI',
    rabMode: 'FULL_AI',
  });
}

const hasWarning = (out: any, needle: string) =>
  (out.warnings || []).some((w: string) => w.includes(needle));
const countWarnings = (out: any, needle: string) =>
  (out.warnings || []).filter((w: string) => w.includes(needle)).length;

async function main() {
  try {
    // =======================================================================
    // A. Grup kosong dipecah + dijalankan ulang; item anak-anak ter-merge.
    // =======================================================================
    console.log('== A. Rencana kosong -> split -> anak berisi ==');
    resetMock((prompt) => {
      const has1 = prompt.includes(M1);
      const has2 = prompt.includes(M2);
      if (has1 && has2) return { items: [], projectInfo: { scopeSummary: '' } };
      if (has1) return { items: [itemPondasi], projectInfo: { scopeSummary: 'pondasi' } };
      if (has2) return { items: [itemDinding], projectInfo: { scopeSummary: 'dinding' } };
      return { items: [] };
    });
    const pdfA = buildPdf([
      `${M1} Pekerjaan pondasi batu kali galian tanah.`,
      `${M2} Pekerjaan dinding bata merah plesteran.`,
    ]);
    const outA: any = await runDed(pdfA, 'a-rencana-kosong.pdf');
    check('A1 sukses (bukan error)', outA.success === true);
    check('A2 item anak-anak ter-merge (2 item)', outA.items.length === 2, `items=${outA.items.length}`);
    check('A3 nama item dari kedua halaman hadir',
      outA.items.some((i: any) => i.name === 'Galian tanah pondasi') &&
      outA.items.some((i: any) => i.name === 'Dinding bata merah'),
      JSON.stringify(outA.items.map((i: any) => i.name)));
    check('A4 execute dipanggil 3x (1 induk + 2 anak)', callCount === 3, `calls=${callCount}`);
    check('A5 warning pecah-grup jujur tercatat',
      hasWarning(outA, 'tanpa item pekerjaan') && hasWarning(outA, 'dipecah dua'),
      JSON.stringify(outA.warnings));
    check('A6 tanpa warning EMPTY_PLAN (anak-anak berhasil)', !hasWarning(outA, 'EMPTY_PLAN'));

    // =======================================================================
    // B. Grup kosong yang tak bisa dipecah -> EMPTY_PLAN (bukan sukses diam).
    // =======================================================================
    console.log('== B. Halaman tunggal kosong -> EMPTY_PLAN ==');
    resetMock(() => ({ items: [], projectInfo: { scopeSummary: '' } }));
    const pdfB = buildPdf([`${M1} Pekerjaan pondasi batu kali galian tanah.`]);
    const outB: any = await runDed(pdfB, 'b-halaman-tunggal.pdf');
    check('B1 0 item', outB.items.length === 0, `items=${outB.items.length}`);
    // Bentuk fail-closed yang sudah ada dipertahankan: success tetap true
    // (sama seperti jalur INVALID_JSON yang kehabisan retry) — yang berubah
    // adalah pelabelannya, bukan flag suksesnya.
    check('B2 success tetap true (bentuk lama dipertahankan)', outB.success === true);
    check('B3 warning EMPTY_PLAN tercatat', hasWarning(outB, 'EMPTY_PLAN'),
      JSON.stringify(outB.warnings));
    check('B4 pesan jujur "tidak menghasilkan item pekerjaan"',
      hasWarning(outB, 'tidak menghasilkan item pekerjaan'));
    check('B5 execute dipanggil 1x (tak ada yang bisa dipecah)', callCount === 1, `calls=${callCount}`);

    // =======================================================================
    // C. Grup berisi tidak berubah perilakunya.
    // =======================================================================
    console.log('== C. Grup berisi -> tanpa retry, tanpa warning baru ==');
    resetMock(() => ({ items: [itemPondasi, itemDinding], projectInfo: { scopeSummary: 'lengkap' } }));
    const pdfC = buildPdf([
      `${M1} Pekerjaan pondasi batu kali galian tanah.`,
      `${M2} Pekerjaan dinding bata merah plesteran.`,
    ]);
    const outC: any = await runDed(pdfC, 'c-berisi.pdf');
    check('C1 sukses dengan 2 item', outC.success === true && outC.items.length === 2,
      `success=${outC.success} items=${outC.items.length}`);
    check('C2 execute dipanggil 1x (tanpa retry)', callCount === 1, `calls=${callCount}`);
    check('C3 tanpa warning pecah-grup', !hasWarning(outC, 'dipecah dua'));
    check('C4 tanpa warning EMPTY_PLAN', !hasWarning(outC, 'EMPTY_PLAN'));

    // =======================================================================
    // D. Batas kedalaman dihormati (tidak ada loop tak berujung).
    // 4 halaman, semua kosong: 1 (depth 0) + 2 (depth 1) + 4 (depth 2) = 7.
    // =======================================================================
    console.log('== D. Batas kedalaman: 4 halaman kosong ==');
    resetMock(() => ({ items: [] }));
    const pdfD = buildPdf([
      `${M1} Pekerjaan pondasi.`,
      `${M2} Pekerjaan dinding.`,
      `${M3} Pekerjaan atap.`,
      `${M4} Pekerjaan lantai.`,
    ]);
    const outD: any = await runDed(pdfD, 'd-empat-halaman.pdf');
    check('D1 execute dipanggil tepat 7x (1+2+4, lalu berhenti)', callCount === 7, `calls=${callCount}`);
    check('D2 0 item', outD.items.length === 0, `items=${outD.items.length}`);
    check('D3 tepat 4 warning EMPTY_PLAN (satu per daun)', countWarnings(outD, 'EMPTY_PLAN') === 4,
      `count=${countWarnings(outD, 'EMPTY_PLAN')}`);
    check('D4 tepat 3 warning pecah-grup (1 induk + 2 anak depth 1)',
      countWarnings(outD, 'dipecah dua') === 3, `count=${countWarnings(outD, 'dipecah dua')}`);
    check('D5 success tetap true (bentuk lama)', outD.success === true);

    // =======================================================================
    // E. Parsial berlabel: satu grup kosong, grup lain berisi.
    // Dua halaman panjang (~8000 karakter) agar perencanaan memisah/membagi
    // kelompok; apapun pembagiannya, halaman 1 kosong + halaman 2 berisi.
    // =======================================================================
    console.log('== E. Parsial: satu grup kosong, satu berisi ==');
    resetMock((prompt) => {
      const has1 = prompt.includes(M1);
      const has2 = prompt.includes(M2);
      if (has1 && !has2) return { items: [] };
      if (has2 && !has1) return { items: [itemDinding], projectInfo: { scopeSummary: 'dinding' } };
      return { items: [] }; // induk gabungan (bila ada) kosong -> dipecah
    });
    const filler = (n: number) => ` catatan teknis struktur beton bertulang sloof kolom balok pelat lantai `.repeat(Math.ceil(n / 76)).slice(0, n);
    const pdfE = buildPdf([
      `${M1} Pekerjaan pondasi.${filler(8000)}`,
      `${M2} Pekerjaan dinding.${filler(8000)}`,
    ]);
    const outE: any = await runDed(pdfE, 'e-parsial.pdf');
    check('E1 item dari halaman berisi hadir (1 item)',
      outE.items.length === 1 && outE.items[0].name === 'Dinding bata merah',
      `items=${JSON.stringify(outE.items.map((i: any) => i.name))}`);
    check('E2 grup kosong berlabel EMPTY_PLAN', hasWarning(outE, 'EMPTY_PLAN'),
      JSON.stringify(outE.warnings));
    check('E3 sukses (parsial, bukan error)', outE.success === true);
    check('E4 panggilan AI terbatas (<10, tidak berputar)', callCount < 10, `calls=${callCount}`);

    // =======================================================================
    // F. items BUKAN array (kunci absen) diperlakukan sama: kosong -> retry.
    // =======================================================================
    console.log('== F. items bukan array -> retry seperti kosong ==');
    resetMock((prompt) => {
      const has1 = prompt.includes(M1);
      const has2 = prompt.includes(M2);
      if (has1 && has2) return { projectInfo: { scopeSummary: 'tanpa kunci items' } };
      if (has1) return { items: [itemAtap], projectInfo: { scopeSummary: 'atap' } };
      if (has2) return { items: [itemLantai], projectInfo: { scopeSummary: 'lantai' } };
      return { items: [] };
    });
    const pdfF = buildPdf([
      `${M1} Pekerjaan atap baja ringan.`,
      `${M2} Pekerjaan lantai keramik.`,
    ]);
    const outF: any = await runDed(pdfF, 'f-tanpa-items.pdf');
    check('F1 item anak-anak ter-merge (2 item)', outF.items.length === 2, `items=${outF.items.length}`);
    check('F2 execute dipanggil 3x (1 induk + 2 anak)', callCount === 3, `calls=${callCount}`);
    check('F3 warning pecah-grup tercatat', hasWarning(outF, 'tanpa item pekerjaan'),
      JSON.stringify(outF.warnings));
  } finally {
    // Pulihkan client asli — jangan biarkan stub bocor ke proses lain.
    (aiToolsProviderClient as any).execute = origExecute;
  }

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal (total ${pass + fail})`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('SUITE ERROR:', err);
  process.exitCode = 1;
});
