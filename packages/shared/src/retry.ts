/**
 * retry.ts — Exponential backoff retry utility for resilient RPC/DB operations
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Label for logging (default: "operation") */
  label?: string;
}

/**
 * Retry a function with exponential backoff and jitter.
 * 
 * Delay formula: min(baseDelay * 2^attempt + jitter, maxDelay)
 * Jitter: random value between 0 and baseDelay to avoid thundering herd
 * 
 * @param fn - Async function to retry
 * @param opts - Retry configuration options
 * @returns Result of successful function execution
 * @throws Last error if all retries exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    label = "operation",
  } = opts;

  let lastError: Error | unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Calculate exponential backoff with jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelayMs;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `[Retry] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}. ` +
        `Retrying in ${Math.round(delay)}ms...`
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // All retries exhausted
  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[Retry] ${label} failed after ${maxRetries + 1} attempts: ${errorMessage}`);
  throw lastError;
}
