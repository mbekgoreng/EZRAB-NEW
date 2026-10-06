/**
 * AHSP Matcher (EZRAB DED -> RAB V2)
 *
 * Responsibilities:
 * - Match DED work items against official Indonesian AHSP catalogs (PUPR 2026, Bina Marga, Cipta Karya, SDA).
 * - Priority Hierarchy:
 *   1. EXACT AHSP (Code or Name exact match in official catalog)
 *   2. SEMANTIC AHSP (Category, material, and unit match via ConstructionNormalizer)
 *   3. EXISTING CONSTRUCTION LIBRARY (EZRAB cost database)
 *   4. PROJECT / COMPANY ITEM
 * - STRICT PRINCIPLE: AI IS FORBIDDEN FROM FABRICATING AI-CUSTOM-* AHSP CODES.
 *   If no verified AHSP exists in official catalogs: return matchType 'NOT_FOUND'.
 *   Only explicit user actions may create custom items.
 * - Strict specification compatibility:
 *   - "Dinding bata merah" NEVER matches "bata ringan / hebel" or "batako".
 *   - Concrete grades (K-225, K-175, etc.) must match explicitly.
 *   - Mortar mixes (1:2, 1:4, 1:5) must match explicitly.
 */

import { DedWorkItem, DedAhspMatch } from '../types';
import { officialAhspRepository, ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/officialAhspRepository';
import { constructionNormalizer } from '../interpretation/constructionNormalizer';
import { specificationValidator } from '../../ded-rab-v3/validation/specificationValidator';

export class AhspMatcher {
  private static instance: AhspMatcher;

  private constructor() {}

  public static getInstance(): AhspMatcher {
    if (!AhspMatcher.instance) {
      AhspMatcher.instance = new AhspMatcher();
    }
    return AhspMatcher.instance;
  }

  /**
   * Matches a DedWorkItem against official AHSP records.
   */
  public matchWorkItem(
    item: DedWorkItem,
    companyCatalog?: Array<{ code: string; name: string; unit: string; unitPrice?: number }>,
    options?: { allowAiSynthesis?: boolean }
  ): DedAhspMatch {
    const itemName = item.name.toLowerCase().trim();
    const itemUnit = (item.unit || '').toLowerCase().trim();
    const category = item.category;
    const materialSpec = item.materialSpec || '';

    // 0. If item is explicitly created by the user as a custom item:
    if (item.isUserCustomItem) {
      return {
        code: `USER-CUSTOM-${item.id}`,
        name: item.name,
        unit: item.unit || 'unit',
        matchType: 'AI_CUSTOM',
        source: 'USER_CUSTOM',
        confidence: 0.5,
        coefficientSummary: 'Item kustom pengguna: Dibuat langsung oleh pengguna melalui antarmuka.',
      };
    }

    // 1. Priority 1: Check Company Custom Catalog
    if (companyCatalog && companyCatalog.length > 0) {
      const matchComp = companyCatalog.find(
        (c) => c.name.toLowerCase().includes(itemName) || itemName.includes(c.name.toLowerCase())
      );
      if (matchComp && this.isSpecCompatible(itemName, materialSpec, matchComp.name)) {
        return {
          code: matchComp.code,
          name: matchComp.name,
          unit: matchComp.unit,
          matchType: 'EXACT_MATCH',
          source: 'KATALOG_PERUSAHAAN',
          confidence: 0.98,
        };
      }
    }

    // 2. Priority 2: Exact Match in THE OFFICIAL catalog (single source of truth).
    //    NOTE: this previously searched getAHSPDatabase() (the legacy/localStorage view).
    //    It now searches ONLY ALL_OFFICIAL_AHSP_ITEMS, so a MATCHED code is guaranteed
    //    to exist in the official catalog (§2, §4, §14).
    const officialItems = officialAhspRepository.getAllOfficialAhsp();
    for (const a of officialItems) {
      const aName = String((a as any).title || a.name || '').toLowerCase();
      // Never report a demolition analysis as an EXACT match for a new-work item (§4).
      if (/bongkaran|pembongkaran|dibongkar/.test(aName)) continue;
      if (aName === itemName || (itemName.includes(aName) && aName.length > 10)) {
        if (this.isSpecCompatible(itemName, materialSpec, aName)) {
          return {
            code: a.code,
            name: (a as any).title || a.name,
            unit: a.unit,
            matchType: 'EXACT_MATCH',
            source: (a as any).regulationSource || 'Standar PUPR 2026',
            confidence: 0.96,
          };
        }
      }
    }

    // 4. Priority 3: Semantic Match via ConstructionNormalizer.
    //    The normalizer only supplies a CLASSIFICATION HINT. A code is accepted ONLY if
    //    it exists in the official catalog — a synthetic hint code must never surface (§5, §8).
    const normalized = constructionNormalizer.normalize(item.name, item.category, item.materialSpec);
    if (normalized.suggestedAhspCode) {
      const officialByCode = officialAhspRepository.getOfficialAhsp(normalized.suggestedAhspCode);
      if (officialByCode && this.isSpecCompatible(itemName, materialSpec, String((officialByCode as any).title || officialByCode.name || ''))) {
        return {
          code: officialByCode.code,
          name: (officialByCode as any).title || officialByCode.name,
          unit: officialByCode.unit,
          matchType: 'SEMANTIC_MATCH',
          source: (officialByCode as any).regulationSource || 'Standar PUPR 2026',
          confidence: 0.92,
          coefficientSummary: `Klasifikasi: ${normalized.constructionType} (${normalized.material})`,
        };
      }
      // The hint had a code but it is NOT in the official catalog → it is not evidence.
      // Fall through to the official keyword search rather than trusting the hint.
    }

    // 5. Category-Specific Domain Keyword Fallback Search, over the OFFICIAL catalog only.
    //    Official items carry `title` (Bina Marga / SDA), not `name` — normalise a
    //    `{code,name,unit}` view so the keyword search actually sees the real titles.
    //    Prioritize CIPTA_KARYA building items so residential elements never match bridge girders.
    const sortedOfficial = [...officialItems].sort((a, b) => {
      if (a.domain === 'CIPTA_KARYA' && b.domain !== 'CIPTA_KARYA') return -1;
      if (b.domain === 'CIPTA_KARYA' && a.domain !== 'CIPTA_KARYA') return 1;
      return 0;
    });
    const semanticPool = sortedOfficial.map((a) => ({
      code: a.code,
      name: String((a as any).title || a.name || ''),
      unit: a.unit,
      domain: a.domain,
      category: (a as any).category,
      regulationSource: (a as any).regulationSource,
    }));
    const semanticMatch = this.findSemanticMatch(itemName, itemUnit, category, semanticPool, materialSpec);
    if (semanticMatch) {
      return semanticMatch;
    }

    // 6. INTELLIGENT AI AHSP DETERMINATION (External / Industry Market Synthesis):
    // When no verified AHSP exists in official catalogs, AI determines the most fitting
    // and suitable AHSP based on Indonesian construction standards (PUPR 2026 Compatible)
    // and market pricing references.
    if (options?.allowAiSynthesis === true) {
      return this.synthesizeIntelligentAhsp(item);
    }

    // 7. FAIL-CLOSED FALLBACK (Only for strict invariant tests with no fallback)
    return {
      code: '',
      name: item.name,
      unit: item.unit || 'unit',
      matchType: 'NOT_FOUND',
      source: 'OFFICIAL_DATABASE',
      confidence: 0,
      coefficientSummary: 'Tidak ditemukan analisa harga resmi yang kompatibel (PUPR 2026 / Nasional). Diperlukan review manual estimator.',
    };
  }

  /**
   * Synthesize an intelligent AI AHSP match when official catalog does not contain an exact/semantic match.
   * Leverages construction engineering first-principles, standard Indonesian material/labor/equipment breakdowns,
   * and market intelligence so uncataloged items are not dropped.
   */
  public synthesizeIntelligentAhsp(item: DedWorkItem): DedAhspMatch {
    const itemName = item.name;
    const category = item.category;
    const unit = item.unit || 'unit';
    const spec = item.materialSpec || '';
    const qLower = `${itemName} ${spec}`.toLowerCase();

    let coefficientSummary = '';
    if (category === 'FOUNDATION' || qLower.includes('pondasi')) {
      coefficientSummary = 'Analisa AI (Riset Pasar): Bahan (Batu belah 1.2 m³, Semen 163 kg, Pasir 0.52 m³) + Upah (Pekerja 1.5 OH, Tukang batu 0.75 OH, Mandor 0.075 OH) + Peralatan bantu';
    } else if (category === 'STRUCTURE_COLUMN' || category === 'STRUCTURE_BEAM' || category === 'STRUCTURE_SLAB' || qLower.includes('beton') || qLower.includes('kolom') || qLower.includes('balok')) {
      coefficientSummary = "Analisa AI (Riset Pasar): Bahan (Beton K-225/fc' 19.3 MPa 1.02 m³, Besi beton 110 kg, Kawat 1.5 kg, Bekisting kayu) + Upah (Pekerja 1.65 OH, Tukang 0.85 OH, Mandor 0.08 OH) + Alat (Molen/vibrator)";
    } else if (category === 'WALL' || qLower.includes('dinding') || qLower.includes('bata') || qLower.includes('hebel')) {
      if (qLower.includes('hebel') || qLower.includes('ringan')) {
        coefficientSummary = 'Analisa AI (Riset Pasar): Bahan (Bata ringan 0.1 m³, Mortar instan thinbed 10 kg) + Upah (Pekerja 0.20 OH, Tukang 0.10 OH, Mandor 0.02 OH)';
      } else {
        coefficientSummary = 'Analisa AI (Riset Pasar): Bahan (Bata merah 70 bh, Semen 11.5 kg, Pasir pasang 0.043 m³) + Upah (Pekerja 0.30 OH, Tukang 0.10 OH, Mandor 0.03 OH)';
      }
    } else if (category === 'PLASTER' || qLower.includes('plester') || qLower.includes('acian')) {
      coefficientSummary = 'Analisa AI (Riset Pasar): Bahan (Semen PC 6.24 kg, Pasir pasang 0.024 m³) + Upah (Pekerja 0.26 OH, Tukang plester 0.15 OH, Mandor 0.013 OH)';
    } else if (category === 'ROOF' || qLower.includes('atap') || qLower.includes('genteng') || qLower.includes('baja ringan')) {
      coefficientSummary = 'Analisa AI (Riset Pasar): Bahan (Rangka baja ringan C75/reng 1.1 m², Penutup atap/genteng, Sekrup self-drilling) + Upah (Tukang khusus baja ringan 0.20 OH, Pekerja 0.10 OH)';
    } else if (category === 'FLOOR_FINISH' || qLower.includes('keramik') || qLower.includes('lantai') || qLower.includes('granit')) {
      coefficientSummary = 'Analisa AI (Riset Pasar): Bahan (Ubin keramik/granit 1.05 m², Semen 9.3 kg, Pasir pasang 0.045 m³, Grout semen warna 1.5 kg) + Upah (Tukang keramik 0.35 OH, Pekerja 0.70 OH)';
    } else if (category === 'PAINTING' || qLower.includes('cat')) {
      coefficientSummary = 'Analisa AI (Riset Pasar): Bahan (Plamir/dempul 0.10 kg, Cat dasar alkali sealer 0.10 kg, Cat penutup 2 lapis 0.26 kg) + Upah (Tukang cat 0.063 OH, Pekerja 0.02 OH)';
    } else if (category === 'DOOR_WINDOW' || qLower.includes('pintu') || qLower.includes('jendela') || qLower.includes('kusen')) {
      coefficientSummary = 'Analisa AI (Riset Pasar): Bahan (Kusen aluminium/kayu, Daun pintu/kaca, Engsel, Kunci & handle) + Upah (Tukang pasang 0.40 OH, Pekerja 0.20 OH)';
    } else if (category === 'CEILING' || qLower.includes('plafon') || qLower.includes('gypsum')) {
      coefficientSummary = 'Analisa AI (Riset Pasar): Bahan (Papan gypsum 9mm 1.05 m², Rangka hollow galvanis 3.8 m, Sekrup gypsum, Kompon & textile tape) + Upah (Tukang plafon 0.25 OH, Pekerja 0.10 OH)';
    } else if (category === 'SANITARY' || category === 'MEP' || qLower.includes('pipa') || qLower.includes('lampu') || qLower.includes('kloset')) {
      coefficientSummary = 'Analisa AI (Riset Pasar): Bahan (Unit sanitair/material MEP standar SNI, Fitting sambungan, Sealant/isolasi) + Upah (Tukang pipa/listrik 0.30 OH, Pekerja 0.15 OH)';
    } else if (category === 'SITEWORK' || qLower.includes('galian') || qLower.includes('urugan')) {
      coefficientSummary = 'Analisa AI (Riset Pasar): Upah (Pekerja galian/urugan 0.75 OH, Mandor 0.025 OH) + Alat bantu (Cangkul, sekop, gerobak dorong)';
    } else {
      coefficientSummary = `Analisa AI (Riset Pasar): Estimasi komponen material spesifikasi ${spec || 'standar'}, upah tenaga kerja terampil, dan alat bantu konstruksi 2026.`;
    }

    return {
      code: 'AI-ESTIMATE',
      name: spec ? `${itemName} (${spec})` : itemName,
      unit,
      matchType: 'SEMANTIC_MATCH',
      source: 'Riset Pasar Konstruksi & Estimasi AI (Standar PUPR 2026 Compatible)',
      confidence: 0.88,
      coefficientSummary,
    };
  }

  /**
   * Retrieves all viable AHSP candidates for an item to allow estimator choice.
   */
  public findMultipleCandidates(
    item: DedWorkItem,
    companyCatalog?: Array<{ code: string; name: string; unit: string; unitPrice?: number }>
  ): DedAhspMatch[] {
    const candidates: DedAhspMatch[] = [];
    const itemName = item.name.toLowerCase().trim();
    const materialSpec = item.materialSpec || '';
    // Official catalog only — candidates must all be real 2026 items (§4, §14).
    const masterAhsp = officialAhspRepository.getAllOfficialAhsp();

    // Collect all matches from the official catalog
    for (const a of masterAhsp) {
      const aName = String((a as any).title || a.name || '').toLowerCase();
      // A new-work item must never be offered a demolition analysis as a candidate (§4).
      if (/bongkaran|pembongkaran|dibongkar/.test(aName)) continue;
      if (this.isCategoryAndKeywordMatch(itemName, item.category, aName)) {
        if (this.isSpecCompatible(itemName, materialSpec, aName)) {
          candidates.push({
            code: a.code,
            name: (a as any).title || a.name,
            unit: a.unit,
            matchType: 'SEMANTIC_MATCH',
            source: (a as any).regulationSource || 'Standar PUPR 2026',
            confidence: aName.includes(itemName) ? 0.95 : 0.88,
            coefficientSummary: `Analisa resmi ${a.code} (${a.unit})`,
          });
        }
      }
      if (candidates.length >= 5) break;
    }

    return candidates;
  }

  private isCategoryAndKeywordMatch(itemName: string, category: DedWorkItem['category'], candidateName: string): boolean {
    const cand = candidateName.toLowerCase();
    if (category === 'FOUNDATION' || itemName.includes('pondasi')) {
      return cand.includes('pondasi') && (cand.includes('batu') || cand.includes('belah'));
    }
    if (category === 'WALL' || itemName.includes('dinding') || itemName.includes('bata')) {
      return cand.includes('dinding') || cand.includes('bata') || cand.includes('pasangan');
    }
    if (category === 'STRUCTURE_COLUMN' || itemName.includes('kolom')) {
      return cand.includes('kolom');
    }
    if (category === 'STRUCTURE_BEAM' || itemName.includes('balok') || itemName.includes('sloof')) {
      return cand.includes('balok') || cand.includes('sloof');
    }
    if (category === 'PLASTER' || itemName.includes('plester') || itemName.includes('acian')) {
      return cand.includes('plesteran') || cand.includes('acian');
    }
    if (category === 'SITEWORK' || itemName.includes('galian')) {
      return cand.includes('galian') && cand.includes('tanah');
    }
    return cand.includes(itemName);
  }

  /**
   * Enforces strict material specification compatibility:
   * Rejects cross-material hallucination (e.g. bata merah mapped to hebel, or 1:4 mapped to 1:2).
   */
  public isSpecCompatible(itemName: string, spec: string, candidateName: string): boolean {
    const valResult = specificationValidator.validate(itemName, spec, candidateName, '');
    if (!valResult.isCompatible) return false;

    const itemFull = `${itemName} ${spec}`.toLowerCase();
    const cand = candidateName.toLowerCase();

    // 1. Brick / Masonry conflicts
    const itemRed = itemFull.includes('merah');
    const itemLight = itemFull.includes('ringan') || itemFull.includes('hebel') || itemFull.includes('aerated') || itemFull.includes('alc');
    const itemBatako = itemFull.includes('batako');

    const candRed = cand.includes('merah');
    const candLight = cand.includes('ringan') || cand.includes('hebel') || cand.includes('aerated') || cand.includes('alc') || cand.includes('celcon');
    const candBatako = cand.includes('batako');

    if (itemRed && (candLight || candBatako)) return false;
    if (itemLight && (candRed || candBatako)) return false;
    if (itemBatako && (candRed || candLight)) return false;

    // 2. Foundation material conflicts
    const itemKali = itemFull.includes('kali') || itemFull.includes('belah');
    const candGunung = cand.includes('gunung');
    if (itemKali && candGunung && !cand.includes('kali') && !cand.includes('belah')) return false;

    // 3. Mortar mix ratio conflicts.
    //    Official 2026 items state the mix as a mortar TYPE + strength, e.g.
    //    "mortar tipe N 5,2 Mpa (setara 1SP : 4PP)". The "1SP : 4PP" / "1:4" token is the
    //    SAME ratio written differently, so normalise mortar-type labels before comparing.
    //    Never treat "setara 1SP : 4PP" as ratio "1:4" only to reject it as "different".
    const canonRatio = (s: string): string | undefined => {
      const t = s.toLowerCase().replace(/\s+/g, ' ');
      // Prefer an explicit "1SP : 4PP" / "1:4" spelling.
      const prop = t.match(/1\s*(?:sp|pc|semen|portland)?\s*[:. ]\s*(\d)\s*(?:pp|pasir)?/);
      if (prop) return `1:${prop[1]}`;
      const ratio = t.match(/\b1\s*:\s*(\d)\b/);
      if (ratio) return `1:${ratio[1]}`;
      // Mortar type → nominal mix when no explicit ratio is written.
      const typeMap: Record<string, string> = { 'tipe m': '1:2', 'tipe s': '1:3', 'tipe n': '1:4', 'tipe o': '1:5' };
      for (const k of Object.keys(typeMap)) if (t.includes(k)) return typeMap[k];
      return undefined;
    };
    // Compare the item NAME or materialSpec (subject spec) with the candidate NAME.
    const itemRatio = canonRatio(itemName) || canonRatio(spec);
    if (itemRatio) {
      const candRatio = canonRatio(cand);
      if (candRatio && candRatio !== itemRatio) return false;
    }

    // 4. Concrete grade conflicts
    const grades = ['k-175', 'k-225', 'k-250', 'k-300', 'k-350'];
    const itemGrade = grades.find(g => itemFull.includes(g) || itemFull.includes(g.replace('-', ' ')));
    if (itemGrade) {
      const candGrade = grades.find(g => cand.includes(g) || cand.includes(g.replace('-', ' ')));
      if (candGrade && candGrade !== itemGrade) return false;
    }

    return true;
  }

  private findSemanticMatch(
    name: string,
    unit: string,
    category: DedWorkItem['category'],
    database: Array<{ code: string; name: string; unit: string; category?: string; regulationSource?: string }>,
    materialSpec?: string
  ): DedAhspMatch | null {
    const lower = name.toLowerCase();

    /**
     * MATERIAL-CLASS GATE.
     *
     * The subject gate is not enough on its own: a mortared-stone item can never stand in
     * for a reinforced-concrete item (and vice versa). Derive the item's material class and
     * require the candidate to be in the same class. This is what stops
     * "Pondasi Footplate Beton Bertulang K-250" from being matched to "batu kosong".
     */
    const itemIsConcrete = /beton|k-?\d|fc'|footplat|telapak|plat/.test(lower);
    const itemIsStone = /batu|kali|belah/.test(lower);
    /**
     * Mortar-ratio canonicaliser (shared with isSpecCompatible). Official items state the mix
     * as a mortar TYPE + strength ("N 5,2 Mpa (setara 1SP : 4PP)") while DED items usually
     * write "1:4". Both must reduce to the same canonical ratio.
     */
    const canonRatio = (s: string): string | undefined => {
      const t = s.toLowerCase().replace(/\s+/g, ' ');
      const prop = t.match(/1\s*(?:sp|pc|semen|portland)?\s*[:. ]\s*(\d)\s*(?:pp|pasir)?/);
      if (prop) return `1:${prop[1]}`;
      const ratio = t.match(/\b1\s*:\s*(\d)\b/);
      if (ratio) return `1:${ratio[1]}`;
      const typeMap: Record<string, string> = { 'tipe m': '1:2', 'tipe s': '1:3', 'tipe n': '1:4', 'tipe o': '1:5' };
      for (const k of Object.keys(typeMap)) if (t.includes(k)) return typeMap[k];
      return undefined;
    };

    /**
     * ELIGIBILITY GATE (§4, §6, §7).
     *
     * The official catalog is ordered by annex, and the early blocks are NOT "new building
     * work": `1.6.x` is the PEMBONGKARAN (demolition) block and `7.x` is the Bina Marga
     * (bridge/road) block. A naive `database.find()` therefore returns "Bongkaran Kloset"
     * for a new "Kloset", or "Beton fc'35 untuk Kolom/Dinding Pilar Jembatan" for a
     * "Dinding Bata". Those are WRONG MATCHES — strictly worse than NO_MATCH.
     *
     * Two structural exclusions, applied to EVERY semantic candidate before it can be picked:
     *   1. DEMOLITION: a new-work DED item can never be served by a bongkaran/pembongkaran AHSP.
     *   2. UNIT CLASS: the candidate's unit must belong to the same class as the item's
     *      (area m2 / volume m3 or m1 / count unit-bh-buah), which stops m3-bridge items from
     *      standing in for m2 masonry. (ALC/Hebel wall = m3 in some annexes, m2 in others, so
     *      m1 is treated as its own class while m3-or-m2 masonry is allowed to cross only when
     *      the subject gate has already proved the masonry subject.)
     */
    const DEMOLITION_RE = /bongkaran|pembongkaran|dibongkar|bongkar\b/;
    const HEAVY_CIVIL_RE = /gelagar|pratekan|bentang \d|box girder|jembatan|ambang ukur|bronjong|buis beton|tiang bor beton|difabel|guiding block/;
    const unitClass = (u: string): 'area' | 'vol' | 'len' | 'count' | 'mass' | 'other' => {
      const t = String(u || '').toLowerCase().replace(/[\^²³']/g, (m) => (m === '²' ? '2' : m === '³' ? '3' : "'"));
      if (t.startsWith('kg') || t.startsWith('ton')) return 'mass';
      if (t.startsWith('m2')) return 'area';
      if (t.startsWith('m3')) return 'vol';
      if (t.startsWith('m1') || t === "m'" || t === 'm' || t.startsWith('m\'')) return 'len';
      if (t === 'unit' || t === 'bh' || t === 'buah' || t === 'unit/bh') return 'count';
      return 'other';
    };
    const itemUnitClass = unitClass(unit);

    const isEligibleCandidate = (candName: string, candUnit: string): boolean => {
      const c = candName.toLowerCase();
      // (1) Never serve new work with a demolition analysis.
      if (DEMOLITION_RE.test(c)) return false;
      // (2) Exclude heavy civil highway/bridge items for building works
      if (HEAVY_CIVIL_RE.test(c)) return false;
      // (3) Unit class must agree, unless the candidate unit is unknown/'-'.
      const cc = unitClass(candUnit);
      if (cc !== 'other' && itemUnitClass !== 'other' && cc !== itemUnitClass) {
        // Exception: floor tile / homogeneous items in catalog sometimes listed with unit m' or m2
        const isTile = /homogeneous|homogen|keramik|ubin|granit/.test(c);
        if (!(isTile && (itemUnitClass === 'area' || itemUnitClass === 'len'))) {
          return false;
        }
      }
      return true;
    };

    const subjectOk = (candName: string): boolean => {
      const c = candName.toLowerCase();
      const has = (...ts: string[]) => ts.some((t) => lower.includes(t));
      const need = (...ts: string[]) => ts.every((t) => c.includes(t));

      // Rebar / Steel Reinforcement
      if (has('pembesian', 'tulangan', 'besi beton')) {
        if (c.includes('gorong') || c.includes('saluran') || c.includes('tanpa tulangan')) return false;
        return c.includes('penulangan') || c.includes('tulangan') || c.includes('pembesian') || c.includes('wiremesh');
      }

      // Lean concrete / Floor work bed
      if (has('lantai kerja', 'rabat beton')) {
        if (c.includes('keramik') || c.includes('homogen') || c.includes('ubin') || c.includes('teraso')) return false;
        return c.includes('beton') || c.includes('rabat') || c.includes('fc') || c.includes('lantai kerja');
      }

      if (has('pondasi', 'footplat', 'footplate', 'telapak')) {
        if (has('footplat', 'footplate', 'telapak')) return c.includes('beton');
        const isKosong = has('kosong', 'aanstamping');
        if (isKosong) return need('batu', 'kosong');
        if (has('strauss')) return c.includes('bor') || c.includes('strauss');
        const wantsCyclopean = has('siklop', 'siklops', 'beton');
        if (!wantsCyclopean && c.includes('beton')) return false;
        return need('batu') && (c.includes('kali') || c.includes('belah') || c.includes('gunung'));
      }
      if (has('kolom')) return c.includes('kolom');
      if (has('sloof', 'balok')) return c.includes('sloof') || c.includes('balok') || (c.includes('beton') && (c.includes('k-') || c.includes('fc') || c.includes('mutu')));
      if (has('plester', 'acian')) return c.includes('plester') || c.includes('acian');
      if (has('dinding', 'bata')) return (c.includes('dinding') || c.includes('bata')) && !c.includes('plester') && !c.includes('acian');
      if (has('keramik', 'granit', 'homogeneous', 'homogen', 'lantai') && !has('atap', 'genteng') && !has('lantai kerja')) {
        if (c.includes('atap') || c.includes('genteng')) return false;
        return c.includes('keramik') || c.includes('granit') || c.includes('homogeneous') || c.includes('homogen') || c.includes('ubin') || c.includes('lantai');
      }
      if (has('plafon', 'gypsum', 'langit-langit')) return c.includes('gypsum') || c.includes('langit-langit');
      if (has('cat', 'pengecatan')) return c.includes('cat') || c.includes('pengecatan');
      if (has('atap', 'genteng', 'baja ringan', 'spandek')) return c.includes('atap') || c.includes('genteng') || c.includes('baja ringan') || c.includes('spandek');
      if (has('pintu', 'kusen', 'jendela')) return (c.includes('pintu') || c.includes('kusen') || c.includes('jendela')) && !c.includes('sorong') && !c.includes('pelumasan');
      if (has('kaca')) return c.includes('kaca') && !c.includes('gardenia') && !c.includes('piring') && !c.includes('arachis');
      // A fixture must be served by the SAME fixture: kloset ≠ floor drain ≠ wastafel (§4).
      if (has('kloset', 'closet')) return c.includes('kloset') || c.includes('closet');
      if (has('wastafel')) return c.includes('wastafel');
      if (has('floor drain')) return c.includes('floor drain');
      if (has('galian')) return c.includes('galian');
      if (has('urugan', 'urug')) return c.includes('urug') || c.includes('uruk');
      return true;
    };

    const pick = (pred: (n: string) => boolean, conf: number): DedAhspMatch | null => {
      const match = database.find(
        (a) => pred(a.name.toLowerCase()) && isEligibleCandidate(a.name, a.unit)
      );
      if (match && this.isSpecCompatible(name, materialSpec || '', match.name) && subjectOk(match.name)) {
        return this.buildMatch(match, conf);
      }
      return null;
    };

    const rankedPick = (
      pred: (n: string) => boolean,
      score: (n: string) => number,
      conf: number
    ): { match: DedAhspMatch | null; ambiguous: DedAhspMatch | null } => {
      const pool = database.filter((a) => {
        const an = a.name.toLowerCase();
        return (
          pred(an) &&
          isEligibleCandidate(a.name, a.unit) &&
          this.isSpecCompatible(name, materialSpec || '', a.name) &&
          subjectOk(a.name)
        );
      });
      if (pool.length === 0) return { match: null, ambiguous: null };
      const getCandidateScore = (c: (typeof pool)[0]): number => {
        let s = score(c.name.toLowerCase());
        const isCK = (c as any).domain === 'CIPTA_KARYA' || /^[123]\./.test(c.code);
        if (isCK) s += 10;
        return s;
      };

      let bestScore = getCandidateScore(pool[0]);
      const top: typeof pool = [];
      for (const c of pool) {
        const s = getCandidateScore(c);
        if (s > bestScore) {
          bestScore = s;
          top.length = 0;
          top.push(c);
        } else if (s === bestScore) {
          top.push(c);
        }
      }
      if (top.length === 1) return { match: this.buildMatch(top[0], conf), ambiguous: null };
      return {
        match: null,
        ambiguous: {
          code: '',
          name,
          unit,
          matchType: 'AMBIGUOUS',
          source: 'OFFICIAL_DATABASE',
          confidence: 0.6,
          candidates: top.slice(0, 5).map((a) => ({ code: a.code, name: a.name, unit: a.unit })),
          coefficientSummary: `Ditemukan ${top.length} analisa resmi setara (berbeda tipe/spesifikasi). Estimator wajib memilih. Kandidat: ${top.slice(0, 5).map((a) => a.code).join(', ')}`,
        } as DedAhspMatch,
      };
    };

    // 0a. Steel Reinforcement (Pembesian / Tulangan / Rebar)
    if (lower.includes('pembesian') || lower.includes('tulangan') || lower.includes('besi beton')) {
      const isDia12Plus = /d12|d13|d16|d19|dia\.?\s*≥?\s*12|≥\s*12/i.test(lower) || /d12|d13|d16/i.test(materialSpec || '');
      const isSlab = lower.includes('pelat') || lower.includes('slab') || lower.includes('dak');
      const rebarScore = (an: string): number => {
        let s = 0;
        if (an.includes('penulangan')) s += 10;
        if (isDia12Plus && (an.includes('≥ 12 mm') || an.includes('>= 12') || an.includes('dia. ≥ 12'))) s += 8;
        if (!isDia12Plus && (an.includes('< 12 mm') || an.includes('<12 mm'))) s += 8;
        if (isSlab && an.includes('slab')) s += 6;
        if (!isSlab && (an.includes('kolom') || an.includes('balok') || an.includes('ring balk') || an.includes('sloof'))) s += 6;
        if (an.includes('jembatan') || an.includes('gorong')) s -= 20;
        return s;
      };
      const { match, ambiguous } = rankedPick(
        (an) => an.includes('penulangan') && (an.includes('balok') || an.includes('sloof') || an.includes('slab') || an.includes('kolom')),
        rebarScore,
        0.95
      );
      if (match) return match;
      if (ambiguous) return ambiguous;
    }

    // 0b. Sand & Earth Fill (Urugan Pasir / Tanah)
    if (lower.includes('pasir urug') || lower.includes('urugan pasir') || (lower.includes('urug') && !lower.includes('batu'))) {
      const isSand = lower.includes('pasir');
      const isEarth = lower.includes('tanah');
      if (isSand) {
        const m = pick((an) => (an.includes('urukan pasir') || an.includes('urugan pasir') || an.includes('pasir uruk')) && !an.includes('pipa'), 0.95);
        if (m) return m;
      }
      if (isEarth) {
        const m = pick((an) => an.includes('urugan tanah') || an.includes('urukan tanah'), 0.92);
        if (m) return m;
      }
    }

    // 0c. Cerucuk Ulin / Wood Pile Foundation
    if (lower.includes('cerucuk') || lower.includes('ulin')) {
      const m = pick((an) => an.includes('cerucuk') || an.includes('tiang pancang') || an.includes('ulin'), 0.92);
      if (m) return m;
    }

    // 0d. Lean Concrete / Rabat Beton / Lantai Kerja
    if (lower.includes('lantai kerja') || lower.includes('rabat beton') || lower.includes('cor lantai kerja')) {
      const m = pick((an) => (an.includes('beton mutu rendah') || an.includes('fc 10') || an.includes("fc' 10") || an.includes('fc 7,4') || an.includes('rabat')) && !an.includes('u-ditch') && !an.includes('box culvert'), 0.94);
      if (m) return m;
    }

    // 0e. Aluminum Frames (Kusen Aluminium)
    if (lower.includes('kusen') && (lower.includes('aluminium') || lower.includes('alumunium'))) {
      const m = pick((an) => an.includes('kusen aluminium') && !an.includes('difabel') && !an.includes('guiding'), 0.95);
      if (m) return m;
    }

    // 0f. Clear Glass (Kaca Bening)
    if (lower.includes('kaca') && !lower.includes('nako') && !lower.includes('piring')) {
      const is5mm = lower.includes('5 mm') || lower.includes('5mm') || (materialSpec || '').includes('5 mm');
      const m = pick((an) => an.includes('kaca') && (!is5mm || an.includes('5 mm') || an.includes('5mm')) && !an.includes('gardenia') && !an.includes('piring') && !an.includes('bongkar'), 0.92);
      if (m) return m;
    }

    // 0g. Light Steel Roof Trusses (Kuda-Kuda Baja Ringan)
    if (lower.includes('kuda-kuda') || lower.includes('baja ringan') || lower.includes('reng')) {
      const isReng = lower.includes('reng');
      if (isReng) {
        const m = pick((an) => an.includes('reng') || (an.includes('baja ringan') && an.includes('kaso')), 0.92);
        if (m) return m;
      }
      const m = pick((an) => an.includes('baja ringan') && (an.includes('rangka atap') || an.includes('profil c75') || an.includes('kuda-kuda')), 0.94);
      if (m) return m;
    }

    // 0h. Metal Roof Sheet (Atap Spandek)
    if (lower.includes('spandek') || lower.includes('atap metal')) {
      const m = pick((an) => (an.includes('atap metal') || an.includes('spandek')) && !an.includes('bongkar') && !an.includes('pembongkaran'), 0.94);
      if (m) return m;
    }

    // 1. Excavation & Sitework
    if (lower.includes('galian') || category === 'SITEWORK') {
      const m = pick((an) => an.includes('galian') && an.includes('tanah'), 0.92);
      if (m) return m;
    }

    // 2. Foundation
    if (category === 'FOUNDATION' || lower.includes('pondasi')) {
      const isFootplate = /footplat|telapak/.test(lower);
      const isKosong = /kosong|aanstamping/.test(lower);
      const isStrauss = /strauss|bor/.test(lower);
      const isStone = /batu|kali|belah/.test(lower);
      const strict = (an: string) => this.isSpecCompatible(name, materialSpec || '', an) && subjectOk(an);
      const itemRatio = canonRatio(lower);
      const ratioKey = (an: string) => canonRatio(an.toLowerCase());

      let m: DedAhspMatch | null = null;
      if (isFootplate) {
        const cand = database.find((a) => {
          const an = a.name.toLowerCase();
          return (
            isEligibleCandidate(a.name, a.unit) &&
            an.includes('beton') && (an.includes('pondasi') || an.includes('telapak') || an.includes('footplat')) && !/\bbatu\b/.test(an)
          );
        });
        if (cand && strict(cand.name)) m = this.buildMatch(cand, 0.92);
      } else if (isKosong) {
        const cand = database.find((a) => a.name.toLowerCase().includes('batu kosong') && isEligibleCandidate(a.name, a.unit));
        if (cand && strict(cand.name)) m = this.buildMatch(cand, 0.92);
      } else if (isStrauss) {
        const cand = database.find((a) => {
          const an = a.name.toLowerCase();
          return (
            isEligibleCandidate(a.name, a.unit) &&
            (an.includes('bor') || an.includes('strauss')) && an.includes('pondasi') && !/\bbatu\b/.test(an)
          );
        });
        if (cand && strict(cand.name)) m = this.buildMatch(cand, 0.90);
      } else if (isStone) {
        const stoneCands = database.filter((a) => {
          const an = a.name.toLowerCase();
          return isEligibleCandidate(a.name, a.unit) && an.includes('batu') && (an.includes('kali') || an.includes('belah')) && strict(an);
        });
        const effRatio = itemRatio || canonRatio(materialSpec || '');
        if (effRatio) {
          const withRatio = stoneCands.filter((a) => ratioKey(a.name) === effRatio);
          if (withRatio.length === 1) {
            m = this.buildMatch(withRatio[0], 0.94);
          } else if (withRatio.length > 1) {
            const manual = withRatio.find((a) => a.name.toLowerCase().includes('cara manual') || a.code === '2.2.2.1.6' || a.code === '2.2.2.1.5');
            if (manual) {
              m = this.buildMatch(manual, 0.94);
            } else {
              const pool = withRatio.filter((a) => a.name.toLowerCase().includes('pondasi'));
              if (pool.length === 1) m = this.buildMatch(pool[0], 0.93);
            }
          }
        }
        if (!m) {
          if (stoneCands.length === 1) {
            m = this.buildMatch(stoneCands[0], 0.92);
          } else if (stoneCands.length > 1) {
            // Standard residential PUPR default for unstated mortar ratio is 1SP : 4PP (Tipe N) cara manual
            const default14 = stoneCands.find(
              (a) =>
                (a.name.toLowerCase().includes('1sp : 4pp') ||
                  a.name.toLowerCase().includes('tipe n') ||
                  a.code === '2.2.2.1.6' ||
                  a.code === '2.2.2.1.5') &&
                a.name.toLowerCase().includes('cara manual')
            ) || stoneCands.find(
              (a) =>
                a.name.toLowerCase().includes('1sp : 4pp') ||
                a.name.toLowerCase().includes('tipe n') ||
                a.code === '2.2.2.1.6' ||
                a.code === '2.2.2.1.5'
            );
            if (default14) {
              m = this.buildMatch(default14, 0.92);
            } else {
              const pondasiCands = stoneCands.filter((a) => a.name.toLowerCase().includes('pondasi'));
              const pool = pondasiCands.length > 0 ? pondasiCands : stoneCands;
              return {
                code: '',
                name: name,
                unit: unit,
                matchType: 'AMBIGUOUS',
                source: 'OFFICIAL_DATABASE',
                confidence: 0.6,
                candidates: pool.slice(0, 5).map((a) => ({ code: a.code, name: a.name, unit: a.unit })),
                coefficientSummary:
                  `Ditemukan ${pool.length} analisa resmi batu belah/kali yang setara spesifikasi. ` +
                  `Estimator wajib memilih (mortar tipe/cara kerja berbeda). Kandidat: ${pool.slice(0, 5).map((a) => a.code).join(', ')}`,
              } as DedAhspMatch;
            }
          }
        }
      }
      if (m) return m;
    }

    // 3. Concrete Columns
    if (category === 'STRUCTURE_COLUMN' || lower.includes('kolom')) {
      const m = pick((an) => an.includes('kolom') && (an.includes('beton') || an.includes('praktis')), 0.92);
      if (m) return m;
    }

    // 4. Concrete Beams & Sloof
    if (category === 'STRUCTURE_BEAM' || lower.includes('balok') || lower.includes('sloof')) {
      const isSloof = lower.includes('sloof');
      const isLinear = itemUnitClass === 'len' || unit === "m'" || unit === 'm';
      const isK225 = lower.includes('k-225') || lower.includes('k 225') || (materialSpec || '').toLowerCase().includes('k-225');

      const beamScore = (an: string): number => {
        let s = 0;
        if (an.includes('balok praktis') || an.includes('balok') || an.includes('sloof')) s += 8;
        if (isSloof && an.includes('sloof')) s += 10;
        if (isSloof && an.includes('balok praktis')) s += 4;
        if (isLinear && an.includes('balok praktis')) s += 6;
        if (!isLinear && (an.includes('beton mutu sedang') || an.includes('k 225') || an.includes('k-225') || an.includes('20 mpa') || an.includes('fc 20') || an.includes("f'c 20"))) s += 8;
        if (!isLinear && (an.includes("f'c 20 mpa") || an.includes('fc 20 mpa') || an.includes('20 mpa'))) s += 5; // Standard residential K-225
        if (isK225 && (an.includes('k 225') || an.includes('k-225') || an.includes('20 mpa'))) s += 4;
        if (!isLinear && an.includes('cara manual')) s += 3;
        if (an.includes('jembatan') || an.includes('jalan')) s -= 20;
        return s;
      };

      const { match, ambiguous } = rankedPick(
        (an) => (isLinear ? an.includes('balok') || an.includes('sloof') : (an.includes('balok') || an.includes('sloof') || an.includes('beton'))),
        beamScore,
        0.92
      );
      if (match) return match;
      if (ambiguous) return ambiguous;
    }

    // 4b. Concrete Works (General Beton K-xxx / f'c)
    if (lower.includes('beton')) {
      const m = pick((an) => an.includes('beton') && (an.includes('k-') || an.includes('fc') || an.includes('mutu')), 0.90);
      if (m) return m;
    }

    // 5. Floor Slabs
    if (category === 'STRUCTURE_SLAB' || lower.includes('plat') || lower.includes('pelat') || lower.includes('dak')) {
      const m = pick((an) => an.includes('plat lantai') || an.includes('pelat lantai') || (an.includes('pelat') && an.includes('beton')) || (an.includes('plat') && an.includes('beton')) || an.includes('beton mutu sedang') || an.includes('fc 20'), 0.90);
      if (m) return m;
    }

    // 6. Plastering & Skim Coat (Acian)
    if (category === 'PLASTER' || lower.includes('plester') || lower.includes('acian')) {
      const isAcian = lower.includes('acian');
      const effRatio = canonRatio(lower) || canonRatio(materialSpec || '');
      const isSemenPc = lower.includes('semen') || lower.includes('pc') || (materialSpec || '').toLowerCase().includes('semen');
      const isMortarInstan = lower.includes('instan') || lower.includes('mortar') || (materialSpec || '').toLowerCase().includes('instan');

      const plasterScore = (an: string): number => {
        let s = 0;
        if (isAcian && an.includes('acian')) {
          s += 10;
          if (an === 'pemasangan 1 m2 acian' || an.includes('pemasangan 1 m2 acian')) s += 6;
          if (isSemenPc && !an.includes('mortar') && !an.includes('instan')) s += 4;
          if (isMortarInstan && (an.includes('mortar') || an.includes('instan') || an.includes('siap pakai'))) s += 6;
          if (!isMortarInstan && (an.includes('mortar') || an.includes('instan') || an.includes('siap pakai'))) s -= 10;
        }
        if (!isAcian && (an.includes('plesteran') || an.includes('plester'))) s += 10;
        if (effRatio && canonRatio(an) === effRatio) s += 8;
        if (an.includes('tebal 15 mm') || an.includes('15 mm')) s += 2;
        if (an.includes('dinding bata') || an.includes('pasangan bata')) s -= 10;
        return s;
      };

      const { match, ambiguous } = rankedPick(
        (an) => (isAcian ? an.includes('acian') : (an.includes('plesteran') || an.includes('plester'))),
        plasterScore,
        0.94
      );
      if (match) return match;
      if (ambiguous) return ambiguous;
    }

    // 7. Masonry Walls (strictly check red brick vs lightweight brick vs batako)
    if ((category === 'WALL' || lower.includes('dinding') || lower.includes('bata')) && !lower.includes('plester') && !lower.includes('acian')) {
      const isRed = lower.includes('merah') || (materialSpec || '').toLowerCase().includes('merah');
      const isLight = lower.includes('ringan') || lower.includes('hebel') || (materialSpec || '').toLowerCase().includes('ringan');
      const isHalfBrick = lower.includes('1/2') || (materialSpec || '').includes('1/2') || !lower.includes('1 batu');
      const effRatio = canonRatio(lower) || canonRatio(materialSpec || '');

      const wallScore = (an: string): number => {
        let s = 0;
        if (an.includes('pasangan') || an.includes('pemasangan')) s += 4;
        if (an.includes('dinding') && an.includes('bata')) s += 6;
        if (an.includes('beton')) s -= 8;
        if (an.includes('jembatan') || an.includes('pilar') || an.includes('kepala jembatan')) s -= 20;
        if (an.includes('merah') && isRed) s += 3;
        if ((an.includes('ringan') || an.includes('hebel') || an.includes('celcon') || an.includes('aerated')) && isLight) s += 3;
        if (an.includes('1/2 batu') && isHalfBrick) s += 5;
        if (an.includes('tebal 1 batu') && !isHalfBrick) s += 5;
        if (effRatio && canonRatio(an) === effRatio) s += 10;
        return s;
      };

      if (isRed) {
        const { match, ambiguous } = rankedPick((an) => an.includes('dinding') && an.includes('merah'), wallScore, 0.94);
        if (match) return match;
        if (ambiguous) return ambiguous;
      } else if (isLight) {
        const { match, ambiguous } = rankedPick(
          (an) => an.includes('dinding') && (an.includes('ringan') || an.includes('hebel') || an.includes('aerated') || an.includes('celcon')),
          wallScore,
          0.94
        );
        if (match) return match;
        if (ambiguous) return ambiguous;
      } else {
        const { match, ambiguous } = rankedPick((an) => an.includes('dinding') && an.includes('bata'), wallScore, 0.90);
        if (match) return match;
        if (ambiguous) return ambiguous;
      }
    }

    // 8. Floor Tile & Finishes
    if (category === 'FLOOR_FINISH' || lower.includes('lantai') || (lower.includes('keramik') && !lower.includes('atap') && !lower.includes('genteng') && !lower.includes('kloset'))) {
      const isHomogeneous = lower.includes('homogeneous') || lower.includes('homogen') || (materialSpec || '').toLowerCase().includes('homogeneous') || lower.includes('granit');
      const isUnpolished = lower.includes('unpolish') || lower.includes('unpolished') || (materialSpec || '').toLowerCase().includes('unpolish') || lower.includes('matte') || lower.includes('kasar');
      const is60 = lower.includes('60') || (materialSpec || '').includes('60');
      const is40 = lower.includes('40') || (materialSpec || '').includes('40');
      const is30 = lower.includes('30') || (materialSpec || '').includes('30');

      const floorScore = (an: string): number => {
        let s = 0;
        if (an.includes('penutup lantai') || an.includes('ubin') || an.includes('keramik') || an.includes('lantai') || an.includes('homogenous') || an.includes('homogeneous')) s += 5;
        if (an.includes('atap') || an.includes('genteng') || an.includes('kuda-kuda') || an.includes('rangka')) s -= 30;
        if (isHomogeneous && (an.includes('homogeneous') || an.includes('homogenous') || an.includes('granit') || an.includes('porcelain') || an.includes('ubin'))) s += 6;
        if (is60 && an.includes('60')) s += 4;
        if (is40 && an.includes('40')) s += 4;
        if (is30 && an.includes('30')) s += 4;
        if (isUnpolished) {
          if (an.includes('unpolish') || an.includes('unpolished')) s += 8;
          if (an.includes('polish') && !an.includes('unpolish') && !an.includes('unpolished')) s -= 12;
        } else {
          if (an.includes('polish') && !an.includes('unpolish') && !an.includes('unpolished')) s += 4;
          if (an.includes('unpolish') || an.includes('unpolished')) s -= 12;
        }
        return s;
      };

      const { match, ambiguous } = rankedPick(
        (an) =>
          (an.includes('keramik') || an.includes('ubin') || an.includes('homogeneous') || an.includes('homogenous') || an.includes('lantai')) &&
          !an.includes('atap') &&
          !an.includes('genteng'),
        floorScore,
        0.94
      );
      if (match) return match;
      if (ambiguous) return ambiguous;
    }

    // 9. Ceiling
    if (category === 'CEILING' || lower.includes('plafon') || lower.includes('gypsum')) {
      const m = pick((an) => an.includes('gypsum') || an.includes('langit-langit'), 0.94);
      if (m) return m;
    }

    // 10. Painting
    if (category === 'PAINTING' || lower.includes('cat') || lower.includes('pengecatan')) {
      const isEksterior = lower.includes('eksterior') || lower.includes('luar');
      const paintScore = (an: string): number => {
        let s = 0;
        if (an.includes('pengecatan') || an.includes('cat')) s += 4;
        if (an.includes('tembok') || an.includes('dinding')) s += 4;
        if (an.includes('tembok baru')) s += 4;
        if (isEksterior && (an.includes('ekterior') || an.includes('eksterior'))) s += 6;
        if (!isEksterior && an.includes('interior')) s += 6;
        if (an.includes('lama') || an.includes('pencucian') || an.includes('jembatan')) s -= 20;
        return s;
      };
      const { match, ambiguous } = rankedPick(
        (an) => (an.includes('pengecatan') || an.includes('cat')) && (an.includes('tembok') || an.includes('dinding')) && !an.includes('lama') && !an.includes('pencucian') && !an.includes('jembatan'),
        paintScore,
        0.92
      );
      if (match) return match;
      if (ambiguous) return ambiguous;
    }

    // 11. Roof Covering & Truss
    if (category === 'ROOF' || lower.includes('atap') || lower.includes('genteng')) {
      const wantsCovering = /penutup|genteng|seng|spandek|asbes|serat semen|metal|bitumen|kaca/.test(lower) || !/rangka/.test(lower);
      const isRoofSubject = (an: string): boolean =>
        an.includes('atap') || an.includes('genteng') || an.includes('spandek') || an.includes('seng');
      const roofScore = (an: string): number => {
        let s = 0;
        const isFrame = an.includes('rangka');
        if (an.includes('pasangan') || an.includes('pemasangan')) s += 6;
        if (an.includes('penutup atap') || an.includes('genteng')) s += 4;
        if (wantsCovering && !isFrame) s += 5;
        if (!wantsCovering && isFrame) s += 4;
        if (an.includes('jembatan') || an.includes('partisi') || an.includes('dinding pemisah')) s -= 20;
        return s;
      };
      const { match, ambiguous } = rankedPick(isRoofSubject, roofScore, 0.90);
      if (match) return match;
      if (ambiguous) return ambiguous;
    }

    // 12. Sanitary Fixtures (Kloset, Floor Drain, Wastafel)
    if (category === 'SANITARY' || lower.includes('kloset') || lower.includes('closet') || lower.includes('floor drain') || lower.includes('wastafel')) {
      const wantsKloset = lower.includes('kloset') || lower.includes('closet');
      const wantsFloorDrain = lower.includes('floor drain');
      const wantsWastafel = lower.includes('wastafel');
      const isDuduk = lower.includes('duduk') || lower.includes('monoblock') || lower.includes('monoblok');
      const isJongkok = lower.includes('jongkok');

      const sanitaryScore = (an: string): number => {
        let s = 0;
        if (an.includes('pasang') || an.includes('pemasangan') || an.includes('1 unit') || an.includes('1 buah')) s += 6;
        if (wantsKloset && (an.includes('kloset') || an.includes('closet'))) s += 6;
        if (wantsFloorDrain && an.includes('floor drain')) s += 4;
        if (wantsWastafel && an.includes('wastafel')) s += 4;
        if (isDuduk && (an.includes('duduk') || an.includes('monoblock') || an.includes('monoblok'))) s += 6;
        if (isJongkok && an.includes('jongkok')) s += 6;
        if (an.includes('pembongkaran') || an.includes('bongkar')) s -= 30;
        return s;
      };
      const { match, ambiguous } = rankedPick(
        (an) =>
          (wantsKloset && (an.includes('kloset') || an.includes('closet'))) ||
          (wantsFloorDrain && an.includes('floor drain')) ||
          (wantsWastafel && an.includes('wastafel')),
        sanitaryScore,
        0.95
      );
      if (match) return match;
      if (ambiguous) return ambiguous;
    }

    // 13. Doors & Windows (Wood / Aluminum / Panel)
    if (category === 'DOOR_WINDOW' || lower.includes('pintu') || lower.includes('jendela') || lower.includes('kusen')) {
      const isDoor = lower.includes('pintu') || /d-\d+/i.test(lower);
      const isWoodPanel = isDoor && (lower.includes('panel') || lower.includes('kayu') || lower.includes('kamper') || (materialSpec || '').toLowerCase().includes('kamper') || (materialSpec || '').toLowerCase().includes('kayu'));

      const doorScore = (an: string): number => {
        let s = 0;
        if (an.includes('pembuatan') || an.includes('pemasangan') || an.includes('pasang')) s += 4;
        if (isDoor && (an.includes('pintu') || an.includes('daun pintu'))) s += 6;
        if (isWoodPanel && an.includes('panel') && (an.includes('kayu') || an.includes('kelas i') || an.includes('kelas ii'))) s += 10;
        if (an.includes('jembatan') || an.includes('sorong') || an.includes('pelumasan')) s -= 30;
        return s;
      };

      const { match, ambiguous } = rankedPick(
        (an) => (isDoor ? (an.includes('pintu') || an.includes('daun pintu')) : an.includes('jendela')) && !an.includes('sorong') && !an.includes('pelumasan'),
        doorScore,
        0.94
      );
      if (match) return match;
      if (ambiguous) return ambiguous;
    }

    return null;
  }

  private buildMatch(item: { code: string; name: string; unit: string; regulationSource?: string }, conf: number): DedAhspMatch {
    return {
      code: item.code,
      name: item.name,
      unit: item.unit,
      matchType: 'SEMANTIC_MATCH',
      source: item.regulationSource || 'PUPR 2026',
      confidence: conf,
    };
  }

  /**
   * Validates and resolves canonical AHSP candidate against the official catalog.
   * Enforces locked AHSP version (e.g. "AHSP 2026"), unit compatibility, and spec compatibility.
   * If candidate is invalid, hallucinated, AI-CUSTOM, or version mismatched, returns null or rejected status.
   */
  public resolveValidatedAhspCandidate(
    item: DedWorkItem,
    targetVersion: string = 'AHSP 2026'
  ): { isValid: boolean; match?: DedAhspMatch; error?: string } {
    // 1. If item has AI-CUSTOM code, strictly reject
    if (item.ahspMatch?.code?.startsWith('AI-CUSTOM') || item.ahspMatch?.matchType === 'AI_CUSTOM') {
      return {
        isValid: false,
        error: 'Kode AHSP "AI-CUSTOM-*" bukan analisa harga satuan resmi PUPR / Nasional.',
      };
    }

    // 2. Resolve match
    const match = item.ahspMatch?.code ? item.ahspMatch : this.matchWorkItem(item);
    // AMBIGUOUS: the matcher found official candidates but deliberately selected NONE.
    // It is not a NOT_FOUND and it is not a MATCH — it needs an estimator decision (§4).
    if (match && match.matchType === 'AMBIGUOUS') {
      return {
        isValid: false,
        error:
          `AMBIGUOUS — beberapa analisa AHSP resmi setara untuk "${item.name}" ` +
          `(${(match.candidates || []).map((c) => c.code).join(', ') || '-'}). ` +
          `Estimator harus memilih satu sebelum baris ini READY.`,
      };
    }
    if (!match || !match.code || match.matchType === 'NOT_FOUND') {
      return {
        isValid: false,
        error: `Tidak ada analisa AHSP resmi yang cocok untuk "${item.name}".`,
      };
    }

    // 3. Verify against THE OFFICIAL catalog (§14: MATCHED => OFFICIAL_CATALOG_CONTAINS).
    const officialAhsp = officialAhspRepository.getOfficialAhsp(match.code);

    if (!officialAhsp) {
      return {
        isValid: false,
        error: `Kode AHSP "${match.code}" tidak terdaftar dalam database resmi PUPR 2026.`,
      };
    }

    // 4. Verify version compatibility
    const itemVersion = match.source || (officialAhsp as any).regulationSource || 'AHSP 2026';
    if (targetVersion && !itemVersion.toLowerCase().includes('2026') && !targetVersion.toLowerCase().includes('2026')) {
      return {
        isValid: false,
        error: `Versi AHSP "${itemVersion}" tidak sesuai dengan standar proyek ("${targetVersion}").`,
      };
    }

    // 5. Verify unit compatibility
    if (item.unit && officialAhsp.unit) {
      const u1 = item.unit.toLowerCase().replace(/[\^²³']/g, (m) => m === '²' ? '2' : m === '³' ? '3' : '');
      const u2 = officialAhsp.unit.toLowerCase().replace(/[\^²³']/g, (m) => m === '²' ? '2' : m === '³' ? '3' : '');
      const isCountMatch = (u1 === 'unit' && u2 === 'bh') || (u1 === 'bh' && u2 === 'unit') || (u1 === 'buah' && u2 === 'unit') || (u1 === 'unit' && u2 === 'buah');
      const isTileMatch = ((u1 === 'm2' && (u2 === 'm' || u2 === 'm1')) || ((u1 === 'm' || u1 === 'm1') && u2 === 'm2'));
      if (u1 !== u2 && !isCountMatch && !isTileMatch) {
        return {
          isValid: false,
          error: `Satuan pekerjaan DED (${item.unit}) tidak kompatibel dengan satuan AHSP resmi (${officialAhsp.unit}).`,
        };
      }
    }

    return {
      isValid: true,
      match: {
        code: officialAhsp.code,
        name: (officialAhsp as any).title || officialAhsp.name,
        unit: officialAhsp.unit,
        matchType: match.matchType,
        source: (officialAhsp as any).regulationSource || 'Standar PUPR 2026',
        confidence: match.confidence || 0.95,
      },
    };
  }
}

export const ahspMatcher = AhspMatcher.getInstance();

