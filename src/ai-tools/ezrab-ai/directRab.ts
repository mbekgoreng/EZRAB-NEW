/**
 * directRab — RAB langsung dari chat untuk rumah bertipe (Fase langsung
 * Chat-to-RAB, permintaan user 2026-10-21).
 *
 * Perintah seperti "buatkan saya rab rumah type 70 2 lantai" TIDAK lagi
 * berhenti di ringkasan kebutuhan / menu template: modul ini menjalankan
 * mesin parametrik EZRAB yang sudah ada (master template + quantity rules +
 * AHSP 2026) secara deterministik — tanpa panggilan AI, tanpa kredit — dan
 * menghasilkan tabel RAB lengkap per kelompok WBS yang bisa di-push ke
 * Spreadsheet RAB proyek aktif.
 *
 * Kejujuran angka (aturan produk):
 * - Volume dihitung quantityRule template — bukan karangan model bahasa.
 * - Harga berasal dari resolver AHSP engine. Harga benchmark/fallback
 *   engine ditandai `isPriceFabricated` dan WAJIB ditampilkan sebagai
 *   estimasi, bukan harga resmi. Item tanpa harga tampil "Harga belum
 *   tersedia" (tidak pernah diisi Rp0 karangan di luar data engine), dan
 *   total yang tidak mencakup semua item diberi label PARSIAL.
 * - Total mengikuti status engine (VERIFIED / INDICATIVE / INCOMPLETE).
 */

import { extractRabNeeds, parseBudgetMentions, stripLandPhrases } from './rabNeeds';
import type { RabNeeds } from './rabNeeds';
import { HouseTypeCatalog } from '../../data/houseTypeCatalog';
import type { HouseTypeCatalogItem } from '../../data/houseTypeCatalog';
import { masterBuildingTemplateRegistry } from '../../data/buildingTemplates/masterTemplateRegistry';
import {
  parametricVolumeEngine,
  REGIONAL_PRICE_INDICES,
} from '../../engine/parametricVolumeEngine/parametricVolumeEngine';
import type { TemplateGenerationResult } from '../../data/buildingTemplates/schema/types';
import { formatRupiah } from '../../engine/formulaEngine';
import { assessBudgetFeasibility, formatBudgetFeasibilityLine } from './budgetFeasibility';
import {
  resolveProvinceFromLocation,
  resolveRegionIndex,
} from '../../data/indonesiaRegions';
import { applyRelevanceGateToDirectCalc } from './directRabGate';
import type { FullAiCompletionSummary } from './fullAiRabCompletion';

export interface DirectRabResult {
  houseType: number;
  floors: number;
  /** Total luas seluruh lantai (tipe × lantai; jalur fallback luas = luas permintaan). */
  totalArea: number;
  /** Anggaran pengguna (Rp) dari pesan, bila disebut — dipakai sebagai
   *  pembanding verdict kelayakan (tidak pernah memangkas lingkup).
   *  null/undefined = budget tidak disebut. Diambil dari
   *  parseBudgetMentions kanonis (kemunculan TERAKHIR menang, selaras
   *  budgetCap universal). Jalur spek mengisi dari FreeSpec/intentSpec. */
  budgetIdr?: number | null;
  /** Fallback luas R1 (null = tipe eksak) — transparansi basis perhitungan. */
  areaFallback: { requestedArea: number; basisArea: number } | null;
  /**
   * Adaptasi luas intent-first (null = tidak ada): tipe disebut eksplisit
   * TAPI luas bangunan eksplisit berbeda dari luas tipe × lantai — luas
   * eksplisit yang dipakai (requestedArea), template hanya basis
   * parametrik (typeArea = luas tipe × lantai yang TIDAK dipakai).
   */
  areaAdaptation: { requestedArea: number; typeArea: number } | null;
  /** Asal nilai kunci hasil — mana dari Anda, mana dari template/asumsi. */
  provenance: Array<{ label: string; value: string; source: 'user' | 'template' | 'assumption' }>;
  catalogLabel: string;
  templateName: string;
  region: string;
  regionIsDefault: boolean;
  calc: ReturnType<typeof parametricVolumeEngine.calculate>;
  generation: TemplateGenerationResult;
  warnings: string[];
  /** 'template' = jalur type terdaftar; 'spec' = spesifikasi bebas (specRab.ts). */
  sourceKind: 'template' | 'spec';
  /** Label tampil header pesan & pesan push (mis. "Rumah Type 70" / "Rumah 5×10 m"). */
  displayLabel: string;
  /** Daftar asumsi transparan (jalur spec; jalur template memakai warnings). */
  assumptions: string[];
  /**
   * Lengkapi dengan Full AI (§5, 2026-11-22) — OPSIONAL, absen = perilaku
   * lama persis (byte-identical). Bila terisi, formatter merender tabel
   * dari `items` (salinan calc dengan harga terisi) + total RECOMPUTED
   * dari ringkasan — BUKAN total engine g.totalDirectCost/g.totalRabCost
   * yang basi sesudah harga diisi pasca-hoc. `calc` ASLI TIDAK PERNAH
   * diubah. Batch 4 (§7.2): salinan terisi ini JUGA yang di-push ke
   * Spreadsheet — `mapDirectRabPushItems` menggabungkan isian sebagai
   * PRICE_ESTIMATED + NEEDS_VERIFICATION + EZRAB_ASSUMPTION (bukan
   * RESOLVED), sehingga tabel chat dan spreadsheet membaca nilai yang
   * sama; harga engine asli tidak pernah ditimpa isian.
   */
  fullAiCompletion?: DirectRabFullAiCompletion;
}

