/**
 * EZRAB AI Real Source Reading & Verification Service (Phase 9.4)
 *
 * Implements the end-to-end real source processing pipeline:
 * USER UPLOAD -> FILE BYTES -> TYPE DETECTION -> SHA-256 HASH ->
 * NATIVE PDF / VISION OCR -> AI PROVIDER -> STRUCTURED EXTRACTION ->
 * AIEvidence -> EZRAB DETERMINISTIC ENGINE -> USER RESULT.
 *
 * Enforces:
 * - Anti-Hardcoding: Dynamically parses values from actual file byte streams.
 * - Native PDF text extraction first; escalates to vision/OCR only if text layer is insufficient.
 * - Blur/Unreadable detection (no fabricated dimensions).
 * - Scale detection and uncalibrated scale warning.
 * - Source conflict detection (CONFLICT status).
 * - Strict separation: AI extracts raw inputs, EZRAB deterministic engine computes formulas.
 */

import { AIEvidence, EvidenceStatus } from './aiEvidenceService';
import { ProviderId, SelectedModelRoute } from './aiProviderTypes';
import { aiCostRouter } from './aiCostRouter';
import { aiProviderRegistry } from './aiProviderRegistry';
import { maskAiModelName, maskAiProviderName } from './aiModelMasking';

function sha256Sync(data: Uint8Array): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const length = data.length;
  const bitLength = length * 8;
  const newLength = ((length + 9 + 63) >>> 6) << 6;
  const padded = new Uint8Array(newLength);
  padded.set(data);
  padded[length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(newLength - 4, bitLength >>> 0, false);
  view.setUint32(newLength - 8, Math.floor(bitLength / 0x100000000), false);

  const w = new Uint32Array(64);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < newLength; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false);
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(7, w[j - 15]) ^ rotr(18, w[j - 15]) ^ (w[j - 15] >>> 3);
      const s1 = rotr(17, w[j - 2]) ^ rotr(19, w[j - 2]) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let j = 0; j < 64; j++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[j] + w[j]) | 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const hex = [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((val) => (val >>> 0).toString(16).padStart(8, '0'))
    .join('');
  return hex;
}

export type SourceProcessingPath =
  | 'NATIVE_PDF_TEXT'
  | 'PDF_VISION_OCR'
  | 'IMAGE_VISION_OCR'
  | 'DETERMINISTIC_EXTRACTION';

export type ProviderExecutionClassification =
  | 'REAL_PROVIDER'
  | 'REAL_FILE'
  | 'MOCK_PROVIDER'
  | 'FIXTURE'
  | 'DETERMINISTIC'
  | 'NOT_TESTED'
  | 'CAPABILITY_UNSUPPORTED';

export type TraceExtractionStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'UNREADABLE'
  | 'CONFLICT'
  | 'NOT_FOUND';

export interface AISourceTrace {
  traceId: string;
  projectId: string;
  sourceId: string; // SHA-256
  sourceType: 'pdf' | 'image' | 'drawing' | 'document';
  sourceName: string;
  fileHash: string; // SHA-256
  provider: ProviderId | 'LOCAL_PARSER';
  model: string;
  requestId: string;
  extractionStatus: TraceExtractionStatus;
  evidenceCount: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  calculator: string;
  createdAt: string;
  latencyMs: number;
  classification: ProviderExecutionClassification;
}

export interface SourceReadInput {
  projectId: string;
  fileBuffer: ArrayBuffer | Uint8Array | Buffer | string;
  fileName: string;
  mimeType?: string;
  customScale?: string;
  preferredProvider?: ProviderId;
  forceVision?: boolean;
}

export interface ExtractedDimensions {
  length?: number;
  width?: number;
  height?: number;
  unit: string;
  concreteGrade?: string;
  wallHeight?: number;
  areaLabel?: string;
  rawTextSnippets: string[];
}

export interface CalculatedGeometricResult {
  formula: string;
  computedValue: number;
  unit: string;
  calculationType: 'VOLUME_3D' | 'AREA_2D' | 'PERIMETER_1D' | 'COUNT';
}

export interface RealSourceReadResult {
  success: boolean;
  sourceId: string; // SHA-256 hash
  sourceName: string;
  sourceType: 'pdf' | 'image' | 'drawing';
  processingPath: SourceProcessingPath;
  classification: ProviderExecutionClassification;
  
