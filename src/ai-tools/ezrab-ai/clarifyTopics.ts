/**
 * EZRAB AI — Klarifikasi Topik (src/ai-tools/ezrab-ai/clarifyTopics.ts)
 *
 * Peraturan owner 2026-10-23: bila pertanyaan pengguna kurang jelas /
 * ambigu — hanya menyebut TOPIK tanpa objek ("ahsp", "cek harga",
 * "template", "rab") — Chat AI TIDAK BOLEH menebak dan TIDAK diteruskan
 * ke LLM. Chat bertanya balik dengan KARTU PILIHAN maksudnya apa, lalu
 * query lanjutannya dijawab deterministik dari data EZRAB sendiri.
 *
 * Modul ini MURNI (tanpa impor actionRegistry — tidak ada siklus):
 * deteksi topik + pembangun kartu/pesan. Eksekusi (repository, resolver)
 * tinggal di actionRegistry (case CLARIFY_TOPIC / CLARIFY_PICK /
 * CLARIFY_QUERY).
 */

export type ClarifyTopic = 'ahsp' | 'harga' | 'template' | 'rab';

/** Bentuk tombol — struktural sama dengan ChatActionButton di registry. */
export interface ClarifyActionButton {
  label: string;
  action:
    | { kind: 'navigate'; menu: string }
    | { kind: 'intent'; intent: string; param?: string }
    | { kind: 'push-rab' };
}

export interface ClarifyCard {
  message: string;
  actions: ClarifyActionButton[];
}

/** Hasil berbentuk ActionResult (struktural) untuk case registry. */
export interface ClarifyResult {
  ok: boolean;
  message: string;
  actions?: ClarifyActionButton[];
  /** Mode klarifikasi yang kini ditunggu jawabannya oleh chat. */
  awaitClarify?: string;
}

/* ------------------------------------------------------------------ */
/* Deteksi: HANYA bentuk telanjang/kurang spesifik — seluruh pesan    */
/* adalah topik + filler, tanpa objek/kode/angka spesifik. Regex      */
/* berjangkar ^...$ menjamin "cek harga semen" (ada objek) TIDAK      */
/* tertangkap.                                                        */
/* ------------------------------------------------------------------ */
const AHSP_BARE =
  /^(?:apa itu |apa sih |tolong jelaskan |jelaskan |tentang |cek |info )?ahsp(?: 2026)?(?: itu apa)?$/;
const HARGA_BARE = /^(?:cek |info )?harga(?: satuan)?$/;
const TEMPLATE_BARE = /^(?:cari )?template(?: rab)?$/;
const RAB_BARE = /^(?:(?:buatkan|buatin|bikin|buat|minta) )?rab$/;

export function detectClarifyTopic(text: string): ClarifyTopic | null {
  const t = (text ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?…]+$/, '')
    .trim();
  if (!t) return null;
  if (AHSP_BARE.test(t)) return 'ahsp';
  if (HARGA_BARE.test(t)) return 'harga';
  if (TEMPLATE_BARE.test(t)) return 'template';
  if (RAB_BARE.test(t)) return 'rab';
  return null;
}

