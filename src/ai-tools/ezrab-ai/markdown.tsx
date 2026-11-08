/**
 * EZRAB Chat — Premium Response Rendering Engine (renderer sentral).
 *
 * Satu-satunya renderer markdown untuk permukaan chat AI EZRAB:
 * Ezrab Chat AI (view.tsx), Magic AI / Co-Assistant (EzrabCoAssistantChatbox),
 * dan EzrabAiAssistantFullView. Permukaan lain (AI Document) memakai jalur
 * dokumennya sendiri (markdownHtml.ts) dan TIDAK melewati file ini.
 *
 * Arsitektur (parser-aware, BUKAN strip membabi buta):
 *   teks model → parser blok (heading/tabel/list/quote/fence/math block)
 *              → tokenizer inline (code span, math span, link, bold/italic,
 *                karakter lolos, teks biasa)
 *              → React nodes. TIDAK ADA dangerouslySetInnerHTML di jalur ini:
 *                teks selalu dirender sebagai text node React sehingga HTML/
 *                script dari model tidak pernah dieksekusi (anti-XSS by
 *                construction); tautan hanya lolos protokol aman.
 *
 * Perilaku penting yang dijaga:
 * - Kutipan "…" dipertahankan verbatim (aturan F3 lama: jangan ubah kutipan
 *   menjadi bold).
 * - Daftar bernomor: baris lanjutan menjorok (mis. "   Sumber: …" dari tool
 *   cari_ahsp) menempel ke item sebelumnya dan <ol> memakai `start` dari
 *   nomor tertulis — satu daftar tidak pecah menjadi banyak daftar yang
 *   menomori ulang dari 1 (perbaikan 2026-10-27, dipertahankan).
 * - Entitas HTML didekode TEPAT SEKALI di run teks biasa (bukan di code
 *   span/block): "&#x20;" tampil sebagai spasi, "&amp;#x20;" tampil sebagai
 *   teks "&#x20;" (decode satu kali, bukan dua).
 * - Matematika $…$ / $$…$$ / \(…\) / \[…\] TIDAK PERNAH tampil mentah:
 *   dikonversi menjadi teks matematika terbaca (latexToReadable) — ini
 *   konversi terbaca, BUKAN renderer KaTeX penuh. LaTeX malformed punya
 *   fallback terbaca (perintah tak dikenal kehilangan backslash-nya, isi
 *   tetap tampil).
 * - Streaming: penanda yang belum tertutup di akhir teks (bold/code/math
 *   separuh) dirender seolah tertutup di ujung, sehingga fragmen parsial
 *   tidak berkedip menampilkan penanda mentah; render akhir untuk teks
 *   lengkap identik.
 */
import React from 'react';
// CATATAN: gaya .md-* ada di ./markdown.css dan diimpor oleh komponen
// permukaan (view.tsx, EzrabCoAssistantChatbox, EzrabAiAssistantFullView)
// — BUKAN di sini, agar modul renderer ini tetap dapat diimpor harness
// tes node (tsx/vitest) yang tidak memproses impor CSS.

/* ================= Entitas HTML — decode tepat satu kali ================= */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', times: '×', divide: '÷', plusmn: '±', deg: '°',
  sup1: '¹', sup2: '²', sup3: '³', frac12: '½', frac14: '¼', frac34: '¾',
  middot: '·', bull: '•', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  permil: '‰', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§',
  para: '¶', micro: 'µ', iexcl: '¡', iquest: '¿', minus: '−', infin: '∞',
  ne: '≠', le: '≤', ge: '≥', asymp: '≈', sum: '∑', prod: '∏', radic: '√',
  pi: 'π', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ',
  theta: 'θ', lambda: 'λ', mu: 'µ', sigma: 'σ', phi: 'φ', omega: 'ω',
  Omega: 'Ω', rarr: '→', larr: '←', uarr: '↑', darr: '↓', harr: '↔',
  check: '✓', cross: '✗', star: '★', dagger: '†', prime: '′', Prime: '″',
  sup: '⊃', sub: '⊂', cup: '∪', cap: '∩', empty: '∅', isin: '∈',
};

