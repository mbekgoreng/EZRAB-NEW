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

import { extractRabNeeds, stripLandPhrases } from './rabNeeds';
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
import {
  resolveProvinceFromLocation,
  resolveRegionIndex,
} from '../../data/indonesiaRegions';

export interface DirectRabResult {
  houseType: number;
  floors: number;
  /** Total luas seluruh lantai (tipe × lantai) — semantik engine. */
  totalArea: number;
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
  region: string;
  regionIsDefault: boolean;
}

/**
 * Deteksi apakah teks cocok dengan template rumah TERDAFTAR yang benar-benar
 * ada di registry engine. Dipakai actionRegistry untuk kartu pilihan owner
 * (2026-10-22): permintaan bertipe TIDAK langsung di-generate dari teks —
 * pengguna memilih "Pakai Template" (generate) atau "Pakai AI Full"
 * (workspace desain) lewat klik eksplisit.
 */
export function findDirectTemplate(rawText: string): TypedTemplateMatch | null {
  const text = (rawText || '').trim();
  if (!text) return null;

  // Frasa lahan dibuang dulu (S7): "lahan 8x12" / "luas lahan 90 m2" tidak
  // boleh terbaca sebagai dimensi/luas BANGUNAN di needs jalur bertipe.
  const needs = extractRabNeeds(stripLandPhrases(text));
  if (needs.kind && needs.kind !== 'rumah') return null;

  const found = HouseTypeCatalog.findFromQuery(text);
  if (!found.item || !found.item.templateId || found.item.area == null) return null;

  const template = masterBuildingTemplateRegistry.getTemplateById(found.item.templateId);
  if (!template) return null;

  const floors = needs.floors ?? found.extractedFloors ?? found.item.defaultFloorCount;
  const { region, isDefault } = matchDirectRegion(needs.location);
  return {
    item: found.item as RegisteredHouseTypeItem,
    template,
    needs,
    floors,
    floorsMentioned: needs.floors != null || found.extractedFloors != null,
    region,
    regionIsDefault: isDefault,
  };
}

/**
 * Bangun RAB langsung dari teks perintah. Mengembalikan null bila perintah
 * bukan rumah bertipe yang didukung template terdaftar — pemanggil wajib
 * jatuh ke alur ringkasan kebutuhan (bukan memaksa hasil).
 *
 * `needsOverride` dipakai jalur koreksi kartu pilihan (D1): kebutuhan hasil
 * gabungan koreksi pengguna menggantikan ekstraksi teks mentah untuk
 * lantai/kamar/dimensi/lokasi, sementara identitas template tetap dari teks.
 */
export function buildDirectRab(rawText: string, needsOverride?: RabNeeds): DirectRabResult | null {
  const text = (rawText || '').trim();
  if (!text) return null;

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
  const totalArea = found.item.area * floors;
  const parameters: Record<string, unknown> = {
    buildingArea: totalArea,
    floorCount: floors,
  };
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

  const result: DirectRabResult = {
    houseType: found.item.area,
    floors,
    totalArea,
    catalogLabel: found.item.label,
    templateName: template.name,
    region,
    regionIsDefault,
    calc,
    generation: calc.generationResult,
    warnings,
    sourceKind: 'template',
    displayLabel: `Rumah Type ${found.item.area}`,
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

  // Kelompokkan dari calc.items (membawa wbsCode lengkap); urutan kategori
  // mengikuti kemunculan pertama, sama seperti categoryGroups engine.
  const groups = new Map<string, typeof r.calc.items>();
  for (const it of r.calc.items) {
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
        ? formatRupiah(it.unitPrice) + (fabricated ? ' (est.)' : '')
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

  if (isPartial) {
    lines.push(
      `**Total biaya langsung (PARSIAL — ${pricedRows} dari ${totalItems} item berharga): ${formatRupiah(g.totalDirectCost)}**`
    );
    // Baris kosong di antara dua total: tanpa ini renderer chat menggabung
    // keduanya menjadi satu paragraf dan teks "<br/>" bocor sebagai literal
    // (cacat D2 QA browser).
    lines.push('');
    lines.push(
      `**Total RAB PARSIAL — BELUM FINAL (termasuk overhead ${g.overheadPercentage}%, profit ${g.profitPercentage}%, pajak ${g.taxPercentage}%): ${formatRupiah(g.totalRabCost)}**`
    );
  } else {
    lines.push(`**Total biaya langsung: ${formatRupiah(g.totalDirectCost)}**`);
    lines.push('');
    lines.push(
      `**Total RAB (termasuk overhead ${g.overheadPercentage}%, profit ${g.profitPercentage}%, pajak ${g.taxPercentage}%): ${formatRupiah(g.totalRabCost)}**`
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
