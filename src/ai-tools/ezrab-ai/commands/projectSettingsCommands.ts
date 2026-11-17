/**
 * EZRAB Chat AI — perintah deterministik PENGATURAN PROYEK (gap P4 audit
 * perintah Ezrab AI, 2026-11-17; matriks L #43–#44).
 *
 * Satu intent: UPDATE_PROJECT_SETTINGS — "ubah overhead jadi 10%",
 * "overhead 10%", "PPN 11%", "profit 5%", "ubah profit jadi 7,5%".
 * Pola persis RENAME_PROJECT: intent deterministik lokal (tanpa AI, tanpa
 * kredit) + eksekusi lewat callback view (`updateProject` milik aplikasi).
 * Modul ini TIDAK mengimpor ProjectContext — semua aksi lewat callback ctx.
 * Koordinator me-wiring: pola ke PATTERNS (intentRouter.ts), case ke
 * executeIntent (actionRegistry.ts), callback ke view.tsx (lihat WIRING
 * SPEC di laporan kelompok 5).
 *
 * ATURAN 0 vs BELUM-DIATUR (jebakan utama kelompok ini — baca sebelum ubah):
 * - Patch HANYA berisi field yang DISEBUT dalam perintah. Field yang tidak
 *   disebut TIDAK PERNAH ditulis — apalagi ditulis 0. Alasannya:
 *   `resolveProjectFormConfig` (engine/projectCostConfig.ts) membaca
 *   field proyek → costSummary → default mesin; form lama `(field) ?? 0`
 *   + Save polos pernah MENIMPA profit 5% demo menjadi 0 dan menjatuhkan
 *   total emas Rp1.089.879.733 → Rp1.040.339.744 (komentar
 *   UnifiedSettingsView.tsx:377-382). Perintah chat tidak boleh mengulang
 *   itu: `updateProject` adalah merge parsial (ProjectContext.tsx:1331),
 *   jadi patch parsial aman — selama patch-nya benar-benar parsial.
 * - Nilai 0 EKSPLISIT ("overhead 0%") adalah perintah yang sah dan HARUS
 *   diterapkan (0 ≠ "tidak disebut"). Keputusan owner 2026-11-08 (default
 *   proyek belum dikonfigurasi = overhead 0% / profit 0%) tidak dirusak:
 *   handler tidak pernah menulis field yang tidak disebut.
 * - Validasi all-or-nothing: tiap nilai harus 0–100; bila SATU pun tidak
 *   valid, TIDAK ADA field yang diterapkan.
 *
 * KEPUTUSAN PPN (dibuktikan dari kode, bukan asumsi):
 * - "PPN 11%" → patch { ppnPercent: 11, ppnEnabled: true }.
 *   ppnEnabled WAJIB ikut: mesin kanonis meng-gate PPN pada flag itu —
 *   `taxAmount = ppnEnabled ? … : 0` (unifiedProjectEngine.ts:150,162-164;
 *   kebijakan opt-in owner 2026-10-27). Tanpa flag, mengubah tarif tidak
 *   mengubah total sama sekali (no-op diam-diam). Balasan sukses menyebut
 *   "(diaktifkan)" agar flip flag ini terlihat pengguna.
 * - taxPercent TIDAK ditulis. Jalur kanonis membaca tarif PPN dari FIELD
 *   PROYEK `ppnPercent` — `recalculateProjectSummary` memberi mesin
 *   `taxPercent: (p as any)?.ppnPercent ?? cs.taxPercent`
 *   (ProjectContext.tsx:1237); tidak ada pembaca kanonis yang membaca
 *   field `taxPercent` dari record Proyek (yang dibaca
 *   versionAndScenarioEngine.ts:178 adalah `taxPercent` dari config
 *   `Partial<ProjectCostSummary` hasil resolver, bukan dari proyek).
 *   `taxPercent: Number(projPpn)` di save UnifiedSettingsView.tsx:474
 *   adalah cermin legacy; EstimatorSettingsView.tsx:52-61 menyimpan
 *   tanpa taxPercent. Menulisnya dari chat hanya menambah field yang
 *   tidak dibaca siapa pun.
 *
 * KEPUTUSAN PPh: DIDUKUNG — "PPh 2%" → { pphPercent: 2, pphEnabled: true }.
 * Field-nya jelas dari kode: dibaca `recalculateProjectSummary`
 * (ProjectContext.tsx:1239-1240, via cast — tidak terdeklarasi di
 * interface Project), di-gate mesin (unifiedProjectEngine.ts:151,165-167),
 * ditulis kedua view pengaturan. Callback view perlu cast `as any` saat
 * meneruskan patch ke updateProject (meniru save UnifiedSettingsView).
 *
 * Kata "pajak" saja ("ubah pajak jadi 11%") → TANYA (PPN atau PPh?),
 * tidak pernah ditebak; seluruh perintah ditahan (all-or-nothing).
 */
