/**
 * DED AI ESTIMATE — Cache riset harga eksternal.
 *
 * Kontrak (owner 2026-11-10 §6):
 * - Kunci cache = deskripsi ternormalisasi + spesifikasi + satuan +
 *   wilayah + cakupan + (kesegaran dinilai dari tanggal ambil, bukan
 *   bagian dari kunci — entri yang sama menjadi basi seiring waktu).
 * - Setiap entri menyimpan bukti sumber + tanggal ambil + tanggal
 *   kedaluwarsa. Masa segar default 30 hari.
 * - Entri basi TIDAK dibuang diam-diam: ia dikembalikan dengan penanda
 *   `stale` agar pemanggil menurunkan klasifikasinya menjadi estimasi
 *   AI berlabel basi, bukan referensi pasar segar.
 * - Penyimpanan: memori sesi + localStorage bila tersedia (browser);
 *   di Node/tes cukup memori. Kegagalan penyimpanan tidak pernah
 *   melempar — cache adalah optimasi, bukan sumber kebenaran.
 */

import type { ExternalPriceReference } from './externalPriceReferences';

export const RESEARCH_CACHE_TTL_DAYS = 30;
/**
 * HARDENING 2026-11-10 Tahap 3: entri basi tidak hidup selamanya.
 * Lewat TTL + batas ini entri DIBUANG (bukan dipakai): referensi yang
 * terlalu tua tidak boleh menjadi dasar estimasi hanya karena tidak
 * ada pilihan lain.
 */
export const RESEARCH_CACHE_MAX_STALE_DAYS = 90;
const STORAGE_KEY = 'ezrab-price-research-v1';

/**
 * Validasi bentuk entri cache. Entri dari localStorage bisa rusak/
 * tidak lengkap (ditulis versi lain, diubah manual) — entri tidak sah
 * TIDAK PERNAH menghasilkan harga: diperlakukan sebagai miss dan
 * dibuang. Syarat minimal: referensi ber-ID, harga rekomendasi
 * berhingga > 0, satuan terisi, tanggal ambil & kedaluwarsa terbaca.
 */
export function isValidCachedEntry(entry: unknown): entry is CachedResearch {
  if (entry == null || typeof entry !== 'object') return false;
  const e = entry as Partial<CachedResearch>;
  const ref = e.reference as Partial<ExternalPriceReference> | undefined;
  if (!ref || typeof ref.id !== 'string' || ref.id.trim() === '') return false;
  if (typeof ref.recommendedPrice !== 'number' || !Number.isFinite(ref.recommendedPrice) || ref.recommendedPrice <= 0) return false;
  if (typeof ref.unit !== 'string' || ref.unit.trim() === '') return false;
  if (typeof e.fetchedAt !== 'string' || Number.isNaN(Date.parse(e.fetchedAt))) return false;
  if (typeof e.expiresAt !== 'string' || Number.isNaN(Date.parse(e.expiresAt))) return false;
  return true;
}

/** True bila entri sudah basi melebihi batas umur maksimum (TTL + MAX_STALE). */
export function isBeyondMaxStale(entry: CachedResearch, now: Date = new Date()): boolean {
  const hardExpiry = addDays(entry.expiresAt, RESEARCH_CACHE_MAX_STALE_DAYS);
  return now.toISOString().slice(0, 10) > hardExpiry;
}

export interface CachedResearch {
  key: string;
  reference: ExternalPriceReference;
  fetchedAt: string; // ISO date
  expiresAt: string; // ISO date
}

function normalizePart(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join('-');
}

/** Kunci cache ternormalisasi: deskripsi + spek + satuan + wilayah + cakupan. */
export function researchCacheKey(input: {
  description: string;
  specification?: string;
  unit: string;
  region: string;
  scope: string;
}): string {
  return [
    normalizePart(input.description),
    normalizePart(input.specification || ''),
    input.unit.toLowerCase().trim(),
    normalizePart(input.region),
    input.scope.toLowerCase().trim(),
  ].join('|');
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isStale(entry: CachedResearch, now: Date = new Date()): boolean {
  return now.toISOString().slice(0, 10) > entry.expiresAt;
}

/**
 * Kesegaran satu referensi terkurasi (dipakai jalur yang membaca
 * referensi langsung tanpa cache, mis. ded-full-ai): basi bila tanggal
 * risetnya (`accessedAt`) + TTL sudah lewat pada `now`.
 */
export function referenceIsStale(
  ref: Pick<ExternalPriceReference, 'accessedAt'>,
  now: Date = new Date(),
): boolean {
  return isStale(
    { key: '', reference: ref as ExternalPriceReference, fetchedAt: ref.accessedAt, expiresAt: addDays(ref.accessedAt, RESEARCH_CACHE_TTL_DAYS) },
    now,
  );
}

const memory = new Map<string, CachedResearch>();

function persist(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...memory.values()]));
    }
  } catch {
    /* cache best-effort */
  }
}

function hydrate(): void {
  try {
    if (typeof localStorage !== 'undefined' && memory.size === 0) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        for (const e of JSON.parse(raw) as CachedResearch[]) {
          // Entri rusak/tidak lengkap dari penyimpanan tidak dimuat.
          if (isValidCachedEntry(e) && typeof e.key === 'string') memory.set(e.key, e);
        }
      }
    }
  } catch {
    /* abaikan */
  }
}

export function putResearch(
  input: { description: string; specification?: string; unit: string; region: string; scope: string },
  reference: ExternalPriceReference,
  fetchedAt: string = reference.accessedAt,
): CachedResearch {
  hydrate();
  const key = researchCacheKey(input);
  const entry: CachedResearch = {
    key,
    reference,
    fetchedAt,
    expiresAt: addDays(fetchedAt, RESEARCH_CACHE_TTL_DAYS),
  };
  memory.set(key, entry);
  persist();
  return entry;
}

export function getResearch(
  input: { description: string; specification?: string; unit: string; region: string; scope: string },
  now: Date = new Date(),
): { entry: CachedResearch; stale: boolean } | null {
  hydrate();
  const key = researchCacheKey(input);
  const entry = memory.get(key);
  if (!entry) return null;
  // Entri tidak sah atau basi melewati batas umur maksimum: buang dan
  // perlakukan sebagai miss — tidak pernah naik kelas, tidak pernah
  // menghasilkan harga diam-diam.
  if (!isValidCachedEntry(entry) || isBeyondMaxStale(entry, now)) {
    memory.delete(key);
    persist();
    return null;
  }
  return { entry, stale: isStale(entry, now) };
}

/** Daftarkan referensi terkurasi ke cache (dipakai lapisan penyelesaian). */
export function seedResearchCache(
  references: ExternalPriceReference[] = [],
  describe: (ref: ExternalPriceReference) => { description: string; specification?: string },
): void {
  for (const ref of references) {
    const d = describe(ref);
    putResearch(
      { description: d.description, specification: d.specification, unit: ref.unit, region: ref.region, scope: ref.scope },
      ref,
      ref.accessedAt,
    );
  }
}

export function clearResearchCache(): void {
  memory.clear();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* abaikan */
  }
}

export function researchCacheSize(): number {
  hydrate();
  return memory.size;
}
