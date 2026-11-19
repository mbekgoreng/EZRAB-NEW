/**
 * EZRAB Chat AI — jawaban "kelebihanmu apa saja" (intent CAPABILITIES).
 * Regresi 2026-11-17: redaksi "-mu" ("kelebihanmu apa saja", "apa
 * kelebihanmu") jatuh UNKNOWN ke LLM — pola lama mensyaratkan
 * \bkelebihan\b (gagal pada "kelebihanmu") dan "apa" sebelum kata
 * fitur. LLM pun menjawab tanpa daftar kemampuan resmi di prompt.
 * Perbaikan: pola -mu di router + teks CAPABILITIES diperbarui dengan
 * perintah deterministik terbaru (proyek, item RAB, QTO, DED/dokumen,
 * ekspor/revisi/kredit, pengaturan proyek) + aturan prompt 29 (v2.3.0).
 * v2.4.0 (perintah owner 2026-11-19): jawaban CAPABILITIES + seksi
 * FITUR LENGKAP EZRAB (AI Document, Kalkulator Volume, Keuangan/cash
 * flow, Kurva S, Laporan/BOQ, Dokumen Tender, peran, tema) + aturan 29
 * butir (d) + aturan 30 + intent KURVA_S deterministik (koreksi: LLM
 * pernah mengklaim tidak ada tool Kurva S — fitur itu ADA).
 * Run: npx tsx src/test/chatCapabilities.test.ts
 */
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent, ChatActionContext } from '../ai-tools/ezrab-ai/actionRegistry';
import { EZRAB_AI_SYSTEM_PROMPT, EZRAB_AI_PROMPT_VERSION } from '../ai-tools/ezrab-ai/prompt';
import { RabTemplateService } from '../services/rabTemplateService';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

const noop = () => {};
const ctxFor = (rawText: string): ChatActionContext => ({
  navigate: noop, currentMenu: 'ezrab-ai', activeProject: null, projects: [], projectTotal: null,
  rawText,
});

// --- Router: bentuk "-mu" dikenali CAPABILITIES ---

{
  const forms: Array<[string, string]> = [
    ['kelebihanmu apa saja', 'kelebihanmu apa saja'],
    ['apa kelebihanmu', 'apa kelebihanmu'],
    ['fiturmu apa aja', 'fiturmu apa aja'],
    ['apa keunggulanmu', 'apa keunggulanmu'],
    ['kemampuanmu apa', 'kemampuanmu apa'],
    ['sebutkan kelebihanmu', 'sebutkan kelebihanmu'],
  ];
  for (const [q, label] of forms) {
    assert(routeIntent(q).intent === 'CAPABILITIES', `mu: "${label}" → CAPABILITIES`);
  }
}

// --- Router: redaksi lama tetap CAPABILITIES ---

{
  assert(routeIntent('apa saja yang bisa kamu bantu').intent === 'CAPABILITIES', 'lama: apa saja yang bisa kamu bantu');
  assert(routeIntent('kamu bisa bantu apa?').intent === 'CAPABILITIES', 'lama: kamu bisa bantu apa?');
  assert(routeIntent('apa saja kelebihan ezrab').intent === 'CAPABILITIES', 'lama: apa saja kelebihan ezrab');
  assert(routeIntent('fitur ezrab apa saja').intent === 'CAPABILITIES', 'lama: fitur ezrab apa saja');
}

// --- Router: pertanyaan teknis TIDAK terbajak ---

{
  const tech = [
    'apa kelebihan beton pracetak?',
    'apa keunggulan bata merah dibanding hebel',
    'kelebihan dan kekurangan rumah 2 lantai',
    'apa saja yang bisa kamu jelaskan tentang beton?',
    'apa kelebihan atap baja ringan',
  ];
  for (const q of tech) {
    assert(routeIntent(q).intent === 'UNKNOWN', `teknis tetap UNKNOWN: "${q}"`);
  }
}

// --- Isi jawaban: perintah baru + angka runtime + batas jujur ---

