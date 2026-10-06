/**
 * EZRAB DED Inventory Engine (EZRAB DED → RAB V2)
 *
 * STEP 3 & 4: COMPLETE WORK INVENTORY DISCOVERY
 *
 * Strict Principles:
 * - Distinguishes WORK ITEMS from MATERIALS / RESOURCES / COMPONENTS.
 *   (e.g. "Pasangan Dinding Bata Merah" is WORK ITEM; "bata merah", "semen", "pasir" are materials).
 * - Discovers ALL construction disciplines present in the DED:
 *   1. Earthwork & Substructure Preparation
 *   2. Foundation & Concrete Structures
 *   3. Masonry Walls & Wall Finishes
 *   4. Doors, Windows & Architectural Openings
 *   5. Floor & Wet Area Finishes
 *   6. Ceiling Systems
 *   7. Roof Structure & Cladding
 *   8. Sanitary & Plumbing Systems
 *   9. Electrical Installations
 * - NO artificial item limits (No 3-item, 5-item, or 10-item cap).
 * - Covers all 32 pages of architectural, structural, and MEP engineering drawings.
 */

import { ElementCategory, EvidenceRecord, DedWorkItem } from '../types';
import { DedDocumentMemory } from '../memory/dedDocumentMemory';

export interface CanonicalWorkInventoryItem {
  id: string; // e.g. "WRK-001"
  name: string;
  category: ElementCategory;
  discipline: 'STRUCTURAL' | 'ARCHITECTURAL' | 'MEP' | 'SITEWORK' | 'FINISHES';
  specification: string;
  material: string;
  unit: string;
  sourcePages: number[];
  evidenceIds: string[];
  evidenceDescriptions: string[];
  isMaterialOnly: false;
}

export class DedInventoryEngine {
  private static instance: DedInventoryEngine;

  private constructor() {}

  public static getInstance(): DedInventoryEngine {
    if (!DedInventoryEngine.instance) {
      DedInventoryEngine.instance = new DedInventoryEngine();
    }
    return DedInventoryEngine.instance;
  }

  /**
   * Builds canonical construction work inventory from real AI DED interpretation.
   * PRODUCTION SOURCE OF TRUTH (Phase 2 & 5).
   */
  public buildInventoryFromInterpretation(
    workItems: DedWorkItem[],
    memory?: DedDocumentMemory
  ): CanonicalWorkInventoryItem[] {
    if (!workItems || workItems.length === 0) {
      throw new Error('[DedInventoryEngine] HARD FAIL: Ekstraksi AI dokumen tidak menghasilkan item pekerjaan konstruksi yang valid.');
    }

    return workItems.map((item, idx) => {
      const id = item.id || `WRK-${String(idx + 1).padStart(3, '0')}`;
      const discipline = this.mapCategoryToDiscipline(item.category);
      const evDesc = item.warnings?.join('; ') || item.assumptions?.join('; ') || `Item terdeteksi dari dokumen DED (${item.sourcePages.join(', ')})`;

      if (memory && item.evidenceIds && item.evidenceIds.length > 0) {
        for (const evId of item.evidenceIds) {
          memory.registerEvidence({
            id: evId,
            sourceDocumentId: item.sourceDocumentId || 'DED-SOURCE',
            sourceFileName: item.sourceDocumentId || 'DED-SOURCE',
            pageNumber: item.sourcePages[0] || 1,
            type: 'SPECIFICATION',
            content: `${item.name} | ${item.materialSpec || ''} | Halaman: ${item.sourcePages.join(', ')}`,
            confidence: item.confidence || 0.95,
            references: item.sourcePages.map((p) => `P-${p}`),
          });
        }
      }

      return {
        id,
        name: item.name,
        category: item.category,
        discipline,
        specification: item.materialSpec || item.name,
        material: item.materialSpec || item.name,
        unit: item.unit || 'unit',
        sourcePages: item.sourcePages && item.sourcePages.length > 0 ? item.sourcePages : [1],
        evidenceIds: item.evidenceIds && item.evidenceIds.length > 0 ? item.evidenceIds : [`EV-${id}`],
        evidenceDescriptions: [evDesc],
        isMaterialOnly: false as const,
      };
    });
  }

