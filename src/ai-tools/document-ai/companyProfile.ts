/**
 * AI DOKUMEN — Identitas Perusahaan & Kop Surat (Fase B2 Paper System).
 *
 * Profil perusahaan terstruktur untuk kop dokumen AI Document. Penyimpanan
 * LOKAL per perangkat (localStorage) — sama seperti draf: BUKAN database
 * server, tidak ada isolasi antar-pengguna. Jangan diklaim sebaliknya.
 *
 * Aturan data (master prompt): tidak mengarang data perusahaan — field
 * kosong tetap kosong; logo divalidasi dari isi file (magic bytes), bukan
 * hanya ekstensi/MIME yang diklaim browser.
 */

export type KopLayout = 'left' | 'center' | 'minimal';

export interface CompanyProfile {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  /** Info tambahan bebas (mis. NPWP perusahaan bila pengguna mengisinya). */
  extra: string;
  logoDataUrl: string | null;
  /** Lebar logo saat dirender di kop (mm). */
  logoWidthMm: number;
  layout: KopLayout;
  accentColor: string;
  isDefault: boolean;
  updatedAt: number;
  /* --- Mode kop (polish §3) — dua mode TIDAK saling menimpa --- */
  /**
   * 'structured' = logo + nama/kontak terstruktur (perilaku lama).
   * 'full' = satu gambar kop surat lengkap (fullKopDataUrl) menggantikan
   * seluruh blok terstruktur — logo/nama TIDAK ditumpuk di atasnya.
   * Kosong (record lama) diperlakukan sebagai 'structured'.
   */
  kopMode?: 'structured' | 'full';
  /** Gambar kop penuh sebagai data URL (divalidasi magic bytes, maks 5 MB). */
  fullKopDataUrl?: string | null;
  /** Lebar kop penuh sebagai persen lebar area konten. Default 100. */
  fullKopWidthPct?: number;
  /** Jarak aman (mm) antara kop penuh dan awal isi dokumen. Default 0. */
  fullKopMarginMm?: number;
}

const LS_KEY = 'ezrab_docai_company_v1';
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_DIMENSION = 4000;
/** Batas gambar kop surat penuh (lebih longgar dari logo: kop memuat seluruh header). */
export const MAX_FULL_KOP_BYTES = 5 * 1024 * 1024;
export const MAX_FULL_KOP_DIMENSION = 6000;

/* Penyimpanan: localStorage bila ada; fallback memori (tes/node). */
const memoryStore = new Map<string, string>();
function storageGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch { /* abaikan */ }
  return memoryStore.get(key) ?? null;
}
function storageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch { /* abaikan */ }
  memoryStore.set(key, value);
}

