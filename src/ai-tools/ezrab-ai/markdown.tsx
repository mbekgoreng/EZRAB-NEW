/**
 * Lightweight Gemini/ChatGPT-style markdown renderer for chat bubbles.
 * Handles: "quoted" -> bold, **bold**, *italic*, - lists, 1. numbered lists,
 * ## headers, `code`, ```blocks```, tables, --- hr. No external deps.
 */
import React from 'react';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Inline: **bold**, *italic*, `code`, "quoted" -> bold */
function inline(md: string): string {
  let s = esc(md);
  // code first (protect contents)
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  // "quoted text" -> bold (user request: no literal quote symbols)
  s = s.replace(/"([^"\n]{2,80})"/g, '<strong>$1</strong>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

export function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // code block
    if (line.trim().startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++; }
      i++;
      out.push(<pre key={key++} className="md-pre"><code>{buf.join('\n')}</code></pre>);
      continue;
    }

    // table
    if (/^\|.+\|$/.test(line.trim()) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      const headers = line.trim().slice(1, -1).split('|').map((h) => h.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim()));
        i++;
      }
      out.push(
        <table key={key++} className="md-table">
          <thead><tr>{headers.map((h, hi) => <th key={hi} dangerouslySetInnerHTML={{ __html: inline(h) }} />)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} dangerouslySetInnerHTML={{ __html: inline(c) }} />)}</tr>)}</tbody>
        </table>
      );
      continue;
    }

    // headers
    const hm = line.match(/^(#{1,4})\s+(.*)/);
    if (hm) {
      const lvl = hm[1].length;
      const Tag = (`h${Math.min(lvl + 2, 5)}`) as 'h3' | 'h4' | 'h5';
      out.push(<Tag key={key++} className="md-h" dangerouslySetInnerHTML={{ __html: inline(hm[2]) }} />);
      i++;
      continue;
    }

    // hr
    if (/^---+$/.test(line.trim())) {
      out.push(<hr key={key++} className="md-hr" />);
      i++;
      continue;
    }

    // unordered list
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
        i++;
      }
      out.push(
        <ul key={key++} className="md-ul">
          {items.map((it, ii) => <li key={ii} dangerouslySetInnerHTML={{ __html: inline(it) }} />)}
        </ul>
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i++;
      }
      out.push(
        <ol key={key++} className="md-ol">
          {items.map((it, ii) => <li key={ii} dangerouslySetInnerHTML={{ __html: inline(it) }} />)}
        </ol>
      );
      continue;
    }

    // blank -> skip (paragraph breaks handled by block structure)
    if (!line.trim()) { i++; continue; }

    // paragraph (merge consecutive non-blank non-special lines)
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,4}\s|```|\|.+\||---+|\s*[-*•]\s+|\s*\d+[.)]\s+)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(<p key={key++} className="md-p" dangerouslySetInnerHTML={{ __html: inline(buf.join('<br/>')) }} />);
  }

  return out;
}
