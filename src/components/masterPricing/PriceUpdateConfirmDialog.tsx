/**
 * MASTER PRICING §11.4 — PRICE UPDATE CONFIRMATION DIALOG.
 *
 * An informative confirmation dialog with ACTUAL calculated impact from
 * §9 — per-item, per-family, per-project, and aggregates. Never a generic
 * "Are you sure?" dialog. The scope statement names the real counts of
 * affected AHSP items, component references, and live-price projects.
 * Confirm is available ONLY when the preview is COMPUTED; a NOT_COMPUTED
 * or STALE preview blocks confirm with the reason. Callers may add a
 * further block (e.g. the §4 admin-gate denial) via `confirmDisabledReason`.
 *
 * Field notes/reasons from §9 are shown verbatim (mixed Indonesian /
 * English as computed) — §11 localizes the chrome, never the data.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import type { MasterPriceImpactPreview } from '../../engine/pricing/impact/masterPriceImpactPreview';
import {
  buildPriceUpdateDialogContent,
  formatDateId,
  formatPercentChange,
  formatRupiah,
  formatRupiahDelta,
} from '../../engine/pricing/admin/masterPricingUiLogic';
import { MASTER_PRICE_REASON_MIN_LENGTH } from '../../engine/pricing/admin/masterPriceRecord';
import './masterPricing.css';

export interface PriceUpdateConfirmDialogProps {
  preview: MasterPriceImpactPreview;
  operationLabel?: string;
  confirmLabel?: string;
  /** When non-null, confirm is disabled with this reason (e.g. the §4 gate denial). */
  confirmDisabledReason?: string | null;
  /**
   * MASTER PRICING §12/§13 (P10): when true, the dialog requires an
   * admin reason (≥ 10 chars, §4.4 audit) before confirm is enabled,
   * and passes it to `onConfirm`. Callers that do not write history
   * (e.g. the AHSP Mode-A dialog) leave this unset.
   */
  requireReason?: boolean;
  /** Receives the trimmed admin reason ('' when `requireReason` is unset). */
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

const MAX_ITEM_ROWS = 50;
const MAX_PROJECT_ROWS = 50;

const PROJECT_STATUS_LABEL: Record<string, string> = {
  AFFECTED: 'Terpengaruh',
  UNAFFECTED: 'Tidak terpengaruh',
  LOCKED_SNAPSHOT: 'Terkunci (snapshot)',
  NOT_COMPUTABLE: 'Tidak terhitung',
};

const ITEM_CHANGE_LABEL: Record<string, string> = {
  ADDED: 'Ditambah',
  REMOVED: 'Dihapus',
  REVISED: 'Direvisi',
  PRICE_CHANGED: 'Harga berubah',
};

