/**
 * D-61 + D-71 (Batch D, 2026-11-14) — Breakdown row units & labels.
 *
 * The breakdown table in `QtoCalculatorView` used to GUESS each row's unit
 * by substring matching on the breakdown KEY, with a wrong ordering:
 * - the `'m'` catch-all (`includes('m')`) ran BEFORE the `'jumlah'` branch,
 *   and `'jumlah'` itself contains `'m'` — so `jumlahPatok` → 'm' instead
 *   of a count;
 * - `'besi'`/`'kawat'` beat the trailing-'M' (meters) signal — so every
 *   Sloof/Foot Plate/Kolom `panjangBesi*` length row → 'kg';
 * - `volumeKayuBalok57` / `volumeKayuPapan320` contain no 'm3' → fell to
 *   'm' instead of m³;
 * - the same guesser mislabeled counts across the registry (`semen*Sak`
 *   → 'm' because "semen" contains 'm'; `*Unit` rows → blank; `*Ton`
 *   rows → 'kg' via 'berat').
 *
 * Fix: EXPLICIT mapping first (every breakdown key of all 24 registered
 * calculators, enumerated 2026-11-14 — the key's own suffix/semantics IS
 * the unit), with a corrected-order heuristic ONLY as a fallback for
 * future keys. The fallback never uses a bare single-letter substring
 * ('m' appears in jumlah/semen/lembar/Gypsum) — that was the core bug.
 *
 * Same module also fixes the label transform (D-26 instance):
 * "Volume Kayu Balok57" — digits were glued to the word. Labels now get
 * digit/letter separation plus explicit overrides for dimension codes
 * the generic transform cannot read (5/7, 3/20, 3/4", 1/2", C75).
 *
 * Source of truth for the map: the registry itself
 * (`src/engine/constructionCalculators/registry.ts`) — each key's unit
 * follows its spec's parameter labels and the value's dimension.
 * `d61d71BreakdownUnits.test.ts` re-enumerates the live registry and
 * asserts every key resolves to a non-empty unit, so a future key with
 * no map entry is caught by the fallback + the test, not by a user.
 */

