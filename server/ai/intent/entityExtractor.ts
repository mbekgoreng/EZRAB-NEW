import { ExtractedEntities } from './intentTypes';

/**
 * Deterministic Entity Extraction Engine for Construction Prompts
 * Extracts quantities, units, work items, and materials with strict provenance rules.
 */
export class EntityExtractor {
  private static readonly UNIT_PATTERNS: Record<string, RegExp> = {
    'm3': /\b(m3|m³|meter\s*kubik|kubik)\b/i,
    'm2': /\b(m2|m²|meter\s*persegi|persegi)\b/i,
    'm': /\b(m|meter|meter\s*lari|m1)\b/i,
    'kg': /\b(kg|kilogram|kilo)\b/i,
    'ton': /\b(ton)\b/i,
    'sak': /\b(sak|zak)\b/i,
    'btg': /\b(btg|batang)\b/i,
    'lbr': /\b(lbr|lembar)\b/i,
    'unit': /\b(unit|buah|bh|set|titik)\b/i,
    'ls': /\b(ls|lump\s*sum|paket)\b/i,
    'hari': /\b(hari|oh|orang\s*hari)\b/i,
    'jam': /\b(jam)\b/i
  };

  public static extract(query: string): ExtractedEntities {
    const text = query.trim();
    const entities: ExtractedEntities = {};

    // 1. Extract Volume / Quantity (e.g., 12 m2, 45.5 m3, volume 100)
    const volumeMatch = text.match(/(?:volume\s*[:=]?\s*|\b)(\d+(?:[.,]\d+)?)\s*(m3|m³|m2|m²|meter\s*kubik|meter\s*persegi|meter|m|kg|ton|sak|btg|lbr|unit|buah|ls|paket)?/i);
    if (volumeMatch && volumeMatch[1]) {
      const numStr = volumeMatch[1].replace(',', '.');
      const parsedNum = parseFloat(numStr);
      if (!isNaN(parsedNum)) {
        entities.volume = parsedNum;
      }
    }

    // 2. Extract Unit
    for (const [unitKey, regex] of Object.entries(this.UNIT_PATTERNS)) {
      if (regex.test(text)) {
        entities.unit = unitKey;
        break;
      }
    }

    // 3. Extract Price / Cost (e.g., Rp 150.000, 150rb, harga 75000)
    const priceMatch = text.match(/(?:harga|biaya|rp\.?|budget|anggaran)\s*[:=]?\s*(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+)(?:\s*(rb|ribu|jt|juta|milyar|m))?/i);
    if (priceMatch && priceMatch[1]) {
      let rawPrice = priceMatch[1].replace(/\./g, '').replace(',', '.');
      let val = parseFloat(rawPrice);
      const suffix = (priceMatch[2] || '').toLowerCase();
      if (suffix === 'rb' || suffix === 'ribu') val *= 1000;
      if (suffix === 'jt' || suffix === 'juta') val *= 1000000;
      if (suffix === 'm' || suffix === 'milyar') val *= 1000000000;
      if (!isNaN(val) && val > 0) {
        entities.price = val;
      }
    }

    // 4. Extract Work Item / Item Description
    const workItemMatch = text.match(/(?:tambah(?:kan)?|pekerjaan|item|buat|pasang|plester|cor|galian|urugan|pondasi|cat|waterproofing|keramik|baja|atap)\s+([^0-9,.]+)/i);
    if (workItemMatch && workItemMatch[0]) {
      // Clean extracted description
      let cleanDesc = text
        .replace(/^(?:tolong|bantu|saya\s*mau|mohon|harap|coba)\s+/i, '')
        .replace(/^(?:tambah(?:kan)?|masukkan|buatkan|input)\s+(?:item|pekerjaan)?\s*/i, '')
        .replace(/\b\d+(?:[.,]\d+)?\s*(m3|m³|m2|m²|meter|m|kg|unit|ls)?\b/gi, '')
        .replace(/\b(?:dengan\s*harga|harga|biaya)\s*[:=]?\s*(?:rp\.?)?\s*[\d.,]+\b/gi, '')
        .trim();

      if (cleanDesc.length >= 3) {
        entities.workItem = cleanDesc.charAt(0).toUpperCase() + cleanDesc.slice(1);
      }
    }

    // 5. Extract Material Reference
    const materialKeywords = [
      'semen', 'pasir', 'batu kali', 'split', 'kerikil', 'bata ringan', 'hebel',
      'bata merah', 'besi ulir', 'besi polos', 'wiremesh', 'bondek', 'spandek',
      'baja wf', 'hollow', 'gypsum', 'cat dulux', 'cat mowilex', 'waterproofing',
      'keramik 60x60', 'granit 60x60', 'genteng metal', 'pipa pvc'
    ];
    for (const mat of materialKeywords) {
      if (text.toLowerCase().includes(mat)) {
        entities.material = mat;
        break;
      }
    }

    if (!entities.material) {
      const priceQueryMatch = text.match(/(?:berapa\s*harga(?:\s*material|\s*upah|\s*alat)?|harga\s*(?:material|upah|alat)?|cari\s*harga)\s+([^?,.!]+)/i);
      if (priceQueryMatch && priceQueryMatch[1]) {
        entities.material = priceQueryMatch[1].trim();
      }
    }

    // 6. Extract Location / Region
    const locationKeywords: Record<string, string> = {
      'jakarta': 'DKI_JAKARTA',
      'surabaya': 'JAWA_TIMUR',
      'semarang': 'JAWA_TENGAH_DIY',
      'bandung': 'JAWA_BARAT',
      'medan': 'SUMATERA_UTARA',
      'makassar': 'SULAWESI_SELATAN',
      'denpasar': 'BALI_NUSRA',
      'bali': 'BALI_NUSRA',
      'jayapura': 'MALUKU_PAPUA',
      'papua': 'MALUKU_PAPUA',
      'balikpapan': 'KALIMANTAN_IKN',
      'ikn': 'KALIMANTAN_IKN'
    };
    for (const [city, code] of Object.entries(locationKeywords)) {
      if (text.toLowerCase().includes(city)) {
        entities.location = code;
        break;
      }
    }

    // 7. Extract Area / Luas Bangunan
    const areaMatch = text.match(/(?:luas\s*(?:bangunan|tanah)?|type)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:m2|m²)?/i);
    if (areaMatch && areaMatch[1]) {
      const areaVal = parseFloat(areaMatch[1].replace(',', '.'));
      if (!isNaN(areaVal)) {
        entities.buildingArea = areaVal;
      }
    }

