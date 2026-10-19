/**
 * EZRAB AI House Design — Specification Engine
 *
 * Mengubah prompt bahasa alami menjadi HouseSpec tervalidasi.
 * Deterministik, tanpa AI provider. Semua asumsi eksplisit dan dapat diedit.
 */

export interface RoomSpec {
  id: string;
  name: string;
  type: 'bedroom' | 'bathroom' | 'living' | 'kitchen' | 'dining' | 'carport' | 'terrace' | 'storage' | 'other';
  widthM: number;   // lebar (m)
  lengthM: number;  // panjang (m)
  areaM2: number;   // luas (m²)
  x: number;        // posisi x dari origin (m)
  y: number;        // posisi y dari origin (m)
  isAssumed: boolean;
}

export interface HouseSpec {
  buildingType: string;
  floors: number;
  targetAreaM2: number;
  buildingWidthM: number;
  buildingLengthM: number;
  buildingAreaM2: number;
  wallThicknessM: number;
  rooms: RoomSpec[];
  totalRoomAreaM2: number;
  circulationM2: number;
  assumptions: string[];
  warnings: string[];
  completeness: number; // 0-100
  isValid: boolean;
}

export interface ParseResult {
  spec: HouseSpec | null;
  needsClarification: string[];
  rawPrompt: string;
}

// Standar minimal luas ruang (m²) — SNI/referensi umum
const MIN_ROOM_AREAS: Record<string, number> = {
  bedroom: 9,
  bathroom: 2.5,
  living: 12,
  kitchen: 6,
  dining: 8,
  carport: 12,
};

const ROOM_PATTERNS: Array<{ type: RoomSpec['type']; patterns: RegExp[]; defaultW: number; defaultL: number }> = [
  { type: 'bedroom', patterns: [/(\d+)\s*kamar\s*tidur/i, /(\d+)\s*kt\b/i], defaultW: 3, defaultL: 3.5 },
  { type: 'bathroom', patterns: [/(\d+)\s*kamar\s*mandi/i, /(\d+)\s*km\b/i], defaultW: 1.8, defaultL: 2.2 },
  { type: 'living', patterns: [/ruang\s*tamu/i], defaultW: 3.5, defaultL: 4 },
  { type: 'kitchen', patterns: [/dapur/i], defaultW: 2.5, defaultL: 3 },
  { type: 'dining', patterns: [/ruang\s*makan/i], defaultW: 3, defaultL: 3 },
  { type: 'carport', patterns: [/carport|garasi/i], defaultW: 3, defaultL: 5 },
];

/**
 * Parse prompt menjadi HouseSpec.
 * Contoh: "Buatkan rumah 1 lantai luas bangunan 90 m², ukuran 6 × 15 m,
 *          3 kamar tidur, 2 kamar mandi, ruang tamu, dapur, dan carport."
 */
