/**
 * specRab — RAB langsung dari SPESIFIKASI BEBAS (perluasan directRab,
 * perintah owner 2026-10-22).
 *
 * Permintaan seperti "buatkan rab rumah 5x10", "buatkan rab rumah luas
 * bangunan 50 m2 dua lantai di Bogor", atau "buatkan rab rumah type 54"
 * (tipe yang BELUM punya template terdaftar) sebelumnya jatuh ke ringkasan
 * kebutuhan. Modul ini mem-parse spesifikasi terukur dari teks bebas lalu
 * meng-generate RAB lengkap memakai mesin yang SAMA dengan jalur direct
 * existing — parametricVolumeEngine + template parametrik terdaftar
 * (dipilih yang cakupannya paling dekat) — BUKAN engine baru, dan harga
 * TIDAK PERNAH dikarang: seluruh angka berasal dari resolver engine
 * (AHSP 2026 + indeks wilayah) dengan pelabelan kejujuran yang sama
 * persis seperti jalur template (formatter directRab dipakai ulang).
 *
 * Jalur derivasi Desain & RAB (specToSpreadsheetRows/spreadsheetToWorkItems)
 * sengaja TIDAK dipakai di sini: outputnya bervolume PRICE_UNRESOLVED tanpa
 * kode AHSP, sehingga memberi harga padanya berarti mengarang pemetaan
 * AHSP baru. Mesin parametrik adalah satu-satunya jalur chat yang memberi
 * harga dari data engine.
 *
 * Transparansi (aturan owner): setiap spesifikasi yang tidak disebutkan
 * memakai default yang dinyatakan terbuka di daftar asumsi hasil —
 * termasuk "Asumsi: 1 lantai (tidak disebutkan)". Luas lahan dicatat,
 * tetapi engine parametrik tidak memodelkan item berbasis luas lahan,
 * jadi dinyatakan terus terang bahwa ia belum memengaruhi hitungan.
 */

import {
  extractRabNeeds,
  parseBudgetMentions,
  parseLandDims,
  resolveLandAreaM2,
  stripLandPhrases,
} from './rabNeeds';
import type { RabNeeds } from './rabNeeds';
import { masterBuildingTemplateRegistry } from '../../data/buildingTemplates/masterTemplateRegistry';
import { parametricVolumeEngine } from '../../engine/parametricVolumeEngine/parametricVolumeEngine';
import {
  findDirectTemplate,
  matchDirectRegion,
  setLastDirectRab,
} from './directRab';
import type { DirectRabResult } from './directRab';
import type { RabIntentSpec } from './rabIntentSpec';
import { applyRelevanceGateToDirectCalc } from './directRabGate';

/* ------------------------------------------------------------------ */
/* Parser spesifikasi bebas                                            */
/* ------------------------------------------------------------------ */

const WORD_FLOORS: Record<string, number> = {
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
};

/**
 * Pemisahan lahan vs bangunan (remediasi S7): parser luas/dimensi lahan
 * kini hidup di rabNeeds.ts (dipakai bersama directRab) dan di-re-export
 * dari sini demi kompatibilitas import lama. Frasa lahan — "luas lahan
 * 90 m2" DAN "lahan 8x12" — diekstrak sebagai LAHAN lalu dibuang dari
 * teks SEBELUM extractRabNeeds, agar tidak terbaca sebagai luas/dimensi
 * BANGUNAN (bug lama: "lahan 8x12" menjadi tapak bangunan 96 m²).
 */
export { parseLandAreaM2, resolveLandAreaM2, parseLandDims } from './rabNeeds';

