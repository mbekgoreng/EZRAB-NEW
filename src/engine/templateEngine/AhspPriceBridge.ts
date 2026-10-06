import { FlatWbsItem } from './WbsEngine';
import {
  CalculatedQuantityItem,
  GeneratedRabItem,
  AhspStatus,
  PriceSource,
  QuantitySource
} from './types';
import { getRegionalFactor } from '../../data/regionalCostFactors';

export class AhspPriceBridge {
  // Database of standard baseline unit prices for verified PUPR work items (IDR)
  private static standardPrices: Record<string, { price: number; verified: boolean }> = {
    'A.2.2.1.1': { price: 8500, verified: true },      // Pembersihan lapangan m2
    'A.2.2.1.4': { price: 92000, verified: true },     // Pasang bouwplank m1
    'A.2.2.1.8': { price: 425000, verified: true },    // Pembuatan gudang m2
    'A.2.3.1.1': { price: 85000, verified: true },     // Galian tanah biasa m3
    'A.2.3.1.2': { price: 105000, verified: true },    // Galian footplat m3
    'A.2.3.1.9': { price: 32000, verified: true },     // Urugan kembali m3
    'A.2.3.1.11': { price: 185000, verified: true },   // Urugan pasir alas m3
    'A.3.2.1.1': { price: 540000, verified: true },    // Pondasi aanstamping m3
    'A.3.2.1.2': { price: 980000, verified: true },    // Pondasi batu kali 1:5 m3
    'A.4.1.1.1': { price: 890000, verified: true },    // Lantai kerja B-0 m3
    'A.4.1.1.2': { price: 4200000, verified: true },   // Beton sloof bertulang m3
    'A.4.1.1.3': { price: 4400000, verified: true },   // Beton kolom praktis m3
    'A.4.1.1.4': { price: 4850000, verified: true },   // Beton kolom utama K-250 m3
    'A.4.1.1.5': { price: 4700000, verified: true },   // Beton footplat K-250 m3
    'A.4.1.1.6': { price: 4950000, verified: true },   // Beton balok gantung m3
    'A.4.1.1.7': { price: 4650000, verified: true },   // Pelat lantai bondek m3
    'A.4.1.1.8': { price: 4900000, verified: true },   // Beton tangga m3
    'A.4.1.1.9': { price: 4350000, verified: true },   // Ringbalk m3
    'A.4.1.1.10': { price: 4450000, verified: true },  // Kanopi beton m3
    'A.4.4.1.1': { price: 145000, verified: true },    // Pasangan hebel m2
    'A.4.4.1.2': { price: 165000, verified: true },    // Pasangan trasraam m2
    'A.4.4.2.1': { price: 78000, verified: true },     // Plesteran 1:4 m2
    'A.4.4.2.2': { price: 42000, verified: true },     // Acian halus m2
    'A.4.4.3.1': { price: 295000, verified: true },    // Granit 60x60 m2
    'A.4.4.3.2': { price: 45000, verified: true },     // Plint granit m1
    'A.4.4.3.3': { price: 95000, verified: true },     // Waterproofing m2
    'A.4.4.3.4': { price: 215000, verified: true },    // Keramik KM 30x30 m2
    'A.4.4.3.5': { price: 265000, verified: true },    // Keramik dinding 30x60 m2
    'A.4.4.3.6': { price: 245000, verified: true },    // Keramik carport m2
    'A.4.2.1.1': { price: 195000, verified: true },    // Rangka baja ringan m2
    'A.4.2.1.2': { price: 65000, verified: true },     // Reng baja ringan m2
    'A.4.5.1.1': { price: 165000, verified: true },    // Pasang genteng beton m2
    'A.4.5.1.2': { price: 110000, verified: true },    // Pasang nok genteng m1
    'A.4.5.1.3': { price: 38000, verified: true },     // Pasang aluminium foil m2
    'A.4.5.2.1': { price: 85000, verified: true },     // Listplank GRC m1
    'A.4.5.2.2': { price: 75000, verified: true },     // Talang jurai m1
    'A.4.5.3.1': { price: 95000, verified: true },     // Rangka plafon hollow m2
    'A.4.5.3.2': { price: 85000, verified: true },     // Plafon gypsum 9mm m2
    'A.4.5.3.3': { price: 80000, verified: true },     // Plafon GRC 4mm m2
    'A.4.5.3.4': { price: 28000, verified: true },     // Lis profil gypsum m1
    'A.4.6.1.1': { price: 165000, verified: true },    // Kusen aluminium m1
    'A.4.6.1.2': { price: 1850000, verified: true },   // Daun pintu solid bh
    'A.4.6.1.3': { price: 850000, verified: true },    // Daun pintu HPL bh
    'A.4.6.1.4': { price: 450000, verified: true },    // Pintu PVC KM bh
    'A.4.6.2.1': { price: 145000, verified: true },    // Kaca polos 5mm m2
    'A.4.6.3.1': { price: 320000, verified: true },    // Kunci silinder set
    'A.4.6.3.2': { price: 165000, verified: true },    // Handle lever set
    'A.4.7.1.1': { price: 38000, verified: true },     // Cat plafon m2
    'A.4.7.1.2': { price: 42000, verified: true },     // Cat dinding interior m2
    'A.4.7.1.3': { price: 68000, verified: true },     // Cat weathershield m2
    'A.4.7.1.4': { price: 35000, verified: true },     // Cat meni besi m2
    'A.4.7.1.5': { price: 65000, verified: true },     // Pernis melamik m2
    'A.5.1.1.1': { price: 2450000, verified: true },   // Kloset duduk unit
    'A.5.1.1.2': { price: 165000, verified: true },    // Jet shower bidet unit
    'A.5.1.1.3': { price: 580000, verified: true },    // Shower set dinding unit
    'A.5.1.1.4': { price: 125000, verified: true },    // Floor drain stainless bh
    'A.5.1.1.5': { price: 650000, verified: true },    // Kitchen sink unit
    'A.5.1.2.1': { price: 42000, verified: true },     // Pipa PVC 3/4 AW m1
    'A.5.1.2.2': { price: 78000, verified: true },     // Pipa PVC 4 D m1
    'A.5.1.2.3': { price: 35000, verified: true },     // Pipa ventilasi m1
    'A.5.1.3.1': { price: 3200000, verified: true },   // Bio septic tank unit
    'A.5.1.3.2': { price: 250000, verified: true },    // Bak kontrol bh
    'A.5.1.3.3': { price: 1450000, verified: true },   // Tandon air 1000L unit
    'A.6.1.1.1': { price: 650000, verified: true },    // Box panel MCB unit
    'A.6.1.1.2': { price: 450000, verified: true },    // Grounding titik
    'A.6.1.2.1': { price: 185000, verified: true },    // Titik lampu titik
    'A.6.1.2.2': { price: 75000, verified: true },     // Downlight Philips bh
    'A.6.1.2.3': { price: 55000, verified: true },     // Saklar Panasonic bh
    'A.6.1.3.1': { price: 195000, verified: true },    // Titik stop kontak titik
    'A.6.1.3.2': { price: 58000, verified: true },     // Stop kontak bh
    'A.6.1.3.3': { price: 280000, verified: true },    // Stop kontak AC/WH titik
    'A.2.3.1.5': { price: 185000, verified: true }     // Saluran buis beton U20 m1
  };

