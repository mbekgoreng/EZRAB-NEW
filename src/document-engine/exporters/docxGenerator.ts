import {
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
} from 'docx';
import fileSaver from 'file-saver';
const saveAs = (fileSaver as any)?.saveAs || fileSaver;
import type { DocumentDefinition, DocumentData, RenderedDocument } from '../types';
import { renderDocument } from '../renderer';

export const generateDocx = async (
  definition: DocumentDefinition,
  data: DocumentData,
  renderedDoc?: RenderedDocument,
  revision?: number
): Promise<Blob> => {
  const rendered = renderedDoc || renderDocument(definition, data);
  const revNum = revision !== undefined ? revision : data.revision !== undefined ? data.revision : 0;
  const revStr = `REV ${String(revNum).padStart(2, '0')}`;

  // 1. Parameter / Field Rows Table
  const fieldRows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 3500, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: 'Parameter / Ketentuan', bold: true })] })],
        }),
        new TableCell({
          width: { size: 6000, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: 'Keterangan Nilai', bold: true })] })],
        }),
      ],
    }),
    ...definition.fields.map((f) => {
      const val = String(data.project[f.id as keyof typeof data.project] ?? '—');
      return new TableRow({
        children: [
          new TableCell({
            width: { size: 3500, type: WidthType.DXA },
            children: [new Paragraph(f.label)],
          }),
          new TableCell({
            width: { size: 6000, type: WidthType.DXA },
            children: [new Paragraph(val)],
          }),
        ],
      });
    }),
  ];

  const fieldsTable = new Table({
    width: { size: 9500, type: WidthType.DXA },
    rows: fieldRows,
  });

  // 2. Data Tables if rendered has tables
  const dataTableChildren: Paragraph[] = [];
  let dataTable: Table | null = null;

  if (rendered.tables && rendered.tables.length > 0 && rendered.tableColumns && rendered.tableColumns.length > 0) {
    dataTableChildren.push(
      new Paragraph({ text: '' }),
      new Paragraph({
        text: 'LAMPIRAN DATA UTAMA',
        heading: HeadingLevel.HEADING_2,
      })
    );

    const dataHeaderRow = new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: rendered.tableColumns.map(
        (col) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: col.label, bold: true })] })],
          })
      ),
    });

    const dataBodyRows = rendered.tables.map(
      (row) =>
        new TableRow({
          cantSplit: true,
          children: rendered.tableColumns!.map((col) => {
            const rawVal = row[col.key];
            const val = typeof rawVal === 'number' ? rawVal.toLocaleString('id-ID') : String(rawVal ?? '—');
            return new TableCell({
              children: [new Paragraph(val)],
            });
          }),
        })
    );

    dataTable = new Table({
      width: { size: 9500, type: WidthType.DXA },
      rows: [dataHeaderRow, ...dataBodyRows],
    });
  }

  // 3. Signature Block
  const sig = rendered.signatures[0];
  const signatoryName = sig?.name && !sig.isPlaceholder ? sig.name : 'Nama Penandatangan';
  const signatoryPosition = sig?.position || 'Direktur Utama';

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${data.company.name || 'EZRAB CONSTRUCTION'} · ${definition.name}`,
                    bold: true,
                    color: '2563EB',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${data.project.projectName || 'Project'} · No: ${definition.code} · ${revStr}`,
                    color: '94A3B8',
                    size: 16,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            text: definition.name,
            heading: HeadingLevel.TITLE,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `No. Dokumen: ${definition.code}   |   ${revStr}   |   Kategori: ${definition.category}   |   ${rendered.metadata.date}`,
                color: '64748B',
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: 'INFORMASI PROYEK',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Nama Proyek   : ', bold: true }),
              new TextRun(data.project.projectName || '—'),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Pemilik/Owner : ', bold: true }),
              new TextRun(data.project.owner || '—'),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Kontraktor    : ', bold: true }),
              new TextRun(data.project.contractor || data.company.name || '—'),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Lokasi Proyek : ', bold: true }),
              new TextRun(data.project.location || '—'),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: 'RINCIAN PERSYARATAN & PARAMETER',
            heading: HeadingLevel.HEADING_2,
          }),
          fieldsTable,
          ...dataTableChildren,
          ...(dataTable ? [dataTable] : []),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({
                text: `${data.project.location || 'Tempat'}, ${rendered.metadata.date}`,
              }),
            ],
          }),
          new Paragraph('Hormat kami,'),
          new Paragraph({
            children: [
              new TextRun({
                text: data.company.name || data.project.contractor || 'Penyedia Jasa / Kontraktor',
                bold: true,
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun('____________________________'),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: signatoryName, bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: signatoryPosition, color: '64748B' }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
};

export const downloadDocx = async (
  definition: DocumentDefinition,
  data: DocumentData,
  renderedDoc?: RenderedDocument,
  revision?: number
) => {
  const revNum = revision !== undefined ? revision : data.revision !== undefined ? data.revision : 0;
  const revStr = `REV${String(revNum).padStart(2, '0')}`;
  const cleanProject = (data.project.projectName || 'PROJECT').replace(/[^a-z0-9]+/gi, '-');
  const filename = `${definition.code}_${cleanProject}_${revStr}.docx`;
  const blob = await generateDocx(definition, data, renderedDoc, revision);
  saveAs(blob, filename);
};