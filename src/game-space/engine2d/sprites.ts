/**
 * EZRAB Game Space — sprite asset loader (Fase C rekonstruksi).
 *
 * Satu jalur muat gambar untuk renderer Canvas 2D dan DOM:
 *  - `loadSprite(url)` — muat + cache per URL (satu Image per URL, dipakai
 *    bersama oleh semua game yang mereferensikan aset yang sama; aset game
 *    lain tidak pernah dimuat karena URL bersifat eksplisit per game).
 *  - Kegagalan muat TIDAK melempar: status menjadi 'error' dan pemanggil
 *    wajib menggambar fallback prosedural yang sudah ada (pola lama).
 *  - `drawSprite` / `drawSpriteFrame` — helper gambar Canvas 2D dengan
 *    skala responsif (fit ke kotak tujuan, jaga aspek) + frame sederhana
 *    (strip horizontal, frame dipilih dari waktu/fase 0..1).
 *  - `useSprite(url)` — hook React untuk jalur DOM (blackjack dsb.);
 *    mengembalikan null sampai gambar siap, sehingga komponen bisa
 *    merender fallback CSS selama menunggu / sesudah gagal.
 *
 * Loader inti (`createSpriteLoader`) menerima factory gambar yang bisa
 * diinjeksi agar logika cache & fallback teruji tanpa DOM (sprites.test.ts).
 */

import { useEffect, useState } from 'react';

export type SpriteStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SpriteEntry<TImage = HTMLImageElement> {
  url: string;
  status: SpriteStatus;
  image: TImage | null;
  promise: Promise<SpriteEntry<TImage>> | null;
}

/** Bentuk minimal gambar yang dibutuhkan loader (HTMLImageElement cocok). */
export interface SpriteImageLike {
  src: string;
  complete?: boolean;
  naturalWidth?: number;
  onload: (() => void) | null;
  onerror: ((e?: unknown) => void) | null;
}

export type SpriteFactory = () => SpriteImageLike;

const defaultFactory: SpriteFactory = () => new Image() as unknown as SpriteImageLike;

export interface SpriteLoader<TImage = HTMLImageElement> {
  load: (url: string) => Promise<SpriteEntry<TImage>>;
  peek: (url: string) => SpriteEntry<TImage> | undefined;
  status: (url: string) => SpriteStatus;
  clear: () => void;
  size: () => number;
}

export function createSpriteLoader<TImage = HTMLImageElement>(
  factory: SpriteFactory = defaultFactory as unknown as SpriteFactory,
): SpriteLoader<TImage> {
  const cache = new Map<string, SpriteEntry<TImage>>();

  const load = (url: string): Promise<SpriteEntry<TImage>> => {
    const hit = cache.get(url);
    if (hit) {
      if (hit.status === 'ready' || hit.status === 'error') return Promise.resolve(hit);
      if (hit.promise) return hit.promise;
    }
    const entry: SpriteEntry<TImage> = { url, status: 'loading', image: null, promise: null };
    cache.set(url, entry);
    entry.promise = new Promise<SpriteEntry<TImage>>((resolve) => {
      let img: SpriteImageLike;
      try {
        img = factory();
      } catch {
        entry.status = 'error';
        resolve(entry);
        return;
      }
      img.onload = () => {
        entry.image = img as unknown as TImage;
        entry.status = 'ready';
        resolve(entry);
      };
      img.onerror = () => {
        entry.image = null;
        entry.status = 'error';
        resolve(entry);
      };
      try {
        img.src = url;
        // Gambar dari cache browser bisa sudah complete sebelum handler sempat jalan.
        if (img.complete && (img.naturalWidth ?? 0) > 0) {
          entry.image = img as unknown as TImage;
          entry.status = 'ready';
          resolve(entry);
        }
      } catch {
        entry.status = 'error';
        resolve(entry);
      }
    });
    return entry.promise;
  };

  return {
    load,
    peek: (url) => cache.get(url),
    status: (url) => cache.get(url)?.status ?? 'idle',
    clear: () => cache.clear(),
    size: () => cache.size,
  };
}

/** Loader singleton untuk seluruh Game Space. */
export const spriteLoader: SpriteLoader = createSpriteLoader();

export function loadSprite(url: string): Promise<SpriteEntry> {
  return spriteLoader.load(url);
}

export function spriteStatus(url: string): SpriteStatus {
  return spriteLoader.status(url);
}

/**
 * Gambar sprite terpusat di (cx, cy), diskalakan agar muat di kotak
 * maxW × maxH dengan aspek terjaga. Mengembalikan false bila gambar
 * belum siap (pemanggil menggambar fallback).
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
): boolean {
  if (!img || !img.complete || img.naturalWidth === 0) return false;
  const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  return true;
}

/**
 * Gambar satu frame dari strip horizontal berisi `frames` frame sama lebar.
 * `phase` 0..1 memilih frame (mis. dari jam animasi). Mengembalikan false
 * bila gambar belum siap.
 */
export function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
  frames: number,
  phase: number,
): boolean {
  if (!img || !img.complete || img.naturalWidth === 0 || frames < 1) return false;
  const fw = img.naturalWidth / frames;
  const fh = img.naturalHeight;
  const idx = Math.min(frames - 1, Math.max(0, Math.floor(phase * frames)));
  const s = Math.min(maxW / fw, maxH / fh);
  const w = fw * s;
  const h = fh * s;
  ctx.drawImage(img, idx * fw, 0, fw, fh, cx - w / 2, cy - h / 2, w, h);
  return true;
}

/** Ambil gambar yang sudah 'ready' dari cache (sinkron, untuk loop render). */
export function readySprite(url: string): HTMLImageElement | null {
  const e = spriteLoader.peek(url);
  return e && e.status === 'ready' ? e.image : null;
}

/**
 * Hook DOM: muat sprite sekali, kembalikan gambar saat siap.
 * null = masih memuat ATAU gagal (komponen merender fallback CSS).
 */
export function useSprite(url: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(() =>
    url ? readySprite(url) : null,
  );
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    let alive = true;
    const ready = readySprite(url);
    if (ready) {
      setImg(ready);
      return;
    }
    setImg(null);
    void loadSprite(url).then((e) => {
      if (alive) setImg(e.status === 'ready' ? e.image : null);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return img;
}
