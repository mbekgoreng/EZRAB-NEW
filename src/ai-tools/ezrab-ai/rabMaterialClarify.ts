/**
 * rabMaterialClarify.ts — GERBANG KLARIFIKASI MATERIAL sebelum draft RAB
 * (perintah owner 2026-11-10).
 *
 * Kasus pemicu: pemilik meminta "buatkan rab pemasangan rangka atap dengan
 * lebar 5 x 9" dan Chat AI LANGSUNG menyusun draft dari template "Sistem
 * Atap Metal Standing Seam + Insulasi (Bangunan Komersial)" — padahal bahan
 * rangka & penutup (baja ringan vs kayu vs genteng vs spandek …) mengubah
 * susunan item dan harga secara material. Keinginan owner persis: "ketika
 * bertanya seperti ini ezrab ai menanyakan kembali secara detail material
 * apa bahan apa".
 *
 * Modul ini menyediakan PETA klarifikasi per cakupan pekerjaan universal
 * (universalRab SCOPE_GROUPS), mengikuti pola klarifikasi subtipe yang
 * sudah ada (rabSubtypes.ts): pilihan diturunkan dari katalog template
 * NYATA — setiap opsi memetakan ke `templateId` yang benar-benar ada di
 * RabTemplateService — plus daftar bahan yang DIKENAL tetapi BELUM punya
 * template (baja ringan, spandek, foot plat, …). Bahan tanpa template
 * TIDAK PERNAH diam-diam diganti template lain: registry menjawab jujur
 * dan menawarkan jalur Full AI (komposisi LLM dari data AHSP dengan bahan
 * persis yang diminta), persis pola subtipe makadam di rabSubtypes.ts.
 *
 * Kalibrasi (keputusan desain, konsisten perintah owner):
 *  - Bahan SUDAH disebut & punya template → gerbang tidak bertanya;
 *    penyusunan berjalan seperti biasa.
 *  - Bahan disebut tetapi belum ada template → tidak ditanya ulang;
 *    dijawab jujur + jalur Full AI.
 *  - Bahan belum disebut → SATU putaran pertanyaan ringkas (tombol
 *    pilihan + jalur teks bebas). Pengguna selalu bisa melewati dengan
 *    afirmasi ("itu aja") — draft lalu memakai ASUMSI YANG DINYATAKAN
 *    TERBUKA di dalam draft (lihat actionRegistry.materialQuestionResult).
 *  - Kategori tanpa data variasi yang cukup di katalog TIDAK dimasukkan
 *    ke peta ini — perilakunya tetap seperti sekarang (tidak ada pilihan
 *    karangan). Cakupan saat ini: `atap` dan `pondasi`. Jalan/drainase/
 *    jembatan memakai klarifikasi subtipe (rabSubtypes.ts), bukan peta ini.
 */
import type { UniversalSpec } from './universalRab';

