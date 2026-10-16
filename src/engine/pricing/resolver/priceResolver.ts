/**
 * EZRAB PRICING DOMAIN — RESOLVER
 * Deterministic resolution pipeline for unit prices with context filtering.
 */

import {
  PriceContext,
  PriceDefinition,
  PriceItemQuery,
  PriceResolutionCandidate,
  PriceResolutionResult,
  ResolvedPrice,
  ResolvedPriceStatus,
  ResolvedPriceSource,
} from '../contracts/types';
import { PriceNormalizationEngine } from '../normalization/priceNormalization';
import { PriceRepository } from '../repository/priceRepository';
import { projectPriceEngine } from '../projectPriceEngine';
// PHASE 1 (audit §16): unit guard is WARNING-ONLY. Nothing is rejected; conflicts are recorded.
import { recordPriceWarning, exposePriceWarnings } from '../telemetry/priceResolutionWarnings';
import { priceSanityValidator } from '../canonical/priceSanityValidator';

exposePriceWarnings();

export class PriceResolver {
  private repository: PriceRepository;

  constructor(repository: PriceRepository = PriceRepository.getInstance()) {
    this.repository = repository;
  }

  /**
   * Resolve an authoritative price item for a given query and context with full candidate breakdown.
   */
  public resolve(query: PriceItemQuery | string, context?: PriceContext): PriceResolutionResult {
    const qObj: PriceItemQuery = typeof query === 'string' ? { code: query, name: query } : query;
    const projectId = qObj.projectId || context?.projectId;
    const region = qObj.location || context?.location;

    if (!qObj.code && !qObj.name) {
      return {
        status: 'PRICE_NOT_CONFIGURED',
        query: qObj,
        error: 'Empty price query provided.',
        confidence: 0,
        explanation: 'Kueri harga kosong.',
      };
    }

    // 1. TIER 1: Project-Specific Price Override / Project Price (Active Project)
    if (projectId && (qObj.code || qObj.name)) {
      const normCode = qObj.code ? PriceNormalizationEngine.normalizeCode(qObj.code) : '';
      const normName = qObj.name ? PriceNormalizationEngine.normalizeText(qObj.name) : '';
      const normUnit = qObj.unit ? PriceNormalizationEngine.normalizeUnit(qObj.unit) : '';
      const lookupKey = normCode || normName;

      // 1A. Check Active Override First
      const override = projectPriceEngine.getProjectOverride(projectId, lookupKey);
      if (override && override.active) {
        const candidate: import('../contracts/types').PriceCandidate = {
          id: override.id,
          price: override.price,
          unit: override.unit,
          source: 'PROJECT',
          sourceName: `Override Harga Proyek (${projectId})`,
          observedDate: override.createdAt.split('T')[0],
          region,
          confidence: 1.0,
          matchType: 'EXACT',
          isConfirmed: true,
          notes: override.reason,
        };
        const def: PriceDefinition = {
          id: override.id,
          code: override.materialCode || lookupKey,
          codeNormalized: lookupKey,
          name: override.materialName || lookupKey,
          category: 'MATERIAL',
          unit: override.unit,
          price: override.price,
          priceSource: 'PROJECT',
          periodVersion: '2026.1',
          effectiveDate: override.createdAt.split('T')[0],
          location: region || 'Indonesia',
          provenance: {
            sourceName: `Override Proyek ${projectId}`,
            location: region || 'Indonesia',
            periodVersion: '2026.1',
            effectiveDate: override.createdAt.split('T')[0],
            confidenceScore: 1.0,
          },
        };
        return {
          status: 'EXACT_MATCH',
          query: qObj,
          resolvedPrice: def,
          selectedCandidate: candidate,
          priceCandidates: [candidate],
          confidence: 1.0,
          explanation: `Ditemukan harga khusus proyek ${projectId} untuk ${def.name}`,
        };
      }

      // 1B. Check Project Material Price
      const projPrice = projectPriceEngine.getProjectPrice(projectId, lookupKey);
      if (projPrice && !projectPriceEngine.isPriceExpired(projPrice.validUntil)) {
        const candidate: import('../contracts/types').PriceCandidate = {
          id: projPrice.id,
          price: projPrice.price,
          unit: projPrice.unit,
          source: 'PROJECT',
          sourceName: projPrice.supplierName || `Harga Khusus Proyek (${projectId})`,
          observedDate: projPrice.effectiveDate || new Date().toISOString().split('T')[0],
          region: projPrice.region || region,
          confidence: 1.0,
          matchType: 'EXACT',
          isConfirmed: true,
          notes: projPrice.notes || 'Harga khusus penawaran proyek.',
        };
        const def: PriceDefinition = {
          id: projPrice.id,
          code: projPrice.materialCode || lookupKey,
          codeNormalized: lookupKey,
          name: projPrice.materialName || lookupKey,
          category: 'MATERIAL',
          unit: projPrice.unit,
          price: projPrice.price,
          priceSource: 'PROJECT',
          periodVersion: '2026.1',
          effectiveDate: projPrice.effectiveDate || new Date().toISOString().split('T')[0],
          location: projPrice.region || region || 'Indonesia',
          provenance: {
            sourceName: projPrice.supplierName || `Harga Proyek ${projectId}`,
            location: projPrice.region || region || 'Indonesia',
            periodVersion: '2026.1',
            effectiveDate: projPrice.effectiveDate || new Date().toISOString().split('T')[0],
            confidenceScore: 1.0,
          },
        };
        return {
          status: 'EXACT_MATCH',
          query: qObj,
          resolvedPrice: def,
          selectedCandidate: candidate,
          priceCandidates: [candidate],
          confidence: 1.0,
          explanation: `Ditemukan harga khusus proyek ${projectId} untuk ${def.name}`,
        };
      }

      // 1C. Repository project prices fallback
      const projectOverrides = this.repository.getProjectPrices(projectId);
      if (projectOverrides.length > 0) {
        const projectHit = projectOverrides.find((p) => {
          if (normCode && p.codeNormalized === normCode) return true;
          const pName = PriceNormalizationEngine.normalizeText(p.name);
          const pUnit = PriceNormalizationEngine.normalizeUnit(p.unit);
          return pName === normName && (!normUnit || pUnit === normUnit);
        });

        if (projectHit) {
          const candidate: import('../contracts/types').PriceCandidate = {
            id: projectHit.id,
            price: projectHit.price,
            unit: projectHit.unit,
            source: 'PROJECT',
            sourceName: `Harga Khusus Proyek (${projectId})`,
            observedDate: projectHit.effectiveDate || new Date().toISOString().split('T')[0],
            region: projectHit.location,
            specification: projectHit.specification,
            brand: projectHit.brand,
            confidence: 1.0,
            matchType: 'EXACT',
            isConfirmed: true,
            notes: 'Harga khusus proyek yang telah dikonfirmasi.',
          };

          return {
            status: 'EXACT_MATCH',
            query: qObj,
            resolvedPrice: projectHit,
            selectedCandidate: candidate,
            priceCandidates: [candidate],
            confidence: 1.0,
            explanation: `Ditemukan harga khusus proyek ${projectId} untuk ${projectHit.name}`,
          };
        }
      }
    }

    // 2. TIER 2: Exact item code match in Master DB
    if (qObj.code) {
      const normCode = PriceNormalizationEngine.normalizeCode(qObj.code);

      // Phase 3D: Detect ambiguous codes before returning EXACT_MATCH.
      // If multiple variants share the code and no variant ID was provided,
      // return AMBIGUOUS instead of silently picking last-registered (Map overwrite).
      if (!qObj.id) {
        const allMatches = this.repository.getAllByCode(normCode);
        if (allMatches.length > 1) {
          return {
            status: 'AMBIGUOUS',
            query: qObj,
            error: `Kode "${qObj.code}" cocok dengan ${allMatches.length} varian harga. Sertakan ID varian untuk memilih.`,
            priceCandidates: allMatches.map(m => ({
              id: m.id,
              price: m.price,
              unit: m.unit,
              source: 'EZRAB_DATABASE' as const,
              sourceName: m.priceSource,
              observedDate: m.effectiveDate,
              region: m.location,
              confidence: 0.5,
              matchType: 'AMBIGUOUS' as const,
              isConfirmed: false,
              notes: `Kandidat ambigu untuk kode ${qObj.code}: ${m.name}`,
            })),
            warnings: [
              `AMBIGUOUS_PRICE_CODE: ${allMatches.length} varian untuk kode "${qObj.code}". Tidak ada harga yang dipilih.`,
            ],
            confidence: 0,
            explanation: `Kode ambigu: ${allMatches.length} varian ditemukan, tidak ada yang dipilih otomatis.`,
          };
        }
      }

      // Phase 3D: If variant ID provided, resolve by ID and validate code match.
      if (qObj.id) {
        const byId = this.repository.getAllMasterPrices().find(p => p.id === qObj.id);
        if (byId) {
          const byIdNormCode = PriceNormalizationEngine.normalizeCode(byId.codeNormalized || byId.code);
          if (byIdNormCode !== normCode) {
            return {
              status: 'PRICE_NOT_FOUND',
              query: qObj,
              error: `ID varian "${qObj.id}" tidak cocok dengan kode "${qObj.code}". Harga tidak diresolve.`,
              warnings: [`ID_CODE_MISMATCH: ID ${qObj.id} tidak cocok dengan kode ${qObj.code}`],
            };
          }
          // ID valid and code matches - use this specific variant
          const candidate: import('../contracts/types').PriceCandidate = {
            id: byId.id,
            price: byId.price,
            unit: byId.unit,
            source: byId.priceSource.includes('SE') || byId.priceSource.includes('PUPR') ? 'REGIONAL' : 'EZRAB_DATABASE',
            sourceName: byId.provenance?.sourceName || byId.priceSource,
            observedDate: byId.effectiveDate,
            region: byId.location,
            specification: byId.specification,
            brand: byId.brand,
            confidence: byId.provenance?.confidenceScore || 0.95,
            matchType: 'EXACT',
            isConfirmed: true,
            notes: 'Kecocokan ID varian eksak di Master Database.',
          };
          return {
            status: 'EXACT_MATCH',
            query: qObj,
            resolvedPrice: byId,
            selectedCandidate: candidate,
            priceCandidates: [candidate],
            confidence: candidate.confidence,
            explanation: `Kecocokan ID varian: [${byId.code}] ${byId.name}`,
          };
        }
        // ID provided but not found - do NOT fall through to code lookup
        // as that could return the wrong variant's price
        return {
          status: 'PRICE_NOT_FOUND',
          query: qObj,
          error: `ID varian "${qObj.id}" tidak ditemukan. Harga tidak diresolve.`,
        };
      }

      const exactMatch = this.repository.getByCode(normCode, projectId);
      if (exactMatch) {
        const candidate: import('../contracts/types').PriceCandidate = {
          id: exactMatch.id,
          price: exactMatch.price,
          unit: exactMatch.unit,
          source: exactMatch.priceSource.includes('SE') || exactMatch.priceSource.includes('PUPR') ? 'REGIONAL' : 'EZRAB_DATABASE',
          sourceName: exactMatch.provenance?.sourceName || exactMatch.priceSource,
          observedDate: exactMatch.effectiveDate,
          region: exactMatch.location,
          specification: exactMatch.specification,
          brand: exactMatch.brand,
          confidence: exactMatch.provenance?.confidenceScore || 0.95,
          matchType: 'EXACT',
          isConfirmed: true,
          notes: 'Kecocokan kode eksak di Master Database EZRAB / HSD.',
        };

        return {
          status: 'EXACT_MATCH',
          query: qObj,
          resolvedPrice: exactMatch,
          selectedCandidate: candidate,
          priceCandidates: [candidate],
          confidence: candidate.confidence,
          explanation: `Kecocokan kode eksak: [${exactMatch.code}] ${exactMatch.name}`,
        };
      }
    }

    // 3. TIER 3: Exact normalized name match + specification + brand + unit match
    const allPrices = this.repository.getAllMasterPrices();
    const normalizedNameQuery = PriceNormalizationEngine.normalizeText(qObj.name || '');
    const normalizedUnitQuery = qObj.unit ? PriceNormalizationEngine.normalizeUnit(qObj.unit) : '';
    const normSpecQuery = qObj.specification ? PriceNormalizationEngine.normalizeText(qObj.specification) : '';
    const normBrandQuery = qObj.brand ? PriceNormalizationEngine.normalizeText(qObj.brand) : '';

    if (!normalizedNameQuery) {
      return {
        status: 'PRICE_NOT_FOUND',
        query: qObj,
        error: `Price for code "${qObj.code}" not found.`,
        confidence: 0,
        explanation: 'Nama item tidak valid untuk pencarian.',
      };
    }

    const exactNameMatches: PriceDefinition[] = [];
    const partialCandidates: PriceResolutionCandidate[] = [];
    const allCandidates: import('../contracts/types').PriceCandidate[] = [];

    for (const p of allPrices) {
      if (qObj.category && p.category !== qObj.category) continue;

      const normPName = PriceNormalizationEngine.normalizeText(p.name);
      const normPUnit = PriceNormalizationEngine.normalizeUnit(p.unit);
      const normPSpec = p.specification ? PriceNormalizationEngine.normalizeText(p.specification) : '';
      const normPBrand = p.brand ? PriceNormalizationEngine.normalizeText(p.brand) : '';

      // Check exact name
      if (normPName === normalizedNameQuery) {
        if (!normalizedUnitQuery || normPUnit === normalizedUnitQuery) {
          exactNameMatches.push(p);

          let score = 95;
          if (normSpecQuery && normPSpec && normPSpec.includes(normSpecQuery)) score += 4;
          if (normBrandQuery && normPBrand && normPBrand.includes(normBrandQuery)) score += 1;

          allCandidates.push({
            id: p.id,
            price: p.price,
            unit: p.unit,
            source: 'EZRAB_DATABASE',
            sourceName: p.provenance?.sourceName || p.priceSource,
            observedDate: p.effectiveDate,
            region: p.location,
            specification: p.specification,
            brand: p.brand,
            confidence: Math.min(1.0, score / 100),
            matchType: 'EXACT',
            notes: `Nama identik di master database (${p.priceSource})`,
          });
          continue;
        }
      }

      // Check keyword overlap and similarity
      if (normPName.includes(normalizedNameQuery) || normalizedNameQuery.includes(normPName)) {
        // UNIT GATE (fail-closed): a name-containment match whose unit is
        // incompatible with the requested unit is recorded as a UNIT_MISMATCH
        // warning but is NEVER a resolution candidate. Multiplying it silently
        // misprices (the zak/kg defect that underpriced cement roughly 42x).
        // It stays visible in `allCandidates` for transparency, but cannot
        // become resolvedPrice.
        const unitMismatch = !!normalizedUnitQuery && normPUnit !== normalizedUnitQuery;
        if (unitMismatch) {
          recordPriceWarning({
            kind: 'UNIT_MISMATCH',
            queryName: qObj.name || qObj.code || '',
            queryUnit: qObj.unit,
            candidateName: p.name,
            candidateUnit: p.unit,
            price: p.price,
            sourceName: p.provenance?.sourceName || p.priceSource,
            region: p.location,
            notes: `Satuan permintaan "${qObj.unit}" tidak sama dengan satuan kandidat "${p.unit}". Kandidat ditolak dari resolusi — harga tidak diisi, bukan Rp0.`,
          });
        }

        let matchScore = 80;
        if (normSpecQuery && normPSpec.includes(normSpecQuery)) matchScore += 10;
        if (normBrandQuery && normPBrand.includes(normBrandQuery)) matchScore += 5;
        if (normalizedUnitQuery && normPUnit === normalizedUnitQuery) matchScore += 5;

        if (!unitMismatch) {
          partialCandidates.push({
            price: p,
            matchScore,
            matchReason: 'Substring name match with specification overlap',
          });
        }

        allCandidates.push({
          id: p.id,
          price: p.price,
          unit: p.unit,
          source: 'SIMILAR_ITEM',
          sourceName: p.provenance?.sourceName || p.priceSource,
          observedDate: p.effectiveDate,
          region: p.location,
          specification: p.specification,
          brand: p.brand,
          confidence: matchScore / 100,
          matchType: 'SIMILAR',
          notes: `Item mirip berdasarkan nama dan spesifikasi (${matchScore}% match)`,
        });
      } else {
        const queryTerms = normalizedNameQuery.split(' ').filter((w) => w.length > 2);
        const matchCount = queryTerms.filter((w) => normPName.includes(w)).length;
        if (queryTerms.length > 0 && (matchCount >= Math.ceil(queryTerms.length * 0.5) || matchCount >= 1)) {
          const ratio = matchCount / queryTerms.length;
          // PHASE 1 warning (audit C-05): the candidate shares only keywords, never the full
          // name. This is how `includes('Air')` prices any material containing "air".
          recordPriceWarning({
            kind: 'SUBSTRING_ONLY_MATCH',
            queryName: qObj.name || qObj.code || '',
            queryUnit: qObj.unit,
            candidateName: p.name,
            candidateUnit: p.unit,
            price: p.price,
            sourceName: p.provenance?.sourceName || p.priceSource,
            region: p.location,
            notes: `Hanya ${matchCount}/${queryTerms.length} kata kunci cocok; nama lengkap tidak pernah cocok.`,
          });
          // UNIT GATE (fail-closed): same rule as the containment branch above —
          // a keyword-only match with an incompatible unit is warned about but
          // never becomes a resolution candidate.
          const kwUnitMismatch = !!normalizedUnitQuery && normPUnit !== normalizedUnitQuery;
          if (kwUnitMismatch) {
            recordPriceWarning({
              kind: 'UNIT_MISMATCH',
              queryName: qObj.name || qObj.code || '',
              queryUnit: qObj.unit,
              candidateName: p.name,
              candidateUnit: p.unit,
              price: p.price,
              sourceName: p.provenance?.sourceName || p.priceSource,
              region: p.location,
              notes: `Satuan permintaan "${qObj.unit}" tidak sama dengan satuan kandidat "${p.unit}" (pencocokan kata kunci). Kandidat ditolak dari resolusi.`,
            });
          }
          const termScore = Math.round(40 + ratio * 45);
          if (!kwUnitMismatch) {
            partialCandidates.push({
              price: p,
              matchScore: termScore,
              matchReason: `Matched ${matchCount}/${queryTerms.length} keyword terms`,
            });
          }

          allCandidates.push({
            id: p.id,
            price: p.price,
            unit: p.unit,
            source: 'SIMILAR_ITEM',
            sourceName: p.provenance?.sourceName || p.priceSource,
            observedDate: p.effectiveDate,
            region: p.location,
            specification: p.specification,
            brand: p.brand,
            confidence: termScore / 100,
            matchType: 'SIMILAR',
            notes: `Kemiripan kata kunci (${matchCount}/${queryTerms.length} kata cocok: ${p.name})`,
          });
        }
      }
    }

    // Compute price range helper if candidates exist
    const computeRange = (prices: number[]) => {
      if (prices.length === 0) return undefined;
      const sorted = [...prices].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      return { min, max, median };
    };

    if (exactNameMatches.length === 1) {
      const match = exactNameMatches[0];
      const candidate = allCandidates.find((c) => c.id === match.id) || {
        id: match.id,
        price: match.price,
        unit: match.unit,
        source: 'EZRAB_DATABASE' as const,
        sourceName: match.provenance?.sourceName || match.priceSource,
        observedDate: match.effectiveDate,
        region: match.location,
        specification: match.specification,
        brand: match.brand,
        confidence: 0.95,
        matchType: 'EXACT' as const,
      };

      return {
        status: 'NORMALIZED_MATCH',
        query: qObj,
        resolvedPrice: match,
        selectedCandidate: candidate,
        priceCandidates: allCandidates,
        confidence: 0.95,
        explanation: `Ditemukan kecocokan nama di database: ${match.name} (Rp ${match.price.toLocaleString('id-ID')}/${match.unit})`,
      };
    }

    if (exactNameMatches.length > 1) {
      allCandidates.sort((a, b) => b.confidence - a.confidence);
      const prices = exactNameMatches.map((p) => p.price);
      const best = exactNameMatches[0];
      return {
        status: 'CONTEXTUAL_MATCH',
        query: qObj,
        resolvedPrice: best,
        candidates: exactNameMatches.map((p) => ({
          price: p,
          matchScore: 100,
          matchReason: 'Identical normalized name across multiple sources/suppliers',
        })),
        priceCandidates: allCandidates,
        selectedCandidate: allCandidates[0],
        priceRange: computeRange(prices),
        confidence: 0.90,
        warnings: ['Ditemukan beberapa entri harga dengan nama identik di database.'],
        explanation: `Ditemukan ${exactNameMatches.length} varian harga di database untuk nama yang sama. Pilihan terbaik: ${best.name} (Rp ${best.price.toLocaleString('id-ID')}/${best.unit})`,
      };
    }

    if (partialCandidates.length === 1 && partialCandidates[0].matchScore >= 75) {
      const single = partialCandidates[0].price;
      const candidate = allCandidates.find((c) => c.id === single.id);
      return {
        status: 'NORMALIZED_MATCH',
        query: qObj,
        resolvedPrice: single,
        selectedCandidate: candidate,
        priceCandidates: allCandidates,
        confidence: partialCandidates[0].matchScore / 100,
        explanation: `Kecocokan mendekati sempurna: ${single.name}`,
      };
    }

    if (partialCandidates.length > 0) {
      partialCandidates.sort((a, b) => b.matchScore - a.matchScore);
      allCandidates.sort((a, b) => b.confidence - a.confidence);
      const prices = partialCandidates.slice(0, 10).map((c) => c.price.price);
      const topMatch = partialCandidates[0];
      const isStrong = topMatch.matchScore >= 65;

      return {
        status: isStrong ? 'CONTEXTUAL_MATCH' : 'AMBIGUOUS',
        query: qObj,
        resolvedPrice: topMatch.price,
        candidates: partialCandidates.slice(0, 10),
        priceCandidates: allCandidates.slice(0, 10),
        selectedCandidate: allCandidates[0],
        priceRange: computeRange(prices),
        confidence: topMatch.matchScore / 100,
        warnings: [`Ditemukan ${partialCandidates.length} referensi harga mirip di database.`],
        explanation: `Kecocokan item mirip (${topMatch.matchScore}%): [${topMatch.price.code}] ${topMatch.price.name}`,
      };
    }

    // 4. Fallback: No candidate in database
    return {
      status: 'PRICE_NOT_FOUND',
      query: qObj,
      error: `No authoritative price found for "${qObj.name || qObj.code}".`,
      confidence: 0,
      priceCandidates: [],
      explanation: 'Harga satuan tidak ditemukan di database EZRAB maupun HSD.',
    };
  }

