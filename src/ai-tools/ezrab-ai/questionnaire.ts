/**
 * questionnaire.ts — MESIN KUESIONER ADAPTIF (Adaptive Project
 * Questionnaire & Guided RAB Generation, direktif owner 2026-11-12).
 *
 * Memperluas mekanisme pertanyaan intake yang SUDAH ada
 * (universalIntake.questionDefsFor — pertanyaan percakapan kritis satu
 * per satu) dengan lapisan SPESIFIKASI tergrup: sesudah pertanyaan
 * kritis percakapan selesai, spesifikasi material/kapasitas/fasilitas
 * yang berdampak material dikumpulkan lewat SATU kuesioner terstruktur
 * (pilihan tunggal/ganda/teks bebas, semua bisa dilewati) sebelum
 * brief ditinjau dan RAB disusun.
 *
 * Prinsip yang dijaga:
 * - Definisi pertanyaan adalah DATA per kategori yang dievaluasi
 *   terhadap konteks kanonis — bukan hardcode satu kategori.
 * - Tidak pernah menanyakan yang sudah diketahui dari sumber mana pun
 *   (teks user, jawaban percakapan, jawaban kuesioner sebelumnya).
 * - Hanya jawaban pengguna yang menjadi TERKONFIRMASI (ctx.answers /
 *   fakta USER_CONFIRMED); yang dilewati tetap BELUM TERSELESAIKAN dan
 *   dinyatakan di brief — tidak pernah ditebak/diisi asumsi diam-diam.
 * - Keadaan kuesioner hidup di UniversalIntakeContext.questionnaire
 *   (konteks kanonis yang sama) — modul ini tidak menyimpan state
 *   sendiri dan tidak membuat store/konteks kedua.
 */
import type {
  QuestionnaireAnswerRecord,
  UniversalIntakeContext,
} from './universalIntake';
import { SPEC_KEY_META, isValidDedSpec } from './structuredSpec';
import type { StructuredSpec } from './structuredSpec';

/* ------------------------------------------------------------------ */
/* Bentuk publik (dikirim ke UI sebagai payload pesan)                 */
/* ------------------------------------------------------------------ */

export type QuestionnaireQuestionKind = 'single' | 'multi' | 'text';

export interface QuestionnaireOption {
  id: string;
  label: string;
}

export interface QuestionnaireQuestion {
  key: string;
  prompt: string;
  kind: QuestionnaireQuestionKind;
  options: QuestionnaireOption[];
  allowCustom: boolean;
  /** Semua pertanyaan spesifikasi boleh dilewati ("Belum ditentukan"). */
  skippable: true;
  missingLabel: string;
  /** Prioritas dampak: kuantitas/cakupan < struktur < material < sistem. */
  priority: number;
}

export interface QuestionnairePayload {
  questions: QuestionnaireQuestion[];
}

export class QuestionnaireValidationError extends Error {}

/* ------------------------------------------------------------------ */
/* Definisi pertanyaan (data)                                          */
/* ------------------------------------------------------------------ */

interface SpecQuestionDef {
  key: string;
  appliesTo: (ctx: UniversalIntakeContext) => boolean;
  /** Info sudah diketahui dari sumber mana pun → jangan ditanyakan. */
  isSatisfied: (ctx: UniversalIntakeContext) => boolean;
  prompt: (ctx: UniversalIntakeContext) => string;
  kind: QuestionnaireQuestionKind;
  options?: QuestionnaireOption[];
  allowCustom: boolean;
  priority: number;
  missingLabel: string;
  /** Terapkan jawaban TERKONFIRMASI ke konteks kanonis. */
  apply: (ctx: UniversalIntakeContext, label: string, rec: QuestionnaireAnswerRecord) => void;
  /** Frasa alami untuk teks generate (kata-kata pengguna sendiri). */
  phrase?: (label: string) => string;
}

const lowerText = (ctx: UniversalIntakeContext): string => (ctx.combinedText || '').toLowerCase();
const hasAnswer = (ctx: UniversalIntakeContext, key: string): boolean => ctx.answers[key] != null;
const textHas = (ctx: UniversalIntakeContext, re: RegExp): boolean => re.test(lowerText(ctx));

function setAnswer(ctx: UniversalIntakeContext, key: string, label: string): void {
  ctx.answers[key] = label;
}
function addSpec(ctx: UniversalIntakeContext, spec: string): void {
  if (!ctx.technicalSpecs.includes(spec)) ctx.technicalSpecs.push(spec);
}
/** Ganti entri spek berawalan sama (jawaban kuesioner yang direvisi tidak menyisakan nilai lama). */
function replaceSpec(ctx: UniversalIntakeContext, prefix: string, spec: string): void {
  ctx.technicalSpecs = ctx.technicalSpecs.filter((s) => !s.startsWith(prefix));
  ctx.technicalSpecs.push(spec);
}
function addScope(ctx: UniversalIntakeContext, label: string): void {
  if (!ctx.scopeConfirmed.some((s) => s.label === label)) {
    ctx.scopeConfirmed.push({ label, subcategoryId: null, status: 'USER_CONFIRMED' });
  }
}
/** Buang dulu semua label cakupan milik satu pertanyaan (untuk penerapan ulang yang bersih). */
function resetScopes(ctx: UniversalIntakeContext, labels: string[]): void {
  ctx.scopeConfirmed = ctx.scopeConfirmed.filter((s) => !labels.includes(s.label));
}
function addSite(ctx: UniversalIntakeContext, s: string): void {
  if (!ctx.siteConditions.includes(s)) ctx.siteConditions.push(s);
}
function replaceSite(ctx: UniversalIntakeContext, prefix: string, s: string): void {
  ctx.siteConditions = ctx.siteConditions.filter((x) => !x.startsWith(prefix));
  ctx.siteConditions.push(s);
}
function upsertCount(ctx: UniversalIntakeContext, value: number, unit: string, original: string): void {
  const idx = ctx.counts.findIndex((c) => c.unit === unit);
  const entry = { value, unit, original };
  if (idx >= 0) ctx.counts[idx] = entry;
  else ctx.counts.push(entry);
}

const ROOF_MATERIAL_RE = /\b(spandek|galvalum|zincalume|genteng|asbes|seng gelombang|metal deck|standing seam)\b/;

