/**
 * Priority 3: Regional Price Provider
 * Resolves prices tailored to the project's specific regional location:
 * - Province (e.g. Jawa Timur, DKI Jakarta, Jawa Barat, etc.)
 * - City / Regency (e.g. Kabupaten Pasuruan, Kota Surabaya, Jakarta Selatan, dll.)
 * - Year of estimation (e.g. 2026)
 *
 * Principles:
 * - Adjusts labor rates and material indices based on regional construction standards (IKK / Standar Upah Regional).
 * - Records explicit provenance as REGIONAL_PRICE.
 * - Stores distance/regional relevance note if approximated from nearest benchmark city.
 */

import { PriceProvider, PriceSearchInput, PriceCandidate } from '../providerContracts';
import { officialAhspRepository } from '../../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../../data/priceDatabase2026/resolver';
import { SafeDecimalEngine } from '../../../engine/safeDecimalEngine';

// Indonesian Provincial Construction Cost Benchmarks & Wage Standards (2026)
export const REGIONAL_PROVINCIAL_BENCHMARKS: Record<string, {
  materialIndex: number; // Ratio compared to DKI Jakarta baseline (1.00)
  laborRateDayTukang: number; // Daily skilled worker rate (IDR)
  laborRateDayPekerja: number; // Daily helper rate (IDR)
  laborRateDayMandor: number; // Daily foreman rate (IDR)
  defaultRegencies: string[];
}> = {
  'jawa timur': {
    materialIndex: 0.92,
    laborRateDayTukang: 135000,
    laborRateDayPekerja: 110000,
    laborRateDayMandor: 165000,
    defaultRegencies: ['Kabupaten Pasuruan', 'Kota Pasuruan', 'Kota Surabaya', 'Kabupaten Malang', 'Kota Malang', 'Kabupaten Sidoarjo', 'Kabupaten Gresik', 'Kabupaten Banyuwangi', 'Kabupaten Jember', 'Kabupaten Kediri'],
  },
  'jawa barat': {
    materialIndex: 0.95,
    laborRateDayTukang: 145000,
    laborRateDayPekerja: 115000,
    laborRateDayMandor: 175000,
    defaultRegencies: ['Kota Bandung', 'Kabupaten Bandung', 'Kota Bekasi', 'Kabupaten Bekasi', 'Kota Bogor', 'Kabupaten Bogor', 'Kota Depok', 'Kabupaten Cirebon', 'Kabupaten Karawang'],
  },
  'dki jakarta': {
    materialIndex: 1.00,
    laborRateDayTukang: 180000,
    laborRateDayPekerja: 140000,
    laborRateDayMandor: 210000,
    defaultRegencies: ['Jakarta Pusat', 'Jakarta Selatan', 'Jakarta Barat', 'Jakarta Timur', 'Jakarta Utara'],
  },
  'jawa tengah': {
    materialIndex: 0.88,
    laborRateDayTukang: 125000,
    laborRateDayPekerja: 100000,
    laborRateDayMandor: 155000,
    defaultRegencies: ['Kota Semarang', 'Kabupaten Semarang', 'Kota Surakarta (Solo)', 'Kabupaten Banyumas', 'Kota Magelang', 'Kabupaten Kudus', 'Kabupaten Tegal'],
  },
  'di yogyakarta': {
    materialIndex: 0.89,
    laborRateDayTukang: 125000,
    laborRateDayPekerja: 100000,
    laborRateDayMandor: 155000,
    defaultRegencies: ['Kota Yogyakarta', 'Kabupaten Sleman', 'Kabupaten Bantul', 'Kabupaten Kulon Progo', 'Kabupaten Gunungkidul'],
  },
  'banten': {
    materialIndex: 0.96,
    laborRateDayTukang: 150000,
    laborRateDayPekerja: 120000,
    laborRateDayMandor: 180000,
    defaultRegencies: ['Kota Tangerang', 'Kota Tangerang Selatan', 'Kabupaten Tangerang', 'Kota Serang', 'Kota Cilegon', 'Kabupaten Lebak'],
  },
  'bali': {
    materialIndex: 1.05,
    laborRateDayTukang: 160000,
    laborRateDayPekerja: 130000,
    laborRateDayMandor: 190000,
    defaultRegencies: ['Kota Denpasar', 'Kabupaten Badung', 'Kabupaten Gianyar', 'Kabupaten Tabanan', 'Kabupaten Buleleng'],
  },
};

export class RegionalPriceProvider implements PriceProvider {
  public readonly name = 'REGIONAL_PRICE';
  public readonly priority = 3;