{
  const res = executeIntent('CAPABILITIES', undefined, ctxFor('kelebihanmu apa saja'));
  assert(res.ok === true, 'jawaban ok');
  const m = res.message ?? '';
  // Perintah deterministik terbaru (5 kelompok + mutasi item)
  for (const kw of ['Kelola proyek', 'QTO', 'DED', 'Ekspor', 'revisi', 'kredit', 'overhead', 'PPN', 'pratinjau', 'Konfirmasi']) {
    assert(m.includes(kw), `pesan memuat "${kw}"`);
  }
  // Angka dari sumber nyata, bukan hard-code basi (cermin uji A1)
  const tpl = RabTemplateService.getInstance().getAllTemplates().length;
  const ahsp = officialAhspRepository.size;
  assert(m.includes(`${tpl.toLocaleString('id-ID')} template`), 'pesan memuat jumlah template runtime');
  assert(m.includes(ahsp.toLocaleString('id-ID')), 'pesan memuat jumlah AHSP runtime');
  assert(!m.includes('52 template'), 'pesan tidak memuat hard-code basi 52 template');
  assert(!m.includes('5.801'), 'pesan tidak memuat hard-code basi 5.801');
  // Batas jujur: harga master tidak bisa diubah dari chat
  assert(m.includes('harga master'), 'pesan menyatakan batas harga master');
  // Seksi FITUR LENGKAP EZRAB (v2.4.0, perintah owner 2026-11-19)
  for (const kw of ['FITUR LENGKAP EZRAB', 'AI Document', 'Kalkulator Volume', 'Keuangan Proyek', 'cash flow', 'Kurva S & Jadwal', 'Laporan & Dokumen Tender', 'Peran pengguna', 'admin, estimator, direksi, editor, dan klien', 'Tema tampilan']) {
    assert(m.includes(kw), `pesan memuat "${kw}"`);
  }
  // Tombol coba tetap ada
  assert((res.actions ?? []).length >= 4, 'pesan membawa >= 4 tombol aksi');
}

// --- Kurva S: jawaban deterministik (koreksi owner 2026-11-19) ---

{
  for (const q of ['apakah kamu bisa membuat kurva s?', 'buatkan curva s', 'kurva s', 'bisa buat kurva s?']) {
    assert(routeIntent(q).intent === 'KURVA_S', `kurva: "${q}" → KURVA_S`);
  }
  // Pertanyaan teori tetap ke LLM, tidak terbajak
  assert(routeIntent('apa itu kurva s?').intent === 'UNKNOWN', 'teori kurva s tetap UNKNOWN');
  const res = executeIntent('KURVA_S', undefined, ctxFor('apakah kamu bisa membuat kurva s?'));
  assert(res.ok === true, 'jawaban kurva ok');
  const m = res.message ?? '';
  assert(m.includes('Kurva S & Jadwal'), 'pesan kurva menyebut fitur Kurva S & Jadwal');
  assert(m.includes('tidak bisa membuat atau mengubah jadwal dari chat'), 'pesan kurva menyatakan batas chat');
  assert(!m.includes('Tidak ada tool'), 'pesan kurva tidak mengklaim tidak ada tool');
  assert(!m.includes('tidak ada tool'), 'pesan kurva tidak mengklaim tidak ada tool (huruf kecil)');
  const nav = (res.actions ?? []).find((a) => (a.action as { menu?: string }).menu === 'rab-kurva-s');
  assert(nav !== undefined, 'pesan kurva membawa tombol ke menu rab-kurva-s');
}

// --- Prompt: aturan 29 + versi 2.5.0 ---

{
  assert(EZRAB_AI_PROMPT_VERSION === '2.5.0', 'versi prompt 2.5.0');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('29. BILA DITANYA KELEBIHAN/FITUR/KEMAMPUAN'), 'prompt memuat aturan 29');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('kewenangan admin'), 'aturan 29 menyebut batas harga master');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('Jangan menyebut nama model/provider AI'), 'aturan 29 melarang nama model/provider');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('fitur lengkap EZRAB di luar chat'), 'aturan 29(d) memuat fitur lengkap EZRAB');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('30. BILA DITANYA KURVA S'), 'prompt memuat aturan 30');
  assert(EZRAB_AI_SYSTEM_PROMPT.includes('EZRAB PUNYA fitur Kurva S & Jadwal'), 'aturan 30 menyatakan Kurva S ADA');
}

console.log(`chatCapabilities: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