/** Hasil completion Full AI untuk satu hasil RAB langsung (parametrik/spec). */
export interface DirectRabFullAiCompletion {
  /** Salinan calc.items dengan harga (+kuantitas) terisi — calc asli utuh. */
  items: Array<DirectRabResult['calc']['items'][number]>;
  /** Ringkasan completion (hitungan, total recomputed, kualitas, verdict). */
  summary: FullAiCompletionSummary;
}

/** Hasil terakhir yang dirender ke chat — target tombol "Push ke Spreadsheet". */
let lastDirectRab: DirectRabResult | null = null;
export function getLastDirectRab(): DirectRabResult | null {
  return lastDirectRab;
}
export function setLastDirectRab(r: DirectRabResult | null): void {
  lastDirectRab = r;
}

/** Cocokkan lokasi bebas user ke kunci indeks provinsi engine (bila ada). */
export function matchDirectRegion(location: string | null): { region: string; isDefault: boolean } {
  if (location) {
    // Jalur utama: resolusi provinsi dari basis data wilayah Indonesia —
    // menangkap nama kabupaten/kota ("Bogor", "Bandung", "Tangerang
    // Selatan"), bukan hanya nama provinsi seperti pencocokan lama.
    const province = resolveProvinceFromLocation(location);
    if (province) {
      const r = resolveRegionIndex(province);
      return { region: r.region, isDefault: r.isFallback };
    }
    // Cadangan: pencocokan substring lama terhadap kunci indeks engine.
    const loc = location.toLowerCase();
    for (const key of Object.keys(REGIONAL_PRICE_INDICES)) {
      if (key.toLowerCase() === loc || loc.includes(key.toLowerCase())) {
        return { region: key, isDefault: false };
      }
    }
  }
  return { region: 'DKI Jakarta', isDefault: true };
}

/** Item katalog bertipe yang template-nya benar-benar terdaftar di engine. */
export type RegisteredHouseTypeItem = HouseTypeCatalogItem & { area: number; templateId: string };

/** Kecocokan permintaan dengan template TERDAFTAR (tanpa menghitung RAB). */
export interface TypedTemplateMatch {
  item: RegisteredHouseTypeItem;
  template: NonNullable<ReturnType<typeof masterBuildingTemplateRegistry.getTemplateById>>;
  needs: ReturnType<typeof extractRabNeeds>;
  floors: number;
  /** true bila jumlah lantai BENAR-BENAR disebut pengguna (bukan default). */
  floorsMentioned: boolean;
  /**
   * true bila kecocokan berasal dari penyebutan TIPE eksplisit
   * ("type 70"); false bila hanya fallback luas R1 (luas telanjang tanpa
   * tipe) — pemanggil intent-first membedakan keduanya: fallback
   * bukanlah "template yang dipilih pengguna".
   */
  matchedByType: boolean;
  region: string;
  regionIsDefault: boolean;
  /**
   * Fallback luas (R1, 2026-10-27): null = kecocokan tipe eksak; terisi =
   * prompt hanya menyebut luas tanpa tipe katalog, sehingga dipakai basis
   * tipe TERDEKAT + luas sesuai permintaan (bukan luas tipe). Hanya untuk
   * prompt tanpa penyebutan lantai (1 lantai, semantik luas total jelas).
   */
  areaFallback: { requestedArea: number; basisArea: number } | null;
}

/**
 * Deteksi apakah teks cocok dengan template rumah TERDAFTAR yang benar-benar
 * ada di registry engine. Dipakai actionRegistry untuk kartu pilihan owner
 * (2026-10-22): permintaan bertipe TIDAK langsung di-generate dari teks —
 * pengguna memilih "Pakai Template" (generate) atau "Pakai AI Full"
 * (workspace desain) lewat klik eksplisit. Sejak R1 (2026-10-27): prompt
 * rumah yang hanya menyebut luas (tanpa tipe, tanpa lantai) juga cocok
 * lewat fallback tipe terdekat — kartu pilihan yang sama berlaku.
 */
