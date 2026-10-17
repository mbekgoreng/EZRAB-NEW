/**
 * Warna & ikon per kategori blog — dipakai kartu, badge, dan widget sidebar.
 * SSR-safe (lucide-react murni SVG).
 */
import React from 'react';
import {
  Calculator,
  ScrollText,
  Ruler,
  Sparkles,
  Briefcase,
  Newspaper,
  type LucideIcon,
} from 'lucide-react';
import type { BlogCategoryName } from '../types';

export interface CategoryStyle {
  solid: string;
  soft: string;
  text: string;
  gradient: string;
  Icon: LucideIcon;
}

const FALLBACK: CategoryStyle = {
  solid: '#2563eb',
  soft: '#eff6ff',
  text: '#1d4ed8',
  gradient: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
  Icon: Newspaper,
};

const MAP: Record<string, CategoryStyle> = {
  'Panduan RAB': {
    solid: '#2563eb',
    soft: '#eff6ff',
    text: '#1d4ed8',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
    Icon: Calculator,
  },
  'AHSP 2026 & Harga Satuan': {
    solid: '#16a34a',
    soft: '#f0fdf4',
    text: '#15803d',
    gradient: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
    Icon: ScrollText,
  },
  'Teknik Sipil & Konstruksi': {
    solid: '#9333ea',
    soft: '#faf5ff',
    text: '#7e22ce',
    gradient: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
    Icon: Ruler,
  },
  'Tutorial Software & AI': {
    solid: '#ea580c',
    soft: '#fff7ed',
    text: '#c2410c',
    gradient: 'linear-gradient(135deg, #fb923c 0%, #c2410c 100%)',
    Icon: Sparkles,
  },
  'Manajemen Proyek': {
    solid: '#0d9488',
    soft: '#f0fdfa',
    text: '#0f766e',
    gradient: 'linear-gradient(135deg, #2dd4bf 0%, #0f766e 100%)',
    Icon: Briefcase,
  },
};

export const categoryStyle = (name: string): CategoryStyle =>
  MAP[name] ?? FALLBACK;

/** Badge kategori kecil (untuk kartu artikel). */
export const CategoryBadge: React.FC<{ name: string }> = ({ name }) => {
  const s = categoryStyle(name);
  return (
    <span
      className="ezb-badge"
      style={{ background: s.soft, color: s.text }}
    >
      {name}
    </span>
  );
};

/** Ikon kategori dalam kotak berwarna (untuk widget sidebar). */
export const CategoryIcon: React.FC<{ name: string; size?: number }> = ({
  name,
  size = 17,
}) => {
  const s = categoryStyle(name);
  return (
    <span className="ezb-cat-ic" style={{ background: s.solid }} aria-hidden="true">
      <s.Icon size={size} strokeWidth={2.2} />
    </span>
  );
};

export type { BlogCategoryName };
