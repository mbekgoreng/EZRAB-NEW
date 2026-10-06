import { DbKnowledgeEntry, DbAnswerLog } from '../database/types';
import { messageNormalizer, NormalizedMessage } from './messageNormalizer';
import { knowledgeDatasetImporter, ValidatedKnowledgeRecord } from './knowledgeDatasetImporter';
import { findKnowledgeBaseAutoAnswer } from '../data/knowledgeBaseData';

export interface AutoAnswerSearchResult {
  entry: DbKnowledgeEntry;
  confidence: number;
  matchType: 'exact' | 'keyword_inverted' | 'fuzzy_typo' | 'synonym' | 'semantic';
  matchedTokens: string[];
  distance?: number;
}

export interface AutoAnswerResponse {
  answer: string;
  intent: string;
  category: string;
  tone: 'serius' | 'humor' | 'natural';
  confidence: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  source_type: 'dataset' | 'knowledge_base' | 'live_data' | 'tool' | 'fallback';
  matched_entry_id: string | null;
  requires_clarification: boolean;
  requires_confirmation: boolean;
  suggested_actions?: string[];
  suggested_questions?: string[];
  metadata: {
    language: string;
    version: string;
    match_type?: string;
    response_time_ms: number;
  };
}

export class AutoAnswerEngine {
  private entries: Map<string, DbKnowledgeEntry> = new Map();
  private normalizedQuestionMap: Map<string, string> = new Map(); // normalized_question -> entry_id
  private tokenInvertedIndex: Map<string, Set<string>> = new Map(); // token -> Set<entry_id>
  private categoryMap: Map<string, Set<string>> = new Map(); // category -> Set<entry_id>
  private intentMap: Map<string, Set<string>> = new Map(); // intent -> Set<entry_id>
  private isInitialized = false;

  // Variation openers for natural conversations
  private casualOpeners = [
    '',
    'Terkait hal ini: ',
    'Secara umum, ',
    'Berdasarkan panduan: ',
    'Berikut penjelasannya: ',
    'Ringkasnya: '
  ];

  private seriousOpeners = [
    '',
    'Berdasarkan ketentuan sistem: ',
    'Pemeriksaan menunjukkan: ',
    'Secara resmi: ',
    'Prosedur standarnya adalah: '
  ];

  constructor() {
    // Lazily or proactively initialize
  }

  /**
   * Load dataset and construct in-memory indices
   */
  public async initialize(customPath?: string): Promise<{ totalEntries: number; durationMs: number }> {
    if (this.isInitialized && this.entries.size > 0) {
      return { totalEntries: this.entries.size, durationMs: 0 };
    }

    const start = Date.now();
    try {
      const { records } = await knowledgeDatasetImporter.importDataset(customPath);
      this.clearIndices();

      for (const rec of records) {
        this.addRecordToIndex(rec);
      }

      this.isInitialized = true;
      const durationMs = Date.now() - start;
      console.log(`[AutoAnswerEngine] Initialized with ${this.entries.size} entries in ${durationMs}ms`);
      return { totalEntries: this.entries.size, durationMs };
    } catch (err: any) {
      console.warn(`[AutoAnswerEngine] Initialization warning: ${err?.message}. Operating in fallback mode.`);
      return { totalEntries: 0, durationMs: Date.now() - start };
    }
  }

  private clearIndices(): void {
    this.entries.clear();
    this.normalizedQuestionMap.clear();
    this.tokenInvertedIndex.clear();
    this.categoryMap.clear();
    this.intentMap.clear();
  }

  private addRecordToIndex(rec: ValidatedKnowledgeRecord): void {
    const entry: DbKnowledgeEntry = {
      id: rec.id,
      category: rec.category,
      intent: rec.intent,
      question: rec.question,
      normalized_question: rec.normalized_question,
      answer: rec.answer,
      tone: rec.tone || 'serius',
      language: rec.language || 'id',
      source: rec.source || 'dataset_universal_9999',
      answer_core: rec.answer_core,
      keywords: rec.keywords,
      confidence_weight: 1.0,
      is_active: true,
      version: rec.version || '1.0',
      checksum: rec.checksum,
      created_at: rec.created_at
    };

    this.entries.set(entry.id, entry);
    this.normalizedQuestionMap.set(entry.normalized_question, entry.id);

    // Populate token inverted index
    for (const token of rec.keywords) {
      if (!this.tokenInvertedIndex.has(token)) {
        this.tokenInvertedIndex.set(token, new Set());
      }
      this.tokenInvertedIndex.get(token)!.add(entry.id);
    }

    // Populate category map
    if (!this.categoryMap.has(entry.category)) {
      this.categoryMap.set(entry.category, new Set());
    }
    this.categoryMap.get(entry.category)!.add(entry.id);

    // Populate intent map
    if (!this.intentMap.has(entry.intent)) {
      this.intentMap.set(entry.intent, new Set());
    }
    this.intentMap.get(entry.intent)!.add(entry.id);
  }