export function emptyProfile(partial?: Partial<CompanyProfile>): CompanyProfile {
  return {
    id: `co_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    extra: '',
    logoDataUrl: null,
    logoWidthMm: 32,
    layout: 'left',
    accentColor: '#1d4ed8',
    isDefault: false,
    updatedAt: Date.now(),
    ...partial,
  };
}

export function listProfiles(): CompanyProfile[] {
  try {
    const raw = storageGet(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as CompanyProfile[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(profiles: CompanyProfile[]): void {
  storageSet(LS_KEY, JSON.stringify(profiles));
}

export function saveProfile(p: CompanyProfile): CompanyProfile[] {
  const all = listProfiles();
  const saved: CompanyProfile = { ...p, updatedAt: Date.now() };
  if (saved.isDefault) {
    for (const x of all) x.isDefault = false;
  }
  const i = all.findIndex((x) => x.id === saved.id);
  if (i >= 0) all[i] = saved;
  else all.push(saved);
  // Profil pertama otomatis menjadi default agar dokumen berikutnya langsung memakainya.
  if (all.length > 0 && !all.some((x) => x.isDefault)) all[0].isDefault = true;
  persist(all);
  return all;
}

export function deleteProfile(id: string): CompanyProfile[] {
  const all = listProfiles().filter((x) => x.id !== id);
  if (all.length > 0 && !all.some((x) => x.isDefault)) all[0].isDefault = true;
  persist(all);
  return all;
}

export function getDefaultProfile(): CompanyProfile | null {
  const all = listProfiles();
  return all.find((x) => x.isDefault) ?? all[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Validasi logo — periksa magic bytes, bukan klaim ekstensi/MIME      */
/* ------------------------------------------------------------------ */

export type LogoKind = 'png' | 'jpeg' | 'gif' | 'webp';

export function detectLogoKind(bytes: Uint8Array): LogoKind | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'gif';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'webp';
  return null;
}

export interface LogoValidation {
  ok: boolean;
  error?: string;
  kind?: LogoKind;
  dataUrl?: string;
  width?: number;
  height?: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export interface ImageValidationOptions {
  /** Batas ukuran file (bytes). Default: batas logo (2 MB). */
  maxBytes?: number;
  /** Batas dimensi sisi terpanjang (px). Default: batas logo (4000px). */
  maxDimension?: number;
  /** Sebutan aset pada pesan error ('logo', 'kop', ...). Default 'gambar'. */
  label?: string;
}

function formatByteLimit(bytes: number): string {
  return bytes % (1024 * 1024) === 0 ? `${bytes / (1024 * 1024)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Validasi file gambar dari pengguna (dipakai logo & kop penuh). Async
 * karena perlu membaca dimensi gambar asli lewat Image (browser). Di luar
 * browser, dimensi dilewati dengan jujur (width/height kosong) — magic
 * bytes & ukuran tetap diperiksa. Isi file yang menentukan jenis gambar,
 * bukan ekstensi/MIME yang diklaim.
 */
export async function validateImageFile(file: File, opts: ImageValidationOptions = {}): Promise<LogoValidation> {
  const maxBytes = opts.maxBytes ?? MAX_LOGO_BYTES;
  const maxDimension = opts.maxDimension ?? MAX_LOGO_DIMENSION;
  const label = opts.label ?? 'gambar';
  if (file.size === 0) return { ok: false, error: 'File kosong.' };
  if (file.size > maxBytes) {
    return { ok: false, error: `Ukuran ${label} ${(file.size / 1024).toFixed(0)} KB melebihi batas ${formatByteLimit(maxBytes)}.` };
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = detectLogoKind(buf);
  if (!kind) {
    return { ok: false, error: 'File bukan gambar PNG/JPG/GIF/WebP yang valid (isi file tidak cocok).' };
  }
  const mime = kind === 'jpeg' ? 'image/jpeg' : `image/${kind}`;
  const dataUrl = `data:${mime};base64,${bytesToBase64(buf)}`;

  let width: number | undefined;
  let height: number | undefined;
  if (typeof Image !== 'undefined' && typeof URL !== 'undefined') {
    try {
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error('gambar rusak'));
        img.src = dataUrl;
      });
      width = dims.w;
      height = dims.h;
      if (width > maxDimension || height > maxDimension) {
        return { ok: false, error: `Dimensi ${label} ${width}×${height}px melebihi batas ${maxDimension}px.` };
      }
    } catch {
      return { ok: false, error: 'File gambar tidak dapat dibaca (kemungkinan rusak).' };
    }
  }
  return { ok: true, kind, dataUrl, width, height };
}

/**
 * Validasi file logo (perilaku & pesan error sama seperti sebelum
 * generalisasi): maks 2 MB, dimensi ≤4000px.
 */
export async function validateLogoFile(file: File): Promise<LogoValidation> {
  return validateImageFile(file, { maxBytes: MAX_LOGO_BYTES, maxDimension: MAX_LOGO_DIMENSION, label: 'logo' });
}

/** Validasi gambar kop surat penuh: maks 5 MB, dimensi ≤6000px. */
export async function validateFullKopFile(file: File): Promise<LogoValidation> {
  return validateImageFile(file, { maxBytes: MAX_FULL_KOP_BYTES, maxDimension: MAX_FULL_KOP_DIMENSION, label: 'kop' });
}

/* ------------------------------------------------------------------ */
/* Render kop surat (HTML) — satu sumber untuk pratinjau editor &      */
/* cetak. Ekspor PDF/DOCX memakai data terstruktur profil yang sama.   */
/* ------------------------------------------------------------------ */

export function escapeHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function kopContactLine(p: CompanyProfile): string {
  return [p.address, p.phone, p.email, p.website, p.extra].filter((x) => x && x.trim()).join(' • ');
}

/**
 * Mode kop yang BENAR-BENAR dipakai saat render: 'full' hanya bila mode
 * dipilih DAN gambar kop penuh tersedia. Bila pengguna memilih 'full' tapi
 * asetnya kosong, render jatuh ke kop terstruktur (agar dokumen tetap
 * berkop) — UI membandingkan fungsi ini dengan profile.kopMode untuk
 * menampilkan peringatan bahwa kop penuh belum terpasang, bukan diam-diam
 * menganggap fallback itu mode penuh.
 */
export function kopModeEffective(p: CompanyProfile | null): 'structured' | 'full' {
  return p && p.kopMode === 'full' && !!p.fullKopDataUrl ? 'full' : 'structured';
}

/** HTML kop untuk zona header lembar editor & cetak. Kosong bila profil kosong. */
export function kopHtml(p: CompanyProfile | null): string {
  if (!p) return '';
  // Mode kop gambar penuh: HANYA gambar kop (rasio asli, lebar sesuai
  // fullKopWidthPct) — tanpa logo/nama/kontak terstruktur agar tidak dobel.
  if (kopModeEffective(p) === 'full') {
    const pct = Math.max(10, Math.min(100, p.fullKopWidthPct ?? 100));
    const marginMm = Math.max(0, p.fullKopMarginMm ?? 0);
    const style = `width:${pct}%${marginMm ? `;margin-bottom:${marginMm}mm` : ''}`;
    return `<div class="docai-kop docai-kop-full"><img class="docai-kop-full-img" src="${p.fullKopDataUrl}" alt="" style="${style}" /></div>`;
  }
  if (!p.name.trim() && !p.logoDataUrl) return '';
  const contact = kopContactLine(p);
  const logo = p.logoDataUrl
    ? `<img class="docai-kop-logo" src="${p.logoDataUrl}" alt="" style="width:${Math.max(14, Math.min(70, p.logoWidthMm))}mm" />`
    : '';
  const name = p.name.trim() ? `<div class="docai-kop-name">${escapeHtml(p.name)}</div>` : '';
  const contactHtml = contact ? `<div class="docai-kop-contact">${escapeHtml(contact)}</div>` : '';
  const accent = escapeHtml(p.accentColor || '#1d4ed8');

  if (p.layout === 'center') {
    return `<div class="docai-kop docai-kop-center">${logo}${name}${contactHtml}<div class="docai-kop-rule" style="border-color:${accent}"></div></div>`;
  }
  if (p.layout === 'minimal') {
    return `<div class="docai-kop docai-kop-minimal"><div class="docai-kop-minrow">${name}<span class="docai-kop-contact-inline">${escapeHtml(contact)}</span></div><div class="docai-kop-rule" style="border-color:${accent}"></div></div>`;
  }
  // left: logo kiri, identitas kanan
  return `<div class="docai-kop docai-kop-left">${logo}<div class="docai-kop-text">${name}${contactHtml}</div><div class="docai-kop-rule" style="border-color:${accent}"></div></div>`;
}