  public async search(input: PriceSearchInput): Promise<PriceCandidate | null> {
    const { workItemName, ahspCode, location, quantity = 1 } = input;
    if (!location || !location.province) return null;

    const provKey = location.province.toLowerCase().trim();
    const benchmark = REGIONAL_PROVINCIAL_BENCHMARKS[provKey];
    if (!benchmark) return null;

    const qty = quantity !== null && quantity !== undefined && quantity > 0 ? quantity : 1;
    const cityStr = location.city ? `${location.city}, ` : '';
    const locationLabel = `${cityStr}${location.province} (${location.year || 2026})`;

    // If an AHSP exists in national database, we can compute regionalized unit price
    if (ahspCode) {
      const match = officialAhspRepository.getOfficialAhsp(ahspCode);
      if (match) {
        const comp = priceResolver2026.resolveAhspUnitPrice(match);
        if (comp.unitPrice && comp.unitPrice > 0) {
          // Adjust material by regional index, and labor by regional wage ratio
          const baseMat = comp.material.subtotalPerUnit || 0;
          const baseLab = comp.labor.subtotalPerUnit || 0;
          const baseEq = comp.equipment.subtotalPerUnit || 0;

          const adjMat = SafeDecimalEngine.safeRound(SafeDecimalEngine.safeMultiply(baseMat, benchmark.materialIndex), 2);
          const labRatio = benchmark.laborRateDayTukang / 180000; // Baseline Jakarta
          const adjLab = SafeDecimalEngine.safeRound(SafeDecimalEngine.safeMultiply(baseLab, labRatio), 2);
          const adjEq = SafeDecimalEngine.safeRound(SafeDecimalEngine.safeMultiply(baseEq, benchmark.materialIndex), 2);

          const regionalUnitPrice = SafeDecimalEngine.safeRound(
            SafeDecimalEngine.safeAdd(SafeDecimalEngine.safeAdd(adjMat, adjLab), adjEq),
            2
          );
          const totalPrice = SafeDecimalEngine.safeMultiply(regionalUnitPrice, qty, 2);

          return {
            unitPrice: regionalUnitPrice,
            totalPrice,
            priceSource: 'REGIONAL_PRICE',
            priceStatus: 'PRICE_INTERNAL',
            sourceName: `Standar Regional ${location.province} (${location.city || 'Wilayah Umum'})`,
            location: locationLabel,
            materialPrice: adjMat,
            laborPrice: adjLab,
            equipmentPrice: adjEq,
            confidence: 0.88,
            confidenceRating: 'MEDIUM',
            assumptions: [
              `Disesuaikan dengan standar biaya konstruksi wilayah ${location.province} (Indeks bahan: ${(benchmark.materialIndex * 100).toFixed(0)}%, Standar tukang: Rp ${benchmark.laborRateDayTukang.toLocaleString('id-ID')}/hari).`,
              `Tahun acuan harga: ${location.year || 2026}.`,
            ],
          };
        }
      }
    }

    // Direct work item category heuristics for regional rates
    const norm = workItemName.toLowerCase();
    let baseRate = 0;
    if (norm.includes('batu kali') || norm.includes('pondasi')) baseRate = 850000;
    else if (norm.includes('sloof')) baseRate = 4200000;
    else if (norm.includes('kolom')) baseRate = 4500000;
    else if (norm.includes('ringbalk')) baseRate = 4300000;
    else if (norm.includes('dinding bata merah')) baseRate = 135000;
    else if (norm.includes('plesteran')) baseRate = 48000;
    else if (norm.includes('acian')) baseRate = 32000;
    else if (norm.includes('keramik 40x40')) baseRate = 185000;
    else if (norm.includes('keramik 25x25') || norm.includes('keramik km')) baseRate = 175000;
    else if (norm.includes('plafon gypsum')) baseRate = 110000;
    else if (norm.includes('plafon grc')) baseRate = 115000;
    else if (norm.includes('cat dinding')) baseRate = 35000;
    else if (norm.includes('rangka atap baja ringan') || norm.includes('kuda-kuda baja')) baseRate = 175000;
    else if (norm.includes('atap metal') || norm.includes('atap perisai') || norm.includes('genteng')) baseRate = 160000;
    else if (norm.includes('pintu p1') || norm.includes('kusen pintu p1')) baseRate = 2250000;
    else if (norm.includes('pintu p2') || norm.includes('kusen pintu p2')) baseRate = 1450000;
    else if (norm.includes('jendela j1') || norm.includes('kusen jendela j1')) baseRate = 950000;
    else if (norm.includes('jendela j2') || norm.includes('kusen jendela j2')) baseRate = 850000;
    else if (norm.includes('jendela j3')) baseRate = 1150000;
    else if (norm.includes('boven') || norm.includes('bv1')) baseRate = 450000;
    else if (norm.includes('titik lampu') || norm.includes('downlight')) baseRate = 185000;
    else if (norm.includes('saklar')) baseRate = 95000;
    else if (norm.includes('stop kontak')) baseRate = 110000;
    else if (norm.includes('kloset duduk')) baseRate = 2450000;
    else if (norm.includes('floor drain')) baseRate = 175000;
    else if (norm.includes('pipa air')) baseRate = 48000;

    if (baseRate > 0) {
      const adjPrice = Math.round(baseRate * benchmark.materialIndex);
      const tot = SafeDecimalEngine.safeMultiply(adjPrice, qty, 2);
      return {
        unitPrice: adjPrice,
        totalPrice: tot,
        priceSource: 'REGIONAL_PRICE',
        priceStatus: 'PRICE_INTERNAL',
        sourceName: `Referensi Standar Regional ${location.province}`,
        location: locationLabel,
        confidence: 0.82,
        confidenceRating: 'MEDIUM',
        assumptions: [
          `Estimasi mengacu pada standar harga pasar regional wilayah ${location.province} (${location.city || 'Umum'}).`,
          `Tahun acuan: ${location.year || 2026}.`,
        ],
      };
    }

    return null;
  }
}

export const regionalPriceProvider = new RegionalPriceProvider();