/** Decode entitas HTML tepat satu kali (satu lintasan regex; hasil decode
 *  tidak dipindai ulang, jadi tidak ada double-decode). Entitas tak dikenal
 *  dibiarkan apa adanya — sama seperti perilaku browser. */
export function decodeHtmlEntitiesOnce(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#(?:x|X)[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) {
        try { return String.fromCodePoint(code); } catch { return whole; }
      }
      return whole;
    }
    const named = NAMED_ENTITIES[body];
    return named !== undefined ? named : whole;
  });
}

/* ================= LaTeX → teks matematika terbaca ================= */

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', g: 'ᵍ', h: 'ʰ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ',
  o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
};
const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ', t: 'ₜ', i: 'ᵢ', r: 'ᵣ', u: 'ᵤ', v: 'ᵥ',
};

function mapScript(chars: string, map: Record<string, string>): string {
  return chars.split('').map((c) => map[c] ?? c).join('');
}

const LATEX_COMMANDS: Record<string, string> = {
  times: '×', div: '÷', cdot: '·', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥',
  ne: '≠', neq: '≠', approx: '≈', equiv: '≡', infty: '∞', pi: 'π', degree: '°', circ: '°',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', theta: 'θ',
  lambda: 'λ', mu: 'µ', sigma: 'σ', Sigma: 'Σ', phi: 'φ', omega: 'ω', Omega: 'Ω',
  sum: '∑', prod: '∏', int: '∫', partial: '∂', nabla: '∇', sqrt: '√',
  rightarrow: '→', leftarrow: '←', to: '→', Rightarrow: '⇒', Leftarrow: '⇐',
  ldots: '…', dots: '…', cdots: '⋯', checkmark: '✓', bullet: '•',
  ast: '*', star: '★', angle: '∠', perp: '⊥', parallel: '∥',
  leqslant: '≤', geqslant: '≥', sim: '∼', propto: '∝', in: '∈', notin: '∉',
  cup: '∪', cap: '∩', subset: '⊂', supset: '⊃', emptyset: '∅',
  quad: ' ', qquad: ' ', displaystyle: '', limits: '', nolimits: '',
  left: '', right: '', big: '', Big: '', bigg: '', Bigg: '',
  hspace: '', vspace: '', kern: '', mkern: '',
};

/**
 * Konversi subset LaTeX menjadi teks matematika yang terbaca manusia.
 * Bukan KaTeX: tidak ada layout 2D (pecahan menjadi a/b), tetapi tidak ada
 * perintah LaTeX mentah yang bocor ke pengguna.
 */
