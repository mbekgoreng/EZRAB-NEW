import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as crypto from 'crypto';
import { messageNormalizer } from './messageNormalizer';

export interface RawKnowledgeRecord {
  id: string;
  category: string;
  intent: string;
  question: string;
  answer: string;
  tone?: string;
  source?: string;
  language?: string;
  answer_core?: string;
  version?: string;
}

export interface ValidatedKnowledgeRecord extends RawKnowledgeRecord {
  normalized_question: string;
  tokens: string[];
  stemmed_tokens: string[];
  keywords: string[];
  checksum: string;
  created_at: string;
}

export interface DatasetImportSummary {
  source_file: string;
  file_format: 'jsonl' | 'csv';
  file_size_bytes: number;
  file_sha256: string;
  total_lines_read: number;
  valid_records: number;
  duplicate_records: number;
  skipped_records: number;
  failed_records: number;
  categories: Record<string, number>;
  intents: Record<string, number>;
  tones: Record<string, number>;
  duration_ms: number;
  imported_at: string;
  sample_errors: Array<{ line: number; error: string }>;
}

export class KnowledgeDatasetImporter {
  private defaultDatasetPaths = [
    'D:\\file kerja\\PEMBUATAN SOFTWARE\\ezrab folder\\EZRAB_9999_Pertanyaan_Jawaban_Universal.jsonl',
    'D:\\file kerja\\PEMBUATAN SOFTWARE\\ezrab folder\\EZRAB_9999_Pertanyaan_Jawaban_Universal.csv',
    path.resolve(process.cwd(), 'EZRAB_9999_Pertanyaan_Jawaban_Universal.jsonl'),
    path.resolve(process.cwd(), 'EZRAB_9999_Pertanyaan_Jawaban_Universal.csv')
  ];