export interface FreeSpec {
  floors: number;
  /** false bila jumlah lantai tidak disebut sama sekali (default owner: 1). */
  floorsMentioned: boolean;
  /** Dimensi tapak dari teks (P × L), null bila tidak disebut. */
  dims: { p: number; l: number } | null;
  /** Luas per lantai yang dipakai untuk parameter engine. */
  footprintArea: number;
  /** Luas total seluruh lantai (semantik buildingArea engine). */
  totalArea: number;
  areaSource: 'dims' | 'explicit' | 'type';
  explicitBuildingArea: number | null;
  landAreaM2: number | null;
  /** true bila luas eksplisit menyimpang > 15% dari dimensi × lantai. */
  areaMismatch: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  location: string | null;
  /** Angka type|tipe bila disebut (dan tidak terdaftar — lihat parseFreeSpec). */
  typeNumber: number | null;
  /** Anggaran pengguna (Rp) dari teks, bila disebut — dipakai sebagai
   *  pembanding verdict kelayakan (tidak pernah memangkas lingkup).
   *  null/undefined = budget tidak disebut. Kemunculan TERAKHIR menang,
   *  selaras budgetCap universal. Jalur kebutuhan mengisi dari spek
   *  intent aktif (buildSpecRabFromNeeds). */
  budgetIdr?: number | null;
}

/**
 * Parse spesifikasi bebas dari teks. Mengembalikan null bila:
 * - teks cocok dengan template TERDAFTAR (jalur kartu pilihan memilikinya),
 * - objek bukan rumah, atau
 * - tidak ada basis luas yang terukur (dimensi / luas bangunan / angka tipe).
 *
 * `opts.skipTemplateGuard` (intent-first): lewati penjaga template — hanya
 * dipakai orkestrator sesudah ia mengevaluasi template terhadap spek dan
 * MENOLAKNYA (mis. template tidak dapat mewakili sistem atap eksplisit).
 * Tanpa ini, teks yang ditolak template tidak pernah sampai ke jalur spek
 * karena penjaga mengembalikan null atas dasar kecocokan template yang sama.
 */
export function parseFreeSpec(
  rawText: string,
  opts?: { skipTemplateGuard?: boolean },
): FreeSpec | null {
  const text = (rawText || '').trim();
  if (!text) return null;
  if (!opts?.skipTemplateGuard && findDirectTemplate(text)) return null;

  const lower = text.toLowerCase();
  const landAreaM2 = resolveLandAreaM2(text);
  const needs = extractRabNeeds(stripLandPhrases(text));
  if (needs.kind && needs.kind !== 'rumah') return null;
  if (!/\brumah\b/.test(lower) && needs.kind !== 'rumah') return null;

  // Jumlah lantai: angka dari extractRabNeeds, kata bilangan, atau
  // "bertingkat" (konvensi katalog = 2). Tidak disebut → 1 (aturan owner).
  let floors = needs.floors;
  let floorsMentioned = floors != null;
  if (floors == null) {
    const w = lower.match(/\b(satu|dua|tiga|empat|lima)\s+lantai/);
    if (w) {
      floors = WORD_FLOORS[w[1]];
      floorsMentioned = true;
    } else if (/\bbertingkat\b/.test(lower)) {
      floors = 2;
      floorsMentioned = true;
    }
  }
  if (floors == null) floors = 1;

  const dims =
    needs.landLength && needs.landWidth
      ? { p: needs.landLength, l: needs.landWidth }
      : null;
  const explicitBuildingArea = needs.buildingArea;
  const typeMatch = lower.match(/\b(?:type|tipe)\s*(\d+)/);
  const typeNumber = typeMatch ? parseInt(typeMatch[1], 10) : null;
  // Anggaran pengguna (sprint 2026-11-26, Worker F — D-G1): kemunculan
  // TERAKHIR menang, selaras budgetCap universal (budgetFeasibility).
  const budgetMentions = parseBudgetMentions(text);
  const budgetIdr = budgetMentions.length > 0
    ? budgetMentions[budgetMentions.length - 1].amount
    : null;

  let footprintArea: number;
  let totalArea: number;
  let areaSource: FreeSpec['areaSource'];
  let areaMismatch = false;
  if (dims && explicitBuildingArea) {
    // Alokasi awal (perbaikan overhaul 2026-11-06): luas eksplisit adalah
    // TOTAL seluruh lantai; tapak per lantai = total ÷ lantai. Memakai
    // dimensi sebagai tapak di sini menghasilkan alokasi tak masuk akal
    // (mis. lahan 6×15 + total 120 m² 2 lantai → tapak 90 / lantai atas 30).
    // Dimensi tetap dicatat (lahan) dan selisihnya ditandai areaMismatch.
    footprintArea = explicitBuildingArea / floors;
    totalArea = explicitBuildingArea;
    areaSource = 'explicit';
    areaMismatch =
      Math.abs(explicitBuildingArea - dims.p * dims.l * floors) > 0.15 * explicitBuildingArea;
  } else if (dims) {
    footprintArea = dims.p * dims.l;
    totalArea = footprintArea * floors;
    areaSource = 'dims';
  } else if (explicitBuildingArea) {
    totalArea = explicitBuildingArea;
    footprintArea = explicitBuildingArea / floors;
    areaSource = 'explicit';
  } else if (typeNumber) {
    footprintArea = typeNumber;
    totalArea = typeNumber * floors;
    areaSource = 'type';
  } else {
    return null;
  }

  // Batas kewajaran: di luar ini hasil parametrik tidak bermakna — pemanggil
  // jatuh ke ringkasan kebutuhan (jujur), bukan memaksa angka.
  if (floors < 1 || footprintArea < 15 || footprintArea > 250 || totalArea > 500) return null;

  return {
    floors,
    floorsMentioned,
    dims,
    footprintArea,
    totalArea,
    areaSource,
    explicitBuildingArea,
    landAreaM2,
    areaMismatch,
    bedrooms: needs.bedrooms,
    bathrooms: needs.bathrooms,
    location: needs.location,
    typeNumber,
    budgetIdr,
  };
}

