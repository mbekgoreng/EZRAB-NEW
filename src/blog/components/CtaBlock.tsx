/**
 * CTA relevan ke fitur EZRAB — route diambil dari paths.* (terverifikasi).
 * Varian dipilih per artikel via frontmatter `cta`; default 'general'.
 *
 * Blog tinggal di subdomain: semua link CTA memakai URL absolut domain utama
 * (getCanonicalBase() + path) agar tidak terjebak rewrite subdomain.
 */
import React from 'react';
import { paths } from '../../routing/routes';
import { getCanonicalBase } from '../site';

const mainUrl = (path: string): string => `${getCanonicalBase()}${path}`;

type CtaVariant = 'rab' | 'ahsp' | 'qto' | 'ded' | 'general';

const CTA_COPY: Record<CtaVariant, { title: string; text: string; links: { label: string; href: string; primary?: boolean }[] }> = {
  rab: {
    title: 'Susun RAB lebih cepat dengan EZRAB',
    text: 'Terapkan langkah-langkah di artikel ini langsung di RAB & Estimasi EZRAB — volume, analisa harga, dan rekap dalam satu alur.',
    links: [
      { label: 'Buka RAB & Estimasi', href: '', primary: true },
      { label: 'Lihat AHSP 2026', href: '' },
    ],
  },
  ahsp: {
    title: 'Jelajahi AHSP 2026 di EZRAB',
    text: 'Cari analisa harga satuan, bandingkan komponen biaya, dan pakai langsung dalam penyusunan RAB Anda.',
    links: [
      { label: 'Buka AHSP 2026', href: '', primary: true },
      { label: 'Buka RAB & Estimasi', href: '' },
    ],
  },
  qto: {
    title: 'Hitung volume tanpa ribet',
    text: 'Gunakan kalkulator volume & QTO EZRAB untuk mengukur pekerjaan dari gambar kerja secara sistematis.',
    links: [
      { label: 'Buka Kalkulator QTO', href: '', primary: true },
      { label: 'Buka RAB & Estimasi', href: '' },
    ],
  },
  ded: {
    title: 'Dari gambar DED ke RAB otomatis',
    text: 'Unggah gambar kerja dan biarkan DED to RAB AI mengekstrak volume serta menyusun estimasi awal untuk Anda.',
    links: [
      { label: 'Coba DED to RAB AI', href: '', primary: true },
      { label: 'Buka RAB & Estimasi', href: '' },
    ],
  },
  general: {
    title: 'Praktikkan langsung di EZRAB',
    text: 'EZRAB membantu estimator, kontraktor, dan konsultan menyusun RAB yang akurat — dari QTO, AHSP 2026, sampai laporan siap cetak.',
    links: [
      { label: 'Buka RAB & Estimasi', href: '', primary: true },
      { label: 'Jelajahi Fitur', href: '/fitur' },
    ],
  },
};

const resolveHref = (variant: CtaVariant, index: number): string => {
  if (variant === 'rab') return index === 0 ? mainUrl(paths.estimate()) : mainUrl(paths.ahsp());
  if (variant === 'ahsp') return index === 0 ? mainUrl(paths.ahsp()) : mainUrl(paths.estimate());
  if (variant === 'qto') return index === 0 ? mainUrl(paths.qto()) : mainUrl(paths.estimate());
  if (variant === 'ded') return index === 0 ? mainUrl(paths.dedAiEstimate()) : mainUrl(paths.estimate());
  return index === 0 ? mainUrl(paths.estimate()) : mainUrl('/fitur');
};

export const CtaBlock: React.FC<{ variant?: string }> = ({ variant }) => {
  const key: CtaVariant =
    variant === 'rab' || variant === 'ahsp' || variant === 'qto' || variant === 'ded'
      ? variant
      : 'general';
  const copy = CTA_COPY[key];
  return (
    <section className="ezb-cta-block" aria-label="Coba EZRAB">
      <h2>{copy.title}</h2>
      <p>{copy.text}</p>
      <div className="ezb-cta-actions">
        {copy.links.map((link, i) => (
          <a
            key={link.label}
            href={resolveHref(key, i)}
            className={link.primary ? undefined : 'ezb-cta-secondary'}
          >
            {link.label}
          </a>
        ))}
      </div>
    </section>
  );
};

export default CtaBlock;
