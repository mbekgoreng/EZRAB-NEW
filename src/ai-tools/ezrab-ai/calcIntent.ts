/**
 * EZRAB AI — Intent CALCULATE (src/ai-tools/ezrab-ai/calcIntent.ts)
 *
 * Evaluator hitungan konstruksi DETERMINISTIK, lokal, tanpa LLM (Fase 4 QA
 * kategori B). Router memanggilnya sesudah pola intent lain dan sebelum
 * fallback UNKNOWN: pertanyaan aritmetika yang polanya dikenali PENUH
 * dijawab di sini dengan rumus/langkah yang ditampilkan; pola yang tidak
 * terparse penuh mengembalikan null dan jatuh ke jalur AI seperti biasa.
 *
 * Parser angka format Indonesia: koma desimal ("0,25"), titik ribuan
 * ("Rp85.000", "2.750"), kata skala ("240 juta"), kata bilangan
 * ("delapan pekerja", "empat segmen"), dan satuan cm/mm yang dikonversi
 * ke meter SEBELUM hitung (menutup jebakan B2: tebal 12 cm = 0,12 m).
 *
 * Pertanyaan konseptual (B10/B13/B15 — "mengapa…", "apa yang harus
 * dilakukan…", "apakah boleh…") tidak memuat hitungan konkret sehingga
 * tidak tertangkap di sini dan tetap diteruskan ke AI.
 */

export interface CalcResult {
  /** Pesan jawaban lengkap (Bahasa Indonesia, angka format id-ID). */
  message: string;
}

/* ------------------------------------------------------------------ */
/* Parser angka id-ID                                                  */
/* ------------------------------------------------------------------ */

/** Token angka: "12.500.000" | "0,25" | "85.000" | "2,75" | "125" | "0.25" */
const NUM = String.raw`-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?(?:\.\d{1,2})?`;

export function parseIdNumber(tok: string): number {
  let t = tok.trim();
  const neg = t.startsWith('-');
  if (neg) t = t.slice(1);
  let v: number;
  if (t.includes(',')) {
    // Koma = desimal, titik = ribuan.
    v = parseFloat(t.replace(/\./g, '').replace(',', '.'));
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    // Grup titik tepat 3 digit = pemisah ribuan.
    v = parseFloat(t.replace(/\./g, ''));
  } else {
    v = parseFloat(t);
  }
  return neg ? -v : v;
}

const WORD_NUMBERS: Record<string, number> = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6,
  tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11,
};
const WORD_NUM_ALT = 'dua belas|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas';

function wordOrDigit(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (t === 'dua belas') return 12;
  return WORD_NUMBERS[t] ?? null;
}

const SCALE: Record<string, number> = { ribu: 1e3, juta: 1e6, miliar: 1e9, milyar: 1e9 };

interface MoneyHit { value: number; raw: string }

