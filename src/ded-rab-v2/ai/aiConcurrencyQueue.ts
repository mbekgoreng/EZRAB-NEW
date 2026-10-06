/**
 * AI Bounded Concurrency Queue & Request Deduplicator (EZRAB DED -> RAB V2)
 *
 * Responsibilities:
 * - Regulate concurrent AI requests within a safe bounded limit (default: 4 concurrent calls).
 * - Request Deduplication: In-flight requests with identical fingerprint share the same promise.
 * - Zero artificial delays: Tasks execute immediately when a concurrency slot is free.
 * - Fault tolerance: Errors in one task do not crash the queue or block pending tasks.
 */

export interface QueueTask<T> {
  id: string;
  fingerprint: string;
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
}

export class AiConcurrencyQueue {
  private static instance: AiConcurrencyQueue;
  private maxConcurrency: number = 4;
  private runningCount: number = 0;
  private queue: QueueTask<any>[] = [];
  private inFlightMap: Map<string, Promise<any>> = new Map();

  private constructor() {}

  public static getInstance(): AiConcurrencyQueue {
    if (!AiConcurrencyQueue.instance) {
      AiConcurrencyQueue.instance = new AiConcurrencyQueue();
    }
    return AiConcurrencyQueue.instance;
  }

  public setConcurrency(limit: number): void {
    if (limit >= 1 && limit <= 10) {
      this.maxConcurrency = limit;
    }
  }

  public getConcurrency(): number {
    return this.maxConcurrency;
  }

  public getActiveCount(): number {
    return this.runningCount;
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  /**
   * Enqueues an async task with request deduplication.
   */
  public enqueue<T>(fingerprint: string, fn: () => Promise<T>): Promise<T> {
    // 1. Deduplication check: if an identical request is already running, piggyback on its promise!
    if (this.inFlightMap.has(fingerprint)) {
      return this.inFlightMap.get(fingerprint) as Promise<T>;
    }

    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fingerprint,
        fn,
        resolve,
        reject,
      });
      this.processNext();
    });

    this.inFlightMap.set(fingerprint, promise);

    // Clean up in-flight map upon settlement
    promise.finally(() => {
      this.inFlightMap.delete(fingerprint);
    });

    return promise;
  }

  /**
   * Executes tasks in parallel up to maxConcurrency.
   */
  private processNext(): void {
    if (this.runningCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.runningCount++;

    task
      .fn()
      .then((res) => {
        task.resolve(res);
      })
      .catch((err) => {
        task.reject(err);
      })
      .finally(() => {
        this.runningCount--;
        this.processNext();
      });

    // Check if another slot is available right away
    if (this.runningCount < this.maxConcurrency && this.queue.length > 0) {
      this.processNext();
    }
  }

  /**
   * Clears pending queue
   */
  public clear(): void {
    this.queue = [];
    this.inFlightMap.clear();
  }
}

export const aiConcurrencyQueue = AiConcurrencyQueue.getInstance();
