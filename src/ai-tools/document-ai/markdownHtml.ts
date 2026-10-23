/**
 * AI DOKUMEN — Konverter markdown AI ⇄ HTML editor (markdownHtml.ts)
 *
 * LATAR (audit F2): system prompt DRAFT memerintahkan "struktur heading dan
 * tabel yang benar" tanpa menyebut sintaks, sehingga model menjawab dengan
 * markdown — sementara jalur lama meneruskannya ke `plainToHtml`, yang
 * SECARA SENGAJA tidak menafsirkan markdown. Hasilnya draf tampil mentah
 * (#, **, |) di editor dan ikut rusak ke ekspor. Keputusan perbaikan:
 * prompt dan konverter disepakati — model menulis MARKDOWN TERSTRUKTUR
 * (lihat prompt.ts, FORMAT KELUARAN), dan modul ini mengonversinya menjadi
 * HTML yang dipahami editor TipTap (h1–h3, strong/em, ul/ol, table
 * thead-less <tbody> dengan baris <th> pertama — konvensi yang sama dengan
 * sampleHtml template dan yang dikenali paperModel saat ekspor).
 *
 * KEAMANAN: konversi SELALU escape-first. Seluruh teks model di-escape
 * (& < > ") sebelum transformasi apa pun; HTML mentah dari model TIDAK
 * PERNAH diteruskan (tidak ada passthrough) — satu-satunya tag dalam hasil
 * adalah tag yang dibuat modul ini dari teks yang sudah di-escape. Karena
 * itu hasilnya aman dirender lewat dangerouslySetInnerHTML (DocAnalyzer)
 * maupun dimuat ke editor (yang juga men-sanitasi dengan DOMPurify).
 *
 * CAKUPAN (sengaja terbatas & jujur): heading ATX #–###### (dipetakan ke
 * h1–h3), **tebal**, *miring*, `kode`, daftar "- "/"* "/"• " dan "1.",
 * garis --- (hr), tabel pipa markdown, paragraf dengan <br> untuk baris
 * tunggal (konsisten plainToHtml). TIDAK didukung: daftar bersarang,
 * tautan/gambar markdown (dibiarkan sebagai teks), blok kode ```,
 * heading setext, garis bawah __tebal__.
 */

/* ------------------------------------------------------------------ */
/* Escape (pola yang sama dengan richText.ts / companyProfile.ts)      */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/* ------------------------------------------------------------------ */
/* Inline: **tebal**, *miring*, `kode` — atas teks yang SUDAH di-escape */
/* ------------------------------------------------------------------ */

