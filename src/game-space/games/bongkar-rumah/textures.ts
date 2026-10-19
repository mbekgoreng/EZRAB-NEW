/**
 * Bongkar Rumah 3D — tekstur prosedural via canvas (tanpa aset unduhan).
 *
 * Setiap material punya pasangan { intact, cracked }: base + gradient
 * terang-atas/gelap-bawah + highlight tepi + detail (mortar/serat/speckle)
 * + noise + vignette. Versi cracked = copy + retakan jagged.
 * Deterministik (seeded RNG) agar stabil antar build.
 */

export type TexKind =
  | 'bata' | 'beton' | 'kaca' | 'kayu' | 'genteng'
  | 'plester' | 'lantai' | 'pintu';

export interface TexPair {
  intact: HTMLCanvasElement;
  cracked: HTMLCanvasElement;
}

/** Seeded RNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const S = 256;

function base(seed: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D; r: () => number } {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d')!;
  return { c, g, r: rng(seed) };
}

/** Lapisan akhir: gradient cahaya atas + vignette tepi + noise halus. */
function finish(g: CanvasRenderingContext2D, r: () => number, lightTop: string, darkBottom: string): void {
  const lg = g.createLinearGradient(0, 0, 0, S);
  lg.addColorStop(0, lightTop);
  lg.addColorStop(0.5, 'rgba(255,255,255,0)');
  lg.addColorStop(1, darkBottom);
  g.fillStyle = lg;
  g.fillRect(0, 0, S, S);
  // noise halus
  for (let i = 0; i < 900; i += 1) {
    const x = r() * S; const y = r() * S;
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    g.fillRect(x, y, 1.6, 1.6);
  }
  // highlight tepi atas + shadow tepi bawah (bacaan 3D)
  g.fillStyle = 'rgba(255,255,255,0.20)';
  g.fillRect(0, 0, S, 7);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, S - 9, S, 9);
}