  public mapCategoryToDiscipline(cat: ElementCategory): CanonicalWorkInventoryItem['discipline'] {
    switch (cat) {
      case 'FOUNDATION':
      case 'STRUCTURE_COLUMN':
      case 'STRUCTURE_BEAM':
      case 'STRUCTURE_SLAB':
      case 'ROOF':
        return 'STRUCTURAL';
      case 'SITEWORK':
        return 'SITEWORK';
      case 'MEP':
      case 'SANITARY':
        return 'MEP';
      case 'WALL':
      case 'DOOR_WINDOW':
      case 'CEILING':
      case 'FLOOR_FINISH':
      case 'PLASTER':
      case 'PAINTING':
      default:
        return 'ARCHITECTURAL';
    }
  }

  /**
   * Compatibility method for legacy / firstPrinciplesPipeline callers.
   */
  public buildInventory(synthesizedEntities?: any, pageObservations?: any): any[] {
    if (Array.isArray(synthesizedEntities) && synthesizedEntities.length > 0) {
      return synthesizedEntities.map((it: any, idx: number) => ({
        id: it.id || `WRK-${String(idx + 1).padStart(3, '0')}`,
        name: it.name || it.workItem || 'Pekerjaan Konstruksi',
        category: it.category || 'OTHER',
        discipline: it.discipline || 'ARCHITECTURAL',
        specification: it.specification || it.name,
        material: it.material || it.name,
        unit: it.unit || 'unit',
        sourcePages: it.sourcePages || [1],
        evidence: it.evidence || [],
        references: (it.sourcePages || [1]).map((p: any) => `P-${p}`),
      }));
    }
    throw new Error('[DedInventoryEngine] HARD FAIL: buildInventory() dipanggil tanpa synthesizedEntities valid. Tidak diizinkan fallback ke sample static fixture.');
  }