const SPEC_QUESTION_DEFS: SpecQuestionDef[] = [
  /* ================= KANDANG & PETERNAKAN ================= */
  {
    key: 'kandang-capacity',
    appliesTo: (c) => c.primary?.id === 'kandang',
    isSatisfied: (c) => hasAnswer(c, 'kandang-capacity') || c.counts.some((x) => x.unit === 'ekor'),
    prompt: () => 'Berapa ekor sapi yang akan ditampung kandang ini?',
    kind: 'single',
    options: [
      { id: 'kap-10', label: '10 ekor' },
      { id: 'kap-20', label: '20 ekor' },
      { id: 'kap-30', label: '30 ekor' },
      { id: 'kap-40', label: '40 ekor' },
      { id: 'kap-60', label: '60 ekor' },
    ],
    allowCustom: true,
    priority: 10,
    missingLabel: 'kapasitas kandang (jumlah ekor)',
    apply: (ctx, label, rec) => {
      setAnswer(ctx, 'kandang-capacity', label);
      const num = rec.customText ? Number((rec.customText.match(/\d+/) ?? [])[0]) : Number((label.match(/\d+/) ?? [])[0]);
      if (Number.isFinite(num) && num > 0) upsertCount(ctx, num, 'ekor', `${num} ekor`);
    },
    phrase: (label) => `kapasitas ${label}`,
  },
  {
    key: 'kandang-roof-material',
    appliesTo: (c) => c.primary?.id === 'kandang',
    isSatisfied: (c) => hasAnswer(c, 'kandang-roof-material') || textHas(c, ROOF_MATERIAL_RE),
    prompt: () => 'Material penutup atap kandangnya apa?',
    kind: 'single',
    options: [
      { id: 'atap-spandek', label: 'Spandek' },
      { id: 'atap-galvalum', label: 'Galvalum' },
      { id: 'atap-genteng', label: 'Genteng' },
      { id: 'atap-asbes', label: 'Asbes gelombang' },
    ],
    allowCustom: true,
    priority: 20,
    missingLabel: 'material penutup atap kandang',
    apply: (ctx, label) => {
      setAnswer(ctx, 'kandang-roof-material', label);
      replaceSpec(ctx, 'penutup atap: ', `penutup atap: ${label}`);
    },
    phrase: (label) => `penutup atap ${label}`,
  },
  {
    key: 'kandang-floor',
    appliesTo: (c) => c.primary?.id === 'kandang',
    isSatisfied: (c) =>
      hasAnswer(c, 'kandang-floor') || textHas(c, /lantai[^.]{0,40}(beton|rabat|plester|tanah)/),
    prompt: () => 'Lantai kandangnya seperti apa?',
    kind: 'single',
    options: [
      { id: 'lantai-beton-miring', label: 'Beton dengan kemiringan ke drainase' },
      { id: 'lantai-beton-tekstur', label: 'Beton tekstur anti-licin' },
      { id: 'lantai-kombinasi', label: 'Kombinasi beton dan tanah terbuka' },
    ],
    allowCustom: true,
    priority: 30,
    missingLabel: 'jenis lantai kandang',
    apply: (ctx, label) => {
      setAnswer(ctx, 'kandang-floor', label);
      replaceSpec(ctx, 'lantai kandang: ', `lantai kandang: ${label}`);
    },
    // Frasa generate TIDAK memakai kata "drainase"/"saluran": pembangun
    // draf teks akan mendeteksinya sebagai scope Drainase & Saluran
    // mandiri yang menuntut panjangnya sendiri dan menggagalkan seluruh
    // draf kandang (terbukti lewat probe buildUniversalDraft).
    phrase: (label) =>
      label.includes('kemiringan')
        ? 'lantai beton miring untuk aliran kotoran'
        : `lantai ${label}`,
  },
  {
    key: 'kandang-facilities',
    appliesTo: (c) => c.primary?.id === 'kandang',
    isSatisfied: (c) =>
      hasAnswer(c, 'kandang-facilities') || textHas(c, /\b(palung|tempat minum|penampungan kotoran)\b/),
    prompt: () => 'Fasilitas tambahan apa saja yang perlu termasuk? (boleh lebih dari satu)',
    kind: 'multi',
    options: [
      { id: 'fas-palung', label: 'Palung pakan & tempat minum' },
      { id: 'fas-drainase', label: 'Drainase & penampungan kotoran' },
      { id: 'fas-air', label: 'Instalasi air' },
      { id: 'fas-listrik', label: 'Instalasi listrik' },
      { id: 'fas-sekat', label: 'Sekat kandang' },
    ],
    allowCustom: true,
    priority: 40,
    missingLabel: 'fasilitas tambahan kandang',
    apply: (ctx, label, rec) => {
      setAnswer(ctx, 'kandang-facilities', label);
      const scopeByOption: Record<string, string> = {
        'fas-palung': 'Palung pakan & tempat minum ternak',
        'fas-drainase': 'Drainase & penampungan kotoran kandang',
        'fas-air': 'Instalasi air kandang',
        'fas-listrik': 'Instalasi listrik kandang',
        'fas-sekat': 'Sekat kandang',
      };
      resetScopes(ctx, Object.values(scopeByOption));
      for (const id of rec.selectedIds) {
        const s = scopeByOption[id];
        if (s) addScope(ctx, s);
      }
    },
    // Sama seperti lantai: kata "Drainase" pada label fasilitas tidak
    // boleh masuk teks generate (pemicu scope mandiri) — penampungan
    // kotoran adalah atribut kandangnya.
    phrase: (label) =>
      `fasilitas: ${label.replace('Drainase & penampungan kotoran', 'penampungan kotoran')}`,
  },
  {
    key: 'kandang-manure',
    appliesTo: (c) => c.primary?.id === 'kandang',
    isSatisfied: (c) =>
      hasAnswer(c, 'kandang-manure') || textHas(c, /\b(penampungan kotoran|bak kotoran|kompos|pengolahan limbah)\b/),
    prompt: () => 'Pengelolaan kotoran ternaknya bagaimana?',
    kind: 'single',
    options: [
      { id: 'kotoran-bak', label: 'Bak penampungan kotoran khusus' },
      { id: 'kotoran-saluran', label: 'Dibuang lewat saluran ke lahan' },
      { id: 'kotoran-tanpa', label: 'Belum perlu fasilitas khusus' },
    ],
    allowCustom: true,
    priority: 50,
    missingLabel: 'pengelolaan kotoran ternak',
    apply: (ctx, label) => {
      setAnswer(ctx, 'kandang-manure', label);
      replaceSpec(ctx, 'pengelolaan kotoran: ', `pengelolaan kotoran: ${label}`);
    },
    // Kata "saluran" juga pemicu scope Drainase & Saluran — lihat
    // catatan pada kandang-floor.
    phrase: (label) =>
      label.includes('saluran')
        ? 'pengelolaan kotoran: dibuang ke lahan luar kandang'
        : `pengelolaan kotoran: ${label}`,
  },

  /* ================= GUDANG & INDUSTRI ================= */
  {
    key: 'warehouse-roof',
    appliesTo: (c) => c.primary?.id === 'gudang-industri',
    isSatisfied: (c) => hasAnswer(c, 'warehouse-roof') || textHas(c, ROOF_MATERIAL_RE),
    prompt: () => 'Material penutup atap gudangnya apa?',
    kind: 'single',
    options: [
      { id: 'gud-atap-spandek', label: 'Spandek' },
      { id: 'gud-atap-galvalum', label: 'Galvalum' },
      { id: 'gud-atap-zincalume', label: 'Zincalume' },
      { id: 'gud-atap-genteng-metal', label: 'Genteng metal' },
    ],
    allowCustom: true,
    priority: 20,
    missingLabel: 'material penutup atap gudang',
    apply: (ctx, label) => {
      setAnswer(ctx, 'warehouse-roof', label);
      replaceSpec(ctx, 'penutup atap: ', `penutup atap: ${label}`);
    },
    phrase: (label) => `penutup atap ${label}`,
  },
  {
    key: 'warehouse-floor',
    appliesTo: (c) => c.primary?.id === 'gudang-industri',
    isSatisfied: (c) => hasAnswer(c, 'warehouse-floor') || textHas(c, /\b(floor hardener|lantai beton gudang)\b/),
    prompt: () => 'Lantai gudangnya seperti apa?',
    kind: 'single',
    options: [
      { id: 'gud-lantai-hardener', label: 'Beton + floor hardener' },
      { id: 'gud-lantai-beton', label: 'Beton biasa' },
      { id: 'gud-lantai-paving', label: 'Paving blok' },
    ],
    allowCustom: true,
    priority: 30,
    missingLabel: 'jenis lantai gudang',
    apply: (ctx, label) => {
      setAnswer(ctx, 'warehouse-floor', label);
      replaceSpec(ctx, 'lantai gudang: ', `lantai gudang: ${label}`);
    },
    phrase: (label) => `lantai ${label}`,
  },
  {
    key: 'warehouse-loading',
    appliesTo: (c) => c.primary?.id === 'gudang-industri',
    isSatisfied: (c) => hasAnswer(c, 'warehouse-loading') || textHas(c, /\b(loading dock|loading area)\b/),
    prompt: () => 'Area bongkar-muatnya bagaimana?',
    kind: 'single',
    options: [
      { id: 'gud-loading-dock', label: 'Dengan loading dock' },
      { id: 'gud-loading-rolling', label: 'Tanpa dock — pintu rolling door saja' },
    ],
    allowCustom: true,
    priority: 40,
    missingLabel: 'fasilitas loading gudang',
    apply: (ctx, label, rec) => {
      setAnswer(ctx, 'warehouse-loading', label);
      resetScopes(ctx, ['Loading dock gudang']);
      if (rec.selectedIds.includes('gud-loading-dock')) addScope(ctx, 'Loading dock gudang');
    },
    phrase: (label) => `loading: ${label}`,
  },

  /* ================= GEDUNG (keluarga building non-khusus) ================= */
  {
    key: 'building-roof-type',
    appliesTo: (c) =>
      c.primary?.family === 'building' && !['renovasi', 'rumah', 'gudang-industri'].includes(c.primary?.id ?? ''),
    isSatisfied: (c) => hasAnswer(c, 'building-roof-type') || textHas(c, /\b(dak beton|genteng|spandek|galvalum|atap pelana|atap limasan)\b/),
    prompt: () => 'Jenis atap bangunannya apa?',
    kind: 'single',
    options: [
      { id: 'ged-atap-dak', label: 'Dak beton' },
      { id: 'ged-atap-genteng', label: 'Genteng (pelana/limasan)' },
      { id: 'ged-atap-metal', label: 'Spandek / galvalum' },
      { id: 'ged-atap-kombinasi', label: 'Kombinasi dak & genteng' },
    ],
    allowCustom: true,
    priority: 20,
    missingLabel: 'jenis atap bangunan',
    apply: (ctx, label) => {
      setAnswer(ctx, 'building-roof-type', label);
      replaceSpec(ctx, 'atap: ', `atap: ${label}`);
    },
    phrase: (label) => `atap ${label}`,
  },
  {
    key: 'building-foundation',
    appliesTo: (c) =>
      c.primary?.family === 'building' && !['renovasi', 'rumah', 'gudang-industri'].includes(c.primary?.id ?? ''),
    isSatisfied: (c) =>
      hasAnswer(c, 'building-foundation') ||
      textHas(c, /\b(foot plat|footplat|telapak|batu kali|bore pile|tiang pancang|sumuran|mini pile)\b/),
    prompt: () => 'Pondasinya direncanakan apa? (atau sebutkan kondisi tanahnya)',
    kind: 'single',
    options: [
      { id: 'ged-pond-telapak', label: 'Foot plat / telapak beton' },
      { id: 'ged-pond-batukali', label: 'Pasangan batu kali' },
      { id: 'ged-pond-borepile', label: 'Bore pile / tiang pancang' },
      { id: 'ged-pond-tanah', label: 'Belum tahu — tergantung kondisi tanah' },
    ],
    allowCustom: true,
    priority: 15,
    missingLabel: 'jenis pondasi / kondisi tanah',
    apply: (ctx, label) => {
      setAnswer(ctx, 'building-foundation', label);
      replaceSpec(ctx, 'pondasi: ', `pondasi: ${label}`);
    },
    phrase: (label) => `pondasi ${label}`,
  },
  {
    key: 'building-finish-grade',
    appliesTo: (c) =>
      c.primary?.family === 'building' && !['renovasi', 'rumah', 'gudang-industri'].includes(c.primary?.id ?? ''),
    isSatisfied: (c) => hasAnswer(c, 'building-finish-grade') || c.qualityPreference != null,
    prompt: () => 'Grade finishing bangunannya?',
    kind: 'single',
    options: [
      { id: 'ged-fin-standar', label: 'Standar' },
      { id: 'ged-fin-menengah', label: 'Menengah' },
      { id: 'ged-fin-premium', label: 'Premium' },
    ],
    allowCustom: false,
    priority: 35,
    missingLabel: 'grade finishing bangunan',
    apply: (ctx, label) => {
      setAnswer(ctx, 'building-finish-grade', label);
      ctx.qualityPreference = label.toLowerCase();
    },
    phrase: (label) => `finishing ${label}`,
  },
  {
    key: 'building-mep-scope',
    appliesTo: (c) =>
      c.primary?.family === 'building' && !['renovasi', 'rumah', 'gudang-industri'].includes(c.primary?.id ?? ''),
    isSatisfied: (c) =>
      hasAnswer(c, 'building-mep-scope') ||
      c.secondary.some((d) => ['listrik', 'plumbing', 'hvac', 'fire-protection'].includes(d.id)),
    prompt: () => 'Cakupan instalasi (MEP) apa saja yang termasuk? (boleh lebih dari satu)',
    kind: 'multi',
    options: [
      { id: 'ged-mep-listrik', label: 'Instalasi listrik' },
      { id: 'ged-mep-plumbing', label: 'Plumbing & sanitair' },
      { id: 'ged-mep-ac', label: 'AC / tata udara' },
      { id: 'ged-mep-fire', label: 'Fire protection' },
    ],
    allowCustom: true,
    priority: 40,
    missingLabel: 'cakupan instalasi MEP',
    apply: (ctx, label, rec) => {
      setAnswer(ctx, 'building-mep-scope', label);
      const scopeByOption: Record<string, string> = {
        'ged-mep-listrik': 'Instalasi listrik',
        'ged-mep-plumbing': 'Plumbing & sanitair',
        'ged-mep-ac': 'AC / tata udara',
        'ged-mep-fire': 'Fire protection',
      };
      resetScopes(ctx, Object.values(scopeByOption));
      for (const id of rec.selectedIds) {
        const s = scopeByOption[id];
        if (s) addScope(ctx, s);
      }
    },
    phrase: (label) => `instalasi: ${label}`,
  },
  {
    key: 'building-bedrooms',
    appliesTo: (c) => c.primary?.id === 'apartemen',
    isSatisfied: (c) => hasAnswer(c, 'building-bedrooms') || textHas(c, /\b\d+\s*kamar tidur\b/),
    prompt: () => 'Berapa kamar tidur per unitnya?',
    kind: 'single',
    options: [
      { id: 'kmr-1', label: '1 kamar tidur' },
      { id: 'kmr-2', label: '2 kamar tidur' },
      { id: 'kmr-3', label: '3 kamar tidur' },
      { id: 'kmr-4', label: '4 kamar tidur' },
    ],
    allowCustom: true,
    priority: 25,
    missingLabel: 'jumlah kamar tidur per unit',
    apply: (ctx, label) => setAnswer(ctx, 'building-bedrooms', label),
    phrase: (label) => `${label} per unit`,
  },

  /* ================= JALAN ================= */
  {
    key: 'road-pavement',
    appliesTo: (c) => c.primary?.family === 'civil' && (c.primary?.id ?? '').startsWith('jalan'),
    isSatisfied: (c) =>
      hasAnswer(c, 'road-pavement') ||
      ['jalan-aspal', 'jalan-beton'].includes(c.primary?.id ?? '') ||
      textHas(c, /\b(hotmix|hot mix|rigid|paving blok|telford|makadam)\b/),
    prompt: () => 'Jenis perkerasan jalannya apa?',
    kind: 'single',
    options: [
      { id: 'jln-aspal', label: 'Aspal hotmix' },
      { id: 'jln-rigid', label: 'Beton / rigid' },
      { id: 'jln-paving', label: 'Paving blok' },
      { id: 'jln-telford', label: 'Telford / makadam' },
    ],
    allowCustom: true,
    priority: 15,
    missingLabel: 'jenis perkerasan jalan',
    apply: (ctx, label) => {
      setAnswer(ctx, 'road-pavement', label);
      replaceSpec(ctx, 'perkerasan: ', `perkerasan: ${label}`);
    },
    phrase: (label) => `perkerasan ${label}`,
  },
  {
    key: 'road-traffic',
    appliesTo: (c) => c.primary?.family === 'civil' && (c.primary?.id ?? '').startsWith('jalan'),
    isSatisfied: (c) => hasAnswer(c, 'road-traffic'),
    prompt: () => 'Kelas lalu lintas jalannya?',
    kind: 'single',
    options: [
      { id: 'jln-lalin-ringan', label: 'Ringan (jalan lingkungan)' },
      { id: 'jln-lalin-sedang', label: 'Sedang (kolektor)' },
      { id: 'jln-lalin-berat', label: 'Berat (arteri / truk)' },
    ],
    allowCustom: true,
    priority: 25,
    missingLabel: 'kelas lalu lintas jalan',
    apply: (ctx, label) => {
      setAnswer(ctx, 'road-traffic', label);
      replaceSpec(ctx, 'kelas lalu lintas: ', `kelas lalu lintas: ${label}`);
    },
    phrase: (label) => `lalu lintas ${label}`,
  },
  {
    key: 'road-subgrade',
    appliesTo: (c) => c.primary?.family === 'civil' && (c.primary?.id ?? '').startsWith('jalan'),
    isSatisfied: (c) => hasAnswer(c, 'road-subgrade') || textHas(c, /\btanah\s+(lunak|baik|stabil|lembek|keras)\b/),
    prompt: () => 'Kondisi tanah dasarnya bagaimana?',
    kind: 'single',
    options: [
      { id: 'jln-tanah-baik', label: 'Tanah baik / stabil' },
      { id: 'jln-tanah-lunak', label: 'Tanah lunak — perlu perbaikan' },
      { id: 'jln-tanah-belum', label: 'Belum ada data tanah' },
    ],
    allowCustom: true,
    priority: 30,
    missingLabel: 'kondisi tanah dasar jalan',
    apply: (ctx, label) => {
      setAnswer(ctx, 'road-subgrade', label);
      replaceSite(ctx, 'tanah dasar: ', `tanah dasar: ${label}`);
    },
    phrase: (label) => `tanah dasar ${label}`,
  },
  {
    key: 'road-drainage',
    appliesTo: (c) => c.primary?.family === 'civil' && (c.primary?.id ?? '').startsWith('jalan'),
    isSatisfied: (c) =>
      hasAnswer(c, 'road-drainage') || c.secondary.some((d) => d.id === 'drainase') ||
      c.scopeConfirmed.some((s) => /drainase/i.test(s.label)),
    prompt: () => 'Drainase pendamping jalannya bagaimana?',
    kind: 'single',
    options: [
      { id: 'jln-drain-baru', label: 'Dengan drainase samping baru' },
      { id: 'jln-drain-eksisting', label: 'Mengikuti drainase eksisting' },
      { id: 'jln-drain-tanpa', label: 'Tanpa drainase' },
    ],
    allowCustom: true,
    priority: 40,
    missingLabel: 'drainase pendamping jalan',
    apply: (ctx, label, rec) => {
      setAnswer(ctx, 'road-drainage', label);
      resetScopes(ctx, ['Drainase samping jalan']);
      if (rec.selectedIds.includes('jln-drain-baru')) addScope(ctx, 'Drainase samping jalan');
    },
    phrase: (label) => `drainase jalan: ${label}`,
  },

  /* ================= DRAINASE ================= */
  {
    key: 'drainage-material',
    appliesTo: (c) => c.primary?.id === 'drainase' || c.primary?.id === 'gorong-gorong',
    isSatisfied: (c) => hasAnswer(c, 'drainage-material') || c.drainageType != null,
    prompt: () => 'Material / konstruksi salurannya apa?',
    kind: 'single',
    options: [
      { id: 'drn-uditch', label: 'U-ditch pracetak' },
      { id: 'drn-batukali', label: 'Pasangan batu kali' },
      { id: 'drn-beton', label: 'Beton cor di tempat' },
      { id: 'drn-box', label: 'Box culvert' },
    ],
    allowCustom: true,
    priority: 15,
    missingLabel: 'material saluran drainase',
    apply: (ctx, label) => {
      setAnswer(ctx, 'drainage-material', label);
      if (!ctx.drainageType) ctx.drainageType = label;
    },
    phrase: (label) => `saluran ${label}`,
  },
  {
    key: 'drainage-flow',
    appliesTo: (c) => c.primary?.id === 'drainase' || c.primary?.id === 'gorong-gorong',
    isSatisfied: (c) => hasAnswer(c, 'drainage-flow'),
    prompt: () => 'Airnya mengalir ke mana dan dibuang ke mana? (tulis bebas — mis. "ke arah sungai di timur")',
    kind: 'text',
    options: [],
    allowCustom: true,
    priority: 30,
    missingLabel: 'arah aliran & tujuan buang drainase',
    apply: (ctx, label) => {
      setAnswer(ctx, 'drainage-flow', label);
      replaceSpec(ctx, 'arah aliran & buangan: ', `arah aliran & buangan: ${label}`);
    },
    phrase: (label) => `aliran: ${label}`,
  },
  {
    key: 'drainage-cover',
    appliesTo: (c) => c.primary?.id === 'drainase' || c.primary?.id === 'gorong-gorong',
    isSatisfied: (c) => hasAnswer(c, 'drainage-cover'),
    prompt: () => 'Salurannya terbuka atau tertutup?',
    kind: 'single',
    options: [
      { id: 'drn-terbuka', label: 'Terbuka' },
      { id: 'drn-tutup', label: 'Dengan penutup (plat / grill)' },
      { id: 'drn-sebagian', label: 'Sebagian tertutup' },
    ],
    allowCustom: true,
    priority: 40,
    missingLabel: 'penutup saluran drainase',
    apply: (ctx, label) => {
      setAnswer(ctx, 'drainage-cover', label);
      replaceSpec(ctx, 'penutup saluran: ', `penutup saluran: ${label}`);
    },
    phrase: (label) => `saluran ${label}`,
  },

  /* ================= KOLAM ================= */
  {
    key: 'pool-type',
    appliesTo: (c) => c.primary?.id === 'kolam',
    isSatisfied: (c) => hasAnswer(c, 'pool-type') || textHas(c, /\b(skimmer|overflow)\b/),
    prompt: () => 'Tipe sirkulasi kolamnya?',
    kind: 'single',
    options: [
      { id: 'kol-skimmer', label: 'Skimmer' },
      { id: 'kol-overflow', label: 'Overflow' },
      { id: 'kol-semi', label: 'Semi-overflow' },
    ],
    allowCustom: true,
    priority: 20,
    missingLabel: 'tipe kolam (skimmer/overflow)',
    apply: (ctx, label) => {
      setAnswer(ctx, 'pool-type', label);
      replaceSpec(ctx, 'tipe kolam: ', `tipe kolam: ${label}`);
    },
    phrase: (label) => `kolam ${label}`,
  },
  {
    key: 'pool-finish',
    appliesTo: (c) => c.primary?.id === 'kolam',
    isSatisfied: (c) => hasAnswer(c, 'pool-finish') || textHas(c, /\b(mozaik|batu alam kolam|keramik kolam)\b/),
    prompt: () => 'Finishing permukaan kolamnya apa?',
    kind: 'single',
    options: [
      { id: 'kol-fin-keramik', label: 'Keramik' },
      { id: 'kol-fin-mozaik', label: 'Mozaik' },
      { id: 'kol-fin-batualam', label: 'Batu alam' },
    ],
    allowCustom: true,
    priority: 30,
    missingLabel: 'finishing kolam',
    apply: (ctx, label) => {
      setAnswer(ctx, 'pool-finish', label);
      replaceSpec(ctx, 'finishing kolam: ', `finishing kolam: ${label}`);
    },
    phrase: (label) => `finishing ${label}`,
  },
  {
    key: 'pool-deck',
    appliesTo: (c) => c.primary?.id === 'kolam',
    isSatisfied: (c) => hasAnswer(c, 'pool-deck'),
    prompt: () => 'Area sekeliling kolamnya bagaimana?',
    kind: 'single',
    options: [
      { id: 'kol-deck-ada', label: 'Dengan deck & area sekitar' },
      { id: 'kol-deck-tanpa', label: 'Tanpa deck' },
    ],
    allowCustom: true,
    priority: 40,
    missingLabel: 'deck kolam',
    apply: (ctx, label, rec) => {
      setAnswer(ctx, 'pool-deck', label);
      resetScopes(ctx, ['Deck & area sekitar kolam']);
      if (rec.selectedIds.includes('kol-deck-ada')) addScope(ctx, 'Deck & area sekitar kolam');
    },
    phrase: (label) => `${label}`,
  },

  /* ================= LANDSCAPE (jalur universal) ================= */
  {
    key: 'landscape-vegetation',
    appliesTo: (c) => c.primary?.family === 'landscape' && c.primary?.id !== 'kolam',
    isSatisfied: (c) => hasAnswer(c, 'landscape-vegetation'),
    prompt: () => 'Vegetasi / softscape apa saja yang direncanakan? (boleh lebih dari satu)',
    kind: 'multi',
    options: [
      { id: 'veg-pohon', label: 'Pepohonan peneduh' },
      { id: 'veg-semak', label: 'Semak & tanaman hias' },
      { id: 'veg-rumput', label: 'Rumput taman' },
      { id: 'veg-produktif', label: 'Tanaman produktif' },
    ],
    allowCustom: true,
    priority: 30,
    missingLabel: 'vegetasi / softscape landscape',
    apply: (ctx, label) => {
      setAnswer(ctx, 'landscape-vegetation', label);
      addScope(ctx, 'Vegetasi / softscape landscape');
    },
    phrase: (label) => `vegetasi: ${label}`,
  },
  {
    key: 'landscape-irrigation',
    appliesTo: (c) => c.primary?.family === 'landscape' && c.primary?.id !== 'kolam',
    isSatisfied: (c) => hasAnswer(c, 'landscape-irrigation') || textHas(c, /\b(sprinkler|drip irrigation|penyiraman)\b/),
    prompt: () => 'Penyiraman tamannya bagaimana?',
    kind: 'single',
    options: [
      { id: 'irr-manual', label: 'Penyiraman manual' },
      { id: 'irr-sprinkler', label: 'Sprinkler otomatis' },
      { id: 'irr-drip', label: 'Drip irrigation' },
      { id: 'irr-tanpa', label: 'Belum perlu sistem penyiraman' },
    ],
    allowCustom: true,
    priority: 40,
    missingLabel: 'sistem penyiraman landscape',
    apply: (ctx, label) => {
      setAnswer(ctx, 'landscape-irrigation', label);
      replaceSpec(ctx, 'penyiraman: ', `penyiraman: ${label}`);
    },
    phrase: (label) => `penyiraman ${label}`,
  },
  {
    key: 'landscape-lighting',
    appliesTo: (c) => c.primary?.family === 'landscape' && c.primary?.id !== 'kolam',
    isSatisfied: (c) => hasAnswer(c, 'landscape-lighting'),
    prompt: () => 'Penerangan tamannya bagaimana?',
    kind: 'single',
    options: [
      { id: 'lgt-ada', label: 'Dengan penerangan taman' },
      { id: 'lgt-tanpa', label: 'Tanpa penerangan' },
    ],
    allowCustom: true,
    priority: 50,
    missingLabel: 'penerangan landscape',
    apply: (ctx, label, rec) => {
      setAnswer(ctx, 'landscape-lighting', label);
      resetScopes(ctx, ['Penerangan taman']);
      if (rec.selectedIds.includes('lgt-ada')) addScope(ctx, 'Penerangan taman');
    },
    phrase: (label) => `${label}`,
  },

  /* ================= RENOVASI ================= */
  {
    key: 'renovation-condition',
    appliesTo: (c) => c.primary?.id === 'renovasi',
    isSatisfied: (c) => hasAnswer(c, 'renovation-condition') || c.siteConditions.length > 0,
    prompt: () => 'Kondisi eksisting yang direnovasi bagaimana?',
    kind: 'single',
    options: [
      { id: 'ren-ringan', label: 'Kerusakan ringan (finishing saja)' },
      { id: 'ren-sedang', label: 'Sedang (beberapa elemen diganti)' },
      { id: 'ren-berat', label: 'Berat (menyentuh struktur)' },
    ],
    allowCustom: true,
    priority: 20,
    missingLabel: 'kondisi eksisting renovasi',
    apply: (ctx, label) => {
      setAnswer(ctx, 'renovation-condition', label);
      replaceSite(ctx, 'kondisi eksisting: ', `kondisi eksisting: ${label}`);
    },
    phrase: (label) => `kondisi ${label}`,
  },
  {
    key: 'renovation-finish-grade',
    appliesTo: (c) => c.primary?.id === 'renovasi',
    isSatisfied: (c) => hasAnswer(c, 'renovation-finish-grade') || c.qualityPreference != null,
    prompt: () => 'Grade finishing hasil renovasinya?',
    kind: 'single',
    options: [
      { id: 'ren-fin-standar', label: 'Standar' },
      { id: 'ren-fin-menengah', label: 'Menengah' },
      { id: 'ren-fin-premium', label: 'Premium' },
    ],
    allowCustom: false,
    priority: 35,
    missingLabel: 'grade finishing renovasi',
    apply: (ctx, label) => {
      setAnswer(ctx, 'renovation-finish-grade', label);
      ctx.qualityPreference = label.toLowerCase();
    },
    phrase: (label) => `finishing ${label}`,
  },
  {
    key: 'renovation-mep',
    appliesTo: (c) => c.primary?.id === 'renovasi',
    isSatisfied: (c) =>
      hasAnswer(c, 'renovation-mep') || c.secondary.some((d) => ['listrik', 'plumbing'].includes(d.id)),
    prompt: () => 'Apakah ada perbaikan instalasi? (boleh lebih dari satu)',
    kind: 'multi',
    options: [
      { id: 'ren-mep-listrik', label: 'Perbaikan instalasi listrik' },
      { id: 'ren-mep-plumbing', label: 'Perbaikan plumbing / sanitair' },
      { id: 'ren-mep-tanpa', label: 'Tanpa pekerjaan instalasi' },
    ],
    allowCustom: true,
    priority: 40,
    missingLabel: 'perbaikan instalasi renovasi',
    apply: (ctx, label, rec) => {
      setAnswer(ctx, 'renovation-mep', label);
      resetScopes(ctx, ['Perbaikan instalasi listrik', 'Perbaikan plumbing / sanitair']);
      if (rec.selectedIds.includes('ren-mep-listrik')) addScope(ctx, 'Perbaikan instalasi listrik');
      if (rec.selectedIds.includes('ren-mep-plumbing')) addScope(ctx, 'Perbaikan plumbing / sanitair');
    },
    phrase: (label) => `instalasi: ${label}`,
  },
];