export function findDirectTemplate(rawText: string): TypedTemplateMatch | null {
  const text = (rawText || '').trim();
  if (!text) return null;

  // Frasa lahan dibuang dulu (S7): "lahan 8x12" / "luas lahan 90 m2" tidak
  // boleh terbaca sebagai dimensi/luas BANGUNAN di needs jalur bertipe.
  // PERBAIKAN-D (2026-11-14): teks TERSTRIP yang sama dipakai juga untuk
  // findFromQuery (sebelumnya teks mentah) — "luas lahan 90 m2"
  // sebelumnya terbaca sebagai type 90 dan menutup jalur spek bebas.
  const strippedText = stripLandPhrases(text);
  const needs = extractRabNeeds(strippedText);
  if (needs.kind && needs.kind !== 'rumah') return null;

  const found = HouseTypeCatalog.findFromQuery(strippedText);
  // Kecocokan EKSAK hanya untuk penyebutan tipe eksplisit
  // (matchedByType): luas telanjang ("bangunan 45 m2") bukan penyebutan
  // tipe — ia mengalir ke fallback R1 di bawah, yang menggating lantai
  // (prompt berlantai tanpa tipe eksak → null → spek bebas, sesuai dok
  // R1: semantik luas per-lantai vs total tidak ditebak).
  if (found.item && found.matchedByType && found.item.templateId && found.item.area != null) {
    const template = masterBuildingTemplateRegistry.getTemplateById(found.item.templateId);
    if (template) {
      const floors = needs.floors ?? found.extractedFloors ?? found.item.defaultFloorCount;
      const { region, isDefault } = matchDirectRegion(needs.location);
      return {
        item: found.item as RegisteredHouseTypeItem,
        template,
        needs,
        floors,
        floorsMentioned: needs.floors != null || found.extractedFloors != null,
        matchedByType: true,
        region,
        regionIsDefault: isDefault,
        areaFallback: null,
      };
    }
  }

  // Fallback luas (R1, perintah user 2026-10-27): prompt rumah yang hanya
  // menyebut luas ("luas bangunan 75m2") tanpa tipe katalog — sebelumnya
  // findDirectTemplate mengembalikan null TOTAL sehingga tidak ada RAB
  // sama sekali (pengguna jatuh ke modal AI lama yang itemnya tanpa
  // volume/harga). Sekarang: pakai tipe 1-lantai TERDEKAT sebagai basis
  // template, tapi hitung dengan luas SESUAI PERMINTAAN (buildDirectRab
  // menurunkan denah dari default template menjaga proporsi). Batas yang
  // dijaga: hanya bila TIDAK ada penyebutan lantai (luas = total, 1
  // lantai, unambiguous). Prompt berlantai tanpa tipe eksak tetap null
  // (perilaku lama) agar tidak menebak semantik luas per-lantai vs total.
  // Seri jarak (mis. tepat di tengah dua tipe) → basis yang LEBIH BESAR
  // (mencakup luas permintaan).
  const floorsMentioned = needs.floors != null || found.extractedFloors != null;
  // INTENT-FIRST (2026-11-20): luas yang dicocokkan adalah luas BANGUNAN
  // eksplisit (needs.buildingArea — kemunculan "luas bangunan" terakhir,
  // frasa lahan sudah dibuang) — BUKAN angka telanjang pertama dari
  // findFromQuery, yang bisa berupa luas LAHAN ("luas 100m2 luas
  // bangunan 86m2" sebelumnya memakai 100 sebagai luas bangunan lalu
  // jatuh ke basis Type 70). Bila tidak ada luas bangunan eksplisit,
  // perilaku lama (angka telanjang) dipertahankan.
  const requestedAreaRaw = needs.buildingArea ?? found.extractedArea;
  if (!floorsMentioned && requestedAreaRaw != null && Number.isFinite(requestedAreaRaw)) {
    const requestedArea = requestedAreaRaw;
    const candidates = HouseTypeCatalog.getAll().filter(
      (h) => h.templateId && h.area != null && h.defaultFloorCount === 1,
    );
    candidates.sort((a, b) => {
      const da = Math.abs((a.area as number) - requestedArea);
      const db = Math.abs((b.area as number) - requestedArea);
      if (da !== db) return da - db;
      return (b.area as number) - (a.area as number);
    });
    const nearest = candidates[0];
    if (nearest && nearest.templateId) {
      const template = masterBuildingTemplateRegistry.getTemplateById(nearest.templateId);
      if (template) {
        const { region, isDefault } = matchDirectRegion(needs.location);
        // PERBAIKAN-D (2026-11-14): luas permintaan yang SAMA PERSIS
        // dengan basis tipe terdekat adalah kecocokan eksak, bukan
        // fallback — areaFallback null agar CREATE_RAB_DIRECT langsung
        // jadi tabel (perilaku 2026-10-27 untuk "luas bangunan 70m2",
        // yang sebelumnya tiba lewat cabang eksak di atas).
        const exactArea = nearest.area === requestedArea;
        return {
          item: nearest as RegisteredHouseTypeItem,
          template,
          needs,
          floors: 1,
          floorsMentioned: false,
          matchedByType: false,
          region,
          regionIsDefault: isDefault,
          areaFallback: exactArea ? null : { requestedArea, basisArea: nearest.area as number },
        };
      }
    }
  }
  return null;
}

