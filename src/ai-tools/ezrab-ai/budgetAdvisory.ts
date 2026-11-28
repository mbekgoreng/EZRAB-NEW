/**
 * budgetAdvisory — rekomendasi ukuran/tipe rumah dari budget
 * (perintah owner 2026-11-28 04:12).
 *
 * CACAT YANG DIPERBAIKI: "saya ada budget 100jt ingin membuat rumah,
 * sebaiknya rumah dengan ukuran berapa dan tipe berapa yang bisa saya
 * bangun?" dijawab ringkasan kebutuhan kosong + minta pengguna
 * melengkapi luas/tanah — padahal ukuran/tipe itulah yang didelegasikan
 * ke AI. Jawaban benar: AI MENENTUKAN ukuran/tipe dari perhitungannya
 * sendiri, lalu hanya minta pilihan/konfirmasi.
 *
 * ALUR DATA (aturan owner 2026-11-28 04:20 — prompt → AI EZRAB →
 * skill/database EZRAB → jawab): cabang ini 100% deterministik dan
 * TIDAK PERNAH memanggil LLM. Deteksi intent di intentRouter,
 * rekomendasi dihitung dari data EZRAB sendiri — HouseTypeCatalog +
 * mesin parametrik buildDirectRab (template + AHSP 2026 + indeks harga)
 * — angka tidak pernah dikarang. Bila data tidak bisa menghitung,
 * jawabannya jujur "tidak bisa dihitung", bukan tebakan.
 *
 * YANG TIDAK DIUBAH: aturan echo-first 2026-11-26 tetap berlaku untuk
 * permintaan yang SUDAH menyebut spek (ukuran/tipe/luas). Cabang
 * advisory hanya aktif bila keputusan ukuran/tipe didelegasikan ke AI
 * (budget disebut + frasa saran + rumah, TANPA ukuran/tipe eksplisit).
 */

import { buildDirectRab, getLastDirectRab, setLastDirectRab } from './directRab';
import type { DirectRabResult } from './directRab';
import { HouseTypeCatalog } from '../../data/houseTypeCatalog';
import { extractRabNeeds, parseBudgetMentions, stripLandPhrases } from './rabNeeds';
import type { RabNeeds } from './rabNeeds';
import { formatRupiah } from './budgetFeasibility';

/* ------------------------------------------------------------------ */
/* Deteksi intent advisory (dipakai intentRouter, SEBELUM pola          */
/* CREATE_RAB_SUMMARY — kalau tidak, pesan ini jatuh ke ringkasan       */
/* kebutuhan yang justru menanyakan balik ukuran yang diminta AI        */
/* putuskan).                                                           */
/* ------------------------------------------------------------------ */

export interface BudgetAdvisoryDetection {
  budgetIdr: number;
  floors: number | null;
  floorsMentioned: boolean;
}

const ADVISORY_WORD_RE =
  /\b(sebaiknya|rekomendasi|rekomendasikan|saran|sarankan|mending|enaknya|cocok|disarankan|ideal|bagusnya)\b/i;
const ADVISORY_ASK_RE = /\b(ukuran|tipe|type|besar|luas)\s+(berapa|mana|apa)\b/i;
const ADVISORY_CAN_RE =
  /\b(bisa|dapat|dpt)\b[^.]{0,50}\b(dibangun|dibuat|didapat|diperoleh|bangun|membangun)\b/i;
const HOUSE_RE = /\b(rumah|hunian)\b/i;
/** Ukuran/tipe EKSPLISIT — bila ada, bukan pertanyaan saran. */
const TYPE_NUM_RE = /\b(type|tipe)\s*[-_]?\s*\d/i;
const AREA_NUM_RE = /\d+\s*(m2|m²|meter\s+persegi)\b/i;
const DIM_RE = /\d+\s*[x×]\s*\d+/;
/** Penjaga: DED dan "full ai" literal tidak diambil alih cabang ini. */
const DED_RE = /\b(ded|gambar\s+kerja)\b/i;
const FULL_AI_RE = /\bfull\s*ai\b/i;

