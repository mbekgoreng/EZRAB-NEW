/**
 * volumeStepNav — model navigasi bertingkat Kalkulator Volume.
 *
 * Hierarki Jenis Konstruksi › Kategori › Sub Kategori › Kalkulator ini
 * ditranskripsi VERBATIM dari mockup yang di-ACC owner
 * (`~/workspace/ts-spaces/mockup-kalkulator-volume/index.html`):
 * 5 jenis konstruksi, 13 kategori, 21 sub kategori, 48 hitungan — nama,
 * deskripsi, satuan, dan nilai default field SAMA PERSIS dengan mockup.
 *
 * Setiap hitungan mockup dipetakan ke SATU kalkulator registry EZRAB yang
 * sudah ada (`calcId`) — workbench + mesin hitung + simpan QTO/RAB-nya
 * TIDAK berubah. Sembilan hitungan mockup TIDAK PUNYA padanan kalkulator
 * di registry (bore pile & tiang pancang bangunan, wing wall & trotoar
 * jembatan, galian pengelak, dan 4 hitungan kebutuhan bahan Master SNI);
 * kesembilan itu memakai `simple` — rumus + koefisien SNI-nya berasal
 * dari mockup itu sendiri, dihitung lokal di view, dan hanya bisa
 * disimpan ke ringkasan sesi (bukan ke QTO, karena tidak ada spesifikasi
 * kalkulator yang bisa di-QTO-kan). Jangan menambah/mengubah angka di
 * sini tanpa keputusan owner.
 *
 * Ilustrasi: TIDAK ada aset baru. `illusCalcId` menunjuk ke id kalkulator
 * yang ilustrasi render-style-nya sudah ada di `calculatorIllustrations`.
 */

import { Building2, Landmark, Mountain, Route, DraftingCompass, type LucideIcon } from 'lucide-react';

/** Format angka gaya mockup: id-ID, maks. 3 desimal (contoh: 3710 → "3.710"). */
export const formatMockupNumber = (n: number, dec = 3): string =>
  n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: dec });

/** Tampilan nilai input di baris rincian mockup: desimal pakai koma ("12,5"). */
export const formatMockupInput = (n: number): string => String(n).replace('.', ',');

export type FieldCls = 'c-p' | 'c-l' | 'c-t' | 'c-x';

/** Warna dot dimensi mockup: Panjang oranye, Lebar biru, Tinggi hijau, lain teal. */
export const FIELD_CLS_COLOR: Record<FieldCls, { bg: string; fg: string }> = {
  'c-p': { bg: '#EA580C', fg: '#FDEEE2' },
  'c-l': { bg: '#1D4ED8', fg: '#E3EDFD' },
  'c-t': { bg: '#15803D', fg: '#E4F4E9' },
  'c-x': { bg: '#0F766E', fg: '#E0F2F0' },
};

export interface MockupFieldRef {
  key: string;
  label: string;
  unit: string;
  cls: FieldCls;
}

/** Definisi field mockup (F) — label, satuan, dan kelas warna. */
export const MOCKUP_FIELDS: Record<string, Omit<MockupFieldRef, 'key'>> = {
  p: { label: 'Panjang', unit: 'm', cls: 'c-p' },
  l: { label: 'Lebar', unit: 'm', cls: 'c-l' },
  t: { label: 'Tinggi', unit: 'm', cls: 'c-t' },
  la: { label: 'Lebar Atas', unit: 'm', cls: 'c-l' },
  lb: { label: 'Lebar Bawah', unit: 'm', cls: 'c-l' },
  tb: { label: 'Tebal', unit: 'm', cls: 'c-t' },
  j: { label: 'Jumlah Titik', unit: 'titik', cls: 'c-x' },
  sisi: { label: 'Jumlah Sisi', unit: 'sisi', cls: 'c-x' },
  sudut: { label: 'Sudut Atap', unit: '°', cls: 'c-x' },
  d: { label: 'Diameter', unit: 'm', cls: 'c-l' },
  ked: { label: 'Kedalaman', unit: 'm', cls: 'c-t' },
  vol: { label: 'Volume Pekerjaan', unit: 'm³', cls: 'c-x' },
  luas: { label: 'Luas Pekerjaan', unit: 'm²', cls: 'c-x' },
  ler: { label: 'Panjang Lereng', unit: 'm', cls: 'c-l' },
};

