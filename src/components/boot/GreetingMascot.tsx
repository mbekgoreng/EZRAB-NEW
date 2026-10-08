/**
 * GreetingMascot
 *
 * Maskot EZRAB dengan ekspresi menyapa, dengan fallback berlapis:
 *   1. /images/ezrab-mascot-greeting.png  (file maskot utama)
 *   2. /images/mascot-ezrab-new.png       (maskot lama, jika file utama gagal)
 *   3. Inline SVG robot ramah            (jika semua gambar gagal — tampilan tetap rapi)
 */
import { useState } from 'react';

const MASCOT_SOURCES = ['/images/ezrab-mascot-greeting.png', '/images/mascot-ezrab-new.png'];

interface GreetingMascotProps {
  size?: number;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
}

function MascotSvgFallback({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Maskot EZRAB"
      style={{ display: 'block' }}
    >
      <circle cx="60" cy="60" r="52" fill="var(--ezrab-blue-soft, #eff6ff)" />
      {/* kepala robot */}
      <rect x="38" y="42" width="44" height="40" rx="14" fill="var(--ezrab-blue, #2563eb)" />
      {/* helm proyek */}
      <path d="M36 46c2-12 10-20 24-20s22 8 24 20z" fill="#f59e0b" />
      <rect x="36" y="43" width="48" height="6" rx="3" fill="#d97706" />
      {/* wajah */}
      <circle cx="52" cy="62" r="4.5" fill="#fff" />
      <circle cx="68" cy="62" r="4.5" fill="#fff" />
      <path d="M52 72c3 4 13 4 16 0" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* pipi */}
      <circle cx="46" cy="70" r="3" fill="#93c5fd" opacity="0.7" />
      <circle cx="74" cy="70" r="3" fill="#93c5fd" opacity="0.7" />
      {/* antena */}
      <line x1="60" y1="22" x2="60" y2="14" stroke="var(--ezrab-blue, #2563eb)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="12" r="4" fill="var(--ezrab-cyan, #0891b2)" />
      {/* tangan melambai */}
      <rect x="82" y="50" width="10" height="22" rx="5" fill="var(--ezrab-blue, #2563eb)" transform="rotate(-25 87 61)" />
      <circle cx="96" cy="44" r="6" fill="#93c5fd" />
    </svg>
  );
}

export function GreetingMascot({ size = 120, alt = 'Maskot EZRAB menyapa', style, className }: GreetingMascotProps) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div style={{ width: size, height: size, ...style }} className={className}>
        <MascotSvgFallback size={size} />
      </div>
    );
  }

  return (
    <img
      src={MASCOT_SOURCES[sourceIndex]}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      onError={() => {
        if (sourceIndex < MASCOT_SOURCES.length - 1) setSourceIndex((i) => i + 1);
        else setFailed(true);
      }}
      style={{ width: size, height: size, objectFit: 'contain', ...style }}
      className={className}
    />
  );
}

export default GreetingMascot;
