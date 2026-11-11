/**
 * Test: WAVE E — RETRIEVAL CALIBRATION (keputusan owner 2026-11-11
 * 23:45: perluas gerbang relevansi ke kategori lain secara BERTAHAP
 * berdasarkan data uji).
 *
 * Metode kalibrasi: seluruh 180 template katalog digenerate dengan
 * parameter default (1.699 item) dan matriks proyek × item dijalankan.
 * Aturan gerbang Gelombang E hanya ditambah di tempat data itu
 * menunjukkan celah nyata (sebelum Wave E, di luar gudang/gedung,
 * 100% item asing lolos sebagai MEDIUM — tidak ada penolakan sama
 * sekali). Invarian yang dikunci suite ini:
 *  (1) NOL item template kategori sendiri yang tertolak/LOW untuk
 *      setiap id proyek yang dihubungkan gerbang di buildUniversalDraft
 *      (diuji LIVE atas seluruh katalog, bukan sampel);
 *  (2) keluarga kontaminan khas tiap kategori (sistem aspal jalan,
 *      interior hunian, sistem kolam renang, sistem gedung khusus,
 *      direksi keet) TERTOLAK — dengan redaksi item VERBATIM katalog;
 *  (3) keputusan kalibrasi yang disengaja TIDAK berbalik: paving &
 *      kanstin hardscape taman lolos untuk landscape; trotoar lantai
 *      jembatan lolos untuk jembatan; "kolam retensi" lolos untuk
 *      irigasi; keluarga jalan tidak ditolak untuk drainase
 *      (cross-drain jalan adalah pekerjaan drainase yang sah);
 *  (4) CASE B (gudang baja) & jalur draft nyata per kategori tetap
 *      utuh — nol catatan gerbang pada draft yang sah;
 *  (5) kategori GAP (lift/eskalator, playground) tetap tercatat
 *      'tidak-ada' di matriks cakupan — tidak dikalibrasi paksa dan
 *      tidak diciptakan dukungannya.
 * Pemilihan SUBTIPE jalan tidak diasersi (protected flow owner).
 *
 * PAGAR: LOKAL SAJA — tanpa commit/push/deploy; metering/auth tidak
 * disentuh; prompt kanonis v2.0.0 tidak diubah gelombang ini.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyItemRelevance, filterItemsByRelevance,
} from '../ai-tools/ezrab-ai/relevanceGate';
import {
  buildUniversalDraft, effectiveItems, gateProjectIdFor, SCOPE_GROUPS,
} from '../ai-tools/ezrab-ai/universalRab';
import { RabTemplateService } from '../services/rabTemplateService';
import {
  coverageFor, subcategoryById,
} from '../ai-tools/ezrab-ai/universalIntake';
import { runTool } from '../ai-tools/ezrab-ai/tools';

const lvl = (item: string, pid: string, explicit: string[] = []) =>
  classifyItemRelevance(item, pid, explicit).level;

/* Item VERBATIM katalog (sumber template dicatat per baris). */
const ROAD_ITEMS = [
  'Lapis Aus Aspal Beton AC-WC t=4 cm Padat', // INFRA-ROAD-ASPHALT
  'Lapis Resap Pengikat (Prime Coat) 0.8 L/m²', // INFRA-ROAD-ASPHALT
  'Pemasangan Paving Block K-300 Komplit Pasir Pengisi (Abu Batu)', // PAV-KOMPLEK-6CM
  'Marka Garis Tepi & Tengah Jalan Termoplastik 12 cm', // Rehabilitasi Jalan Aspal
  'Kanstin Trotoar & Saluran Tepi Beton K-250', // INFRA-ROAD-ASPHALT
];
const INTERIOR_ITEMS = [
  'Plafon Gypsum Board Tebal 9 mm & Rangka Hollow', // Rumah Type 36
  'Kloset Duduk Monoblok per Kamar Mandi', // FIN-KITCHEN-BATH
  'Wastafel Meja + Kabinet Kecil per Kamar Mandi', // FIN-KITCHEN-BATH
  'Kitchen Set Custom per Unit (Kabinet Bawah + Atas + Top Granit)', // FIN-KITCHEN-BATH
  'Partisi Gypsum 1 Muka + Plester + Rangka Semi Mekanis', // FIN-OFFICE-FITOUT
];
const POOL_ITEMS = [
  'Keramik Kolam & Waterline (Pemasangan Keramik Dinding setara Paket Kolam)', // SPT-SWIMMING-POOL
  'Waterproofing Coating Dinding & Lantai Kolam', // SPT-SWIMMING-POOL
  'Ruang Pompa, Filter Pasir & Pompa Sirkulasi (Paket Sistem Dasar)', // SPT-SWIMMING-POOL
];
const SYSTEM_ITEMS = [
  'Outlet Gas Medis per Bedhead (O₂ + Vakum + Udara)', // Instalasi Gas Medis RS
  'Pemasangan Instalasi Lift Penumpang 8 Orang', // redaksi sistem lift gedung
  'Instalasi Eskalator Gedung Perbelanjaan', // redaksi sistem eskalator gedung
];
const KEET = 'Pembuatan Direksi Keet'; // redaksi kasus liar CASE B (owner S3)

