export interface VocabularyTerm {
  canonicalTerm: string;
  aliases: string[];
  abbreviation?: string;
  category: 'SIPIL' | 'ARSITEKTUR' | 'MEP' | 'MANAJEMEN' | 'MATERIAL' | 'ALAT' | 'UPAH' | 'UMUM';
  definition: string;
  relatedIntents?: string[];
}

export class VocabularyEngine {
  private terms: Map<string, VocabularyTerm> = new Map();
  private aliasMap: Map<string, string> = new Map(); // alias/typo/abbreviation -> canonicalTerm
  private typoVariants: Map<string, string> = new Map();

  constructor() {
    this.registerStandardVocabulary();
  }

  private registerStandardVocabulary(): void {
    const vocabList: VocabularyTerm[] = [
      {
        canonicalTerm: 'rencana anggaran biaya',
        aliases: ['rab', 'anggaran biaya', 'estimasi biaya', 'budget proyek', 'perhitungan biaya', 'rab proyek'],
        abbreviation: 'RAB',
        category: 'MANAJEMEN',
        definition: 'Estimasi total biaya yang diperlukan untuk pelaksanaan pekerjaan konstruksi.',
        relatedIntents: ['RAB_CREATE', 'RAB_EDIT', 'RAB_CALCULATE', 'RAB_SUMMARY']
      },
      {
        canonicalTerm: 'quantity take-off',
        aliases: ['qto', 'take off', 'perhitungan volume', 'pengukuran volume', 'volume pekerjaan', 'kubikasi', 'luasan pekerjaan'],
        abbreviation: 'QTO',
        category: 'MANAJEMEN',
        definition: 'Proses pengukuran dan ekstraksi kuantitas pekerjaan dari dokumen teknis/gambar kerja.',
        relatedIntents: ['QTO_CREATE', 'QTO_CALCULATE', 'VOLUME_CALCULATION']
      },
      {
        canonicalTerm: 'detail engineering design',
        aliases: ['ded', 'gambar kerja', 'gambar detail', 'as built drawing', 'shop drawing', 'blueprint'],
        abbreviation: 'DED',
        category: 'ARSITEKTUR',
        definition: 'Gambar teknis detail dan spesifikasi teknis lengkap untuk panduan pembangunan fisik.',
        relatedIntents: ['DED_ANALYSIS', 'PDF_ANALYSIS', 'IMAGE_ANALYSIS']
      },
      {
        canonicalTerm: 'analisis harga satuan pekerjaan',
        aliases: ['ahsp', 'analisa harga satuan', 'ahs', 'analisa biaya', 'koefisien ahsp', 'ahsp pupr', 'ahsp bina marga'],
        abbreviation: 'AHSP',
        category: 'SIPIL',
        definition: 'Perhitungan rincian kebutuhan material, tenaga kerja, dan peralatan per satu satuan pekerjaan.',
        relatedIntents: ['AHSP_SEARCH', 'AHSP_INFORMATION', 'PRICE_INFORMATION']
      },
      {
        canonicalTerm: 'kurva s',
        aliases: ['s curve', 'kurva progress', 'grafik progress', 'kumulatif bobot', 'deviasi progress'],
        abbreviation: 'Kurva S',
        category: 'MANAJEMEN',
        definition: 'Grafik visualisasi kumulatif progres fisik rencana vs realisasi terhadap waktu.',
        relatedIntents: ['KURVA_S', 'PROGRESS_UPDATE', 'PROJECT_TIMELINE']
      },
      {
        canonicalTerm: 'bouwplank',
        aliases: ['bowplank', 'bouplank', 'bauwplank', 'papan duga', 'pengukuran tapak'],
        category: 'SIPIL',
        definition: 'Papan kayu pembatas penanda as dan titik elevasi bangunan sebelum penggalian pondasi.',
        relatedIntents: ['VOLUME_CALCULATION', 'AHSP_SEARCH']
      },
      {
        canonicalTerm: 'pondasi tapak',
        aliases: ['footplate', 'pondasi cakar ayam', 'footing', 'pondasi telapak', 'pad footing'],
        category: 'SIPIL',
        definition: 'Pondasi beton bertulang setempat di bawah kolom struktur untuk meneruskan beban ke tanah keras.',
        relatedIntents: ['VOLUME_CALCULATION', 'AHSP_SEARCH']
      },
      {
        canonicalTerm: 'sloof',
        aliases: ['slof', 'sloof beton', 'balok pengikat bawah', 'tie beam', 'ground beam'],
        category: 'SIPIL',
        definition: 'Balok beton bertulang horizontal di atas pondasi batu kali/tapak perata beban dinding.',
        relatedIntents: ['VOLUME_CALCULATION', 'AHSP_SEARCH']
      },
      {
        canonicalTerm: 'kolom praktis',
        aliases: ['kolom beton', 'kolom struktur', 'tiang beton', 'kolom utama', 'kolom k1', 'kolom k2'],
        category: 'SIPIL',
        definition: 'Elemen struktur vertikal pengikat dinding bata agar kokoh dan tidak roboh.',
        relatedIntents: ['VOLUME_CALCULATION', 'AHSP_SEARCH']
      },
      {
        canonicalTerm: 'ring balk',
        aliases: ['ringbalk', 'balok cincin', 'ring beam', 'balok atas', 'balok latei'],
        category: 'SIPIL',
        definition: 'Balok beton bertulang horizontal di bagian atas dinding pengikat kuda-kuda atap.',
        relatedIntents: ['VOLUME_CALCULATION', 'AHSP_SEARCH']
      },
      {
        canonicalTerm: 'bata ringan',
        aliases: ['hebel', 'hebel aac', 'aac', 'bata hebel', 'bata aerasi', 'bata putih'],
        category: 'MATERIAL',
        definition: 'Material dinding bata aerasi ringan presisi tinggi pengganti bata merah.',
        relatedIntents: ['MATERIAL_INFORMATION', 'AHSP_SEARCH']
      },
      {
        canonicalTerm: 'upah tenaga kerja',
        aliases: ['upah tukang', 'ongkos tukang', 'gaji tukang', 'pekerja', 'mandor', 'kepala tukang', 'biaya upah'],
        category: 'UPAH',
        definition: 'Biaya kompensasi tenaga kerja konstruksi per hari atau per satuan volume.',
        relatedIntents: ['LABOR_INFORMATION', 'PRICE_INFORMATION']
      }
    ];

    for (const item of vocabList) {
      this.terms.set(item.canonicalTerm, item);
      this.aliasMap.set(item.canonicalTerm.toLowerCase(), item.canonicalTerm);
      if (item.abbreviation) {
        this.aliasMap.set(item.abbreviation.toLowerCase(), item.canonicalTerm);
      }
      for (const alias of item.aliases) {
        this.aliasMap.set(alias.toLowerCase(), item.canonicalTerm);
      }
    }

    // Common Indonesian typo variations
    this.typoVariants.set('brp', 'berapa');
        this.typoVariants.set('brapa', 'berapa');
    this.typoVariants.set('gmn', 'bagaimana');
    this.typoVariants.set('gmna', 'bagaimana');
    this.typoVariants.set('knp', 'kenapa');
    this.typoVariants.set('kpn', 'kapan');
    this.typoVariants.set('bgt', 'banget');
    this.typoVariants.set('bener', 'benar');
    this.typoVariants.set('bwt', 'buat');
    this.typoVariants.set('tlg', 'tolong');
    this.typoVariants.set('sy', 'saya');
    this.typoVariants.set('u/', 'untuk');
    this.typoVariants.set('dgn', 'dengan');
    this.typoVariants.set('sdh', 'sudah');
    this.typoVariants.set('udh', 'sudah');
    this.typoVariants.set('blm', 'belum');
    this.typoVariants.set('bkm', 'belum');
    this.typoVariants.set('jg', 'juga');
    this.typoVariants.set('bnyk', 'banyak');
    this.typoVariants.set('itung', 'hitung');
    this.typoVariants.set('ngitung', 'hitung');
    this.typoVariants.set('itungin', 'hitung');
  }

  public resolveTerm(input: string): string | null {
    const clean = input.trim().toLowerCase();
    return this.aliasMap.get(clean) || null;
  }

  public normalizeTypos(text: string): string {
    const words = text.split(/\s+/);
    const normalized = words.map(w => {
      const cleanWord = w.toLowerCase().replace(/[^a-z0-9/]/g, '');
      const corrected = this.typoVariants.get(cleanWord);
      return corrected || w;
    });
    return normalized.join(' ');
  }

  public getAllTerms(): VocabularyTerm[] {
    return Array.from(this.terms.values());
  }

  public findRelatedIntents(text: string): string[] {
    const intents = new Set<string>();
    const normalizedText = this.normalizeTypos(text).toLowerCase();

    for (const [alias, canonical] of this.aliasMap.entries()) {
      if (normalizedText.includes(alias)) {
        const term = this.terms.get(canonical);
        if (term?.relatedIntents) {
          term.relatedIntents.forEach(i => intents.add(i));
        }
      }
    }

    return Array.from(intents);
  }
}

export const vocabularyEngine = new VocabularyEngine();
