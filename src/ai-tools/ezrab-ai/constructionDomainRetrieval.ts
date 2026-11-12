/**
 * constructionDomainRetrieval.ts — RETRIEVAL DOMAIN KONSTRUKSI
 * (AI Intelligence Overhaul Fase 4 — Construction Intelligence).
 *
 * Kandidat AHSP yang relevan dengan spek + referensi teknis yang
 * sudah ada di repo, dengan provenans. Jalur:
 *  1. KB internal (`constructionRetrieval.searchConstructionKnowledge`)
 *     — referensi teknis terdaftar, bersitasi.
 *  2. Katalog resmi AHSP (`officialAhspRepository.searchOfficialAhsp`)
 *     — kandidat kode resmi; tiap kandidat DIVERIFIKASI harganya lewat
 *     resolver yang ada (`priceResolver2026.resolveAhspUnitPrice`).
 *
 * Aturan keras (warisan program): kandidat yang ditampilkan HARUS
 * dapat dilacak ke sumber resmi. Kandidat yang harganya tidak dapat
 * diresolver TIDAK DIHILANGKAN diam-diam — ia tampil dengan status
 * `PRICE_UNRESOLVED` + alasan (bukan angka karangan, bukan Rp0).
 * Unit mismatch → kandidat ditandai `UNIT_MISMATCH` dan TIDAK BOLEH
 * dipakai untuk kalkulasi (CON-11 — pemakaian diblokir di lapisan
 * kalkulasi, di sini dinyatakan).
 */

import { searchConstructionKnowledge, type RetrievalHit } from './constructionRetrieval';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { getAhspDirectPrice } from '../../data/priceDatabase2026/ahspDisplayPolicy';
import type { StructuredSpec } from './structuredSpec';

export interface AhspCandidate {
  code: string;
  name: string;
  unit: string;
  domain: string;
  /** Harga satuan hasil resolver — null bila tak dapat diresolver. */
  unitPrice: number | null;
  /** Status harga dari resolver (atau PRICE_UNRESOLVED bila gagal). */
  priceStatus: string;
  /** Provenans yang dapat dilacak: sumber + kode + status verifikasi. */
  provenance: string;
  /** Skor pencarian katalog resmi (bukan harga). */
  searchScore: number;
}

export interface DomainRetrievalResult {
  /** Referensi teknis KB internal (bersitasi). */
  kbHits: RetrievalHit[];
  /** Kandidat AHSP resmi (terverifikasi harga bila memungkinkan). */
  ahspCandidates: AhspCandidate[];
  /** Query yang tidak menghasilkan kandidat apa pun (dinyatakan). */
  unresolvedQueries: string[];
}

/** Istilah pencarian dari spek (material/dimensi/count/scope) + teks bebas. */
export function retrievalQueriesFromSpecs(specs: StructuredSpec[], freeText?: string): string[] {
  const out: string[] = [];
  const push = (q: string): void => {
    const t = (q || '').trim();
    if (t.length >= 3 && !out.includes(t)) out.push(t);
  };
  for (const s of specs) {
    if (s.value == null) continue;
    const v = Array.isArray(s.value) ? s.value.join(' ') : String(s.value);
    if (s.kind === 'material' || s.kind === 'scope') push(`${s.label} ${v}`);
    else if (s.kind === 'dimension' || s.kind === 'count') push(s.label);
  }
  if (freeText) {
    for (const phrase of freeText.split(/[,;]/)) push(phrase);
  }
  return out.slice(0, 8);
}