function defByKey(key: string): SpecQuestionDef | null {
  return SPEC_QUESTION_DEFS.find((d) => d.key === key) ?? null;
}

function toPublic(def: SpecQuestionDef, ctx: UniversalIntakeContext): QuestionnaireQuestion {
  return {
    key: def.key,
    prompt: def.prompt(ctx),
    kind: def.kind,
    options: def.options ?? [],
    allowCustom: def.allowCustom,
    skippable: true,
    missingLabel: def.missingLabel,
    priority: def.priority,
  };
}

/* ------------------------------------------------------------------ */
/* Seleksi & presentasi                                                */
/* ------------------------------------------------------------------ */

/**
 * Pertanyaan kuesioner yang relevan & belum terjawab untuk konteks
 * ini — terurut prioritas dampak. Pertanyaan yang info-nya sudah ada
 * (dari teks/jawaban percakapan) TIDAK pernah masuk; pertanyaan yang
 * sudah dijawab/dilewati lewat kuesioner TIDAK pernah ditanya ulang.
 */
export function selectQuestionnaireQuestions(ctx: UniversalIntakeContext): QuestionnaireQuestion[] {
  if (!ctx.primary) return [];
  const out: QuestionnaireQuestion[] = [];
  for (const def of SPEC_QUESTION_DEFS) {
    if (!def.appliesTo(ctx)) continue;
    if (def.isSatisfied(ctx)) continue;
    // FASE 4 (CHAT-07) — predikat lintas sumber: jawaban yang sudah
    // terkonfirmasi di sumber MANA PUN (kuesioner / percakapan / spek
    // terstruktur) membuat pertanyaan tidak diajukan ulang.
    if (isSpecSatisfiedAcrossSources(ctx, def.key)) continue;
    if (ctx.questionnaire.answers[def.key]) continue;
    out.push(toPublic(def, ctx));
  }
  return out.sort((a, b) => a.priority - b.priority);
}

