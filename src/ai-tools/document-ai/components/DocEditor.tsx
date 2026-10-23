/**
 * AI DOKUMEN — Editor Word-like (TipTap).
 *
 * Editor rich-text SUNGGUHAN (bukan textarea): toolbar memformat teks
 * terpilih lewat perintah ProseMirror/TipTap. Selection dipertahankan
 * saat tombol diklik (mousedown dicegah + chain().focus()).
 *
 * Isi dipertukarkan sebagai HTML. Draf lama (teks polos) dikonversi oleh
 * pemanggil lewat richText.ts sebelum sampai ke sini.
 */
import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontSize, FontFamily, Color } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import DOMPurify from 'dompurify';
import {
  Undo2, Redo2, Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  IndentIncrease, IndentDecrease, Table as TableIcon, Minus, Eraser,
  Highlighter, Type, Trash2, Rows3, Columns3,
} from 'lucide-react';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ezIndent: {
      indentMore: () => ReturnType;
      indentLess: () => ReturnType;
    };
  }
}

const MAX_INDENT = 4;

/** Indentasi paragraf/heading via atribut margin (daftar memakai sink/lift bawaan). */
const IndentExt = Extension.create({
  name: 'ezIndent',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el: HTMLElement) => {
              const ml = parseFloat(el.style.marginLeft || '0');
              return Number.isFinite(ml) && ml > 0 ? Math.min(MAX_INDENT, Math.round(ml / 2)) : 0;
            },
            renderHTML: (attrs: { indent?: number }) =>
              attrs.indent && attrs.indent > 0 ? { style: `margin-left: ${attrs.indent * 2}em` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      indentMore:
        () =>
        ({ editor, chain }) => {
          if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
            return chain().sinkListItem('listItem').run();
          }
          const type = editor.isActive('heading') ? 'heading' : 'paragraph';
          const cur = (editor.getAttributes(type).indent as number) || 0;
          return chain().updateAttributes(type, { indent: Math.min(MAX_INDENT, cur + 1) }).run();
        },
      indentLess:
        () =>
        ({ editor, chain }) => {
          if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
            return chain().liftListItem('listItem').run();
          }
          const type = editor.isActive('heading') ? 'heading' : 'paragraph';
          const cur = (editor.getAttributes(type).indent as number) || 0;
          return chain().updateAttributes(type, { indent: Math.max(0, cur - 1) }).run();
        },
    };
  },
});

/** Placeholder ringan tanpa paket tambahan (dekorasi ProseMirror). */
const PlaceholderExt = Extension.create<{ text: string }>({
  name: 'ezPlaceholder',
  addOptions() {
    return { text: '' };
  },
  addProseMirrorPlugins() {
    const getText = () => this.options.text;
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const { doc } = state;
            const isEmptyDoc = doc.childCount === 1 && doc.textContent.trim().length === 0;
            if (!isEmptyDoc || !doc.firstChild) return DecorationSet.empty;
            const deco = Decoration.node(0, doc.firstChild.nodeSize, {
              class: 'docai-ph',
              'data-placeholder': getText(),
            });
            return DecorationSet.create(doc, [deco]);
          },
        },
      }),
    ];
  },
});

const FONT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Plus Jakarta Sans' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Calibri, sans-serif', label: 'Calibri' },
  { value: "'Courier New', monospace", label: 'Courier New' },
];