/** Explicit unit per breakdown key — every key of all 24 calculators. */
export const BREAKDOWN_ROW_UNITS: Record<string, string> = {
  // BOWPLANK
  luasLahan: 'm²',
  kelilingBowplank: 'm',
  jumlahPatok: 'bh',
  panjangTotalPatok: 'm',
  panjangTotalPapan: 'm',
  panjangTotalSkur: 'm',
  volumeKayuBalok57: 'm³',
  volumeKayuPapan320: 'm³',
  kebutuhanPakuKg: 'kg',
  // PONDASI
  volumeGalianM3: 'm³',
  volumePondasiBatuKali: 'm³',
  volumePondasiM3: 'm³',
  volumeAanstampenBatuKosong: 'm³',
  volumeAanstampingM3: 'm³',
  volumePasirUrugBawah: 'm³',
  volumePasirUrukM3: 'm³',
  volumeUrukanBawahLantaiM3: 'm³',
  volumeUrukanSampingM3: 'm³',
  volumeUrukanTanahKembali: 'm³',
  volumeUrukanKembaliM3: 'm³',
  // FOOT_PLATE
  galianPondasiM3: 'm³',
  volumeGalianPondasiM3: 'm³',
  uruganPasirPondasiM3: 'm³',
  pekerjaanPembesianKg: 'kg',
  pekerjaanBekistingM2: 'm²',
  pekerjaanCorM3: 'm³',
  volumeBetonFootPlate: 'm³',
  jumlahKawatBetonKg: 'kg',
  volumeLantaiKerjaM3: 'm³',
  totalBeratBesiTulanganKg: 'kg',
  panjangBesiD1M: 'm',
  panjangBesiD2M: 'm',
  panjangBesiD3M: 'm',
  panjangBesiD4M: 'm',
  panjangBesiD5M: 'm',
  panjangBesiD6M: 'm',
  panjangBesiD1_M: 'm',
  panjangBesiD2_M: 'm',
  panjangBesiD3_M: 'm',
  panjangBesiD4_M: 'm',
  panjangBesiD5_M: 'm',
  // SLOOF (pekerjaanPembesianKg, jumlahKawatBetonKg, pekerjaanBekistingM2
  // shared with FOOT_PLATE/KOLOM — defined once above)
  pekerjaanCorSloofM3: 'm³',
  panjangBesiTulangan1M: 'm',
  panjangBesiTulangan2M: 'm',
  panjangBesiSengkangM: 'm',
  panjangKawatBetonM: 'm',
  totalPanjangBesi1M: 'm',
  totalPanjangBesi2M: 'm',
  totalPanjangSengkangM: 'm',
  totalPanjangKawatM: 'm',
  // KOLOM
  pekerjaanCorKolomM3: 'm³',
  volumeBetonKolom: 'm³',
  panjangBesiUtamaM: 'm',
  panjangBesiSupportM: 'm',
  totalBeratBesiKg: 'kg',
  // BALOK
  volumeBetonBalok: 'm³',
  luasBekistingBalok: 'm²',
  beratBesiUtamaKg: 'kg',
  beratSengkangKg: 'kg',
  jumlahBatang12mUtama: 'batang',
  jumlahBatang12mSengkang: 'batang',
  // BAJA_WF
  panjangPerBatangM: 'm',
  jumlahBatang: 'batang',
  totalPanjangM: 'm',
  beratNominalKgPerM: 'kg/m',
  beratDasarBajaKg: 'kg',
  beratWasteBajaKg: 'kg',
  beratProfilUtamaKg: 'kg',
  beratPlatSambungKg: 'kg',
  beratBautKg: 'kg',
  beratLasKg: 'kg',
  totalBeratBajaKg: 'kg',
  totalBeratTon: 'ton',
  luasCatBajaM2: 'm²',
  // BATA_RINGAN
  luasPasanganDindingM2: 'm²',
  luasNettoDindingM2: 'm²',
  luasAmpigSopiSopiM2: 'm²',
  luasPengurangDindingM2: 'm²',
  volumeKubikasiHebelM3: 'm³',
  jumlahBataRinganBuah: 'bh',
  kebutuhanMortarSak40kg: 'sak',
  tebalDindingCm: 'cm',
  // BATA_MERAH / BATAKO
  jumlahBataMerahPcs: 'pcs',
  semenPortlandSak: 'sak',
  pasirPasangM3: 'm³',
  jumlahBatakoPcs: 'pcs',
  // PINTU_JENDELA
  totalLuasDaunM2: 'm²',
  luasDaunPintuM2: 'm²',
  luasDaunJendelaM2: 'm²',
  panjangKusenTotalM: 'm',
  volumeKusenKayuM3: 'm³',
  luasKacaPolos5mmM2: 'm²',
  totalPintuUnit: 'unit',
  totalJendelaUnit: 'unit',
  // ATAP_BAJA_RINGAN
  luasBidangAtapM2: 'm²',
  panjangSisiMiringM: 'm',
  panjangAtapTotalM: 'm',
  jumlahKudaKudaUnit: 'unit',
  kebutuhanKanalC75M: 'm',
  kebutuhanBatangC75Batang: 'batang',
  kebutuhanRengM: 'm',
  kebutuhanBatangRengBatang: 'batang',
  kebutuhanScrewBautPcs: 'pcs',
  // PLESTERAN_ACIAN
  luasPlesteranM2: 'm²',
  luasAcianM2: 'm²',
  semenPlesterAcianSak50kg: 'sak',
  // PENUTUP_LANTAI
  luasLantaiBersihM2: 'm²',
  luasLantaiPlusWasteM2: 'm²',
  kebutuhanDusGranitDus: 'dus',
  panjangPlintLantaiM: 'm',
  semenPerekatSak50kg: 'sak',
  semenGroutNatKg: 'kg',
  // PENUTUP_DINDING
  luasKeramikDindingM2: 'm²',
  kebutuhanDusKeramikDus: 'dus',
  semenPerekatSak: 'sak',
  semenNatKg: 'kg',
  // PLAFON
  luasPlafonM2: 'm²',
  panjangListProfilM: 'm',
  kebutuhanLembarGypsumLembar: 'lembar',
  kebutuhanBatangHollowBatang: 'batang',
  kebutuhanSekrupGypsumPcs: 'pcs',
  // PENGECATAN
  totalLuasCatM2: 'm²',
  luasCatInteriorM2: 'm²',
  luasCatEksteriorM2: 'm²',
  luasCatPlafonM2: 'm²',
  kebutuhanCatInteriorPail20kg: 'pail',
  kebutuhanCatEksteriorGalon: 'galon',
  kebutuhanPlamirPail20kg: 'pail',
  // KELISTRIKAN
  totalTitikInstalasi: 'titik',
  titikLampu: 'titik',
  titikStopKontak: 'titik',
  titikSaklarTunggal: 'titik',
  titikSaklarGanda: 'titik',
  panjangKabelNYMM: 'm',
  kebutuhanRollKabel50m: 'roll',
  panjangPipaConduitM: 'm',
  // AIR_BERSIH
  totalPanjangPipaM: 'm',
  panjangPipaUtama34M: 'm',
  panjangPipaCabang12M: 'm',
  kebutuhanBatang34Batang: 'batang',
  kebutuhanBatang12Batang: 'batang',
  kebutuhanFittingKneeTeePcs: 'pcs',
  totalTitikOutputKran: 'titik',
  // SANITAIR
  totalUnitSanitair: 'unit',
  klosetDudukUnit: 'unit',
  klosetJongkokUnit: 'unit',
  wastafelUnit: 'unit',
  floorDrainUnit: 'unit',
  showerSetUnit: 'unit',
  // PAVING_BLOCK
  luasPerkerasanM2: 'm²',
  volumePasirAlasM3: 'm³',
  panjangKanstinPengunciM: 'm',
  jumlahPavingPcs: 'pcs',
  jumlahKanstinPcs: 'pcs',
  volumeAbuBatuM3: 'm³',
  // JALAN_ASPAL
  luasPerkerasanAspalM2: 'm²',
  volumeAgregatKelasBM3: 'm³',
  volumeAgregatKelasAM3: 'm³',
  kebutuhanPrimeCoatLiter: 'liter',
  tonaseAspalAcWcTon: 'ton',
  // JALAN_RIGID
  volumeBetonRigidM3: 'm³',
  volumeLeanConcreteM3: 'm³',
  luasPermukaanBetonM2: 'm²',
  luasPlastikCorM2: 'm²',
  totalBeratWiremeshKg: 'kg',
  kebutuhanLembarWiremesh: 'lembar',
  panjangCuttingJointM: 'm',
  // SALURAN_UDITCH
  panjangSaluranM: 'm',
  volumeGalianSaluranM3: 'm³',
  volumeMortarSambunganM3: 'm³',
  jumlahBoxUDitchUnit: 'unit',
  jumlahTutupCoverUnit: 'unit',
};

