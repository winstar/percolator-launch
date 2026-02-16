import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../src/logger.js";

describe("logger", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("should create logger with service name", async () => {
    delete process.env.NODE_ENV;
    
    const { createLogger } = await import("../src/logger.js");
    const logger = createLogger("test-service");

    logger.info("Test message");

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("test-service")
    );
  });

  it("should log at each level (debug, info, warn, error)", async () => {
    delete process.env.NODE_ENV;
    
    const { createLogger } = await import("../src/logger.js");
    const logger = createLogger("test-service");

    logger.debug("Debug message");
    logger.info("Info message");
    logger.warn("Warning message");
    logger.error("Error message");

    expect(consoleLogSpy).toHaveBeenCalledTimes(4);
    expect(consoleLogSpy).toHaveBeenNthCalledWith(1, expect.stringContaining("DEBUG"));
    expect(consoleLogSpy).toHaveBeenNthCalledWith(2, expect.stringContaining("INFO"));
    expect(consoleLogSpy).toHaveBeenNthCalledWith(3, expect.stringContaining("WARN"));
    expect(consoleLogSpy).toHaveBeenNthCalledWith(4, expect.stringContaining("ERROR"));
  });

  it("should include timestamp, level, service in output", async () => {
    delete process.env.NODE_ENV;
    
    const { createLogger } = await import("../src/logger.js");
    const logger = createLogger("my-service");

    logger.info("Test message");

    const logOutput = consoleLogSpy.mock.calls[0][0];
    
    // Check for timestamp (ISO format)
    expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    
    // Check for level
    expect(logOutput).toContain("INFO");
    
    // Check for service name
    expect(logOutput).toContain("[my-service]");
    
    // Check for message
    expect(logOutput).toContain("Test message");
  });

  it("should output JSON in production mode", async () => {
    process.env.NODE_ENV = "production";
    
    const { createLogger } = await import("../src/logger.js");
    const logger = createLogger("prod-service");

    logger.info("Production log", { userId: "123", action: "login" });

    const logOutput = consoleLogSpy.mock.calls[0][0];
    
    // Should be valid JSON
    const parsed = JSON.parse(logOutput);
    
    expect(parsed).toMatchObject({
      level: "info",
      service: "prod-service",
      message: "Production log",
      context: {
        userId: "123",
        action: "login",
      },
    });
    
    expect(parsed.timestamp).toBeDefined();
  });

  it("should output pretty format in development mode", async () => {
    process.env.NODE_ENV = "development";
    
    const { createLogger } = await import("../src/logger.js");
    const logger = createLogger("dev-service");

    logger.warn("Development warning");

    const logOutput = consoleLogSpy.mock.calls[0][0];
    
    // Should NOT be JSON, should be human-readable
    expect(() => JSON.parse(logOutput)).toThrow();
    expect(logOutput).toContain("WARN");
    expect(logOutput).toContain("[dev-service]");
    expect(logOutput).toContain("Development warning");
  });

  it("should include context in log output", async () => {
    delete process.env.NODE_ENV;
    
    const { createLogger } = await import("../src/logger.js");
    const logger = createLogger("test-service");

    logger.info("User action", { userId: "user-123", action: "purchase", amount: 99.99 });

    const logOutput = consoleLogSpy.mock.calls[0][0];
    
    expect(logOutput).toContain("User action");
    expect(logOutput).toContain("userId");
    expect(logOutput).toContain("user-123");
    expect(logOutput).toContain("action");
    expect(logOutput).toContain("purchase");
  });

  it("should handle logs without context", async () => {
    delete process.env.NODE_ENV;
    
    const { createLogger } = await import("../src/logger.js");
    const logger = createLogger("test-service");

    logger.error("Simple error");

    const logOutput = consoleLogSpy.mock.calls[0][0];
    
    expect(logOutput).toContain("ERROR");
    expect(logOutput).toContain("Simple error");
    expect(logOutput).toContain("[test-service]");
  });

  it("should format log levels with consistent padding", async () => {
    delete process.env.NODE_ENV;
    
    const { createLogger } = await import("../src/logger.js");
    const logger = createLogger("test");

    logger.debug("msg");
    logger.info("msg");
    logger.warn("msg");
    logger.error("msg");

    // All levels should be padded to 5 characters
    const outputs = consoleLogSpy.mock.calls.map(call => call[0]);
    
    outputs.forEach(output => {
      // Find the level string (should be between timestamp and service)
      const match = output.match(/\] (\w+)\s+\[/);
      expect(match).toBeTruthy();
      
      if (match) {
        const level = match[1];
        expect(level.length).toBe(5); // DEBUG, INFO, WARN, ERROR all padded to 5
      }
    });
  });

  it("should handle complex context objects in production", async () => {
    process.env.NODE_ENV = "production";
    
    const { createLogger } = await import("../src/logger.js");
    const logger = createLogger("test");

    const complexContext = {
      user: { id: "123", name: "Test" },
      metadata: { ip: "127.0.0.1", userAgent: "Mozilla" },
      tags: ["important", "security"],
    };

    logger.error("Complex log", complexContext);

    const logOutput = consoleLogSpy.mock.calls[0][0];
    const parsed = JSON.parse(logOutput);
    
    expect(parsed.context).toEqual(complexContext);
  });
});