describe('Wave E — kalibrasi per kategori: kontaminan tertolak (redaksi verbatim katalog)', () => {
  it('kandang: sistem aspal, paving, interior, kolam renang, gas medis, direksi keet → REJECTED', () => {
    for (const i of [...ROAD_ITEMS, ...INTERIOR_ITEMS, ...POOL_ITEMS, ...SYSTEM_ITEMS, KEET]) {
      expect(lvl(i, 'kandang')).toBe('REJECTED');
    }
  });
  it('kolam: sistem aspal, interior, direksi keet → REJECTED; item kolam sendiri HIGH', () => {
    for (const i of [...ROAD_ITEMS, ...INTERIOR_ITEMS, KEET]) {
      expect(lvl(i, 'kolam')).toBe('REJECTED');
    }
    for (const i of POOL_ITEMS) expect(lvl(i, 'kolam')).not.toBe('REJECTED');
    expect(lvl('Beton Kedap Air Struktur Kolam (Aditif)', 'kolam')).toBe('HIGH');
  });
  it('jalan (keluarga + subtipe): interior, kolam renang, gas medis → REJECTED; item jalan sendiri HIGH', () => {
    for (const pid of ['jalan', 'jalan-aspal', 'jalan-beton', 'jalan-lingkungan', 'jalan-tol']) {
      for (const i of [...INTERIOR_ITEMS, ...POOL_ITEMS, ...SYSTEM_ITEMS]) {
        expect(lvl(i, pid)).toBe('REJECTED');
      }
      expect(lvl('Lapis Aus Aspal Beton AC-WC t=4 cm Padat', pid)).toBe('HIGH');
    }
    // Keputusan terkalibrasi: "Ubin Granit" halte BRT BUKAN "granit tile" interior.
    expect(lvl('Lantai Ubin Granit Platform Halte', 'jalan')).not.toBe('REJECTED');
  });
  it('drainase: interior & kolam renang → REJECTED; keluarga jalan TIDAK ditolak (cross-drain sah)', () => {
    for (const i of [...INTERIOR_ITEMS, ...POOL_ITEMS]) {
      expect(lvl(i, 'drainase')).toBe('REJECTED');
    }
    expect(lvl('Pemasangan Saluran Beton Precast U-Ditch Komplit Joint Mortar', 'drainase')).toBe('HIGH');
    // Keputusan kalibrasi yang disengaja — dicatat, bukan kebocoran:
    // drainase tepi & cross-drain adalah bagian pekerjaan jalan yang
    // dilayani scope drainase, jadi keluarga jalan tidak digerbang di sini.
    expect(lvl('Kanstin Trotoar & Saluran Tepi Beton K-250', 'drainase')).not.toBe('REJECTED');
  });
  it('irigasi/bendung: aspal & interior → REJECTED; "kolam retensi" bangunan air LOLOS (bukan kolam renang)', () => {
    for (const pid of ['irigasi', 'bendung']) {
      for (const i of [ROAD_ITEMS[0], ROAD_ITEMS[1], ...INTERIOR_ITEMS]) {
        expect(lvl(i, pid)).toBe('REJECTED');
      }
      expect(lvl('Galian Tanah Kolam Retensi Menggunakan Excavator', pid)).not.toBe('REJECTED');
      expect(lvl('Pembersihan & Pengupasan Area Bendung', pid)).toBe('HIGH');
    }
  });
  it('landscape & pagar: sistem aspal → REJECTED; paving/kanstin hardscape taman LOLOS (keputusan kalibrasi)', () => {
    for (const pid of ['lanskap', 'pagar-gerbang', 'landscape-perumahan', 'taman-kota']) {
      expect(lvl('Lapis Aus Aspal Beton AC-WC t=4 cm Padat', pid)).toBe('REJECTED');
      expect(lvl('Marka Garis Tepi & Tengah Jalan Termoplastik 12 cm', pid)).toBe('REJECTED');
      expect(lvl(INTERIOR_ITEMS[0], pid)).toBe('REJECTED');
      // Hardscape taman yang sah menurut template katalog landscape sendiri:
      expect(lvl('Pemasangan Paving Dekoratif Plaza Pejalan Kaki', pid)).not.toBe('REJECTED');
      expect(lvl('Kanstin Pembatas Taman & Rumput', pid)).not.toBe('REJECTED');
    }
  });
  it('jembatan: interior & kolam renang → REJECTED; trotoar lantai jembatan LOLOS (keputusan kalibrasi)', () => {
    for (const i of [...INTERIOR_ITEMS, ...POOL_ITEMS]) {
      expect(lvl(i, 'jembatan')).toBe('REJECTED');
    }
    expect(lvl('Beton Lantai Kendaraan & Trotoar fc 15 MPa', 'jembatan')).not.toBe('REJECTED');
  });
  it('renovasi: sistem aspal & kolam renang → REJECTED; interior renovasi LOLOS (inti renovasi)', () => {
    for (const i of [ROAD_ITEMS[0], ROAD_ITEMS[2], ...POOL_ITEMS]) {
      expect(lvl(i, 'renovasi')).toBe('REJECTED');
    }
    expect(lvl('Penggantian Plafon Gypsum 9mm Rangka Hollow Baru', 'renovasi')).not.toBe('REJECTED');
    expect(lvl('Renovasi Total Kamar Mandi Keramik Dinding & Kloset Duduk Baru', 'renovasi')).not.toBe('REJECTED');
  });
  it('pelabuhan, pekerjaan-tanah, pondasi: kontaminan lintas keluarga → REJECTED', () => {
    for (const pid of ['pelabuhan', 'pekerjaan-tanah', 'pondasi']) {
      for (const i of [ROAD_ITEMS[0], INTERIOR_ITEMS[0], INTERIOR_ITEMS[1], POOL_ITEMS[0], KEET]) {
        expect(lvl(i, pid)).toBe('REJECTED');
      }
    }
    expect(lvl('Pengeboran Bored Pile Tanah Keras/Berbatu (per m, Padanan Ø20 Disesuaikan)', 'pondasi')).toBe('HIGH');
    expect(lvl('Timbunan Tanah Biasa Badan Jalan (Urugan Liat setara, Berlapis)', 'pekerjaan-tanah')).not.toBe('REJECTED');
  });
  it('cakupan eksplisit pengguna selalu menang atas gerbang (jalan/finishing/kolam/mep)', () => {
    expect(lvl(ROAD_ITEMS[2], 'kandang', ['jalan'])).not.toBe('REJECTED');
    expect(lvl(INTERIOR_ITEMS[0], 'kandang', ['finishing'])).not.toBe('REJECTED');
    expect(lvl(POOL_ITEMS[0], 'jalan', ['kolam'])).not.toBe('REJECTED');
    expect(lvl(SYSTEM_ITEMS[0], 'kandang', ['mep'])).not.toBe('REJECTED');
  });
  it('item inti per kategori terklasifikasi HIGH (kalibrasi positif)', () => {
    expect(lvl('Lantai Beton Kandang Miring Drainase (Pasangan Lantai Beton 5 cm + Screed)', 'kandang')).toBe('HIGH');
    expect(lvl('Pagar Pembatas Kandang Besi Pipa & Kayu (Paket per m)', 'kandang')).toBe('HIGH');
    expect(lvl('Pemasangan Saluran Beton Precast U-Ditch Komplit Joint Mortar', 'irigasi')).not.toBe('REJECTED');
    expect(lvl('Penanaman Rumput Taman Gajah Mini Komplit Tanah Humus t=10cm', 'lanskap')).toBe('HIGH');
    expect(lvl('Pintu Gerbang Utama Rangka Besi Hollow Dorong Lebar 6m', 'pagar-gerbang')).toBe('HIGH');
  });
});

