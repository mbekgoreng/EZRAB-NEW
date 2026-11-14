/**
 * DraftReviewPanel — PANEL REVIEW DRAFT (P6, FULL REPAIR 2026-11-13,
 * audit Autonomous Estimation §A.5).
 *
 * Panel overlay di Chat AI (dibuka dari menu ⋯ → "Review draft"):
 * pemeriksaan per item sebelum transfer — BUKAN pajangan: setiap
 * aksi memanggil logika murni `draftReview.ts` lalu `onApplyDraft`
 * (view.tsx mengganti singleton + `saveDraft`, jadi perubahan
 * bertahan) atau `onResolveMissing` (lampiran DED + dedQto draft
 * diperbarui + dipersisten).
 *
 * Isi panel:
 *  1. Kesiapan + total draft (draftReadiness + computeTotals).
 *  2. Kelengkapan WBS (P3D-O3 — wbsCompletenessLines).
 *  3. Info hilang (identifikasi agregat draftReview).
 *  4. Dimensi DED MISSING (EF-09 — isi dimensi → hitung ulang QTO).
 *  5. Tabel item: kode AHSP (EF-06), harga + penjelasan sumber (E5),
 *     editor per item (uraian/spek/volume, remap AHSP, harga manual,
 *     verifikasi harga, putusan asumsi — P5-O2).
 *  6. Revisi: pratinjau tertunda + kesiapan kandidat + aktivasi
 *     (activateRevision + guard P4 — lewat view), banding versi
 *     (diff revisi yang sudah ada).
 *
 * Desain: biru-abu/navy/biru elektrik EZRAB, Plus Jakarta Sans
 * (warisan), minimal, ringkas di mobile (tabel scroll horizontal).
 * Tanpa CSS baru — seluruh gaya inline agar tidak menyentuh lembar
 * gaya bersama.
 */

import React, { useMemo, useState } from 'react';
import {
  computeTotals,
  draftReadiness,
  effectiveItems,
  readinessLabel,
  traceDraftItems,
  wbsCompletenessLines,
  type DraftItem,
  type UniversalDraft,
} from './universalRab';
import { formatRevisionPreviewMessage, listVersionHistory, type RevisionPreview } from './draftRevision';
import type { DedAttachment } from './dedQtoIntegration';
import type { QtoUserDimensions } from './qtoBridge';
import { normalizeUnit } from '../../data/priceDatabase2026/normalize';
import { formatRupiah } from '../../engine/formulaEngine';
import {
  clearDraftItemManualPrice,
  decideDraftItemAssumption,
  defaultAhspPriceLookup,
  editDraftItem,
  identifyMissingInfo,
  itemHasDecidableAssumption,
  listMissingDimensionItems,
  missingDimsHint,
  remapDraftItemAhsp,
  setDraftItemManualPrice,
  verifyDraftItemPrice,
  type AssumptionDecision,
} from './draftReview';

export interface DraftReviewPanelProps {
  draft: UniversalDraft;
  projectId: string | null;
  /** Lampiran DED aktif proyek (null = tanpa DED — seksi MISSING disembunyikan). */
  dedAttachment: DedAttachment | null;
  /** Pratinjau revisi Gate 3 yang menunggu (null = tidak ada). */
  pendingRevision: RevisionPreview | null;
  /** Terapkan draft hasil edit: view mengganti singleton + saveDraft + pesan chat. */
  onApplyDraft: (next: UniversalDraft, message: string) => void;
  /** Resolve MISSING: view memuat lampiran segar, menerapkan, menyimpan, menyegarkan dedQto. */
  onResolveMissing: (itemId: string, dims: QtoUserDimensions) => { ok: boolean; message: string };
  /** Aktivasi pratinjau tertunda (view: runRevisionActivation + pesan chat). */
  onActivateRevision: () => void;
  onCancelRevision: () => void;
  /** Banding dua versi (view: compareStoredVersions → pesan chat). */
  onCompareVersions: (versionA: number, versionB: number) => void;
  onClose: () => void;
}

/* ---------- gaya (palet EZRAB: navy / biru elektrik / abu) ---------- */