export function latexToReadable(tex: string): string {
  let s = String(tex ?? '');
  // Perintah spasi LaTeX.
  s = s.replace(/\\[,;:]/g, ' ').replace(/\\!/g, '').replace(/\\ /g, ' ');
  // Derajat: ^\circ dan ^\text{...} yang memuat \circ → ° (sebelum pangkat).
  s = s.replace(/\^\\circ/g, '°');
  // \frac{a}{b} (berulang untuk pecahan bersarang sederhana).
  for (let guard = 0; guard < 6; guard++) {
    const next = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, a: string, b: string) => {
      const ra = latexToReadable(a).trim();
      const rb = latexToReadable(b).trim();
      const simple = /^[\w.]+$/.test(ra) && /^[\w.]+$/.test(rb);
      return simple ? `${ra}/${rb}` : `(${ra})/(${rb})`;
    });
    if (next === s) break;
    s = next;
  }
  // \sqrt{...} dan \sqrt x
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, a: string) => `√${latexToReadable(a).trim()}`);
  s = s.replace(/\\sqrt\s+(\S)/g, '√$1');
  // Pembungkus teks/format: \text{...}, \mathrm{...}, dst. → isinya.
  for (let guard = 0; guard < 6; guard++) {
    const next = s.replace(/\\(?:text|mathrm|mathbf|mathit|textbf|textit|operatorname|boxed|boldsymbol|mathsf|mathtt)\s*\{([^{}]*)\}/g,
      (_m, a: string) => latexToReadable(a));
    if (next === s) break;
    s = next;
  }
  // Super/subskrip: ^{...}, ^x, _{...}, _x.
  s = s.replace(/\^\{([^{}]*)\}/g, (_m, a: string) => mapScript(a, SUPERSCRIPT_MAP));
  s = s.replace(/\^(\w)/g, (_m, a: string) => SUPERSCRIPT_MAP[a] ?? `^${a}`);
  s = s.replace(/_\{([^{}]*)\}/g, (_m, a: string) => mapScript(a, SUBSCRIPT_MAP));
  s = s.replace(/_(\w)/g, (_m, a: string) => SUBSCRIPT_MAP[a] ?? `_${a}`);
  // Karakter lolos di dalam math.
  s = s.replace(/\\([%&#_${}])/g, '$1').replace(/\\\$/g, '$');
  // Perintah bernama → simbol; perintah tak dikenal kehilangan backslash
  // (fallback terbaca, tidak pernah tampil "\perintah" mentah).
  s = s.replace(/\\([a-zA-Z]+)/g, (_m, name: string) => (name in LATEX_COMMANDS ? LATEX_COMMANDS[name] : name));
  s = s.replace(/\\/g, '');
  // Sisa kurung kurawal pengelompokan dibuang, spasi dirapikan.
  s = s.replace(/[{}]/g, '').replace(/[ \t]{2,}/g, ' ');
  return s.trim();
}

/** Teks biasa yang terbaca: decode entitas satu kali + pangkat ^2 gaya
 *  teks (sering ditulis model di luar math) menjadi superskrip unicode. */
function readablePlainText(text: string): string {
  let s = decodeHtmlEntitiesOnce(text);
  s = s.replace(/\^\{([^{}]*)\}/g, (_m, a: string) => mapScript(a, SUPERSCRIPT_MAP));
  s = s.replace(/\^(\d)/g, (_m, a: string) => SUPERSCRIPT_MAP[a] ?? `^${a}`);
  return s;
}

/* ================= Keamanan tautan ================= */

function safeHref(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith('#') || u.startsWith('/') || u.startsWith('./') || u.startsWith('../')) return u;
  const m = u.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (!m) return u; // relatif tanpa skema
  const proto = m[1].toLowerCase();
  return proto === 'http' || proto === 'https' || proto === 'mailto' || proto === 'tel' ? u : null;
}

/* ================= Tokenizer inline ================= */

const ESCAPABLE = new Set(['\\', '`', '*', '_', '~', '$', '#', '[', ']', '(', ')', '{', '}', '!', '|', '>', '<', '+', '-', '.', '=']);

function findClosing(src: string, from: number, delim: string): number {
  let idx = src.indexOf(delim, from);
  // Penanda yang diloloskan (\$) bukan penutup.
  while (idx > 0 && src[idx - 1] === '\\') {
    idx = src.indexOf(delim, idx + delim.length);
  }
  return idx;
}

/** Render inline markdown menjadi React nodes (aman: semua teks adalah
 *  text node; tidak ada HTML mentah yang dieksekusi). */
export function renderInline(src: string, keyBase = 'i'): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let buf = '';
  let k = 0;
  const flush = () => {
    if (buf) {
      nodes.push(readablePlainText(buf));
      buf = '';
    }
  };
  const push = (node: React.ReactNode) => { flush(); nodes.push(React.cloneElement(node as React.ReactElement, { key: `${keyBase}-${k++}` })); };

  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    // Karakter lolos: \* \_ \` \$ \\ dst. → literal, tidak pernah diparse.
    // PENGECUALIAN: \( dan \[ adalah pembuka matematika LaTeX, bukan escape
    // — ditangani cabang math di bawah.
    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.has(src[i + 1]) && src[i + 1] !== '(' && src[i + 1] !== '[') {
      buf += src[i + 1];
      i += 2;
      continue;
    }

    // Code span (belum tertutup saat streaming → sisa dianggap code).
    if (ch === '`') {
      const end = findClosing(src, i + 1, '`');
      const content = end === -1 ? src.slice(i + 1) : src.slice(i + 1, end);
      push(<code>{content}</code>);
      i = end === -1 ? src.length : end + 1;
      continue;
    }

    // Math: $$…$$, $…$, \(…\), \[…\]
    if (ch === '$' || (ch === '\\' && (src[i + 1] === '(' || src[i + 1] === '['))) {
      const isDisplay = src.startsWith('$$', i) || src[i + 1] === '[';
      const openLen = src.startsWith('$$', i) ? 2 : ch === '$' ? 1 : 2;
      const closer = src.startsWith('$$', i) ? '$$' : ch === '$' ? '$' : src[i + 1] === '(' ? '\\)' : '\\]';
      const end = findClosing(src, i + openLen, closer);
      if (end === -1) {
        const rest = src.slice(i + openLen);
        // Streaming: sisa yang berbau LaTeX dirender terbaca tanpa penanda;
        // "$" kurs biasa (mis. harga dolar separuh ketik) tetap literal.
        if (/\\|\^|_|\{/.test(rest)) {
          push(<span className={isDisplay ? 'md-math md-math-inline-display' : 'md-math'}>{latexToReadable(rest)}</span>);
          i = src.length;
          continue;
        }
        buf += ch;
        i += 1;
        continue;
      }
      const content = src.slice(i + openLen, end);
      // Penjaga mata uang: "$ 100" / "$100 dan $200" bukan math bila isi
      // berawal/berakhir spasi, atau murni angka tanpa karakter matematika.
      if (closer === '$' && (content.startsWith(' ') || content.endsWith(' ') || (!/[\\^=]/.test(content) && /^\s*[\d.,\s]+$/.test(content)))) {
        buf += ch;
        i += 1;
        continue;
      }
      push(<span className={isDisplay ? 'md-math md-math-inline-display' : 'md-math'}>{latexToReadable(content)}</span>);
      i = end + closer.length;
      continue;
    }

    // Gambar → tautan teks alt (gambar dari model tidak dimuat langsung:
    // anti tracking/anti konten tak aman; alt tetap informatif).
    if (ch === '!' && src[i + 1] === '[') {
      const link = parseLinkLike(src, i + 1);
      if (link) {
        const href = safeHref(link.url);
        if (href) push(<a href={href} target="_blank" rel="noopener noreferrer">{link.label || href}</a>);
        else if (link.label) buf += link.label;
        i = link.next;
        continue;
      }
    }

    // Tautan [teks](url) — hanya protokol aman; selain itu label saja.
    if (ch === '[') {
      const link = parseLinkLike(src, i);
      if (link) {
        const href = safeHref(link.url);
        if (href) {
          push(<a href={href} target="_blank" rel="noopener noreferrer">{renderInline(link.label, `${keyBase}-l${k}`)}</a>);
        } else {
          // Protokol tak aman: tampilkan labelnya saja, tanpa tautan aktif.
          buf += link.label;
        }
        i = link.next;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }

    // Bold **…** / __…__ (belum tertutup saat streaming → bold sampai ujung).
    if ((ch === '*' && src[i + 1] === '*') || (ch === '_' && src[i + 1] === '_')) {
      const delim = src.slice(i, i + 2);
      const end = findClosing(src, i + 2, delim);
      const content = end === -1 ? src.slice(i + 2) : src.slice(i + 2, end);
      if (content.length > 0) {
        push(<strong>{renderInline(content, `${keyBase}-b${k}`)}</strong>);
        i = end === -1 ? src.length : end + 2;
        continue;
      }
      buf += delim;
      i += 2;
      continue;
    }

    // Strikethrough ~~…~~
    if (ch === '~' && src[i + 1] === '~') {
      const end = findClosing(src, i + 2, '~~');
      if (end !== -1 && end > i + 2) {
        push(<del>{renderInline(src.slice(i + 2, end), `${keyBase}-d${k}`)}</del>);
        i = end + 2;
        continue;
      }
      buf += '~~';
      i += 2;
      continue;
    }

    // Italic *…* / _…_ — konservatif (aturan lama): hanya bila dibatasi
    // spasi/tanda baca, agar snake_case (cari_ahsp) dan perkalian 2*3
    // tidak berubah menjadi italic.
    if (ch === '*' || ch === '_') {
      const prevOk = i === 0 || /[\s("']/.test(src[i - 1]);
      if (prevOk) {
        const end = findClosing(src, i + 1, ch);
        if (end > i + 1) {
          const after = end + 1 >= src.length ? '' : src[end + 1];
          if (after === '' || /[\s).,;:!?"']/.test(after)) {
            const content = src.slice(i + 1, end);
            if (!content.includes('\n')) {
              push(<em>{renderInline(content, `${keyBase}-e${k}`)}</em>);
              i = end + 1;
              continue;
            }
          }
        }
      }
      buf += ch;
      i += 1;
      continue;
    }

    buf += ch;
    i += 1;
  }
  flush();
  return nodes;
}

function parseLinkLike(src: string, openIdx: number): { label: string; url: string; next: number } | null {
  // src[openIdx] === '['
  const closeBracket = src.indexOf(']', openIdx + 1);
  if (closeBracket === -1 || src[closeBracket + 1] !== '(') return null;
  // URL boleh memuat tanda kurung berimbang (mis. javascript:alert(1) atau
  // path wiki "Fungsi_(matematika)") — cari ')' penutup yang seimbang,
  // bukan ')' pertama.
  let depth = 0;
  let closeParen = -1;
  for (let j = closeBracket + 1; j < src.length; j++) {
    if (src[j] === '(') depth++;
    else if (src[j] === ')') {
      depth--;
      if (depth === 0) { closeParen = j; break; }
    }
  }
  if (closeParen === -1) return null;
  const label = src.slice(openIdx + 1, closeBracket);
  let url = src.slice(closeBracket + 2, closeParen).trim();
  // Buang judul opsional: url "judul"
  const titleMatch = url.match(/^(\S+)\s+["'][^"']*["']$/);
  if (titleMatch) url = titleMatch[1];
  if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1);
  return { label, url, next: closeParen + 1 };
}

/* ================= Blok kode dengan tombol salin ================= */

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = React.useState(false);
  const doCopy = () => {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(done).catch(() => { /* clipboard ditolak: diam, jangan klaim tersalin */ });
    }
  };
  return (
    <div className="md-pre-wrap">
      <div className="md-pre-head">
        <span className="md-pre-lang">{lang || 'teks'}</span>
        <button type="button" className="md-pre-copy" onClick={doCopy} aria-label={`Salin blok kode${lang ? ` ${lang}` : ''}`}>{copied ? 'Tersalin ✓' : 'Salin'}</button>
      </div>
      <pre className="md-pre md-pre-inwrap"><code>{code}</code></pre>
    </div>
  );
}