export function detectBudgetAdvisoryIntent(rawText: string): BudgetAdvisoryDetection | null {
  const raw = rawText ?? '';
  if (!raw.trim()) return null;
  // D4: "full ai" literal tetap merute ke Full AI.
  if (FULL_AI_RE.test(raw)) return null;
  // Permintaan DED tetap jalur DED.
  if (DED_RE.test(raw)) return null;
  const mentions = parseBudgetMentions(raw);
  if (mentions.length === 0) return null;
  // Last-match, selaras semantik budgetCap (kemunculan TERAKHIR menang).
  const budgetIdr = mentions[mentions.length - 1].amount;
  if (!Number.isFinite(budgetIdr) || budgetIdr <= 0) return null;
  // Frasa lahan dibuang dulu agar "tanah 6x15" tidak terbaca sebagai
  // dimensi/ukuran BANGUNAN (pola yang sama dengan findDirectTemplate).
  const stripped = stripLandPhrases(raw);
  if (!HOUSE_RE.test(stripped)) return null;
  const advisory =
    ADVISORY_WORD_RE.test(stripped) ||
    ADVISORY_ASK_RE.test(stripped) ||
    ADVISORY_CAN_RE.test(stripped);
  if (!advisory) return null;
  // Ukuran/tipe sudah disebut → echo-first yang berlaku, bukan saran.
  if (TYPE_NUM_RE.test(stripped)) return null;
  if (AREA_NUM_RE.test(stripped)) return null;
  if (DIM_RE.test(stripped)) return null;
  const needs = extractRabNeeds(stripped);
  return { budgetIdr, floors: needs.floors ?? null, floorsMentioned: needs.floors != null };
}

/* ------------------------------------------------------------------ */
/* Perhitungan rekomendasi dari data EZRAB (tanpa LLM, tanpa karangan). */
/* ------------------------------------------------------------------ */

export interface AdvisoryOption {
  /** Label tampil, mis. "Rumah Type 45" / "Rumah 26 m² (basis Type 36)". */
  label: string;
  /** Luas bangunan TOTAL (m²) yang direkomendasikan. */
  areaM2: number;
  floors: number;
  /** Tipe katalog yang menjadi basis perhitungan. */
  basisType: number;
  totalRabCost: number;
  totalDirectCost: number;
  costPerM2: number | null;
  itemCount: number;
  unpricedCount: number;
  totalStatus: string;
  templateName: string;
  region: string;
  regionIsDefault: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  /** true bila luas BUKAN tipe standar (denah template diskalakan). */
  viaAreaAdaptation: boolean;
  /** Teks perintah yang, bila dikirim ke CREATE_RAB_DIRECT, membangun
   *  RAB yang SAMA PERSIS (total identik) — dipakai tombol "Lanjut". */
  buildParamText: string;
}

export interface BudgetAdvisoryComputation {
  budgetIdr: number;
  floors: number;
  floorsMentioned: boolean;
  /** Opsi yang muat di budget, urut luas TERBESAR dulu. */
  fitting: AdvisoryOption[];
  primary: AdvisoryOption | null;
  /** Tipe standar TERKECIL pada lantai ini (selalu dihitung bila ada). */
  cheapest: AdvisoryOption | null;
  /** Area tangga TERKECIL yang dihitung (dipakai pesan "belum cukup"). */
  smallestLadder: AdvisoryOption | null;
  /** Jumlah kandidat tipe yang berhasil dihitung engine. */
  candidatesComputed: number;
}

/** Luas minimum tangga (m² per lantai) — Type 21 adalah ukuran rumah
 *  subsidi terkecil yang umum; di bawah itu denah template tidak lagi
 *  bermakna. */
const LADDER_MIN_PER_FLOOR_M2 = 21;
const LADDER_STEP_M2 = 2;

function advisoryNeeds(userNeeds: RabNeeds, floors: number, buildingArea: number | null): RabNeeds {
  return {
    ...userNeeds,
    kind: 'rumah',
    kindLabel: 'Rumah Tinggal',
    floors,
    floorsMentioned: true,
    buildingArea,
    // Dimensi LAHAN tidak boleh menggerakkan denah bangunan (engine
    // memakai landLength/landWidth sebagai footprint bila terisi) —
    // rekomendasi ini soal bangunannya, bukan tanahnya.
    landLength: null,
    landWidth: null,
    landAreaM2: null,
    footprintM2: null,
    footprintFromDims: false,
  };
}