describe('Wave E — invarian panen katalog LIVE: nol item sendiri tertolak', () => {
  // Pemetaan kategori katalog → id proyek yang dihubungkan gerbang di
  // buildUniversalDraft (gateProjectIdFor). Kategori tanpa pemetaan
  // (komponen/finishing/MEP/utilitas/demolisi + olahraga non-kolam)
  // dihitung eksplisit sebagai TIDAK DIGERBANG gelombang ini.
  const CAT_TO_PID: Record<string, string[]> = {
    INDUSTRI: ['gedung'], GEDUNG: ['gedung'], BANGUNAN_TINGGI: ['gedung'],
    HOTEL_HOSPITALITY: ['gedung'], KESEHATAN: ['gedung'], PENDIDIKAN: ['gedung'],
    RUMAH_TINGGAL: ['gedung'],
    PERTANIAN_PERKEBUNAN: ['kandang'],
    JALAN_TRANSPORTASI: ['jalan'], PERKERASAN: ['jalan'],
    DRAINASE_SANITASI: ['drainase'], SDA_IRIGASI: ['drainase', 'irigasi'],
    LANDSCAPE_SITE: ['lanskap', 'pagar-gerbang'],
    JEMBATAN_STRUKTUR: ['jembatan'], RENOVASI_MAINTENANCE: ['renovasi'],
    PELABUHAN_PESISIR: ['pelabuhan'], PEKERJAAN_TANAH: ['pekerjaan-tanah'],
    PONDASI_GEOTEKNIK: ['pondasi'],
  };
  it('seluruh template kategori terpetakan: tidak ada item yang REJECTED/LOW untuk proyeknya sendiri', () => {
    const svc = RabTemplateService.getInstance();
    const violations: string[] = [];
    let checked = 0;
    let ungatedTemplates = 0;
    for (const t of svc.getAllTemplates()) {
      const pids = CAT_TO_PID[t.category];
      const isPool = t.id === 'SPT-SWIMMING-POOL';
      const myPids = isPool ? ['kolam'] : pids;
      if (!myPids) { ungatedTemplates++; continue; }
      const params: Record<string, number> = {};
      for (const p of (t.parameters || []) as any[]) {
        const d = (p as any).defaultValue ?? (p as any).default ?? (p as any).min ?? 1;
        if (typeof d === 'number') params[p.key] = d;
      }
      const g: any = svc.generateRabFromTemplate(t as any, params, undefined, 'PROFESSIONAL', []);
      for (const pid of myPids) {
        for (const item of g.items || []) {
          checked++;
          const v = classifyItemRelevance(item.description, pid);
          if (v.level === 'REJECTED' || v.level === 'LOW') {
            violations.push(`[${pid}] ${t.id} :: ${item.description} → ${v.level}`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(ungatedTemplates).toBeGreaterThan(0); // skip eksplisit, bukan diam-diam
    expect(violations).toEqual([]);
  });
});

describe('Wave E — pemetaan gerbang di jalur draft (gateProjectIdFor)', () => {
  const scope = (id: string) => SCOPE_GROUPS.find((s) => s.id === id)!;
  it('keluarga terkalibrasi terpetakan; komponen/demolisi/non-kolam olahraga BELUM digerbang (null)', () => {
    expect(gateProjectIdFor(scope('gedung'), 'bangun gudang baja')).toBe('gudang-industri');
    expect(gateProjectIdFor(scope('gedung'), 'kantor 3 lantai')).toBe('gedung');
    expect(gateProjectIdFor(scope('pertanian'), 'kandang sapi 50 ekor')).toBe('kandang');
    expect(gateProjectIdFor(scope('pertanian'), 'greenhouse sayur')).toBeNull();
    expect(gateProjectIdFor(scope('olahraga'), 'kolam renang 8 x 4')).toBe('kolam');
    expect(gateProjectIdFor(scope('olahraga'), 'lapangan futsal')).toBeNull();
    expect(gateProjectIdFor(scope('jalan'), 'jalan desa 2 km')).toBe('jalan');
    expect(gateProjectIdFor(scope('drainase'), 'u-ditch 300 m')).toBe('drainase');
    expect(gateProjectIdFor(scope('irigasi'), 'saluran irigasi')).toBe('irigasi');
    expect(gateProjectIdFor(scope('lanskap'), 'pagar tembok 80 m')).toBe('pagar-gerbang');
    expect(gateProjectIdFor(scope('lanskap'), 'taman kawasan')).toBe('lanskap');
    expect(gateProjectIdFor(scope('jembatan'), 'jembatan 6 m')).toBe('jembatan');
    expect(gateProjectIdFor(scope('pondasi'), 'bore pile')).toBe('pondasi');
    expect(gateProjectIdFor(scope('renovasi'), 'renovasi rumah')).toBe('renovasi');
    expect(gateProjectIdFor(scope('pelabuhan'), 'dermaga')).toBe('pelabuhan');
    expect(gateProjectIdFor(scope('tanah'), 'galian dan urugan')).toBe('pekerjaan-tanah');
    for (const id of ['struktur', 'atap', 'finishing', 'mep', 'sanitasi', 'demolisi']) {
      expect(gateProjectIdFor(scope(id as never), 'teks apa pun')).toBeNull();
    }
  });
});

describe('Wave E — jalur draft nyata: draft sah utuh, kontaminasi paksa tersaring', () => {
  const gateNotes = (b: any): string[] =>
    (b.kind === 'draft' ? (b.draft.warnings ?? []) : []).filter((w: string) => w.includes('Gerbang relevansi'));
  const cleanDraft = (text: string) => {
    const b = buildUniversalDraft(text);
    expect(b.kind).toBe('draft');
    if (b.kind !== 'draft') return b;
    expect(gateNotes(b)).toEqual([]);
    return b;
  };
  it('draft sah per kategori: nol catatan gerbang & nol item tertolak (kandang, kolam, jalan, drainase, pagar, taman, renovasi)', () => {
    cleanDraft('Buatkan RAB kandang sapi untuk 50 ekor, ukuran 10 × 25 meter.');
    cleanDraft('Buatkan RAB kolam renang ukuran 8 × 4 meter kedalaman 1,4 meter.');
    cleanDraft('Buat RAB pembangunan jalan desa panjang 2 km dan lebar 4 meter.');
    cleanDraft('Buatkan RAB saluran drainase u-ditch panjang 300 meter.');
    cleanDraft('Buatkan RAB pagar tembok keliling panjang 80 meter tinggi 2 meter.');
    cleanDraft('Buatkan RAB taman kawasan dan plaza publik seluas 1000 m².');
    cleanDraft('Saya mau renovasi rumah lama seluas 90 m², fokus dapur dan kamar mandi.');
  });
  it('KONTAMINASI PAKSA kandang ← template jalan hotmix: semua item bertanda tangan jalan tersaring di jalur nyata', () => {
    const b = buildUniversalDraft('Buatkan RAB kandang sapi untuk 50 ekor, ukuran 10 × 25 meter.', 'INFRA-ROAD-ASPHALT');
    const kept = b.kind === 'draft' ? effectiveItems(b.draft).map((i) => i.description.toLowerCase()) : [];
    for (const d of kept) {
      expect(d).not.toMatch(/aspal|hotmix|marka|kanstin|agregat kelas|prime coat|tack coat|ac-wc|ac-bc|lapis resap|lapis perekat/);
    }
    expect(gateNotes(b).length).toBeGreaterThanOrEqual(5);
  });
  it('KONTAMINASI PAKSA kolam ← template finishing dapur/kamar mandi: item interior tersaring di jalur nyata', () => {
    const b = buildUniversalDraft('Buatkan RAB kolam renang ukuran 8 × 4 meter kedalaman 1,4 meter.', 'FIN-KITCHEN-BATH');
    const kept = b.kind === 'draft' ? effectiveItems(b.draft).map((i) => i.description.toLowerCase()) : [];
    for (const d of kept) {
      expect(d).not.toMatch(/kloset|wastafel|shower|kitchen set/);
    }
    expect(gateNotes(b).length).toBeGreaterThanOrEqual(3);
  });
  it('filterItemsByRelevance: catatan penolakan transparan menyebut item & alasannya', () => {
    const { kept, notes } = filterItemsByRelevance(
      [{ description: 'Lantai Beton Kandang Miring Drainase (Pasangan Lantai Beton 5 cm + Screed)' },
       { description: 'Pemasangan Paving Block K-300 Komplit Pasir Pengisi (Abu Batu)' }],
      'kandang',
    );
    expect(kept).toHaveLength(1);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('Paving Block');
    expect(notes[0]).toContain('REJECTED');
  });
});

describe('Wave E — kategori GAP tetap jujur (tidak dikalibrasi paksa)', () => {
  it('lift & playground: matriks cakupan katalog = tidak-ada, 0 template', () => {
    for (const id of ['lift', 'playground']) {
      const cov = coverageFor(subcategoryById(id)!);
      expect(cov.support).toBe('tidak-ada');
      expect(cov.categoryTemplateCount).toBe(0);
      expect(cov.specificTemplateCount).toBe(0);
    }
  });
  it('gerbang tidak mengarang kalibrasi untuk GAP: id di luar keluarga terkalibrasi tidak menolak interior', () => {
    // 'lift' & 'playground' tidak masuk satu pun set keluarga Wave E —
    // perilaku gerbang untuk keduanya tetap lintasan generik (MEDIUM),
    // dinyatakan BELUM terkalibrasi, bukan ditolak/didukung diam-diam.
    expect(lvl(INTERIOR_ITEMS[0], 'playground')).toBe('MEDIUM');
    expect(lvl(ROAD_ITEMS[0], 'lift')).toBe('MEDIUM');
  });
});

describe('Wave E — D-T2: teks petunjuk NOT_FOUND cari_template_rab netral kategori', () => {
  it('pertanyaan kandang sapi menerima petunjuk tanpa contoh khusus jalan/paving', () => {
    const out = String(runTool('cari_template_rab', { kata_kunci: 'kandang sapi' }));
    expect(out).toContain('Tidak ada template RAB maupun item AHSP');
    expect(out).not.toContain('paving blok');
    expect(out).not.toContain('jenis jalan');
    expect(out).toContain('kandang');
  });
});