/* ================= Parser blok ================= */

interface ListEntry {
  indent: number;
  ordered: boolean;
  num: number;
  textLines: string[];
  children: ListEntry[];
}

const UL_MARKER = /^(\s*)([-*•])\s+(.*)$/;
const OL_MARKER = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.includes('|') && t.length > 2;
}

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '|' && t[i - 1] !== '\\') { cells.push(cur.trim()); cur = ''; }
    // Pipa ter-escape (\|) adalah ISI sel, bukan pemisah — tampilkan
    // sebagai pipa literal di dalam selnya.
    else if (t[i] === '|' && t[i - 1] === '\\') { cur = cur.slice(0, -1) + '|'; }
    else cur += t[i];
  }
  cells.push(cur.trim());
  return cells;
}

function isSeparatorRow(line: string): boolean {
  if (!isTableRow(line)) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, '')));
}

function tableAligns(sepLine: string, count: number): Array<'left' | 'center' | 'right'> {
  const cells = splitTableRow(sepLine);
  const aligns: Array<'left' | 'center' | 'right'> = [];
  for (let i = 0; i < count; i++) {
    const c = (cells[i] || '').replace(/\s/g, '');
    aligns.push(c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left');
  }
  return aligns;
}

function isBlockStart(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith('```') ||
    /^#{1,6}\s/.test(t) ||
    /^([-*_])(\s*\1){2,}$/.test(t) ||
    t.startsWith('>') ||
    UL_MARKER.test(line) ||
    OL_MARKER.test(line) ||
    t.startsWith('$$') ||
    t.startsWith('\\[')
  );
}