  /**
   * Builds the legacy sample 35-item construction work inventory for testing/simulation ONLY.
   * HARD-FAIL IN PRODUCTION: If allowSyntheticFixture is not explicitly true, throws Error.
   */
  public buildCompleteInventory(memory: DedDocumentMemory, allowSyntheticFixture = false): CanonicalWorkInventoryItem[] {
    if (!allowSyntheticFixture) {
      throw new Error(
        '[DedInventoryEngine] HARD FAIL: buildCompleteInventory() static sample fixture dilarang di production! Hasil ekstraksi AI dokumen aktual wajib digunakan.'
      );
    }
    const items: CanonicalWorkInventoryItem[] = [];
    let seq = 1;

    const addItem = (
      name: string,
      category: ElementCategory,
      discipline: CanonicalWorkInventoryItem['discipline'],
      specification: string,
      material: string,
      unit: string,
      sourcePages: number[],
      evDesc: string
    ) => {
      const id = `WRK-${String(seq++).padStart(3, '0')}`;
      const evId = `EV-${id}`;

      // Register evidence in document memory
      const evRecord: EvidenceRecord = {
        id: evId,
        sourceDocumentId: 'DED-SOURCE',
        sourceFileName: 'pdf-gambar-rumah-1-lantai_compress.pdf',
        pageNumber: sourcePages[0] || 1,
        type: 'SPECIFICATION',
        content: `${name} | ${specification} | Hal: ${sourcePages.join(', ')}`,
        confidence: 0.95,
        references: sourcePages.map((p) => `P-${p}`),
      };
      memory.registerEvidence(evRecord);

      items.push({
        id,
        name,
        category,
        discipline,
        specification,
        material,
        unit,
        sourcePages,
        evidenceIds: [evId],
        evidenceDescriptions: [evDesc],
        isMaterialOnly: false,
      });
    };

    // =========================================================================
    // 1. PEKERJAAN PERSIAPAN & TANAH (EARTHWORK & SUBSTRUCTURE PREPARATION)
    // =========================================================================
    addItem(
      'Pengukuran dan Pemasangan Bowplank',
      'SITEWORK',
      'SITEWORK',
      'Pemasangan patok kayu 5/7 dan papan bowplank 2/20 keliling bangunan',
      'KAYU_PAPAN_BOWPLANK',
      'm',
      [2, 18],
      'Denah Arsitektur & Denah Pondasi (Keliling bangunan terluar)'
    );

    addItem(
      'Galian Tanah Biasa untuk Pondasi Batu Belah',
      'SITEWORK',
      'SITEWORK',
      'Galian tanah kedalaman 1.10 m, lebar atas 1.00 m, lebar bawah 0.80 m',
      'TANAH_GALIAN',
      'm3',
      [18, 19],
      'Denah Pondasi Hal 18 & Detail Pondasi A/B Hal 19 (Profil galian pondasi)'
    );

    addItem(
      'Urugan Pasir Bawah Pondasi dan Lantai Kerja',
      'FOUNDATION',
      'STRUCTURAL',
      'Pasir urug dipadatkan tebal 50 mm di bawah aanstamping pondasi',
      'PASIR_URUG',
      'm3',
      [19],
      'Detail Pondasi Hal 19: Pasir Urug T = 50 mm'
    );

    addItem(
      'Pasangan Batu Kosong (Aanstamping)',
      'FOUNDATION',
      'STRUCTURAL',
      'Batu belah kosong disusun rapi tanpa adukan tebal 150 mm lebar 800 mm',
      'BATU_BELAH',
      'm3',
      [19],
      'Detail Pondasi Hal 19: Pasangan Aanstamping Batu Kosong'
    );

    addItem(
      'Urugan Kembali Tanah Bekas Galian',
      'SITEWORK',
      'SITEWORK',
      'Penimbunan kembali dan pemadatan tanah galian di sisi pondasi batu kali',
      'TANAH_URUG',
      'm3',
      [18, 19],
      'Denah & Detail Pondasi (Dihitung dari volume galian dikurangi volume struktur)'
    );

    // =========================================================================
    // 2. PEKERJAAN PONDASI & STRUKTUR BETON (FOUNDATION & CONCRETE)
    // =========================================================================
    addItem(
      'Pasangan Pondasi Batu Belah Campuran 1 SP : 4 PP',
      'FOUNDATION',
      'STRUCTURAL',
      'Pondasi batu gunung/belah adukan 1 SP : 4 PP, lebar atas 300 mm, lebar bawah 600 mm, tinggi 700 mm',
      'BATU_BELAH_SEMEN_PASIR',
      'm3',
      [18, 19],
      'Denah Pondasi Hal 18 & Detail A/B Hal 19: Pondasi Batu Gunung'
    );

    addItem(
      'Cor Lantai Kerja Beton T = 50 mm',
      'FOUNDATION',
      'STRUCTURAL',
      'Lantai kerja rabat beton campuran 1:3:5 tebal 50 mm di bawah sloof dan pelat',
      'BETON_LANTAI_KERJA',
      'm3',
      [19],
      'Detail Pondasi Hal 19: Cor Lantai Kerja T = 50 mm'
    );

    addItem(
      'Balok Sloof SL1 15/20 cm Beton Bertulang K-225',
      'STRUCTURE_BEAM',
      'STRUCTURAL',
      'Balok sloof ukuran 15x20 cm, beton K-225 / fc 19.3 MPa, pembesian 4 D 12 begel Ø8-150',
      'BETON_BERTULANG_K225',
      'm3',
      [19, 20, 21],
      'Denah Sloof Hal 20, 21 & Detail Hal 19: Sloof 15x20 pembesian 4 D 12'
    );

    addItem(
      'Kolom Praktis KP 15/15 cm Beton Bertulang K-225',
      'STRUCTURE_COLUMN',
      'STRUCTURAL',
      'Kolom praktis ukuran 15x15 cm, tinggi 3.20 m, beton K-225, pembesian 4 D 10 begel Ø6-150',
      'BETON_BERTULANG_K225',
      'm3',
      [2, 7, 20],
      'Denah Sloof Hal 20 (Titik K.P) & Potongan A-A/B-B Hal 7, 8 (Tinggi 3.20 m)'
    );

    addItem(
      'Ringbalk RB 15/20 cm Beton Bertulang K-225',
      'STRUCTURE_BEAM',
      'STRUCTURAL',
      'Ringbalk ukuran 15x20 cm pada elevasi +4.00 m, beton K-225, pembesian 4 D 12 begel Ø8-150',
      'BETON_BERTULANG_K225',
      'm3',
      [7, 8, 22, 23, 24],
      'Denah Ringbalk Hal 22, 23, 24 & Potongan A-A/B-B Hal 7, 8'
    );

    addItem(
      'Pelat Beton Bertulang Dak Teras Tebal 10 cm',
      'STRUCTURE_SLAB',
      'STRUCTURAL',
      'Pelat beton bertulang tebal 100 mm elv +3.00 m dak teras depan, beton K-225',
      'BETON_BERTULANG_K225',
      'm3',
      [8, 25, 26],
      'Potongan B-B Hal 8 (Dak Teras +3.00) & Denah Pelat Hal 25, 26: Pelat t = 100 mm'
    );

    // =========================================================================
    // 3. PEKERJAAN DINDING & FINISHING (MASONRY & FINISHES)
    // =========================================================================
    addItem(
      'Pasangan Dinding Bata Merah Tebal 1/2 Bata Campuran 1 SP : 4 PP',
      'WALL',
      'ARCHITECTURAL',
      'Dinding bata merah bakar adukan 1 SP : 4 PP, tebal 1/2 bata (dihitung netto dikurangi bukaan)',
      'BATA_MERAH_SEMEN_PASIR',
      'm2',
      [2, 7, 8, 9],
      'Denah Arsitektur Hal 2, Potongan Hal 7/8, Denah Kusen Hal 9 (Pengurangan bukaan)'
    );

    addItem(
      'Plesteran Dinding Tebal 15 mm Campuran 1 SP : 4 PP (2 Sisi)',
      'PLASTER',
      'FINISHES',
      'Plesteran adukan 1 SP : 4 PP tebal 15 mm diaplikasikan pada 2 sisi dinding bata',
      'SEMEN_PASIR_PLESTER',
      'm2',
      [2, 7, 8],
      'Dihitung 2 sisi dari luas netto pasangan dinding bata merah'
    );

    addItem(
      'Acian Semen PC Dinding (2 Sisi)',
      'PLASTER',
      'FINISHES',
      'Acian semen portland murni diaplikasikan halus pada 2 sisi plesteran dinding',
      'SEMEN_PORTLAND',
      'm2',
      [2, 7, 8],
      'Dihitung 2 sisi dari luas bidang plesteran dinding bata'
    );

    // =========================================================================
    // 4. PEKERJAAN KUSEN, PINTU & JENDELA (DOORS & WINDOWS)
    // =========================================================================
    addItem(
      'Pemasangan Pintu P1 (Kusen Aluminium 4" + Daun Multipleks 18mm HPL)',
      'DOOR_WINDOW',
      'ARCHITECTURAL',
      'Pintu utama & kamar 0.90x2.10 m, kusen aluminium 4", double multipleks 18 mm finishing HPL',
      'ALUMINIUM_MULTIPLEKS_HPL',
      'unit',
      [9, 10],
      'Denah Kusen Hal 9 & Detail P1 Hal 10: P1 = 3 Unit'
    );

    addItem(
      'Pemasangan Pintu P2 KM/WC (Kusen & Daun Pintu Aluminium Panel Kotak)',
      'DOOR_WINDOW',
      'ARCHITECTURAL',
      'Pintu KM/WC 0.70x2.10 m, kusen aluminium, rangka dan daun panel kotak aluminium',
      'ALUMINIUM_PANEL',
      'unit',
      [9, 10, 16],
      'Denah Kusen Hal 9 & Detail P2 Hal 10, 16: P2 = 1 Unit'
    );

    addItem(
      'Pemasangan Jendela J1 Ruang Tamu (Kusen Aluminium 4" + Kaca Bening 5 mm)',
      'DOOR_WINDOW',
      'ARCHITECTURAL',
      'Jendela kaca ganda 1.40x1.40 m, kusen aluminium 4", kaca bening tebal 5 mm',
      'ALUMINIUM_KACA_5MM',
      'unit',
      [9, 10],
      'Denah Kusen Hal 9 & Detail J1 Hal 10: J1 = 1 Unit'
    );

    addItem(
      'Pemasangan Jendela J2 & J3 Kamar (Kusen Aluminium + Kaca Bening 5 mm)',
      'DOOR_WINDOW',
      'ARCHITECTURAL',
      'Jendela kamar 0.70x1.40 m, kusen aluminium 4", kaca bening tebal 5 mm',
      'ALUMINIUM_KACA_5MM',
      'unit',
      [9, 11],
      'Denah Kusen Hal 9 & Detail J2, J3 Hal 11: J2 = 1 Unit, J3 = 2 Unit (Total 3 Unit)'
    );

    addItem(
      'Pemasangan Bovenlicht BV1 KM/WC Aluminium + Kaca 5 mm',
      'DOOR_WINDOW',
      'ARCHITECTURAL',
      'Bovenlicht ventilasi 0.60x0.40 m, rangka aluminium kaca es tebal 5 mm',
      'ALUMINIUM_KACA_5MM',
      'unit',
      [9, 16],
      'Denah Kusen Hal 9 & Detail WC Hal 16: BV1 = 2 Unit'
    );

    // =========================================================================
    // 5. PEKERJAAN LANTAI & KERAMIK (FLOOR & WALL TILING)
    // =========================================================================
    addItem(
      'Pasangan Lantai Keramik 40x40 cm Polished Ruang Utama & Kamar',
      'FLOOR_FINISH',
      'FINISHES',
      'Keramik lantai 40x40 cm polished kualitas 1, adukan perekat semen pasir 1:3',
      'KERAMIK_40X40',
      'm2',
      [2, 12],
      'Denah Keramik Hal 12: Keramik 40x40 pada seluruh ruangan kering'
    );

    addItem(
      'Pasangan Lantai Keramik WC 25x25 cm Unpolished / Anti-Slip',
      'FLOOR_FINISH',
      'FINISHES',
      'Keramik lantai kamar mandi 25x25 cm unpolished anti-slip elv -0.05 m',
      'KERAMIK_25X25_UNPOLISHED',
      'm2',
      [2, 12, 16],
      'Denah Keramik Hal 12 & Detail WC Hal 16: Keramik Unpolished 25 x 25'
    );

    addItem(
      'Pasangan Keramik Dinding WC 25x60 cm Tinggi 1.50 m',
      'FLOOR_FINISH',
      'FINISHES',
      'Keramik dinding kamar mandi 25x60 cm dipasang setinggi 1.50 m di atas trassram',
      'KERAMIK_DINDING_25X60',
      'm2',
      [16],
      'Detail WC Hal 16 (Tampak A, B, C, D): Keramik Dinding 25x60 t=150 cm'
    );

    // =========================================================================
    // 6. PEKERJAAN PLAFOND (CEILING)
    // =========================================================================
    addItem(
      'Pemasangan Langit-langit Gypsum Board Tebal 9 mm + Rangka Hollow',
      'CEILING',
      'ARCHITECTURAL',
      'Plafond gypsum board 9 mm rangka hollow galvanis 40x40 & 20x40 elevasi +3.20 m',
      'GYPSUM_9MM_RANGKA_HOLLOW',
      'm2',
      [7, 13, 15],
      'Denah Plafond Hal 13 & Detail Atap Hal 15: Gypsum Board T = 9 mm + Rangka Hollow'
    );

    addItem(
      'Pemasangan Plafond GRC Board Tebal 4 mm Area Basah & Teras',
      'CEILING',
      'ARCHITECTURAL',
      'Plafond GRC board tebal 4 mm tahan air pada area teras depan dan KM/WC elevasi +3.00 m',
      'GRC_BOARD_4MM',
      'm2',
      [8, 13, 16],
      'Denah Plafond Hal 13 (GRC +3.00) & Detail WC Hal 16'
    );

    // =========================================================================
    // 7. PEKERJAAN ATAP (ROOFING)
    // =========================================================================
    addItem(
      'Pemasangan Rangka Kuda-kuda dan Reng Baja Ringan',
      'ROOF',
      'STRUCTURAL',
      'Rangka atap baja ringan profil C75 tebal 0.75 mm dan reng tebal 0.45 mm',
      'BAJA_RINGAN_TRUSS',
      'm2',
      [7, 14, 15],
      'Denah Atap Hal 14 & Detail Atap Hal 15: Kuda-kuda Baja Ringan & Reng Baja Ringan'
    );

    addItem(
      'Pemasangan Penutup Atap Metal Spandek',
      'ROOF',
      'ARCHITECTURAL',
      'Atap gelombang metal spandek tebal 0.30 mm terpasang rapi dengan sekrup roofing',
      'METAL_SPANDEK',
      'm2',
      [7, 14, 15],
      'Denah Atap Hal 14 & Detail Atap Hal 15: Atap Metal Spandek'
    );

    addItem(
      'Pemasangan Nok / Bubungan Spandek',
      'ROOF',
      'ARCHITECTURAL',
      'Nok rabung metal spandek lebar 300 mm sesuai warna atap',
      'NOK_SPANDEK',
      'm',
      [14, 15],
      'Denah Atap Hal 14 & Detail Hal 15: Nok Spandek'
    );

    addItem(
      'Pemasangan Listplank Kalsium Silikat Board 8 x 150 mm',
      'ROOF',
      'ARCHITECTURAL',
      'Listplank kalsium silikat tebal 8 mm lebar 150 mm terpasang pada ujung overstek atap',
      'LISTPLANK_KALSIUM_SILIKAT',
      'm',
      [14],
      'Denah Atap Hal 14: Listplank Kalsium Silikat Board 8 X 150 mm'
    );

    // =========================================================================
    // 8. PEKERJAAN SANITAIR & PLUMBING (SANITARY & PLUMBING)
    // =========================================================================
    addItem(
      'Pemasangan Kloset Duduk Monoblok KM/WC',
      'SANITARY',
      'MEP',
      'Kloset duduk monoblok putih lengkap stop kran dan flexible hose',
      'KLOSET_DUDUK',
      'unit',
      [16, 29],
      'Detail WC Hal 16 (Denah & Tampak): Kloset Duduk = 1 Unit'
    );

    addItem(
      'Pemasangan Floor Drain Stainless Steel KM/WC',
      'SANITARY',
      'MEP',
      'Floor drain stainless steel anti bau dan serangga ukuran 4"',
      'FLOOR_DRAIN_SS',
      'unit',
      [16, 29],
      'Detail WC Hal 16 & Denah Instalasi Air Kotor Hal 29'
    );

    addItem(
      'Pemasangan Pipa PVC AW Diameter 1/2" Instalasi Air Bersih',
      'MEP',
      'MEP',
      'Pipa PVC tipe AW diameter 1/2" penyaluran air bersih dari tandon ke kran & kloset',
      'PIPA_PVC_AW_1_2',
      'm',
      [28],
      'Denah Instalasi Air Bersih Hal 28: Jalur pipa air bersih'
    );

    addItem(
      'Pemasangan Pipa PVC AW Diameter 4" Instalasi Air Kotor & Tinja',
      'MEP',
      'MEP',
      'Pipa PVC tipe AW diameter 4" saluran air kotor dari kloset ke septic tank',
      'PIPA_PVC_AW_4',
      'm',
      [29, 30],
      'Denah Instalasi Air Kotor Hal 29 & Detail Septic Tank Hal 30'
    );

    // =========================================================================
    // 9. PEKERJAAN ELEKTRIKAL (ELECTRICAL INSTALLATIONS)
    // =========================================================================
    addItem(
      'Pemasangan Titik Instalasi Penerangan Kabel NYM 3x1.5 mm²',
      'MEP',
      'MEP',
      'Instalasi titik lampu kabel NYM 3x1.5 mm² dalam pipa conduit PVC',
      'KABEL_NYM_PIPA_CONDUIT',
      'titik',
      [31, 32],
      'Denah Instalasi Listrik Hal 31: Titik lampu seluruh ruangan (12 titik)'
    );

    addItem(
      'Pemasangan Stop Kontak Dinding',
      'MEP',
      'MEP',
      'Stop kontak tunggal 16A terpasang inbow pada dinding',
      'STOP_KONTAK',
      'titik',
      [31, 32],
      'Denah Instalasi Listrik Hal 31: Titik stop kontak (8 titik)'
    );

    addItem(
      'Pemasangan Saklar Tunggal dan Ganda',
      'MEP',
      'MEP',
      'Saklar tunggal dan saklar ganda inbow kontrol penerangan',
      'SAKLAR_LISTRIK',
      'titik',
      [31, 32],
      'Denah Instalasi Listrik Hal 31: Saklar lampu (6 unit)'
    );

    return items;
  }
}

export const dedInventoryEngine = DedInventoryEngine.getInstance();
