import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ─── Singleton ──────────────────────────────────────────────────────────────

let ratelimit: Ratelimit | null = null;

/**
 * Lazy-init Upstash Ratelimit.
 * Returns null if env vars are missing (allows local dev without Redis).
 */
function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('Upstash Redis env vars missing — rate limiting disabled.');
    return null;
  }

  const redis = new Redis({ url, token });

  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '60 s'), // 5 requests per 60-second sliding window
    analytics: true,
    prefix: 'pdf-email-service',
  });

  return ratelimit;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number; // unix ms
}

/**
 * Check rate limit for a given identifier (IP, API key, etc.).
 * If Redis is not configured, always allows.
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const limiter = getRatelimit();
  if (!limiter) {
    return { allowed: true, remaining: 999, reset: 0 };
  }

  const result = await limiter.limit(identifier);
  return {
    allowed: result.success,
    remaining: result.remaining,
    reset: result.reset,
  };
}