export function PriceUpdateConfirmDialog({
  preview,
  operationLabel,
  confirmLabel,
  confirmDisabledReason,
  requireReason,
  onConfirm,
  onClose,
}: PriceUpdateConfirmDialogProps): React.ReactElement {
  const [reason, setReason] = useState('');
  const content = useMemo(
    () => buildPriceUpdateDialogContent(preview, operationLabel ? { operationLabel } : undefined),
    [preview, operationLabel],
  );
  const reasonValid = !requireReason || reason.trim().length >= MASTER_PRICE_REASON_MIN_LENGTH;
  const confirmBlockedReason =
    content.blockedNote ??
    confirmDisabledReason ??
    (reasonValid
      ? null
      : `Alasan wajib diisi (minimal ${MASTER_PRICE_REASON_MIN_LENGTH} karakter) — dicatat di jejak audit §4.4.`);
  const shownItems = content.itemRows.slice(0, MAX_ITEM_ROWS);
  const shownProjects = content.projectRows.slice(0, MAX_PROJECT_ROWS);

  return (
    <div className="mpu-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={content.title}>
      <div className="mpu-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="mpu-dialog-head">
          <div>
            <h2>{content.title}</h2>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="mpu-pill blue">{content.kindLabel}</span>
              <span
                className={`mpu-pill ${content.status === 'COMPUTED' ? 'green' : content.status === 'STALE' ? 'amber' : 'red'}`}
              >
                {content.status === 'COMPUTED'
                  ? 'Dampak terhitung'
                  : content.status === 'STALE'
                    ? 'Preview basi'
                    : 'Dampak tidak terhitung'}
              </span>
              <span className="mpu-pill">Dihitung {formatDateId(content.computedAt)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ez-color-text-muted)', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="mpu-dialog-body">
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Perubahan yang diajukan</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              {content.changeLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="mpu-scope">{content.scopeStatement}</div>

          {content.notComputedReasons.length > 0 ? (
            <div className="mpu-banner red">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Preview tidak dapat dihitung:</strong>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: 18 }}>
                  {content.notComputedReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {content.staleReasons.length > 0 ? (
            <div className="mpu-banner amber">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Preview basi:</strong> {content.staleReasons.join('; ')}
              </div>
            </div>
          ) : null}

          {content.computable ? (
            <>
              <div className="mpu-grid cols-4">
                <div className="mpu-stat">
                  <div className="mpu-stat-label">Delta total proyek</div>
                  <div className="mpu-stat-value">{formatRupiahDelta(content.aggregates.totalDeltaGrandTotal)}</div>
                  <div className="mpu-stat-sub">Σ proyek LIVE + OVERRIDE</div>
                </div>
                <div className="mpu-stat">
                  <div className="mpu-stat-label">Delta biaya langsung</div>
                  <div className="mpu-stat-value">{formatRupiahDelta(content.aggregates.totalDeltaDirectCost)}</div>
                  <div className="mpu-stat-sub">Σ proyek LIVE + OVERRIDE</div>
                </div>
                <div className="mpu-stat">
                  <div className="mpu-stat-label">Item baru berharga</div>
                  <div className="mpu-stat-value">{content.aggregates.newlyPricedItemCount}</div>
                  <div className="mpu-stat-sub">item proyek</div>
                </div>
                <div className="mpu-stat">
                  <div className="mpu-stat-label">Item jadi tak berharga</div>
                  <div className="mpu-stat-value">{content.aggregates.becameUnpricedItemCount}</div>
                  <div className="mpu-stat-sub">item proyek</div>
                </div>
              </div>

              {content.aggregates.totalDeltaGrandTotal === null ? (
                <div className="mpu-banner amber">
                  <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Total agregat tidak dapat dihitung karena {content.aggregates.uncomputableProjectCount} proyek
                    tidak terhitung — tidak ada jumlah parsial yang ditampilkan sebagai lengkap.
                  </span>
                </div>
              ) : null}

              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 13.5 }}>
                  Dampak per item AHSP ({content.itemSummary.totalAffected} item: {content.itemSummary.priceChanged}{' '}
                  harga berubah, {content.itemSummary.revised} direvisi, {content.itemSummary.added} ditambah,{' '}
                  {content.itemSummary.removed} dihapus)
                </h3>
                {content.itemRows.length === 0 ? (
                  <div className="mpu-muted">Tidak ada item AHSP yang berubah.</div>
                ) : (
                  <>
                    <div className="mpu-table-wrap">
                      <table className="mpu-table">
                        <thead>
                          <tr>
                            <th>Kode</th>
                            <th>Nama</th>
                            <th>Jenis</th>
                            <th className="mpu-num">Harga lama</th>
                            <th className="mpu-num">Harga baru</th>
                            <th className="mpu-num">Delta</th>
                            <th className="mpu-num">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shownItems.map((row) => (
                            <tr key={row.itemId} style={{ cursor: 'default' }}>
                              <td>
                                <b>{row.code}</b>
                              </td>
                              <td>{row.name}</td>
                              <td>{ITEM_CHANGE_LABEL[row.changeKind] ?? row.changeKind}</td>
                              <td className="mpu-num">{formatRupiah(row.oldUnitPrice)}</td>
                              <td className="mpu-num">{formatRupiah(row.newUnitPrice)}</td>
                              <td className="mpu-num">{formatRupiahDelta(row.delta)}</td>
                              <td className="mpu-num">{formatPercentChange(row.percentChange)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {content.itemRows.length > MAX_ITEM_ROWS ? (
                      <div className="mpu-muted" style={{ marginTop: 6 }}>
                        Menampilkan {MAX_ITEM_ROWS} dari {content.itemRows.length} item.
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 13.5 }}>Dampak per keluarga AHSP</h3>
                {content.familyRows.length === 0 ? (
                  <div className="mpu-muted">Tidak ada keluarga yang terpengaruh.</div>
                ) : (
                  <div className="mpu-table-wrap">
                    <table className="mpu-table">
                      <thead>
                        <tr>
                          <th>Keluarga</th>
                          <th className="mpu-num">Item terpengaruh</th>
                          <th className="mpu-num">Referensi komponen</th>
                          <th className="mpu-num">Ditambah</th>
                          <th className="mpu-num">Dihapus</th>
                          <th className="mpu-num">Direvisi</th>
                          <th className="mpu-num">Harga berubah</th>
                        </tr>
                      </thead>
                      <tbody>
                        {content.familyRows.map((row) => (
                          <tr key={row.family} style={{ cursor: 'default' }}>
                            <td>
                              <b>{row.family}</b>
                            </td>
                            <td className="mpu-num">{row.affectedItemCount}</td>
                            <td className="mpu-num">{row.affectedComponentReferenceCount}</td>
                            <td className="mpu-num">{row.addedItemCount}</td>
                            <td className="mpu-num">{row.removedItemCount}</td>
                            <td className="mpu-num">{row.revisedItemCount}</td>
                            <td className="mpu-num">{row.priceChangedItemCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 13.5 }}>
                  Dampak per proyek ({content.projectSummary.totalProjectCount} proyek: {content.projectSummary.liveProjectCount}{' '}
                  live, {content.projectSummary.snapshotProjectCount} snapshot, {content.projectSummary.overrideProjectCount}{' '}
                  override; {content.projectSummary.affectedProjectCount} terpengaruh,{' '}
                  {content.projectSummary.lockedSnapshotCount} snapshot terkunci)
                </h3>
                {content.projectRows.length === 0 ? (
                  <div className="mpu-muted">Tidak ada proyek di workspace ini.</div>
                ) : (
                  <>
                    <div className="mpu-table-wrap">
                      <table className="mpu-table">
                        <thead>
                          <tr>
                            <th>Proyek</th>
                            <th>Mode</th>
                            <th>Status</th>
                            <th className="mpu-num">Total lama</th>
                            <th className="mpu-num">Total baru</th>
                            <th className="mpu-num">Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shownProjects.map((row) => (
                            <tr key={row.projectId} style={{ cursor: 'default' }}>
                              <td>
                                <b>{row.projectName}</b>
                                {row.isDemo ? <div className="mpu-muted">Proyek demo</div> : null}
                                {row.adoptionPreview ? (
                                  <div className="mpu-muted">
                                    Bila diadopsi: {formatRupiah(row.adoptionPreview.newGrandTotal)} (
                                    {formatRupiahDelta(row.adoptionPreview.deltaGrandTotal)})
                                  </div>
                                ) : null}
                              </td>
                              <td>{row.pricingMode}</td>
                              <td>{PROJECT_STATUS_LABEL[row.status] ?? row.status}</td>
                              <td className="mpu-num">{formatRupiah(row.oldGrandTotal)}</td>
                              <td className="mpu-num">{formatRupiah(row.newGrandTotal)}</td>
                              <td className="mpu-num">{formatRupiahDelta(row.deltaGrandTotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {content.projectRows.length > MAX_PROJECT_ROWS ? (
                      <div className="mpu-muted" style={{ marginTop: 6 }}>
                        Menampilkan {MAX_PROJECT_ROWS} dari {content.projectRows.length} proyek.
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              {content.codelessComponentCount > 0 ? (
                <div className="mpu-muted">
                  Catatan: {content.codelessComponentCount.toLocaleString('id-ID')} komponen katalog tanpa kode tidak dapat
                  diatribusikan pada perubahan berkode-kunci — jumlahnya dilaporkan, tidak pernah ditebak.
                </div>
              ) : null}
            </>
          ) : null}

          <div className="mpu-muted">
            Catatan mesin: {content.note}
            <br />
            Fingerprint: {content.fingerprintHash}
          </div>

          {requireReason ? (
            <div>
              <label
                htmlFor="mpu-apply-reason"
                style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}
              >
                Alasan perubahan <span className="mpu-muted">(wajib, min. {MASTER_PRICE_REASON_MIN_LENGTH} karakter)</span>
              </label>
              <textarea
                id="mpu-apply-reason"
                className="mpu-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="cth. Penyesuaian harga pasar November 2026 berdasarkan survei supplier"
                rows={2}
                style={{ width: '100%', resize: 'vertical' }}
              />
              <div className="mpu-muted" style={{ marginTop: 4 }}>
                Alasan dicatat di jejak audit §4.4 bersama harga lama, harga baru, dan identitas admin.
              </div>
            </div>
          ) : null}
        </div>

        <div className="mpu-dialog-foot">
          <div style={{ flex: 1, minWidth: 240 }}>
            {confirmBlockedReason ? (
              <div className="mpu-muted" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{confirmBlockedReason}</span>
              </div>
            ) : (
              <span className="mpu-muted">Konfirmasi berarti menyetujui operasi di atas dengan dampak terhitung ini.</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="mpu-btn" onClick={onClose}>
              Batal
            </button>
            <button className="mpu-btn primary" onClick={() => onConfirm(reason.trim())} disabled={confirmBlockedReason !== null}>
              {confirmLabel ?? 'Konfirmasi operasi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
