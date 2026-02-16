import type { Context, Next } from "hono";
import { createLogger } from "@percolator/shared";

const logger = createLogger("api:rate-limit");

interface RateBucket {
  count: number;
  resetAt: number;
}

const readBuckets = new Map<string, RateBucket>();
const writeBuckets = new Map<string, RateBucket>();
const WINDOW_MS = 60_000; // 1 minute
const READ_LIMIT = 100; // 100 requests per minute for reads
const WRITE_LIMIT = 10; // 10 requests per minute for writes

// Clean up expired buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of readBuckets) if (v.resetAt <= now) readBuckets.delete(k);
  for (const [k, v] of writeBuckets) if (v.resetAt <= now) writeBuckets.delete(k);
}, 5 * 60_000);

function getClientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? 
         c.req.header("x-real-ip") ?? 
         "unknown";
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

function checkLimit(
  buckets: Map<string, RateBucket>, 
  ip: string, 
  limit: number
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(ip);
  
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, bucket);
  }
  
  bucket.count++;
  const allowed = bucket.count <= limit;
  const remaining = Math.max(0, limit - bucket.count);
  
  return {
    allowed,
    limit,
    remaining,
    reset: Math.floor(bucket.resetAt / 1000), // Unix timestamp in seconds
  };
}

export function readRateLimit() {
  return async (c: Context, next: Next) => {
    const ip = getClientIp(c);
    const result = checkLimit(readBuckets, ip, READ_LIMIT);
    
    // Set rate limit headers
    c.header("X-RateLimit-Limit", result.limit.toString());
    c.header("X-RateLimit-Remaining", result.remaining.toString());
    c.header("X-RateLimit-Reset", result.reset.toString());
    
    if (!result.allowed) {
      logger.warn("Read rate limit exceeded", { 
        ip, 
        path: c.req.path,
        limit: READ_LIMIT 
      });
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
    
    return next();
  };
}

export function writeRateLimit() {
  return async (c: Context, next: Next) => {
    const ip = getClientIp(c);
    const result = checkLimit(writeBuckets, ip, WRITE_LIMIT);
    
    // Set rate limit headers
    c.header("X-RateLimit-Limit", result.limit.toString());
    c.header("X-RateLimit-Remaining", result.remaining.toString());
    c.header("X-RateLimit-Reset", result.reset.toString());
    
    if (!result.allowed) {
      logger.warn("Write rate limit exceeded", { 
        ip, 
        path: c.req.path,
        method: c.req.method,
        limit: WRITE_LIMIT 
      });
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
    
    return next();
  };
}