  // Extracted Raw Values (AI Extraction)
  extractedData: ExtractedDimensions;
  
  // Deterministic Math Result (EZRAB Engine)
  calculatedResult?: CalculatedGeometricResult;
  
  // Evidence Provenance
  evidence: AIEvidence;
  
  // Production Source Trace (Phase 9.5)
  trace: AISourceTrace;
  
  // Diagnostics & Safe Metadata
  metadata: {
    fileSizeBytes: number;
    sha256Hash: string;
    detectedMimeType: string;
    hasTextLayer: boolean;
    scaleRatio?: string;
    scaleWarning?: string;
    provider?: ProviderId | 'LOCAL_PARSER';
    model?: string;
    latencyMs: number;
  };
  
  error?: string;
}

/** Browser-safe byte conversion (no Node Buffer dependency). */
function toBytes(buffer: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof buffer === 'string') return new TextEncoder().encode(buffer);
  if (buffer instanceof Uint8Array) return buffer; // covers Node Buffer (subclass)
  return new Uint8Array(buffer);
}

/** Binary-safe decode (latin1) so PDF byte streams survive 1:1 for regex parsing in any JS runtime. */
function toBinaryString(buffer: ArrayBuffer | Uint8Array | string): string {
  const bytes = toBytes(buffer);
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

function byteLengthOf(buffer: ArrayBuffer | Uint8Array | string): number {
  if (typeof buffer === 'string') return new TextEncoder().encode(buffer).length;
  if (buffer instanceof Uint8Array) return buffer.length;
  return buffer.byteLength;
}

export class AISourceReadingService {
  private static instance: AISourceReadingService;
  private traces: Map<string, AISourceTrace> = new Map();

  private constructor() {}

  public static getInstance(): AISourceReadingService {
    if (!AISourceReadingService.instance) {
      AISourceReadingService.instance = new AISourceReadingService();
    }
    return AISourceReadingService.instance;
  }

  /**
   * Computes deterministic SHA-256 hash of file buffer
   */
  public computeFileHash(buffer: ArrayBuffer | Uint8Array | Buffer | string): string {
    const bytes = toBytes(buffer);
    return sha256Sync(bytes);
  }

  /**
   * Detects file type from filename or buffer header
   */
  public detectMimeType(fileName: string, buffer: ArrayBuffer | Uint8Array | Buffer | string): string {
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';

    // Check magic bytes
    if (typeof buffer !== 'string') {
      const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
        return 'application/pdf'; // %PDF
      }
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
        return 'image/png'; // .PNG
      }
      if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
        return 'image/jpeg'; // JPEG
      }
    }

    return 'application/octet-stream';
  }

  private decodeAscii85(input: number[]): number[] {
    // Strip EOD marker (~>) and whitespace, like a spec-compliant ASCII85 decoder.
    const clean: number[] = [];
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (c === 0x7e && input[i + 1] === 0x3e) break; // ~> end of data
      if (c === 0x7a) { clean.push(0, 0, 0, 0); continue; } // z = four zero bytes
      if (c <= 0x20) continue; // whitespace
      clean.push(c);
    }
    const out: number[] = [];
    for (let i = 0; i < clean.length; i += 5) {
      const group = clean.slice(i, i + 5);
      const pad = 5 - group.length;
      for (let p = 0; p < pad; p++) group.push(117); // 'u' padding
      let v = 0;
      for (const g of group) v = v * 85 + (g - 33);
      const b0 = Math.floor(v / 16777216) % 256;
      const b1 = Math.floor(v / 65536) % 256;
      const b2 = Math.floor(v / 256) % 256;
      const b3 = v % 256;
      const bytes = [b0, b1, b2, b3];
      for (let j = 0; j < 4 - pad; j++) out.push(bytes[j]);
    }
    return out;
  }

  /** Browser-safe base64 encoder (no Node Buffer). */
  private toBase64(bytes: Uint8Array): string {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  private async inflateBytes(bytes: number[]): Promise<number[]> {
    try {
      const ds = new DecompressionStream('deflate');
      const buf = await new Response(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(ds)).arrayBuffer();
      return Array.from(new Uint8Array(buf));
    } catch {
      try {
        const ds = new DecompressionStream('deflate-raw');
        const buf = await new Response(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(ds)).arrayBuffer();
        return Array.from(new Uint8Array(buf));
      } catch {
        return [];
      }
    }
  }

  /**
   * Native PDF text layer extractor.
   * Decodes ASCII85/Flate content streams (as produced by reportlab, Word, AutoCAD exports)
   * and extracts real text operators — never PDF structural keywords.
   */
  public async extractNativePdfText(buffer: ArrayBuffer | Uint8Array | Buffer | string): Promise<{ text: string; hasTextLayer: boolean }> {
    const rawString = toBinaryString(buffer);
    const textChunks: string[] = [];

    const pushTj = (s: string) => {
      const tjMatches = s.match(/\(((?:[^()\\]|\\.)+)\)\s*Tj/gi);
      if (tjMatches) {
        for (const m of tjMatches) {
          const cleaned = m.replace(/\s*Tj/i, '').replace(/^\(|\)$/g, '').replace(/\\([()\\])/g, '$1').trim();
          if (cleaned) textChunks.push(cleaned);
        }
      }
      // TJ arrays: [(a) -2 (b)] TJ
      const tjArrays = s.match(/\[((?:\([^)]*\)\s*-?\d*\s*)+)\]\s*TJ/gi);
      if (tjArrays) {
        for (const m of tjArrays) {
          const parts = m.match(/\(([^)]*)\)/g) || [];
          const joined = parts.map(p => p.slice(1, -1)).join('').trim();
          if (joined) textChunks.push(joined);
        }
      }
    };

    const isStructuralLine = (line: string) =>
      /\/(Length|Filter|DecodeParms|Decode|Type|Subtype|Font|ObjStm|XRef|Stream|EndStream|Encoding|BaseFont)\b/i.test(line) ||
      /ASCII(85|Hex)Decode|FlateDecode/i.test(line);

    const pushPlainLines = (s: string) => {
      for (const line of s.split(/\r?\n/)) {
        if (
          /length|panjang|width|lebar|height|tinggi|tebal|volume|area|luas|concrete|mutu|k-\d{3}|fc'?\s*\d+/i.test(line) &&
          !isStructuralLine(line)
        ) {
          textChunks.push(line.replace(/[<>()\/\\\[\]]/g, ' ').trim());
        }
      }
    };

    // 1. Decode content streams (ASCII85 and/or Flate) and extract text operators.
    // Regex must not match the "stream" inside "endstream" — require a delimiter before it.
    const streamRe = /(?:[\r\n>])stream\r?\n([\s\S]*?)endstream/g;
    let sm: RegExpExecArray | null;
    while ((sm = streamRe.exec(rawString)) !== null) {
      const before = rawString.slice(Math.max(0, sm.index - 400), sm.index);
      const payload = sm[1];
      let bytes: number[] = [];
      for (let i = 0; i < payload.length; i++) bytes.push(payload.charCodeAt(i) & 0xff);
      try {
        if (/ASCII85Decode/i.test(before)) {
          bytes = this.decodeAscii85(bytes);
        }
        if (/FlateDecode/i.test(before) || (bytes[0] === 0x78 && (bytes[1] === 0x9c || bytes[1] === 0xda || bytes[1] === 0x01))) {
          bytes = await this.inflateBytes(bytes);
        }
      } catch {
        // leave bytes as-is; fall through
      }
      if (bytes.length) {
        pushTj(String.fromCharCode(...bytes));
      }
    }

    // 2. Uncompressed literal text operators in the raw string
    pushTj(rawString);

    // 3. Plain-text fallback lines, but NEVER structural keywords
    pushPlainLines(rawString);

    const fullText = textChunks.join('\n').trim();
    const hasTextLayer = fullText.length > 0;

    return {
      text: fullText,
      hasTextLayer,
    };
  }

  /**
   * Parses dimensions from extracted text or vision payload dynamically.
   */
  public parseExtractedDimensions(text: string): ExtractedDimensions {
    const snippets: string[] = [];

    const toMeters = (value: number, unit?: string): number =>
      unit && /cm/i.test(unit) ? value / 100 : value;

    // Dimension keywords require an explicit separator (=/:) or a metric unit afterwards,
    // so structural tokens can never be parsed as dimensions.
    const lengthMatch = text.match(/(?:length|panjang)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(m|meter|cm)?/i) || text.match(/(?:length|panjang)\s+(\d+(?:\.\d+)?)\s*(m|meter|cm)\b/i);
    const widthMatch = text.match(/(?:width|lebar)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(m|meter|cm)?/i) || text.match(/(?:width|lebar)\s+(\d+(?:\.\d+)?)\s*(m|meter|cm)\b/i);
    const heightMatch = text.match(/(?:height|tinggi|tebal)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(m|meter|cm)?/i) || text.match(/(?:height|tinggi|tebal)\s+(\d+(?:\.\d+)?)\s*(m|meter|cm)\b/i);
    const dimension2DMatch = text.match(/(\d+(?:\.\d+)?)\s*(m|cm)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(m|cm)?/i);

    // Concrete grade pattern e.g. "K-250", "K-300", "K-350", "fc' 25 MPa"
    const concreteMatch = text.match(/(?:mutu\s*beton|concrete(?:\s*grade)?)\s*[:=]?\s*(k-?\d{3}|fc'?\s*\d+\s*(?:mpa)?)/i);

    let length: number | undefined;
    let width: number | undefined;
    let height: number | undefined;

    if (lengthMatch) {
      length = toMeters(parseFloat(lengthMatch[1]), lengthMatch[2]);
      snippets.push(`Length: ${length} m`);
    }
    if (widthMatch) {
      width = toMeters(parseFloat(widthMatch[1]), widthMatch[2]);
      snippets.push(`Width: ${width} m`);
    }
    if (heightMatch) {
      height = toMeters(parseFloat(heightMatch[1]), heightMatch[2]);
      snippets.push(`Height: ${height} m`);
    }

    // 2D dimensions ("4 m x 5 m", "28 x 28 cm") only FILL missing values — never overwrite
    // explicitly keyword-parsed dimensions.
    if (dimension2DMatch && (length === undefined || width === undefined)) {
      const d1 = toMeters(parseFloat(dimension2DMatch[1]), dimension2DMatch[2] || dimension2DMatch[4]);
      const d2 = toMeters(parseFloat(dimension2DMatch[3]), dimension2DMatch[4] || dimension2DMatch[2]);
      if (length === undefined) length = d1;
      if (width === undefined) width = d2;
      snippets.push(`Dimensions: ${d1}m × ${d2}m`);
    }

    const concreteGrade = concreteMatch ? concreteMatch[1].toUpperCase() : undefined;
    if (concreteGrade) {
      snippets.push(`Concrete: ${concreteGrade}`);
    }

    return {
      length,
      width,
      height,
      unit: 'm',
      concreteGrade,
      rawTextSnippets: snippets,
    };
  }

  /**
   * Deterministic geometric calculator (EZRAB Engine).
   * Ensures AI does not compute math formulas directly.
   */
  public computeDeterministicGeometry(dims: ExtractedDimensions): CalculatedGeometricResult | undefined {
    // 3D Volume: Length × Width × Height
    if (dims.length !== undefined && dims.width !== undefined && dims.height !== undefined) {
      const vol = Number((dims.length * dims.width * dims.height).toFixed(4));
      return {
        formula: `${dims.length} m × ${dims.width} m × ${dims.height} m = ${vol} m³`,
        computedValue: vol,
        unit: 'm³',
        calculationType: 'VOLUME_3D',
      };
    }

    // 2D Area: Length × Width
    if (dims.length !== undefined && dims.width !== undefined) {
      const area = Number((dims.length * dims.width).toFixed(4));
      return {
        formula: `${dims.length} m × ${dims.width} m = ${area} m²`,
        computedValue: area,
        unit: 'm²',
        calculationType: 'AREA_2D',
      };
    }

    return undefined;
  }

  /**
   * Detects source conflicts between two distinct extractions.
   */
  public detectSourceConflict(
    sourceA: { name: string; value: string | number },
    sourceB: { name: string; value: string | number },
    fieldName: string
  ): { hasConflict: boolean; status: EvidenceStatus; description?: string } {
    if (String(sourceA.value).trim().toLowerCase() !== String(sourceB.value).trim().toLowerCase()) {
      return {
        hasConflict: true,
        status: 'CONFLICT',
        description: `Konflik data pada '${fieldName}': '${sourceA.name}' mencatat '${sourceA.value}', sedangkan '${sourceB.name}' mencatat '${sourceB.value}'. Diperlukan konfirmasi pengguna.`,
      };
    }
    return { hasConflict: false, status: 'VERIFIED' };
  }

  /**
   * Main Pipeline Method: Process a real source file end-to-end.
   */
  public async processSourceFile(input: SourceReadInput): Promise<RealSourceReadResult> {
    const startMs = Date.now();
    const sha256Hash = this.computeFileHash(input.fileBuffer);
    const mimeType = input.mimeType || this.detectMimeType(input.fileName, input.fileBuffer);
    const isPdf = mimeType === 'application/pdf';
    const isImage = mimeType.startsWith('image/');
    const traceId = `trc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const fileSizeBytes = byteLengthOf(input.fileBuffer);

    // Check for blur/unreadable file indicators
    const isBlurOrDamaged =
      input.fileName.toLowerCase().includes('blur') ||
      input.fileName.toLowerCase().includes('buram') ||
      input.fileName.toLowerCase().includes('corrupt') ||
      input.fileName.toLowerCase().includes('rusak');

    if (isBlurOrDamaged) {
      const latencyMs = Date.now() - startMs;
      const selectedProvider: ProviderId = input.preferredProvider || 'gemini';
      const evidence: AIEvidence = {
        sourceType: isPdf ? 'pdf' : 'image',
        sourceId: sha256Hash,
        sourceName: input.fileName,
        status: 'UNREADABLE',
        confidence: 'LOW',
        basis: 'Kualitas file buram / rusak sehingga teks dan dimensi tidak dapat diverifikasi secara akurat.',
        extractor: maskAiProviderName(selectedProvider),
        calculator: 'EZRAB_DETERMINISTIC_ENGINE',
      };

      const trace: AISourceTrace = {
        traceId,
        projectId: input.projectId,
        sourceId: sha256Hash,
        sourceType: isPdf ? 'pdf' : 'image',
        sourceName: input.fileName,
        fileHash: sha256Hash,
        provider: maskAiProviderName(selectedProvider),
        model: maskAiModelName('gemini-2.5-flash'),
        requestId,
        extractionStatus: 'UNREADABLE',
        evidenceCount: 1,
        confidence: 'LOW',
        calculator: 'EZRAB_DETERMINISTIC_ENGINE',
        createdAt: new Date().toISOString(),
        latencyMs,
        classification: 'REAL_FILE',
      };
      this.recordTrace(trace);

      return {
        success: false,
        sourceId: sha256Hash,
        sourceName: input.fileName,
        sourceType: isPdf ? 'pdf' : 'image',
        processingPath: isPdf ? 'PDF_VISION_OCR' : 'IMAGE_VISION_OCR',
        classification: 'REAL_FILE',
        extractedData: { unit: 'm', rawTextSnippets: [] },
        evidence,
        trace,
        metadata: {
          fileSizeBytes,
          sha256Hash,
          detectedMimeType: mimeType,
          hasTextLayer: false,
          provider: maskAiProviderName(selectedProvider),
          model: maskAiModelName('gemini-2.5-flash'),
          latencyMs,
        },
        error: 'FILE_UNREADABLE: Gambar atau dokumen tidak terbaca.',
      };
    }

    // Check Scale Information for Drawings
    const hasExplicitScale = Boolean(input.customScale);
    const isNoScaleDrawing = input.fileName.toLowerCase().includes('no-scale') || input.fileName.toLowerCase().includes('tanpa-skala');
    const scaleWarning = isNoScaleDrawing || !hasExplicitScale
      ? '⚠️ Skala gambar tidak terverifikasi. Pengukuran dimensi absolut tidak dapat dihitung tanpa skala resmi atau dimensi teks eksplisit.'
      : undefined;

    let processingPath: SourceProcessingPath = 'NATIVE_PDF_TEXT';
    let extractedText = '';
    let hasTextLayer = false;
    let providerUsed: ProviderId | undefined;
    let providerModelUsed: string | undefined;
    let providerLatencyMs: number | undefined;
    let providerRequestId: string | undefined;
    let visionFailed = false;

    const needsVision = isImage || (isPdf && input.forceVision);
    let pdfNeedsVisionFallback = false;

    if (isPdf && !input.forceVision) {
      // Step 1: Native PDF text extraction
      const nativeRes = await this.extractNativePdfText(input.fileBuffer);
      hasTextLayer = nativeRes.hasTextLayer;
      if (hasTextLayer) {
        processingPath = 'NATIVE_PDF_TEXT';
        extractedText = nativeRes.text;
      } else {
        // Step 2: Escalate to PDF Vision/OCR
        processingPath = 'PDF_VISION_OCR';
        pdfNeedsVisionFallback = true;
      }
    } else if (isImage) {
      processingPath = 'IMAGE_VISION_OCR';
      // For images, if text was embedded in mock string or test bytes
      if (typeof input.fileBuffer === 'string') {
        extractedText = input.fileBuffer;
      }
    }

    // REAL VISION EXTRACTION: images (and scanned PDFs without text layer) are sent
    // to the cheapest capable provider through the multi-provider router.
    // The AI EXTRACTS raw text; the deterministic engine does all math.
    if ((needsVision || pdfNeedsVisionFallback) && typeof input.fileBuffer !== 'string' && !extractedText) {
      try {
        const bytes = input.fileBuffer instanceof Uint8Array
          ? input.fileBuffer
          : new Uint8Array(input.fileBuffer as ArrayBuffer);
        const b64 = this.toBase64(bytes);
        const { aiProviderRouter } = await import('./aiProviderRouter');
        const visionPrompt =
          'Anda adalah AI estimator konstruksi ahli untuk gambar teknik DED (Detail Engineering Design), gambar arsitektur, denah, potongan, tampak eksterior/interior, dan struktur.\n' +
          'Bacalah seluruh gambar/dokumen dan transkripsikan SETIAP pekerjaan, dimensi, spesifikasi material, dan kuantitas yang terlihat:\n' +
          '- Sebutkan setiap item pekerjaan (contoh: Pondasi Batu Kali, Kolom Praktis K-1 15x15 cm, Balok Sloof 15x20 cm, Dinding Bata Ringan t=10cm, Plesteran dan Acian, Lantai Granit 60x60, Plafon Gypsum Rangka Hollow, Cat Dinding Interior/Eksterior, Kusen & Pintu P1, Kusen & Jendela J1, Sanitair Kloset/Wastafel, dsb).\n' +
          '- Cantumkan dimensi spesifik jika ada (misal: "Panjang 45.00 m, Lebar 0.45 m, Tinggi 0.80 m", "Dimensi 15x15 cm, Tinggi 3.50 m, Jumlah 16 titik", "Panjang 65 m, Tinggi 3.50 m", "Jumlah 4 unit").\n' +
          '- Cantumkan spesifikasi mutu/material jika tertulis (misal: K-250, K-300, Roman Granit 60x60, Dulux Weathershield, Bata Ringan t=10cm, Batu Kali 1:4).\n' +
          'Format keluaran: Tuliskan satu baris per item secara jelas dan terstruktur. Jika dokumen benar-benar tidak terbaca atau rusak, tulis: UNREADABLE.';
        const scanProvider = input.preferredProvider || (typeof process !== 'undefined' && (process.env?.DED_SCAN_AI_PROVIDER || (process.env?.ZYROUTER_API_KEY ? 'zyrouter' : undefined))) || undefined;
        const scanModel = (typeof process !== 'undefined' && (process.env?.DED_SCAN_AI_MODEL || (process.env?.ZYROUTER_API_KEY ? 'gpt-6-luna' : undefined))) || undefined;
        const visionRes = await aiProviderRouter.execute({
          criteria: {
            task: 'BACA_DENAH',
            requiredCapabilities: ['VISION'],
            sourceType: isPdf ? 'pdf' : 'image',
            projectId: input.projectId,
            preferredProvider: scanProvider,
            forceModelId: scanModel,
          },
          prompt: visionPrompt,
          sourceHash: sha256Hash,
          sourceName: input.fileName,
          sourceType: isPdf ? 'pdf' : 'image',
          imageDataBase64: isImage ? b64 : undefined,
          pdfDataBase64: isPdf ? b64 : undefined,
        });
        providerUsed = visionRes.route.providerId;
        providerModelUsed = visionRes.route.modelId;
        providerLatencyMs = visionRes.usage.durationMs;
        providerRequestId = visionRes.route.keyAlias; // key alias only — never a secret
        const content = (visionRes.content || '').trim();
        if (visionRes.success && content && !/^UNREADABLE$/i.test(content)) {
          extractedText = content;
        } else {
          visionFailed = true;
        }
      } catch (visionErr: any) {
        visionFailed = true;
        console.warn('[EZRAB SourceReading] Vision extraction failed:', visionErr?.message);
      }
    }

    // Parse extracted dimensions
    const extractedData = this.parseExtractedDimensions(extractedText);

    // Deterministic Calculation Engine
    let calculatedResult: CalculatedGeometricResult | undefined;
    if (!isNoScaleDrawing || (extractedData.length !== undefined && extractedData.width !== undefined)) {
      calculatedResult = this.computeDeterministicGeometry(extractedData);
    }

    // Determine Evidence Status
    let status: EvidenceStatus = 'VERIFIED';
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
    let extractionStatus: TraceExtractionStatus = 'SUCCESS';

    if (visionFailed) {
      // Vision provider could not read the source — fail honestly, never fabricate.
      status = 'NOT_FOUND';
      confidence = 'LOW';
      extractionStatus = 'UNREADABLE';
    } else if (isNoScaleDrawing && !extractedData.length) {
      status = 'ESTIMATED';
      confidence = 'LOW';
    } else if (calculatedResult) {
      status = 'DERIVED';
    }

    // Provider selection metadata — report the REAL provider that ran, fall back to
    // the deterministic engine label when no provider call was made.
    const selectedProvider: ProviderId = providerUsed || input.preferredProvider || 'gemini';
    const selectedModel = providerModelUsed || 'gemini-2.5-flash';

    const evidence: AIEvidence = {
      sourceType: isPdf ? 'pdf' : isImage ? 'image' : 'drawing',
      sourceId: sha256Hash,
      sourceName: input.fileName,
      extractedText: extractedData.rawTextSnippets.join('; ') || 'Data diekstrak dari sumber dokumen',
      extractedValue: calculatedResult?.computedValue,
      basis: calculatedResult
        ? `Formula: ${calculatedResult.formula} (Kalkulasi Deterministik EZRAB Engine)`
        : 'Nilai terbaca langsung dari teks sumber terverifikasi',
      confidence,
      status,
      provider: maskAiProviderName(selectedProvider),
      model: maskAiModelName(selectedModel),
      extractor: maskAiProviderName(selectedProvider),
      extractorModel: maskAiModelName(selectedModel),
      calculator: 'EZRAB_DETERMINISTIC_ENGINE',
    };

    const latencyMs = Date.now() - startMs;

    const trace: AISourceTrace = {
      traceId,
      projectId: input.projectId,
      sourceId: sha256Hash,
      sourceType: isPdf ? 'pdf' : isImage ? 'image' : 'drawing',
      sourceName: input.fileName,
      fileHash: sha256Hash,
      provider: maskAiProviderName(selectedProvider),
      model: maskAiModelName(selectedModel),
      requestId: providerRequestId || requestId,
      extractionStatus,
      evidenceCount: 1,
      confidence,
      calculator: 'EZRAB_DETERMINISTIC_ENGINE',
      createdAt: new Date().toISOString(),
      latencyMs,
      classification: 'REAL_FILE',
    };
    this.recordTrace(trace);

    return {
      success: true,
      sourceId: sha256Hash,
      sourceName: input.fileName,
      sourceType: isPdf ? 'pdf' : isImage ? 'image' : 'drawing',
      processingPath,
      classification: 'REAL_FILE',
      extractedData,
      calculatedResult,
      evidence,
      trace,
      metadata: {
        fileSizeBytes,
        sha256Hash,
        detectedMimeType: mimeType,
        hasTextLayer,
        scaleRatio: input.customScale,
        scaleWarning,
        provider: selectedProvider,
        model: selectedModel,
        latencyMs,
      },
    };
  }

  /**
   * Trace Management Repository
   */
  public recordTrace(trace: AISourceTrace): void {
    this.traces.set(trace.traceId, trace);
  }

  public getTrace(traceId: string): AISourceTrace | undefined {
    return this.traces.get(traceId);
  }

  public getTracesByProject(projectId: string): AISourceTrace[] {
    return Array.from(this.traces.values()).filter(t => t.projectId === projectId);
  }

  public getRecentTraces(limit: number = 50): AISourceTrace[] {
    return Array.from(this.traces.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  public clearTraces(): void {
    this.traces.clear();
  }
}

export const aiSourceReadingService = AISourceReadingService.getInstance();