/**
 * FASE 4 (CHAT-07) — apakah satu medan spek SUDAH terpenuhi bila
 * dilihat lintas sumber? Sumber yang diperiksa: jawaban kuesioner
 * (bukan dilewati), jawaban percakapan (`ctx.answers`), dan spek
 * terstruktur berstatus CONFIRMED yang bernilai. Tujuannya mencegah
 * pertanyaan redundan: yang sudah terkonfirmasi di satu sumber tidak
 * ditanyakan lagi lewat sumber lain.
 */
export function isSpecSatisfiedAcrossSources(ctx: UniversalIntakeContext, key: string): boolean {
  const rec = ctx.questionnaire.answers[key];
  if (rec && rec.status !== 'skipped' && (rec.selectedIds.length > 0 || (rec.customText ?? '').trim() !== '')) return true;
  const conv = ctx.answers[key];
  if (conv != null && String(conv).trim() !== '') return true;
  const spec = (ctx.structuredSpecs ?? []).find((s) => s.key === key);
  if (spec && spec.status === 'CONFIRMED' && spec.value != null && !(typeof spec.value === 'string' && spec.value.trim() === '')) return true;
  return false;
}

/**
 * Tandai kuesioner sebagai ditampilkan (kunci pertanyaan dicatat agar
 * tidak ditampilkan ulang sebagai kartu baru). Mengembalikan daftar
 * pertanyaan yang ditampilkan, atau null bila tidak ada yang perlu
 * ditanyakan (alur langsung ke brief — sah).
 */