const SIZE_OPTIONS = ['', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
const TEXT_COLORS = ['#111827', '#1D4ED8', '#DC2626', '#059669', '#D97706', '#6B7280'];
const HIGHLIGHT_COLORS = ['#FEF08A', '#BBF7D0', '#BFDBFE', '#FECDD3'];

interface DocEditorProps {
  initialHtml: string;
  onChange: (html: string) => void;
  onEditorReady?: (editor: Editor) => void;
  t: (key: string) => string;
  /** HTML kop surat (dari profil perusahaan) — dirender di dalam lembar, bukan bagian isi yang bisa disunting. */
  headerHtml?: string;
  /** Teks footer lembar (nama perusahaan • judul dokumen). */
  footerText?: string;
  /** false = mode pratinjau: editor tidak dapat disunting dan toolbar disembunyikan. Default true. */
  editable?: boolean;
}

export const DocEditor: React.FC<DocEditorProps> = ({ initialHtml, onChange, onEditorReady, t, headerHtml, footerText, editable = true }) => {
  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextStyle,
      FontSize,
      FontFamily,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      IndentExt,
      PlaceholderExt.configure({ text: t('ai.doc.create.ed_placeholder') }),
    ],
    content: DOMPurify.sanitize(initialHtml),
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: {
      attributes: { class: 'docai-prose', 'aria-label': t('ai.doc.create.ed_title') },
    },
  });

  useEffect(() => {
    if (editor) onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  // Mode pratinjau dapat dinyalakan/dimatikan tanpa me-remount editor.
  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;
  return (
    <div className="docai-editorwrap">
      {editable && <DocToolbar editor={editor} t={t} />}
      <div className="docai-canvas">
        <div className="docai-page">
          {headerHtml ? <div dangerouslySetInnerHTML={{ __html: headerHtml }} /> : null}
          <EditorContent editor={editor} />
          {footerText ? (
            <div className="docai-pagefoot">
              <span>{footerText}</span>
              <span>Nomor halaman otomatis saat dicetak / diekspor</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

const DocToolbar: React.FC<{ editor: Editor; t: (key: string) => string }> = ({ editor, t }) => {
  const [, setTick] = useState(0);
  const [openMenu, setOpenMenu] = useState<'color' | 'highlight' | null>(null);

  // Segarkan state aktif toolbar setiap transaksi editor.
  useEffect(() => {
    const fn = () => setTick((x) => x + 1);
    editor.on('transaction', fn);
    return () => {
      editor.off('transaction', fn);
    };
  }, [editor]);

  const ts = editor.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string; color?: string };
  const curFont = FONT_OPTIONS.some((f) => f.value === ts.fontFamily) ? (ts.fontFamily as string) : '';
  const curSize = ts.fontSize && SIZE_OPTIONS.includes(ts.fontSize) ? ts.fontSize : '';
  const blockStyle = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : 'p';
  const inTable = editor.isActive('table');

  const btn = (
    opts: {
      title: string;
      active?: boolean;
      disabled?: boolean;
      onRun: () => void;
    },
    children: React.ReactNode,
  ) => (
    <button
      type="button"
      className={`docai-tbtn ${opts.active ? 'active' : ''}`}
      title={opts.title}
      aria-label={opts.title}
      aria-pressed={opts.active ?? undefined}
      disabled={opts.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={opts.onRun}
    >
      {children}
    </button>
  );

  return (
    <div className="docai-etoolbar" role="toolbar" aria-label={t('ai.doc.create.ed_title')}>
      <div className="docai-tgroup">
        {btn(
          { title: t('ai.doc.create.tb_undo'), disabled: !editor.can().undo(), onRun: () => editor.chain().focus().undo().run() },
          <Undo2 size={16} />,
        )}
        {btn(
          { title: t('ai.doc.create.tb_redo'), disabled: !editor.can().redo(), onRun: () => editor.chain().focus().redo().run() },
          <Redo2 size={16} />,
        )}
      </div>

      <div className="docai-tsep" />

      <div className="docai-tgroup">
        <select
          className="docai-tselect docai-tfont"
          title={t('ai.doc.create.tb_font')}
          aria-label={t('ai.doc.create.tb_font')}
          value={curFont}
          onChange={(e) => {
            const v = e.target.value;
            const ch = editor.chain().focus();
            if (v) ch.setFontFamily(v).run();
            else ch.unsetFontFamily().run();
          }}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.label} value={f.value} style={f.value ? { fontFamily: f.value } : undefined}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className="docai-tselect docai-tsize"
          title={t('ai.doc.create.tb_size')}
          aria-label={t('ai.doc.create.tb_size')}
          value={curSize}
          onChange={(e) => {
            const v = e.target.value;
            const ch = editor.chain().focus();
            if (v) ch.setFontSize(v).run();
            else ch.unsetFontSize().run();
          }}
        >
          <option value="">—</option>
          {SIZE_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {s.replace('px', '')}
            </option>
          ))}
        </select>
        <select
          className="docai-tselect docai-tstyle"
          title={t('ai.doc.create.tb_style')}
          aria-label={t('ai.doc.create.tb_style')}
          value={blockStyle}
          onChange={(e) => {
            const v = e.target.value;
            const ch = editor.chain().focus();
            if (v === 'p') ch.setParagraph().run();
            else ch.toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
          }}
        >
          <option value="p">{t('ai.doc.create.tb_style')} · Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
      </div>

      <div className="docai-tsep" />

      <div className="docai-tgroup">
        {btn(
          { title: t('ai.doc.create.tb_bold'), active: editor.isActive('bold'), onRun: () => editor.chain().focus().toggleBold().run() },
          <Bold size={16} />,
        )}
        {btn(
          { title: t('ai.doc.create.tb_italic'), active: editor.isActive('italic'), onRun: () => editor.chain().focus().toggleItalic().run() },
          <Italic size={16} />,
        )}
        {btn(
          {
            title: t('ai.doc.create.tb_underline'),
            active: editor.isActive('underline'),
            onRun: () => editor.chain().focus().toggleUnderline().run(),
          },
          <UnderlineIcon size={16} />,
        )}
        {btn(
          { title: t('ai.doc.create.tb_strike'), active: editor.isActive('strike'), onRun: () => editor.chain().focus().toggleStrike().run() },
          <Strikethrough size={16} />,
        )}
        <div className="docai-tpop">
          {btn(
            {
              title: t('ai.doc.create.tb_color'),
              active: openMenu === 'color' || !!ts.color,
              onRun: () => setOpenMenu(openMenu === 'color' ? null : 'color'),
            },
            <span className="docai-tcolorwrap">
              <Type size={16} />
              <span className="docai-tcolorbar" style={{ background: ts.color || '#111827' }} />
            </span>,
          )}
          {openMenu === 'color' && (
            <div className="docai-tpalette" role="menu">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="docai-swatch"
                  style={{ background: c }}
                  aria-label={`${t('ai.doc.create.tb_color')} ${c}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setColor(c).run();
                    setOpenMenu(null);
                  }}
                />
              ))}
              <button
                type="button"
                className="docai-swatch docai-swatch-reset"
                aria-label={`${t('ai.doc.create.tb_color')} — reset`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setOpenMenu(null);
                }}
              >
                <Eraser size={13} />
              </button>
            </div>
          )}
        </div>
        <div className="docai-tpop">
          {btn(
            {
              title: t('ai.doc.create.tb_highlight'),
              active: openMenu === 'highlight' || editor.isActive('highlight'),
              onRun: () => setOpenMenu(openMenu === 'highlight' ? null : 'highlight'),
            },
            <Highlighter size={16} />,
          )}
          {openMenu === 'highlight' && (
            <div className="docai-tpalette" role="menu">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="docai-swatch"
                  style={{ background: c }}
                  aria-label={`${t('ai.doc.create.tb_highlight')} ${c}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().toggleHighlight({ color: c }).run();
                    setOpenMenu(null);
                  }}
                />
              ))}
              <button
                type="button"
                className="docai-swatch docai-swatch-reset"
                aria-label={`${t('ai.doc.create.tb_highlight')} — reset`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().unsetHighlight().run();
                  setOpenMenu(null);
                }}
              >
                <Eraser size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="docai-tsep" />

      <div className="docai-tgroup">
        {btn(
          { title: t('ai.doc.create.tb_bullet'), active: editor.isActive('bulletList'), onRun: () => editor.chain().focus().toggleBulletList().run() },
          <List size={16} />,
        )}
        {btn(
          {
            title: t('ai.doc.create.tb_numbered'),
            active: editor.isActive('orderedList'),
            onRun: () => editor.chain().focus().toggleOrderedList().run(),
          },
          <ListOrdered size={16} />,
        )}
        {btn(
          { title: t('ai.doc.create.tb_outdent'), onRun: () => editor.chain().focus().indentLess().run() },
          <IndentDecrease size={16} />,
        )}
        {btn(
          { title: t('ai.doc.create.tb_indent'), onRun: () => editor.chain().focus().indentMore().run() },
          <IndentIncrease size={16} />,
        )}
      </div>

      <div className="docai-tsep" />

      <div className="docai-tgroup">
        {btn(
          { title: t('ai.doc.create.tb_left'), active: editor.isActive({ textAlign: 'left' }), onRun: () => editor.chain().focus().setTextAlign('left').run() },
          <AlignLeft size={16} />,
        )}
        {btn(
          {
            title: t('ai.doc.create.tb_center'),
            active: editor.isActive({ textAlign: 'center' }),
            onRun: () => editor.chain().focus().setTextAlign('center').run(),
          },
          <AlignCenter size={16} />,
        )}
        {btn(
          {
            title: t('ai.doc.create.tb_right'),
            active: editor.isActive({ textAlign: 'right' }),
            onRun: () => editor.chain().focus().setTextAlign('right').run(),
          },
          <AlignRight size={16} />,
        )}
        {btn(
          {
            title: t('ai.doc.create.tb_justify'),
            active: editor.isActive({ textAlign: 'justify' }),
            onRun: () => editor.chain().focus().setTextAlign('justify').run(),
          },
          <AlignJustify size={16} />,
        )}
      </div>

      <div className="docai-tsep" />

      <div className="docai-tgroup">
        {btn(
          {
            title: t('ai.doc.create.tb_table'),
            onRun: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
          },
          <TableIcon size={16} />,
        )}
        {btn(
          { title: t('ai.doc.create.tb_divider'), onRun: () => editor.chain().focus().setHorizontalRule().run() },
          <Minus size={16} />,
        )}
        {btn(
          {
            title: t('ai.doc.create.tb_clear'),
            onRun: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
          },
          <Eraser size={16} />,
        )}
      </div>

      {inTable && (
        <div className="docai-tgroup docai-ttable">
          {btn({ title: '+ Baris', onRun: () => editor.chain().focus().addRowAfter().run() }, <Rows3 size={16} />)}
          {btn({ title: '+ Kolom', onRun: () => editor.chain().focus().addColumnAfter().run() }, <Columns3 size={16} />)}
          {btn({ title: 'Hapus tabel', onRun: () => editor.chain().focus().deleteTable().run() }, <Trash2 size={16} />)}
        </div>
      )}
    </div>
  );
};

export default DocEditor;