function extractMoney(text: string): MoneyHit[] {
  const re = new RegExp(String.raw`rp\s*(${NUM})(?:\s*(juta|miliar|milyar|ribu))?`, 'g');
  const out: MoneyHit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const base = parseIdNumber(m[1]);
    const scale = m[2] ? SCALE[m[2]] : 1;
    out.push({ value: base * scale, raw: m[0] });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Format id-ID                                                        */
/* ------------------------------------------------------------------ */

function fmtNum(v: number, maxFrac = 2): string {
  return v.toLocaleString('id-ID', { maximumFractionDigits: maxFrac });
}

function fmtIDR(v: number): string {
  return 'Rp ' + Math.round(v).toLocaleString('id-ID');
}

/* ------------------------------------------------------------------ */
/* Dimensi & satuan                                                    */
/* ------------------------------------------------------------------ */

type LenUnit = 'mm' | 'cm' | 'm';

function toMeters(v: number, u: string | undefined): number {
  if (u === 'mm') return v / 1000;
  if (u === 'cm') return v / 100;
  return v; // 'm' | 'meter' | tak disebut → meter
}

interface Dim { meters: number; raw: string; unit: string | undefined }

function makeDim(numTok: string, unit: string | undefined): Dim {
  return {
    meters: toMeters(parseIdNumber(numTok), unit),
    raw: unit ? `${numTok} ${unit === 'meter' ? 'm' : unit}` : `${numTok} m`,
    unit,
  };
}

const DIM = String.raw`(${NUM})\s*(mm|cm|meter|m)?`;
const TRIPLE_RE = new RegExp(String.raw`${DIM}\s*[×x]\s*${DIM}\s*[×x]\s*${DIM}`);
const PAIR_RE = new RegExp(String.raw`${DIM}\s*[×x]\s*${DIM}`);
const TEBAL_RE = new RegExp(String.raw`\btebal\s*(${NUM})\s*(mm|cm|meter|m)?`);

function conversionNotes(dims: Dim[]): string | null {
  const notes = dims
    .filter((d) => d.unit === 'mm' || d.unit === 'cm')
    .map((d) => `${d.raw} = ${fmtNum(d.meters, 3)} m`);
  return notes.length ? `Konversi satuan: ${notes.join('; ')}.` : null;
}

function rejectNegative(what: string): CalcResult {
  return {
    message:
      `Hasil perhitungan **tidak valid** (${what}). Nilai volume/ukuran tidak boleh nol atau negatif — ` +
      'periksa kembali input dan rumusnya. Nilai seperti ini tidak saya simpan atau tampilkan sebagai hasil yang sah.',
  };
}

/* ------------------------------------------------------------------ */
/* Sub-parser per pola hitungan                                        */
/* ------------------------------------------------------------------ */

/** (f) Konversi satuan: mm/cm/m/km dan m³↔liter. */
function tryConversion(t: string): CalcResult | null {
  if (!/(konversi|menjadi|ke satuan|dalam satuan)/.test(t)) return null;
  // Catatan: \b tidak dipakai sesudah grup satuan — "m³" diakhiri karakter
  // non-kata (³) sehingga \b tidak pernah cocok; pakai lookahead non-huruf.
  const fromRe = new RegExp(String.raw`(${NUM})\s*(mm|cm|meter|km|m³|m3|m|liter|l)(?![a-z])`);
  const fm = t.match(fromRe);
  if (!fm) return null;
  const value = parseIdNumber(fm[1]);
  const fromUnit = fm[2];
  const targetM = t.match(/(?:menjadi|ke|dalam)\s*(meter|mm|cm|km|liter|m³|m3|m)(?![a-z])/);
  if (!targetM) return null;
  const toUnit = targetM[1];

  const lenToM: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, meter: 1, km: 1000 };
  const isVol = (u: string) => u === 'm³' || u === 'm3' || u === 'liter' || u === 'l';
  if (isVol(fromUnit) !== isVol(toUnit)) return null; // lintas dimensi → bukan konversi sah di sini

  let result: number;
  let note: string;
  if (isVol(fromUnit)) {
    const inM3 = fromUnit === 'liter' || fromUnit === 'l' ? value / 1000 : value;
    result = toUnit === 'liter' || toUnit === 'l' ? inM3 * 1000 : inM3;
    note = '1 m³ = 1.000 liter';
  } else {
    result = (value * lenToM[fromUnit]) / lenToM[toUnit];
    note = `1 ${toUnit === 'meter' ? 'm' : toUnit} = ${fmtNum(lenToM[toUnit] / lenToM[fromUnit], 3)} ${fromUnit === 'meter' ? 'm' : fromUnit}`;
  }
  const fromLabel = fromUnit === 'meter' ? 'm' : fromUnit;
  const toLabel = toUnit === 'meter' ? 'm' : toUnit;
  return {
    message:
      `Konversi satuan (${note}):\n` +
      `${fmtNum(value, 3)} ${fromLabel} = **${fmtNum(result, 4)} ${toLabel}**`,
  };
}

