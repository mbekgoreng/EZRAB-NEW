import type { DocumentData, DocumentDefinition, ProjectMasterData } from './types';

export type BlockType = 
  | 'paragraph' 
  | 'heading' 
  | 'table' 
  | 'image' 
  | 'signature' 
  | 'pageBreak' 
  | 'header' 
  | 'footer' 
  | 'variable';

export interface BaseBlock {
  id: string;
  type: BlockType;
  order: number;
}

export interface ParagraphBlock extends BaseBlock {
  type: 'paragraph';
  content: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  text: string;
  level: 1 | 2 | 3 | 4;
  align?: 'left' | 'center' | 'right';
}

export interface TableColumn {
  key: string;
  label: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface TableBlock extends BaseBlock {
  type: 'table';
  columns: TableColumn[];
  rows: Array<Record<string, unknown>>;
  caption?: string;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  align?: 'left' | 'center' | 'right';
}

export interface SignatureBlock extends BaseBlock {
  type: 'signature';
  signatories: Array<{
    name: string;
    position: string;
    organization?: string;
    signatureImage?: string;
    date?: string;
  }>;
}

export interface PageBreakBlock extends BaseBlock {
  type: 'pageBreak';
}

export interface HeaderBlock extends BaseBlock {
  type: 'header';
  companyName: string;
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
  dividerLine?: boolean;
}

export interface FooterBlock extends BaseBlock {
  type: 'footer';
  text: string;
  pageNumbering?: boolean;
}

export interface VariableBlock extends BaseBlock {
  type: 'variable';
  variableName: string;
  fallbackValue?: string;
}

export type DocumentBlock = 
  | ParagraphBlock 
  | HeadingBlock 
  | TableBlock 
  | ImageBlock 
  | SignatureBlock 
  | PageBreakBlock 
  | HeaderBlock 
  | FooterBlock 
  | VariableBlock;

export interface CanonicalDocument {
  id: string;
  projectId: string;
  documentType: string;
  templateId: string;
  title: string;
  blocks: DocumentBlock[];
  sourceSnapshotHash: string;
  userFields: Record<string, unknown>;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Generate a unique block ID
 */
export function generateBlockId(): string {
  return 'blk_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Build default canonical blocks for a document based on its definition & template body
 */
export function buildDefaultCanonicalBlocks(
  definition: DocumentDefinition,
  data?: DocumentData,
  userFields?: Record<string, unknown>
): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  let order = 1;

  // 1. Header block
  const companyName = data?.company?.name || data?.project?.companyName || 'PT. KONTRAKTOR UTAMA';
  blocks.push({
    id: generateBlockId(),
    type: 'header',
    order: order++,
    companyName,
    address: data?.company?.address || data?.project?.companyAddress,
    phone: data?.company?.phone || data?.project?.companyPhone,
    email: data?.company?.email || data?.project?.companyEmail,
    logo: data?.company?.logo || data?.project?.companyLogo,
    dividerLine: true,
  });

  // 2. Title Heading
  blocks.push({
    id: generateBlockId(),
    type: 'heading',
    order: order++,
    text: definition.name.toUpperCase(),
    level: 1,
    align: 'center',
  });

  // 3. Document body paragraphs from templateBody if available
  if (definition.templateBody) {
    const lines = definition.templateBody.split('\n\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Check if it's a section header (all caps or starts with roman numeral / number)
      if (/^[0-9IVXLCDM]+\.\s+[A-Z\s]+$/.test(line.trim()) || (line.trim().length < 50 && line.trim() === line.trim().toUpperCase() && !line.includes(':'))) {
        blocks.push({
          id: generateBlockId(),
          type: 'heading',
          order: order++,
          text: line.trim(),
          level: 2,
          align: 'left',
        });
      } else {
        blocks.push({
          id: generateBlockId(),
          type: 'paragraph',
          order: order++,
          content: line.trim(),
          align: 'left',
        });
      }
    }
  } else {
    blocks.push({
      id: generateBlockId(),
      type: 'paragraph',
      order: order++,
      content: `Dokumen ${definition.name} untuk pekerjaan {{project.name}}, berlokasi di {{project.location}}.`,
      align: 'left',
    });
  }

  // 4. If table data exists in data (e.g. rab, boq, schedule, ahsp)
  if (data?.rab && data.rab.length > 0 && ['rab', 'boq'].includes(definition.id)) {
    blocks.push({
      id: generateBlockId(),
      type: 'table',
      order: order++,
      caption: `Rincian ${definition.name}`,
      columns: [
        { key: 'no', label: 'No', width: 40, align: 'center' },
        { key: 'uraian', label: 'Uraian Pekerjaan', align: 'left' },
        { key: 'volume', label: 'Vol', width: 60, align: 'right' },
        { key: 'satuan', label: 'Sat', width: 60, align: 'center' },
        { key: 'hargaSatuan', label: 'Harga Satuan (Rp)', width: 120, align: 'right' },
        { key: 'total', label: 'Jumlah (Rp)', width: 130, align: 'right' },
      ],
      rows: data.rab.map((item, idx) => ({
        no: idx + 1,
        uraian: item.description || item.uraian || item.taskName || '-',
        volume: item.volume || 1,
        satuan: item.unit || item.satuan || 'ls',
        hargaSatuan: Number(item.unitPrice || item.hargaSatuan || 0).toLocaleString('id-ID'),
        total: Number(item.totalPrice || item.total || 0).toLocaleString('id-ID'),
      })),
    });
  }

  // 5. Signature block
  const signatoryName = userFields?.['signatory.name'] || userFields?.['director_name'] || data?.company?.signatory || data?.project?.director || 'Direktur Utama';
  const signatoryPosition = userFields?.['signatory.position'] || userFields?.['director_position'] || data?.company?.signatoryPosition || 'Direktur';

  blocks.push({
    id: generateBlockId(),
    type: 'signature',
    order: order++,
    signatories: [
      {
        name: String(signatoryName),
        position: String(signatoryPosition),
        organization: companyName,
      },
    ],
  });

  return blocks;
}

/**
 * Create a fresh CanonicalDocument from definition, sourceContext, and template
 */
export function createCanonicalDocument(params: {
  id?: string;
  projectId: string;
  definition: DocumentDefinition;
  templateId?: string;
  sourceSnapshotHash?: string;
  userFields?: Record<string, unknown>;
  revision?: number;
  blocks?: DocumentBlock[];
  data?: DocumentData;
}): CanonicalDocument {
  const templateId = params.templateId || params.definition.templateId || params.definition.id;
  const blocks = params.blocks || buildDefaultCanonicalBlocks(params.definition, params.data, params.userFields);

  return {
    id: params.id || `cdoc_${params.definition.id}_${Date.now()}`,
    projectId: params.projectId,
    documentType: params.definition.id,
    templateId,
    title: params.definition.name,
    blocks,
    sourceSnapshotHash: params.sourceSnapshotHash || '',
    userFields: params.userFields || {},
    revision: params.revision !== undefined ? params.revision : 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Render Canonical Document blocks to resolved text, replacing variables safely
 */
export function resolveCanonicalDocumentText(
  doc: CanonicalDocument,
  contextData: Record<string, string>
): string {
  const parts: string[] = [];

  for (const block of doc.blocks) {
    if (block.type === 'heading') {
      let headingText = block.text;
      for (const [k, v] of Object.entries(contextData)) {
        headingText = headingText.split(`{{${k}}}`).join(v);
      }
      parts.push(`\n# ${headingText}\n`);
    } else if (block.type === 'paragraph') {
      let resolved = block.content;
      for (const [k, v] of Object.entries(contextData)) {
        resolved = resolved.split(`{{${k}}}`).join(v);
      }
      parts.push(resolved);
    } else if (block.type === 'variable') {
      const val = contextData[block.variableName] || block.fallbackValue || `[${block.variableName}]`;
      parts.push(val);
    } else if (block.type === 'signature') {
      if (Array.isArray((block as any).signatories)) {
        for (const sig of (block as any).signatories) {
          let sName = sig.name || '';
          let sPos = sig.position || '';
          for (const [k, v] of Object.entries(contextData)) {
            sName = sName.split(`{{${k}}}`).join(v);
            sPos = sPos.split(`{{${k}}}`).join(v);
          }
          parts.push(`\nPenandatangan: ${sName} (${sPos})`);
        }
      } else {
        let sName = (block as any).name || '';
        let sTitle = (block as any).title || (block as any).position || '';
        for (const [k, v] of Object.entries(contextData)) {
          sName = sName.split(`{{${k}}}`).join(v);
          sTitle = sTitle.split(`{{${k}}}`).join(v);
        }
        parts.push(`\nPenandatangan: ${sName} (${sTitle})`);
      }
    }
  }

  return parts.join('\n\n');
}

/**
 * Compute hash of canonical blocks to detect edits
 */
export function computeCanonicalContentHash(blocks: DocumentBlock[]): string {
  let str = '';
  for (const b of blocks) {
    if (b.type === 'paragraph') str += b.content;
    else if (b.type === 'heading') str += b.text;
    else if (b.type === 'table') str += JSON.stringify(b.rows);
  }
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return 'cblock-' + Math.abs(hash).toString(16);
}