import type { ActionResult } from '../actionRegistry';

export const UPDATE_PROJECT_SETTINGS_INTENT = 'UPDATE_PROJECT_SETTINGS' as const;
export type ProjectSettingsIntent = typeof UPDATE_PROJECT_SETTINGS_INTENT;

/**
 * Patch parsial yang diteruskan ke `updateProject` (merge — field yang
 * tidak ada di patch tidak tersentuh). Catatan tipe: `pphPercent` /
 * `pphEnabled` tidak terdeklarasi di interface `Project` (hanya diakses
 * via cast di ProjectContext) — callback view me-cast saat meneruskan.
 */
export interface ProjectSettingsPatch {
  overheadPercent?: number;
  profitPercent?: number;
  ppnPercent?: number;
  pphPercent?: number;
  ppnEnabled?: boolean;
  pphEnabled?: boolean;
}

/** Konteks LOKAL handler (sengaja bukan ChatActionContext — registry yang
 *  mengadaptasi; pola yang sama dengan pemisahan rename). */
export interface ProjectSettingsCommandContext {
  activeProject: { id: string; name: string } | null;
  /** Menerapkan patch ke proyek (view membungkus `updateProject` +
   *  `refreshProjectTotals`); false bila proyek tidak ditemukan. */
  updateProjectSettings?: (projectId: string, patch: ProjectSettingsPatch) => boolean;
}

/** Bentuk pola router (cermin interface Pattern di intentRouter.ts). */
export interface ProjectSettingsPattern {
  intent: ProjectSettingsIntent;
  re: RegExp;
  /** extract param via capture group 1 */
  paramGroup?: boolean;
  /** false = intent flows to AI instead of local execution (default true) */
  localOnly?: boolean;
}

// ---- Pola router (diterapkan pada teks ternormalisasi huruf kecil) ----
// Kata kerja + kata field dipakai bersama di semua pola (satu sumber).
const SETTINGS_VERBS = '(?:ubah|ubahin|ganti|gantiin|rubah|set|atur|setel)';
const SETTINGS_FIELDS = '(?:overhead|profit|keuntungan|ppn|pph|pajak)';
const SETTINGS_NUMBER = '-?\\d[\\d.,]*';