/* ------------------------------------------------------------------ */
/* Generate RAB dari spesifikasi bebas                                 */
/* ------------------------------------------------------------------ */

/** Template parametrik 1 lantai terdekat menurut luas total. */
function pickOneFloorTemplateId(totalArea: number): string {
  if (totalArea <= 40.5) return 'HOUSE-T36-1FL';
  if (totalArea <= 57.5) return 'HOUSE-T45-1FL';
  return 'HOUSE-T70-1FL';
}

function fmtNum(v: number): string {
  return v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
}

function fmtArea(v: number): string {
  return v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
}

/**
 * Bangun RAB lengkap dari spesifikasi bebas memakai parametricVolumeEngine
 * dengan template terdaftar terdekat. Mengembalikan null bila spesifikasi
 * tidak terukur / di luar dukungan (lantai > 2) — pemanggil jatuh ke
 * ringkasan kebutuhan.
 *
 * `opts.intentSpec` (intent-first): spek kanonis dari orkestrator — bila
 * ada, sistem atap/material/struktur/lingkup eksplisit pengguna dicatat
 * di daftar asumsi + provenance hasil (mesin parametrik tidak
 * memodelkannya sebagai parameter terpisah, jadi kejujurannya adalah
 * mencatatnya terbuka, bukan mengklaimnya memengaruhi hitungan).
 *
 * `opts.budgetCap` (hardening 2026-11-26, Worker D §4D): anggaran
 * TERSTRUKTUR dari spek intent aktif — dipakai pemanggil yang membangun
 * dari teks SINTETIS (RAB_FULL_AI path-c), yang tidak memuat budget.
 * MENANG atas budget hasil parse teks (teks sintetis tidak pernah
 * memuat budget; teks asli tetap jadi fallback bila cap null).
 * Hanya pembanding verdict, tidak pernah memangkas lingkup.
 */
export function buildSpecRab(
  rawText: string,
  opts?: { skipTemplateGuard?: boolean; intentSpec?: RabIntentSpec | null; budgetCap?: number | null },
): DirectRabResult | null {
  const spec = parseFreeSpec(rawText, opts);
  if (!spec) return null;
  if (opts?.budgetCap != null) spec.budgetIdr = opts.budgetCap;
  return buildFromFreeSpec(spec, rawText, opts?.intentSpec ?? null);
}

/**
 * Bangun RAB langsung dari state kebutuhan percakapan (RabNeeds) — jalur
 * finalisasi chat ("itu aja"). Perbedaan penting dari jalur teks:
 * - Luas bangunan eksplisit adalah TOTAL seluruh lantai; tapak per lantai
 *   dialokasikan awal = total ÷ lantai (berlabel asumsi di hasil).
 * - Dimensi pada RabNeeds adalah LAHAN bila luas bangunan juga ada —
 *   tidak dipakai sebagai tapak; dicatat sebagai luas lahan.
 * - Tanpa luas bangunan, dimensi mengikuti konvensi jalur teks (tapak).
 * Mengembalikan null bila basis luas tidak ada / di luar kewajaran —
 * pemanggil wajib menjawab jujur, bukan mengarang draft.
 *
 * `budgetCap` (sprint 2026-11-26, Worker F — B-gap-2): anggaran dari
 * spek intent aktif — RabNeeds tidak punya field budget, jadi anggaran
 * diteruskan eksplisit dari pemanggil (continueRabFinalize) agar
 * verdict kelayakan ikut ter-render di draft finalisasi.
 */
