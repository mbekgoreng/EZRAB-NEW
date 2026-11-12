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
}

/**
 * Parse spesifikasi bebas dari teks. Mengembalikan null bila:
 * - teks cocok dengan template TERDAFTAR (jalur kartu pilihan memilikinya),
 * - objek bukan rumah, atau
 * - tidak ada basis luas yang terukur (dimensi / luas bangunan / angka tipe).
 */
export function parseFreeSpec(rawText: string): FreeSpec | null {
  const text = (rawText || '').trim();
  if (!text) return null;
  if (findDirectTemplate(text)) return null;

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
 */
export function buildSpecRab(rawText: string): DirectRabResult | null {
  const spec = parseFreeSpec(rawText);
  if (!spec) return null;
  return buildFromFreeSpec(spec, rawText);
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
 */
export function buildSpecRabFromNeeds(needs: RabNeeds): DirectRabResult | null {
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
      landAreaM2: dims ? dims.p * dims.l : null,
      areaMismatch: dims
        ? Math.abs(needs.buildingArea - dims.p * dims.l * floors) > 0.15 * needs.buildingArea
        : false,
      bedrooms: needs.bedrooms,
      bathrooms: needs.bathrooms,
      location: needs.location,
      typeNumber: null,
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
      landAreaM2: null,
      areaMismatch: false,
      bedrooms: needs.bedrooms,
      bathrooms: needs.bathrooms,
      location: needs.location,
      typeNumber: null,
    };
  } else {
    return null;
  }
  if (spec.footprintArea < 15 || spec.footprintArea > 250 || spec.totalArea > 500) return null;
  return buildFromFreeSpec(spec, '');
}

/** Inti generate dari FreeSpec — dipakai jalur teks & jalur kebutuhan. */
function buildFromFreeSpec(spec: FreeSpec, rawText: string): DirectRabResult | null {
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
    assumptions.push(
      `Type ${spec.typeNumber} belum memiliki template terdaftar — dihitung parametrik dengan konvensi EZRAB: angka tipe = luas per lantai (${spec.typeNumber} m² × ${spec.floors} lantai = ${fmtArea(spec.totalArea)} m²).`
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

  const result: DirectRabResult = {
    houseType: Math.round(spec.footprintArea),
    floors: spec.floors,
    totalArea: spec.totalArea,
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
  };
  setLastDirectRab(result);
  return result;
}
