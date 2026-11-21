class ConcurrencyManager {
  private activeCount = 0;
  private readonly maxConcurrent: number;
  private queue: Array<() => void> = [];

  constructor(max?: number) {
    const envMax = parseInt(process.env.MAX_CONCURRENT || '2', 10);
    this.maxConcurrent = !isNaN(max ?? NaN) ? (max as number) : (!isNaN(envMax) ? envMax : 2);
  }

  get active(): number {
    return this.activeCount;
  }

  get max(): number {
    return this.maxConcurrent;
  }

  get pending(): number {
    return this.queue.length;
  }

  /**
   * Acquires a concurrency execution slot.
   * If all slots are in use, waits until one is freed.
   */
  async acquire(): Promise<() => void> {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      return () => this.release();
    }

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.activeCount++;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}

// Global singleton instance for the server runtime
export const downloadQueue = new ConcurrencyManager();