export function buildSpecRabFromNeeds(needs: RabNeeds, budgetCap?: number | null): DirectRabResult | null {
  if (needs.kind && needs.kind !== 'rumah') return null;
  const floors = needs.floors ?? 1;
  const dims =
    needs.landLength && needs.landWidth
      ? { p: needs.landLength, l: needs.landWidth }
      : null;

  let spec: FreeSpec;
  if (needs.buildingArea) {
    spec = {
      floors,
      floorsMentioned: needs.floors != null,
      dims: null,
      footprintArea: needs.buildingArea / floors,
      totalArea: needs.buildingArea,
      areaSource: 'explicit',
      explicitBuildingArea: needs.buildingArea,
      // INTENT-FIRST: luas lahan dari state kebutuhan ikut terbawa
      // (sebelumnya hanya dari dimensi — luas lahan eksplisit "luas
      // lahan 120 m2" tanpa dimensi hilang dari hasil).
      landAreaM2: needs.landAreaM2 ?? (dims ? dims.p * dims.l : null),
      areaMismatch: dims
        ? Math.abs(needs.buildingArea - dims.p * dims.l * floors) > 0.15 * needs.buildingArea
        : false,
      bedrooms: needs.bedrooms,
      bathrooms: needs.bathrooms,
      location: needs.location,
      typeNumber: null,
      budgetIdr: budgetCap ?? null,
    };
  } else if (dims) {
    spec = {
      floors,
      floorsMentioned: needs.floors != null,
      dims,
      footprintArea: dims.p * dims.l,
      totalArea: dims.p * dims.l * floors,
      areaSource: 'dims',
      explicitBuildingArea: null,
      landAreaM2: needs.landAreaM2,
      areaMismatch: false,
      bedrooms: needs.bedrooms,
      bathrooms: needs.bathrooms,
      location: needs.location,
      typeNumber: null,
      budgetIdr: budgetCap ?? null,
    };
  } else {
    return null;
  }
  if (spec.footprintArea < 15 || spec.footprintArea > 250 || spec.totalArea > 500) return null;
  return buildFromFreeSpec(spec, '');
}

