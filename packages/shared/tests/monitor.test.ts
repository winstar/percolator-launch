import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ServiceMonitor, createServiceMonitors } from "../src/monitor.js";

// Mock alerts module
vi.mock("../src/alerts.js", () => ({
  sendCriticalAlert: vi.fn(),
  sendWarningAlert: vi.fn(),
}));

import { sendCriticalAlert, sendWarningAlert } from "../src/alerts.js";

describe("ServiceMonitor", () => {
  let monitor: ServiceMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    monitor = new ServiceMonitor("test-service", "test-check", {
      maxConsecutiveFailures: 3,
      maxStalenessMs: 60_000,
      maxErrorRate: 0.5,
      errorRateWindow: 10,
    });
  });

  it("should start healthy", () => {
    const status = monitor.getStatus();
    expect(status.healthy).toBe(true);
    expect(status.consecutiveFailures).toBe(0);
    expect(status.alertActive).toBe(false);
  });

  it("should track consecutive failures", async () => {
    await monitor.recordFailure("err1");
    await monitor.recordFailure("err2");
    expect(monitor.getStatus().consecutiveFailures).toBe(2);
    expect(monitor.getStatus().healthy).toBe(false);
  });

  it("should reset failures on success", async () => {
    await monitor.recordFailure("err1");
    await monitor.recordFailure("err2");
    await monitor.recordSuccess();
    expect(monitor.getStatus().consecutiveFailures).toBe(0);
    expect(monitor.getStatus().healthy).toBe(true);
  });

  it("should alert after maxConsecutiveFailures", async () => {
    await monitor.recordFailure("err1");
    await monitor.recordFailure("err2");
    expect(sendCriticalAlert).not.toHaveBeenCalled();
    await monitor.recordFailure("err3");
    expect(sendCriticalAlert).toHaveBeenCalledTimes(1);
    expect(monitor.getStatus().alertActive).toBe(true);
  });

  it("should send recovery alert after alerting then succeeding", async () => {
    await monitor.recordFailure("err1");
    await monitor.recordFailure("err2");
    await monitor.recordFailure("err3");
    expect(sendCriticalAlert).toHaveBeenCalledTimes(1);
    await monitor.recordSuccess();
    expect(sendWarningAlert).toHaveBeenCalledTimes(1);
    expect(monitor.getStatus().alertActive).toBe(false);
  });

  it("should calculate error rate correctly", async () => {
    for (let i = 0; i < 8; i++) await monitor.recordSuccess();
    for (let i = 0; i < 2; i++) await monitor.recordFailure();
    expect(monitor.getErrorRate()).toBeCloseTo(0.2);
  });

  it("should not send duplicate alerts within cooldown", async () => {
    for (let i = 0; i < 6; i++) await monitor.recordFailure("err");
    // Only 1 alert despite 6 failures (cooldown prevents second)
    expect(sendCriticalAlert).toHaveBeenCalledTimes(1);
  });
});

describe("createServiceMonitors", () => {
  it("should create standard monitor set", () => {
    const monitors = createServiceMonitors("keeper");
    expect(monitors.rpc).toBeInstanceOf(ServiceMonitor);
    expect(monitors.scan).toBeInstanceOf(ServiceMonitor);
    expect(monitors.oracle).toBeInstanceOf(ServiceMonitor);
    expect(monitors.db).toBeInstanceOf(ServiceMonitor);
  });
});