/** (d) Penjumlahan deret uang. */
function trySum(t: string): CalcResult | null {
  if (!/(jumlahkan|totalkan|jumlah dari|total dari)/.test(t)) return null;
  const money = extractMoney(t);
  if (money.length < 2) return null;
  const total = money.reduce((s, x) => s + x.value, 0);
  return {
    message:
      `Jumlah = ${money.map((x) => fmtIDR(x.value)).join(' + ')}\n` +
      `= **${fmtIDR(total)}**`,
  };
}

/** (e) PPN / persen dari nilai uang. Tarif selalu dibingkai ASUMSI soal. */
function tryPercent(t: string): CalcResult | null {
  const pctM = t.match(new RegExp(String.raw`(${NUM})\s*%`));
  if (!pctM) return null;
  const hasPpn = /\bppn\b/.test(t);
  if (!hasPpn && !/(dari|subtotal|harga|total|nilai)/.test(t)) return null;
  const money = extractMoney(t);
  if (money.length === 0) return null;
  const base = money[0].value;
  const pct = parseIdNumber(pctM[1]);
  if (base < 0 || pct < 0) return rejectNegative('nilai dasar atau persen negatif');
  const part = (base * pct) / 100;
  if (hasPpn) {
    return {
      message:
        `PPN = ${fmtNum(pct)}% × ${fmtIDR(base)} = **${fmtIDR(part)}**\n` +
        `Total = ${fmtIDR(base)} + ${fmtIDR(part)} = **${fmtIDR(base + part)}**\n` +
        `Catatan: tarif ${fmtNum(pct)}% adalah **asumsi sesuai soal Anda** — bukan tarif resmi yang saya tetapkan; tarif yang dipakai mengikuti ketentuan dan dokumen proyek Anda.`,
    };
  }
  return {
    message: `${fmtNum(pct)}% dari ${fmtIDR(base)} = **${fmtIDR(part)}**`,
  };
}

/** (i) Selisih dua nilai + persen selisih terhadap basis. */
function tryDifference(t: string): CalcResult | null {
  if (!/\bselisih\b/.test(t)) return null;
  const numUnitRe = new RegExp(String.raw`(${NUM})\s*(m³|m3|m²|m2|liter|kg|m|bh|unit)`, 'g');
  const hits: Array<{ v: number; unit: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = numUnitRe.exec(t)) !== null) {
    hits.push({ v: parseIdNumber(m[1]), unit: m[2] });
  }
  if (hits.length < 2) return null;
  const a = hits[0];
  const b = hits[1];
  const baseM = t.match(new RegExp(String.raw`terhadap\s*(${NUM})`));
  const base = baseM ? parseIdNumber(baseM[1]) : b.v;
  if (base === 0) return null;
  const diff = Math.abs(a.v - b.v);
  const pct = (diff / Math.abs(base)) * 100;
  return {
    message:
      `Selisih = ${fmtNum(Math.max(a.v, b.v), 3)} − ${fmtNum(Math.min(a.v, b.v), 3)} = **${fmtNum(diff, 3)} ${a.unit}**\n` +
      `Persentase selisih terhadap ${fmtNum(base, 3)} ${a.unit} = ${fmtNum(diff, 3)} ÷ ${fmtNum(base, 3)} × 100% = **${fmtNum(pct, 2)}%**`,
  };
}

/** (g) Produktivitas per pekerja per hari. */
function tryProductivity(t: string): CalcResult | null {
  if (!/(produktivitas|pekerja)/.test(t)) return null;
  const workersM = t.match(new RegExp(String.raw`\b(${WORD_NUM_ALT}|\d+)\s*(pekerja|orang|tukang)`));
  const daysM = t.match(new RegExp(String.raw`(${NUM})\s*hari\b`));
  const outM = t.match(new RegExp(String.raw`(${NUM})\s*(m²|m2|m³|m3|m|bh|unit)`));
  if (!workersM || !daysM || !outM) return null;
  const workers = wordOrDigit(workersM[1]);
  const days = parseIdNumber(daysM[1]);
  const output = parseIdNumber(outM[1]);
  if (workers === null || workers <= 0 || days <= 0 || output < 0) return null;
  const per = output / (workers * days);
  return {
    message:
      `Produktivitas = hasil ÷ (pekerja × hari) = ${fmtNum(output, 3)} ${outM[2]} ÷ (${workers} × ${fmtNum(days, 3)})\n` +
      `= **${fmtNum(per, 3)} ${outM[2]}/orang/hari**`,
  };
}