/** Inti generate dari FreeSpec — dipakai jalur teks & jalur kebutuhan. */
function buildFromFreeSpec(
  spec: FreeSpec,
  rawText: string,
  intentSpec?: RabIntentSpec | null,
): DirectRabResult | null {
  // Template rumah terdaftar hanya 1–2 lantai; 3+ lantai tidak dimodelkan
  // engine secara jujur → ringkasan, bukan dipaksa.
  if (spec.floors > 2) return null;

  const templateId =
    spec.floors === 2 ? 'HOUSE-T36-2FL' : pickOneFloorTemplateId(spec.totalArea);
  const template = masterBuildingTemplateRegistry.getTemplateById(templateId);
  if (!template) return null;

  const { region, isDefault: regionIsDefault } = matchDirectRegion(spec.location);

  // Dimensi engine: dari teks bila ada; bila hanya luas yang disebut,
  // turunkan dari luas dengan proporsi 1 : 2 (konvensi specEngine repo)
  // dan nyatakan sebagai asumsi.
  let buildingWidth: number;
  let buildingLength: number;
  let dimsDerived = false;
  if (spec.dims) {
    buildingLength = Math.max(spec.dims.p, spec.dims.l);
    buildingWidth = Math.min(spec.dims.p, spec.dims.l);
  } else {
    buildingWidth = Math.round(Math.sqrt(spec.footprintArea / 2) * 10) / 10;
    buildingLength = Math.round((spec.footprintArea / buildingWidth) * 10) / 10;
    dimsDerived = true;
  }

  const parameters: Record<string, unknown> = {
    buildingArea: spec.totalArea,
    floorCount: spec.floors,
    buildingLength,
    buildingWidth,
  };
  if (spec.floors === 2) {
    parameters.groundFloorArea = spec.footprintArea;
    parameters.upperFloorArea = spec.totalArea - spec.footprintArea;
  }
  if (spec.bedrooms) parameters.bedroomCount = spec.bedrooms;
  if (spec.bathrooms) parameters.bathroomCount = spec.bathrooms;

  let calc: DirectRabResult['calc'];
  try {
    calc = parametricVolumeEngine.calculate({ templateId: template.id, parameters, region });
  } catch {
    return null;
  }
  if (!calc.items || calc.items.length === 0) return null;

  // GATE 5 (5E) — gerbang relevansi ditegakkan pada jalur spek bebas
  // (sama seperti buildDirectRab; jalur kebutuhan memanggil fungsi ini
  // dengan rawText '' sehingga tanpa cakupan eksplisit — RAB rumah
  // dari kebutuhan tidak pernah meminta cakupan jalan secara eksplisit
  // lewat teks). Lihat directRabGate.ts.
  const gated = applyRelevanceGateToDirectCalc(calc, rawText);
  calc = gated.calc;

  /* ---- Daftar asumsi transparan (aturan owner) ---- */
  const assumptions: string[] = [];
  assumptions.push(
    `Basis hitung: template parametrik "${template.name}" — template terdaftar yang cakupannya paling dekat dengan luas total ${fmtArea(spec.totalArea)} m²; luas, dimensi, dan jumlah lantai yang dihitung mengikuti angka dari permintaan Anda.`
  );
  if (spec.areaSource === 'dims' && spec.dims) {
    assumptions.push(
      `Ukuran ${fmtNum(spec.dims.p)} × ${fmtNum(spec.dims.l)} m dipakai sebagai tapak bangunan per lantai (luas per lantai ${fmtArea(spec.footprintArea)} m²; total ${fmtArea(spec.totalArea)} m² untuk ${spec.floors} lantai).`
    );
  } else if (spec.areaSource === 'explicit') {
    assumptions.push(
      `Luas bangunan ${fmtArea(spec.explicitBuildingArea ?? spec.totalArea)} m² dari permintaan dipakai sebagai luas TOTAL seluruh lantai${spec.floors > 1 ? ` (±${fmtArea(spec.footprintArea)} m² per lantai)` : ''}.`
    );
    if (spec.areaMismatch && spec.dims) {
      assumptions.push(
        `Luas eksplisit itu berbeda dari hasil kali dimensi × lantai (${fmtArea(spec.dims.p * spec.dims.l * spec.floors)} m²) — yang dipakai sebagai acuan adalah luas eksplisit.`
      );
    }
  } else if (spec.areaSource === 'type' && spec.typeNumber) {
    // INTENT-FIRST: klaim "belum memiliki template terdaftar" hanya bila
    // template benar-benar tidak tersedia untuk permintaan ini — otoritasnya
    // SAMA dengan penjaga template (findDirectTemplate), bukan sekadar
    // kecocokan luas di katalog: Type 100 terdaftar 1 lantai, tetapi
    // permintaan "type 100 2 lantai" tidak punya template yang cocok
    // (penjaga meloloskannya justru karena findDirectTemplate null).
    // Wording "tidak dipakai" hanya bila orkestrator MENOLAK template yang
    // cocok (intentSpec ada = jalur bypass sesudah evaluasi template).
    const templateRejected = intentSpec != null && findDirectTemplate(rawText) != null;
    assumptions.push(
      templateRejected
        ? `Type ${spec.typeNumber} disebut eksplisit — dihitung parametrik dengan konvensi EZRAB: angka tipe = luas per lantai (${spec.typeNumber} m² × ${spec.floors} lantai = ${fmtArea(spec.totalArea)} m²). Template terdaftar Type ${spec.typeNumber} tidak dipakai sebagai basis karena spesifikasi Anda bukan parameter template (lihat catatan spesifikasi di bawah).`
        : `Type ${spec.typeNumber} belum memiliki template terdaftar — dihitung parametrik dengan konvensi EZRAB: angka tipe = luas per lantai (${spec.typeNumber} m² × ${spec.floors} lantai = ${fmtArea(spec.totalArea)} m²).`
    );
  }
  if (!spec.floorsMentioned) {
    assumptions.push('Asumsi: 1 lantai (tidak disebutkan).');
  }
  if (dimsDerived) {
    assumptions.push(
      `Dimensi tapak diturunkan dari luas dengan proporsi 1 : 2 (±${fmtNum(buildingWidth)} × ${fmtNum(buildingLength)} m) karena dimensi tidak disebutkan.`
    );
  }
  const defaultedRooms: string[] = [];
  if (!spec.bedrooms) {
    const d = template.parameters?.bedroomCount?.defaultValue;
    if (typeof d === 'number') defaultedRooms.push(`${d} kamar tidur`);
  }
  if (!spec.bathrooms) {
    const d = template.parameters?.bathroomCount?.defaultValue;
    if (typeof d === 'number') defaultedRooms.push(`${d} kamar mandi`);
  }
  if (defaultedRooms.length > 0) {
    assumptions.push(
      `Jumlah kamar tidak disebutkan — mengikuti default basis template (${defaultedRooms.join(', ')}).`
    );
  }
  if (spec.landAreaM2) {
    const landDims = parseLandDims(rawText);
    assumptions.push(
      `Luas lahan ${fmtArea(spec.landAreaM2)} m²${landDims ? ` (dari dimensi lahan ${fmtNum(landDims.p)} × ${fmtNum(landDims.l)} m)` : ''} dicatat, tetapi mesin parametrik saat ini tidak memodelkan item berbasis luas lahan (pembersihan & persiapan dihitung dari tapak bangunan) — luas lahan belum memengaruhi hitungan.`
    );
  }
  // Spesifikasi eksplisit dari intent spec (intent-first): atap, struktur,
  // pondasi, material, dan lingkup yang disebut pengguna DICATAT terbuka
  // di sini — mesin parametrik tidak memodelkannya sebagai parameter
  // terpisah, jadi kejujurannya adalah mencatat (bukan mengklaim pengaruh
  // hitungan, dan bukan menghilangkannya). Luas lahan dari intent spec
  // ikut dicatat bila parser FreeSpec tidak menangkapnya (mis. "luas
  // 100m2" telanjang yang dibaca sebagai lahan karena "luas bangunan"
  // berkualifikasi juga hadir).
  if (intentSpec) {
    if (intentSpec.landAreaM2 != null && spec.landAreaM2 == null) {
      assumptions.push(
        `Luas lahan ${fmtArea(intentSpec.landAreaM2)} m² dicatat dari permintaan Anda, tetapi mesin parametrik saat ini tidak memodelkan item berbasis luas lahan — luas lahan belum memengaruhi hitungan.`
      );
    }
    const recorded: string[] = [];
    if (intentSpec.roofSystem.length > 0) recorded.push(`atap ${intentSpec.roofSystem.join(', ')}`);
    if (intentSpec.foundationSystem) recorded.push(`pondasi ${intentSpec.foundationSystem}`);
    if (intentSpec.structuralSystem.length > 0) recorded.push(`struktur ${intentSpec.structuralSystem.join(', ')}`);
    if (intentSpec.materials.length > 0) recorded.push(`material ${intentSpec.materials.join(', ')}`);
    if (recorded.length > 0) {
      assumptions.push(
        `Spesifikasi dari Anda yang dicatat (mesin parametrik tidak memodelkannya sebagai parameter terpisah — periksa dan sesuaikan di spreadsheet): ${recorded.join('; ')}.`
      );
    }
    if (intentSpec.scope.length > 0) {
      assumptions.push(`Lingkup dari Anda: ${intentSpec.scope.join(', ')}.`);
    }
    if (intentSpec.exclusions.length > 0) {
      assumptions.push(
        `Pengecualian dari Anda: ${intentSpec.exclusions.join(', ')} — item terkait belum dikeluarkan otomatis dari tabel ini; hapus manual di spreadsheet bila tidak termasuk.`
      );
    }
  }

  const warnings: string[] = [];
  if (spec.floors > 1) {
    warnings.push(
      'Item struktur lantai atas & tangga mengikuti asumsi template 2 lantai EZRAB — periksa kembali di spreadsheet.'
    );
  }
  for (const gw of calc.generationResult.warnings.slice(0, 4)) {
    if (!warnings.includes(gw)) warnings.push(gw);
  }
  if (regionIsDefault && spec.location) {
    warnings.push(
      `Indeks harga regional untuk "${spec.location}" tidak ditemukan — memakai indeks DKI Jakarta.`
    );
  }
  for (const n of gated.notes) warnings.push(n);

  const displayLabel = spec.dims
    ? `Rumah ${fmtNum(spec.dims.p)}×${fmtNum(spec.dims.l)} m`
    : spec.areaSource === 'type' && spec.typeNumber
      ? `Rumah Type ${spec.typeNumber} (parametrik)`
      : `Rumah Luas Bangunan ${fmtArea(spec.totalArea)} m²`;

  // Provenance nilai (intent-first): mana dari Anda, mana dari template.
  const provenance: DirectRabResult['provenance'] = [
    { label: 'Luas bangunan', value: `${fmtArea(spec.totalArea)} m² (total)`, source: 'user' },
    { label: 'Basis template', value: template.name, source: 'template' },
    {
      label: 'Jumlah lantai',
      value: `${spec.floors} lantai`,
      source: spec.floorsMentioned ? 'user' : 'assumption',
    },
  ];
  if (spec.dims) provenance.push({ label: 'Dimensi tapak', value: `${fmtNum(spec.dims.p)} × ${fmtNum(spec.dims.l)} m`, source: 'user' });
  else if (dimsDerived) provenance.push({ label: 'Dimensi tapak', value: `±${fmtNum(buildingWidth)} × ${fmtNum(buildingLength)} m (proporsi 1:2)`, source: 'assumption' });
  if (spec.bedrooms) provenance.push({ label: 'Kamar tidur', value: `${spec.bedrooms}`, source: 'user' });
  else if (typeof template.parameters?.bedroomCount?.defaultValue === 'number') provenance.push({ label: 'Kamar tidur', value: `${template.parameters.bedroomCount.defaultValue}`, source: 'template' });
  if (spec.bathrooms) provenance.push({ label: 'Kamar mandi', value: `${spec.bathrooms}`, source: 'user' });
  else if (typeof template.parameters?.bathroomCount?.defaultValue === 'number') provenance.push({ label: 'Kamar mandi', value: `${template.parameters.bathroomCount.defaultValue}`, source: 'template' });
  const landForProvenance = spec.landAreaM2 ?? intentSpec?.landAreaM2 ?? null;
  if (landForProvenance) provenance.push({ label: 'Luas lahan', value: `${fmtArea(landForProvenance)} m² (dicatat)`, source: 'user' });
  if (intentSpec && intentSpec.roofSystem.length > 0) provenance.push({ label: 'Atap', value: intentSpec.roofSystem.join(', '), source: 'user' });
  if (intentSpec && intentSpec.scope.length > 0) provenance.push({ label: 'Lingkup', value: intentSpec.scope.join(', '), source: 'user' });
  provenance.push({
    label: 'Lokasi / indeks harga',
    value: spec.location ? `${spec.location} → ${region}` : `${region} (default)`,
    source: spec.location ? 'user' : 'assumption',
  });

  const result: DirectRabResult = {
    houseType: Math.round(spec.footprintArea),
    floors: spec.floors,
    totalArea: spec.totalArea,
    // Anggaran: dari FreeSpec (jalur teks / kebutuhan); bila kosong,
    // fallback ke intentSpec aktif yang diteruskan pemanggil — tanpa ini
    // draft jalur spek kehilangan verdict anggaran (D-G1).
    budgetIdr: spec.budgetIdr ?? intentSpec?.budgetIdr ?? null,
    catalogLabel: displayLabel,
    templateName: template.name,
    region,
    regionIsDefault,
    calc,
    generation: calc.generationResult,
    warnings,
    sourceKind: 'spec',
    displayLabel,
    assumptions,
    areaFallback: null,
    areaAdaptation: null,
    provenance,
  };
  setLastDirectRab(result);
  return result;
}