/**
 * Fallback for keys NOT in the explicit map (future calculators/rows).
 * Order is deliberate — the old bug was ordering + a bare-'m' catch-all:
 * 1. trailing unit suffix (the key's own last token — most reliable);
 * 2. dimension words (volume before besi/kawat: a "volumeBesi" row is m³);
 * 3. count words (jumlah/batang/titik) — BEFORE any length rule, since
 *    'jumlah' contains 'm';
 * 4. length words; NEVER a bare 'm' substring.
 * Returns '' (blank, honest) when nothing matches — a blank unit is
 * better than a wrong one, and the registry-enumeration test flags it.
 */
export function guessBreakdownUnit(key: string): string {
  // 1. Trailing unit suffix (case-sensitive camelCase tokens).
  if (key.endsWith('M3')) return 'm³';
  if (key.endsWith('M2')) return 'm²';
  if (key.endsWith('Kg')) return 'kg';
  if (key.endsWith('Ton')) return 'ton';
  if (key.endsWith('Cm')) return 'cm';
  if (key.endsWith('Unit')) return 'unit';
  if (key.endsWith('Pcs')) return 'pcs';
  if (key.endsWith('Sak')) return 'sak';
  if (key.endsWith('Dus')) return 'dus';
  if (key.endsWith('Lembar')) return 'lembar';
  if (key.endsWith('Batang')) return 'batang';
  if (key.endsWith('Titik')) return 'titik';
  if (key.endsWith('Liter')) return 'liter';
  if (key.endsWith('Galon')) return 'galon';
  if (key.endsWith('Pail')) return 'pail';
  if (key.endsWith('Roll')) return 'roll';
  if (key.endsWith('Buah')) return 'bh';
  if (key.endsWith('M')) return 'm';
  // 2. Dimension words.
  const lower = key.toLowerCase();
  if (lower.includes('volume') || lower.includes('galian') || lower.includes('pondasi') || lower.includes('cor')) return 'm³';
  if (lower.includes('luas') || lower.includes('bekisting') || lower.includes('dinding')) return 'm²';
  if (lower.includes('tonase')) return 'ton';
  if (lower.includes('berat')) return 'kg';
  // 3. Count words — before length: 'jumlah' contains 'm'.
  if (lower.includes('jumlah') || lower.includes('batang') || lower.includes('titik') || lower.includes('set')) return 'unit';
  // 4. Length words (no bare-'m' catch-all).
  if (lower.includes('panjang') || lower.includes('keliling')) return 'm';
  return '';
}