export function parseHousePrompt(prompt: string): ParseResult {
  const needsClarification: string[] = [];
  const assumptions: string[] = [];
  const warnings: string[] = [];

  // 1. Jumlah lantai
  const floorMatch = prompt.match(/(\d+)\s*lantai/i);
  const floors = floorMatch ? parseInt(floorMatch[1], 10) : 1;
  if (!floorMatch) {
    assumptions.push('Jumlah lantai tidak disebutkan → asumsi 1 lantai');
  }

  // 2. Luas bangunan target
  const areaMatch = prompt.match(/luas\s*(bangunan)?\s*(\d+(?:[.,]\d+)?)\s*m/i);
  const targetAreaM2 = areaMatch ? parseFloat(areaMatch[2].replace(',', '.')) : 0;
  if (!areaMatch) {
    needsClarification.push('Luas bangunan target (m²)');
  }

  // 3. Dimensi bangunan (mis. "6 × 15 m" atau "6x15")
  const dimMatch = prompt.match(/(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*m/i);
  let buildingWidthM = 0;
  let buildingLengthM = 0;
  if (dimMatch) {
    buildingWidthM = parseFloat(dimMatch[1].replace(',', '.'));
    buildingLengthM = parseFloat(dimMatch[2].replace(',', '.'));
  } else if (targetAreaM2 > 0) {
    // Asumsi proporsi 1:2 jika hanya luas diketahui
    buildingWidthM = Math.sqrt(targetAreaM2 / 2);
    buildingLengthM = buildingWidthM * 2;
    assumptions.push(`Dimensi tidak disebutkan → asumsi proporsi 1:2 (${buildingWidthM.toFixed(1)} × ${buildingLengthM.toFixed(1)} m)`);
  } else {
    needsClarification.push('Dimensi bangunan (lebar × panjang dalam meter)');
  }

  const buildingAreaM2 = buildingWidthM * buildingLengthM;

  // Validasi konsistensi luas
  if (targetAreaM2 > 0 && buildingAreaM2 > 0) {
    const diff = Math.abs(targetAreaM2 - buildingAreaM2) / targetAreaM2;
    if (diff > 0.15) {
      warnings.push(`Luas target (${targetAreaM2} m²) berbeda >15% dari dimensi (${buildingAreaM2.toFixed(1)} m²). Menggunakan dimensi sebagai acuan.`);
    }
  }

  // 4. Ekstrak ruang
  const rooms: RoomSpec[] = [];
  let roomIdx = 0;

  for (const rp of ROOM_PATTERNS) {
    for (const pattern of rp.patterns) {
      const m = prompt.match(pattern);
      if (m) {
        // Cek apakah ada angka jumlah (mis. "3 kamar tidur")
        const countMatch = m[1] ? parseInt(m[1], 10) : 1;
        const count = Math.min(Math.max(countMatch || 1, 1), 10);
        for (let i = 0; i < count; i++) {
          roomIdx++;
          const name = rp.type === 'bedroom' ? `Kamar Tidur ${i + 1}` :
                       rp.type === 'bathroom' ? `Kamar Mandi ${i + 1}` :
                       rp.type === 'living' ? 'Ruang Tamu' :
                       rp.type === 'kitchen' ? 'Dapur' :
                       rp.type === 'dining' ? 'Ruang Makan' :
                       rp.type === 'carport' ? 'Carport' : `Ruang ${roomIdx}`;
          const area = Math.round(rp.defaultW * rp.defaultL * 100) / 100;
          rooms.push({
            id: `room-${roomIdx}`,
            name,
            type: rp.type,
            widthM: rp.defaultW,
            lengthM: rp.defaultL,
            areaM2: area,
            x: 0, y: 0, // layout dihitung terpisah
            isAssumed: true,
          });
        }
        assumptions.push(`Dimensi ${rp.type} menggunakan nilai default (${rp.defaultW} × ${rp.defaultL} m) — dapat diedit`);
        break;
      }
    }
  }

  if (rooms.length === 0) {
    needsClarification.push('Daftar ruang (mis. kamar tidur, kamar mandi, ruang tamu)');
  }

  // 5. Layout sederhana: susun ruang dalam grid
  layoutRooms(rooms, buildingWidthM, buildingLengthM);

  // 6. Hitung total
  const totalRoomAreaM2 = rooms.reduce((s, r) => s + r.areaM2, 0);
  const circulationM2 = Math.max(0, buildingAreaM2 - totalRoomAreaM2);

  if (totalRoomAreaM2 > buildingAreaM2 * 1.1) {
    warnings.push(`Total luas ruang (${totalRoomAreaM2.toFixed(1)} m²) melebihi luas bangunan. Kurangi jumlah/ukuran ruang.`);
  }

  // 7. Kelengkapan
  let completeness = 100;
  if (needsClarification.length > 0) completeness -= needsClarification.length * 20;
  if (assumptions.length > 0) completeness -= Math.min(assumptions.length * 5, 20);
  completeness = Math.max(0, Math.min(100, completeness));

  const isValid = needsClarification.length === 0 && warnings.length === 0;

  const spec: HouseSpec = {
    buildingType: 'Rumah Tinggal',
    floors,
    targetAreaM2: targetAreaM2 || buildingAreaM2,
    buildingWidthM,
    buildingLengthM,
    buildingAreaM2,
    wallThicknessM: 0.15,
    rooms,
    totalRoomAreaM2,
    circulationM2,
    assumptions,
    warnings,
    completeness,
    isValid,
  };

  return { spec, needsClarification, rawPrompt: prompt };
}

/**
 * Layout sederhana: susun ruang berurutan dalam baris.
 * Ini layout konseptual, bukan desain arsitektur final.
 */
function layoutRooms(rooms: RoomSpec[], buildingW: number, buildingL: number): void {
  let cx = 0.15; // offset dinding
  let cy = 0.15;
  let rowH = 0;

  for (const r of rooms) {
    if (cx + r.widthM > buildingW - 0.15) {
      cx = 0.15;
      cy += rowH + 0.15;
      rowH = 0;
    }
    // Jika melebihi panjang bangunan, tumpuk (tandai warning di luar)
    r.x = cx;
    r.y = cy;
    cx += r.widthM + 0.15;
    rowH = Math.max(rowH, r.lengthM);
  }
}

/**
 * Validasi konsistensi spec.
 */
export function validateSpec(spec: HouseSpec): { valid: boolean; issues: string[]; warnings: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (spec.buildingWidthM <= 0 || spec.buildingLengthM <= 0) {
    issues.push('Dimensi bangunan tidak valid');
  }
  if (spec.rooms.length === 0) {
    issues.push('Tidak ada ruang terdefinisi');
  }
  for (const r of spec.rooms) {
    const minArea = MIN_ROOM_AREAS[r.type] || 4;
    if (r.areaM2 < minArea) {
      issues.push(`${r.name}: luas ${r.areaM2.toFixed(1)} m² di bawah minimum ${minArea} m²`);
    }
    // Cek batas bangunan — WARNING (layout konsep, dapat diedit di Denah 2D)
    if (r.x + r.widthM > spec.buildingWidthM + 0.01 || r.y + r.lengthM > spec.buildingLengthM + 0.01) {
      warnings.push(`${r.name}: posisi melebihi batas bangunan (sesuaikan di Denah 2D)`);
    }
  }
  // Cek overlap — WARNING
  for (let i = 0; i < spec.rooms.length; i++) {
    for (let j = i + 1; j < spec.rooms.length; j++) {
      const a = spec.rooms[i], b = spec.rooms[j];
      const overlap = !(a.x + a.widthM <= b.x || b.x + b.widthM <= a.x ||
                        a.y + a.lengthM <= b.y || b.y + b.lengthM <= a.y);
      if (overlap) {
        warnings.push(`${a.name} bertabrakan dengan ${b.name} (sesuaikan di Denah 2D)`);
      }
    }
  }

  return { valid: issues.length === 0, issues, warnings };
}