export const PROJECT_SETTINGS_PATTERNS: ProjectSettingsPattern[] = [
  // 1. Kata kerja + field + "jadi/menjadi/ke" + angka (tanda % opsional):
  //    "ubah overhead jadi 10%", "ubah profit jadi 7,5%", "set ppn ke 11%",
  //    "ubah overhead proyek ini jadi 10%". Param = ekor mulai dari kata
  //    field pertama — parser memindai SEMUA pasangan field+angka di
  //    dalamnya (multi-field: "ubah overhead jadi 10% profit 5%").
  {
    intent: 'UPDATE_PROJECT_SETTINGS',
    re: new RegExp(
      `\\b${SETTINGS_VERBS}\\b.*?\\b(${SETTINGS_FIELDS}\\b.*?\\b(?:jadi|menjadi|ke)\\b\\s*${SETTINGS_NUMBER}\\s*%?.*)`,
    ),
    paramGroup: true,
  },
  // 2. Kata kerja + field + angka langsung (tanpa "jadi"):
  //    "ubah overhead 10%", "set ppn 11". Kata kerja sudah menandai ini
  //    perintah, jadi tanda % opsional di sini.
  {
    intent: 'UPDATE_PROJECT_SETTINGS',
    re: new RegExp(
      `\\b${SETTINGS_VERBS}\\b.*?\\b(${SETTINGS_FIELDS}\\b\\s*${SETTINGS_NUMBER}\\s*%?.*)`,
    ),
    paramGroup: true,
  },
  // 3. Bentuk telanjang "field angka%" (tanpa kata kerja): "overhead 10%",
  //    "PPN 11%", "overhead 10% profit 5%". Tanda % WAJIB di sini — inilah
  //    yang membedakan perintah dari pertanyaan ("berapa overhead proyek
  //    ini?" tidak punya angka dan tidak cocok; "overhead 10" telanjang
  //    tanpa % juga tidak cocok — sengaja, supaya pernyataan berangka
  //    ("overhead proyek ini 10") tidak dieksekusi sebagai perintah).
  {
    intent: 'UPDATE_PROJECT_SETTINGS',
    re: new RegExp(`\\b(${SETTINGS_FIELDS}\\b\\s*${SETTINGS_NUMBER}\\s*%.*)`),
    paramGroup: true,
  },
  // 4. Kata kerja + field TANPA nilai (dijangkar ke akhir pesan) → router
  //    menjawab prompt klarifikasi, bukan UNKNOWN ke LLM: "ubah overhead",
  //    "ganti profit", "atur ppn", "ubah overhead proyek ini",
  //    "ubah overhead jadi".
  {
    intent: 'UPDATE_PROJECT_SETTINGS',
    re: new RegExp(
      `^\\s*(?:tolong\\s+)?${SETTINGS_VERBS}\\b.*\\b${SETTINGS_FIELDS}\\b(?:\\s+(?:proyek(?:\\s+ini)?|ini|jadi|menjadi|ke))?\\s*$`,
    ),
  },
];

/** Prompt klarifikasi router (pola #4, tanpa nilai) + handler (param kosong
 *  / tanpa pasangan field+angka yang terbaca). */
export const UPDATE_PROJECT_SETTINGS_CLARIFICATION =
  'Ubah pengaturan apa, jadi berapa persen? Contoh: "ubah overhead jadi 10%", "PPN 11%", atau "overhead 10% profit 5%".';

/** Pertanyaan balik untuk "pajak" tanpa PPN/PPh (jangan pernah ditebak). */
export const UPDATE_PROJECT_SETTINGS_TAX_AMBIGUOUS =
  'Maksudnya PPN atau PPh? Keduanya tarif pajak yang berbeda — sebutkan salah satu, contoh: "PPN 11%" atau "PPh 2%".';

// ---- Parser ----

export interface SettingsChange {
  key: 'overhead' | 'profit' | 'ppn' | 'pph';
  label: string;
  value: number;
  /** Tarif pajak ini mengaktifkan flag-nya (ppnEnabled/pphEnabled). */
  activates: boolean;
}

export type ParseSettingsPatchResult =
  | { ok: true; patch: ProjectSettingsPatch; changes: SettingsChange[] }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'out-of-range'; field: string; value: number }
  | { ok: false; reason: 'ambiguous-tax' };

type FieldKeyword = 'overhead' | 'profit' | 'keuntungan' | 'ppn' | 'pph' | 'pajak';

const FIELD_KEY: Record<FieldKeyword, 'overhead' | 'profit' | 'ppn' | 'pph' | 'pajak'> = {
  overhead: 'overhead',
  profit: 'profit',
  keuntungan: 'profit',
  ppn: 'ppn',
  pph: 'pph',
  pajak: 'pajak',
};