function normalizeUnit(u: string): string {
  return (u || '').toLowerCase().replace(/[²³]/g, (m) => (m === '²' ? '2' : '3')).replace(/'/g, '').trim();
}

/** Item katalog resmi apa adanya (komponen + harga baked ikut ke resolver — pola ahspChatPrice). */
export interface AhspRepositoryItemLike {
  code: string;
  name: string;
  unit: string;
  domain: string;
  laborComponents?: unknown[];
  materialComponents?: unknown[];
  equipmentComponents?: unknown[];
  unitPrice?: number | null;
  title?: string;
}

/**
 * Satu kandidat AHSP → verifikasi harga lewat resolver (item LENGKAP
 * dengan komponennya, bukan kode saja — pemanggilan kode-saja adalah
 * salah bentuk dan selalu mengembalikan null). Harga = direct resolver
 * ?? baked item (pola ahspChatPrice). Unit yang diminta (bila ada)
 * dibandingkan dengan unit kandidat: mismatch dinyatakan
 * UNIT_MISMATCH dan harga TIDAK dipakai (null).
 */
export function verifyAhspCandidate(
  item: AhspRepositoryItemLike,
  requestedUnit?: string | null,
): AhspCandidate {
  const code = String(item.code ?? '');
  const name = String(item.name ?? item.title ?? '');
  const unit = String(item.unit ?? '');
  const domain = String(item.domain ?? '');
  const provenance = `[AHSP resmi · kode ${code} · domain ${domain || '—'} · sumber: officialAhspRepository]`;
  if (requestedUnit && normalizeUnit(requestedUnit) !== normalizeUnit(unit)) {
    return {
      code, name, unit, domain,
      unitPrice: null,
      priceStatus: 'UNIT_MISMATCH',
      provenance: `${provenance} · UNIT_MISMATCH: diminta "${requestedUnit}", kandidat bersatuan "${unit}" — kalkulasi diblokir.`,
      searchScore: 0,
    };
  }
  try {
    const comp = priceResolver2026.resolveAhspUnitPrice(item as never);
    const direct = getAhspDirectPrice(comp as never);
    const baked = typeof item.unitPrice === 'number' && item.unitPrice > 0 ? item.unitPrice : null;
    const price = direct ?? baked;
    const missing = (comp as { missing?: unknown[] }).missing ?? [];
    return {
      code, name, unit, domain,
      unitPrice: typeof price === 'number' && Number.isFinite(price) ? price : null,
      priceStatus: price == null ? 'PRICE_UNRESOLVED' : missing.length > 0 ? 'PARTIAL' : 'FULL',
      provenance: price == null
        ? `${provenance} · PRICE_UNRESOLVED: harga tidak dapat diresolver dari data resmi — bukan Rp0.`
        : `${provenance} · harga resolver: ${price}${missing.length > 0 ? ` (parsial — ${missing.length} komponen hilang)` : ''}`,
      searchScore: 0,
    };
  } catch (e) {
    return {
      code, name, unit, domain,
      unitPrice: null,
      priceStatus: 'PRICE_UNRESOLVED',
      provenance: `${provenance} · PRICE_UNRESOLVED: resolver gagal (${e instanceof Error ? e.message : 'error'}) — bukan Rp0.`,
      searchScore: 0,
    };
  }
}

/**
 * Retrieval domain penuh: KB + kandidat AHSP resmi per query.
 * `requestedUnit` (bila ada) dipakai sebagai gerbang unit per query.
 */
export function retrieveDomainCandidates(
  queries: string[],
  opts?: { maxAhspPerQuery?: number; requestedUnit?: string | null },
): DomainRetrievalResult {
  const maxAhsp = opts?.maxAhspPerQuery ?? 3;
  const kbHits: RetrievalHit[] = [];
  const seenKb = new Set<string>();
  const ahspCandidates: AhspCandidate[] = [];
  const seenAhsp = new Set<string>();
  const unresolvedQueries: string[] = [];

  for (const q of queries) {
    let found = false;
    for (const h of searchConstructionKnowledge(q, { maxResults: 3 })) {
      if (seenKb.has(h.record.id)) continue;
      seenKb.add(h.record.id);
      kbHits.push(h);
      found = true;
    }
    const foundAhsp = officialAhspRepository.searchOfficialAhsp(q, { limit: maxAhsp });
    for (const { item, score } of foundAhsp) {
      const code = String((item as { code?: string }).code ?? '');
      if (!code || seenAhsp.has(code)) continue;
      seenAhsp.add(code);
      const cand = verifyAhspCandidate(
        item as unknown as AhspRepositoryItemLike,
        opts?.requestedUnit ?? null,
      );
      cand.searchScore = score;
      ahspCandidates.push(cand);
      found = true;
    }
    if (!found) unresolvedQueries.push(q);
  }

  return { kbHits, ahspCandidates, unresolvedQueries };
}

/** Baris kandidat untuk jawaban / prompt (provenans selalu ikut). */
export function formatDomainCandidateLines(result: DomainRetrievalResult): string[] {
  const lines: string[] = [];
  for (const h of result.kbHits) {
    lines.push(`• Referensi: ${h.record.commonName} [${h.record.category} · dukungan: ${h.record.supportStatus}] — ${h.citation}`);
  }
  for (const c of result.ahspCandidates) {
    const price = c.unitPrice != null
      ? `Rp${c.unitPrice.toLocaleString('id-ID')}/${c.unit}`
      : `harga ${c.priceStatus} (bukan Rp0)`;
    lines.push(`• AHSP ${c.code} — ${c.name} (${c.unit}): ${price}. ${c.provenance}`);
  }
  for (const q of result.unresolvedQueries) {
    lines.push(`• Tidak ditemukan kandidat resmi untuk "${q}" — tidak dikarang; nyatakan sebagai item non-AHSP bila tetap dibutuhkan.`);
  }
  return lines;
}