const C = {
  navy: '#0F172A',
  blue: '#1D4ED8',
  blueSoft: '#2563EB',
  blueBg: '#EFF6FF',
  border: '#E2E8F0',
  muted: '#64748B',
  body: '#334155',
  amberBg: '#FFFBEB',
  amberBorder: '#F59E0B',
  redBg: '#FEF2F2',
  redText: '#B91C1C',
  greenBg: '#F0FDF4',
  greenText: '#15803D',
};

const btn = (primary = false): React.CSSProperties => ({
  border: primary ? '1px solid #1D4ED8' : '1px solid #CBD5E1',
  background: primary ? '#1D4ED8' : '#FFFFFF',
  color: primary ? '#FFFFFF' : '#0F172A',
  borderRadius: 8,
  padding: '6px 12px',
  fontSize: 12.5,
  fontWeight: 650,
  cursor: 'pointer',
});

const input: React.CSSProperties = {
  border: '1px solid #CBD5E1',
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  color: C.navy,
  background: '#FFFFFF',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 750,
  color: C.navy,
  margin: '18px 0 8px',
};

function fmtPrice(it: DraftItem): string {
  if (it.unitPrice == null) return 'Belum tersedia';
  return formatRupiah(it.unitPrice);
}

function priceBadge(it: DraftItem): { text: string; bg: string; fg: string } {
  if (it.priceStatus === 'PRICE_UNRESOLVED' || it.unitPrice == null) {
    return { text: 'BELUM TERSEDIA', bg: C.redBg, fg: C.redText };
  }
  if (it.priceStatus === 'PRICE_MANUAL') return { text: 'MANUAL', bg: C.amberBg, fg: '#92400E' };
  if (it.priceStatus === 'PRICE_ESTIMATED') return { text: 'ESTIMASI AI', bg: C.amberBg, fg: '#92400E' };
  if (it.priceSourceKind === 'OFFICIAL_AHSP') return { text: 'RESMI AHSP', bg: C.greenBg, fg: C.greenText };
  if (it.priceSourceKind === 'MARKET_REFERENCE') return { text: 'REFERENSI PASAR', bg: C.blueBg, fg: C.blue };
  return { text: 'DATABASE', bg: '#F1F5F9', fg: C.body };
}

/* ------------------------------------------------------------------ */