/** (h) Pembagian panjang menjadi segmen sama. */
function trySegments(t: string): CalcResult | null {
  if (!/(segmen|dibagi menjadi|dibagi rata|bagian sama)/.test(t)) return null;
  const lenM = t.match(new RegExp(String.raw`(${NUM})\s*(mm|cm|meter|m)\b`));
  if (!lenM) return null;
  const divM =
    t.match(new RegExp(String.raw`(?:menjadi|dibagi|ke dalam)\s*(${WORD_NUM_ALT}|\d+)`)) ||
    t.match(new RegExp(String.raw`\b(${WORD_NUM_ALT}|\d+)\s*(segmen|bagian)`));
  if (!divM) return null;
  const divisor = wordOrDigit(divM[1]);
  if (divisor === null || divisor <= 0) return null;
  const length = toMeters(parseIdNumber(lenM[1]), lenM[2]);
  if (length <= 0) return rejectNegative('panjang segmen tidak positif');
  const each = length / divisor;
  return {
    message:
      `Panjang tiap segmen = ${fmtNum(length, 3)} m ÷ ${divisor}\n` +
      `= **${fmtNum(each, 3)} m**`,
  };
}

/** (b) Luas bersih dinding satu bidang dengan bukaan pintu/jendela. */
function tryWallArea(t: string): CalcResult | null {
  if (!/\bdinding\b/.test(t)) return null;
  if (!/(pintu|jendela|bukaan|bersih)/.test(t)) return null;
  const pair = t.match(PAIR_RE);
  if (!pair) return null;
  const wallP = makeDim(pair[1], pair[2]);
  const wallH = makeDim(pair[3], pair[4]);
  const gross = wallP.meters * wallH.meters;

  const openRe = new RegExp(
    String.raw`\b(${WORD_NUM_ALT}|\d+)?\s*(pintu|jendela|bukaan)\s*(${NUM})\s*(mm|cm|meter|m)?\s*[×x]\s*(${NUM})\s*(mm|cm|meter|m)?`,
    'g',
  );
  let totalOpen = 0;
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(t)) !== null) {
    const count = m[1] ? (wordOrDigit(m[1]) ?? 1) : 1;
    const op = makeDim(m[3], m[4]);
    const oh = makeDim(m[5], m[6]);
    const area = count * op.meters * oh.meters;
    totalOpen += area;
    parts.push(`${count} ${m[2]} (${fmtNum(op.meters, 3)} × ${fmtNum(oh.meters, 3)} = ${fmtNum(area, 3)} m²)`);
  }
  if (parts.length === 0) {
    const tot = t.match(new RegExp(String.raw`bukaan\s*(?:total\s*)?(${NUM})\s*m(?:2|²)`));
    if (!tot) return null;
    totalOpen = parseIdNumber(tot[1]);
    parts.push(`total bukaan ${fmtNum(totalOpen, 3)} m²`);
  }
  if (gross <= 0) return rejectNegative('luas dinding tidak positif');
  const net = gross - totalOpen;
  if (net < 0) {
    return {
      message:
        `Hasil perhitungan **tidak valid**: total bukaan (${fmtNum(totalOpen, 3)} m²) melebihi luas dinding ` +
        `(${fmtNum(gross, 3)} m²) sehingga luas bersih negatif. Periksa kembali ukuran dinding dan bukaannya — nilai ini tidak sah untuk dipakai.`,
    };
  }
  return {
    message:
      `Luas dinding (kotor) = ${fmtNum(wallP.meters, 3)} × ${fmtNum(wallH.meters, 3)} = ${fmtNum(gross, 3)} m²\n` +
      `Bukaan: ${parts.join('; ')} → total ${fmtNum(totalOpen, 3)} m²\n` +
      `Luas bersih = ${fmtNum(gross, 3)} − ${fmtNum(totalOpen, 3)} = **${fmtNum(net, 3)} m²**`,
  };
}

