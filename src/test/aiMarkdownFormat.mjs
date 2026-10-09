/**
 * EZRAB FASE 5C TASK 1 — Markdown renderer test (src/test/aiMarkdownFormat.mjs)
 *
 * Verifies the paragraph line-break fix: multi-line tool output must render
 * <br/> as a real break, not literal "&lt;br/&gt;" text. Also covers HTML
 * escaping, code blocks, and RAB figures.
 *
 * Mirrors src/ai-tools/ezrab-ai/markdown.tsx logic (esc + inline + paragraph join).
 */

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inline(md) {
  let s = esc(md);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^\*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  s = s.replace(/"([^"\n]{2,80})"/g, '<strong>$1</strong>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}
// FIXED paragraph rendering: inline each line, then join with real <br/>
function renderParagraph(lines) {
  return lines.map((b) => inline(b)).join('<br/>');
}
// OLD (buggy) behavior for contrast
function renderParagraphOld(lines) {
  return inline(lines.join('<br/>'));
}

console.log('AI MARKDOWN FORMAT');
const toolLines = [
  'Item: Pondasi batu kali',
  'Volume: 5 m³',
  'Harga satuan: Rp750.000/m³',
  'Subtotal: Rp3.750.000',
];
const fixed = renderParagraph(toolLines);
check('M1 fixed output contains real <br/>', fixed.includes('<br/>'));
check('M2 fixed output has no escaped &lt;br/&gt;', !fixed.includes('&lt;br/&gt;'));
check('M3 old output HAD the bug (escaped)', renderParagraphOld(toolLines).includes('&lt;br/&gt;'));
check('M4 RAB figures preserved', fixed.includes('Rp3.750.000') && fixed.includes('5 m³'));
check('M5 unit symbols preserved', fixed.includes('m³'));

const xss = renderParagraph(['<script>alert(1)</script>', 'normal']);
check('M6 HTML escaped (no script tag)', !xss.includes('<script>') && xss.includes('&lt;script&gt;'));

const bold = renderParagraph(['**Total**: Rp5.750.000']);
check('M7 bold markdown works', bold.includes('<strong>Total</strong>'));

const code = renderParagraph(['gunakan `volume * harga` untuk hitung']);
check('M8 inline code works', code.includes('<code>volume * harga</code>'));

const quotes = renderParagraph(['"Pekerjaan tanpa harga" belum diisi']);
check('M9 quoted text bolded', quotes.includes('<strong>Pekerjaan tanpa harga</strong>'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