const f = (key: string): MockupFieldRef => ({ key, ...MOCKUP_FIELDS[key] });

export interface MockupSimpleDef {
  resLabel: string;
  fields: Array<MockupFieldRef & { defaultValue: number; full?: boolean }>;
  calc: (v: Record<string, number>) => number;
  formulaKeys: string[];
  formulaText?: Record<string, string>;
  formulaNote?: string;
  breakdown?: (v: Record<string, number>, fmt: (n: number) => string) => string;
}

export interface MockupItem {
  id: string;
  name: string;
  unit: string;
  /** Field untuk teks rumus di baris daftar ("Panjang × Lebar × Tinggi"). */
  fields: MockupFieldRef[];
  /** Id kalkulator registry yang dibuka; null = hitungan sederhana mockup. */
  calcId: string | null;
  /** Id kalkulator yang ilustrasinya dipakai untuk item ini. */
  illusCalcId: string;
  simple?: MockupSimpleDef;
}

export interface MockupSub {
  id: string;
  name: string;
  desc: string;
  illusCalcId: string;
  items: MockupItem[];
}

export interface MockupCat {
  id: string;
  name: string;
  desc: string;
  illusCalcId: string;
  subs: MockupSub[];
}

export interface MockupDomain {
  id: string;
  name: string;
  desc: string;
  icon: LucideIcon;
  illusCalcId: string;
  cats: MockupCat[];
}

const item = (
  id: string,
  name: string,
  unit: string,
  fieldKeys: string[],
  calcId: string | null,
  illusCalcId: string,
  simple?: MockupSimpleDef,
): MockupItem => ({ id, name, unit, fields: fieldKeys.map(f), calcId, illusCalcId, simple });

const sub = (id: string, name: string, desc: string, illusCalcId: string, items: MockupItem[]): MockupSub => ({
  id,
  name,
  desc,
  illusCalcId,
  items,
});

const cat = (id: string, name: string, desc: string, illusCalcId: string, subs: MockupSub[]): MockupCat => ({
  id,
  name,
  desc,
  illusCalcId,
  subs,
});

/* ================= 5 JENIS KONSTRUKSI MOCKUP (verbatim) ================= */