/**
 * Bangun RAB langsung dari teks perintah. Mengembalikan null bila perintah
 * bukan rumah bertipe yang didukung template terdaftar — pemanggil wajib
 * jatuh ke alur ringkasan kebutuhan (bukan memaksa hasil).
 *
 * `needsOverride` dipakai jalur koreksi kartu pilihan (D1): kebutuhan hasil
 * gabungan koreksi pengguna menggantikan ekstraksi teks mentah untuk
 * lantai/kamar/dimensi/lokasi, sementara identitas template tetap dari teks.
 *
 * `budgetIdrOverride` (hardening 2026-11-26, Worker D §4D): anggaran
 * TERSTRUKTUR dari spek intent aktif (nilai Rp apa adanya — tanpa
 * pembulatan/konversi). Dipakai pemanggil yang membangun dari teks
 * SINTETIS (RAB_FULL_AI path-c): teks sintetis tidak memuat budget
 * (RabNeeds tidak punya field budget), jadi parse teks di sini selalu
 * menghasilkan null. Override MENANG atas parse teks — sumber
 * terstruktur adalah otoritas budget, teks hanya fallback bila
 * override null. TIDAK PERNAH memangkas lingkup; hanya pembanding
 * verdict di formatDirectRabMessage.
 */
export function buildDirectRab(rawText: string, needsOverride?: RabNeeds, budgetIdrOverride?: number | null): DirectRabResult | null {
  const text = (rawText || '').trim();
  if (!text) return null;

  // Anggaran pengguna (sprint 2026-11-26, Worker F — D-G1): kemunculan
  // TERAKHIR menang, selaras budgetCap universal (budgetFeasibility).
  const budgetMentions = parseBudgetMentions(text);
  const parsedBudgetIdr = budgetMentions.length > 0
    ? budgetMentions[budgetMentions.length - 1].amount
    : null;
  const budgetIdr = budgetIdrOverride ?? parsedBudgetIdr;

  const match = findDirectTemplate(text);
  if (!match) return null;
  const { item: foundItem, template } = match;
  const needs = needsOverride ?? match.needs;
  const found = { item: foundItem };
  const floors = needsOverride?.floors ?? match.floors;
  const region = needsOverride?.location
    ? matchDirectRegion(needsOverride.location).region
    : match.region;
  const regionIsDefault = needsOverride?.location
    ? matchDirectRegion(needsOverride.location).isDefault
    : match.regionIsDefault;

  // Semantik engine (terbukti dari template resmi HOUSE-T36-2FL): parameter
  // buildingArea adalah TOTAL luas seluruh lantai, dan quantity rules
  // digerakkan oleh luas total itu — bukan oleh floorCount. Konvensi katalog
  // EZRAB: angka tipe = luas per lantai, jadi total = tipe × jumlah lantai.
  // Jalur fallback luas (R1): total = luas permintaan (koreksi user lewat
  // needsOverride.buildingArea menang bila ada), dan denah diturunkan dari
  // default template menjaga proporsi — karena quantityRule rumah memakai
  // lebar×panjang, bukan buildingArea mentah.
  // INTENT-FIRST (2026-11-20): luas bangunan EKSPLISIT pengguna menang
  // atas luas tipe — "type 70, luas bangunan 120 m2" dihitung 120 m²
  // (total), bukan 70 m². Template dipakai sebagai basis parametrik
  // dengan denah diskalakan (pola yang sama dengan fallback R1) dan
  // adaptasinya ditandai terbuka (areaAdaptation + peringatan).
  const isFallback = match.areaFallback != null;
  const typeTotalArea = found.item.area * floors;
  const explicitArea = needs.buildingArea ?? null;
  const areaAdapted =
    !isFallback && explicitArea != null && explicitArea !== typeTotalArea;
  const totalArea = isFallback
    ? (needsOverride?.buildingArea ?? match.areaFallback!.requestedArea)
    : areaAdapted
      ? explicitArea
      : typeTotalArea;
  const areaAdaptation = areaAdapted
    ? { requestedArea: explicitArea as number, typeArea: typeTotalArea }
    : null;
  const parameters: Record<string, unknown> = {
    buildingArea: totalArea,
    floorCount: floors,
  };
  let scaledFootprint: string | null = null;
  if (isFallback || areaAdapted) {
    const wParam = template.parameters?.buildingWidth;
    const lParam = template.parameters?.buildingLength;
    const w0 = typeof wParam?.defaultValue === 'number' ? wParam.defaultValue : null;
    const l0 = typeof lParam?.defaultValue === 'number' ? lParam.defaultValue : null;
    if (w0 && l0 && w0 > 0 && l0 > 0) {
      const scale = Math.sqrt(totalArea / (w0 * l0));
      const clamp = (v: number, p: { min?: number; max?: number } | undefined) => {
        if (typeof p?.min === 'number') v = Math.max(v, p.min);
        if (typeof p?.max === 'number') v = Math.min(v, p.max);
        return Math.round(v * 100) / 100;
      };
      const w = clamp(w0 * scale, wParam);
      const l = clamp(l0 * scale, lParam);
      parameters.buildingWidth = w;
      parameters.buildingLength = l;
      scaledFootprint = `${w}×${l} m (default template ${w0}×${l0} m)`;
    }
  }
  if (needs.bedrooms) parameters.bedroomCount = needs.bedrooms;
  if (needs.bathrooms) parameters.bathroomCount = needs.bathrooms;
  if (needs.landLength && needs.landWidth) {
    parameters.buildingLength = Math.max(needs.landLength, needs.landWidth);
    parameters.buildingWidth = Math.min(needs.landLength, needs.landWidth);
  }

  let calc: DirectRabResult['calc'];
  try {
    calc = parametricVolumeEngine.calculate({ templateId: template.id, parameters, region });
  } catch {
    return null;
  }
  if (!calc.items || calc.items.length === 0) return null;

  // GATE 5 (5E) — gerbang relevansi ditegakkan pada jalur parametrik
  // (penutup ARS-05): item jalan/perkerasan pada RAB rumah tanpa
  // permintaan eksplisit atas cakupan jalan dikeluarkan, dan total
  // dihitung ulang dari item yang tersisa memakai rumus engine yang
  // sama (lihat directRabGate.ts). Pada data rumah nyata saat ini 0
  // item yang gugur (matriks kalibrasi 5E: 0/200) — total tidak
  // berubah; gerbang adalah penegakan + jaring pengaman.
  const gated = applyRelevanceGateToDirectCalc(calc, text);
  calc = gated.calc;

  const warnings: string[] = [];
  if (floors > 1) {
    warnings.push(
      `Dihitung sebagai luas total ${totalArea} m² (${found.item.area} m² per lantai × ${floors} lantai) mengikuti konvensi template EZRAB; ` +
        'item struktur lantai atas & tangga mengikuti asumsi template — periksa kembali di spreadsheet.'
    );
  }
  for (const gw of calc.generationResult.warnings.slice(0, 4)) {
    if (!warnings.includes(gw)) warnings.push(gw);
  }
  if (regionIsDefault && needs.location) {
    warnings.push(
      `Indeks harga regional untuk "${needs.location}" tidak ditemukan — memakai indeks DKI Jakarta.`
    );
  }
  if (isFallback) {
    warnings.push(
      `Luas ${totalArea} m² tidak sama persis dengan tipe katalog — dipakai basis template Tipe ${match.areaFallback!.basisArea} (terdekat)${scaledFootprint ? ` dengan denah diskalakan ${scaledFootprint} menjaga proporsi template` : ''}; periksa kembali di spreadsheet.`
    );
  }
  if (areaAdapted) {
    warnings.push(
      `Luas bangunan ${totalArea} m² dari permintaan dipakai sebagai luas total (bukan ${typeTotalArea} m² dari Type ${found.item.area} × ${floors} lantai) — template dipakai sebagai basis parametrik${scaledFootprint ? ` dengan denah diskalakan ${scaledFootprint} menjaga proporsi template` : ''}; periksa kembali di spreadsheet.`
    );
  }
  for (const n of gated.notes) warnings.push(n);

  // Provenance nilai (intent-first): mana dari Anda, mana dari template.
  const provenance: DirectRabResult['provenance'] = [
    { label: 'Luas bangunan', value: `${totalArea} m² (total)`, source: 'user' },
    {
      label: 'Basis template',
      value: displayTemplateBasisName(template.name, floors),
      source: isFallback || areaAdapted ? 'template' : 'user',
    },
    {
      label: 'Jumlah lantai',
      value: `${floors} lantai`,
      source: match.floorsMentioned || needsOverride?.floors != null ? 'user' : 'assumption',
    },
  ];
  if (needs.bedrooms) provenance.push({ label: 'Kamar tidur', value: `${needs.bedrooms}`, source: 'user' });
  else if (typeof template.parameters?.bedroomCount?.defaultValue === 'number') provenance.push({ label: 'Kamar tidur', value: `${template.parameters.bedroomCount.defaultValue}`, source: 'template' });
  if (needs.bathrooms) provenance.push({ label: 'Kamar mandi', value: `${needs.bathrooms}`, source: 'user' });
  else if (typeof template.parameters?.bathroomCount?.defaultValue === 'number') provenance.push({ label: 'Kamar mandi', value: `${template.parameters.bathroomCount.defaultValue}`, source: 'template' });
  if (needs.landLength && needs.landWidth) provenance.push({ label: 'Dimensi bangunan', value: `${needs.landLength} × ${needs.landWidth} m`, source: 'user' });
  provenance.push({
    label: 'Lokasi / indeks harga',
    value: needs.location ? `${needs.location} → ${region}` : `${region} (default)`,
    source: needs.location ? 'user' : 'assumption',
  });

  const result: DirectRabResult = {
    houseType: found.item.area,
    floors,
    totalArea,
    budgetIdr,
    areaFallback: match.areaFallback,
    areaAdaptation,
    provenance,
    catalogLabel: found.item.label,
    templateName: template.name,
    region,
    regionIsDefault,
    calc,
    generation: calc.generationResult,
    warnings,
    sourceKind: 'template',
    displayLabel: isFallback
      ? `Rumah Type ${match.areaFallback!.basisArea} — dihitung ${totalArea} m²`
      : areaAdapted
        ? `Rumah Type ${found.item.area} — dihitung ${totalArea} m²`
        : `Rumah Type ${found.item.area}`,
    assumptions: [],
  };
  setLastDirectRab(result);
  return result;
}