const FIELD_LABEL: Record<'overhead' | 'profit' | 'ppn' | 'pph' | 'pajak', string> = {
  overhead: 'Overhead',
  profit: 'Profit',
  ppn: 'PPN',
  pph: 'PPh',
  pajak: 'Pajak',
};

const FIELD_KEYWORD_RE = /\b(overhead|profit|keuntungan|ppn|pph|pajak)\b/g;
const NUMBER_RE = /-?\d+(?:[.,]\d+)?/;

/** "7,5" → 7.5 (koma desimal Indonesia; titik juga dibaca sebagai desimal,
 *  konsisten dengan parseVolumeValue di actionRegistry). */
function parsePercentNumber(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

/** Format persen untuk balasan: bulat tanpa desimal, desimal pakai koma. */
export function formatPercentValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(value).replace('.', ',');
}

/**
 * Pindai ekor perintah menjadi patch pengaturan.
 *
 * - Nilai tiap field = angka PERTAMA sesudah kata field itu, sebelum kata
 *   field berikutnya ("overhead proyek ini jadi 10%" → 10; "overhead 10%
 *   profit 5%" → 10 dan 5).
 * - Nilai BERSAMA: angka yang ditemukan berlaku juga untuk field-field
 *   sebelumnya yang belum punya nilai ("overhead dan profit jadi 5%" →
 *   keduanya 5%).
 * - Field yang disebut dua kali: nilai TERAKHIR yang menang.
 * - All-or-nothing: satu nilai di luar 0–100 → seluruh parse gagal
 *   (reason 'out-of-range', menyebut field + nilai + batas lewat handler).
 * - "pajak" bernilai → 'ambiguous-tax' (PPN vs PPh tidak ditebak);
 *   seluruh perintah ditahan, termasuk field lain yang valid.
 * - Tanpa pasangan field+angka → 'empty'.
 */
export function parseSettingsPatch(rawText: string): ParseSettingsPatchResult {
  const text = rawText.toLowerCase().trim().replace(/\s+/g, ' ');
  const hits: Array<{ keyword: FieldKeyword; index: number; end: number }> = [];
  FIELD_KEYWORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FIELD_KEYWORD_RE.exec(text)) !== null) {
    hits.push({ keyword: m[1] as FieldKeyword, index: m.index, end: m.index + m[1].length });
  }
  if (hits.length === 0) return { ok: false, reason: 'empty' };

  // Nilai per field (first-mention order dipertahankan untuk balasan).
  const values = new Map<'overhead' | 'profit' | 'ppn' | 'pph' | 'pajak', number>();
  const order: Array<'overhead' | 'profit' | 'ppn' | 'pph' | 'pajak'> = [];
  const pending: Array<'overhead' | 'profit' | 'ppn' | 'pph' | 'pajak'> = [];
  const setValue = (key: 'overhead' | 'profit' | 'ppn' | 'pph' | 'pajak', value: number): void => {
    if (!values.has(key)) order.push(key);
    values.set(key, value);
  };

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const key = FIELD_KEY[hit.keyword];
    const segmentEnd = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const segment = text.slice(hit.end, segmentEnd);
    const numMatch = segment.match(NUMBER_RE);
    if (!numMatch) {
      // Field tanpa angka di segmennya: menunggu angka bersama dari field
      // berikutnya ("overhead dan profit jadi 5%").
      if (!pending.includes(key)) pending.push(key);
      continue;
    }
    const value = parsePercentNumber(numMatch[0]);
    for (const p of pending) setValue(p, value);
    pending.length = 0;
    setValue(key, value);
  }

  if (values.size === 0) return { ok: false, reason: 'empty' };

  // Validasi rentang dulu (nilai 150% salah apa pun field-nya), lalu
  // ambiguitas pajak. Urutan pengecekan = urutan penyebutan.
  for (const key of order) {
    const value = values.get(key) as number;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { ok: false, reason: 'out-of-range', field: FIELD_LABEL[key], value };
    }
  }
  if (values.has('pajak')) return { ok: false, reason: 'ambiguous-tax' };

  const patch: ProjectSettingsPatch = {};
  const changes: SettingsChange[] = [];
  for (const key of order) {
    const value = values.get(key) as number;
    if (key === 'overhead') {
      patch.overheadPercent = value;
      changes.push({ key, label: 'Overhead', value, activates: false });
    } else if (key === 'profit') {
      patch.profitPercent = value;
      changes.push({ key, label: 'Profit', value, activates: false });
    } else if (key === 'ppn') {
      // ppnEnabled: true WAJIB — tanpa flag, tarif tidak masuk total
      // (unifiedProjectEngine.ts:150,162-164). taxPercent TIDAK ditulis
      // (tidak ada pembaca kanonis field itu di record Proyek).
      patch.ppnPercent = value;
      patch.ppnEnabled = true;
      changes.push({ key, label: 'PPN', value, activates: true });
    } else if (key === 'pph') {
      patch.pphPercent = value;
      patch.pphEnabled = true;
      changes.push({ key, label: 'PPh', value, activates: true });
    }
  }
  return { ok: true, patch, changes };
}