/** Bangun pohon daftar dari entri datar berdasarkan indentasi. */
function buildListTree(entries: ListEntry[]): ListEntry[] {
  const root: ListEntry[] = [];
  const stack: Array<{ indent: number; items: ListEntry[] }> = [];
  for (const e of entries) {
    if (stack.length === 0) {
      root.push(e);
      stack.push({ indent: e.indent, items: root });
      continue;
    }
    const top = stack[stack.length - 1];
    if (e.indent === top.indent) {
      top.items.push(e);
    } else if (e.indent > top.indent) {
      const parent = top.items[top.items.length - 1];
      parent.children.push(e);
      stack.push({ indent: e.indent, items: parent.children });
    } else {
      while (stack.length > 0 && e.indent < stack[stack.length - 1].indent) stack.pop();
      if (stack.length > 0 && e.indent === stack[stack.length - 1].indent) {
        stack[stack.length - 1].items.push(e);
      } else if (stack.length > 0) {
        const t2 = stack[stack.length - 1];
        const parent = t2.items[t2.items.length - 1];
        parent.children.push(e);
        stack.push({ indent: e.indent, items: parent.children });
      } else {
        root.push(e);
        stack.push({ indent: e.indent, items: root });
      }
    }
  }
  return root;
}

function renderListItems(items: ListEntry[], keyBase: string): React.ReactNode {
  // Kelompokkan sibling selevel berdasarkan jenis penanda.
  const groups: Array<{ ordered: boolean; items: ListEntry[] }> = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.ordered === it.ordered) last.items.push(it);
    else groups.push({ ordered: it.ordered, items: [it] });
  }
  return groups.map((g, gi) => {
    const listItems = g.items.map((it, ii) => {
      let firstLine = it.textLines[0] ?? '';
      let taskMark: string | null = null;
      const tm = firstLine.match(/^\[([ xX])\]\s+(.*)$/);
      if (tm) { taskMark = tm[1].toLowerCase() === 'x' ? '☑ ' : '☐ '; firstLine = tm[2]; }
      const lines = [firstLine, ...it.textLines.slice(1)];
      return (
        <li key={ii}>
          {taskMark}
          {lines.map((l, li) => (
            <React.Fragment key={li}>
              {li > 0 && <br />}
              {renderInline(l, `${keyBase}-g${gi}i${ii}l${li}`)}
            </React.Fragment>
          ))}
          {it.children.length > 0 && renderListItems(it.children, `${keyBase}-g${gi}i${ii}c`)}
        </li>
      );
    });
    return g.ordered ? (
      <ol key={gi} className="md-ol" start={g.items[0].num}>{listItems}</ol>
    ) : (
      <ul key={gi} className="md-ul">{listItems}</ul>
    );
  });
}

