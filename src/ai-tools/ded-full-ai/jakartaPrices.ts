/**
 * REFERENSI HARGA PASAR JAKARTA 2026
 * Untuk Full AI DED Estimate — estimasi awal, bukan HSPK resmi.
 * Sumber: kompilasi harga pasar material & upah Jabodetabek 2026.
 * WAJIB dilokalisasi ke HSPK kabupaten/kota untuk kontrak.
 *
 * PEMBARUAN 2026-11-10: entri atap/kusen/plafon/elektrikal ditambah &
 * diselaraskan dari riset pasar terbuka bertanggal (homeX.co.id,
 * skala8.com/Sejasa, jasatukang.co.id, amanahbaja.com, builder.id,
 * workshop.co.id, skliving.co.id — data Okt 2026, diambil 10 Nov 2026).
 * Dataset terstruktur + rentang + URL per item ada di
 * ded-ai-estimate/externalPriceReferences.ts; tabel ini adalah ringkasan
 * prompt-nya. Tetap estimasi, BUKAN harga resmi.
 */

export interface PriceReference {
  name: string;
  unit: string;
  price: number; // Rupiah
  category: string;
  note?: string;
}

export const JAKARTA_2026_PRICES: PriceReference[] = [
  // TANAH & PONDASI
  { name: 'Galian tanah biasa', unit: 'm3', price: 85000, category: 'Tanah' },
  { name: 'Pasangan batu kali 1:4', unit: 'm3', price: 650000, category: 'Pondasi' },
  { name: 'Urugan tanah kembali', unit: 'm3', price: 45000, category: 'Tanah' },
  { name: 'Lapis pasir bawah pondasi', unit: 'm3', price: 280000, category: 'Pondasi' },
  { name: 'Aanstanping batu kosong', unit: 'm3', price: 520000, category: 'Pondasi' },

  // BETON & PEMBESIAN
  { name: 'Beton site mix K-225', unit: 'm3', price: 1150000, category: 'Beton' },
  { name: 'Beton ready mix K-225', unit: 'm3', price: 1250000, category: 'Beton' },
  { name: 'Pembesian (bahan + upah)', unit: 'kg', price: 18500, category: 'Besi' },
  { name: 'Bekisting kayu', unit: 'm2', price: 185000, category: 'Bekisting' },

  // DINDING
  { name: 'Pasangan bata merah 1/2 bata', unit: 'm2', price: 95000, category: 'Dinding' },
  { name: 'Pasangan batako', unit: 'm2', price: 85000, category: 'Dinding' },
  { name: 'Plester 1:4 tebal 15mm', unit: 'm2', price: 65000, category: 'Dinding' },
  { name: 'Acian semen', unit: 'm2', price: 45000, category: 'Dinding' },

  // LANTAI
  { name: 'Keramik 40x40 terpasang', unit: 'm2', price: 145000, category: 'Lantai' },
  { name: 'Keramik 60x60 terpasang', unit: 'm2', price: 185000, category: 'Lantai' },
  { name: 'Spesi lantai', unit: 'm2', price: 55000, category: 'Lantai' },

  // ATAP
  { name: 'Kuda-kuda baja ringan', unit: 'm2', price: 185000, category: 'Atap' },
  { name: 'Reng baja ringan', unit: 'm2', price: 45000, category: 'Atap' },
  { name: 'Rangka atap baja ringan terpasang', unit: 'm2', price: 165000, category: 'Atap', note: 'Riset pasar 2026-11-10 (homeX)' },
  { name: 'Penutup atap spandek terpasang', unit: 'm2', price: 95000, category: 'Atap', note: 'Riset pasar 2026-11-10 (builder.id)' },
  { name: 'Nok spandek/metal terpasang', unit: 'm1', price: 55000, category: 'Atap', note: 'Riset pasar 2026-11-10 (amanahbaja)' },
  { name: 'Genteng karang pilang terpasang', unit: 'm2', price: 95000, category: 'Atap' },
  { name: 'Genteng metal terpasang', unit: 'm2', price: 75000, category: 'Atap' },
  { name: 'Bubungan genteng', unit: 'm1', price: 85000, category: 'Atap' },
  { name: 'Lisplang GRC', unit: 'm1', price: 65000, category: 'Atap' },

  // KUSEN PINTU JENDELA
  { name: 'Kusen kayu ulin 5/10', unit: 'm1', price: 450000, category: 'Kusen' },
  { name: 'Kusen kayu kamper 5/10', unit: 'm1', price: 285000, category: 'Kusen' },
  { name: 'Daun pintu panel + engsel', unit: 'unit', price: 850000, category: 'Pintu' },
  { name: 'Pintu double multipleks HPL + kusen aluminium', unit: 'unit', price: 3500000, category: 'Pintu', note: 'Sintesis riset pasar 2026-11-10 (skala8/soloalumunium)' },
  { name: 'Pintu panel aluminium + kusen', unit: 'unit', price: 1800000, category: 'Pintu', note: 'Riset pasar 2026-11-10 (workshop.co.id)' },
  { name: 'Jendela kaca + kusen', unit: 'unit', price: 650000, category: 'Jendela' },
  { name: 'Jendela aluminium + kaca 5 mm', unit: 'unit', price: 900000, category: 'Jendela', note: 'Riset pasar 2026-11-10 (workshop.co.id/trideko)' },
  { name: 'Bovenlicht aluminium + kaca', unit: 'unit', price: 350000, category: 'Jendela', note: 'Riset pasar 2026-11-10 (skliving)' },

  // PLAFON
  { name: 'Plafon gypsum 9mm + rangka hollow terpasang', unit: 'm2', price: 150000, category: 'Plafon', note: 'Riset pasar 2026-11-10 (jasatukang/finoo) — menggantikan acuan lama 95.000' },
  { name: 'Plafon GRC', unit: 'm2', price: 85000, category: 'Plafon' },

  // FINISHING
  { name: 'Pengecatan dinding (2 lapis)', unit: 'm2', price: 35000, category: 'Cat' },
  { name: 'Pengecatan kayu/besi', unit: 'm2', price: 45000, category: 'Cat' },

  // UTILITAS
  { name: 'Instalasi listrik rumah tinggal', unit: 'lot', price: 3500000, category: 'MEP' },
  { name: 'Titik penerangan terpasang (material + jasa)', unit: 'titik', price: 185000, category: 'MEP', note: 'Riset pasar 2026-11-10 (skala8/Sejasa)' },
  { name: 'Stop kontak terpasang', unit: 'titik', price: 200000, category: 'MEP', note: 'Riset pasar 2026-11-10 (skala8/Sejasa)' },
  { name: 'Sakelar terpasang', unit: 'titik', price: 165000, category: 'MEP', note: 'Riset pasar 2026-11-10 (skala8/Sejasa)' },
  { name: 'Box MCB/PHB terpasang', unit: 'unit', price: 425000, category: 'MEP', note: 'Riset pasar 2026-11-10 (skala8/Sejasa)' },
  { name: 'Instalasi plumbing + sanitair', unit: 'lot', price: 2500000, category: 'MEP' },
  { name: 'Septictank + resapan', unit: 'lot', price: 4500000, category: 'MEP' },

  // JALAN
  { name: 'Lapis aus AC-WC', unit: 'm2', price: 185000, category: 'Jalan' },
  { name: 'Aspal lapen', unit: 'm2', price: 125000, category: 'Jalan' },
  { name: 'Urugan sirtu padat', unit: 'm3', price: 385000, category: 'Jalan' },
  { name: 'Urugan tanah', unit: 'm3', price: 95000, category: 'Jalan' },
  { name: 'Beton K-350 jalan', unit: 'm3', price: 1350000, category: 'Jalan' },
];

/**
 * Format referensi harga sebagai teks KOMPAK untuk prompt AI.
 */
export function formatPriceReferenceForPrompt(): string {
  // Format kompak: nama:harga/satuan, dipisah koma per kategori
  const byCat = new Map<string, string[]>();
  for (const p of JAKARTA_2026_PRICES) {
    if (!byCat.has(p.category)) byCat.set(p.category, []);
    byCat.get(p.category)!.push(`${p.name} Rp${p.price.toLocaleString('id-ID')}/${p.unit}`);
  }

  let out = 'HARGA JAKARTA 2026 (estimasi, bukan HSPK): ';
  const parts: string[] = [];
  for (const [cat, items] of byCat) {
    parts.push(`[${cat}] ${items.join('; ')}`);
  }
  out += parts.join(' | ');
  out += '. Pakai sebagai acuan, label AI_ESTIMATE.';
  return out;
}