/** (a) Volume balok/pelat/galian: p × l × t (atau p × l + tebal). */
function tryVolume(t: string): CalcResult | null {
  if (!/\bvolume\b/.test(t)) return null;
  let dims: Dim[] | null = null;
  const triple = t.match(TRIPLE_RE);
  if (triple) {
    dims = [makeDim(triple[1], triple[2]), makeDim(triple[3], triple[4]), makeDim(triple[5], triple[6])];
  } else {
    const pair = t.match(PAIR_RE);
    const tebal = t.match(TEBAL_RE);
    if (pair && tebal) {
      dims = [makeDim(pair[1], pair[2]), makeDim(pair[3], pair[4]), makeDim(tebal[1], tebal[2])];
    }
  }
  if (!dims) return null;
  if (dims.some((d) => d.meters <= 0)) return rejectNegative('ada dimensi bernilai nol/negatif');
  const v = dims[0].meters * dims[1].meters * dims[2].meters;
  const label = /balok/.test(t)
    ? 'balok'
    : /pelat|plat/.test(t)
      ? 'pelat'
      : /galian/.test(t)
        ? 'galian'
        : 'benda';
  const conv = conversionNotes(dims);
  return {
    message:
      `Volume ${label} = panjang × lebar × tinggi\n` +
      (conv ? `${conv}\n` : '') +
      `= ${dims.map((d) => fmtNum(d.meters, 3)).join(' × ')} m\n` +
      `= **${fmtNum(v, 3)} m³**`,
  };
}

/** (c) Subtotal: kuantitas (ber-satuan) × harga satuan Rupiah. */
function trySubtotal(t: string): CalcResult | null {
  if (!/(harga|subtotal|total harga)/.test(t)) return null;
  const money = extractMoney(t);
  if (money.length === 0) return null;
  const price = money[money.length - 1].value;
  const qtyM = t.match(new RegExp(String.raw`(${NUM})\s*(m²|m2|m³|m3|m|bh|buah|unit|ls|kg|lembar|batang|set)`));
  if (!qtyM) return null;
  const qty = parseIdNumber(qtyM[1]);
  if (qty < 0 || price < 0) return rejectNegative('kuantitas atau harga satuan negatif');
  const total = qty * price;
  return {
    message:
      `Subtotal = kuantitas × harga satuan\n` +
      `= ${fmtNum(qty, 3)} ${qtyM[2]} × ${fmtIDR(price)}\n` +
      `= **${fmtIDR(total)}**`,
  };
}

/* ------------------------------------------------------------------ */
/* Evaluator utama                                                     */
/* ------------------------------------------------------------------ */

/**
 * Evaluasi teks pengguna sebagai hitungan deterministik. Mengembalikan
 * null bila tidak ada pola yang terparse PENUH — pemanggil meneruskan
 * ke jalur AI seperti biasa (tidak ada pemaksaan).
 */
export function evaluateCalculation(rawText: string): CalcResult | null {
  const t = ` ${rawText.toLowerCase().trim().replace(/\s+/g, ' ')} `;
  if (!/\d/.test(t) && !new RegExp(`\\b(${WORD_NUM_ALT})\\b`).test(t)) return null;
  const parsers = [
    tryConversion,
    trySum,
    tryPercent,
    tryDifference,
    tryProductivity,
    trySegments,
    tryWallArea,
    tryVolume,
    trySubtotal,
  ];
  for (const p of parsers) {
    const r = p(t);
    if (r) return r;
  }
  return null;
}