/* ------------------------------------------------------------------ */
/* Kartu pilihan per topik (balasan untuk intent CLARIFY_TOPIC).      */
/* ------------------------------------------------------------------ */
export function clarifyTopicCard(topic: string): ClarifyCard | null {
  switch (topic) {
    case 'ahsp':
      return {
        message:
          'Soal AHSP — maksud Anda yang mana? Karena "AHSP" bisa berarti beberapa hal:\n' +
          '• **Penjelasan** — apa itu AHSP dan fungsinya dalam RAB\n' +
          '• **Pencarian** — mencari analisa pekerjaan tertentu (kode/nama + harga satuannya)\n' +
          '• **Katalog** — membuka katalog AHSP 2026 lengkap',
        actions: [
          { label: 'Jelaskan apa itu AHSP', action: { kind: 'intent', intent: 'CLARIFY_PICK', param: 'ahsp:explain' } },
          { label: 'Cari AHSP pekerjaan', action: { kind: 'intent', intent: 'CLARIFY_PICK', param: 'ahsp:search' } },
          { label: 'Buka katalog AHSP 2026', action: { kind: 'navigate', menu: 'ahsp-2026' } },
        ],
      };
    case 'harga':
      return {
        message:
          'Soal harga — harga apa yang mau dicek? Sumber datanya beda-beda, jadi pilih jenisnya dulu:',
        actions: [
          { label: 'Harga material', action: { kind: 'intent', intent: 'CLARIFY_PICK', param: 'harga:material' } },
          { label: 'Harga upah', action: { kind: 'intent', intent: 'CLARIFY_PICK', param: 'harga:upah' } },
          { label: 'Harga alat/sewa', action: { kind: 'intent', intent: 'CLARIFY_PICK', param: 'harga:alat' } },
          { label: 'Harga dari AHSP', action: { kind: 'intent', intent: 'CLARIFY_PICK', param: 'ahsp:search' } },
        ],
      };
    case 'template':
      return {
        message: 'Soal template — mau apa dengan template RAB?',
        actions: [
          { label: 'Buka Katalog Template', action: { kind: 'navigate', menu: 'template-rab' } },
          { label: 'Cari template', action: { kind: 'intent', intent: 'CLARIFY_PICK', param: 'template:search' } },
          { label: 'Buat RAB dari template', action: { kind: 'intent', intent: 'CREATE_RAB_SUMMARY', param: 'buatkan rab dari template' } },
        ],
      };
    case 'rab':
      return {
        message:
          'Siap — RAB untuk apa? Pilih jenis pekerjaannya; sesudah itu saya tanya detailnya (ukuran, jumlah lantai, lokasi):',
        actions: [
          { label: 'Rumah tinggal', action: { kind: 'intent', intent: 'CREATE_RAB_SUMMARY', param: 'buatkan rab rumah tinggal' } },
          { label: 'Jalan', action: { kind: 'intent', intent: 'CREATE_RAB_SUMMARY', param: 'buatkan rab jalan' } },
          { label: 'Drainase', action: { kind: 'intent', intent: 'CREATE_RAB_SUMMARY', param: 'buatkan rab drainase' } },
          { label: 'Jembatan', action: { kind: 'intent', intent: 'CREATE_RAB_SUMMARY', param: 'buatkan rab jembatan' } },
        ],
      };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Hasil pilihan kartu (case CLARIFY_PICK). Param berpola             */
/* "topik:opsi". Semua pesan lokal deterministik — tanpa repository   */
/* (jumlah analisa AHSP disuntik registry lewat opts agar modul ini   */
/* tetap murni; tanpa angka pun kalimatnya tetap jujur).              */
/* ------------------------------------------------------------------ */
export function clarifyPickResult(
  pick: string,
  opts?: { ahspCount?: number | null },
): ClarifyResult {
  switch (pick) {
    case 'ahsp:explain': {
      const n = opts?.ahspCount;
      const countLine =
        typeof n === 'number' && n > 0
          ? `Katalog AHSP 2026 di EZRAB memuat ${n.toLocaleString('id-ID')} analisa resmi`
          : 'Katalog AHSP 2026 resmi tersedia di EZRAB';
      return {
        ok: true,
        message:
          '**AHSP** adalah singkatan dari **Analisa Harga Satuan Pekerjaan** — dokumen analisa ' +
          'yang merinci kebutuhan untuk menyelesaikan SATU satuan pekerjaan konstruksi ' +
          '(misalnya 1 m³ pengecoran beton atau 1 m² pasangan dinding bata).\n\n' +
          'Isi AHSP adalah **koefisien** kebutuhan per satuan pekerjaan, terdiri dari tiga kelompok:\n' +
          '• **Bahan** — jenis dan jumlah material yang dibutuhkan.\n' +
          '• **Upah** — jenis dan jumlah tenaga kerja (pekerja, tukang, kepala tukang, mandor), dihitung dalam OH (orang hari).\n' +
          '• **Alat** — peralatan yang dipakai beserta jumlah/durasinya.\n\n' +
          '**Fungsinya:** harga satuan pekerjaan dalam RAB dihitung dari koefisien AHSP ini ' +
          'dikalikan harga dasar bahan, upah, dan alat. Jadi AHSP adalah dasar pembentukan ' +
          'harga satuan RAB — bukan harga jadi; hasil harganya mengikuti harga dasar wilayah ' +
          'dan periode yang berlaku.\n\n' +
          `${countLine} — bisa dicari per pekerjaan dan dipakai langsung saat menyusun RAB.`,
        actions: [
          { label: 'Cari AHSP pekerjaan', action: { kind: 'intent', intent: 'CLARIFY_PICK', param: 'ahsp:search' } },
          { label: 'Buka katalog AHSP 2026', action: { kind: 'navigate', menu: 'ahsp-2026' } },
        ],
      };
    }
    case 'ahsp:search':
      return {
        ok: true,
        message:
          'Siap — ketik nama pekerjaan atau kode analisanya, misalnya "beton K-225" atau "A.4.1.1". ' +
          'Saya carikan di katalog AHSP 2026 resmi EZRAB.',
        awaitClarify: 'ahsp',
      };
    case 'harga:material':
      return {
        ok: true,
        message:
          'Baik — harga material apa yang mau dicek? Ketik nama materialnya, misalnya "semen portland" ' +
          'atau "besi beton". Saya cari di database harga 2026 EZRAB.',
        awaitClarify: 'harga-material',
      };
    case 'harga:upah':
      return {
        ok: true,
        message:
          'Baik — upah tenaga kerja apa yang mau dicek? Ketik jenisnya, misalnya "tukang batu" ' +
          'atau "pekerja". Saya cari di database harga 2026 EZRAB.',
        awaitClarify: 'harga-upah',
      };
    case 'harga:alat':
      return {
        ok: true,
        message:
          'Baik — alat apa yang mau dicek harga/sewanya? Ketik nama alatnya, misalnya "excavator" ' +
          'atau "vibrator beton". Saya cari di database harga 2026 EZRAB.',
        awaitClarify: 'harga-alat',
      };
    case 'template:search':
      return {
        ok: true,
        message:
          'Siap — ketik kata kunci templatenya, misalnya "rumah 2 lantai", "jalan beton", ' +
          'atau "drainase". Saya carikan di katalog template EZRAB.',
        awaitClarify: 'template',
      };
    default:
      return {
        ok: false,
        message:
          'Pilihan klarifikasi itu tidak saya kenali. Coba pilih lewat tombol yang tersedia, ' +
          'atau tulis kebutuhan Anda lebih spesifik.',
      };
  }
}
