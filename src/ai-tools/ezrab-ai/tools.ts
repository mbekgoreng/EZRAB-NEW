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
import { ProjectSnapshot, formatIDR, snapshotAllItems } from './projectContext';
import {
  getAssistantOperationContext,
  buildUpdateQuantityPlan,
  buildUpdateUnitPricePlan,
  buildDeletePlan,
  buildAddPlan,
  buildUndoPlan,
  getLastUndoableRecord,
  listOperationRecords,
  writesDatasetGuard,
} from './operations';

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
    description: 'Mencari item RAB di proyek aktif. Argumen: kata_kunci (opsional — kosongkan untuk semua, maks 25), hanya_belum_berharga (opsional boolean). Tool ini TIDAK memuat rincian upah tenaga kerja — untuk pertanyaan upah/gaji (mandor, tukang, pekerja) gunakan get_project_labor.',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const q = String(args.kata_kunci ?? args.query ?? '').trim().toLowerCase();
      const onlyUnresolved = args.hanya_belum_berharga === true || args.onlyUnresolved === true;
      const allItems = snapshotAllItems(snap);
      let pool = onlyUnresolved ? allItems.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED') : allItems;
      if (q) {
        const words = q.split(/\s+/).filter((w) => w.length > 1);
        pool = pool.filter((it) => {
          const hay = `${it.description} ${it.code} ${it.sectionName}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        });
      }
      const truncNote = snap.allTruncated
        ? '\nCatatan: proyek melebihi batas 1.000 item alat — pencarian/daftar hanya mencakup 1.000 item pertama.'
        : '';
      if (pool.length === 0) {
        return (q
          ? `Tidak ditemukan item RAB yang cocok dengan "${q}" di proyek "${snap.projectName}".`
          : `Proyek "${snap.projectName}" belum memiliki item RAB.`) + truncNote;
      }
      return pool.slice(0, 25).map((it, i) => {
        const price =
          it.priceStatus === 'PRICE_UNRESOLVED'
            ? 'harga belum tersedia'
            : `${formatIDR(it.unitPrice ?? 0)}/${it.unit}`;
        return `${i + 1}. ${it.description} — ${it.volume} ${it.unit} × ${price} = ${formatIDR(it.totalPrice)}`;
      }).join('\n') + truncNote;
    },
  },
  {
    name: 'get_item_detail',
    description: 'Detail satu item RAB di proyek aktif (volume, harga satuan pekerjaan, subtotal). Argumen: nama (wajib — nama atau kode item). Jika ambigu, kembalikan kandidat. Harga satuan di sini adalah harga SATUAN PEKERJAAN, bukan upah tenaga kerja — untuk rincian upah gunakan get_project_labor.',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const q = String(args.nama ?? args.name ?? args.kode ?? '').trim().toLowerCase();
      if (!q) return 'ERROR: argumen "nama" wajib diisi.';
      const words = q.split(/\s+/).filter((w) => w.length > 1);
      const matches = snapshotAllItems(snap).filter((it) => {
        const hay = `${it.description} ${it.code}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
      if (matches.length === 0) {
        return `Item "${q}" tidak ditemukan di proyek "${snap.projectName}". Jangan mengarang data item ini.` +
          (snap.allTruncated ? ' Catatan: proyek melebihi batas 1.000 item alat — pencarian hanya mencakup 1.000 item pertama, jadi item ini mungkin berada di luar jangkauan.' : '');
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
        ...(it.ahspCode ? [`Kode AHSP tertaut: ${it.ahspCode}`] : []),
        ...(it.ahspMappingStatus ? [`Status pemetaan AHSP: ${it.ahspMappingStatus}`] : []),
        ...(it.priceSourceKind ? [`Jenis sumber harga: ${{ OFFICIAL_AHSP: 'AHSP resmi', MARKET_REFERENCE: 'Referensi pasar', EZRAB_ASSUMPTION: 'Asumsi EZRAB', UNRESOLVED: 'Belum teratasi' }[it.priceSourceKind] ?? it.priceSourceKind}`] : []),
      ].join('\n');
    },
  },
  {
    name: 'get_project_labor',
    description: 'Rincian UPAH tenaga kerja dari analisa AHSP item-item proyek aktif: per kategori (Pekerja, Tukang, Kepala Tukang, Mandor, dll.) tampilkan koefisien, satuan, tarif upah, dan sumbernya. WAJIB dipakai untuk pertanyaan upah/gaji tenaga kerja dalam konteks proyek ini — JANGAN menjawab pertanyaan upah dengan get_project_items/get_item_detail (itu harga satuan pekerjaan, bukan upah). Argumen: nama (opsional — batasi ke satu item), kategori (opsional — mis. "mandor"). Koefisien dan tarif berasal dari komposisi AHSP katalog untuk kode item proyek apa adanya; item yang kodenya tidak ada di katalog atau analisanya tidak memuat upah dinyatakan tidak tersedia secara eksplisit — tidak pernah diganti item/kode lain.',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const nameQ = String(args.nama ?? args.name ?? args.kode ?? '').trim().toLowerCase();
      const catQ = String(args.kategori ?? args.category ?? '').trim().toLowerCase();

      let targets = snapshotAllItems(snap);
      if (nameQ) {
        const words = nameQ.split(/\s+/).filter((w) => w.length > 1);
        const matches = snapshotAllItems(snap).filter((it) => {
          const hay = `${it.description} ${it.code}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        });
        if (matches.length === 0) {
          return `Item "${nameQ}" tidak ditemukan di proyek "${snap.projectName}". Jangan mengarang data item ini.`;
        }
        if (matches.length > 1) {
          return (
            `Ditemukan ${matches.length} kandidat untuk "${nameQ}" — minta klarifikasi:` +
            matches.slice(0, 5).map((it, i) => `\n${i + 1}. ${it.description} (${it.volume} ${it.unit})`).join('')
          );
        }
        targets = matches;
      }

      const fmtCoef = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 6 });
      type LaborRow = {
        category: string;
        coefficient: number;
        unit: string;
        price: number | null;
        subtotal: number | null;
        source: string;
        verification: string;
        resolved: boolean;
      };
      const perItem: Array<{ desc: string; code: string; unit: string; rows: LaborRow[]; partialNote: string | null }> = [];
      const unavailable: Array<{ desc: string; reason: string }> = [];
      const categoriesSeen = new Set<string>();

      for (const it of targets) {
        // Tautan katalog: ahspCode eksplisit didahulukan, lalu code item.
        // Keduanya dicocokkan PERSIS ke katalog — tanpa pemetaan fuzzy.
        const code = String(it.ahspCode ?? '').trim() || String(it.code ?? '').trim();
        if (!code) {
          unavailable.push({ desc: it.description, reason: 'item tidak memiliki kode AHSP, sehingga analisanya tidak dapat ditelusuri' });
          continue;
        }
        let catalogItem: any = null;
        try {
          catalogItem = officialAhspRepository.getOfficialAhsp(code);
        } catch {
          catalogItem = null;
        }
        if (!catalogItem) {
          // Kode proyek apa adanya — TIDAK dipetakan diam-diam ke kode lain.
          unavailable.push({
            desc: it.description,
            reason: `kode ${code} tidak ada di katalog AHSP 2026 resmi, sehingga rincian upahnya tidak tersedia (kode tidak diganti dengan kode lain)`,
          });
          continue;
        }
        let comp: any = null;
        try {
          comp = priceResolver2026.resolveAhspUnitPrice(catalogItem);
        } catch {
          comp = null;
        }
        const laborComps: any[] = comp?.labor?.components ?? [];
        if (!comp || laborComps.length === 0) {
          unavailable.push({
            desc: it.description,
            reason: 'analisa AHSP item ini tidak memuat komponen upah yang dapat ditampilkan',
          });
          continue;
        }
        let rows: LaborRow[] = laborComps.map((c: any) => ({
          category: String(c.itemName ?? '-'),
          coefficient: Number(c.coefficient ?? 0),
          unit: String(c.unit ?? ''),
          price: c.resolved && typeof c.unitPrice === 'number' ? c.unitPrice : null,
          subtotal: c.resolved && typeof c.subtotalPerUnit === 'number' ? c.subtotalPerUnit : null,
          source: String(c.sourceName ?? ''),
          verification: String(c.verificationStatus ?? ''),
          resolved: Boolean(c.resolved),
        }));
        for (const r of rows) categoriesSeen.add(r.category);
        if (catQ) rows = rows.filter((r) => r.category.toLowerCase().includes(catQ));
        if (rows.length === 0) continue;
        const partialNote =
          comp.pricingStatus && comp.pricingStatus !== 'FULL'
            ? `komposisi item ini berstatus ${comp.pricingStatus} (${comp.resolvedComponents}/${comp.totalComponents} komponen terisi) — angka di bawah hanya dari komponen yang ter-resolve`
            : null;
        perItem.push({ desc: it.description, code, unit: it.unit, rows, partialNote });
      }

      const lines: string[] = [];
      const totalRows = perItem.reduce((n, g) => n + g.rows.length, 0);

      if (catQ && totalRows === 0 && perItem.length === 0 && unavailable.length < targets.length) {
        lines.push(
          `Kategori upah "${catQ}" tidak ditemukan dalam analisa item proyek "${snap.projectName}".` +
            (categoriesSeen.size ? ` Kategori yang tersedia: ${[...categoriesSeen].join(', ')}.` : ''),
        );
        return lines.join('\n');
      }

      if (totalRows === 0) {
        lines.push(`Rincian upah tenaga kerja untuk proyek "${snap.projectName}" TIDAK TERSEDIA.`);
        if (unavailable.length > 0) {
          lines.push('Penyebab per item:');
          for (const u of unavailable) lines.push(`- ${u.desc}: ${u.reason}.`);
        }
        // Referensi umum ditawarkan TERPISAH dan berlabel tegas — bukan data proyek.
        lines.push('');
        lines.push('Sebagai pembanding, berikut REFERENSI UPAH UMUM dari database harga (BUKAN data proyek ini, dan bukan rincian analisa item proyek):');
        for (const q of ['Pekerja', 'Tukang', 'Kepala Tukang', 'Mandor']) {
          try {
            const res: any = priceResolver2026.resolveResourcePrice({ resourceName: q, resourceType: 'labor' } as any);
            const r: any = res?.record ?? res;
            if (r && r.price != null) {
              const tier: string | undefined = r.source?.tier ?? r.sourceTier;
              lines.push(
                `- ${r.resourceName ?? r.name ?? q}: ${fmtIDR(Math.round(Number(r.price)))}/${r.unit ?? ''} — status sumber: ${tier ? (PRICE_TIER_LABELS[tier] ?? tier) : '-'}${r.verificationStatus ? `, verifikasi: ${r.verificationStatus}` : ''}`,
              );
            } else {
              lines.push(`- ${q}: harga referensi belum tersedia di database (bukan Rp0).`);
            }
          } catch {
            lines.push(`- ${q}: harga referensi belum tersedia di database (bukan Rp0).`);
          }
        }
        return lines.join('\n');
      }

      lines.push(`Rincian upah tenaga kerja — proyek "${snap.projectName}"`);
      lines.push(
        'Koefisien dan tarif berikut berasal dari ANALISA AHSP katalog untuk kode item proyek ini ' +
          '(referensi analisa resmi, diteruskan apa adanya) — bukan penetapan upah khusus proyek, dan berbeda dari ' +
          'harga satuan pekerjaan pada item RAB. Koefisien tidak dijumlahkan lintas item/satuan.',
      );

      // Tabel tarif ringkas (hanya bila pertanyaan umum, tanpa nama item):
      // tarif distinct per kategori+satuan+harga dari komponen ter-resolve.
      if (!nameQ) {
        const rateMap = new Map<string, { category: string; unit: string; price: number; source: string; items: string[] }>();
        for (const g of perItem) {
          for (const r of g.rows) {
            if (!r.resolved || r.price === null) continue;
            if (catQ && !r.category.toLowerCase().includes(catQ)) continue;
            const key = `${r.category}|${r.unit}|${r.price}`;
            const cur = rateMap.get(key) ?? { category: r.category, unit: r.unit, price: r.price, source: r.source, items: [] };
            if (!cur.items.includes(g.desc)) cur.items.push(g.desc);
            rateMap.set(key, cur);
          }
        }
        if (rateMap.size > 0) {
          lines.push('');
          lines.push('Tarif upah yang dipakai dalam analisa item-item proyek ini:');
          for (const v of rateMap.values()) {
            const used = v.items.slice(0, 3).join('; ') + (v.items.length > 3 ? `; dan ${v.items.length - 3} item lain` : '');
            lines.push(`- ${v.category}: ${fmtIDR(v.price)}/${v.unit} — sumber: ${v.source || '-'} — dipakai pada: ${used}`);
          }
        }
      }

      for (const g of perItem) {
        lines.push('');
        lines.push(`Item: ${g.desc} [${g.code}] — satuan pekerjaan ${g.unit}`);
        for (const r of g.rows) {
          const tarif = r.resolved && r.price !== null ? `${fmtIDR(r.price)}/${r.unit}` : 'belum tersedia (komponen belum ter-resolve — bukan Rp0)';
          const sub = r.resolved && r.subtotal !== null ? ` — subtotal ${fmtIDR(r.subtotal)} per ${g.unit}` : '';
          const src = r.source ? ` — sumber: ${r.source}${r.verification ? ` (${r.verification})` : ''}` : '';
          lines.push(`- ${r.category}: koefisien ${fmtCoef(r.coefficient)} ${r.unit} per ${g.unit}; tarif ${tarif}${sub}${src}`);
        }
        if (g.partialNote) lines.push(`  Catatan: ${g.partialNote}.`);
      }

      if (unavailable.length > 0) {
        lines.push('');
        lines.push('Item proyek tanpa rincian upah yang dapat ditampilkan:');
        for (const u of unavailable) lines.push(`- ${u.desc}: ${u.reason}.`);
      }
      if (snap.allTruncated) {
        lines.push('');
        lines.push('Catatan: daftar item alat mencapai batas 1.000 item; item selebihnya tidak tercakup dalam jawaban ini.');
      }
      return lines.join('\n');
    },
  },
  {
    name: 'get_project_sections',
    description: 'Ringkasan per seksi/kelompok pekerjaan proyek aktif: jumlah item, subtotal ter-resolve, dan jumlah item belum berharga per seksi. Tanpa argumen. Pakai untuk pertanyaan total per seksi/bagian pekerjaan.',
    invoke: () => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const groups = new Map<string, { count: number; subtotal: number; unresolved: number }>();
      for (const it of snapshotAllItems(snap)) {
        const key = it.sectionName || 'Tanpa Seksi';
        const g = groups.get(key) ?? { count: 0, subtotal: 0, unresolved: 0 };
        g.count += 1;
        if (it.priceStatus === 'PRICE_UNRESOLVED') g.unresolved += 1;
        else g.subtotal += it.totalPrice;
        groups.set(key, g);
      }
      const lines = [`Ringkasan per seksi — proyek "${snap.projectName}" (${snap.itemCount} item):`];
      for (const [name, g] of groups) {
        lines.push(`- ${name}: ${g.count} item — subtotal ${formatIDR(g.subtotal)}${g.unresolved ? ` — ${g.unresolved} item belum berharga (tidak dihitung Rp0)` : ''}`);
      }
      lines.push(`Total langsung (item ter-resolve): ${formatIDR(snap.totalDirect)}`);
      if (snap.unresolvedCount) lines.push(`Catatan: ${snap.unresolvedCount} item belum memiliki harga, sehingga total di atas bersifat parsial.`);
      if (snap.allTruncated) lines.push('Catatan: daftar item alat mencapai batas 1.000 item; item selebihnya tidak tercakup.');
      return lines.join('\n');
    },
  },
  {
    name: 'get_project_costliest',
    description: 'Item-item dengan biaya terbesar di proyek aktif (berdasarkan subtotal ter-resolve). Argumen: jumlah (opsional, default 5, maks 10). Pakai untuk pertanyaan item termahal/terbesar biayanya.',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const n = Math.min(10, Math.max(1, Number(args.jumlah ?? 5) || 5));
      const resolved = snapshotAllItems(snap).filter((i) => i.priceStatus !== 'PRICE_UNRESOLVED').sort((a, b) => b.totalPrice - a.totalPrice);
      if (resolved.length === 0) return `Belum ada item berharga ter-resolve di proyek "${snap.projectName}" — peringkat biaya tidak dapat dibuat (harga yang hilang tidak dianggap Rp0).`;
      const lines = [`${Math.min(n, resolved.length)} item berbiaya terbesar — proyek "${snap.projectName}":`];
      resolved.slice(0, n).forEach((it, i) => {
        lines.push(`${i + 1}. ${it.description} (${it.code || 'tanpa kode'}) — ${it.volume} ${it.unit} × ${formatIDR(it.unitPrice ?? 0)} = ${formatIDR(it.totalPrice)} — Seksi: ${it.sectionName || '-'}`);
      });
      if (snap.unresolvedCount) lines.push(`Catatan: ${snap.unresolvedCount} item belum berharga dan tidak ikut peringkat.`);
      if (snap.allTruncated) lines.push('Catatan: proyek melebihi batas 1.000 item alat — peringkat dihitung dari 1.000 item pertama.');
      return lines.join('\n');
    },
  },
  {
    name: 'get_project_materials',
    description: 'Kebutuhan MATERIAL proyek aktif dari analisa AHSP: koefisien material per item dikalikan volume proyek (deterministik), diagregasi hanya untuk material+satuan yang sama, lengkap dengan tarif, sumber, dan status. WAJIB dipakai untuk pertanyaan kebutuhan material — JANGAN mengarang kebutuhan material. Argumen: nama (opsional — batasi ke satu item). Komponen yang belum ter-resolve dinyatakan eksplisit; item tanpa analisa valid didaftar dengan penyebabnya.',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const nameQ = String(args.nama ?? args.name ?? args.kode ?? '').trim().toLowerCase();
      let targets = snapshotAllItems(snap);
      if (nameQ) {
        const words = nameQ.split(/\s+/).filter((w) => w.length > 1);
        const matches = snapshotAllItems(snap).filter((it) => {
          const hay = `${it.description} ${it.code}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        });
        if (matches.length === 0) return `Item "${nameQ}" tidak ditemukan di proyek "${snap.projectName}". Jangan mengarang data item ini.`;
        if (matches.length > 1) {
          return `Ditemukan ${matches.length} kandidat untuk "${nameQ}" — minta klarifikasi:` +
            matches.slice(0, 5).map((it, i) => `\n${i + 1}. ${it.description} (${it.volume} ${it.unit})`).join('');
        }
        targets = matches;
      }
      const fmtQty = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 4 });
      type MatRow = { name: string; coefficient: number; unit: string; need: number; price: number | null; source: string; verification: string; resolved: boolean };
      const perItem: Array<{ desc: string; code: string; volume: number; unit: string; rows: MatRow[]; partial: boolean }> = [];
      const unavailable: Array<{ desc: string; reason: string }> = [];
      for (const it of targets) {
        const code = String(it.ahspCode ?? '').trim() || String(it.code ?? '').trim();
        if (!code) { unavailable.push({ desc: it.description, reason: 'item tidak memiliki kode AHSP' }); continue; }
        let catalogItem: any = null;
        try { catalogItem = officialAhspRepository.getOfficialAhsp(code); } catch { catalogItem = null; }
        if (!catalogItem) { unavailable.push({ desc: it.description, reason: `kode ${code} tidak ada di katalog AHSP 2026 resmi (tidak dipetakan diam-diam ke kode lain)` }); continue; }
        let comp: any = null;
        try { comp = priceResolver2026.resolveAhspUnitPrice(catalogItem); } catch { comp = null; }
        const matComps: any[] = comp?.material?.components ?? [];
        if (!comp || matComps.length === 0) { unavailable.push({ desc: it.description, reason: 'analisa AHSP item ini tidak memuat komponen material' }); continue; }
        const rows: MatRow[] = matComps.map((c: any) => ({
          name: String(c.itemName ?? '-'),
          coefficient: Number(c.coefficient ?? 0),
          unit: String(c.unit ?? ''),
          need: Number(c.coefficient ?? 0) * it.volume,
          price: c.resolved && typeof c.unitPrice === 'number' ? c.unitPrice : null,
          source: String(c.sourceName ?? ''),
          verification: String(c.verificationStatus ?? ''),
          resolved: Boolean(c.resolved),
        }));
        perItem.push({ desc: it.description, code, volume: it.volume, unit: it.unit, rows, partial: Boolean(comp.pricingStatus && comp.pricingStatus !== 'FULL') });
      }
      const lines: string[] = [];
      const totalRows = perItem.reduce((n, g) => n + g.rows.length, 0);
      if (totalRows === 0) {
        lines.push(`Kebutuhan material proyek "${snap.projectName}" TIDAK TERSEDIA dari analisa AHSP.`);
        for (const u of unavailable) lines.push(`- ${u.desc}: ${u.reason}.`);
        return lines.join('\n');
      }
      lines.push(`Kebutuhan material — proyek "${snap.projectName}"`);
      lines.push('Dihitung deterministik dari koefisien analisa AHSP katalog × volume item proyek. Agregasi hanya menggabungkan material dengan satuan yang sama; satuan tidak pernah dikonversi diam-diam.');
      if (!nameQ) {
        const agg = new Map<string, { name: string; unit: string; need: number; price: number | null; priceVaries: boolean; unresolved: number; source: string }>();
        for (const g of perItem) {
          for (const r of g.rows) {
            const key = `${r.name.toLowerCase()}|${r.unit}`;
            const cur = agg.get(key) ?? { name: r.name, unit: r.unit, need: 0, price: r.price, priceVaries: false, unresolved: 0, source: r.source };
            cur.need += r.need;
            if (!r.resolved) cur.unresolved += 1;
            else if (cur.price !== null && r.price !== null && cur.price !== r.price) cur.priceVaries = true;
            else if (cur.price === null) cur.price = r.price;
            agg.set(key, cur);
          }
        }
        lines.push('');
        lines.push('Total kebutuhan per material:');
        for (const v of [...agg.values()].sort((a, b) => b.need - a.need)) {
          const priceTxt = v.unresolved > 0 ? 'sebagian harga belum tersedia' : v.priceVaries ? 'tarif bervariasi antar analisa' : v.price !== null ? `${formatIDR(v.price)}/${v.unit}` : 'harga belum tersedia';
          lines.push(`- ${v.name}: ${fmtQty(v.need)} ${v.unit} — tarif: ${priceTxt}${v.source ? ` — sumber koefisien/harga: ${v.source}` : ''}`);
        }
      }
      for (const g of perItem) {
        lines.push('');
        lines.push(`Item: ${g.desc} [${g.code}] — volume proyek ${g.volume} ${g.unit}`);
        for (const r of g.rows) {
          lines.push(`- ${r.name}: koefisien ${r.coefficient} ${r.unit} per ${g.unit} → kebutuhan ${fmtQty(r.need)} ${r.unit}; tarif ${r.resolved && r.price !== null ? `${formatIDR(r.price)}/${r.unit}` : 'belum tersedia (bukan Rp0)'}${r.source ? ` — sumber: ${r.source}${r.verification ? ` (${r.verification})` : ''}` : ''}`);
        }
        if (g.partial) lines.push('  Catatan: komposisi item ini berstatus parsial — sebagian komponen belum ter-resolve.');
      }
      if (unavailable.length > 0) {
        lines.push('');
        lines.push('Item tanpa analisa material yang dapat ditampilkan:');
        for (const u of unavailable) lines.push(`- ${u.desc}: ${u.reason}.`);
      }
      if (snap.allTruncated) lines.push('\nCatatan: daftar item alat mencapai batas 1.000 item; item selebihnya tidak tercakup.');
      return lines.join('\n');
    },
  },
  {
    name: 'propose_update_quantity',
    description: 'Mengusulkan perubahan VOLUME/KUANTITAS satu item RAB proyek aktif. Tool ini hanya membuat PRATINJAU — perubahan TIDAK dieksekusi oleh tool ini; eksekusi hanya terjadi bila pengguna menekan tombol Konfirmasi pada kartu pratinjau. Argumen: nama (nama/kode item), volume (angka baru). Setelah memanggil tool ini, sampaikan pratinjaunya apa adanya dan katakan perubahan menunggu konfirmasi pengguna — JANGAN menyatakan perubahan sudah terjadi.',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const ctx = getAssistantOperationContext();
      if (!ctx?.writesEnabled) return 'Operasi tulis Asisten AI tidak aktif untuk sesi ini: peran aktif tidak memiliki capability edit-estimate (atau belum masuk dengan peran demo). Perubahan RAB hanya dapat diusulkan oleh peran yang berhak mengedit estimasi. Tidak ada perubahan yang dibuat.';
      const datasetGuard = writesDatasetGuard(snap);
      if (datasetGuard) return datasetGuard;
      const vol = typeof args.volume === 'number' ? args.volume : Number(args.volume);
      const res = buildUpdateQuantityPlan(snap, { id: String(args.id ?? '') || undefined, nama: String(args.nama ?? args.name ?? '') || undefined }, vol, ctx.actor);
      return res.ok ? res.plan.previewText : res.message;
    },
  },
  {
    name: 'propose_update_unit_price',
    description: 'Mengusulkan perubahan HARGA SATUAN satu item RAB proyek aktif menjadi harga MANUAL. Hanya membuat PRATINJAU (eksekusi lewat tombol Konfirmasi pengguna). Harga manual tidak mewarisi label sumber resmi. Argumen: nama, harga (angka rupiah baru). JANGAN menyatakan perubahan sudah terjadi.',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const ctx = getAssistantOperationContext();
      if (!ctx?.writesEnabled) return 'Operasi tulis Asisten AI tidak aktif untuk sesi ini: peran aktif tidak memiliki capability edit-estimate (atau belum masuk dengan peran demo). Tidak ada perubahan yang dibuat.';
      const datasetGuard = writesDatasetGuard(snap);
      if (datasetGuard) return datasetGuard;
      const price = typeof args.harga === 'number' ? args.harga : Number(args.harga ?? args.price);
      const res = buildUpdateUnitPricePlan(snap, { id: String(args.id ?? '') || undefined, nama: String(args.nama ?? args.name ?? '') || undefined }, price, ctx.actor);
      return res.ok ? res.plan.previewText : res.message;
    },
  },
  {
    name: 'propose_delete_items',
    description: 'Mengusulkan PENGHAPUSAN satu atau beberapa item RAB proyek aktif. Hanya membuat PRATINJAU — penghapusan TIDAK terjadi tanpa tombol Konfirmasi pengguna. Argumen: nama (satu item) atau daftar_nama (array nama item). JANGAN menyatakan item sudah terhapus.',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const ctx = getAssistantOperationContext();
      if (!ctx?.writesEnabled) return 'Operasi tulis Asisten AI tidak aktif untuk sesi ini: peran aktif tidak memiliki capability edit-estimate (atau belum masuk dengan peran demo). Tidak ada perubahan yang dibuat.';
      const datasetGuard = writesDatasetGuard(snap);
      if (datasetGuard) return datasetGuard;
      const list: Array<{ nama?: string; id?: string }> = [];
      if (Array.isArray(args.daftar_nama)) for (const n of args.daftar_nama) list.push({ nama: String(n) });
      if (Array.isArray(args.daftar_id)) for (const n of args.daftar_id) list.push({ id: String(n) });
      if (args.nama || args.name) list.push({ nama: String(args.nama ?? args.name) });
      if (args.id) list.push({ id: String(args.id) });
      const res = buildDeletePlan(snap, list, ctx.actor);
      return res.ok ? res.plan.previewText : res.message;
    },
  },
  {
    name: 'propose_add_item',
    description: 'Mengusulkan PENAMBAHAN item RAB baru dari katalog AHSP resmi ke proyek aktif. Hanya kode katalog yang valid persis yang diterima — kode tidak ditebak/dipetakan. Hanya membuat PRATINJAU (eksekusi lewat tombol Konfirmasi). Argumen: kode_ahsp (wajib), volume (opsional).',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const ctx = getAssistantOperationContext();
      if (!ctx?.writesEnabled) return 'Operasi tulis Asisten AI tidak aktif untuk sesi ini: peran aktif tidak memiliki capability edit-estimate (atau belum masuk dengan peran demo). Tidak ada perubahan yang dibuat.';
      const datasetGuard = writesDatasetGuard(snap);
      if (datasetGuard) return datasetGuard;
      const vol = args.volume != null ? Number(args.volume) : undefined;
      const res = buildAddPlan(snap, String(args.kode_ahsp ?? args.kode ?? ''), vol, ctx.actor);
      return res.ok ? res.plan.previewText : res.message;
    },
  },
  {
    name: 'propose_undo_last',
    description: 'Mengusulkan UNDO operasi Asisten AI terakhir pada proyek aktif. Hanya membuat PRATINJAU undo (eksekusi lewat tombol Konfirmasi). Undo ditolak otomatis bila data sudah berubah sesudah operasi itu. Tanpa argumen.',
    invoke: () => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const ctx = getAssistantOperationContext();
      if (!ctx?.writesEnabled) return 'Operasi tulis Asisten AI tidak aktif untuk sesi ini: peran aktif tidak memiliki capability edit-estimate (atau belum masuk dengan peran demo). Tidak ada perubahan yang dibuat.';
      const datasetGuard = writesDatasetGuard(snap);
      if (datasetGuard) return datasetGuard;
      const last = getLastUndoableRecord(snap.projectId);
      if (!last) return `Belum ada operasi Asisten AI yang tercatat untuk proyek "${snap.projectName}" — tidak ada yang bisa di-undo.`;
      const res = buildUndoPlan(snap, last, ctx.actor);
      return res.ok ? res.plan.previewText : res.message;
    },
  },
  {
    name: 'get_operation_history',
    description: 'Riwayat operasi tulis Asisten AI pada proyek aktif (dari log operasi aplikasi): waktu, jenis, ringkasan, status, dan status penyimpanan. Argumen: jumlah (opsional, default 10). Pakai untuk pertanyaan riwayat perubahan oleh asisten.',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const n = Math.min(25, Math.max(1, Number(args.jumlah ?? 10) || 10));
      const rows = listOperationRecords(snap.projectId).slice(0, n);
      if (rows.length === 0) return `Belum ada operasi Asisten AI yang tercatat untuk proyek "${snap.projectName}".`;
      const lines = [`Riwayat operasi Asisten AI — proyek "${snap.projectName}" (${rows.length} terakhir):`];
      for (const r of rows) {
        lines.push(`- ${new Date(r.ts).toLocaleString('id-ID')} — ${r.summary} — status: ${r.status} — penyimpanan: ${r.persistence} — oleh: ${r.actor}`);
      }
      return lines.join('\n');
    },
  },
  {
    name: 'get_unresolved_items',
    description: 'Daftar item RAB proyek aktif yang belum memiliki harga. Tanpa argumen.',
    invoke: () => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const unresolvedAll = snapshotAllItems(snap).filter((i) => i.priceStatus === 'PRICE_UNRESOLVED');
      if (snap.unresolvedCount === 0) {
        return `Semua ${snap.itemCount} item di proyek "${snap.projectName}" sudah memiliki harga.`;
      }
      if (unresolvedAll.length === 0) {
        // Semua item belum berharga berada di luar batas daftar alat.
        return `${snap.unresolvedCount} item belum memiliki harga (tidak termasuk dalam total RAB). Catatan: proyek melebihi batas 1.000 item alat — item-item tersebut berada di luar jangkauan daftar ini.`;
      }
      const shown = unresolvedAll.slice(0, 25);
      return (
        `${snap.unresolvedCount} item belum memiliki harga (tidak termasuk dalam total RAB):\n` +
        shown.map((it, i) => `${i + 1}. ${it.description} — ${it.volume} ${it.unit}`).join('\n') +
        (unresolvedAll.length > shown.length ? `\n…dan ${unresolvedAll.length - shown.length} item lainnya.` : '') +
        (snap.allTruncated && snap.unresolvedCount > unresolvedAll.length
          ? `\nCatatan: proyek melebihi batas 1.000 item alat — ${snap.unresolvedCount - unresolvedAll.length} item belum berharga lainnya berada di luar jangkauan daftar ini.`
          : '')
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
