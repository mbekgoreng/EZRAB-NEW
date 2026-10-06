/**
 * EZRAB CORE AI — CONSTRUCTION VOCABULARY ENGINE
 * 
 * Standardizes Indonesian construction terminology, abbreviations, synonyms,
 * and unit aliases to enhance search retrieval across AHSP and materials.
 * 
 * Strict Principle:
 * - Vocabulary helps query retrieval and semantic mapping.
 * - Vocabulary NEVER automatically declares that two synonyms share the same AHSP code.
 * - Final AHSP matching and prices must strictly be validated by the database.
 */

export interface VocabularySynonymGroup {
  canonicalTerm: string;
  category: string;
  synonyms: string[];
  abbreviations?: string[];
  suggestedUnit?: string;
  notes?: string;
}

export class ConstructionVocabulary {
  private static instance: ConstructionVocabulary | null = null;

  private synonymMap: Map<string, string> = new Map();
  private abbreviationMap: Map<string, string> = new Map();
  private unitAliasMap: Map<string, string> = new Map();

  private synonymGroups: VocabularySynonymGroup[] = [
    {
      canonicalTerm: 'pondasi batu kali',
      category: 'FOUNDATION',
      synonyms: ['pasangan batu kali', 'pondasi batu belah', 'pasangan batu belah', 'pondasi pasangan batu', 'pas batu kali'],
      abbreviations: ['pbk', 'pb'],
      suggestedUnit: 'm³',
    },
    {
      canonicalTerm: 'pondasi footplat',
      category: 'FOUNDATION',
      synonyms: ['pondasi telapak', 'pondasi cakar ayam', 'foot plate', 'plat pondasi', 'pad footing'],
      abbreviations: ['fp', 'fplat'],
      suggestedUnit: 'm³',
    },
    {
      canonicalTerm: 'kolom praktis',
      category: 'STRUCTURE',
      synonyms: ['kolom pengaku', 'kolom 15x15', 'kolom 11x11', 'kolom bata'],
      abbreviations: ['kp', 'col praktis'],
      suggestedUnit: 'm',
    },
    {
      canonicalTerm: 'kolom struktur',
      category: 'STRUCTURE',
      synonyms: ['kolom utama', 'kolom beton bertulang', 'kolom k1', 'kolom k2'],
      abbreviations: ['k1', 'k2', 'k3', 'col'],
      suggestedUnit: 'm³',
    },
    {
      canonicalTerm: 'sloof beton',
      category: 'STRUCTURE',
      synonyms: ['balok sloof', 'balok pengikat bawah', 'tie beam', 'sloof 15/20', 'sloof beton bertulang'],
      abbreviations: ['sl', 'tb', 'sloof'],
      suggestedUnit: 'm³',
    },
    {
      canonicalTerm: 'balok beton',
      category: 'STRUCTURE',
      synonyms: ['balok struktur', 'balok lantai', 'ringbalk', 'balok gantung', 'girder'],
      abbreviations: ['b1', 'b2', 'rb', 'beam'],
      suggestedUnit: 'm³',
    },
    {
      canonicalTerm: 'plat lantai',
      category: 'STRUCTURE',
      synonyms: ['dak beton', 'pelat lantai', 'plat beton bertulang', 'lantai 2', 'floor slab'],
      abbreviations: ['pl', 'dak', 'slab'],
      suggestedUnit: 'm³',
    },
    {
      canonicalTerm: 'pasangan bata merah',
      category: 'WALL',
      synonyms: ['dinding bata merah', 'tembok bata merah', 'pas bata', 'pasangan 1/2 bata merah'],
      abbreviations: ['bata', 'bm'],
      suggestedUnit: 'm²',
    },
    {
      canonicalTerm: 'pasangan bata ringan',
      category: 'WALL',
      synonyms: ['dinding hebel', 'bata aac', 'pasangan hebel', 'dinding bata ringan t=10cm'],
      abbreviations: ['hebel', 'aac'],
      suggestedUnit: 'm²',
    },
    {
      canonicalTerm: 'plesteran 1:4',
      category: 'WALL',
      synonyms: ['plesteran dinding', 'plesteran mortar', 'plesteran 1 sp : 4 pp', 'plesteran tebal 15mm'],
      abbreviations: ['plester', 'plesteran'],
      suggestedUnit: 'm²',
    },
    {
      canonicalTerm: 'acian semen',
      category: 'WALL',
      synonyms: ['acian dinding', 'acian semen portland', 'acian halus', 'aci tembok'],
      abbreviations: ['acian', 'aci'],
      suggestedUnit: 'm²',
    },
    {
      canonicalTerm: 'keramik lantai 60x60',
      category: 'FLOOR',
      synonyms: ['homogeneous tile 60x60', 'granit 60x60', 'granite tile', 'ht 60x60', 'lantai keramik 60x60'],
      abbreviations: ['ht', 'granit', 'keramik 60'],
      suggestedUnit: 'm²',
    },
    {
      canonicalTerm: 'plafon gypsum 9mm',
      category: 'CEILING',
      synonyms: ['plafon gypsum board', 'langit-langit gypsum', 'plafon hollow gypsum', 'gypsum board 9 mm'],
      abbreviations: ['gypsum', 'plafon'],
      suggestedUnit: 'm²',
    },
    {
      canonicalTerm: 'cat dinding interior',
      category: 'PAINTING',
      synonyms: ['pengecatan tembok interior', 'cat interior 3 lapis', 'cat tembok dalam', 'cat emulsi interior'],
      abbreviations: ['cat dlm', 'cat int'],
      suggestedUnit: 'm²',
    },
    {
      canonicalTerm: 'titik lampu',
      category: 'ELECTRICAL',
      synonyms: ['instalasi titik lampu', 'titik pencahayaan', 'pemasangan titik lampu', 'instalasi penerangan'],
      abbreviations: ['ttk lampu', 'tl'],
      suggestedUnit: 'titik',
    },
    {
      canonicalTerm: 'pipa pvc 4 inch',
      category: 'PLUMBING',
      synonyms: ['pipa air kotor 4"', 'pipa pvc aw 4 inch', 'saluran pipa 4 dim', 'pipa buangan 4 inch'],
      abbreviations: ['pipa 4"', 'pvc 4'],
      suggestedUnit: 'm',
    },
    {
      canonicalTerm: 'galian tanah pondasi',
      category: 'EARTHWORK',
      synonyms: ['penggalian tanah', 'galian pondasi', 'galian tanah biasa sedalam 1 m', 'galian tanah keras'],
      abbreviations: ['galian', 'cut'],
      suggestedUnit: 'm³',
    },
    {
      canonicalTerm: 'urugan kembali tanah',
      category: 'EARTHWORK',
      synonyms: ['pengurugan kembali', 'urugan tanah bekas galian', 'backfill tanah', 'urugan kembali'],
      abbreviations: ['urugan', 'backfill'],
      suggestedUnit: 'm³',
    },
  ];

