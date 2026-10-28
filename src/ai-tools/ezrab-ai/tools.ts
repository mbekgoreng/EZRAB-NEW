/**
 * EZRAB AI — Tools (src/ai-tools/ezrab-ai/tools.ts)
 * Deterministic, small helper tools the assistant can use.
 * Includes calculator tools + knowledge lookup tools (AHSP 2026, price
 * database, RAB templates) so the AI core knows the app's data.
 */

import { aiToolsError, AIToolsStructuredError } from '../types';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { ahspChatPriceSuffix } from './ahspChatPrice';
import { searchChatAhsp, formatChatAhspResult } from './chatSearch';
import { masterBuildingTemplateRegistry } from '../../data/buildingTemplates/masterTemplateRegistry';
import { ProjectSnapshot, formatIDR } from './projectContext';

/**
 * Active-project snapshot for read-only project tools.
 * Set per-request by the service layer from real app state; cleared after.
 * Tools return an honest "no project" message when unset — never fabricated data.
 */
let activeProjectSnapshot: ProjectSnapshot | null = null;

export function setActiveProjectSnapshot(snap: ProjectSnapshot | null): void {
  activeProjectSnapshot = snap;
}

export function getActiveProjectSnapshot(): ProjectSnapshot | null {
  return activeProjectSnapshot;
}

function requireSnapshot(): ProjectSnapshot | string {
  if (!activeProjectSnapshot) {
    return 'Tidak ada proyek aktif yang terhubung. Minta pengguna memilih proyek terlebih dahulu, atau jawab tanpa data proyek.';
  }
  return activeProjectSnapshot;
}

export interface EzrabAiToolDef {
  name: string;
  description: string;
  invoke: (args: Record<string, unknown>) => string;
}

const asNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