function prettyCategory(cat: string): string {
  return cat.replace(/_/g, ' ');
}

/**
 * Nama basis template untuk TAMPILAN (header hasil & kartu pilihan).
 *
 * Nama registri adalah identitas entri template dan boleh memuat klaim
 * lantai bawaannya — mis. "Rumah Tinggal Menengah Tipe 45 (1 Lantai)"
 * adalah nama entri SATU lantai yang dipakai parametrik untuk hasil
 * berlantai berapa pun. Menampilkannya mentah pada hasil 2 lantai
 * menyajikan "(1 Lantai)" sebagai klaim yang bertentangan dengan lantai
 * efektif (temuan QA browser Fase 9). Karena itu, khusus tampilan: segmen
 * klaim "(N Lantai)" dibuang BILA N berbeda dari lantai efektif; lantai
 * efektif selalu dinyatakan terpisah dan eksplisit di header/kartu.
 * Bila N sama dengan lantai efektif, nama tampil persis seperti registri.
 * Nama/ID registri dan seluruh perhitungan TIDAK berubah.
 */
export function displayTemplateBasisName(templateName: string, floors: number): string {
  return templateName
    .replace(/\s*\((\d+)\s*[Ll]antai\)/g, (seg, n: string) => (Number(n) === floors ? seg : ''))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function fmtVol(v: number): string {
  return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

/**
 * Komponen O&P/pajak untuk baris total RAB: hanya komponen BUKAN NOL
 * yang ditampilkan — "overhead 0%, profit 0%, pajak 0%" disembunyikan
 * (benar tapi canggung; bila semua nol, kurungnya hilang sama sekali
 * dan baris menjadi "**Total RAB: Rp…**").
 */
function formatTotalComponents(g: {
  overheadPercentage?: number;
  profitPercentage?: number;
  taxPercentage?: number;
}): string {
  const parts: string[] = [];
  if (g.overheadPercentage) parts.push(`overhead ${g.overheadPercentage}%`);
  if (g.profitPercentage) parts.push(`profit ${g.profitPercentage}%`);
  if (g.taxPercentage) parts.push(`pajak ${g.taxPercentage}%`);
  return parts.length > 0 ? ` (termasuk ${parts.join(', ')})` : '';
}

/**
 * Blok completion "Lengkapi dengan Full AI" untuk pesan RAB langsung:
 * ringkasan asumsi + verdict atas total RECOMPUTED + caveat + kualitas
 * (+ downgrade bila terjadi) + spek per item terisi. Hanya dipanggil
 * bila `fullAiCompletion` terisi — pesan default tidak berubah.
 */
function formatDirectFullAiCompletionLines(s: FullAiCompletionSummary): string[] {
  const lines: string[] = [];
  lines.push('**Lengkapi dengan Full AI — Estimasi Sementara (asumsi AI)**');
  lines.push(
    `• Harga diisi AI untuk ${s.filledPriceCount} dari ${s.totalItems} item` +
      (s.filledQuantityCount > 0 ? `; kuantitas diisi AI untuk ${s.filledQuantityCount} item` : '') +
      ` (kualitas ${s.qualityUsed}${s.qualityDefaulted ? ' — asumsi, karena kualitas tidak disebutkan' : ''}). ` +
      'Baris bertanda (est. AI) adalah estimasi AI, bukan harga AHSP resmi.',
  );
  lines.push(
    `• Total di atas mencakup ${formatRupiah(s.assumedTotal)} dari ${s.filledPriceCount} item estimasi AI (asumsi) — bukan total final terverifikasi.`,
  );
  lines.push(formatBudgetFeasibilityLine(s.feasibility));
  lines.push(
    '• Total di atas adalah Estimasi Sementara (asumsi AI) — verdict kelayakan berlaku atas total asumsi ini, bukan atas harga resmi.',
  );
  if (s.qualityDowngradedFrom && s.totalAtRequestedTier != null && s.budgetCap != null) {
    const over = s.totalAtRequestedTier - s.budgetCap;
    lines.push(
      `• Agar muat di anggaran ${formatRupiah(s.budgetCap)}, kualitas diturunkan dari ${s.qualityDowngradedFrom} ke ${s.qualityUsed} — total estimasi menjadi ${formatRupiah(s.estimatedTotal)}. Total pada kualitas ${s.qualityDowngradedFrom} adalah ${formatRupiah(s.totalAtRequestedTier)} (melebihi anggaran ${formatRupiah(Math.abs(over))}).`,
    );
  }
  if (s.unfilled.length > 0) {
    const shown = s.unfilled.slice(0, 5).join('; ');
    lines.push(
      `• ${s.unfilled.length} item belum terisi harga dan tidak masuk total: ${shown}${s.unfilled.length > 5 ? `; …dan ${s.unfilled.length - 5} item lainnya` : ''}.`,
    );
  }
  for (const w of s.warnings.slice(0, 3)) lines.push(`• ⚠ ${w}`);
  if (s.filledDetails.length > 0) {
    lines.push('**Spek material (asumsi AI) per item terisi:**');
    for (const d of s.filledDetails) {
      lines.push(`• ${d.description} — ${d.spec} (dasar: ${d.basis})`);
    }
  }
  return lines;
}

/**
 * Render hasil sebagai pesan chat: ringkasan + tabel markdown per kelompok
 * WBS + total + status kejujuran harga + peringatan. Harga fabricated
 * ditandai " (est.)".
 */
export function formatDirectRabMessage(r: DirectRabResult): string {
  const g = r.generation;
  const lines: string[] = [];
  if (r.sourceKind === 'spec') {
    lines.push(
      `Siap — ini RAB awal **${r.displayLabel} (${r.floors} lantai, luas total ±${r.totalArea} m²)** yang saya hitung langsung dari mesin parametrik EZRAB (basis template parametrik ${displayTemplateBasisName(r.templateName, r.floors)}), AHSP 2026, indeks harga ${r.region}:`
    );
  } else {
    lines.push(
      `Siap — ini RAB awal **Rumah Type ${r.houseType} (${r.floors} lantai, luas total ±${r.totalArea} m²)** yang saya hitung langsung dari template parametrik EZRAB (${displayTemplateBasisName(r.templateName, r.floors)}), AHSP 2026, indeks harga ${r.region}:`
    );
  }
  lines.push('');

  // Asal nilai (intent-first): bedakan nilai dari Anda, dari template,
  // dan asumsi — tanpa blok ini pembaca tidak bisa tahu angka mana yang
  // berasal dari permintaan dan mana yang dari template.
  if (r.provenance.length > 0) {
    lines.push('**Asal nilai** — dari Anda vs template/asumsi:');
    for (const pv of r.provenance) {
      const src = pv.source === 'user' ? 'dari Anda' : pv.source === 'template' ? 'template' : 'asumsi';
      lines.push(`• ${pv.label}: ${pv.value} — ${src}`);
    }
    lines.push('');
  }

  // Lengkapi dengan Full AI (§5): tabel dirender dari salinan terisi
  // bila ada (calc.items ASLI tidak diubah — lihat fullAiCompletion).
  const completion = r.fullAiCompletion;
  const tableItems = completion ? completion.items : r.calc.items;
  // Baris terisi AI ditandai '(est. AI)': bandingkan dengan calc asli
  // (urutan sama) — item yang aslinya tak berharga kini berharga.
  const aiFilledRows = new Set<object>();
  if (completion) {
    completion.items.forEach((it, i) => {
      const orig = r.calc.items[i];
      const origPriced =
        orig != null &&
        typeof orig.unitPrice === 'number' &&
        Number.isFinite(orig.unitPrice) &&
        orig.unitPrice > 0;
      const nowPriced =
        typeof it.unitPrice === 'number' && Number.isFinite(it.unitPrice) && it.unitPrice > 0;
      if (!origPriced && nowPriced) aiFilledRows.add(it);
    });
  }

  // Kelompokkan dari calc.items (membawa wbsCode lengkap); urutan kategori
  // mengikuti kemunculan pertama, sama seperti categoryGroups engine.
  const groups = new Map<string, typeof tableItems>();
  for (const it of tableItems) {
    const key = it.category ?? 'LAINNYA';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  // Harga engine bisa null (item tak terpetakan — remediasi integritas
  // engine): item seperti itu tampil "Harga belum tersedia", TIDAK PERNAH
  // Rp0/angka fallback, dan tidak masuk subtotal/total. Pemeriksaan
  // typeof di sini membuat formatter aman untuk unitPrice/totalPrice
  // berbentuk number maupun null.
  const hasPrice = (v: number | null | undefined): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0;
  const lineTotal = (it: (typeof r.calc.items)[number]): number =>
    hasPrice(it.unitPrice) && typeof it.totalPrice === 'number' ? it.totalPrice : 0;

  let no = 0;
  let unpricedRows = 0;
  for (const [categoryName, groupItems] of groups) {
    const subtotal = groupItems.reduce((s, it) => s + lineTotal(it), 0);
    const groupUnpriced = groupItems.filter((it) => !hasPrice(it.unitPrice)).length;
    lines.push(`**${prettyCategory(categoryName)}**`);
    lines.push('| No | Uraian | Volume | Satuan | Harga Satuan | Jumlah |');
    lines.push('|---:|---|---:|---|---:|---:|');
    for (const it of groupItems) {
      no++;
      const wi = g.workItems.find(
        (w) => w.name === it.name && w.wbsCode === it.wbsCode
      );
      const fabricated = Boolean(wi?.isPriceFabricated);
      const priced = hasPrice(it.unitPrice);
      if (!priced) unpricedRows++;
      const price = priced
        ? formatRupiah(it.unitPrice) + (fabricated ? ' (est.)' : '') + (aiFilledRows.has(it) ? ' (est. AI)' : '')
        : 'Harga belum tersedia';
      const total = priced && typeof it.totalPrice === 'number' ? formatRupiah(it.totalPrice) : '—';
      lines.push(
        `| ${no} | ${it.name} | ${fmtVol(it.volume)} | ${it.unit} | ${price} | ${total} |`
      );
    }
    lines.push(
      `Subtotal ${prettyCategory(categoryName)}: **${formatRupiah(subtotal)}**` +
        (groupUnpriced > 0 ? ` (parsial — ${groupUnpriced} item belum berharga)` : '')
    );
    lines.push('');
  }

  const fabricatedCount = g.workItems.filter((w) => w.isPriceFabricated).length;
  const unpricedCount = unpricedRows;
  const reviewCount = g.workItems.filter((w) => w.requiresReview).length;
  const totalItems = r.calc.items.length;
  const pricedRows = totalItems - unpricedRows;
  // Total bersifat PARSIAL bila ada item tak berharga atau engine
  // menyatakan INCOMPLETE — jangan pernah tampil sebagai total final.
  const isPartial = unpricedRows > 0 || (g.totalStatus ?? 'INDICATIVE') === 'INCOMPLETE';

  if (completion) {
    // Total RECOMPUTED dari ringkasan (bukan engine g.totalDirectCost /
    // g.totalRabCost yang basi sesudah harga diisi pasca-hoc). Tangga
    // O&P/pajak engine TIDAK dihitung ulang — total completion adalah
    // biaya langsung (Σ qty × harga atas item terisi).
    lines.push(
      `**Total biaya langsung — Estimasi Sementara (asumsi AI): ${formatRupiah(completion.summary.estimatedTotal)}**`
    );
    lines.push('');
    for (const l of formatDirectFullAiCompletionLines(completion.summary)) lines.push(l);
  } else if (isPartial) {
    lines.push(
      `**Total biaya langsung (PARSIAL — ${pricedRows} dari ${totalItems} item berharga): ${formatRupiah(g.totalDirectCost)}**`
    );
    // Baris kosong di antara dua total: tanpa ini renderer chat menggabung
    // keduanya menjadi satu paragraf dan teks "<br/>" bocor sebagai literal
    // (cacat D2 QA browser).
    lines.push('');
    lines.push(
      `**Total RAB PARSIAL — BELUM FINAL${formatTotalComponents(g)}: ${formatRupiah(g.totalRabCost)}**`
    );
  } else {
    lines.push(`**Total biaya langsung: ${formatRupiah(g.totalDirectCost)}**`);
    lines.push('');
    lines.push(
      `**Total RAB${formatTotalComponents(g)}: ${formatRupiah(g.totalRabCost)}**`
    );
  }
  // Verdict anggaran (sprint 2026-11-26, Worker F — B-gap-2 / D-G1):
  // hanya bila budget disebut; tanpa budget pesan byte-identical.
  // Pembanding adalah biaya langsung (g.totalDirectCost), selaras jalur
  // universal yang membandingkan estimatedTotal (biaya langsung).
  // Bila completion Full AI terisi, blok completion SUDAH merender
  // verdict atas total recomputed-nya — jangan dobel.
  if (!completion && r.budgetIdr != null) {
    lines.push(
      formatBudgetFeasibilityLine(
        assessBudgetFeasibility({
          totalPriced: g.totalDirectCost,
          unpricedCount,
          budgetCap: r.budgetIdr,
        }),
      ),
    );
  }
  lines.push('');
  lines.push(
    `Status total: **${g.totalStatus ?? 'INDICATIVE'}** — ${r.calc.items.length} item pekerjaan dari template terverifikasi EZRAB.`
  );
  if (fabricatedCount > 0) {
    lines.push(
      `• ${fabricatedCount} item bertanda (est.) = harga benchmark/fallback engine, BUKAN harga AHSP resmi — wajib diverifikasi.`
    );
  }
  if (unpricedCount > 0) {
    lines.push(`• ${unpricedCount} item belum ada harga dan tidak dihitung ke total — item tampil "Harga belum tersedia"; total di atas bersifat PARSIAL, bukan angka final.`);
  }
  if (reviewCount > 0) {
    lines.push(`• ${reviewCount} item perlu review (asumsi template) sebelum dipakai untuk kontrak.`);
  }
  for (const w of r.warnings) lines.push(`• ⚠ ${w}`);
  if (r.assumptions.length > 0) {
    lines.push('');
    lines.push('**Asumsi yang dipakai** — sebutkan bila ada yang berbeda:');
    for (const a of r.assumptions) lines.push(`• ${a}`);
  }
  lines.push('');
  lines.push(
    'Ini estimasi awal parametrik — bukan pengganti DED. Klik **Push ke Spreadsheet RAB** untuk memasukkan seluruh item ini ke RAB proyek aktif Anda, lalu sesuaikan di sana.'
  );
  return lines.join('\n');
}