  /**
   * Production-grade Resolution Engine for Project Price & Override System:
   * Resolves harga dengan urutan prioritas:
   * 1. Project Override (active, matching projectId)
   * 2. Project Price (active, matching projectId, not expired)
   * 3. Project Historical Price (matching projectId)
   * 4. EZRAB Material Reference (Master DB exact code or normalized name)
   * 5. Regional Reference (provincial index)
   * 6. AHSP Component Price (PUPR / SE DJBK)
   * 7. External Reference (candidate only)
   * 8. Manual Input
   * 9. PRICE_NOT_FOUND (strict fail-closed, anti-hallucination)
   *
   * Menghasilkan ResolvedPrice lengkap dengan perbandingan harga acuan, harga proyek, override, dan selisih (variansi).
   */
  public resolvePrice(query: PriceItemQuery | string, context?: PriceContext): ResolvedPrice {
    const qObj: PriceItemQuery = typeof query === 'string' ? { code: query, name: query } : query;
    const projectId = qObj.projectId || context?.projectId;
    const location = qObj.location || context?.location;
    const revisionId = context?.revisionId;

    const normCode = qObj.code ? PriceNormalizationEngine.normalizeCode(qObj.code) : '';
    const normName = qObj.name ? PriceNormalizationEngine.normalizeText(qObj.name) : '';

    // STEP A: Fetch Baseline Reference Price (National / Master DB)
    // Never polluted by project prices
    let refItem: PriceDefinition | undefined = undefined;
    let refWarnings: string[] = [];
    if (normCode) {
      // Phase 3D: Check for ambiguity before using code lookup for reference.
      // If ambiguous, do NOT silently use last-registered; leave unresolved
      // unless a valid variant ID was provided.
      if (qObj.id) {
        const byId = this.repository.getAllMasterPrices().find(p => p.id === qObj.id);
        if (byId) {
          const byIdNorm = PriceNormalizationEngine.normalizeCode(byId.codeNormalized || byId.code);
          if (byIdNorm === normCode) {
            refItem = byId;
          } else {
            refWarnings.push(`ID_CODE_MISMATCH: ID ${qObj.id} tidak cocok dengan kode ${qObj.code} pada referensi baseline.`);
          }
        } else {
          refWarnings.push(`ID_NOT_FOUND: ID varian ${qObj.id} tidak ditemukan pada referensi baseline.`);
        }
      } else if (this.repository.isCodeAmbiguous(normCode)) {
        refWarnings.push(`AMBIGUOUS_REFERENCE_CODE: Kode "${qObj.code}" cocok dengan beberapa varian; referensi baseline tidak diresolve otomatis.`);
        // refItem stays undefined - do NOT fall through to name fallback
        // as that could return a different variant's price
      } else {
        refItem = this.repository.getByCode(normCode, undefined);
      }
    }
    if (!refItem && normName && refWarnings.length === 0) {
      const allMaster = this.repository.getAllMasterPrices();
      const normUnit = qObj.unit ? PriceNormalizationEngine.normalizeUnit(qObj.unit) : '';
      refItem = allMaster.find((p) => {
        const pNormName = PriceNormalizationEngine.normalizeText(p.name);
        const pNormUnit = PriceNormalizationEngine.normalizeUnit(p.unit);
        return pNormName === normName && (!normUnit || pNormUnit === normUnit);
      });
      if (!refItem) {
        refItem = allMaster.find((p) => PriceNormalizationEngine.normalizeText(p.name) === normName);
      }
    }

    const refPrice = refItem ? refItem.price : undefined;
    const refUnit = refItem ? refItem.unit : (qObj.unit || 'unit');
    const itemName = refItem?.name || qObj.name || qObj.code || 'Item';
    const itemCode = refItem?.code || qObj.code || normCode;

    // STEP B: Check Locked Revision (Test 5)
    if (projectId && revisionId) {
      const lockedRev = projectPriceEngine.getLockedRevision(projectId, revisionId);
      if (lockedRev) {
        const lockedItem = lockedRev.items.find(
          (i) =>
            (normCode && PriceNormalizationEngine.normalizeCode(i.materialId) === normCode) ||
            (normCode && i.materialCode && PriceNormalizationEngine.normalizeCode(i.materialCode) === normCode) ||
            (normName && i.materialName && PriceNormalizationEngine.normalizeText(i.materialName) === normName)
        );
        if (lockedItem) {
          const varianceAmount = refPrice !== undefined ? lockedItem.price - refPrice : 0;
          const variancePercent = refPrice ? Number(((varianceAmount / refPrice) * 100).toFixed(2)) : 0;
          return {
            materialId: lockedItem.materialId,
            materialCode: lockedItem.materialCode || itemCode,
            materialName: lockedItem.materialName || itemName,
            projectId,
            price: lockedItem.price,
            unit: lockedItem.unit,
            source: lockedItem.source,
            status: 'LOCKED',
            sourceName: `Revisi Terkunci (${lockedRev.revisionTitle || lockedRev.revisionId})`,
            isFinal: true,
            isLocked: true,
            revisionId,
            confidence: 1.0,
            referencePrice: refPrice,
            varianceAmount,
            variancePercent,
            explanation: `Harga terkunci pada revisi ${revisionId} oleh ${lockedRev.lockedBy} pada ${lockedRev.lockedAt}.`,
            provenance: {
              referenceId: lockedRev.revisionId,
              createdBy: lockedRev.lockedBy,
              createdAt: lockedRev.lockedAt,
              notes: 'Harga terkunci tidak berubah saat harga proyek atau acuan diperbarui.',
            },
          };
        }
      }
    }

    // STEP C: Check Project Prices & Overrides
    let projectPriceObj: import('../contracts/types').ProjectMaterialPrice | undefined = undefined;
    let overrideObj: import('../contracts/types').ProjectPriceOverride | undefined = undefined;

    if (projectId) {
      const keysToCheck = [
        normCode,
        normName,
        refItem?.id ? PriceNormalizationEngine.normalizeCode(refItem.id) : '',
        refItem?.code ? PriceNormalizationEngine.normalizeCode(refItem.code) : '',
      ].filter(Boolean);

      for (const k of keysToCheck) {
        if (!overrideObj) overrideObj = projectPriceEngine.getProjectOverride(projectId, k);
        if (!projectPriceObj) projectPriceObj = projectPriceEngine.getProjectPrice(projectId, k);
      }
    }

    const projPriceValue = projectPriceObj?.price;

    // TIER 1: Active Project Override
    if (overrideObj && overrideObj.active) {
      const finalPrice = overrideObj.price;
      const varianceAmount = refPrice !== undefined ? finalPrice - refPrice : 0;
      const variancePercent = refPrice ? Number(((varianceAmount / refPrice) * 100).toFixed(2)) : 0;

      return {
        materialId: overrideObj.materialId,
        materialCode: overrideObj.materialCode || itemCode,
        materialName: overrideObj.materialName || itemName,
        projectId,
        price: finalPrice,
        unit: overrideObj.unit || refUnit,
        source: 'PROJECT_OVERRIDE',
        status: 'OVERRIDE',
        sourceName: 'Project Price Override (Estimator)',
        isFinal: true,
        confidence: 1.0,
        referencePrice: refPrice,
        projectPrice: projPriceValue,
        overridePrice: finalPrice,
        varianceAmount,
        variancePercent,
        explanation: `Harga override aktif untuk proyek ${projectId}: Rp ${finalPrice.toLocaleString('id-ID')}/${overrideObj.unit}. Alasan: ${overrideObj.reason}`,
        provenance: {
          referenceId: overrideObj.id,
          createdBy: overrideObj.createdBy,
          createdAt: overrideObj.createdAt,
          notes: overrideObj.reason,
        },
      };
    }

    // TIER 2: Active Project Price (Check for Expiration)
    if (projectPriceObj) {
      const isExpired = projectPriceEngine.isPriceExpired(projectPriceObj.validUntil);

      if (isExpired) {
        // Fallback to Reference Price if available
        if (refPrice !== undefined) {
          const finalPrice = refPrice;
          return {
            materialId: projectPriceObj.materialId,
            materialCode: itemCode,
            materialName: itemName,
            projectId,
            price: finalPrice,
            unit: refUnit,
            source: 'EZRAB_REFERENCE',
            status: 'EXPIRED',
            sourceName: 'Database Referensi Nasional EZRAB (Fallback)',
            supplier: projectPriceObj.supplierName,
            validUntil: projectPriceObj.validUntil,
            isFinal: true,
            confidence: 0.95,
            referencePrice: refPrice,
            projectPrice: projectPriceObj.price,
            varianceAmount: 0,
            variancePercent: 0,
            explanation: `Peringatan: Penawaran harga proyek (Rp ${projectPriceObj.price.toLocaleString('id-ID')}) telah kedaluwarsa pada ${projectPriceObj.validUntil}. Menggunakan harga acuan referensi nasional.`,
            provenance: {
              referenceId: projectPriceObj.id,
              notes: `Kedaluwarsa pada ${projectPriceObj.validUntil}. Fallback ke referensi nasional.`,
            },
          };
        } else {
          // Expired and no reference
          return {
            materialId: projectPriceObj.materialId,
            materialCode: itemCode,
            materialName: itemName,
            projectId,
            price: projectPriceObj.price,
            unit: projectPriceObj.unit,
            source: 'PROJECT_PRICE',
            status: 'EXPIRED',
            sourceName: projectPriceObj.supplierName || 'Penawaran Kedaluwarsa',
            validUntil: projectPriceObj.validUntil,
            isFinal: true,
            confidence: 0.5,
            projectPrice: projectPriceObj.price,
            varianceAmount: 0,
            variancePercent: 0,
            explanation: `Peringatan: Penawaran harga proyek kedaluwarsa pada ${projectPriceObj.validUntil}.`,
          };
        }
      }

      // Valid Active Project Price
      const finalPrice = projectPriceObj.price;
      const varianceAmount = refPrice !== undefined ? finalPrice - refPrice : 0;
      const variancePercent = refPrice ? Number(((varianceAmount / refPrice) * 100).toFixed(2)) : 0;

      return {
        materialId: projectPriceObj.materialId,
        materialCode: projectPriceObj.materialCode || itemCode,
        materialName: projectPriceObj.materialName || itemName,
        projectId,
        price: finalPrice,
        unit: projectPriceObj.unit,
        source: 'PROJECT_PRICE',
        status: 'PROJECT_PRICE',
        sourceName: projectPriceObj.supplierName || `Harga Penawaran Proyek (${projectPriceObj.source})`,
        supplier: projectPriceObj.supplierName,
        region: projectPriceObj.region || location,
        validFrom: projectPriceObj.effectiveDate,
        validUntil: projectPriceObj.validUntil,
        isFinal: true,
        confidence: 1.0,
        referencePrice: refPrice,
        projectPrice: finalPrice,
        varianceAmount,
        variancePercent,
        explanation: `Harga penawaran proyek aktif: Rp ${finalPrice.toLocaleString('id-ID')}/${projectPriceObj.unit} dari ${projectPriceObj.supplierName || 'Supplier Proyek'}.`,
        provenance: {
          referenceId: projectPriceObj.referenceNumber || projectPriceObj.id,
          createdBy: projectPriceObj.createdBy,
          createdAt: projectPriceObj.createdAt,
          notes: projectPriceObj.notes,
        },
      };
    }

    // TIER 4: EZRAB Material Reference
    if (refItem && refPrice !== undefined) {
      const sanity = priceSanityValidator.validatePrice(refItem.name, refPrice, refItem.unit);
      if (sanity.status === 'PRICE_INVALID') {
        return {
          materialId: refItem.id,
          materialCode: refItem.code,
          materialName: refItem.name,
          projectId,
          price: 0,
          unit: refItem.unit,
          source: 'PRICE_NOT_FOUND',
          status: 'NOT_FOUND',
          sourceName: 'Harga Ditolak Sanity Validator',
          isFinal: false,
          confidence: 0,
          explanation: sanity.rejectionReason || 'Harga acuan melampaui batas kewajaran engineering.',
        };
      }

      const isRegional = refItem.priceSource.includes('SE') || refItem.priceSource.includes('PUPR');
      return {
        materialId: refItem.id,
        materialCode: refItem.code,
        materialName: refItem.name,
        projectId,
        price: refItem.price,
        unit: refItem.unit,
        source: isRegional ? 'REGIONAL_REFERENCE' : 'EZRAB_REFERENCE',
        status: 'REFERENCE',
        sourceName: refItem.provenance?.sourceName || (isRegional ? 'Standar Harga Regional / SE PUPR' : 'Database Referensi Nasional EZRAB'),
        region: refItem.location,
        isFinal: true,
        confidence: refItem.provenance?.confidenceScore || 0.95,
        referencePrice: refItem.price,
        varianceAmount: 0,
        variancePercent: 0,
        explanation: `Menggunakan harga acuan referensi: Rp ${refItem.price.toLocaleString('id-ID')}/${refItem.unit}`,
        provenance: {
          referenceId: refItem.id,
          sourceUrl: refItem.provenance?.sourceUrl,
          createdAt: refItem.effectiveDate,
          notes: refItem.provenance?.notes,
        },
      };
    }

    // TIER 8: Manual Input if provided
    if (qObj.manualPrice && qObj.manualPrice > 0) {
      return {
        materialId: qObj.code || `MANUAL-${Date.now()}`,
        materialCode: qObj.code,
        materialName: qObj.name,
        projectId,
        price: qObj.manualPrice,
        unit: qObj.unit || 'unit',
        source: 'MANUAL',
        status: 'REFERENCE',
        sourceName: 'Harga Input Manual Estimator',
        isFinal: true,
        confidence: 0.8,
        explanation: 'Harga diinput secara manual tanpa referensi database.',
      };
    }

    // TIER 9: Fail-Closed / PRICE_NOT_FOUND (Anti-Hallucination)
    return {
      materialId: qObj.code || `NOTFOUND-${Date.now()}`,
      materialCode: qObj.code,
      materialName: qObj.name || qObj.code || 'Item Tidak Dikenal',
      projectId,
      price: 0,
      unit: qObj.unit || 'unit',
      source: 'PRICE_NOT_FOUND',
      status: 'NOT_FOUND',
      sourceName: 'Harga Tidak Ditemukan',
      isFinal: false,
      confidence: 0,
      explanation: `Harga untuk "${qObj.name || qObj.code}" tidak ditemukan dalam database referensi maupun harga proyek.`,
    };
  }
}

export const priceResolver = new PriceResolver();