function provNumber(r: DirectRabResult, label: string): number | null {
  const entry = r.provenance.find((p) => p.label === label);
  if (!entry) return null;
  const m = entry.value.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function optionFromBuild(
  r: DirectRabResult | null,
  floors: number,
  viaAreaAdaptation: boolean,
  buildParamText: string,
): AdvisoryOption | null {
  if (!r) return null;
  // Pertahanan: template yang ter-resolve harus berlantai sama dengan
  // yang diminta (template 2 lantai tidak boleh menyamar jadi 1 lantai).
  if (r.floors !== floors) return null;
  const g: any = r.generation;
  const totalRabCost = g?.totalRabCost;
  const totalDirectCost = g?.totalDirectCost;
  if (typeof totalRabCost !== 'number' || !Number.isFinite(totalRabCost)) return null;
  if (typeof totalDirectCost !== 'number' || !Number.isFinite(totalDirectCost)) return null;
  const priced = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0;
  const unpricedCount = r.calc.items.filter((it) => !priced(it.unitPrice)).length;
  return {
    label: viaAreaAdaptation
      ? `Rumah ${r.totalArea} m² (basis Type ${r.houseType})`
      : `Rumah Type ${r.houseType}`,
    areaM2: r.totalArea,
    floors,
    basisType: r.houseType,
    totalRabCost,
    totalDirectCost,
    costPerM2: typeof g?.costPerM2 === 'number' ? g.costPerM2 : null,
    itemCount: r.calc.items.length,
    unpricedCount,
    totalStatus: typeof g?.totalStatus === 'string' ? g.totalStatus : 'INDICATIVE',
    templateName: r.templateName,
    region: r.region,
    regionIsDefault: r.regionIsDefault,
    bedrooms: provNumber(r, 'Kamar tidur'),
    bathrooms: provNumber(r, 'Kamar mandi'),
    viaAreaAdaptation,
    buildParamText,
  };
}

function typeText(area: number, floors: number): string {
  return `buatkan rab rumah type ${area}${floors > 1 ? ` ${floors} lantai` : ''}`;
}

export function computeBudgetAdvisory(
  budgetIdr: number,
  userNeeds: RabNeeds,
  floorsOverride: number | null,
): BudgetAdvisoryComputation {
  const floors = floorsOverride ?? 1;
  const floorsMentioned = floorsOverride != null;
  // buildDirectRab menulis slot lastDirectRab sebagai efek samping —
  // simpan & pulihkan agar perhitungan rekomendasi tidak menimpa hasil
  // RAB langsung pengguna yang sedang tampil.
  const prevDirect = getLastDirectRab();
  try {
    const candidates = HouseTypeCatalog.getAll().filter(
      (h) => h.templateId && h.area != null && h.defaultFloorCount === floors && h.readinessStatus === 'READY',
    );
    const computed: AdvisoryOption[] = [];
    for (const cand of candidates) {
      const area = cand.area as number;
      const text = typeText(area, floors);
      const needs = advisoryNeeds(userNeeds, floors, null);
      const opt = optionFromBuild(
        buildDirectRab(text, needs),
        floors,
        false,
        `${text} budget ${budgetIdr}`,
      );
      if (opt) computed.push(opt);
    }
    computed.sort((a, b) => a.areaM2 - b.areaM2);
    const fitting = computed
      .filter((o) => o.totalRabCost <= budgetIdr)
      .sort((a, b) => b.areaM2 - a.areaM2);
    const cheapest = computed.length > 0 ? computed[0] : null;
    let smallestLadder: AdvisoryOption | null = null;
    let primary: AdvisoryOption | null = fitting.length > 0 ? fitting[0] : null;
    if (!primary && cheapest) {
      // Tidak ada tipe standar yang muat — tangga luas di bawah tipe
      // terkecil, dihitung dari template yang SAMA (denah diskalakan,
      // jalur areaAdaptation engine). Bukan tebakan: tiap anak tangga
      // dihitung penuh oleh mesin parametrik.
      const basisArea = cheapest.areaM2;
      const minArea = LADDER_MIN_PER_FLOOR_M2 * floors;
      // Anak tangga turun 2 m² dari basis; luas minimum (21 m²/lantai)
      // SELALU ikut sebagai anak tangga terakhir meski tidak kelipatan
      // 2 dari basis (36 → 22 akan berhenti tanpa 21 bila hanya
      // mengandalkan langkah 2).
      const ladderAreas: number[] = [];
      for (let a = basisArea - LADDER_STEP_M2; a >= minArea; a -= LADDER_STEP_M2) ladderAreas.push(a);
      if (ladderAreas[ladderAreas.length - 1] !== minArea) ladderAreas.push(minArea);
      const ladderFitting: AdvisoryOption[] = [];
      let smallest: AdvisoryOption | null = null;
      for (const a of ladderAreas) {
        const text = typeText(cheapest.basisType, floors);
        const needs = advisoryNeeds(userNeeds, floors, a);
        const opt = optionFromBuild(
          buildDirectRab(text, needs),
          floors,
          true,
          `${text} luas bangunan ${a} m2 budget ${budgetIdr}`,
        );
        if (!opt) continue;
        smallest = opt;
        if (opt.totalRabCost <= budgetIdr) ladderFitting.push(opt);
      }
      smallestLadder = smallest;
      if (ladderFitting.length > 0) {
        ladderFitting.sort((a, b) => b.areaM2 - a.areaM2);
        primary = ladderFitting[0];
        fitting.push(...ladderFitting);
        fitting.sort((a, b) => b.areaM2 - a.areaM2);
      }
    }
    return {
      budgetIdr,
      floors,
      floorsMentioned,
      fitting,
      primary,
      cheapest,
      smallestLadder,
      candidatesComputed: computed.length,
    };
  } finally {
    setLastDirectRab(prevDirect);
  }
}

/* ------------------------------------------------------------------ */
/* Format jawaban + tombol pilihan.                                     */
/* ------------------------------------------------------------------ */

function partialNote(o: AdvisoryOption): string {
  if (o.unpricedCount <= 0) return '';
  const priced = o.itemCount - o.unpricedCount;
  return (
    ` (PARSIAL — ${priced} dari ${o.itemCount} item berharga; ` +
    `total final dapat berubah sesudah harga ${o.unpricedCount} item sisanya masuk)`
  );
}

function optionLine(o: AdvisoryOption): string {
  const size = o.viaAreaAdaptation
    ? `${o.areaM2} m² (basis Type ${o.basisType})`
    : `Type ${o.basisType} (${o.areaM2} m²)`;
  return `Rumah ${size}, ${o.floors} lantai — ${formatRupiah(o.totalRabCost)}${partialNote(o)}`;
}

function shortLabel(o: AdvisoryOption): string {
  return o.viaAreaAdaptation ? `Rumah ${o.areaM2} m²` : `Rumah Type ${o.basisType}`;
}

export function formatBudgetAdvisoryMessage(comp: BudgetAdvisoryComputation): string {
  const budgetRp = formatRupiah(comp.budgetIdr);
  // Tanpa kandidat sama sekali (mis. 3 lantai — tidak ada template
  // terdaftar): jujur tidak bisa menghitung, bukan mengarang.
  if (!comp.cheapest) {
    return (
      `Dengan budget ${budgetRp}, sejujurnya belum ada template rumah terdaftar untuk ${comp.floors} lantai ` +
      `di katalog EZRAB, jadi saya tidak bisa menghitung rekomendasi dari data — dan saya tidak akan mengarang angkanya. ` +
      `Susun manual lewat RAB & Estimasi, atau sebutkan 1–2 lantai.`
    );
  }
  const primary = comp.primary;
  if (!primary) {
    const cheapest = comp.cheapest;
    const gap = cheapest.totalRabCost - comp.budgetIdr;
    const smallest = comp.smallestLadder;
    const lines: string[] = [
      `Dengan budget ${budgetRp}, menurut perhitungan saya Anda belum bisa membangun rumah dari katalog EZRAB.`,
      '',
      `Tipe standar terkecil — ${optionLine(cheapest)} — jadi masih kurang ${formatRupiah(gap)}.`,
    ];
    if (smallest) {
      lines.push(
        `Rumah paling kecil yang bisa dihitung dari template yang sama (${smallest.areaM2} m²) totalnya ` +
          `${formatRupiah(smallest.totalRabCost)} — masih di atas budget Anda.`,
        '',
        `Bila budget bisa ditambah sampai minimal ${formatRupiah(smallest.totalRabCost)}, rumah ${smallest.areaM2} m² ` +
          `bisa saya susunkan RAB-nya. Atau susun manual lewat RAB & Estimasi.`,
      );
    } else {
      lines.push('', 'Bila budget bisa ditambah, saya bisa hitungkan lagi. Atau susun manual lewat RAB & Estimasi.');
    }
    return lines.join('\n');
  }
  const lines: string[] = [
    `Dengan budget ${budgetRp}, menurut perhitungan saya Anda bisa membangun rumah dengan ukuran ${primary.areaM2} m² ` +
      `dan tipe ${primary.basisType} (${primary.floors} lantai) — Total RAB ${formatRupiah(primary.totalRabCost)}${partialNote(primary)}.`,
  ];
  if (primary.viaAreaAdaptation && comp.cheapest) {
    lines.push(
      `• Basis: template Type ${primary.basisType} dengan denah diskalakan ke ${primary.areaM2} m² — tipe standar terkecil ` +
        `(Type ${comp.cheapest.basisType}, ${comp.cheapest.areaM2} m²) totalnya ${formatRupiah(comp.cheapest.totalRabCost)}, ` +
        `di atas budget ${formatRupiah(comp.cheapest.totalRabCost - comp.budgetIdr)}, jadi bukan rekomendasi utama.`,
    );
  }
  if (primary.costPerM2 != null) {
    lines.push(`• Biaya per m²: ±${formatRupiah(primary.costPerM2)}/m².`);
  }
  lines.push(`• Sisa budget: ${formatRupiah(comp.budgetIdr - primary.totalRabCost)}.`);
  const alternatives = comp.fitting.filter((o) => o !== primary).slice(0, 2);
  if (alternatives.length > 0) {
    lines.push('', 'Alternatif lain yang juga muat:');
    for (const alt of alternatives) lines.push(`• ${optionLine(alt)}`);
  }
  const regionNote = primary.regionIsDefault
    ? `${primary.region} (default — lokasi tidak disebutkan)`
    : primary.region;
  const assumptions: string[] = [];
  assumptions.push(
    comp.floorsMentioned
      ? `${comp.floors} lantai (Anda sebutkan)`
      : `${comp.floors} lantai (asumsi — tidak disebutkan; koreksi bila berbeda)`,
  );
  if (primary.bedrooms != null && primary.bathrooms != null) {
    assumptions.push(
      `kamar tidur ${primary.bedrooms} dan kamar mandi ${primary.bathrooms} mengikuti default template`,
    );
  }
  assumptions.push('biaya pembelian tanah tidak termasuk dalam RAB ini');
  lines.push(
    '',
    `Dihitung dari template parametrik EZRAB (${primary.templateName}), AHSP 2026, indeks harga ${regionNote}.`,
    '',
    `Asumsi yang saya pakai (koreksi bila berbeda): ${assumptions.join('; ')}.`,
    '',
    'Mau lanjut dengan yang mana? Pilih di bawah — saya susun RAB lengkapnya.',
  );
  return lines.join('\n');
}

export interface BudgetAdvisoryAction {
  label: string;
  action:
    | { kind: 'intent'; intent: 'CREATE_RAB_DIRECT'; param: string }
    | { kind: 'navigate'; menu: 'rab-estimasi' };
}

export function buildBudgetAdvisoryActions(comp: BudgetAdvisoryComputation): BudgetAdvisoryAction[] {
  if (comp.primary) {
    const shown = [comp.primary, ...comp.fitting.filter((o) => o !== comp.primary).slice(0, 2)];
    return shown.map((o) => ({
      label: `Lanjut: ${shortLabel(o)} — ${formatRupiah(o.totalRabCost)}`,
      action: { kind: 'intent', intent: 'CREATE_RAB_DIRECT', param: o.buildParamText },
    }));
  }
  const actions: BudgetAdvisoryAction[] = [];
  if (comp.cheapest) {
    actions.push({
      label: `Lanjut: ${shortLabel(comp.cheapest)} — ${formatRupiah(comp.cheapest.totalRabCost)}`,
      action: { kind: 'intent', intent: 'CREATE_RAB_DIRECT', param: comp.cheapest.buildParamText },
    });
  }
  if (comp.smallestLadder && comp.smallestLadder !== comp.cheapest) {
    actions.push({
      label: `Lanjut: ${shortLabel(comp.smallestLadder)} — ${formatRupiah(comp.smallestLadder.totalRabCost)}`,
      action: { kind: 'intent', intent: 'CREATE_RAB_DIRECT', param: comp.smallestLadder.buildParamText },
    });
  }
  actions.push({ label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } });
  return actions;
}