  private unitAliases: Record<string, string> = {
    'm2': 'm²',
    'm^2': 'm²',
    'meter persegi': 'm²',
    'm persegi': 'm²',
    'sqm': 'm²',
    'm3': 'm³',
    'm^3': 'm³',
    'meter kubik': 'm³',
    'm kubik': 'm³',
    'cum': 'm³',
    'm': 'm',
    "m'": 'm',
    'meter': 'm',
    'meter lari': 'm',
    'm lari': 'm',
    'ml': 'm',
    'kg': 'kg',
    'kilogram': 'kg',
    'kilo': 'kg',
    'ton': 'ton',
    'unit': 'unit',
    'bh': 'buah',
    'buah': 'buah',
    'pcs': 'buah',
    'titik': 'titik',
    'ttk': 'titik',
    'set': 'set',
    'ls': 'ls',
    'lumpsum': 'ls',
    'lot': 'ls',
  };

  private constructor() {
    this.buildLookupIndexes();
  }

  public static getInstance(): ConstructionVocabulary {
    if (!ConstructionVocabulary.instance) {
      ConstructionVocabulary.instance = new ConstructionVocabulary();
    }
    return ConstructionVocabulary.instance;
  }

  private buildLookupIndexes(): void {
    for (const group of this.synonymGroups) {
      const canonical = group.canonicalTerm.toLowerCase();
      this.synonymMap.set(canonical, canonical);

      for (const syn of group.synonyms) {
        this.synonymMap.set(syn.toLowerCase(), canonical);
      }

      if (group.abbreviations) {
        for (const abbr of group.abbreviations) {
          this.abbreviationMap.set(abbr.toLowerCase(), canonical);
        }
      }
    }

    for (const [alias, standard] of Object.entries(this.unitAliases)) {
      this.unitAliasMap.set(alias.toLowerCase(), standard);
    }
  }

  /**
   * Normalizes a search query or term into canonical construction terminology.
   */
  public normalizeTerm(rawTerm: string): string {
    const clean = (rawTerm || '').trim().toLowerCase();
    if (!clean) return '';

    // Check direct abbreviations
    if (this.abbreviationMap.has(clean)) {
      return this.abbreviationMap.get(clean)!;
    }

    // Check direct synonyms
    if (this.synonymMap.has(clean)) {
      return this.synonymMap.get(clean)!;
    }

    // Substring pattern matching
    for (const [synonym, canonical] of this.synonymMap.entries()) {
      if (clean.includes(synonym)) {
        return canonical;
      }
    }

    return clean;
  }

  /**
   * Expands a search query into multiple keywords to improve AHSP catalog retrieval.
   */
  public expandQueryKeywords(query: string): string[] {
    const normalized = this.normalizeTerm(query);
    const keywords = new Set<string>();
    keywords.add(query.trim().toLowerCase());
    keywords.add(normalized);

    // Add matching synonyms
    for (const group of this.synonymGroups) {
      if (group.canonicalTerm === normalized || group.synonyms.some(s => query.toLowerCase().includes(s))) {
        keywords.add(group.canonicalTerm);
        for (const s of group.synonyms) {
          keywords.add(s);
        }
      }
    }

    return Array.from(keywords).filter(k => k.length > 2);
  }

  /**
   * Normalizes arbitrary unit strings to standard Indonesian construction units.
   */
  public normalizeUnit(rawUnit: string): string {
    const clean = (rawUnit || '').trim().toLowerCase();
    if (!clean) return 'unit';
    return this.unitAliasMap.get(clean) || clean;
  }

  /**
   * Checks if two units are dimensionally compatible.
   */
  public areUnitsCompatible(unitA: string, unitB: string): boolean {
    const normA = this.normalizeUnit(unitA);
    const normB = this.normalizeUnit(unitB);
    if (normA === normB) return true;

    // Compatible pairs
    const pairs: [string, string][] = [
      ['unit', 'buah'],
      ['buah', 'titik'],
      ['m', "m'"],
      ['ls', 'set'],
    ];

    for (const [u1, u2] of pairs) {
      if ((normA === u1 && normB === u2) || (normA === u2 && normB === u1)) {
        return true;
      }
    }

    return false;
  }
}

export const constructionVocabulary = ConstructionVocabulary.getInstance();
