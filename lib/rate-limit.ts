// Simple in-memory rate limiter. Sufficient for single-user deployment.
// For multi-instance production, replace with Redis-backed implementation.

const attempts = new Map<string, { count: number; resetAt: number }>();

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds
}

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: maxAttempts - 1, resetIn: windowSeconds };
  }

  if (entry.count >= maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: maxAttempts - entry.count,
    resetIn: Math.ceil((entry.resetAt - now) / 1000),
  };
}