function paintBata(): TexPair {
  const { c, g, r } = base(11);
  g.fillStyle = '#8f3c1c';
  g.fillRect(0, 0, S, S); // mortar
  const bh = 32; const bw = 64;
  for (let row = 0; row < S / bh; row += 1) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < S / bw + 1; col += 1) {
      const x = col * bw + off; const y = row * bh;
      const v = (r() - 0.5) * 26;
      g.fillStyle = `rgb(${178 + v | 0},${82 + v * 0.6 | 0},${44 + v * 0.4 | 0})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      // shading bata individual
      const bg = g.createLinearGradient(0, y, 0, y + bh);
      bg.addColorStop(0, 'rgba(255,220,180,0.25)');
      bg.addColorStop(1, 'rgba(60,20,8,0.28)');
      g.fillStyle = bg;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      // cacat kecil
      if (r() > 0.6) {
        g.fillStyle = 'rgba(60,25,10,0.25)';
        g.fillRect(x + 6 + r() * (bw - 20), y + 6 + r() * (bh - 14), 5, 3);
      }
    }
  }
  finish(g, r, 'rgba(255,235,200,0.10)', 'rgba(40,12,4,0.20)');
  return { intact: c, cracked: crack(c) };
}

function paintBeton(): TexPair {
  const { c, g, r } = base(22);
  g.fillStyle = '#9aa0a8';
  g.fillRect(0, 0, S, S);
  // noda & belang
  for (let i = 0; i < 26; i += 1) {
    const x = r() * S; const y = r() * S; const rad = 12 + r() * 42;
    const ng = g.createRadialGradient(x, y, 2, x, y, rad);
    const dark = r() > 0.5;
    ng.addColorStop(0, dark ? 'rgba(70,76,84,0.16)' : 'rgba(255,255,255,0.10)');
    ng.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ng;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // speckle agregat
  for (let i = 0; i < 700; i += 1) {
    const x = r() * S; const y = r() * S;
    g.fillStyle = r() > 0.45 ? 'rgba(255,255,255,0.20)' : 'rgba(52,58,66,0.28)';
    const s = 1 + r() * 2.2;
    g.fillRect(x, y, s, s);
  }
  // garis bekisting
  g.strokeStyle = 'rgba(60,66,74,0.35)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, S * 0.5); g.lineTo(S, S * 0.5); g.stroke();
  finish(g, r, 'rgba(255,255,255,0.12)', 'rgba(30,34,40,0.22)');
  return { intact: c, cracked: crack(c) };
}

function paintKaca(): TexPair {
  const { c, g, r } = base(33);
  // kusen gelap sebagai background
  g.fillStyle = '#3a4654';
  g.fillRect(0, 0, S, S);
  const m = 14;
  const kg = g.createLinearGradient(0, 0, S, S);
  kg.addColorStop(0, '#cfeafb');
  kg.addColorStop(0.45, '#9fd0ee');
  kg.addColorStop(1, '#6fa9d4');
  g.fillStyle = kg;
  g.fillRect(m, m, S - m * 2, S - m * 2);
  // pantulan langit
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.moveTo(m, S - m); g.lineTo(m + 90, m); g.lineTo(m + 130, m); g.lineTo(m, S - m - 90);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.moveTo(m + 150, m); g.lineTo(m + 175, m); g.lineTo(m + 45, S - m); g.lineTo(m + 20, S - m);
  g.closePath(); g.fill();
  // tiang tengah kusen
  g.fillStyle = '#3a4654';
  g.fillRect(S / 2 - 5, m, 10, S - m * 2);
  g.fillRect(m, S / 2 - 5, S - m * 2, 10);
  // highlight kusen
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(0, 0, S, 5);
  finish(g, r, 'rgba(255,255,255,0.08)', 'rgba(20,30,40,0.18)');
  return { intact: c, cracked: crack(c) };
}

function paintKayu(): TexPair {
  const { c, g, r } = base(44);
  g.fillStyle = '#8a5a2e';
  g.fillRect(0, 0, S, S);
  // papan horizontal
  const ph = 64;
  for (let p = 0; p < S / ph; p += 1) {
    const y = p * ph;
    const v = (r() - 0.5) * 30;
    g.fillStyle = `rgb(${150 + v | 0},${102 + v * 0.7 | 0},${52 + v * 0.5 | 0})`;
    g.fillRect(0, y + 2, S, ph - 4);
    // serat
    g.strokeStyle = 'rgba(70,40,15,0.5)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 5; i += 1) {
      const gy = y + 8 + i * 11 + r() * 5;
      g.beginPath();
      g.moveTo(0, gy);
      g.bezierCurveTo(S * 0.3, gy + (r() - 0.5) * 10, S * 0.7, gy + (r() - 0.5) * 10, S, gy);
      g.stroke();
    }
    // mata kayu
    if (r() > 0.4) {
      const kx = r() * S; const ky = y + 10 + r() * (ph - 20);
      g.strokeStyle = 'rgba(70,40,15,0.65)';
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(kx, ky, 7, 4.5, 0.3, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = 'rgba(40,22,8,0.55)';
    g.fillRect(0, y, S, 2.5);
    g.fillStyle = 'rgba(255,230,190,0.18)';
    g.fillRect(0, y + 2.5, S, 3);
  }
  finish(g, r, 'rgba(255,235,200,0.10)', 'rgba(45,25,8,0.22)');
  return { intact: c, cracked: crack(c) };
}

function paintGenteng(): TexPair {
  const { c, g, r } = base(55);
  g.fillStyle = '#7e2f16';
  g.fillRect(0, 0, S, S);
  const th = 42; const tw = 52;
  for (let row = 0; row < S / th + 1; row += 1) {
    const y = row * th;
    const off = (row % 2) * (tw / 2);
    for (let col = -1; col < S / tw + 1; col += 1) {
      const x = col * tw + off;
      const v = (r() - 0.5) * 30;
      const tg = g.createLinearGradient(x, y, x, y + th);
      tg.addColorStop(0, `rgb(${196 + v | 0},${92 + v * 0.6 | 0},${52 + v * 0.4 | 0})`);
      tg.addColorStop(1, `rgb(${138 + v | 0},${58 + v * 0.6 | 0},${32 + v * 0.4 | 0})`);
      g.fillStyle = tg;
      // genteng melengkung
      g.beginPath();
      g.ellipse(x + tw / 2, y + th / 2, tw / 2 - 2, th / 2, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(70,25,10,0.6)';
      g.lineWidth = 2;
      g.stroke();
    }
    // bayangan antar lapis
    g.fillStyle = 'rgba(50,15,5,0.35)';
    g.fillRect(0, y + th - 7, S, 7);
  }
  finish(g, r, 'rgba(255,220,180,0.12)', 'rgba(50,15,5,0.25)');
  return { intact: c, cracked: crack(c) };
}

function paintPlester(): TexPair {
  const { c, g, r } = base(66);
  g.fillStyle = '#e8ddc8';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i += 1) {
    const x = r() * S; const y = r() * S; const rad = 10 + r() * 30;
    const ng = g.createRadialGradient(x, y, 2, x, y, rad);
    ng.addColorStop(0, r() > 0.5 ? 'rgba(190,170,140,0.14)' : 'rgba(255,250,240,0.12)');
    ng.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ng;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  finish(g, r, 'rgba(255,255,255,0.14)', 'rgba(120,100,70,0.20)');
  return { intact: c, cracked: crack(c) };
}

function paintLantai(): TexPair {
  const { c, g, r } = base(77);
  g.fillStyle = '#6e4a26';
  g.fillRect(0, 0, S, S);
  const pw = 42;
  for (let p = 0; p < S / pw; p += 1) {
    const x = p * pw;
    const v = (r() - 0.5) * 26;
    g.fillStyle = `rgb(${146 + v | 0},${100 + v * 0.7 | 0},${58 + v * 0.5 | 0})`;
    g.fillRect(x + 1.5, 0, pw - 3, S);
    g.strokeStyle = 'rgba(60,35,12,0.45)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 6; i += 1) {
      const gx = x + 6 + i * 6 + r() * 3;
      g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx + (r() - 0.5) * 8, S); g.stroke();
    }
    g.fillStyle = 'rgba(35,20,8,0.6)';
    g.fillRect(x, 0, 2, S);
  }
  finish(g, r, 'rgba(255,235,200,0.10)', 'rgba(40,22,8,0.24)');
  return { intact: c, cracked: crack(c) };
}

function paintPintu(): TexPair {
  const { c, g, r } = base(88);
  // daun pintu kayu + panel
  g.fillStyle = '#7c5228';
  g.fillRect(0, 0, S, S);
  const v = 12;
  g.fillStyle = `rgb(${124 + v},${82 + v},${46 + v})`;
  g.fillRect(10, 10, S - 20, S - 20);
  // panel cekung
  g.strokeStyle = 'rgba(50,28,10,0.7)';
  g.lineWidth = 6;
  g.strokeRect(34, 30, S - 68, 90);
  g.strokeRect(34, 140, S - 68, 86);
  g.strokeStyle = 'rgba(255,225,180,0.25)';
  g.lineWidth = 2;
  g.strokeRect(40, 36, S - 80, 78);
  g.strokeRect(40, 146, S - 80, 74);
  // serat vertikal
  g.strokeStyle = 'rgba(60,35,12,0.4)';
  g.lineWidth = 1.3;
  for (let i = 0; i < 8; i += 1) {
    const x = 16 + i * 30 + r() * 6;
    g.beginPath(); g.moveTo(x, 12); g.lineTo(x + (r() - 0.5) * 6, S - 12); g.stroke();
  }
  // gagang pintu
  const hx = S - 44; const hy = S / 2;
  const hg = g.createRadialGradient(hx - 3, hy - 3, 2, hx, hy, 14);
  hg.addColorStop(0, '#ffe9a8');
  hg.addColorStop(0.6, '#c9962e');
  hg.addColorStop(1, '#7a5a12');
  g.fillStyle = hg;
  g.beginPath(); g.arc(hx, hy, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(60,40,8,0.8)';
  g.fillRect(hx - 22, hy - 4, 12, 8);
  finish(g, r, 'rgba(255,235,200,0.10)', 'rgba(40,22,8,0.24)');
  return { intact: c, cracked: crack(c) };
}

/** Retakan jagged di atas copy kanvas. */
function crack(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  const r = rng(999);
  g.strokeStyle = 'rgba(25,18,14,0.85)';
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (let k = 0; k < 3; k += 1) {
    let x = S * (0.2 + r() * 0.6);
    let y = r() * S * 0.3;
    g.beginPath();
    g.moveTo(x, y);
    const segs = 5 + ((r() * 4) | 0);
    for (let i = 0; i < segs; i += 1) {
      x += (r() - 0.5) * 70;
      y += 24 + r() * 30;
      g.lineTo(x, y);
      // cabang kecil
      if (r() > 0.55) {
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 60, y + r() * 26);
        g.moveTo(x, y);
      }
    }
    g.stroke();
  }
  // gelapkan sedikit (baca "rusak")
  g.fillStyle = 'rgba(30,20,14,0.18)';
  g.fillRect(0, 0, S, S);
  return c;
}

const painters: Record<TexKind, () => TexPair> = {
  bata: paintBata,
  beton: paintBeton,
  kaca: paintKaca,
  kayu: paintKayu,
  genteng: paintGenteng,
  plester: paintPlester,
  lantai: paintLantai,
  pintu: paintPintu,
};

export function buildAllTextures(): Record<TexKind, TexPair> {
  const out = {} as Record<TexKind, TexPair>;
  (Object.keys(painters) as TexKind[]).forEach((k) => {
    out[k] = painters[k]();
  });
  return out;
}

/** Lingkaran lembut untuk debu. */
export function softCircle(size = 128): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.38)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Gradien langit untuk sky-dome. */
export function skyCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#3d7dc4');
  gr.addColorStop(0.45, '#8fc3ec');
  gr.addColorStop(0.75, '#cfe8f7');
  gr.addColorStop(1, '#f7e8c8');
  g.fillStyle = gr;
  g.fillRect(0, 0, 16, 256);
  return c;
}

/** Tekstur tanah site: tanah + kerikil + bercak. */
export function groundCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d')!;
  const r = rng(4242);
  g.fillStyle = '#8a6b4a';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 60; i += 1) {
    const x = r() * 512; const y = r() * 512; const rad = 14 + r() * 60;
    const ng = g.createRadialGradient(x, y, 2, x, y, rad);
    ng.addColorStop(0, r() > 0.5 ? 'rgba(90,64,40,0.25)' : 'rgba(190,160,120,0.18)');
    ng.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ng;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 900; i += 1) {
    g.fillStyle = r() > 0.5 ? 'rgba(60,42,26,0.5)' : 'rgba(210,185,140,0.5)';
    const s = 1 + r() * 3;
    g.fillRect(r() * 512, r() * 512, s, s * 0.8);
  }
  // strip rumput di tepi (digambar terpisah oleh engine bila perlu)
  return c;
}

/** Gedung jauh: siluet + jendela berpendar (untuk parallax). */
export function distantBuilding(seed: number, litRatio = 0.35): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d')!;
  const r = rng(seed);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#5b7186');
  gr.addColorStop(1, '#42566b');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 244; y += 20) {
    for (let x = 10; x < 118; x += 18) {
      const lit = r() < litRatio;
      g.fillStyle = lit ? 'rgba(255,236,170,0.9)' : 'rgba(28,40,54,0.55)';
      g.fillRect(x, y, 10, 12);
    }
  }
  return c;
}