export const VOLUME_MOCKUP_DOMAINS: MockupDomain[] = [
  {
    id: 'bangunan',
    name: 'Bangunan',
    desc: 'Rumah & gedung — pondasi, dinding, sampai atap',
    icon: Building2,
    illusCalcId: 'residential.kolom',
    cats: [
      cat('pondasi', 'Tanah & Pondasi', 'Galian, urugan, dan pondasi bangunan', 'residential.galian_tanah', [
        sub('pekerjaan-tanah', 'Pekerjaan Tanah', 'Galian dan urugan tanah', 'residential.galian_tanah', [
          item('galian', 'Galian Tanah Pondasi', 'm³', ['p', 'l', 't'], 'residential.galian_tanah', 'residential.galian_tanah'),
          item('urugan', 'Urugan Tanah Kembali', 'm³', ['p', 'l', 't'], 'residential.urugan_tanah', 'residential.urugan_tanah'),
        ]),
        sub('pondasi-bangunan', 'Pondasi Bangunan', 'Batu kali, footplat, cakar ayam, bore pile & pancang', 'residential.pondasi_batu_kali', [
          item('pondasi-batu', 'Pondasi Batu Kali', 'm³', ['p', 'la', 'lb', 't'], 'residential.pondasi_batu_kali', 'residential.pondasi_batu_kali'),
          item('footplat', 'Pondasi Footplat (Beton)', 'm³', ['p', 'l', 'tb', 'j'], 'residential.pondasi_beton_footing', 'residential.pondasi_beton_footing'),
          // Cakar ayam = varian footplat (mockup: pipa beton di bawah plat
          // tidak ikut dihitung — yang dihitung hanya plat beton per titik).
          item('cakar-ayam', 'Pondasi Cakar Ayam', 'm³', ['p', 'l', 'tb', 'j'], 'residential.pondasi_beton_footing', 'residential.pondasi_beton_footing'),
          item('bore-pile', 'Pondasi Bore Pile', 'm³', ['d', 'ked', 'j'], null, 'bridge.foundation', {
            resLabel: 'VOLUME BETON',
            fields: [
              { ...f('d'), defaultValue: 0.4 },
              { ...f('ked'), defaultValue: 12 },
              { ...f('j'), defaultValue: 6 },
            ],
            calc: (v) => Math.PI * Math.pow(v.d / 2, 2) * v.ked * v.j,
            formulaKeys: ['d', 'ked', 'j'],
            formulaNote: 'Volume silinder beton: π × (Diameter ÷ 2)² × Kedalaman × Jumlah Titik',
          }),
          item('tiang-pancang', 'Tiang Pancang', 'm', ['ked', 'j'], null, 'bridge.foundation', {
            resLabel: 'TOTAL PANJANG PANCANG',
            fields: [
              { ...f('ked'), defaultValue: 12 },
              { ...f('j'), defaultValue: 6 },
            ],
            calc: (v) => v.ked * v.j,
            formulaKeys: ['ked', 'j'],
          }),
        ]),
      ]),
      cat('struktur', 'Struktur Beton', 'Kolom, balok, sloof, plat, dan tangga', 'residential.kolom', [
        sub('kolom-balok', 'Kolom, Balok & Sloof', 'Elemen struktur utama', 'residential.kolom', [
          item('kolom', 'Kolom Beton', 'm³', ['l', 'tb', 't', 'j'], 'residential.kolom', 'residential.kolom'),
          item('balok', 'Balok Beton', 'm³', ['p', 'l', 't'], 'residential.balok', 'residential.balok'),
          item('sloof', 'Sloof Beton', 'm³', ['p', 'l', 't'], 'residential.sloof', 'residential.sloof'),
        ]),
        sub('plat-tangga', 'Plat & Tangga', 'Plat lantai dan tangga beton', 'residential.plat_lantai', [
          item('plat', 'Plat Lantai Beton', 'm³', ['p', 'l', 'tb'], 'residential.plat_lantai', 'residential.plat_lantai'),
          item('tangga', 'Tangga Beton', 'm³', ['p', 'l', 't'], 'residential.tangga_beton', 'residential.tangga_beton'),
        ]),
      ]),
      cat('dinding', 'Dinding & Finishing', 'Bata merah, bata ringan, plesteran, acian, dan pengecatan', 'residential.dinding', [
        sub('pasangan-dinding', 'Pasangan Dinding', 'Bata merah, bata ringan (hebel) & batako', 'residential.dinding', [
          item('bata', 'Dinding Bata Merah', 'm³', ['p', 't', 'tb'], 'residential.dinding', 'residential.dinding'),
          item('bata-ringan', 'Dinding Bata Ringan (Hebel)', 'm²', ['p', 't'], 'residential.dinding', 'residential.dinding'),
          item('batako', 'Dinding Batako', 'm²', ['p', 't'], 'residential.dinding', 'residential.dinding'),
        ]),
        sub('finishing-dinding', 'Finishing Dinding', 'Plester, aci, dan cat', 'residential.plester_acian', [
          item('plester', 'Plesteran Dinding', 'm²', ['p', 't', 'sisi'], 'residential.plester_acian', 'residential.plester_acian'),
          item('aci', 'Acian Dinding', 'm²', ['p', 't', 'sisi'], 'residential.plester_acian', 'residential.plester_acian'),
          item('cat', 'Pengecatan Dinding', 'm²', ['p', 't', 'sisi'], 'residential.pengecatan', 'residential.pengecatan'),
        ]),
      ]),
      cat('lantai', 'Lantai & Keramik', 'Keramik lantai/dinding dan lantai kerja', 'residential.penutup_lantai', [
        sub('keramik', 'Keramik', 'Keramik lantai dan dinding', 'residential.penutup_lantai', [
          item('keramik-lantai', 'Keramik Lantai', 'm²', ['p', 'l'], 'residential.penutup_lantai', 'residential.penutup_lantai'),
          item('keramik-dinding', 'Keramik Dinding', 'm²', ['p', 't'], 'residential.penutup_dinding', 'residential.penutup_dinding'),
        ]),
        sub('lantai-dasar', 'Lantai Dasar', 'Lantai kerja beton', 'residential.lantai_kerja', [
          item('lantai-kerja', 'Lantai Kerja (Beton)', 'm³', ['p', 'l', 'tb'], 'residential.lantai_kerja', 'residential.lantai_kerja'),
        ]),
      ]),
      cat('atap', 'Atap & Plafon', 'Penutup atap, rangka atap, dan plafon', 'residential.penutup_atap', [
        sub('atap-sub', 'Atap', 'Penutup dan rangka atap', 'residential.penutup_atap', [
          item('genteng', 'Penutup Atap Genteng', 'm²', ['p', 'l', 'sudut'], 'residential.penutup_atap', 'residential.penutup_atap'),
          item('rangka', 'Rangka Atap Baja Ringan', 'm²', ['p', 'l', 'sudut'], 'residential.atap_baja_ringan', 'residential.atap_baja_ringan'),
        ]),
        sub('plafon-sub', 'Plafon', 'Plafon gypsum', 'residential.plafon', [
          item('plafon', 'Plafon Gypsum', 'm²', ['p', 'l'], 'residential.plafon', 'residential.plafon'),
        ]),
      ]),
    ],
  },
  {
    id: 'jembatan',
    name: 'Jembatan',
    desc: 'Abutment, pilar, gelagar & plat jembatan',
    icon: Landmark,
    illusCalcId: 'bridge.deck',
    cats: [
      cat('jb-bawah', 'Struktur Bawah', 'Abutment, pilar, dan pondasi jembatan', 'bridge.abutment', [
        sub('abutment-sub', 'Abutment & Pilar', 'Kepala dan pilar jembatan beton', 'bridge.abutment', [
          item('abutment', 'Abutment Jembatan (Beton)', 'm³', ['p', 'l', 't'], 'bridge.abutment', 'bridge.abutment'),
          item('pilar', 'Pilar Jembatan (Beton)', 'm³', ['l', 'tb', 't', 'j'], 'bridge.pier', 'bridge.pier'),
          item('wing-wall', 'Dinding Sayap (Wing Wall)', 'm³', ['p', 't', 'tb'], null, 'bridge.abutment', {
            resLabel: 'VOLUME BETON',
            fields: [
              { ...f('p'), defaultValue: 4 },
              { ...f('t'), defaultValue: 2.5 },
              { ...f('tb'), defaultValue: 0.4 },
            ],
            calc: (v) => v.p * v.t * v.tb,
            formulaKeys: ['p', 't', 'tb'],
          }),
        ]),
        sub('pondasi-jembatan', 'Pondasi Jembatan', 'Bore pile untuk jembatan', 'bridge.foundation', [
          item('bore-pile-jembatan', 'Pondasi Bore Pile Jembatan', 'm³', ['d', 'ked', 'j'], 'bridge.foundation', 'bridge.foundation'),
        ]),
      ]),
      cat('jb-atas', 'Struktur Atas', 'Gelagar, plat lantai, dan trotoar jembatan', 'bridge.girder', [
        sub('gelagar-sub', 'Gelagar & Plat', 'Gelagar beton dan plat lantai jembatan', 'bridge.girder', [
          item('gelagar', 'Gelagar Beton Jembatan', 'm³', ['p', 'l', 't', 'j'], 'bridge.girder', 'bridge.girder'),
          item('plat-jembatan', 'Plat Lantai Jembatan', 'm³', ['p', 'l', 'tb'], 'bridge.deck', 'bridge.deck'),
          item('trotoar', 'Trotoar Jembatan', 'm³', ['p', 'l', 'tb', 'sisi'], null, 'bridge.deck', {
            resLabel: 'VOLUME BETON',
            fields: [
              { ...f('p'), defaultValue: 20 },
              { ...f('l'), defaultValue: 1 },
              { ...f('tb'), defaultValue: 0.25 },
              { ...f('sisi'), defaultValue: 2 },
            ],
            calc: (v) => v.p * v.l * v.tb * v.sisi,
            formulaKeys: ['p', 'l', 'tb', 'sisi'],
          }),
        ]),
      ]),
    ],
  },
  {
    id: 'bendungan',
    name: 'Bendungan',
    desc: 'Tubuh bendungan, inti kedap air, riprap & pelimpah',
    icon: Mountain,
    illusCalcId: 'dam.body',
    cats: [
      cat('bd-tubuh', 'Tubuh Bendungan', 'Urugan tanah, inti kedap air, dan riprap', 'dam.body', [
        sub('urugan-bendungan', 'Urugan & Inti', 'Tubuh urugan dan inti lempung kedap air', 'dam.body', [
          item('urugan-tubuh', 'Urugan Tanah Tubuh Bendungan', 'm³', ['p', 'la', 'lb', 't'], 'dam.embankment', 'dam.embankment'),
          item('inti-lempung', 'Inti Kedap Air (Lempung)', 'm³', ['p', 'la', 'lb', 't'], 'dam.core', 'dam.core'),
        ]),
        sub('riprap-sub', 'Lapis Pelindung', 'Riprap batu pelindung lereng hulu', 'dam.protection', [
          item('riprap', 'Riprap Batu Lereng', 'm³', ['p', 'ler', 'tb'], 'dam.protection', 'dam.protection'),
        ]),
      ]),
      cat('bd-pelengkap', 'Bangunan Pelengkap', 'Pelimpah (spillway) dan galian bendungan', 'dam.spillway', [
        sub('spillway-sub', 'Pelimpah & Galian', 'Beton pelimpah dan galian pondasi bendungan', 'dam.spillway', [
          item('spillway', 'Beton Pelimpah (Spillway)', 'm³', ['p', 'l', 'tb'], 'dam.spillway', 'dam.spillway'),
          item('galian-bendungan', 'Galian Pondasi Bendungan', 'm³', ['p', 'la', 'lb', 't'], 'dam.excavation', 'dam.excavation'),
          item('galian-pengelak', 'Galian Saluran Pengelak', 'm³', ['p', 'la', 'lb', 't'], null, 'dam.excavation', {
            resLabel: 'VOLUME GALIAN',
            fields: [
              { ...f('p'), defaultValue: 80 },
              { ...f('la'), defaultValue: 3 },
              { ...f('lb'), defaultValue: 5 },
              { ...f('t'), defaultValue: 2.5 },
            ],
            calc: (v) => ((v.la + v.lb) / 2) * v.t * v.p,
            formulaKeys: ['p', 't', 'la', 'lb'],
            formulaText: { la: '(Lebar Atas + Lebar Bawah) ÷ 2', lb: '' },
          }),
        ]),
      ]),
    ],
  },
  {
    id: 'jalan',
    name: 'Jalan & Drainase',
    desc: 'Perkerasan jalan, saluran & box culvert',
    icon: Route,
    illusCalcId: 'road.rigid_pavement',
    cats: [
      cat('jl-perkerasan', 'Perkerasan Jalan', 'Lapis pondasi, beton jalan, dan aspal hotmix', 'road.rigid_pavement', [
        sub('perkerasan-sub', 'Lapis Perkerasan', 'Pondasi agregat, perkerasan beton & aspal', 'road.rigid_pavement', [
          item('lapis-pondasi', 'Lapis Pondasi Agregat', 'm³', ['p', 'l', 'tb'], 'road.aggregate_base', 'road.aggregate_base'),
          item('perkerasan-beton', 'Perkerasan Beton Jalan', 'm³', ['p', 'l', 'tb'], 'road.rigid_pavement', 'road.rigid_pavement'),
          item('aspal', 'Aspal Hotmix (AC-WC)', 'm³', ['p', 'l', 'tb'], 'road.asphalt_wearing_course', 'road.asphalt_wearing_course'),
        ]),
      ]),
      cat('jl-drainase', 'Drainase & Gorong-gorong', 'Saluran U-ditch, galian saluran & box culvert', 'drainage.box_culvert', [
        sub('saluran-sub', 'Saluran Drainase', 'Galian, U-ditch precast & pasangan batu kali', 'drainage.box_culvert', [
          item('galian-saluran', 'Galian Saluran Drainase', 'm³', ['p', 'l', 'ked'], 'drainage.excavation', 'drainage.excavation'),
          item('uditch', 'Saluran U-Ditch (Precast)', 'm', ['p'], 'drainage.u_ditch', 'drainage.u_ditch'),
          item('pasangan-saluran', 'Pasangan Batu Kali Saluran', 'm³', ['p', 'la', 'lb', 't'], 'drainage.lining', 'drainage.lining'),
        ]),
        sub('culvert-sub', 'Gorong-gorong', 'Box culvert beton bertulang', 'drainage.box_culvert', [
          item('box-culvert', 'Box Culvert (Beton)', 'm³', ['p', 'l', 't', 'tb'], 'drainage.box_culvert', 'drainage.box_culvert'),
        ]),
      ]),
    ],
  },
  {
    id: 'sni',
    name: 'Master SNI',
    desc: 'Kebutuhan bahan per satuan menurut koefisien SNI',
    icon: DraftingCompass,
    illusCalcId: 'residential.beton',
    cats: [
      cat('sni-beton', 'Beton Struktural', 'Kebutuhan bahan beton menurut SNI 7394', 'residential.beton', [
        sub('beton-sni-sub', 'Beton per m³ (SNI 7394)', 'Semen, pasir, kerikil & air per mutu beton', 'residential.beton', [
          item('beton-k225', 'Beton K-225 — Kebutuhan Bahan', 'kg', ['vol'], null, 'residential.beton', {
            resLabel: 'KEBUTUHAN SEMEN',
            fields: [{ ...f('vol'), defaultValue: 10, full: true }],
            calc: (v) => v.vol * 371,
            formulaKeys: ['vol'],
            formulaNote: 'Koefisien SNI 7394 per m³ beton K-225 — hasil utama: semen',
            breakdown: (v, fmt) =>
              `Semen 371 kg/m³ → ${fmt(v.vol * 371)} kg · Pasir 698 kg/m³ → ${fmt(v.vol * 698)} kg · Kerikil 1.047 kg/m³ → ${fmt(v.vol * 1047)} kg · Air 215 L/m³ → ${fmt(v.vol * 215)} L`,
          }),
          item('beton-k300', 'Beton K-300 — Kebutuhan Bahan', 'kg', ['vol'], null, 'residential.beton', {
            resLabel: 'KEBUTUHAN SEMEN',
            fields: [{ ...f('vol'), defaultValue: 10, full: true }],
            calc: (v) => v.vol * 413,
            formulaKeys: ['vol'],
            formulaNote: 'Koefisien SNI 7394 per m³ beton K-300 — hasil utama: semen',
            breakdown: (v, fmt) =>
              `Semen 413 kg/m³ → ${fmt(v.vol * 413)} kg · Pasir 681 kg/m³ → ${fmt(v.vol * 681)} kg · Kerikil 1.021 kg/m³ → ${fmt(v.vol * 1021)} kg · Air 215 L/m³ → ${fmt(v.vol * 215)} L`,
          }),
        ]),
      ]),
      cat('sni-pasangan', 'Pasangan & Plesteran', 'Kebutuhan bahan pasangan menurut SNI 6897 & SNI 2837', 'residential.dinding', [
        sub('pasangan-sni-sub', 'Pasangan per m²', 'Bata merah dan plesteran per luas dinding', 'residential.dinding', [
          item('bata-sni', 'Pasangan Bata Merah ½ Bata (1 PC : 4 PP)', 'buah', ['luas'], null, 'residential.dinding', {
            resLabel: 'KEBUTUHAN BATA MERAH',
            fields: [{ ...f('luas'), defaultValue: 30, full: true }],
            calc: (v) => v.luas * 70,
            formulaKeys: ['luas'],
            formulaNote: 'Koefisien SNI 6897 per m² pasangan bata merah tebal ½ bata, spesi 1 PC : 4 PP',
            breakdown: (v, fmt) =>
              `Bata merah 70 buah/m² → ${fmt(v.luas * 70)} buah · Semen 14,37 kg/m² → ${fmt(v.luas * 14.37)} kg · Pasir 0,04 m³/m² → ${fmt(v.luas * 0.04)} m³`,
          }),
          item('plester-sni', 'Plesteran 15 mm (1 PC : 4 PP)', 'kg', ['luas'], null, 'residential.dinding', {
            resLabel: 'KEBUTUHAN SEMEN',
            fields: [{ ...f('luas'), defaultValue: 30, full: true }],
            calc: (v) => v.luas * 6.24,
            formulaKeys: ['luas'],
            formulaNote: 'Koefisien SNI 2837 per m² plesteran tebal 15 mm, campuran 1 PC : 4 PP',
            breakdown: (v, fmt) =>
              `Semen 6,24 kg/m² → ${fmt(v.luas * 6.24)} kg · Pasir 0,024 m³/m² → ${fmt(v.luas * 0.024)} m³`,
          }),
        ]),
      ]),
    ],
  },
];