function inlineMd(escaped: string): string {
  // Rentang `kode` dilindungi dulu agar isinya tidak ikut diformat.
  const codeSpans: string[] = [];
  let s = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    codeSpans.push(code);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<code>${codeSpans[Number(i)]}</code>`);
  return s;
}

/* ------------------------------------------------------------------ */
/* markdown → HTML                                                     */
/* ------------------------------------------------------------------ */

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const UL_RE = /^\s*[-*•]\s+(.+)$/;
const OL_RE = /^\s*\d{1,3}[.)]\s+(.+)$/;
const SEPARATOR_CELL_RE = /^:?-{1,}:?$/;

/** Pecah satu baris tabel pipa menjadi sel-sel (pipa tepi opsional). */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

/** Baris pemisah tabel markdown? (semua sel berupa strip minus/titik dua) */
function isSeparatorRow(line: string): boolean {
  if (!line.includes('-') || !line.includes('|')) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => SEPARATOR_CELL_RE.test(c));
}

function isTableStart(lines: string[], i: number): boolean {
  return (
    i + 1 < lines.length &&
    lines[i].includes('|') &&
    lines[i].trim().length > 0 &&
    isSeparatorRow(lines[i + 1])
  );
}

/**
 * Markdown (keluaran model AI) → HTML aman untuk editor.
 * Teks kosong → '<p></p>' (konsisten dengan plainToHtml).
 */
export function markdownToHtml(md: string): string {
  const normalized = (md || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.trim()) return '<p></p>';
  const lines = normalized.split('\n');
  const out: string[] = [];

  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(`<p>${para.map((l) => inlineMd(escapeHtml(l))).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? 'ol' : 'ul';
    out.push(
      `<${tag}>${list.items.map((it) => `<li>${inlineMd(escapeHtml(it))}</li>`).join('')}</${tag}>`,
    );
    list = null;
  };
  const flushAll = () => {
    flushPara();
    flushList();
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      flushAll();
      i++;
      continue;
    }

    // Tabel pipa: header + baris pemisah + baris data.
    if (isTableStart(lines, i)) {
      flushAll();
      const header = splitRow(lines[i]);
      i += 2; // lewati header + pemisah
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const width = Math.max(header.length, ...rows.map((r) => r.length), 1);
      const pad = (cells: string[]) => {
        const c = cells.slice(0, width);
        while (c.length < width) c.push('');
        return c;
      };
      const headHtml = pad(header)
        .map((c) => `<th>${inlineMd(escapeHtml(c))}</th>`)
        .join('');
      const bodyHtml = rows
        .map((r) => `<tr>${pad(r).map((c) => `<td>${inlineMd(escapeHtml(c))}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<table><tbody><tr>${headHtml}</tr>${bodyHtml}</tbody></table>`);
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      flushAll();
      const level = Math.min(heading[1].length, 3);
      out.push(`<h${level}>${inlineMd(escapeHtml(heading[2]))}</h${level}>`);
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      flushAll();
      out.push('<hr>');
      i++;
      continue;
    }

    // Blockquote: penanda '>' dilepas, isinya paragraf biasa.
    const content = line.startsWith('>') ? line.replace(/^>\s?/, '') : line;

    const ul = content.match(UL_RE);
    const ol = ul ? null : content.match(OL_RE);
    if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1].trim());
      i++;
      continue;
    }

    flushList();
    para.push(content);
    i++;
  }
  flushAll();
  return out.join('') || '<p></p>';
}

/* ------------------------------------------------------------------ */
/* HTML → markdown-lite (serialisasi dokumen untuk model saat REVISI)  */
/* ------------------------------------------------------------------ */

/** Isi sel tabel → teks satu baris dengan penanda inline dipertahankan. */
function cellToMd(innerHtml: string): string {
  let s = innerHtml.replace(/<br\s*\/?>/gi, ' ');
  s = s
    .replace(/<(strong|b)\b[^>]*>/gi, '**')
    .replace(/<\/(strong|b)>/gi, '**')
    .replace(/<(em|i)\b[^>]*>/gi, '*')
    .replace(/<\/(em|i)>/gi, '*')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(s).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
}

/** Satu blok <table> HTML → tabel pipa markdown (separator sesudah baris <th>). */
function tableToMd(tableHtml: string): string {
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const rows: string[] = [];
  let rm: RegExpExecArray | null;
  let firstRow = true;
  while ((rm = rowRe.exec(tableHtml)) !== null) {
    const cells: string[] = [];
    let hasTh = false;
    let cm: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(rm[1])) !== null) {
      if (cm[1].toLowerCase() === 'th') hasTh = true;
      cells.push(cellToMd(cm[2]));
    }
    if (cells.length === 0) continue;
    rows.push(`| ${cells.join(' | ')} |`);
    if (firstRow && hasTh) rows.push(`| ${cells.map(() => '---').join(' | ')} |`);
    firstRow = false;
  }
  return rows.join('\n');
}

/**
 * HTML editor → markdown-lite untuk dikirim ke model (jalur REVISI):
 * heading menjadi #/##/###, strong menjadi **, item daftar menjadi "- "
 * (atau "1." berurutan dalam <ol>), tabel menjadi baris pipa, paragraf
 * dipisah baris kosong. Tujuannya struktur dokumen BERTAHAN melewati
 * model — bukan lagi diratakan menjadi teks polos — sehingga kandidat
 * revisi dapat dikonversi kembali dengan markdownToHtml tanpa kehilangan
 * heading/tabel/format yang tidak diubah pengguna.
 */
export function htmlToMarkdownLite(html: string): string {
  if (!html) return '';
  let s = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Tabel dulu (pemrosesan selnya mandiri), diganti blok markdown-nya.
  s = s.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (m) => `\n\n${tableToMd(m)}\n\n`);

  // Inline: penanda markdown disisipkan sebelum tag dibuang.
  s = s
    .replace(/<(strong|b)\b[^>]*>/gi, '**')
    .replace(/<\/(strong|b)>/gi, '**')
    .replace(/<(em|i)\b[^>]*>/gi, '*')
    .replace(/<\/(em|i)>/gi, '*')
    .replace(/<code\b[^>]*>/gi, '`')
    .replace(/<\/code>/gi, '`');

  // Daftar berurutan: nomor item di dalam tiap blok <ol>.
  s = s.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner: string) => {
    let n = 0;
    const items = inner.replace(/<li\b[^>]*>/gi, () => `\n${++n}. `);
    return `\n${items}\n`;
  });
  s = s.replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '');

  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<hr\b[^>]*>/gi, '\n\n---\n\n');
  s = s.replace(/<h([1-6])\b[^>]*>/gi, (_m, lv: string) => `\n\n${'#'.repeat(Math.min(Number(lv), 3))} `);
  s = s.replace(/<\/h[1-6]>/gi, '\n\n');
  s = s.replace(/<\/?(?:p|div|blockquote|section|article)\b[^>]*>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);

  return s
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