export function DraftReviewPanel(props: DraftReviewPanelProps): React.ReactElement {
  const { draft, projectId, dedAttachment, pendingRevision } = props;
  const items = useMemo(() => effectiveItems(draft), [draft]);
  const traced = useMemo(() => traceDraftItems(draft), [draft]);
  const traceById = useMemo(() => new Map(traced.map((t) => [t.id, t])), [traced]);
  const totals = useMemo(() => computeTotals(draft), [draft]);
  const readiness = useMemo(() => draftReadiness(draft), [draft]);
  const wbsLines = useMemo(() => wbsCompletenessLines(draft), [draft]);
  const missing = useMemo(() => identifyMissingInfo(draft), [draft]);
  const history = useMemo(
    () => (projectId ? listVersionHistory(projectId) : { activeVersion: null, snapshots: [] }),
    [projectId, draft.version, pendingRevision],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editVolume, setEditVolume] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [remapCode, setRemapCode] = useState('');
  const [remapPreview, setRemapPreview] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<number | ''>('');
  const [compareB, setCompareB] = useState<number | ''>('');

  const selected = selectedId ? items.find((i) => i.id === selectedId) ?? null : null;
  const selectedTrace = selected ? traceById.get(selected.id) : undefined;
  const storedDims = draft.dedQto?.dims ?? {};
  const missingProposals = useMemo(
    () => (dedAttachment ? listMissingDimensionItems(dedAttachment, draft.dedQto?.checks ?? []) : []),
    [dedAttachment, draft.dedQto],
  );
  const [missingDims, setMissingDims] = useState<Record<string, QtoUserDimensions>>({});

  const hintFor = (it: DraftItem): { buildingId?: string | null } => ({
    buildingId: it.__buildingId ?? null,
  });

  const openEditor = (it: DraftItem): void => {
    setSelectedId(it.id);
    setEditDesc(it.description);
    setEditNotes(it.notes ?? '');
    setEditVolume(String(it.volume));
    setManualPrice('');
    setManualNote('');
    setRemapCode(it.ahspCode ?? '');
    setRemapPreview(null);
    setNotice(null);
  };

  const applyResult = (res: { ok: boolean; message: string; draft?: UniversalDraft }): void => {
    if (res.ok && res.draft) {
      props.onApplyDraft(res.draft, res.message);
      setNotice(`✅ ${res.message}`);
    } else {
      setNotice(`⚠️ ${res.message}`);
    }
  };

  const handleSaveEdit = (): void => {
    if (!selected) return;
    const vol = editVolume.trim() === '' ? undefined : Number(editVolume);
    applyResult(
      editDraftItem(
        draft,
        selected.id,
        {
          description: editDesc,
          notes: editNotes,
          ...(vol !== undefined ? { volume: vol } : {}),
        },
        hintFor(selected),
      ),
    );
  };

  const handleManualPrice = (): void => {
    if (!selected) return;
    const v = Number(manualPrice);
    applyResult(setDraftItemManualPrice(draft, selected.id, v, manualNote || undefined, hintFor(selected)));
  };

  const handleCheckRemap = (): void => {
    if (!selected) return;
    const code = remapCode.trim();
    if (!code) {
      setRemapPreview('Isi kode AHSP dulu (mis. dari pencarian AHSP).');
      return;
    }
    if (code === (selected.ahspCode ?? '')) {
      setRemapPreview('Item ini sudah memakai kode tersebut.');
      return;
    }
    const res = defaultAhspPriceLookup(code, selected.unit);
    if (res.error) setRemapPreview(`⚠️ ${res.error}`);
    else if (!res.found) setRemapPreview(`Kode ${code} tidak ditemukan di katalog AHSP resmi 2026 — remap tidak dapat diterapkan.`);
    else if (res.catalogUnit && normalizeUnit(res.catalogUnit) !== normalizeUnit(selected.unit)) {
      setRemapPreview(`Kode ${code} bersatuan "${res.catalogUnit}" (item: "${selected.unit}") — UNIT_MISMATCH: remap akan diblokir. Pilih kode dengan satuan ${selected.unit}.`);
    } else if (res.pricingStatus === 'FULL' && res.unitPrice != null) {
      setRemapPreview(`✓ Kode ${code} punya harga resmi ${formatRupiah(res.unitPrice)} per ${selected.unit} (komposisi FULL). Tekan "Terapkan remap" untuk mengubah kode + harga item ini.`);
    } else {
      setRemapPreview(
        `⚠️ Kode ${code} ADA di katalog, tetapi belum punya harga resmi lengkap (status ${res.pricingStatus ?? '—'}${res.resolvedComponents != null && res.totalComponents != null ? ` — ${res.resolvedComponents}/${res.totalComponents} komponen terisi` : ''}). ` +
        `Bila diterapkan, item menjadi BELUM TERSEDIA (harga lama tidak dipakai lagi). Tekan "Terapkan remap" bila tetap lanjut, atau tetapkan harga manual sesudahnya.`,
      );
    }
  };

  const handleApplyRemap = (): void => {
    if (!selected) return;
    const res = remapDraftItemAhsp(draft, selected.id, remapCode, { buildingId: selected.__buildingId ?? null });
    applyResult(res);
    if (res.ok) setRemapPreview(null);
  };

  const handleVerify = (): void => {
    if (!selected) return;
    applyResult(verifyDraftItemPrice(draft, selected.id, { buildingId: selected.__buildingId ?? null }));
  };

  const handleDecide = (d: AssumptionDecision): void => {
    if (!selected) return;
    applyResult(decideDraftItemAssumption(draft, selected.id, d, hintFor(selected)));
  };

  const handleMissingApply = (itemId: string): void => {
    const filled = missingDims[itemId] ?? {};
    const merged: QtoUserDimensions = { ...storedDims };
    for (const [k, v] of Object.entries(filled)) {
      if (v != null) (merged as Record<string, number | null>)[k] = v as number;
    }
    const res = props.onResolveMissing(itemId, merged);
    setNotice(res.ok ? `✅ ${res.message}` : `⚠️ ${res.message}`);
  };

  const setDim = (itemId: string, key: keyof QtoUserDimensions, raw: string): void => {
    setMissingDims((prev) => {
      const cur = { ...(prev[itemId] ?? {}) };
      if (raw.trim() === '') delete cur[key];
      else cur[key] = Number(raw);
      return { ...prev, [itemId]: cur };
    });
  };

  const dimInput = (
    itemId: string,
    key: keyof QtoUserDimensions,
    label: string,
    stored: number | null | undefined,
  ): React.ReactElement => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, color: C.muted, minWidth: 86, flex: 1 }}>
      {label}
      <input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        placeholder={stored != null ? String(stored) : '—'}
        value={missingDims[itemId]?.[key] ?? ''}
        onChange={(e) => setDim(itemId, key, e.target.value)}
        style={input}
      />
    </label>
  );

  const versionOptions = useMemo(() => {
    const vs = new Set<number>(history.snapshots.map((s) => s.version));
    if (history.activeVersion != null) vs.add(history.activeVersion);
    vs.add(draft.version);
    return [...vs].sort((a, b) => a - b);
  }, [history, draft.version]);

  const candidateReadiness = pendingRevision ? draftReadiness(pendingRevision.candidate) : null;

  return (
    <div style={{ fontFamily: 'inherit', color: C.body, fontSize: 13.5, lineHeight: 1.5 }}>
      {/* ---------- kepala ---------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>Review Draft — {draft.title}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            Versi {draft.version} · {items.length} item · Total estimasi {formatRupiah(totals.estimatedTotal)}
            {totals.unpricedCount > 0 ? ` · ${totals.unpricedCount} item belum berharga (PARSIAL)` : ''}
          </div>
        </div>
        <button type="button" onClick={props.onClose} style={btn()} aria-label="Tutup panel review">
          Tutup
        </button>
      </div>
      <div
        style={{
          marginTop: 8,
          padding: '8px 10px',
          borderRadius: 8,
          background: readiness.status === 'BLOCKED' ? C.redBg : readiness.status === 'NEEDS_SPEC' ? C.amberBg : C.greenBg,
          fontSize: 12.5,
          color: C.navy,
        }}
      >
        <strong>Kesiapan: {readinessLabel(readiness.status)}</strong>
        {readiness.reasons.length > 0 && (
          <span> — {readiness.reasons.slice(0, 3).join('; ')}{readiness.reasons.length > 3 ? ` (+${readiness.reasons.length - 3} lagi)` : ''}</span>
        )}
      </div>
      {notice && (
        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: C.blueBg, fontSize: 12.5, color: C.navy }}>
          {notice}
        </div>
      )}

      {/* ---------- kelengkapan WBS (P3D-O3) ---------- */}
      <div style={sectionTitle}>Kelengkapan WBS</div>
      <div style={{ background: '#F8FAFC', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5 }}>
        {wbsLines.map((l, i) => (
          <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{l.replace(/\*\*/g, '')}</div>
        ))}
        {draft.wbsCompleteness && (
          <div style={{ color: C.muted, marginTop: 4 }}>
            {draft.wbsCompleteness.nodesCovered}/{draft.wbsCompleteness.nodesTotal} paket tercakup · diperiksa{' '}
            {draft.wbsCompleteness.checkedAt.slice(0, 10)}
          </div>
        )}
      </div>

      {/* ---------- info hilang ---------- */}
      <div style={sectionTitle}>Info hilang {missing.totalIssues > 0 ? `(${missing.totalIssues})` : '— tidak ada'}</div>
      {missing.totalIssues > 0 ? (
        <ul style={{ margin: '0 0 4px', paddingLeft: 18, fontSize: 12.5 }}>
          {missing.unpriced.length > 0 && <li>{missing.unpriced.length} item belum berharga — tetapkan lewat remap AHSP / harga manual.</li>}
          {missing.needsMapping.length > 0 && <li>{missing.needsMapping.length} item perlu pemetaan AHSP — ubah kodenya di editor item.</li>}
          {missing.estimated.length > 0 && <li>{missing.estimated.length} item ber-asumsi/estimasi menunggu putusan Anda (Setujui/Tolak/Perlu revisi).</li>}
          {missing.rejected.length > 0 && <li>{missing.rejected.length} item asumsinya ditolak / perlu revisi: {missing.rejected.map((i) => i.description).join('; ')}.</li>}
          {missing.missingDims.length > 0 && <li>{missing.missingDims.length} item DED kehilangan dimensi — lengkapi di bawah.</li>}
          {missing.wbsIssues.slice(0, 3).map((w, i) => (<li key={i}>{w}</li>))}
        </ul>
      ) : (
        <div style={{ fontSize: 12.5, color: C.muted }}>Semua item berharga, terpetakan, dan WBS lengkap.</div>
      )}

      {/* ---------- dimensi MISSING (EF-09) ---------- */}
      {missingProposals.length > 0 && (
        <>
          <div style={sectionTitle}>Dimensi hilang ({missingProposals.length}) — isi dimensinya, kuantitas dihitung ulang</div>
          {missingProposals.map((p) => (
            <div key={p.id} style={{ border: `1px solid ${C.amberBorder}`, background: C.amberBg, borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, color: C.navy }}>{p.description} <span style={{ color: C.muted, fontWeight: 500 }}>({p.unit})</span></div>
              <div style={{ fontSize: 12, color: C.muted }}>
                Kuantitas DED tidak ada (MISSING) — {missingDimsHint(p.unit)}. Nilai yang sudah tersimpan tampil sebagai placeholder; isi yang masih kosong.
              </div>
              {p.quantityNote && <div style={{ fontSize: 12, color: C.muted }}>Catatan DED: {p.quantityNote}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {dimInput(p.itemId, 'lengthM', 'Panjang (m)', storedDims.lengthM)}
                {dimInput(p.itemId, 'widthM', 'Lebar (m)', storedDims.widthM)}
                {dimInput(p.itemId, 'depthM', 'Kedalaman (m)', storedDims.depthM)}
                {dimInput(p.itemId, 'thicknessM', 'Tebal (m)', storedDims.thicknessM)}
                {dimInput(p.itemId, 'buildingAreaM2', 'Luas bangunan (m²)', storedDims.buildingAreaM2)}
              </div>
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={() => handleMissingApply(p.itemId)} style={btn(true)}>
                  Hitung &amp; terapkan
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ---------- tabel item ---------- */}
      <div style={sectionTitle}>Item draft ({items.length}) — ketuk item untuk mengedit</div>
      <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
          <thead>
            <tr style={{ background: '#F1F5F9', color: C.navy }}>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>No</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Uraian</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>AHSP</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Volume</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Sat</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Harga satuan</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Jumlah</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const badge = priceBadge(it);
              const amount = it.unitPrice != null ? it.volume * it.unitPrice : null;
              const decided = it.userDecisionStatus;
              return (
                <tr
                  key={it.id}
                  onClick={() => openEditor(it)}
                  style={{
                    cursor: 'pointer',
                    background: selectedId === it.id ? C.blueBg : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                    borderTop: `1px solid ${C.border}`,
                  }}
                >
                  <td style={{ padding: '6px 8px', color: C.muted }}>{idx + 1}</td>
                  <td style={{ padding: '6px 8px', color: C.navy }}>
                    <div>{it.description}</div>
                    {it.priceSourceExplanation && (
                      <div style={{ fontSize: 11, color: C.muted }}>Sumber: {it.priceSourceExplanation}</div>
                    )}
                    {decided && (
                      <div style={{ fontSize: 11, color: decided === 'DISETUJUI' ? C.greenText : C.redText }}>
                        Keputusan: {decided}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{it.ahspCode || '—'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{it.volume}</td>
                  <td style={{ padding: '6px 8px' }}>{it.unit}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtPrice(it)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{amount != null ? formatRupiah(amount) : '—'}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ background: badge.bg, color: badge.fg, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                      {badge.text}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- editor item ---------- */}
      {selected && (
        <div style={{ marginTop: 12, border: `1px solid ${C.blueSoft}`, borderRadius: 8, padding: 12, background: '#FFFFFF' }}>
          <div style={{ fontWeight: 750, color: C.navy, marginBottom: 2 }}>Edit item — {selected.description}</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
            {selected.__partScope} · {selected.__partTemplate}
            {selectedTrace && (selectedTrace.__specKeys?.length ?? 0) > 0 && (
              <> · Spek: {selectedTrace.__specKeys?.join(', ')} ({selectedTrace.__specStatus ?? '—'})</>
            )}
            {selectedTrace && (selectedTrace.__specKeys?.length ?? 0) === 0 && <> · Tanpa tautan spek (template)</>}
            {selected.verificationDate && <> · Terverifikasi: {selected.verificationDate.slice(0, 10)}</>}
          </div>

          <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6 }}>
            Uraian
            <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={input} />
          </label>
          <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6 }}>
            Catatan / spek
            <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} style={input} placeholder="Catatan spek / jejak hitung item" />
          </label>
          <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 8, maxWidth: 200 }}>
            Volume ({selected.unit})
            <input type="number" min="0" step="any" inputMode="decimal" value={editVolume} onChange={(e) => setEditVolume(e.target.value)} style={input} />
          </label>
          <button type="button" onClick={handleSaveEdit} style={btn(true)}>Simpan perubahan item</button>

          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 10 }}>
            <div style={{ fontWeight: 700, color: C.navy, fontSize: 13 }}>Ubah kode AHSP</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
              Harga mengikuti kode baru lewat resolver resmi. Kode tanpa harga resmi lengkap membuat item BELUM TERSEDIA; satuan tak cocok diblokir.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={remapCode}
                onChange={(e) => { setRemapCode(e.target.value); setRemapPreview(null); }}
                style={{ ...input, flex: 1, minWidth: 160 }}
                placeholder="Kode AHSP baru (mis. 7.3.(1))"
              />
              <button type="button" onClick={handleCheckRemap} style={btn()}>Cek kode</button>
              <button type="button" onClick={handleApplyRemap} style={btn(true)}>Terapkan remap</button>
            </div>
            {remapPreview && <div style={{ fontSize: 12.5, marginTop: 6, background: '#F8FAFC', borderRadius: 6, padding: '6px 8px' }}>{remapPreview}</div>}
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 10 }}>
            <div style={{ fontWeight: 700, color: C.navy, fontSize: 13 }}>Harga manual</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
              Harga manual bukan harga resmi dan ditandai perlu verifikasi. Mengganti harga resolver/template item ini.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                style={{ ...input, flex: 1, minWidth: 140 }}
                placeholder={`Harga per ${selected.unit} (Rp)`}
              />
              <input
                type="text"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                style={{ ...input, flex: 2, minWidth: 180 }}
                placeholder="Catatan sumber harga (opsional)"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={handleManualPrice} style={btn(true)}>Tetapkan harga manual</button>
              {selected.priceStatus === 'PRICE_MANUAL' && (
                <button
                  type="button"
                  onClick={() => applyResult(clearDraftItemManualPrice(draft, selected.id, hintFor(selected)))}
                  style={btn()}
                >
                  Hapus harga manual
                </button>
              )}
              <button type="button" onClick={handleVerify} disabled={selected.unitPrice == null} style={btn()}>
                Verifikasi harga
              </button>
            </div>
            {selected.verificationDate && (
              <div style={{ fontSize: 12, color: C.greenText, marginTop: 6 }}>
                ✓ Harga diverifikasi oleh Anda pada {selected.verificationDate.slice(0, 10)}.
              </div>
            )}
          </div>

          {itemHasDecidableAssumption(selected) && (
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 10 }}>
              <div style={{ fontWeight: 700, color: C.navy, fontSize: 13 }}>Putusan asumsi / estimasi</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
                Harga item ini adalah estimasi/asumsi (Estimasi AI). Putusan Anda tercatat di item ini.
                {selected.userDecisionStatus && <> Putusan saat ini: <strong>{selected.userDecisionStatus}</strong>.</>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => handleDecide('DISETUJUI')} style={btn(true)}>Setujui asumsi</button>
                <button type="button" onClick={() => handleDecide('DITOLAK')} style={btn()}>Tolak asumsi</button>
                <button type="button" onClick={() => handleDecide('PERLU_REVISI')} style={btn()}>Perlu revisi</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- asumsi draft ---------- */}
      {draft.assumptions.length > 0 && (
        <>
          <div style={sectionTitle}>Asumsi yang dipakai ({draft.assumptions.length})</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
            {draft.assumptions.map((a, i) => (<li key={i}>{a}</li>))}
          </ul>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            Putusan atas asumsi harga dicatat per item di atas (Setujui/Tolak/Perlu revisi). Asumsi dimensi diubah lewat revisi chat.
          </div>
        </>
      )}

      {/* ---------- revisi: pratinjau tertunda + banding ---------- */}
      <div style={sectionTitle}>Revisi</div>
      {pendingRevision ? (
        <div style={{ border: `1px solid ${C.blueSoft}`, borderRadius: 8, padding: 10, background: C.blueBg }}>
          <div style={{ fontWeight: 750, color: C.navy }}>
            Pratinjau revisi menunggu — versi {pendingRevision.baseVersion} → {pendingRevision.targetVersion} (BELUM AKTIF)
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, fontFamily: 'inherit', margin: '6px 0' }}>
            {formatRevisionPreviewMessage(pendingRevision)}
          </pre>
          {candidateReadiness && (
            <div style={{ fontSize: 12.5, marginBottom: 8 }}>
              Kesiapan kandidat: <strong>{readinessLabel(candidateReadiness.status)}</strong>
              {candidateReadiness.status === 'BLOCKED' && (
                <span style={{ color: C.redText }}> — {candidateReadiness.blockedReasons.join('; ')}. Revisi BLOCKED tidak dapat diaktifkan (guard P4); lengkapi spesifikasinya lewat revisi, lalu kirim ulang.</span>
              )}
              {candidateReadiness.status !== 'BLOCKED' && candidateReadiness.reasons.length > 0 && (
                <span> — {candidateReadiness.reasons.join('; ')}</span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={props.onActivateRevision}
              disabled={candidateReadiness?.status === 'BLOCKED'}
              style={btn(true)}
            >
              Aktifkan revisi
            </button>
            <button type="button" onClick={props.onCancelRevision} style={btn()}>Batalkan revisi</button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: C.muted }}>
          Tidak ada pratinjau revisi yang menunggu. Kirim revisi lewat chat (mis. “ubah luas menjadi 120 m²”) — pratinjaunya tampil di sini untuk diaktifkan.
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 700, color: C.navy, fontSize: 13, marginBottom: 4 }}>
          Bandingkan revisi {history.snapshots.length > 0 ? `(${history.snapshots.length} snapshot tersimpan)` : '(belum ada snapshot versi)'}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={compareA}
            onChange={(e) => setCompareA(e.target.value === '' ? '' : Number(e.target.value))}
            style={{ ...input, width: 'auto' }}
            aria-label="Versi pertama"
          >
            <option value="">Versi…</option>
            {versionOptions.map((v) => (<option key={v} value={v}>v{v}{v === history.activeVersion ? ' (aktif)' : ''}</option>))}
          </select>
          <span style={{ color: C.muted }}>vs</span>
          <select
            value={compareB}
            onChange={(e) => setCompareB(e.target.value === '' ? '' : Number(e.target.value))}
            style={{ ...input, width: 'auto' }}
            aria-label="Versi kedua"
          >
            <option value="">Versi…</option>
            {versionOptions.map((v) => (<option key={v} value={v}>v{v}{v === history.activeVersion ? ' (aktif)' : ''}</option>))}
          </select>
          <button
            type="button"
            disabled={compareA === '' || compareB === '' || compareA === compareB}
            onClick={() => props.onCompareVersions(compareA as number, compareB as number)}
            style={btn()}
          >
            Bandingkan (ke chat)
          </button>
        </div>
        {history.snapshots.length > 0 && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
            {history.snapshots.map((s) => (
              <li key={s.version}>
                v{s.version}{s.version === history.activeVersion ? ' (AKTIF)' : ''}: {s.summary} — {s.itemCount} item, {formatRupiah(s.estimatedTotal)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
