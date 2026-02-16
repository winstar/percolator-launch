import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "../src/retry.js";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should succeed on first try", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withRetry(fn);

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("should retry on failure and eventually succeed", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Attempt 1 failed"))
      .mockRejectedValueOnce(new Error("Attempt 2 failed"))
      .mockResolvedValue("success");

    const promise = withRetry(fn, { maxRetries: 3 });

    // Fast-forward through retries
    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("should respect maxRetries limit", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Always fails"));

    const promise = withRetry(fn, { maxRetries: 2 });

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow("Always fails");
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("failed after 3 attempts")
    );
  });

  it("should use exponential backoff timing", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Fail"));
    const baseDelayMs = 100;

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs });

    // First failure - should schedule retry with ~100ms + jitter
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Second attempt after first delay (100ms * 2^0 + jitter)
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(2);

    // Third attempt after exponential delay (100ms * 2^1 + jitter)
    await vi.advanceTimersByTimeAsync(300);
    expect(fn).toHaveBeenCalledTimes(3);

    // Fourth attempt after exponential delay (100ms * 2^2 + jitter)
    await vi.advanceTimersByTimeAsync(500);
    expect(fn).toHaveBeenCalledTimes(4);

    await expect(promise).rejects.toThrow("Fail");
  });

  it("should cap delay at maxDelayMs", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Fail"));
    const baseDelayMs = 1000;
    const maxDelayMs = 2000;

    const promise = withRetry(fn, { maxRetries: 5, baseDelayMs, maxDelayMs });

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Delays should be capped at maxDelayMs even as exponent grows
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(maxDelayMs + 1100); // max + jitter room
      expect(fn).toHaveBeenCalledTimes(i + 2);
    }

    await expect(promise).rejects.toThrow("Fail");
  });

  it("should add jitter to delays", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Fail"));
    const baseDelayMs = 1000;

    // Mock Math.random to return predictable jitter
    const originalRandom = Math.random;
    Math.random = vi.fn().mockReturnValue(0.5); // 50% jitter

    const promise = withRetry(fn, { maxRetries: 1, baseDelayMs });

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // First retry: baseDelay * 2^0 + jitter = 1000 + 500 = 1500ms
    await vi.advanceTimersByTimeAsync(1500);
    expect(fn).toHaveBeenCalledTimes(2);

    Math.random = originalRandom;

    await expect(promise).rejects.toThrow("Fail");
  });

  it("should throw last error after all retries exhausted", async () => {
    const finalError = new Error("Final error");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Error 1"))
      .mockRejectedValueOnce(new Error("Error 2"))
      .mockRejectedValue(finalError);

    const promise = withRetry(fn, { maxRetries: 2 });

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow("Final error");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Final error")
    );
  });

  it("should pass through the label in logs", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Test error"));
    const label = "fetchMarketData";

    const promise = withRetry(fn, { maxRetries: 1, label });

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(label)
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(label)
    );
  });

  it("should use default options when none provided", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Fail"));

    const promise = withRetry(fn);

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow();
    
    // Default maxRetries = 3, so should be called 4 times (initial + 3 retries)
    expect(fn).toHaveBeenCalledTimes(4);
    
    // Should use default label "operation"
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("operation")
    );
  });

  it("should handle non-Error rejections", async () => {
    const fn = vi.fn().mockRejectedValue("string error");

    const promise = withRetry(fn, { maxRetries: 1 });

    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBe("string error");
    
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("string error")
    );
  });
});