    // 8. Extract Floor / Lantai
    const floorMatch = text.match(/(\d+)\s*lantai/i);
    if (floorMatch && floorMatch[1]) {
      entities.floor = parseInt(floorMatch[1], 10);
    }

    // 9. Extract Dimensions & Cross-Sections (e.g. 15/20, 20x30, panjang 40m, lebar 3m, tinggi 0.5m)
    const crossSectionMatch = text.match(/\b(\d{1,3})\s*[/xX]\s*(\d{1,3})\b/);
    if (crossSectionMatch) {
      let dim1 = parseFloat(crossSectionMatch[1]);
      let dim2 = parseFloat(crossSectionMatch[2]);
      // If dimensions are in cm (>= 5), convert to meters
      if (dim1 >= 5) dim1 = dim1 / 100;
      if (dim2 >= 5) dim2 = dim2 / 100;
      entities.width = dim1;
      entities.height = dim2;
    }

    const lengthMatch = text.match(/(?:panjang|p\s*=)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:m|meter)?/i);
    if (lengthMatch && lengthMatch[1]) {
      entities.length = parseFloat(lengthMatch[1].replace(',', '.'));
    }

    const widthMatch = text.match(/(?:lebar|l\s*=)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:m|meter)?/i);
    if (widthMatch && widthMatch[1]) {
      entities.width = parseFloat(widthMatch[1].replace(',', '.'));
    }

    const heightMatch = text.match(/(?:tinggi|kedalaman|tebal|t\s*=)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:m|meter)?/i);
    if (heightMatch && heightMatch[1]) {
      entities.height = parseFloat(heightMatch[1].replace(',', '.'));
    }

    return entities;
  }
}