/** Unit for a breakdown row: explicit map first, corrected heuristic fallback. */
export function getBreakdownRowUnit(key: string): string {
  return BREAKDOWN_ROW_UNITS[key] ?? guessBreakdownUnit(key);
}

/**
 * Explicit labels for keys whose dimension codes the generic transform
 * cannot read (5/7 and 3/20 are timber sizes, 34/12 are inch pipe sizes,
 * C75 is a light-steel profile) — grounded in the specs' own parameter
 * / material names.
 */
export const BREAKDOWN_ROW_LABELS: Record<string, string> = {
  volumeKayuBalok57: 'Volume Kayu Balok 5/7',
  volumeKayuPapan320: 'Volume Kayu Papan 3/20',
  panjangPipaUtama34M: 'Panjang Pipa Utama 3/4"',
  panjangPipaCabang12M: 'Panjang Pipa Cabang 1/2"',
  kebutuhanBatang34Batang: 'Kebutuhan Batang Pipa 3/4"',
  kebutuhanBatang12Batang: 'Kebutuhan Batang Pipa 1/2"',
  kebutuhanKanalC75M: 'Kebutuhan Kanal C75',
  kebutuhanBatangC75Batang: 'Kebutuhan Batang Kanal C75',
};

/**
 * Human label for a breakdown key. Fixes the old transform:
 * - splits camelCase only at lowercase→capital boundaries (keeps
 *   acronyms like NYM / UDitch intact instead of "N Y M M");
 * - separates digits from letters both ways ("Balok57" → "Balok 57",
 *   "Tulangan1" → "Tulangan 1", "5mm" → "5 mm");
 * - underscores become spaces (`panjangBesiD1_M`);
 * - the old `.replace('M$', ...)` was a dead STRING replace (never
 *   matched); the trailing-M rule is now a real end-anchor regex,
 *   matching the evident intent of its M2/M3/Kg siblings.
 */
export function formatBreakdownLabel(key: string): string {
  const override = BREAKDOWN_ROW_LABELS[key];
  if (override) return override;
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(' Set', ' 1 Set')
    .replace('M2', ' (m²)')
    .replace('M3', ' (m³)')
    .replace('Kg', ' (kg)')
    .replace('Cm', ' (cm)')
    .replace(/M$/, " (m')")
    .replace(/\s+/g, ' ')
    .trim();
}
