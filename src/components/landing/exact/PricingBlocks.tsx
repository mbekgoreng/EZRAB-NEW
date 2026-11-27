import React from 'react';
import { useI18n } from '../../../i18n';
import { PLAN_DEFINITIONS, PLAN_IDS, type PlanId } from '../../../billing/plans';
import {
  PRICING_CATEGORIES,
  PLAN_DISPLAY_NAME,
  BILLING_TRANSPARENCY_POINTS,
  type PricingCell,
} from './pricingMatrix';

/**
 * Blok harga bersama (Spec Billing v1.0):
 * - PricingCards: empat kartu paket — dipakai section harga landing (versi
 *   minimal) dan halaman /harga.
 * - PricingComparison: tabel perbandingan lengkap + ketentuan transparan —
 *   HANYA di halaman /harga (menu Harga), tidak di landing.
 * Harga, batas proyek, dan kredit selalu dari src/billing/plans.ts;
 * matriks fitur dari pricingMatrix.ts (metadata tampilan terpusat).
 */

const formatIdr = (n: number) => 'Rp' + n.toLocaleString('id-ID');
const formatNum = (n: number) => n.toLocaleString('id-ID');

interface PricingCardsProps {
  onOpenAuth: (tab?: 'masuk' | 'daftar') => void;
}

export const PricingCards: React.FC<PricingCardsProps> = ({ onOpenAuth }) => {
  const { t } = useI18n();
  // Teks kartu paket diterjemahkan (tagline/bullet/CTA dari kamus landing.price_*).
  const PLAN_BULLETS: Record<PlanId, string[]> = {
    free: [t('landing.price_bullet_free_1'), t('landing.price_bullet_free_2'), t('landing.price_bullet_free_3'), t('landing.price_bullet_free_4')],
    starter: [t('landing.price_bullet_starter_1'), t('landing.price_bullet_starter_2'), t('landing.price_bullet_starter_3'), t('landing.price_bullet_starter_4')],
    professional: [t('landing.price_bullet_professional_1'), t('landing.price_bullet_professional_2'), t('landing.price_bullet_professional_3'), t('landing.price_bullet_professional_4')],
    business: [t('landing.price_bullet_business_1'), t('landing.price_bullet_business_2'), t('landing.price_bullet_business_3'), t('landing.price_bullet_business_4')],
  };
  const PLAN_CTA: Record<PlanId, string> = {
    free: t('landing.price_cta_free'),
    starter: t('landing.price_cta_starter'),
    professional: t('landing.price_cta_professional'),
    business: t('landing.price_cta_business'),
  };
  const PLAN_TAGLINE_I18N: Record<PlanId, string> = {
    free: t('landing.price_tagline_free'),
    starter: t('landing.price_tagline_starter'),
    professional: t('landing.price_tagline_professional'),
    business: t('landing.price_tagline_business'),
  };
  return (
  <div className="plans">
    {PLAN_IDS.map((id) => {
      const p = PLAN_DEFINITIONS[id];
      const popular = id === 'professional';
      return (
        <div className={popular ? 'plan pop' : 'plan'} key={id}>
          {popular && <span className="tag">{t('landing.price_popular')}</span>}
          <h3>{PLAN_DISPLAY_NAME[id]}</h3>
          <p className="plan-tag">{PLAN_TAGLINE_I18N[id]}</p>
          <div className="price">
            {formatIdr(p.monthlyPriceIdr)}
            {p.monthlyPriceIdr > 0 && <small>{t('landing.price_per_month')}</small>}
          </div>
          <div className="cred">
            {p.credits.kind === 'periodic'
              ? `${formatNum(p.credits.credits)} ${t('landing.price_credits_month')}`
              : `${formatNum(p.credits.credits)} ${t('landing.price_credits_once')}`}
          </div>
          <ul>
            {PLAN_BULLETS[id].map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <button
            type="button"
            className={popular ? 'btn' : 'btn soft'}
            onClick={() => onOpenAuth('daftar')}
          >
            {PLAN_CTA[id]}
          </button>
        </div>
      );
    })}
  </div>
  );
};

const renderCell = (cell: PricingCell, planId: PlanId) => {
  switch (cell.t) {
    case 'yes':
      return <span className="cmp-yes" role="img" aria-label="Tersedia">✓</span>;
    case 'limited':
      return <span className="cmp-lim">✓ Terbatas</span>;
    case 'no':
      return <span className="cmp-no" role="img" aria-label="Tidak tersedia">×</span>;
    case 'text':
      return <span className="cmp-txt">{cell.v}</span>;
    case 'quota':
      return (
        <span className="cmp-txt">
          <span className="cmp-yes" aria-hidden="true">✓</span> {cell.v}
        </span>
      );
    case 'projects': {
      const limit = PLAN_DEFINITIONS[planId].projectLimit;
      return <span className="cmp-txt">{limit === null ? 'Tanpa batas' : formatNum(limit)}</span>;
    }
    case 'credits': {
      const c = PLAN_DEFINITIONS[planId].credits;
      return <span className="cmp-txt">{c.kind === 'periodic' ? formatNum(c.credits) : `${formatNum(c.credits)} (sekali)`}</span>;
    }
  }
};

export const PricingComparison: React.FC = () => (
  <div className="cmp-wrap" id="banding-fitur">
    <h3 className="cmp-title">Perbandingan fitur lengkap</h3>
    <p className="cmp-legend">
      <span><b className="cmp-yes">✓</b> Tersedia</span>
      <span><b className="cmp-lim">✓ Terbatas</b> Tersedia dengan batasan</span>
      <span><b className="cmp-no">×</b> Tidak tersedia</span>
    </p>
    <div className="cmp-scroll">
      <table className="cmp" aria-label="Perbandingan fitur paket EZRAB">
        <thead>
          <tr>
            <th scope="col">Fitur</th>
            {PLAN_IDS.map((id) => (
              <th scope="col" key={id} className={id === 'professional' ? 'cmp-pop' : undefined}>
                {PLAN_DISPLAY_NAME[id]}
                <small>{formatIdr(PLAN_DEFINITIONS[id].monthlyPriceIdr)}{PLAN_DEFINITIONS[id].monthlyPriceIdr > 0 ? '/bln' : ''}</small>
              </th>
            ))}
          </tr>
        </thead>
        {PRICING_CATEGORIES.map((cat) => (
          <tbody key={cat.id}>
            <tr className="cmp-cat">
              <th colSpan={PLAN_IDS.length + 1} scope="colgroup">{cat.title}</th>
            </tr>
            {cat.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {PLAN_IDS.map((id) => (
                  <td key={id} className={id === 'professional' ? 'cmp-pop' : undefined}>
                    {renderCell(row.values[id], id)}
                  </td>
                ))}
              </tr>
            ))}
            {cat.note && (
              <tr className="cmp-note">
                <td colSpan={PLAN_IDS.length + 1}>{cat.note}</td>
              </tr>
            )}
          </tbody>
        ))}
      </table>
    </div>
    <div className="bill-notes">
      <h4>Ketentuan billing yang transparan</h4>
      <ul>
        {BILLING_TRANSPARENCY_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  </div>
);