  /**
   * Find available dataset path on system
   */
  public resolveDatasetPath(customPath?: string): string | null {
    if (customPath && fs.existsSync(customPath)) {
      return customPath;
    }
    for (const p of this.defaultDatasetPaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Calculate SHA256 of file
   */
  public calculateFileHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  /**
   * Stream & Import dataset from JSONL or CSV file
   */
  public async importDataset(
    filePath?: string
  ): Promise<{ records: ValidatedKnowledgeRecord[]; summary: DatasetImportSummary }> {
    const resolvedPath = this.resolveDatasetPath(filePath);
    if (!resolvedPath) {
      throw new Error(`Dataset file not found. Checked default paths.`);
    }

    const startTime = Date.now();
    const stats = fs.statSync(resolvedPath);
    const fileSha256 = this.calculateFileHash(resolvedPath);
    const isCsv = resolvedPath.toLowerCase().endsWith('.csv');

    const fileStream = fs.createReadStream(resolvedPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const records: ValidatedKnowledgeRecord[] = [];
    const seenQuestions = new Set<string>();
    const seenIds = new Set<string>();

    const categories: Record<string, number> = {};
    const intents: Record<string, number> = {};
    const tones: Record<string, number> = {};
    const sampleErrors: Array<{ line: number; error: string }> = [];

    let lineIndex = 0;
    let validCount = 0;
    let duplicateCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    let csvHeaders: string[] = [];

    for await (const line of rl) {
      lineIndex++;
      const trimmed = line.trim();
      if (!trimmed) {
        skippedCount++;
        continue;
      }

      // Handle CSV Header
      if (isCsv && lineIndex === 1) {
        csvHeaders = this.parseCsvLine(trimmed).map(h => h.trim().toLowerCase());
        continue;
      }

      try {
        let rawRecord: RawKnowledgeRecord | null = null;

        if (isCsv) {
          const cols = this.parseCsvLine(trimmed);
          if (cols.length < 5) {
            skippedCount++;
            continue;
          }
          rawRecord = this.mapCsvRow(csvHeaders, cols, lineIndex);
        } else {
          // JSONL parsing
          rawRecord = JSON.parse(trimmed) as RawKnowledgeRecord;
        }

        if (!rawRecord || !rawRecord.question || !rawRecord.answer) {
          skippedCount++;
          continue;
        }

        const normalizedQ = messageNormalizer.normalize(rawRecord.question);
        if (!normalizedQ.normalized) {
          skippedCount++;
          continue;
        }

        // Deduplication Check
        if (seenQuestions.has(normalizedQ.normalized) || (rawRecord.id && seenIds.has(rawRecord.id))) {
          duplicateCount++;
          continue;
        }

        seenQuestions.add(normalizedQ.normalized);
        if (rawRecord.id) seenIds.add(rawRecord.id);

        const category = (rawRecord.category || 'umum').toLowerCase();
        const intent = (rawRecord.intent || 'GENERAL_QUESTION').toUpperCase();
        const tone = (rawRecord.tone || 'serius').toLowerCase();

        categories[category] = (categories[category] || 0) + 1;
        intents[intent] = (intents[intent] || 0) + 1;
        tones[tone] = (tones[tone] || 0) + 1;

        const recordChecksum = crypto
          .createHash('md5')
          .update(`${rawRecord.id || lineIndex}:${rawRecord.question}:${rawRecord.answer}`)
          .digest('hex');

        const validated: ValidatedKnowledgeRecord = {
          id: rawRecord.id || `EZRAB-QA-${String(lineIndex).padStart(5, '0')}`,
          category,
          intent,
          question: rawRecord.question.trim(),
          answer: rawRecord.answer.trim(),
          tone,
          source: rawRecord.source || 'dataset_universal_9999',
          language: rawRecord.language || 'id',
          answer_core: rawRecord.answer_core,
          version: rawRecord.version || '1.0',
          normalized_question: normalizedQ.normalized,
          tokens: normalizedQ.tokens,
          stemmed_tokens: normalizedQ.stemmedTokens,
          keywords: Array.from(new Set([...normalizedQ.tokens, ...normalizedQ.stemmedTokens])).filter(k => k.length >= 3),
          checksum: recordChecksum,
          created_at: new Date().toISOString()
        };

        records.push(validated);
        validCount++;
      } catch (err: any) {
        failedCount++;
        if (sampleErrors.length < 20) {
          sampleErrors.push({ line: lineIndex, error: err?.message || 'Unknown parsing error' });
        }
      }
    }

    const durationMs = Date.now() - startTime;

    const summary: DatasetImportSummary = {
      source_file: resolvedPath,
      file_format: isCsv ? 'csv' : 'jsonl',
      file_size_bytes: stats.size,
      file_sha256: fileSha256,
      total_lines_read: lineIndex,
      valid_records: validCount,
      duplicate_records: duplicateCount,
      skipped_records: skippedCount,
      failed_records: failedCount,
      categories,
      intents,
      tones,
      duration_ms: durationMs,
      imported_at: new Date().toISOString(),
      sample_errors: sampleErrors
    };

    return { records, summary };
  }

  /**
   * Helper to parse a single CSV line with quote and escape handling
   */
  private parseCsvLine(text: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuote = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQuote && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (c === ',' && !inQuote) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  }

  /**
   * Map parsed CSV row values to RawKnowledgeRecord based on header names
   */
  private mapCsvRow(headers: string[], cols: string[], lineIndex: number): RawKnowledgeRecord {
    const getCol = (key: string, defaultVal = ''): string => {
      const idx = headers.indexOf(key);
      if (idx >= 0 && idx < cols.length) return cols[idx];
      return defaultVal;
    };

    return {
      id: getCol('id') || `EZRAB-QA-${String(lineIndex).padStart(5, '0')}`,
      category: getCol('category', 'umum'),
      intent: getCol('intent', 'GENERAL_QUESTION'),
      question: getCol('question'),
      answer: getCol('answer'),
      tone: getCol('tone', 'serius'),
      source: getCol('source', 'dataset_universal_9999'),
      language: getCol('language', 'id'),
      answer_core: getCol('answer_core'),
      version: getCol('version', '1.0')
    };
  }
}

export const knowledgeDatasetImporter = new KnowledgeDatasetImporter();