  /**
   * Transforms flat WBS items into production-ready RAB items with honest AHSP codes,
   * regional multiplier adjustments, and source tracking.
   */
  public static mapToRabItems(
    flatWbs: FlatWbsItem[],
    calculatedQuantities: Record<string, CalculatedQuantityItem>,
    locationCity?: string,
    locationProvince?: string
  ): GeneratedRabItem[] {
    const loc = locationProvince || locationCity || 'Surabaya';
    const regionalFactor = getRegionalFactor(loc);
    const regionalMultiplier = regionalFactor.multiplier || 1.0;

    return flatWbs.map((item, idx) => {
      const qItem = calculatedQuantities[item.code];
      const volume = qItem ? qItem.quantity : (item.level === 3 ? 1.0 : 0);
      const unit = qItem?.unit || item.unit || (item.level === 3 ? 'ls' : '');
      const qSource: QuantitySource = qItem ? qItem.source : 'template_estimate';

      // Look up AHSP and price
      let unitPrice = 0;
      let ahspStatus: AhspStatus = 'needs_verification';
      let priceSource: PriceSource = 'ai_estimate';

      if (item.ahspCode && this.standardPrices[item.ahspCode]) {
        const base = this.standardPrices[item.ahspCode];
        unitPrice = Math.round(base.price * regionalMultiplier);
        ahspStatus = base.verified ? 'verified' : 'needs_verification';
        priceSource = 'verified_database';
      } else if (item.level === 3) {
        // Unmapped item: provide estimated fallback price without inventing false AHSP codes
        unitPrice = Math.round(150000 * regionalMultiplier);
        ahspStatus = 'needs_verification';
        priceSource = 'ai_estimate';
      }

      const totalPrice = item.level === 3 ? Math.round(volume * unitPrice) : 0;
      const validationStatus = ahspStatus === 'verified' ? 'verified' : 'needs_verification';

      return {
        id: `RAB-${item.code.replace(/\./g, '-')}-${idx + 1}`,
        code: item.code,
        name: item.title,
        category: item.category || item.title,
        level: item.level,
        volume,
        unit,
        quantitySource: qSource,
        ahspCode: item.ahspCode,
        ahspStatus,
        unitPrice,
        priceSource,
        totalPrice,
        validationStatus,
        isOptional: item.isOptional
      };
    });
  }
}