  /**
   * Search knowledge entries using multi-tier retrieval:
   * 1. Exact match (1.00)
   * 2. Inverted token index match (0.85 - 0.98)
   * 3. Typo-tolerant Levenshtein fuzzy match (0.70 - 0.84)
   */
  public search(query: string, limit = 5): AutoAnswerSearchResult[] {
    if (!query || query.trim().length === 0) return [];
    const normalized: NormalizedMessage = messageNormalizer.normalize(query);
    const qNorm = normalized.normalized;
    const tokens = normalized.tokens.filter(t => t.length >= 2);
    const results: AutoAnswerSearchResult[] = [];

    // =========================================================================
    // TIER 1: EXACT NORMALIZED MATCH (O(1) Hash Map Lookup)
    // =========================================================================
    const exactId = this.normalizedQuestionMap.get(qNorm);
    if (exactId && this.entries.has(exactId)) {
      const entry = this.entries.get(exactId)!;
      return [
        {
          entry,
          confidence: 1.0,
          matchType: 'exact',
          matchedTokens: tokens
        }
      ];
    }

    // =========================================================================
    // TIER 2: TOKEN INVERTED INDEX OVERLAP WITH IDF / STOPWORD WEIGHTING
    // =========================================================================
    const STOPWORDS = new Set([
      'bagaimana', 'cara', 'apa', 'apakah', 'adalah', 'yang', 'dan', 'di', 'ke',
      'dari', 'ini', 'itu', 'bisa', 'untuk', 'pada', 'saya', 'kamu', 'anda',
      'tentang', 'secara', 'harus', 'agar', 'jika', 'bila', 'dengan', 'ada', 'buat',
      'prosedur', 'aman', 'menangani', 'lakukan', 'dilakukan', 'mengenai', 'terkait',
      'ezrab', 'ai', 'bot', 'tanya', 'mau', 'ingin', 'tolong', 'bantu', 'dong', 'sih', 'deh', 'ya'
    ]);

    const candidateScores = new Map<string, { matchedTokens: Set<string>; score: number; contentTokenMatches: number }>();
    const contentTokens = tokens.filter(t => !STOPWORDS.has(t));
    const contentTokenSet = new Set(contentTokens);

    for (const token of tokens) {
      const isStopword = STOPWORDS.has(token);
      const tokenWeight = isStopword ? 0.3 : 3.5;

      // Direct token match in inverted index
      const matchingEntryIds = this.tokenInvertedIndex.get(token);
      if (matchingEntryIds) {
        for (const id of matchingEntryIds) {
          if (!candidateScores.has(id)) {
            candidateScores.set(id, { matchedTokens: new Set(), score: 0, contentTokenMatches: 0 });
          }
          const c = candidateScores.get(id)!;
          c.matchedTokens.add(token);
          c.score += tokenWeight;
          if (!isStopword) c.contentTokenMatches += 1;
        }
      }

      // Stemmed token match in inverted index
      if (!isStopword) {
        const stemmed = messageNormalizer.simpleStem(token);
        if (stemmed !== token) {
          const stemmedEntryIds = this.tokenInvertedIndex.get(stemmed);
          if (stemmedEntryIds) {
            for (const id of stemmedEntryIds) {
              if (!candidateScores.has(id)) {
                candidateScores.set(id, { matchedTokens: new Set(), score: 0, contentTokenMatches: 0 });
              }
              const c = candidateScores.get(id)!;
              if (!c.matchedTokens.has(token)) {
                c.matchedTokens.add(stemmed);
                c.score += 2.0;
                c.contentTokenMatches += 1;
              }
            }
          }
        }
      }
    }

    // Rank candidates
    const rankedCandidates: Array<{ id: string; confidence: number; matchedTokens: string[] }> = [];

    for (const [id, data] of candidateScores.entries()) {
      const entry = this.entries.get(id);
      if (!entry) continue;

      const entryContentTokens = entry.keywords.filter(k => !STOPWORDS.has(k));
      const entryContentCount = entryContentTokens.length || 1;
      const contentMatches = data.contentTokenMatches;

      // Content token coverage ratio
      const queryContentCoverage = contentTokenSet.size > 0 ? contentMatches / contentTokenSet.size : 0.5;
      const entryContentCoverage = contentMatches / Math.max(1, entryContentCount);
      
      let confidence = (queryContentCoverage * 0.70) + (entryContentCoverage * 0.30);

      // Boost if multiple key content words matched
      if (contentTokenSet.size > 0 && queryContentCoverage >= 1.0) {
        confidence = Math.max(confidence, 0.92);
      } else if (contentMatches >= 2) {
        confidence = Math.max(confidence, 0.82);
      } else if (contentMatches >= 1 && queryContentCoverage >= 0.5) {
        confidence = Math.max(confidence, 0.75);
      }

      confidence = Math.min(0.98, Math.max(0.40, confidence));

      if (confidence >= 0.55 || contentMatches >= 1) {
        rankedCandidates.push({
          id,
          confidence,
          matchedTokens: Array.from(data.matchedTokens)
        });
      }
    }

    rankedCandidates.sort((a, b) => b.confidence - a.confidence);

    if (rankedCandidates.length > 0 && rankedCandidates[0].confidence >= 0.75) {
      for (const cand of rankedCandidates.slice(0, limit)) {
        results.push({
          entry: this.entries.get(cand.id)!,
          confidence: cand.confidence,
          matchType: 'keyword_inverted',
          matchedTokens: cand.matchedTokens
        });
      }
      return results;
    }

    // =========================================================================
    // TIER 3: TYPO TOLERANCE & LEVENSHTEIN FUZZY MATCH
    // =========================================================================
    let bestFuzzy: { entry: DbKnowledgeEntry; similarity: number } | null = null;

    // Check top candidate samples or key entries
    const samplePool = rankedCandidates.length > 0 
      ? rankedCandidates.slice(0, 50).map(c => this.entries.get(c.id)!)
      : Array.from(this.entries.values()).slice(0, 100);

    for (const entry of samplePool) {
      if (!entry) continue;
      const sim = messageNormalizer.stringSimilarity(qNorm, entry.normalized_question);
      if (sim >= 0.70) {
        if (!bestFuzzy || sim > bestFuzzy.similarity) {
          bestFuzzy = { entry, similarity: sim };
        }
      }
    }

    if (bestFuzzy && bestFuzzy.similarity >= 0.70) {
      return [
        {
          entry: bestFuzzy.entry,
          confidence: Number(bestFuzzy.similarity.toFixed(3)),
          matchType: 'fuzzy_typo',
          matchedTokens: tokens
        }
      ];
    }

    // Return best candidates found if any
    for (const cand of rankedCandidates.slice(0, limit)) {
      results.push({
        entry: this.entries.get(cand.id)!,
        confidence: cand.confidence,
        matchType: 'synonym',
        matchedTokens: cand.matchedTokens
      });
    }

    return results;
  }

