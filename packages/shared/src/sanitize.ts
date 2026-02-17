/**
 * Input sanitization utilities for API security
 */

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;
const MIN_SLAB_ADDRESS_LENGTH = 32;
const MAX_SLAB_ADDRESS_LENGTH = 44;

/**
 * Sanitize a string input by trimming, removing null bytes, and limiting length
 */
export function sanitizeString(input: string, maxLength = 1000): string {
  if (typeof input !== "string") {
    return "";
  }
  
  // Remove null bytes and other control characters
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Limit length
  if (maxLength > 0 && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
}

/**
 * Validate and sanitize a Solana base58 address (slab, mint, etc.)
 * Returns the address if valid, null otherwise
 */
export function sanitizeSlabAddress(input: string): string | null {
  if (typeof input !== "string") {
    return null;
  }
  
  const sanitized = sanitizeString(input, MAX_SLAB_ADDRESS_LENGTH);
  
  // Check length
  if (sanitized.length < MIN_SLAB_ADDRESS_LENGTH || sanitized.length > MAX_SLAB_ADDRESS_LENGTH) {
    return null;
  }
  
  // Check base58 format
  if (!BASE58_REGEX.test(sanitized)) {
    return null;
  }
  
  return sanitized;
}

/**
 * Sanitize pagination parameters (limit and offset)
 * Returns safe clamped values
 */
export function sanitizePagination(
  limit?: unknown,
  offset?: unknown
): { limit: number; offset: number } {
  const DEFAULT_LIMIT = 50;
  const MAX_LIMIT = 500;
  const MAX_OFFSET = 100000;
  
  let safeLimit = DEFAULT_LIMIT;
  let safeOffset = 0;
  
  // Parse and clamp limit
  if (typeof limit === "number") {
    safeLimit = Math.floor(limit);
  } else if (typeof limit === "string") {
    const parsed = parseInt(limit, 10);
    if (!isNaN(parsed)) {
      safeLimit = parsed;
    }
  }
  
  safeLimit = Math.max(1, Math.min(safeLimit, MAX_LIMIT));
  
  // Parse and clamp offset
  if (typeof offset === "number") {
    safeOffset = Math.floor(offset);
  } else if (typeof offset === "string") {
    const parsed = parseInt(offset, 10);
    if (!isNaN(parsed)) {
      safeOffset = parsed;
    }
  }
  
  safeOffset = Math.max(0, Math.min(safeOffset, MAX_OFFSET));
  
  return { limit: safeLimit, offset: safeOffset };
}

/**
 * Sanitize a numeric parameter (price, amount, etc.)
 * Returns null if invalid
 */
export function sanitizeNumber(input: unknown, min?: number, max?: number): number | null {
  let num: number;
  
  if (typeof input === "number") {
    num = input;
  } else if (typeof input === "string") {
    const parsed = parseFloat(input);
    if (isNaN(parsed)) {
      return null;
    }
    num = parsed;
  } else {
    return null;
  }
  
  if (!isFinite(num)) {
    return null;
  }
  
  if (min !== undefined && num < min) {
    return null;
  }
  
  if (max !== undefined && num > max) {
    return null;
  }
  
  return num;
}
