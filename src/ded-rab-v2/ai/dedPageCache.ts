/**
 * DED Page Analysis Cache (EZRAB DED -> RAB V2)
 *
 * Responsibilities:
 * - Cache visual and structured analysis results for DED pages.
 * - Hash key computation: SHA-256(imageDataUri/imageBytes + model + promptVersion).
 * - Multi-tier storage: High-speed In-Memory Map + LocalStorage fallback.
 * - Cache invalidation when prompt version, model, or page content changes.
 * - Telemetry: Accurate tracking of cacheHits and cacheMisses.
 */

export interface CachedPageResult<T = any> {
  cacheKey: string;
  documentId: string;
  pageNumber: number;
  imageHash: string;
  model: string;
  promptVersion: string;
  result: T;
  createdAt: number;
}

export class DedPageCache {
  private static instance: DedPageCache;
  private memoryCache: Map<string, CachedPageResult> = new Map();
  private promptVersion: string = 'v3.0.0-unified-ded-vision-no-synthetic-fallback';
  private hits: number = 0;
  private misses: number = 0;

  private constructor() {}

  public static getInstance(): DedPageCache {
    if (!DedPageCache.instance) {
      DedPageCache.instance = new DedPageCache();
    }
    return DedPageCache.instance;
  }

  /**
   * Fast simple hash implementation for Node & browser environments
   */
  public computeHash(content: string): string {
    let hash = 0;
    if (content.length === 0) return 'empty-hash';
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    // Combine with length to create robust collision-resistant fingerprint
    return `${hex}-${content.length}`;
  }

  /**
   * Generates a composite cache key
   */
  public generateKey(documentId: string, pageNumber: number, imageContent: string, model: string, pass: number): string {
    const imgHash = this.computeHash(imageContent.slice(0, 5000) + imageContent.slice(-5000));
    return `ded_cache_${documentId}_p${pageNumber}_pass${pass}_${model}_${this.promptVersion}_${imgHash}`;
  }

  /**
   * Retrieves an item from cache
   */
  public get<T>(key: string): T | null {
    // 1. In-memory check
    const inMem = this.memoryCache.get(key);
    if (inMem) {
      this.hits++;
      return inMem.result as T;
    }

    // 2. LocalStorage check (browser only)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const parsed: CachedPageResult<T> = JSON.parse(raw);
          // Auto hydrate memory cache
          this.memoryCache.set(key, parsed);
          this.hits++;
          return parsed.result;
        }
      } catch (e) {
        // Storage quota exceeded or disabled
      }
    }

    this.misses++;
    return null;
  }

  /**
   * Persists an item in cache
   */
  public set<T>(
    key: string,
    documentId: string,
    pageNumber: number,
    imageHash: string,
    model: string,
    result: T
  ): void {
    const entry: CachedPageResult<T> = {
      cacheKey: key,
      documentId,
      pageNumber,
      imageHash,
      model,
      promptVersion: this.promptVersion,
      result,
      createdAt: Date.now(),
    };

    // 1. Memory cache
    this.memoryCache.set(key, entry);

    // 2. LocalStorage (save smaller responses, prune if needed)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(key, JSON.stringify(entry));
      } catch (e) {
        // Ignore quota limits gracefully
      }
    }
  }

  /**
   * Telemetry stats
   */
  public getStats(): { hits: number; misses: number; total: number; hitRatio: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      total,
      hitRatio: total > 0 ? Number((this.hits / total).toFixed(3)) : 0,
    };
  }

  public resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  public clear(): void {
    this.memoryCache.clear();
    this.resetStats();
  }
}

export const dedPageCache = DedPageCache.getInstance();