  /**
   * Process a question through the full Auto Answer Pipeline
   */
  public async answerQuestion(
    query: string,
    options: {
      userId?: string;
      workspaceId?: string;
      projectId?: string;
      conversationId?: string;
      previousAnswers?: string[];
    } = {}
  ): Promise<AutoAnswerResponse> {
    const startTime = Date.now();
    await this.initialize();

    // Priority 2: Check Official Knowledge Base & Humor Dataset
    const kbAutoAnswer = findKnowledgeBaseAutoAnswer(query);
    if (kbAutoAnswer) {
      const isHumor = kbAutoAnswer.includes('🚀') || kbAutoAnswer.includes('☁️') || kbAutoAnswer.includes('🌧️') || kbAutoAnswer.includes('😂') || kbAutoAnswer.includes('💔') || kbAutoAnswer.includes('■');
      return {
        answer: kbAutoAnswer,
        intent: isHumor ? 'JOKING' : 'KNOWLEDGE_BASE',
        category: isHumor ? 'humor' : 'knowledge_base',
        tone: isHumor ? 'humor' : 'natural',
        confidence: 0.99,
        risk_level: 'low',
        source_type: 'knowledge_base',
        matched_entry_id: 'kb-official',
        requires_clarification: false,
        requires_confirmation: false,
        suggested_actions: ['Hitung RAB Proyek', 'Cari Analisa AHSP', 'Buka Kurva S'],
        metadata: {
          language: 'id',
          version: '1.0',
          match_type: 'knowledge_base',
          response_time_ms: Date.now() - startTime
        }
      };
    }

    const normalized = messageNormalizer.normalize(query);
    const searchResults = this.search(query, 3);
    const bestResult = searchResults[0];

    const durationMs = Date.now() - startTime;

    // 1. High Confidence Match (>= 0.85) -> Return Direct Varied Answer
    if (bestResult && bestResult.confidence >= 0.85) {
      const entry = bestResult.entry;
      const variedAnswer = this.applyAnswerVariation(entry.answer, entry.tone, options.previousAnswers);

      return {
        answer: variedAnswer,
        intent: entry.intent,
        category: entry.category,
        tone: (entry.tone as any) || 'serius',
        confidence: bestResult.confidence,
        risk_level: 'low',
        source_type: 'dataset',
        matched_entry_id: entry.id,
        requires_clarification: false,
        requires_confirmation: false,
        suggested_actions: ['Hitung RAB Proyek', 'Cari Analisa AHSP', 'Buka Kurva S'],
        metadata: {
          language: entry.language || 'id',
          version: entry.version || '1.0',
          match_type: bestResult.matchType,
          response_time_ms: durationMs
        }
      };
    }

    // 2. Medium Confidence Match (0.65 - 0.84) -> Return Qualified Answer with Clarification
    if (bestResult && bestResult.confidence >= 0.65) {
      const entry = bestResult.entry;
      const qualifiedAnswer = `${entry.answer}\n\n*(Catatan: Jika maksud Anda berbeda, silakan jelaskan lebih spesifik atau pilih topik di bawah).*`;

      return {
        answer: qualifiedAnswer,
        intent: entry.intent,
        category: entry.category,
        tone: (entry.tone as any) || 'serius',
        confidence: bestResult.confidence,
        risk_level: 'low',
        source_type: 'dataset',
        matched_entry_id: entry.id,
        requires_clarification: true,
        requires_confirmation: false,
        suggested_questions: searchResults.map(r => r.entry.question),
        metadata: {
          language: entry.language || 'id',
          version: entry.version || '1.0',
          match_type: bestResult.matchType,
          response_time_ms: durationMs
        }
      };
    }

    // 3. Low Confidence (< 0.65) -> Friendly & Query-Contextual Fallback
    const cleanTopic = query.replace(/[?!.,]/g, '').trim();
    const fallbackResponse: AutoAnswerResponse = {
      answer:
        `Terkait topik "${cleanTopic}", saya belum menangkap maksud pertanyaan Anda secara tepat.\n\n` +
        'Apakah Anda ingin mendiskusikan topik berikut:\n' +
        '1. **RAB & Perhitungan Biaya Konstruksi**\n' +
        '2. **Volume Pekerjaan (QTO) & Dimensi**\n' +
        '3. **Analisa Harga Satuan (AHSP) & Bahan**\n' +
        '4. **Jadwal, Progres & Kurva S Proyek**\n' +
        '5. **Akun, Paket Langganan & Kredit AI**\n\n' +
        'Silakan ketik pertanyaan Anda dengan kata kunci yang lebih spesifik.',
      intent: 'UNKNOWN',
      category: 'fallback',
      tone: 'natural',
      confidence: 0.35,
      risk_level: 'low',
      source_type: 'fallback',
      matched_entry_id: null,
      requires_clarification: true,
      requires_confirmation: false,
      suggested_questions: [
        'Bagaimana cara membuat RAB?',
        'Jelaskan fungsi QTO.',
        'Bagaimana mencari AHSP?',
        'Bantu saya memahami Kurva S.'
      ],
      metadata: {
        language: 'id',
        version: '1.0',
        match_type: 'none',
        response_time_ms: durationMs
      }
    };

    return fallbackResponse;
  }

  /**
   * Generates dynamic variations for answers without altering core facts
   */
  private applyAnswerVariation(
    rawAnswer: string,
    tone: string,
    previousAnswers: string[] = []
  ): string {
    const isSerious = tone === 'serius';
    const openers = isSerious ? this.seriousOpeners : this.casualOpeners;
    
    // Choose an opener that doesn't duplicate recent answers
    const seed = Math.floor(Math.random() * openers.length);
    const chosenOpener = openers[seed];

    if (!chosenOpener || rawAnswer.startsWith(chosenOpener)) {
      return rawAnswer;
    }

    // Only prepend if answer doesn't already start with similar word
    if (rawAnswer.startsWith('EZRAB') || rawAnswer.startsWith('Login') || rawAnswer.startsWith('Password') || rawAnswer.startsWith('Kalau')) {
      return rawAnswer;
    }

    return `${chosenOpener}${rawAnswer}`;
  }

  public getLoadedCount(): number {
    return this.entries.size;
  }
}

export const autoAnswerEngine = new AutoAnswerEngine();
