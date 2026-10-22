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
 *   estimasi, bukan harga resmi. Item tanpa harga tampil "belum ada harga"
 *   (tidak pernah diisi Rp0 karangan di luar data engine).
 * - Total mengikuti status engine (VERIFIED / INDICATIVE / INCOMPLETE).
 */

import { extractRabNeeds } from './rabNeeds';
import { HouseTypeCatalog } from '../../data/houseTypeCatalog';
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
function matchRegion(location: string | null): { region: string; isDefault: boolean } {
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

/**
 * Bangun RAB langsung dari teks perintah. Mengembalikan null bila perintah
 * bukan rumah bertipe yang didukung template terdaftar — pemanggil wajib
 * jatuh ke alur ringkasan kebutuhan (bukan memaksa hasil).
 */
export function buildDirectRab(rawText: string): DirectRabResult | null {
  const text = (rawText || '').trim();
  if (!text) return null;

  const needs = extractRabNeeds(text);
  if (needs.kind && needs.kind !== 'rumah') return null;

  const found = HouseTypeCatalog.findFromQuery(text);
  if (!found.item || !found.item.templateId || found.item.area == null) return null;

  const template = masterBuildingTemplateRegistry.getTemplateById(found.item.templateId);
  if (!template) return null;

  const floors = needs.floors ?? found.extractedFloors ?? found.item.defaultFloorCount;
  const { region, isDefault: regionIsDefault } = matchRegion(needs.location);

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
  };
  setLastDirectRab(result);
  return result;
}

function prettyCategory(cat: string): string {
  return cat.replace(/_/g, ' ');
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
  lines.push(
    `Siap — ini RAB awal **Rumah Type ${r.houseType} (${r.floors} lantai, luas total ±${r.totalArea} m²)** yang saya hitung langsung dari template parametrik EZRAB (${r.templateName}), AHSP 2026, indeks harga ${r.region}:`
  );
  lines.push('');

  // Kelompokkan dari calc.items (membawa wbsCode lengkap); urutan kategori
  // mengikuti kemunculan pertama, sama seperti categoryGroups engine.
  const groups = new Map<string, typeof r.calc.items>();
  for (const it of r.calc.items) {
    const key = it.category ?? 'LAINNYA';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  let no = 0;
  for (const [categoryName, groupItems] of groups) {
    const subtotal = groupItems.reduce((s, it) => s + (it.totalPrice || 0), 0);
    lines.push(`**${prettyCategory(categoryName)}**`);
    lines.push('| No | Uraian | Volume | Satuan | Harga Satuan | Jumlah |');
    lines.push('|---:|---|---:|---|---:|---:|');
    for (const it of groupItems) {
      no++;
      const wi = g.workItems.find(
        (w) => w.name === it.name && w.wbsCode === it.wbsCode
      );
      const fabricated = Boolean(wi?.isPriceFabricated);
      const price =
        it.unitPrice > 0 ? formatRupiah(it.unitPrice) + (fabricated ? ' (est.)' : '') : 'belum ada harga';
      const total = it.unitPrice > 0 ? formatRupiah(it.totalPrice) : '—';
      lines.push(
        `| ${no} | ${it.name} | ${fmtVol(it.volume)} | ${it.unit} | ${price} | ${total} |`
      );
    }
    lines.push(`Subtotal ${prettyCategory(categoryName)}: **${formatRupiah(subtotal)}**`);
    lines.push('');
  }

  const fabricatedCount = g.workItems.filter((w) => w.isPriceFabricated).length;
  const unpricedCount = g.workItems.filter((w) => !(w.unitPrice > 0)).length;
  const reviewCount = g.workItems.filter((w) => w.requiresReview).length;

  lines.push(`**Total biaya langsung: ${formatRupiah(g.totalDirectCost)}**`);
  lines.push(
    `**Total RAB (termasuk overhead ${g.overheadPercentage}%, profit ${g.profitPercentage}%, pajak ${g.taxPercentage}%): ${formatRupiah(g.totalRabCost)}**`
  );
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
    lines.push(`• ${unpricedCount} item belum ada harga dan tidak dihitung ke total.`);
  }
  if (reviewCount > 0) {
    lines.push(`• ${reviewCount} item perlu review (asumsi template) sebelum dipakai untuk kontrak.`);
  }
  for (const w of r.warnings) lines.push(`• ⚠ ${w}`);
  lines.push('');
  lines.push(
    'Ini estimasi awal parametrik — bukan pengganti DED. Klik **Push ke Spreadsheet RAB** untuk memasukkan seluruh item ini ke RAB proyek aktif Anda, lalu sesuaikan di sana.'
  );
  return lines.join('\n');
}