export function presentQuestionnaire(ctx: UniversalIntakeContext): QuestionnaireQuestion[] | null {
  const qs = selectQuestionnaireQuestions(ctx);
  if (!qs.length) return null;
  for (const q of qs) {
    if (!ctx.questionnaire.presentedKeys.includes(q.key)) ctx.questionnaire.presentedKeys.push(q.key);
  }
  ctx.questionnaire.status = 'presented';
  return qs;
}

/* ------------------------------------------------------------------ */
/* Penerapan jawaban                                                   */
/* ------------------------------------------------------------------ */

/** Label manusiawi satu jawaban (dari opsi terpilih / teks khusus). */
export function questionnaireAnswerLabel(def: SpecQuestionDef, rec: QuestionnaireAnswerRecord): string {
  const labels = rec.selectedIds
    .map((id) => def.options?.find((o) => o.id === id)?.label ?? id)
    .filter(Boolean);
  if (rec.customText) labels.push(rec.customText);
  return labels.join(', ');
}

export interface ApplyQuestionnaireResult {
  appliedLabels: string[];
  skippedLabels: string[];
  changedLabels: string[];
}

/**
 * Terapkan kiriman kuesioner ke konteks kanonis. VALIDASI PENUH dulu
 * (atomik): kunci tak dikenal / id opsi tak dikenal / bentuk tak sah →
 * QuestionnaireValidationError dan konteks TIDAK berubah sama sekali.
 * Pertanyaan yang tidak disertakan dalam kiriman tetapi sudah pernah
 * ditampilkan diperlakukan sebagai dilewati (tidak dijawab = belum
 * ditentukan) — pengguna tidak dipaksa menjawab semuanya.
 */