function fmtNum(v: number): string {
  return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

/** Satu pilihan bahan/sistem yang NYATA di katalog (templateId terverifikasi ada). */
export interface RabMaterialOption {
  id: string;
  /** Label tombol — menyebut bahan rangka & penutup apa adanya. */
  label: string;
  /** Template katalog yang akan dipakai bila opsi ini dipilih. */
  templateId: string;
  /** Deteksi penyebutan bahan ini di teks bebas pengguna. */
  detect: RegExp;
}

/** Bahan yang dikenal pengguna tetapi BELUM punya template di katalog. */
export interface RabUntemplatedMaterial {
  id: string;
  label: string;
  detect: RegExp;
}

export interface RabMaterialGroup {
  /** Id cakupan pada SCOPE_GROUPS universalRab ('atap' | 'pondasi'). */
  scopeId: string;
  /** Nama pekerjaan untuk kalimat pertanyaan. */
  workLabel: string;
  /** Pertanyaan utama gerbang. */
  question: string;
  options: RabMaterialOption[];
  untemplated: RabUntemplatedMaterial[];
}

export const RAB_MATERIAL_GROUPS: RabMaterialGroup[] = [
  {
    scopeId: 'atap',
    workLabel: 'atap',
    question: 'Bahan rangka & penutup atapnya apa?',
    // Opsi = template ATAP_WATERPROOFING nyata + kuda-kuda kayu dari
    // STRUKTUR_BETON_BAJA (template rangka atap murni). Urutan deteksi:
    // genteng sebelum kayu ("genteng + rangka kayu" adalah satu sistem
    // ROOF-TILE-PREMIUM); klasifikasi memeriksa daftar `untemplated`
    // lebih dulu ("genteng metal" TIDAK boleh tertangkap "genteng").
    options: [
      {
        id: 'standing-seam',
        label: 'Metal standing seam + insulasi',
        templateId: 'ROOF-METAL-STANDING',
        detect: /standing seam/,
      },
      {
        id: 'genteng-kayu',
        label: 'Genteng keramik/tanah liat + rangka kayu',
        templateId: 'ROOF-TILE-PREMIUM',
        detect: /genteng/,
      },
      {
        id: 'kuda-kuda-kayu',
        label: 'Kuda-kuda kayu (rangka saja)',
        templateId: 'STR-TIMBER-ROOF',
        detect: /kuda[\s-]?kuda|\bkayu\b/,
      },
      {
        id: 'green-roof',
        label: 'Atap hijau (green roof)',
        templateId: 'ROOF-GREEN-GARDEN',
        detect: /green roof|atap hijau|roof garden/,
      },
      {
        id: 'skylight',
        label: 'Skylight / atap kaca',
        templateId: 'ROOF-SKYLIGHT-ATRIUM',
        detect: /skylight|atap kaca|polycarbonate|polikarbonat/,
      },
      {
        id: 'waterproofing-dak',
        label: 'Waterproofing dak (membran/coating)',
        templateId: 'ROOF-WP-DECK-AUDIT',
        detect: /waterproofing|membran/,
      },
    ],
    // Bahan atap yang paling sering diminta pengguna Indonesia tetapi
    // katalog template EZRAB belum memilikinya (terverifikasi: tidak ada
    // template baja ringan/spandek di 180 template resmi).
    untemplated: [
      {
        id: 'baja-ringan',
        label: 'baja ringan / spandek / galvalum',
        detect: /baja ringan|spandek|spandeck|galvalum|zincalume/,
      },
      {
        id: 'genteng-modern',
        label: 'genteng metal / genteng beton',
        detect: /genteng metal|genteng beton/,
      },
      {
        id: 'penutup-lain',
        label: 'asbes / seng / multiroof / alderon',
        detect: /asbes|multiroof|multi roof|alderon|onduvilla|\bseng\b/,
      },
    ],
  },
  {
    scopeId: 'pondasi',
    workLabel: 'pondasi',
    question: 'Jenis pondasinya apa?',
    // Opsi = seluruh template PONDASI_GEOTEKNIK nyata. Jenis pondasi
    // adalah spesifikasi KRITIS (universalRab menandai pondasi generik
    // sebagai celah kritis yang memblokir transfer) — menanyakannya di
    // muka konsisten dengan pagar itu.
    options: [
      {
        id: 'bore-pile',
        label: 'Bore pile (bored pile)',
        templateId: 'FND-BORED-PILE',
        detect: /\bbore\b|bored/,
      },
      {
        id: 'tiang-pancang',
        label: 'Tiang pancang beton pracetak',
        templateId: 'FND-DRIVEN-PILE',
        detect: /pancang|driven pile/,
      },
      {
        id: 'mini-pile',
        label: 'Mini pile (rumah tinggal/ruko)',
        templateId: 'FND-MINI-PILE',
        detect: /mini\s*pile/,
      },
      {
        id: 'sumuran',
        label: 'Pondasi sumuran (caisson)',
        templateId: 'FND-SUMURAN-CAISSON',
        detect: /sumuran|caisson/,
      },
      {
        id: 'raft-basement',
        label: 'Raft foundation + basement',
        templateId: 'FND-RAFT-BASEMENT',
        detect: /\braft\b|basement/,
      },
      {
        id: 'soldier-pile',
        label: 'Soldier pile (penahan galian)',
        templateId: 'FND-SOLDIER-PILE',
        detect: /soldier/,
      },
      {
        id: 'perbaikan-tanah',
        label: 'Perbaikan tanah (stone column/preloading)',
        templateId: 'FND-GROUND-IMPROVEMENT',
        detect: /perbaikan tanah|stone column|preloading/,
      },
    ],
    untemplated: [
      {
        id: 'foot-plat',
        label: 'foot plat / pondasi setempat / cakar ayam / strauss',
        detect: /foot\s*plat|pondasi setempat|cakar ayam|strauss/,
      },
      {
        id: 'batu-kali',
        label: 'pondasi batu kali',
        detect: /batu kali/,
      },
    ],
  },
];

export function materialGroupForScope(scopeId: string): RabMaterialGroup | undefined {
  return RAB_MATERIAL_GROUPS.find((g) => g.scopeId === scopeId);
}

export type MaterialClassification =
  | { kind: 'option'; option: RabMaterialOption }
  | { kind: 'untemplated'; material: RabUntemplatedMaterial }
  | { kind: 'none' };

/**
 * Klasifikasi penyebutan bahan pada teks untuk satu grup. Daftar
 * `untemplated` diperiksa LEBIH DULU: "genteng metal" harus terbaca
 * sebagai bahan tanpa template, bukan tertangkap opsi "genteng".
 */
export function classifyMaterialText(group: RabMaterialGroup, text: string): MaterialClassification {
  const t = (text || '').toLowerCase();
  for (const m of group.untemplated) {
    if (m.detect.test(t)) return { kind: 'untemplated', material: m };
  }
  for (const o of group.options) {
    if (o.detect.test(t)) return { kind: 'option', option: o };
  }
  return { kind: 'none' };
}

/** Ringkasan ukuran yang SUDAH jelas dari permintaan (untuk kalimat pertanyaan). */
export function formatMaterialKnownLine(spec: UniversalSpec): string {
  const parts: string[] = [];
  if (spec.buildingWidthM && spec.buildingLengthM) {
    const area = spec.areaM2 ?? spec.footprintM2;
    parts.push(
      `ukuran ${fmtNum(spec.buildingWidthM)} × ${fmtNum(spec.buildingLengthM)} m` +
        (area ? ` (luas ±${fmtNum(area)} m²)` : '')
    );
  } else if (spec.areaM2) {
    parts.push(`luas ${fmtNum(spec.areaM2)} m²`);
  } else if (spec.footprintM2) {
    parts.push(`luas tapak ${fmtNum(spec.footprintM2)} m²`);
  }
  if (spec.count) parts.push(`jumlah ${fmtNum(spec.count)} titik/unit`);
  if (spec.lengthM) parts.push(`panjang ${fmtNum(spec.lengthM)} m`);
  if (spec.volumeM3) parts.push(`volume ${fmtNum(spec.volumeM3)} m³`);
  return parts.join(' · ');
}
