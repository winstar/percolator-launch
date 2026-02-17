import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Sentry from "@sentry/node";

// Mock the entire @sentry/node module
vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(() => "event-id-123"),
  captureMessage: vi.fn(() => "event-id-456"),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
}));

describe("sentry", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("initSentry", () => {
    it("should initialize Sentry when DSN is provided", async () => {
      process.env.SENTRY_DSN = "https://test@sentry.io/123";
      process.env.NODE_ENV = "production";

      const { initSentry } = await import("../src/sentry.js");
      initSentry("test-service");

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: "https://test@sentry.io/123",
          environment: "production",
          enabled: true,
        })
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Initialized for test-service")
      );
    });

    it("should not initialize Sentry when DSN is missing", async () => {
      delete process.env.SENTRY_DSN;

      const { initSentry } = await import("../src/sentry.js");
      initSentry("test-service");

      expect(Sentry.init).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Disabled")
      );
    });

    it("should set service name as tag", async () => {
      process.env.SENTRY_DSN = "https://test@sentry.io/123";

      const { initSentry } = await import("../src/sentry.js");
      initSentry("my-service");

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          initialScope: expect.objectContaining({
            tags: {
              service: "my-service",
            },
          }),
        })
      );
    });

    it("should use development environment by default", async () => {
      process.env.SENTRY_DSN = "https://test@sentry.io/123";
      delete process.env.NODE_ENV;

      const { initSentry } = await import("../src/sentry.js");
      initSentry("test-service");

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: "development",
        })
      );
    });

    it("should set traces sample rate to 10%", async () => {
      process.env.SENTRY_DSN = "https://test@sentry.io/123";

      const { initSentry } = await import("../src/sentry.js");
      initSentry("test-service");

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          tracesSampleRate: 0.1,
        })
      );
    });
  });

  describe("captureException", () => {
    it("should call Sentry.captureException with error", async () => {
      const { captureException } = await import("../src/sentry.js");
      const error = new Error("Test error");

      const eventId = captureException(error);

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        tags: undefined,
        extra: undefined,
        level: undefined,
      });
      expect(eventId).toBe("event-id-123");
    });

    it("should pass through context tags", async () => {
      const { captureException } = await import("../src/sentry.js");
      const error = new Error("Test error");
      const context = {
        tags: { operation: "fetchMarket", critical: "true" },
      };

      captureException(error, context);

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: { operation: "fetchMarket", critical: "true" },
        })
      );
    });

    it("should pass through extra context", async () => {
      const { captureException } = await import("../src/sentry.js");
      const error = new Error("Test error");
      const context = {
        extra: { userId: "123", requestId: "req-456" },
      };

      captureException(error, context);

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: { userId: "123", requestId: "req-456" },
        })
      );
    });

    it("should pass through severity level", async () => {
      const { captureException } = await import("../src/sentry.js");
      const error = new Error("Test error");
      const context = {
        level: "warning" as Sentry.SeverityLevel,
      };

      captureException(error, context);

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          level: "warning",
        })
      );
    });

    it("should handle non-Error exceptions", async () => {
      const { captureException } = await import("../src/sentry.js");
      const stringError = "String error";

      captureException(stringError);

      expect(Sentry.captureException).toHaveBeenCalledWith(
        stringError,
        expect.any(Object)
      );
    });
  });

  describe("captureMessage", () => {
    it("should call Sentry.captureMessage with message", async () => {
      const { captureMessage } = await import("../src/sentry.js");

      const eventId = captureMessage("Test message");

      expect(Sentry.captureMessage).toHaveBeenCalledWith("Test message", {
        tags: undefined,
        extra: undefined,
        level: "info",
      });
      expect(eventId).toBe("event-id-456");
    });

    it("should default level to info", async () => {
      const { captureMessage } = await import("../src/sentry.js");

      captureMessage("Test message");

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "Test message",
        expect.objectContaining({
          level: "info",
        })
      );
    });

    it("should allow custom severity level", async () => {
      const { captureMessage } = await import("../src/sentry.js");
      const context = {
        level: "error" as Sentry.SeverityLevel,
      };

      captureMessage("Error message", context);

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "Error message",
        expect.objectContaining({
          level: "error",
        })
      );
    });
  });

  describe("addBreadcrumb", () => {
    it("should call Sentry.addBreadcrumb", async () => {
      const { addBreadcrumb } = await import("../src/sentry.js");

      addBreadcrumb("User clicked button", { buttonId: "submit" });

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "User clicked button",
          data: { buttonId: "submit" },
          level: "info",
        })
      );
    });

    it("should include timestamp", async () => {
      const { addBreadcrumb } = await import("../src/sentry.js");
      const beforeTimestamp = Date.now() / 1000;

      addBreadcrumb("Test breadcrumb");

      const afterTimestamp = Date.now() / 1000;

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      );

      const call = (Sentry.addBreadcrumb as any).mock.calls[0][0];
      expect(call.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(call.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it("should default level to info", async () => {
      const { addBreadcrumb } = await import("../src/sentry.js");

      addBreadcrumb("Test");

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          level: "info",
        })
      );
    });

    it("should allow custom severity level", async () => {
      const { addBreadcrumb } = await import("../src/sentry.js");

      addBreadcrumb("Warning breadcrumb", undefined, "warning");

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          level: "warning",
        })
      );
    });
  });

  describe("setTag", () => {
    it("should call Sentry.setTag", async () => {
      const { setTag } = await import("../src/sentry.js");

      setTag("environment", "staging");

      expect(Sentry.setTag).toHaveBeenCalledWith("environment", "staging");
    });
  });

  describe("setUser", () => {
    it("should call Sentry.setUser", async () => {
      const { setUser } = await import("../src/sentry.js");
      const user = { id: "user-123", email: "test@example.com" };

      setUser(user);

      expect(Sentry.setUser).toHaveBeenCalledWith(user);
    });
  });

  describe("clearUser", () => {
    it("should call Sentry.setUser with null", async () => {
      const { clearUser } = await import("../src/sentry.js");

      clearUser();

      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });
  });
});