export function applyQuestionnaireAnswers(
  ctx: UniversalIntakeContext,
  submitted: Record<string, QuestionnaireAnswerRecord>,
): ApplyQuestionnaireResult {
  // --- validasi (tanpa mutasi) ---
  for (const [key, rec] of Object.entries(submitted)) {
    const def = defByKey(key);
    if (!def) throw new QuestionnaireValidationError(`Pertanyaan kuesioner tidak dikenal: ${key}`);
    if (!rec || (rec.status !== 'answered' && rec.status !== 'skipped')) {
      throw new QuestionnaireValidationError(`Status jawaban tidak sah untuk ${key}`);
    }
    if (!Array.isArray(rec.selectedIds)) {
      throw new QuestionnaireValidationError(`Pilihan jawaban tidak sah untuk ${key}`);
    }
    if (def.kind === 'single' && rec.selectedIds.length > 1) {
      throw new QuestionnaireValidationError(`Pertanyaan ${key} hanya menerima satu pilihan`);
    }
    for (const id of rec.selectedIds) {
      if (!(def.options ?? []).some((o) => o.id === id)) {
        throw new QuestionnaireValidationError(`Pilihan tidak dikenal untuk ${key}: ${id}`);
      }
    }
    if (rec.customText != null && (typeof rec.customText !== 'string' || rec.customText.length > 300)) {
      throw new QuestionnaireValidationError(`Jawaban teks tidak sah untuk ${key}`);
    }
    if (rec.status === 'answered' && rec.selectedIds.length === 0 && !(rec.customText ?? '').trim()) {
      throw new QuestionnaireValidationError(`Jawaban ${key} kosong — pilih opsi, tulis jawaban, atau lewati`);
    }
  }

  // --- mutasi ---
  const appliedLabels: string[] = [];
  const skippedLabels: string[] = [];
  const changedLabels: string[] = [];
  const effective: Record<string, QuestionnaireAnswerRecord> = { ...submitted };
  // Pertanyaan yang pernah ditampilkan tetapi tidak disertakan =
  // dilewati (belum ditentukan), dicatat agar tidak ditanya ulang.
  for (const key of ctx.questionnaire.presentedKeys) {
    if (!(key in effective) && !ctx.questionnaire.answers[key]) {
      effective[key] = { selectedIds: [], customText: null, status: 'skipped' };
    }
  }
  for (const [key, rec] of Object.entries(effective)) {
    const def = defByKey(key);
    if (!def) continue;
    const prev = ctx.questionnaire.answers[key];
    const clean: QuestionnaireAnswerRecord = {
      selectedIds: [...rec.selectedIds],
      customText: rec.customText != null ? rec.customText.trim() || null : null,
      status: rec.status,
    };
    ctx.questionnaire.answers[key] = clean;
    if (clean.status === 'skipped') {
      skippedLabels.push(def.missingLabel);
      continue;
    }
    const label = questionnaireAnswerLabel(def, clean);
    if (prev && prev.status === 'answered') {
      const prevLabel = questionnaireAnswerLabel(def, prev);
      if (prevLabel !== label) {
        ctx.corrections.push({ key: `kuesioner:${key}`, from: prevLabel, to: label });
        changedLabels.push(`${def.missingLabel}: ${prevLabel} → ${label}`);
      }
    }
    def.apply(ctx, label, clean);
    appliedLabels.push(`${def.missingLabel}: ${label}`);
  }
  ctx.questionnaire.status = 'submitted';
  ctx.questionnaire.submittedAt = new Date().toISOString();
  return { appliedLabels, skippedLabels, changedLabels };
}