/**
 * Render markdown respons AI menjadi React nodes (blok).
 * Signature dipertahankan dari renderer lama: mengembalikan array node
 * untuk disebar ke dalam kontainer .md-body.
 */
export function renderMarkdown(md: string): React.ReactNode[] {
  const text = String(md ?? '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  const K = () => key++;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blok kode berpagar (belum tertutup saat streaming → sampai EOF).
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim().split(/\s+/)[0] || '';
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++; }
      if (i < lines.length) i++; // pagar penutup
      out.push(<CodeBlock key={K()} lang={lang} code={buf.join('\n')} />);
      continue;
    }

    // Blok matematika $$…$$ / \[…\] (boleh multi-baris).
    if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
      const closer = trimmed.startsWith('$$') ? '$$' : '\\]';
      const openerLen = 2;
      let content = trimmed.slice(openerLen);
      if (content.endsWith(closer) && content.length > closer.length) {
        content = content.slice(0, -closer.length);
        i++;
      } else {
        i++;
        const parts = [content];
        while (i < lines.length && !lines[i].includes(closer)) { parts.push(lines[i]); i++; }
        if (i < lines.length) {
          const last = lines[i];
          parts.push(last.slice(0, last.indexOf(closer)));
          i++;
        }
        content = parts.join('\n');
      }
      out.push(<div key={K()} className="md-math-block">{latexToReadable(content)}</div>);
      continue;
    }

    // Satu baris penuh $…$ → blok matematika.
    if (/^\$[^$]+\$$/.test(trimmed)) {
      out.push(<div key={K()} className="md-math-block">{latexToReadable(trimmed.slice(1, -1))}</div>);
      i++;
      continue;
    }

    // Tabel (header + baris pemisah).
    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headers = splitTableRow(line);
      const aligns = tableAligns(lines[i + 1], headers.length);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i]) && lines[i].trim() !== '') {
        const cells = splitTableRow(lines[i]);
        while (cells.length < headers.length) cells.push('');
        rows.push(cells.slice(0, headers.length));
        i++;
      }
      out.push(
        <table key={K()} className="md-table">
          <thead>
            <tr>{headers.map((h, hi) => <th key={hi} style={{ textAlign: aligns[hi] }}>{renderInline(h, `th${key}-${hi}`)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ textAlign: aligns[ci] }}>{renderInline(c, `td${key}-${ri}-${ci}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    // Heading (# s.d. ###### → h3/h4/h5 seperti pemetaan lama).
    const hm = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      const Tag = (`h${Math.min(hm[1].length + 2, 5)}`) as 'h3' | 'h4' | 'h5';
      out.push(<Tag key={K()} className="md-h">{renderInline(hm[2], `h${key}`)}</Tag>);
      i++;
      continue;
    }

    // Garis pemisah: ---, ***, ___, - - -, dst.
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed) || /^-{3,}$/.test(trimmed)) {
      out.push(<hr key={K()} className="md-hr" />);
      i++;
      continue;
    }

    // Blockquote (rekursif satu tingkat per lapis ">").
    if (trimmed.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(
        <blockquote key={K()} className="md-quote">
          {renderMarkdown(buf.join('\n'))}
        </blockquote>
      );
      continue;
    }

    // Daftar (ul/ol, bersarang, dengan baris lanjutan).
    if (UL_MARKER.test(line) || OL_MARKER.test(line)) {
      const entries: ListEntry[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        const um = cur.match(UL_MARKER);
        const om = cur.match(OL_MARKER);
        if (um || om) {
          entries.push({
            indent: (um ? um[1] : om![1]).length,
            ordered: !!om,
            num: om ? parseInt(om[2], 10) : 1,
            textLines: [um ? um[3] : om![3]],
            children: [],
          });
          i++;
          continue;
        }
        if (!cur.trim()) {
          // Daftar longgar: lanjut hanya bila baris berikutnya item daftar.
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length && (UL_MARKER.test(lines[j]) || OL_MARKER.test(lines[j]))) { i = j; continue; }
          break;
        }
        // Baris lanjutan menjorok = bagian item terakhir (menjaga baris
        // "   Sumber: …" tetap di dalam itemnya — perbaikan 2026-10-27).
        if (entries.length > 0 && /^\s{2,}\S/.test(cur) && !isBlockStart(cur)) {
          entries[entries.length - 1].textLines.push(cur.trim());
          i++;
          continue;
        }
        break;
      }
      const tree = buildListTree(entries);
      out.push(<React.Fragment key={K()}>{renderListItems(tree, `list${key}`)}</React.Fragment>);
      continue;
    }

    // Baris kosong → lewati (jeda paragraf dari struktur blok).
    if (!trimmed) { i++; continue; }

    // Paragraf: gabung baris berurutan; baris hitungan ("= …") diberi
    // kelas khusus agar langkah perhitungan tampil sejajar & terbaca.
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i]) && !(isTableRow(lines[i]) && i + 1 < lines.length && isSeparatorRow(lines[i + 1]))) {
      buf.push(lines[i]);
      i++;
    }
    out.push(
      <p key={K()} className="md-p">
        {buf.map((l, li) => {
          const isCalc = /^\s*=/.test(l) && /\d/.test(l);
          const content = renderInline(l.trim(), `p${key}-${li}`);
          return (
            <React.Fragment key={li}>
              {li > 0 && <br />}
              {isCalc ? <span className="md-calc">{content}</span> : content}
            </React.Fragment>
          );
        })}
      </p>
    );
  }

  return out;
}

/* ================= Versi teks terlihat (untuk salin & pengujian) ================= */

/**
 * Teks yang BENAR-BENAR dilihat pengguna bila markdown ini dirender:
 * penanda markdown hilang, matematika terbaca, entitas terdekode satu kali,
 * tautan menjadi labelnya (plus URL bila label kosong), tabel menjadi
 * baris sel terpisah " | ". Dipakai suite regresi rendering dan tersedia
 * untuk kebutuhan salin teks bersih.
 */
export function markdownToPlainText(md: string): string {
  const text = String(md ?? '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { out.push(lines[i]); i++; }
      if (i < lines.length) i++;
      continue;
    }
    if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
      const closer = trimmed.startsWith('$$') ? '$$' : '\\]';
      let content = trimmed.slice(2);
      if (content.endsWith(closer) && content.length > closer.length) {
        out.push(latexToReadable(content.slice(0, -closer.length)));
        i++;
        continue;
      }
      i++;
      const parts = [content];
      while (i < lines.length && !lines[i].includes(closer)) { parts.push(lines[i]); i++; }
      if (i < lines.length) { parts.push(lines[i].slice(0, lines[i].indexOf(closer))); i++; }
      out.push(latexToReadable(parts.join('\n')));
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      // Sel dirender inline→plain (bukan regex mentah) agar sel berisi
      // bold/math/tautan tampil sama terbacanya dengan render visual.
      out.push(splitTableRow(line).map((c) => inlineToPlain(c)).join(' | '));
      i += 2;
      while (i < lines.length && isTableRow(lines[i]) && lines[i].trim() !== '') {
        out.push(splitTableRow(lines[i]).map((c) => inlineToPlain(c)).join(' | '));
        i++;
      }
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed) || /^-{3,}$/.test(trimmed)) { i++; continue; }
    out.push(inlineToPlain(line));
    i++;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function inlineToPlain(src: string): string {
  let s = src;
  // Penanda daftar di awal baris hilang (indentasi bersarang dipertahankan
  // sebagai spasi relatif agar struktur tetap terbaca sebagai teks).
  s = s.replace(/^(\s*)(?:[-*•]|\d{1,9}[.)])\s+/, '$1');
  // Kotak tugas → simbol yang sama dengan tampilan render.
  s = s.replace(/^\[([ xX])\]\s+/, (_m, c: string) => (c.toLowerCase() === 'x' ? '☑ ' : '☐ '));
  // Heading & quote markers.
  s = s.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^\s*>\s?/, '');
  // Math dulu (sebelum penanda lain diproses).
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_m, a: string) => latexToReadable(a));
  s = s.replace(/\$([^$\n]+)\$/g, (_m, a: string) => latexToReadable(a));
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_m, a: string) => latexToReadable(a));
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_m, a: string) => latexToReadable(a));
  // Gambar & tautan → label.
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Code span → isi.
  s = s.replace(/`([^`]*)`/g, '$1');
  // Karakter lolos → literal.
  s = s.replace(/\\([\\`*_~$#[\](){}!|><+\-.=])/g, '$1');
  // Bold/italic/strike → isi.
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1');
  s = s.replace(/~~([^~]+)~~/g, '$1');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2');
  return readablePlainText(s);
}
