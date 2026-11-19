/**
 * EZRAB Chat AI — knowledge base PRODUK (tool cari_fitur_ezrab).
 *
 * Program 2026-11-19 (perintah owner "Buatkan knowledge produknya"):
 * KB produk terstruktur mengikuti pola constructionKnowledge +
 * cari_pengetahuan_konstruksi (aturan 25) — tetapi isinya FITUR
 * APLIKASI EZRAB yang terverifikasi dari kode, dirujuk LLM lewat
 * tool cari_fitur_ezrab (aturan prompt 31, v2.5.0).
 *
 * Yang diuji: invarian record (provenance + tanpa angka hard-code
 * template/AHSP), retrieval (query fitur -> record benar), tool
 * (terdaftar + callable + jawaban luar-cakupan eksplisit),
 * no-hijack (pertanyaan konstruksi murni tidak terbajak ke KB
 * produk, KB konstruksi tetap menjawabnya), dan prompt (v2.5.0 +
 * aturan 31 + headroom).
 * Run: npx tsx src/test/productKnowledge.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_KNOWLEDGE, getProductRecord } from '../ai-tools/ezrab-ai/productKnowledge';
import {
  searchProductKnowledge,
  searchProductWithOutcome,
  formatProductContext,
} from '../ai-tools/ezrab-ai/productRetrieval';
import { searchConstructionKnowledge } from '../ai-tools/ezrab-ai/constructionRetrieval';
import { EZRAB_AI_TOOLS, runTool, getToolListText } from '../ai-tools/ezrab-ai/tools';
import { EZRAB_AI_SYSTEM_PROMPT, EZRAB_AI_PROMPT_VERSION } from '../ai-tools/ezrab-ai/prompt';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

const HERE = dirname(fileURLToPath(import.meta.url));

// --- Invarian record ---

{
  assert(PRODUCT_KNOWLEDGE.length >= 20, `KB produk memuat >= 20 record (aktual ${PRODUCT_KNOWLEDGE.length})`);
  const requiredIds = [
    'chat-ai', 'wizard-rab', 'desain-rumah-ai', 'template-rab', 'qto', 'ded-ai', 'magic-ai',
    'ai-document', 'kalkulator-volume', 'keuangan-proyek', 'kurva-s', 'laporan-boq', 'dokumen-tender',
    'database-material', 'database-ahsp', 'database-upah', 'database-alat', 'harga-proyek', 'master-pricing',
    'peran-pengguna', 'tema', 'billing-kredit', 'batas-chat',
  ];
  for (const id of requiredIds) {
    assert(getProductRecord(id) !== null, `record ${id} ada`);
  }
  const ids = new Set<string>();
  for (const r of PRODUCT_KNOWLEDGE) {
    assert(!ids.has(r.id), `id unik: ${r.id}`);
    ids.add(r.id);
    assert(r.commonName.trim().length > 0, `${r.id}: commonName terisi`);
    assert(r.summary.trim().length > 0, `${r.id}: summary terisi`);
    assert(r.details.length > 0, `${r.id}: details terisi`);
    assert(r.provenance.source.trim().length > 0, `${r.id}: provenance.source terisi`);
    assert(
      r.provenance.verificationStatus === 'verified' || r.provenance.verificationStatus === 'assumption',
      `${r.id}: verificationStatus verified/assumption`,
    );
    // Tanpa angka hard-code JUMLAH DATA template RAB / analisa AHSP
    // (kasus A1: angka basi). Angka STRUKTUR KODE (2 mode DED, 5 peran,
    // 12 template bawaan DocAI, 9 mode layanan) BOLEH — berubah hanya
    // bila kode berubah, dan KB dirawat bersama kode.
    const blob = [r.summary, ...r.details].join(' ');
    assert(!/52 template/.test(blob), `${r.id}: tanpa hard-code basi 52 template`);
    assert(!/5\.801/.test(blob), `${r.id}: tanpa hard-code basi 5.801`);
  }
  // Target: record template/AHSP tidak memuat angka jumlah data.
  const tplBlob = [getProductRecord('template-rab')!.summary, ...getProductRecord('template-rab')!.details].join(' ');
  assert(!/\d/.test(tplBlob), 'template-rab: tanpa angka apa pun (jumlah dari runtime)');
  const ahspBlob = [getProductRecord('database-ahsp')!.summary, ...getProductRecord('database-ahsp')!.details].join(' ');
  assert(!/\d[\d.]*\s*analisa/i.test(ahspBlob), 'database-ahsp: tanpa angka jumlah analisa (jumlah dari runtime)');
}

// --- Retrieval: query fitur -> record benar ---

{
  const cases: Array<[string, string]> = [
    ['kurva s', 'kurva-s'],
    ['buatkan curva s', 'kurva-s'],
    ['cash flow', 'keuangan-proyek'],
    ['termin invoice', 'keuangan-proyek'],
    ['tema gelap', 'tema'],
    ['harga paket professional', 'billing-kredit'],
    ['peran admin', 'peran-pengguna'],
    ['template rab', 'template-rab'],
    ['apa itu ahsp', 'database-ahsp'],
    ['magic ai', 'magic-ai'],
    ['dokumen tender', 'dokumen-tender'],
    ['kalkulator volume', 'kalkulator-volume'],
    ['batas chat', 'batas-chat'],
    ['ded', 'ded-ai'],
    ['boq', 'laporan-boq'],
    ['upah tukang', 'database-upah'],
    ['wizard rab', 'wizard-rab'],
    ['desain rumah', 'desain-rumah-ai'],
    ['ai document', 'ai-document'],
    ['harga master', 'master-pricing'],
  ];
  for (const [q, expected] of cases) {
    const hits = searchProductKnowledge(q);
    assert(hits.length > 0, `retrieval "${q}" menghasilkan hit`);
    assert(hits[0]?.record.id === expected, `retrieval "${q}" -> ${expected} (aktual ${hits[0]?.record.id ?? '—'})`);
  }
  // Batas konteks + tanpa duplikat.
  const many = searchProductKnowledge('rab', { maxResults: 3 });
  assert(many.length <= 3, 'maxResults dihormati');
  assert(new Set(many.map((h) => h.record.id)).size === many.length, 'tanpa duplikat record');
  // Hasil kosong dinyatakan eksplisit (temuan negatif).
  const out = searchProductWithOutcome('kvantum gravitasi');
  assert(out.hits.length === 0, 'topik asing: 0 hit');
  assert(out.negativeReason !== null && out.negativeReason.includes('di luar cakupan'), 'topik asing: alasan negatif eksplisit');
}

// --- Tool cari_fitur_ezrab ---

{
  const tool = EZRAB_AI_TOOLS.find((t) => t.name === 'cari_fitur_ezrab');
  assert(tool !== undefined, 'tool cari_fitur_ezrab terdaftar di EZRAB_AI_TOOLS');
  assert(EZRAB_AI_TOOLS.length >= 25, `tools.ts membawa >= 25 tool (aktual ${EZRAB_AI_TOOLS.length})`);
  assert(getToolListText().includes('cari_fitur_ezrab'), 'daftar tool LLM memuat cari_fitur_ezrab');
  assert((tool?.description ?? '').includes('cari_pengetahuan_konstruksi'), 'deskripsi tool membedakan dari KB konstruksi');

  const res = runTool('cari_fitur_ezrab', { kata_kunci: 'kurva s' });
  assert(typeof res === 'string', 'invoke mengembalikan string');
  const s = String(res);
  assert(s.includes('Kurva S & Jadwal'), 'hasil tool memuat Kurva S & Jadwal');
  assert(s.includes('KB-PRODUK:kurva-s'), 'hasil tool membawa sitasi KB-PRODUK');
  assert(s.includes('TIDAK bisa dari chat'), 'hasil tool menyatakan batas chat');
  assert(!s.includes('Tidak ada pengetahuan produk'), 'hasil tool bukan jawaban luar-cakupan');

  const empty = runTool('cari_fitur_ezrab', { kata_kunci: '' });
  assert(typeof empty === 'string' && String(empty).startsWith('ERROR'), 'kata_kunci kosong -> ERROR');

  const unknown = runTool('cari_fitur_ezrab', { kata_kunci: 'kvantum gravitasi' });
  assert(typeof unknown === 'string' && String(unknown).includes('di luar cakupan'), 'topik asing -> luar-cakupan eksplisit');
  assert(typeof unknown === 'string' && String(unknown).includes('Jangan mengarang'), 'topik asing -> larang mengarang');

  // Angka runtime (bukan hard-code): template + AHSP dihitung saat jalan.
  const tpl = runTool('cari_fitur_ezrab', { kata_kunci: 'template rab' });
  assert(typeof tpl === 'string' && String(tpl).includes('dihitung runtime'), 'hasil template memuat jumlah runtime');
  const ahsp = runTool('cari_fitur_ezrab', { kata_kunci: 'ahsp' });
  assert(typeof ahsp === 'string' && String(ahsp).includes('dihitung runtime'), 'hasil AHSP memuat jumlah runtime');

  // Skema registry: read-only, tanpa proyek (pola skill-engine extractor).
  const regSrc = readFileSync(resolve(HERE, '../ai-tools/ezrab-ai/toolRegistry.ts'), 'utf8');
  const schemaBlock = regSrc.slice(regSrc.indexOf('CHAT_TOOL_SCHEMAS'));
  assert(/cari_fitur_ezrab: \{\s*\n\s*permission: 'read-only'/.test(schemaBlock), 'CHAT_TOOL_SCHEMAS memuat cari_fitur_ezrab read-only');
  assert(schemaBlock.includes("S('kata_kunci', 'string', true"), 'skema memuat kata_kunci wajib');
}

// --- No-hijack: pertanyaan konstruksi murni tidak terbajak ---

{
  const tech = [
    'apa keunggulan bata merah',
    'jalan aspal',
    'pondasi bore pile',
    'berapa kebutuhan semen untuk dak',
  ];
  for (const q of tech) {
    assert(searchProductKnowledge(q).length === 0, `produk tidak membajak "${q}"`);
  }
  // KB konstruksi tetap menjawabnya (dua KB berdampingan).
  assert(searchConstructionKnowledge('jalan aspal').length > 0, 'KB konstruksi tetap menjawab "jalan aspal"');
  assert(searchConstructionKnowledge('pondasi bore pile').length > 0, 'KB konstruksi tetap menjawab "pondasi bore pile"');
  // Format konteks kosong -> string kosong (tanpa klaim palsu).
  assert(formatProductContext([]) === '', 'format konteks kosong -> string kosong');
}

// --- Prompt: v2.5.0 + aturan 31 + headroom ---

{
  assert(EZRAB_AI_PROMPT_VERSION === '2.5.0', 'versi prompt 2.5.0');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('31. PENGETAHUAN PRODUK EZRAB'), 'prompt memuat aturan 31');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('gunakan tool cari_fitur_ezrab'), 'aturan 31 merujuk tool cari_fitur_ezrab');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('JANGAN menjawab dari ingatan model tentang fitur EZRAB'), 'aturan 31 melarang jawaban dari ingatan model');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('cari_pengetahuan_konstruksi'), 'aturan 25 (KB konstruksi) tetap ada');
  assert(EZRAB_AI_SYSTEM_PROMPT.length <= 19000, `panjang prompt <= 19000 (aktual ${EZRAB_AI_SYSTEM_PROMPT.length})`);
}

console.log(`productKnowledge: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