/**
 * Pengguna memilih langsung ke brief ("Susun brief sekarang") saat
 * kuesioner belum terkirim: pertanyaan tertampil ditandai dilewati —
 * jujur sebagai belum ditentukan, bukan dijawab.
 */
export function skipPendingQuestionnaire(ctx: UniversalIntakeContext): void {
  if (ctx.questionnaire.status === 'submitted') return;
  for (const key of ctx.questionnaire.presentedKeys) {
    if (!ctx.questionnaire.answers[key]) {
      ctx.questionnaire.answers[key] = { selectedIds: [], customText: null, status: 'skipped' };
    }
  }
  if (ctx.questionnaire.status === 'presented') {
    ctx.questionnaire.status = 'submitted';
    ctx.questionnaire.submittedAt = new Date().toISOString();
  }
}

/* ------------------------------------------------------------------ */
/* Turunan untuk brief & generate                                      */
/* ------------------------------------------------------------------ */

/** Label spesifikasi kuesioner yang masih BELUM TERSELESAIKAN (untuk brief). */
export function questionnaireUnresolvedLabels(ctx: UniversalIntakeContext): string[] {
  if (ctx.questionnaire.status === 'not-presented') return [];
  const out: string[] = [];
  for (const def of SPEC_QUESTION_DEFS) {
    if (!def.appliesTo(ctx)) continue;
    if (def.isSatisfied(ctx)) continue;
    const rec = ctx.questionnaire.answers[def.key];
    if (rec && rec.status === 'answered') continue;
    out.push(def.missingLabel);
  }
  return out;
}

/** Baris brief untuk seksi kuesioner (jawaban terkonfirmasi + yang dilewati). */
export function questionnaireBriefLines(ctx: UniversalIntakeContext): string[] {
  if (ctx.questionnaire.status === 'not-presented') return [];
  const lines: string[] = [];
  const answered: string[] = [];
  const skipped: string[] = [];
  for (const def of SPEC_QUESTION_DEFS) {
    const rec = ctx.questionnaire.answers[def.key];
    if (!rec) continue;
    if (rec.status === 'answered') answered.push(`• ${def.missingLabel}: ${questionnaireAnswerLabel(def, rec)}`);
    else skipped.push(def.missingLabel);
  }
  if (answered.length) {
    lines.push('');
    lines.push('**Spesifikasi dari kuesioner (jawaban Anda — terkonfirmasi)**');
    lines.push(...answered);
  }
  if (skipped.length) {
    lines.push('');
    lines.push(`**Belum ditentukan (Anda lewati di kuesioner):** ${skipped.join('; ')} — bagian ini memakai parameter template dan dinyatakan pada draft, bukan ditebak.`);
  }
  return lines;
}

/**
 * Frasa alami dari jawaban kuesioner TERKONFIRMASI untuk teks generate
 * — kata-kata pengguna sendiri dinyatakan ulang agar mesin kanonis
 * (yang bekerja dari teks) melihatnya, pola yang sama dengan
 * generateFromUniversalContext untuk fakta lain.
 */
export function questionnaireGeneratePhrases(ctx: UniversalIntakeContext): string[] {
  const out: string[] = [];
  for (const def of SPEC_QUESTION_DEFS) {
    const rec = ctx.questionnaire.answers[def.key];
    if (!rec || rec.status !== 'answered') continue;
    const label = questionnaireAnswerLabel(def, rec);
    out.push(def.phrase ? def.phrase(label) : label);
  }
  return out;
}

/** Render teks kuesioner (salinan terbaca yang lestari di riwayat percakapan). */
export function questionnaireTextLines(questions: QuestionnaireQuestion[]): string[] {
  const lines: string[] = [
    'Sebelum brief ditinjau, lengkapi spesifikasi berikut lewat **kartu kuesioner** di pesan ini — ' +
      'pilih jawaban yang sudah Anda putuskan; yang belum, pilih **"Belum ditentukan"** saja. ' +
      'Anda juga bisa menjawab/mengoreksi lewat teks biasa.',
  ];
  questions.forEach((q, i) => {
    lines.push('');
    lines.push(`**${i + 1}. ${q.prompt}**`);
    for (const o of q.options) lines.push(`• ${o.label}`);
    if (q.allowCustom && q.kind !== 'text') lines.push('• Lainnya (tulis jawaban khusus)');
    lines.push('• Belum ditentukan');
  });
  return lines;
}

/* ------------------------------------------------------------------ */
/* Derivasi spesifikasi terstruktur v2 (Rantai Spek → RAB, Fase 2 A)  */
/* ------------------------------------------------------------------ */

/** Kunci definisi kuesioner (untuk uji silang S7: META harus mencakup semuanya). */
export function questionnaireDefKeys(): string[] {
  return SPEC_QUESTION_DEFS.map((d) => d.key);
}

/** Satuan spek count/budget yang ditetapkan skema (kunci lain tanpa satuan). */
function specUnitForKey(key: string): string | undefined {
  if (key === 'kandang-capacity') return 'ekor';
  if (key === 'building-bedrooms') return 'kamar tidur';
  if (key === 'budget') return 'IDR';
  return undefined;
}

function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (v != null && v.trim() !== '') return v;
  }
  return null;
}

/**
 * Selesaikan nilai spek dari label jawaban + record kuesioner.
 * - kind 'multi' pada definisi (facilities, mep-scope, vegetation,
 *   renovation-mep): SELALU string[] label opsi dari record — label
 *   gabungan di ctx.answers (string yang digabung ', ') sengaja TIDAK
 *   dipakai karena tidak bisa dipecah balik dengan andal.
 * - kind 'count': angka pertama dari label ("30 ekor" → 30). Bila
 *   parse gagal, value = label string apa adanya — SPEK SEPERTI INI
 *   SENGAJA TIDAK LOLOS validateStructuredSpecs (fail-closed: data
 *   rusak tidak ditebak menjadi angka); rehydrate membuang medan
 *   specs-nya, konteks tetap hidup dari jawaban kanonis.
 * - kind 'dimension' (GATE 4 / 5D): SAMA seperti 'count' — angka
 *   pertama dari label ("12 m" → 12). Sebelum gate ini tidak ada
 *   kunci dimension yang lewat jalur jawaban (hanya ded-* yang
 *   ber-kind dimension, dan itu tidak pernah datang dari jawaban);
 *   revisi spek DED yang dikonfirmasi user dicatat di ctx.answers
 *   (applyDedSpecRevision) sehingga jalur ini HARUS menghasilkan
 *   number — validator MENOLAK string untuk kind dimension, dan
 *   string di sini akan membuang SELURUH array spek saat rehydrate.
 * - selain itu: label string apa adanya (atau null bila tak ada).
 */