function fmtIDR(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

/** Normalisasi satuan untuk perbandingan dimensi ("m²"→"m2", "Rp/m³"→"m3"). */
function normUnitArg(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let s = v.trim().toLowerCase().replace(/²/g, '2').replace(/³/g, '3');
  if (s.includes('/')) s = s.slice(s.lastIndexOf('/') + 1);
  return s || null;
}

/** Label tier sumber harga (nilai engine diteruskan apa adanya, tidak dinaikkan). */
const PRICE_TIER_LABELS: Record<string, string> = {
  OFFICIAL_GOVERNMENT: 'RESMI (sumber pemerintah)',
  OFFICIAL_PROJECT: 'RESMI (dokumen proyek)',
  VERIFIED_REGIONAL: 'Referensi wilayah terverifikasi',
  USER_IMPORTED_VERIFIED: 'Impor pengguna terverifikasi',
  PROJECT_INTERNAL_MASTER: 'Master internal proyek (belum terverifikasi eksternal)',
  COMMERCIAL_REFERENCE: 'REFERENSI PASAR/KOMERSIAL',
  LEGACY_SUPERSEDED: 'Sumber lama (sudah digantikan)',
};

export const EZRAB_AI_TOOLS: EzrabAiToolDef[] = [
  {
    name: 'subtotal',
    description: 'Menghitung jumlah = volume × harga satuan. Menolak volume/harga negatif dan menolak perkalian lintas satuan (argumen unit & priceUnit berbeda).',
    invoke: (args) => {
      const q = asNumber(args.volume ?? args.quantity);
      const p = asNumber(args.unitPrice ?? args.price);
      if (q === null || p === null) return 'ERROR: volume dan harga satuan wajib berupa angka.';
      // Penjaga B13: subtotal negatif bukan nilai sah — tolak, jangan kalikan.
      if (q < 0 || p < 0) {
        return 'ERROR: volume dan harga satuan tidak boleh negatif. Periksa kembali inputnya — hasil negatif tidak disimpan sebagai nilai yang sah.';
      }
      // Penjaga B10/B15: satuan kuantitas dan satuan harga yang dinyatakan
      // berbeda tidak boleh dikalikan diam-diam; perlu konversi yang sah.
      const unitQ = normUnitArg(args.unit ?? args.satuan ?? args.quantityUnit);
      const unitP = normUnitArg(args.priceUnit ?? args.satuan_harga ?? args.unitPriceUnit);
      if (unitQ && unitP && unitQ !== unitP) {
        return (
          `ERROR: satuan kuantitas (${unitQ}) dan satuan harga (${unitP}) berbeda — subtotal tidak boleh dihitung lintas satuan. ` +
          'Samakan satuannya lewat konversi yang sah (mis. densitas terverifikasi untuk kg↔m³) sebelum mengalikan.'
        );
      }
      return `Subtotal = ${fmtIDR(Math.round(q * p))}`;
    },
  },
  {
    name: 'volume_persegi',
    description: 'Volume balok/ruangan: panjang × lebar × tinggi (dalam meter).',
    invoke: (args) => {
      const l = asNumber(args.panjang);
      const w = asNumber(args.lebar);
      const h = asNumber(args.tinggi);
      if (l === null || w === null || h === null) return 'ERROR: panjang, lebar, tinggi wajib berupa angka.';
      const v = l * w * h;
      if (v <= 0) return 'ERROR: hasil volume harus lebih dari nol.';
      return `Volume = ${v.toLocaleString('id-ID', { maximumFractionDigits: 2 })} m³`;
    },
  },
  {
    name: 'luas_dinding',
    description:
      'Luas dinding SATU bidang: panjang × tinggi, dikurangi total luas bukaan (argumen "bukaan" = total luas bukaan dalam m², atau daftar luas/nilai {panjang, tinggi, jumlah}). ' +
      'Hanya untuk dua bidang sejajar (pasangan dinding) beri argumen sisi=2 secara eksplisit.',
    invoke: (args) => {
      const p = asNumber(args.panjang);
      const h = asNumber(args.tinggi);
      if (p === null || h === null) return 'ERROR: panjang dan tinggi wajib berupa angka.';
      if (p <= 0 || h <= 0) return 'ERROR: panjang dan tinggi harus lebih dari nol.';
      // Default SATU sisi (perbaikan B3: rumus lama selalu ×2 sehingga soal
      // satu bidang menghasilkan angka salah deterministik). Dua sisi hanya
      // bila diminta eksplisit lewat argumen sisi.
      const sisiRaw = asNumber(args.sisi ?? args.jumlah_sisi ?? args.sisi_dinding);
      const sisi = sisiRaw === 2 ? 2 : 1;
      let bukaan = 0;
      const bRaw = args.bukaan ?? args.luas_bukaan;
      if (Array.isArray(bRaw)) {
        for (const e of bRaw) {
          const n = asNumber(e);
          if (n !== null) { bukaan += n; continue; }
          if (e && typeof e === 'object') {
            const ep = asNumber((e as Record<string, unknown>).panjang);
            const et = asNumber((e as Record<string, unknown>).tinggi);
            const cnt = asNumber((e as Record<string, unknown>).jumlah) ?? 1;
            if (ep !== null && et !== null) bukaan += ep * et * cnt;
          }
        }
      } else {
        bukaan = asNumber(bRaw) ?? 0;
      }
      if (bukaan < 0) return 'ERROR: luas bukaan tidak boleh negatif.';
      const area = sisi * p * h - bukaan;
      if (area < 0) return 'ERROR: luas bukaan melebihi luas dinding.';
      return `Luas dinding = ${area.toLocaleString('id-ID', { maximumFractionDigits: 2 })} m²`;
    },
  },
  {
    name: 'persentase_level',
    description: 'Persentase level/kemiringan: kenaikan ÷ jarak × 100.',
    invoke: (args) => {
      const up = asNumber(args.kenaikan);
      const dist = asNumber(args.jarak);
      if (up === null || dist === null || dist <= 0) return 'ERROR: kenaikan dan jarak (jarak>0) wajib berupa angka.';
      return `Level = ${((up / dist) * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
    },
  },
  // ===== Knowledge tools: AI core knows the app's data =====
  {
    name: 'cari_ahsp',
    description: 'Mencari AHSP 2026 resmi (kode, nama pekerjaan, satuan, harga satuan). Argumen: kata_kunci (wajib), satuan (opsional, mis. "m2") — bila satuan diisi, hasil dengan satuan berbeda ditandai peringatan dan tidak dianggap jawaban yang cocok. Kode AHSP eksak (mis. "3.7.4") dicari lewat lookup eksak; kode yang tidak ada dijawab TIDAK DITEMUKAN tanpa substitusi.',
    invoke: (args) => {
      const q = String(args.kata_kunci ?? args.query ?? '').trim();
      if (!q) return 'ERROR: kata_kunci wajib diisi.';
      const satuan = String(args.satuan ?? '').trim() || undefined;
      try {
        return formatChatAhspResult(searchChatAhsp(q, satuan ? { unit: satuan } : undefined));
      } catch (e: any) {
        return 'ERROR: gagal mencari AHSP: ' + (e?.message ?? e);
      }
    },
  },
  {
    name: 'cari_harga',
    description: 'Mencari harga material/upah/alat dari database harga 2026. Argumen: kata_kunci (wajib), jenis opsional (material|upah|alat).',
    invoke: (args) => {
      const q = String(args.kata_kunci ?? args.query ?? '').trim();
      if (!q) return 'ERROR: kata_kunci wajib diisi.';
      const jenis = String(args.jenis ?? '').toLowerCase();
      const resourceType = jenis === 'upah' ? 'labor' : jenis === 'alat' ? 'equipment' : jenis === 'material' ? 'material' : 'unknown';
      try {
        const res = priceResolver2026.resolveResourcePrice({ resourceName: q, resourceType } as any);
        const r: any = (res as any)?.record ?? res;
        if (!r || r.price == null) {
          // Harga null = BELUM TERSEDIA, bukan Rp0 (dan bukan "tidak ada"
          // tanpa konteks: statusnya dinyatakan eksplisit).
          return (
            `Tidak ditemukan harga untuk "${q}" — harga belum tersedia di database (bukan angka nol). ` +
            'Bila perlu, gunakan harga manual yang dilabeli manual atau lakukan riset harga.'
          );
        }
        // Provenance WAJIB ikut (akar PARTIAL C3/C12/C15): nama, satuan,
        // harga, tier/status sumber, status verifikasi (diteruskan apa
        // adanya — NEEDS_REVIEW TIDAK dinaikkan menjadi VERIFIED),
        // dokumen sumber, wilayah basis, dan periode data.
        const name = r.resourceName ?? r.name ?? q;
        const lines: string[] = [
          `${name} — ${r.unit ?? ''} — ${fmtIDR(Math.round(Number(r.price)))}`,
        ];
        const tier: string | undefined = r.source?.tier ?? r.sourceTier;
        if (tier) lines.push(`Status sumber: ${PRICE_TIER_LABELS[tier] ?? tier} (${tier})`);
        const verif: string | undefined = r.verificationStatus;
        if (verif) lines.push(`Status verifikasi: ${verif}`);
        const srcName: string | undefined = r.source?.name ?? r.sourceName;
        const srcDoc: string | undefined = r.source?.document ?? r.sourceDocument ?? undefined;
        if (srcName) lines.push(`Sumber: ${srcName}${srcDoc ? ` — ${srcDoc}` : ''}`);
        else if (srcDoc) lines.push(`Sumber: ${srcDoc}`);
        const loc = r.resolvedLocation ?? r.location;
        if (loc && typeof loc === 'object') {
          const parts = [loc.provinceName, loc.regencyName, loc.cityName].filter(Boolean).join(' / ');
          if (parts || loc.level) lines.push(`Wilayah basis harga: ${parts || loc.level}${parts && loc.level ? ` (${loc.level})` : ''}`);
        } else if (typeof loc === 'string' && loc) {
          lines.push(`Wilayah basis harga: ${loc}`);
        }
        const per = r.resolvedPeriod ?? r.period;
        if (per && (per.label || per.year)) lines.push(`Periode data: ${per.label ?? per.year}`);
        // Alternatif berharga berbeda (bahan perbandingan C4) — bidang
        // yang memang tersedia dari resolver ditampilkan apa adanya.
        const alts = (Array.isArray(r.alternatives) ? r.alternatives : [])
          .filter((a: any) => a && a.price != null && Number(a.price) !== Number(r.price))
          .slice(0, 3);
        if (alts.length > 0) {
          lines.push('Alternatif dari sumber lain (harga berbeda — bandingkan satuan, wilayah, tanggal, dan status verifikasinya):');
          for (const a of alts) {
            lines.push(`• ${fmtIDR(Math.round(Number(a.price)))}/${a.unit ?? ''} — ${a.sourceName ?? '-'} (${a.locationLevel ?? '-'})`);
          }
        }
        return lines.join('\n');
      } catch (e: any) {
        return 'ERROR: gagal mencari harga: ' + (e?.message ?? e);
      }
    },
  },
  {
    name: 'cari_template_rab',
    description: 'Mencari template RAB bangunan (rumah tipe 36/45/70, ruko, jalan beton, drainase). Argumen: kata_kunci (wajib).',
    invoke: (args) => {
      const q = String(args.kata_kunci ?? args.query ?? '').trim().toLowerCase();
      if (!q) return 'ERROR: kata_kunci wajib diisi.';
      try {
        const all = masterBuildingTemplateRegistry.getAllTemplates();
        const words = q.split(/\s+/).filter((w) => w.length > 1);
        const scored = all.map((t: any) => {
          const hay = `${t.name ?? ''} ${t.code ?? ''} ${t.category ?? ''} ${t.description ?? ''}`.toLowerCase();
          let score = 0;
          for (const w of words) if (hay.includes(w)) score++;
          return { t, score };
        }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
        if (scored.length === 0) {
          // FASE 5A (service.ts): hasil tool DITAMPILKAN APA ADANYA sebagai
          // jawaban akhir — tidak ada olahan model sesudahnya. Maka output
          // fallback ini HARUS berbentuk jawaban jadi (tabel draf + pertanyaan
          // dimensi), BUKAN instruksi untuk model lain. Instruksi internal
          // yang bocor ke bubble adalah bug, bukan perilaku model.
          const rawQ = String(args.kata_kunci ?? args.query ?? '').trim();
          let hits: any[] = [];
          try {
            hits = officialAhspRepository.searchOfficialAhsp(rawQ, { limit: 8 });
          } catch {
            hits = [];
          }
          if (hits.length > 0) {
            const rows = hits.map((h, i) => {
              const it: any = h.item;
              const title = it.title ?? it.name ?? '-';
              const price = ahspChatPriceSuffix(it);
              // Suffix berbentuk " — Rp X (status)"; untuk yang belum
              // tersedia bentuknya " — harga belum tersedia (lihat analisa
              // komponen)" — statusnya harus "harga belum tersedia", bukan
              // "lihat analisa komponen".
              let unitPrice = '—';
              let status = 'harga belum tersedia';
              if (!price.includes('harga belum tersedia')) {
                const m = price.match(/^ — (.+?) \((.+)\)$/);
                if (m) {
                  unitPrice = m[1];
                  status = m[2];
                }
              }
              return `| ${i + 1} | [${it.code ?? '-'}] ${title} | — | ${it.unit ?? '—'} | ${unitPrice} | — | ${status} |`;
            }).join('\n');
            return (
              `Draf RAB — Jalan / Perkerasan Paving Block (tidak ada template RAB yang cocok untuk "${q}"; disusun dari item AHSP 2026):\n\n` +
              '| No | Uraian Pekerjaan | Volume | Satuan | Harga Satuan | Jumlah Harga | Status Harga |\n' +
              '|---|---|---|---|---|---|---|\n' +
              `${rows}\n\n` +
              'Volume dan jumlah harga belum bisa dihitung karena dimensi jalan belum ada. Berapa panjang dan lebar jalan yang akan dipasang paving? (Sebutkan juga tebal paving yang dipilih: 6 cm atau 8 cm.)\n\n' +
              'Catatan: draf ini baru mencakup item pemasangan paving yang cocok; pekerjaan persiapan, galian, timbunan, lapis pondasi, dan finishing belum termasuk. ' +
              'Harga di atas berasal dari tool AHSP; item yang belum ada harganya ditulis "harga belum tersedia", bukan Rp0.'
            );
          }
          return (
            `Tidak ada template RAB maupun item AHSP yang cocok dengan kata kunci "${q}". ` +
            'Coba kata kunci lain (mis. "perkerasan", "jalan", "paving blok"), atau jelaskan pekerjaan yang dimaksud — misalnya jenis jalan dan dimensinya — agar draf RAB bisa disusun dari item AHSP yang ditemukan.'
          );
        }
        return scored.map((s, i) => {
          const t: any = s.t;
          const items = Array.isArray(t.workItems) ? t.workItems.length : 0;
          return `${i + 1}. ${t.name ?? t.id} [${t.code ?? ''}] — ${items} item pekerjaan`;
        }).join('\n');
      } catch (e: any) {
        return 'ERROR: gagal mencari template: ' + (e?.message ?? e);
      }
    },
  },
  // ── Project data tools (read-only, active project only) ──
  {
    name: 'get_project_total',
    description: 'Total RAB proyek aktif (deterministik dari engine kanonis). Tanpa argumen. Mengembalikan subtotal langsung DAN total akhir (grand total + overhead/PPN), serta item yang belum punya harga.',
    invoke: () => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const lines = [
        `Subtotal langsung proyek "${snap.projectName}": ${formatIDR(snap.totalDirect)}`,
        `Jumlah item: ${snap.itemCount}`,
      ];
      const cb = snap.costBreakdown;
      if (cb) {
        lines.push(
          `Rincian kanonis: overhead ${cb.overheadPercent}% (${formatIDR(cb.overheadAmount)}) + profit ${cb.profitPercent}% (${formatIDR(cb.profitAmount)}) → subtotal sebelum pajak ${formatIDR(cb.subtotalBeforeTax)} + PPN ${cb.taxPercent}% (${formatIDR(cb.taxAmount)}) = TOTAL AKHIR ${formatIDR(cb.grandTotal)}`,
        );
      }
      if (snap.unresolvedCount > 0) {
        lines.push(
          `Catatan: ${snap.unresolvedCount} item belum memiliki harga dan TIDAK termasuk dalam subtotal maupun total akhir (bukan Rp0).`,
        );
      }
      return lines.join('\n');
    },
  },
  {
    name: 'get_project_items',
    description: 'Mencari item RAB di proyek aktif. Argumen: kata_kunci (opsional — kosongkan untuk semua, maks 25), hanya_belum_berharga (opsional boolean).',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const q = String(args.kata_kunci ?? args.query ?? '').trim().toLowerCase();
      const onlyUnresolved = args.hanya_belum_berharga === true || args.onlyUnresolved === true;
      let pool = onlyUnresolved ? snap.unresolvedItems : snap.items;
      if (q) {
        const words = q.split(/\s+/).filter((w) => w.length > 1);
        pool = pool.filter((it) => {
          const hay = `${it.description} ${it.code} ${it.sectionName}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        });
      }
      if (pool.length === 0) {
        return q
          ? `Tidak ditemukan item RAB yang cocok dengan "${q}" di proyek "${snap.projectName}".`
          : `Proyek "${snap.projectName}" belum memiliki item RAB.`;
      }
      return pool.slice(0, 25).map((it, i) => {
        const price =
          it.priceStatus === 'PRICE_UNRESOLVED'
            ? 'harga belum tersedia'
            : `${formatIDR(it.unitPrice ?? 0)}/${it.unit}`;
        return `${i + 1}. ${it.description} — ${it.volume} ${it.unit} × ${price} = ${formatIDR(it.totalPrice)}`;
      }).join('\n');
    },
  },
  {
    name: 'get_item_detail',
    description: 'Detail satu item RAB di proyek aktif. Argumen: nama (wajib — nama atau kode item). Jika ambigu, kembalikan kandidat.',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const q = String(args.nama ?? args.name ?? args.kode ?? '').trim().toLowerCase();
      if (!q) return 'ERROR: argumen "nama" wajib diisi.';
      const words = q.split(/\s+/).filter((w) => w.length > 1);
      const matches = snap.items.filter((it) => {
        const hay = `${it.description} ${it.code}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
      if (matches.length === 0) {
        return `Item "${q}" tidak ditemukan di proyek "${snap.projectName}". Jangan mengarang data item ini.`;
      }
      if (matches.length > 1) {
        return (
          `Ditemukan ${matches.length} kandidat untuk "${q}" — minta klarifikasi:\n` +
          matches.slice(0, 5).map((it, i) => `${i + 1}. ${it.description} (${it.volume} ${it.unit})`).join('\n')
        );
      }
      const it = matches[0];
      return [
        `Item: ${it.description}`,
        `Kode: ${it.code || '-'}`,
        `Kelompok: ${it.sectionName || '-'}`,
        `Volume: ${it.volume} ${it.unit}`,
        `Harga satuan: ${it.priceStatus === 'PRICE_UNRESOLVED' ? 'belum tersedia (BUKAN Rp0)' : `${formatIDR(it.unitPrice ?? 0)}/${it.unit}`}`,
        // Item unresolved tidak boleh tercetak "Subtotal: Rp0" — snapshot
        // menyimpan totalPrice 0 untuk item belum berharga (observasi C2).
        `Subtotal: ${it.priceStatus === 'PRICE_UNRESOLVED' ? 'belum tersedia' : formatIDR(it.totalPrice)}`,
      ].join('\n');
    },
  },
  {
    name: 'get_unresolved_items',
    description: 'Daftar item RAB proyek aktif yang belum memiliki harga. Tanpa argumen.',
    invoke: () => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      if (snap.unresolvedItems.length === 0) {
        return `Semua ${snap.itemCount} item di proyek "${snap.projectName}" sudah memiliki harga.`;
      }
      return (
        `${snap.unresolvedCount} item belum memiliki harga (tidak termasuk dalam total RAB):\n` +
        snap.unresolvedItems.map((it, i) => `${i + 1}. ${it.description} — ${it.volume} ${it.unit}`).join('\n')
      );
    },
  },
];

export const EZRAB_AI_TOOL_MAP: Record<string, EzrabAiToolDef> = Object.fromEntries(
  EZRAB_AI_TOOLS.map((t) => [t.name, t])
);

export function getToolListText(): string {
  return EZRAB_AI_TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n');
}

export function runTool(
  toolName: string,
  args: Record<string, unknown>
): string | AIToolsStructuredError {
  const tool = EZRAB_AI_TOOL_MAP[toolName];
  if (!tool) {
    return aiToolsError('INTERNAL', 'ezrab-ai:tool', `Alat tidak dikenal: ${toolName}`);
  }
  return tool.invoke(args);
}
