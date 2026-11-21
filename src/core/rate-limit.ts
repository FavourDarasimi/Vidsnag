interface RateLimitRecord {
  timestamps: number[];
}

class InMemoryRateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequests: number = 60, windowMs: number = 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Periodically clean up stale records every 2 minutes
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanupStale(), 2 * 60 * 1000).unref();
    }
  }

  check(identifier: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let record = this.records.get(identifier);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(identifier, record);
    }

    // Keep only timestamps within window
    record.timestamps = record.timestamps.filter((t) => t > windowStart);

    if (record.timestamps.length >= this.maxRequests) {
      const oldest = record.timestamps[0] || now;
      const resetMs = Math.max(0, oldest + this.windowMs - now);
      return {
        allowed: false,
        remaining: 0,
        resetMs,
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      remaining: this.maxRequests - record.timestamps.length,
      resetMs: this.windowMs,
    };
  }

  private cleanupStale(): void {
    const threshold = Date.now() - this.windowMs;
    for (const [key, record] of this.records.entries()) {
      record.timestamps = record.timestamps.filter((t) => t > threshold);
      if (record.timestamps.length === 0) {
        this.records.delete(key);
      }
    }
  }
}

const rateLimitPerMin = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '60', 10);
export const apiRateLimiter = new InMemoryRateLimiter(
  !isNaN(rateLimitPerMin) ? rateLimitPerMin : 60,
  60 * 1000
);