function resolveSpecValue(
  key: string,
  kind: string,
  rec: QuestionnaireAnswerRecord | null,
  ctxAnswer: string | undefined,
): StructuredSpec['value'] {
  const def = defByKey(key);
  if (def && def.kind === 'multi' && rec) {
    const labels = rec.selectedIds
      .map((id) => def.options?.find((o) => o.id === id)?.label ?? id)
      .filter(Boolean);
    if (rec.customText) labels.push(rec.customText);
    if (labels.length) return labels;
    const fallback = firstNonEmpty(ctxAnswer, rec.customText);
    return fallback != null ? [fallback] : [];
  }
  const label = firstNonEmpty(
    ctxAnswer,
    def && rec ? questionnaireAnswerLabel(def, rec) : null,
    rec?.customText ?? null,
    rec ? rec.selectedIds.join(', ') : null,
  );
  if (kind === 'count') {
    const m = label != null ? label.match(/\d+/) : null;
    if (m) return Number(m[0]);
    return label; // parse gagal → string; gagal validasi (lihat catatan di atas)
  }
  if (kind === 'dimension') {
    // GATE 4 (5D): dimensi boleh desimal ("12,5 m" → 12.5). Perilaku
    // 'count' di atas TIDAK diubah (tetap bilangan bulat).
    const m = label != null ? label.match(/\d+(?:[.,]\d+)?/) : null;
    if (m) return Number(m[0].replace(',', '.'));
    return label; // parse gagal → string; gagal validasi (lihat catatan di atas)
  }
  return label;
}

/**
 * Derivasi SATU-SATUNYA sumber kanonis: `ctx.questionnaire.answers` +
 * `ctx.answers` + `ctx.budget` + `ctx.dedSpecs` (GATE 4 / 5D).
 * PURE — tidak memutasi ctx.
 *
 * (a) tiap kunci questionnaire.answers 'answered' → satu spek
 *     CONFIRMED, source 'kuesioner' (kind+label dari SPEC_KEY_META);
 * (b) tiap kunci 'skipped' → value null, UNRESOLVED, source
 *     'kuesioner' (agar validasi bisa melaporkan "belum ditentukan —
 *     tidak terpakai");
 * (c) ctx.answers untuk kunci percakapan yang ADA di SPEC_KEY_META dan
 *     BELUM tercakup (a)/(b) → CONFIRMED, source 'percakapan';
 * (d) ctx.budget != null → spek 'budget' dari `budget.amount` (nilai
 *     TERKINI — revisi terakhir — BUKAN budgetHistory[0]);
 * (e) kunci jawaban yang TIDAK ada di SPEC_KEY_META DILEWATI (bukan
 *     error) — SENGAJA: jawaban percakapan lain (mis. 'kandang-size',
 *     'building-function', 'renovation-scope') bukan spek terstruktur
 *     v2; memaksa semuanya masuk META akan mengarang kind.
 * (f) urutan deterministik: diurutkan alfabetis berdasarkan kunci.
 * (g) GATE 4 (5D) — ctx.dedSpecs (spek hasil ekstraksi DED kanonis,
 *     sumber 'DED', provenans per spek) untuk kunci yang BELUM
 *     tercakup (a)–(d): spek user untuk kunci yang sama SELALU
 *     menang atas spek DED (nilai DED tidak menimpa spek
 *     terkonfirmasi user tanpa konfirmasi); spek DED yang kalah
 *     tidak muncul di hasil derive (nilai aslinya tetap tersimpan
 *     di ctx.dedSpecs + lampiran DED). Entri dedSpecs yang tidak
 *     lolos isValidDedSpec DILEWATI per entri (satu entri rusak
 *     tidak membuang spek DED lain yang sah). Bila jawaban user
 *     (c) menimpa kunci yang juga ada di dedSpecs, spek hasilnya
 *     membawa `supersedes: 'ded-spec:<key>'` agar jejak penggantian
 *     dapat dibuktikan.
 */
export function deriveStructuredSpecs(ctx: UniversalIntakeContext): StructuredSpec[] {
  const updatedAt = ctx.questionnaire.submittedAt ?? new Date().toISOString();
  const covered = new Set<string>();
  const out: StructuredSpec[] = [];
  // GATE 4 (5D): kunci DED yang sah (untuk supersedes di (c) + aturan (g)).
  const validDedSpecs = (ctx.dedSpecs ?? []).filter((s) => isValidDedSpec(s));
  const dedKeys = new Set(validDedSpecs.map((s) => s.key));
  const push = (
    key: string,
    value: StructuredSpec['value'],
    status: StructuredSpec['status'],
    source: StructuredSpec['source'],
    extra?: { supersedes?: string | null; provenance?: string },
  ): void => {
    const meta = SPEC_KEY_META[key];
    const spec: StructuredSpec = {
      key,
      kind: meta.kind,
      label: meta.label,
      value,
      status,
      source,
      updatedAt,
    };
    if (extra?.supersedes) spec.supersedes = extra.supersedes;
    if (extra?.provenance) spec.provenance = extra.provenance;
    const unit = specUnitForKey(key);
    if (unit) spec.unit = unit;
    out.push(spec);
  };

  // (a) + (b): record kuesioner.
  for (const [key, rec] of Object.entries(ctx.questionnaire.answers ?? {})) {
    const meta = SPEC_KEY_META[key];
    if (!meta) continue; // (e): kunci tak dikenal di META dilewati
    covered.add(key);
    if (rec.status === 'skipped') {
      push(key, null, 'UNRESOLVED', 'kuesioner');
    } else {
      push(key, resolveSpecValue(key, meta.kind, rec, ctx.answers[key]), 'CONFIRMED', 'kuesioner');
    }
  }
  // (c): jawaban percakapan yang belum tercakup.
  for (const [key, answer] of Object.entries(ctx.answers ?? {})) {
    const meta = SPEC_KEY_META[key];
    if (!meta || covered.has(key)) continue;
    // GATE 4 (5D): jawaban user yang menimpa kunci DED mencatat jejaknya.
    // Kunci ditandai tercakup — tanpanya, aturan (g) akan mendorong spek
    // DED untuk kunci yang sama dan menghasilkan KUNCI GANDA.
    covered.add(key);
    push(
      key,
      resolveSpecValue(key, meta.kind, null, answer),
      'CONFIRMED',
      'percakapan',
      dedKeys.has(key) ? { supersedes: `ded-spec:${key}` } : undefined,
    );
  }
  // (d): budget terkini.
  if (ctx.budget != null) {
    push('budget', ctx.budget.amount, 'CONFIRMED', 'percakapan');
  }
  // (g) GATE 4 (5D): spek DED untuk kunci yang belum tercakup — spek
  // user menang; provenans + status asal DED dipertahankan apa adanya
  // (ASSUMPTION tetap ASSUMPTION; unit asal DED dipertahankan).
  for (const d of validDedSpecs) {
    // Sabuk-pengaman kedua: kunci yang sudah ada di `out` (aturan
    // mana pun) tidak pernah didorong dua kali — derive harus
    // menghasilkan SATU spek per kunci.
    if (covered.has(d.key) || out.some((s) => s.key === d.key)) continue;
    covered.add(d.key);
    const meta = SPEC_KEY_META[d.key];
    out.push({
      key: d.key,
      kind: meta.kind,
      label: d.label,
      value: d.value,
      unit: d.unit,
      status: d.status,
      source: 'DED',
      updatedAt: d.updatedAt,
      ...(d.provenance ? { provenance: d.provenance } : {}),
    });
  }
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}