/* ================= Helper hitung (data mockup, tanpa sumber lain) ================= */

export const mockupCatItemCount = (cat: MockupCat): number =>
  cat.subs.reduce((a, s) => a + s.items.length, 0);

export const mockupDomainItemCount = (domain: MockupDomain): number =>
  domain.cats.reduce((a, c) => a + mockupCatItemCount(c), 0);

export interface MockupSearchHit {
  domain: MockupDomain;
  cat: MockupCat;
  sub: MockupSub;
  item: MockupItem;
}

/** Pencarian mockup: nama hitungan mengandung kata kunci (case-insensitive). */
export const searchMockupItems = (query: string): MockupSearchHit[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: MockupSearchHit[] = [];
  VOLUME_MOCKUP_DOMAINS.forEach((domain) =>
    domain.cats.forEach((cat) =>
      cat.subs.forEach((sub) =>
        sub.items.forEach((item) => {
          if (item.name.toLowerCase().includes(q)) hits.push({ domain, cat, sub, item });
        }),
      ),
    ),
  );
  return hits;
};

/** Satu hasil hitungan sederhana yang disimpan sesi ini (mockup: "Hasil Hitungan Tersimpan"). */
export interface SavedSimpleResult {
  name: string;
  path: string;
  value: number;
  unit: string;
  detail: string;
}
