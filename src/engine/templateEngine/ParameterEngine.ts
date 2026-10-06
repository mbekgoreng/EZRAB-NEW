import {
  ParameterDefinition,
  ParameterValue,
  ParameterSource,
  ParameterValidationStatus
} from './types';

export class ParameterEngine {
  /**
   * Extracts parameters from natural language prompts using rule-based pattern matching.
   */
  public static extractFromText(text: string, definitions: ParameterDefinition[]): Record<string, ParameterValue> {
    const results: Record<string, ParameterValue> = {};
    const lower = text.toLowerCase();

    // 1. Detect building area (e.g., "tipe 36", "tipe 45", "tipe 60", "luas 100m2", "luas bangunan 120 m²", "150 m2")
    const typeMatch = lower.match(/(?:tipe|type)\s*(\d{2,4})/i);
    const areaMatch = lower.match(/(?:luas(?: bangunan| lantai)?|ukuran)\s*[:=]?\s*(\d{2,4})\s*(?:m2|m²|meter)?/i) ||
                      lower.match(/(\d{2,4})\s*(?:m2|m²)\b/i);

    if (typeMatch) {
      const area = parseInt(typeMatch[1], 10);
      results['building_area'] = {
        value: area,
        unit: 'm²',
        source: 'user_input',
        validationStatus: 'verified',
        confidence: 0.95,
        extractedFrom: typeMatch[0],
        reasoning: `Ekstraksi otomatis dari sebutan tipe rumah "${typeMatch[0]}"`
      };
    } else if (areaMatch) {
      const area = parseInt(areaMatch[1], 10);
      results['building_area'] = {
        value: area,
        unit: 'm²',
        source: 'user_input',
        validationStatus: 'verified',
        confidence: 0.9,
        extractedFrom: areaMatch[0],
        reasoning: `Ekstraksi luas bangunan dari teks "${areaMatch[0]}"`
      };
    }

    // 2. Detect number of floors (e.g., "1 lantai", "2 lantai", "lantai 2", "3 tingkat", "dua lantai", "tingkat 2")
    const floorMatch = lower.match(/(\d+)\s*(?:lantai|tingkat)/i) ||
                       lower.match(/(?:lantai|tingkat)\s*(\d+)/i);
    if (floorMatch) {
      const floors = parseInt(floorMatch[1], 10);
      results['num_floors'] = {
        value: floors,
        unit: 'lantai',
        source: 'user_input',
        validationStatus: 'verified',
        confidence: 0.95,
        extractedFrom: floorMatch[0],
        reasoning: `Jumlah lantai terdeteksi: ${floors} lantai`
      };
    } else if (lower.includes('dua lantai') || lower.includes('2 lantai') || lower.includes('bertingkat')) {
      results['num_floors'] = {
        value: 2,
        unit: 'lantai',
        source: 'user_input',
        validationStatus: 'verified',
        confidence: 0.9,
        reasoning: 'Terdeteksi kata kunci rumah 2 lantai/bertingkat'
      };
    } else if (lower.includes('satu lantai') || lower.includes('1 lantai')) {
      results['num_floors'] = {
        value: 1,
        unit: 'lantai',
        source: 'user_input',
        validationStatus: 'verified',
        confidence: 0.9,
        reasoning: 'Terdeteksi kata kunci rumah 1 lantai'
      };
    }

    // 3. Detect number of bedrooms & bathrooms
    const bedMatch = lower.match(/(\d+)\s*(?:kt|kamar tidur|kamar)/i);
    if (bedMatch) {
      results['num_bedrooms'] = {
        value: parseInt(bedMatch[1], 10),
        unit: 'ruang',
        source: 'user_input',
        validationStatus: 'verified',
        confidence: 0.9,
        extractedFrom: bedMatch[0]
      };
    }

    const bathMatch = lower.match(/(\d+)\s*(?:km|kamar mandi|toilet)/i);
    if (bathMatch) {
      results['num_bathrooms'] = {
        value: parseInt(bathMatch[1], 10),
        unit: 'ruang',
        source: 'user_input',
        validationStatus: 'verified',
        confidence: 0.9,
        extractedFrom: bathMatch[0]
      };
    }

    // 4. Detect location / city / province
    const cities = ['surabaya', 'jakarta', 'bandung', 'semarang', 'medan', 'makassar', 'denpasar', 'yogyakarta', 'malang', 'sidoarjo', 'gresik', 'bekasi', 'tangerang', 'depok', 'bogor'];
    for (const city of cities) {
      if (lower.includes(city)) {
        results['location_city'] = {
          value: city.charAt(0).toUpperCase() + city.slice(1),
          source: 'user_input',
          validationStatus: 'verified',
          confidence: 0.95,
          reasoning: `Lokasi kota terdeteksi dari prompt: "${city}"`
        };
        break;
      }
    }

    // 5. Detect finishing quality
    if (lower.includes('mewah') || lower.includes('lux') || lower.includes('premium')) {
      results['finishing_quality'] = {
        value: 'luxury',
        source: 'user_input',
        validationStatus: 'verified',
        confidence: 0.9,
        reasoning: 'Spesifikasi finishing mewah / luxury terdeteksi'
      };
    } else if (lower.includes('sederhana') || lower.includes('subsidi') || lower.includes('ekonomis') || lower.includes('murah')) {
      results['finishing_quality'] = {
        value: 'economic',
        source: 'user_input',
        validationStatus: 'verified',
        confidence: 0.9,
        reasoning: 'Spesifikasi finishing ekonomis / subsidi terdeteksi'
      };
    }

    // 6. Detect roof type
    if (lower.includes('spandek')) {
      results['roof_type'] = { value: 'spandek', source: 'user_input', validationStatus: 'verified', confidence: 0.95 };
    } else if (lower.includes('genteng tanah liat') || lower.includes('genteng pres')) {
      results['roof_type'] = { value: 'genteng_tanah_liat', source: 'user_input', validationStatus: 'verified', confidence: 0.95 };
    } else if (lower.includes('keramik')) {
      results['roof_type'] = { value: 'genteng_keramik', source: 'user_input', validationStatus: 'verified', confidence: 0.9 };
    } else if (lower.includes('dak beton') || lower.includes('rooftop')) {
      results['roof_type'] = { value: 'dak_beton', source: 'user_input', validationStatus: 'verified', confidence: 0.95 };
    }

    // 7. Detect carport
    if (lower.includes('tanpa carport') || lower.includes('tidak ada carport')) {
      results['has_carport'] = { value: false, source: 'user_input', validationStatus: 'verified', confidence: 0.95 };
    } else if (lower.includes('carport') || lower.includes('garasi')) {
      results['has_carport'] = { value: true, source: 'user_input', validationStatus: 'verified', confidence: 0.95 };
    }

    // 8. Fill in defaults for parameters not yet extracted
    definitions.forEach(def => {
      if (!results[def.id] && def.defaultValue !== undefined) {
        results[def.id] = {
          value: def.defaultValue,
          unit: def.unit,
          source: 'template',
          validationStatus: 'verified',
          confidence: 1.0,
          reasoning: 'Nilai standar bawaan dari template'
        };
      }
    });

    return results;
  }

  /**
   * Evaluates if any required parameters are missing from a parameter map.
   */
  public static findMissingRequired(
    definitions: ParameterDefinition[],
    currentValues: Record<string, ParameterValue>
  ): string[] {
    return definitions
      .filter(def => def.required && (currentValues[def.id] === undefined || currentValues[def.id].value === null || currentValues[def.id].value === ''))
      .map(def => def.id);
  }
}
