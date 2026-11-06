/**
 * icons.tsx — ikon UI prosedural (SVG) bersama untuk Game Space.
 * Fase F: menggantikan emoji piktorial yang masih ter-render di layar
 * jeda/petunjuk (☕ kopi, 👆 petunjuk ketuk, ⏰ waktu habis) agar tidak ada
 * grafis emoji di permukaan game. Ikon fungsional tipografis (✕ ⏸ ★ ✓)
 * tidak digantikan — itu glif teks, bukan emoji.
 */
import React from 'react';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Cangkir kopi — layar jeda bertema "ngopi dulu". */
export function CoffeeCupIcon({ size = 42, color = '#fbbf24' }: { size?: number; color?: string }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ color }} aria-hidden="true">
      {/* uap */}
      <path d="M18 6c-2 3 2 4 0 7" {...stroke} opacity={0.75} />
      <path d="M26 6c-2 3 2 4 0 7" {...stroke} opacity={0.75} />
      {/* cangkir */}
      <path d="M10 20h24v8a10 10 0 0 1-10 10h-4A10 10 0 0 1 10 28v-8z" fill="currentColor" opacity={0.92} />
      {/* pegangan */}
      <path d="M34 22h3a5 5 0 0 1 0 10h-4" {...stroke} />
      {/* tatakan */}
      <path d="M8 43h28" {...stroke} />
    </svg>
  );
}

/** Target ketuk — petunjuk "ketuk di sini" (lingkaran konsentris + titik). */
export function TapTargetIcon({ size = 52, color = '#ffd166' }: { size?: number; color?: string }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ color }} aria-hidden="true">
      <circle cx="24" cy="24" r="17" {...stroke} opacity={0.55} />
      <circle cx="24" cy="24" r="10.5" {...stroke} opacity={0.8} />
      <circle cx="24" cy="24" r="4" fill="currentColor" />
      <path d="M24 2v6M24 40v6M2 24h6M40 24h6" {...stroke} opacity={0.55} />
    </svg>
  );
}

/** Jam — layar waktu habis / deadline. */
export function ClockIcon({ size = 44, color = '#fca5a5' }: { size?: number; color?: string }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ color }} aria-hidden="true">
      <circle cx="24" cy="26" r="16" {...stroke} />
      <path d="M24 17v9l6 4" {...stroke} />
      <path d="M17 4h14" {...stroke} />
      <path d="M24 4v6" {...stroke} />
    </svg>
  );
}