// ---- Handler (dipanggil case UPDATE_PROJECT_SETTINGS di actionRegistry) ----

/**
 * Eksekusi intent UPDATE_PROJECT_SETTINGS. Mengembalikan null bila intent
 * bukan milik kelompok ini (registry melanjutkan ke case lain / UNKNOWN).
 * Fail-closed seperti RENAME_PROJECT: tanpa proyek aktif / tanpa callback
 * / callback false / nilai tak valid → jawab jujur, TIDAK ADA yang
 * berubah, dan klaim sukses HANYA bila callback mengembalikan true.
 */
export function handleProjectSettingsCommand(
  intent: string,
  param: string | undefined,
  ctx: ProjectSettingsCommandContext,
): ActionResult | null {
  if (intent !== UPDATE_PROJECT_SETTINGS_INTENT) return null;

  const text = (param ?? '').trim();
  if (!text) {
    return { ok: true, message: UPDATE_PROJECT_SETTINGS_CLARIFICATION };
  }
  const parsed = parseSettingsPatch(text);
  if (!parsed.ok) {
    if (parsed.reason === 'empty') {
      return { ok: true, message: UPDATE_PROJECT_SETTINGS_CLARIFICATION };
    }
    if (parsed.reason === 'out-of-range') {
      return {
        ok: false,
        message:
          `Nilai ${parsed.field} ${formatPercentValue(parsed.value)}% di luar batas 0–100%. ` +
          'Tidak ada pengaturan yang diubah — coba lagi dengan nilai antara 0% dan 100%.',
      };
    }
    return { ok: true, message: UPDATE_PROJECT_SETTINGS_TAX_AMBIGUOUS };
  }
  if (!ctx.activeProject) {
    return { ok: true, message: 'Tidak ada proyek aktif. Buka salah satu proyek dulu di Daftar Proyek, lalu ulangi perintahnya.' };
  }
  if (!ctx.updateProjectSettings) {
    return {
      ok: false,
      message: 'Saya belum bisa mengubah pengaturan proyek dari chat ini. Ubah lewat menu Pengaturan (Pengaturan Proyek).',
    };
  }
  const changed = ctx.updateProjectSettings(ctx.activeProject.id, parsed.patch);
  if (!changed) {
    return {
      ok: false,
      message:
        `Pengaturan proyek "${ctx.activeProject.name}" belum berubah — proyek tidak ditemukan di daftar aktif. ` +
        'Coba pilih ulang proyeknya di Daftar Proyek, lalu ulangi perintahnya.',
    };
  }
  const lines = parsed.changes.map(
    (c) => `• ${c.label}: ${formatPercentValue(c.value)}%${c.activates ? ' (diaktifkan)' : ''}`,
  );
  return {
    ok: true,
    message: `Pengaturan proyek "${ctx.activeProject.name}" diubah:\n${lines.join('\n')}`,
  };
}
