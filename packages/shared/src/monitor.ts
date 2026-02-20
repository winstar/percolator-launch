import { createLogger } from "./logger.js";
import { sendCriticalAlert, sendWarningAlert } from "./alerts.js";

const logger = createLogger("monitor");

interface MonitorThresholds {
  /** Max consecutive failures before alerting */
  maxConsecutiveFailures: number;
  /** Max time in ms since last success before alerting */
  maxStalenessMs: number;
  /** Max error rate (0-1) before alerting */
  maxErrorRate: number;
  /** Window size for error rate calculation */
  errorRateWindow: number;
}

interface MonitorState {
  consecutiveFailures: number;
  lastSuccessTime: number;
  recentResults: boolean[]; // true = success, false = failure
  alertSent: boolean; // prevent alert spam
  lastAlertTime: number;
}

const DEFAULT_THRESHOLDS: MonitorThresholds = {
  maxConsecutiveFailures: 3,
  maxStalenessMs: 300_000, // 5 minutes
  maxErrorRate: 0.1, // 10%
  errorRateWindow: 20, // last 20 checks
};

// Minimum interval between alerts (5 minutes)
const ALERT_COOLDOWN_MS = 300_000;

/**
 * Service health monitor with automatic Discord alerting.
 * 
 * Tracks consecutive failures, staleness, and error rates.
 * Sends Discord alerts when thresholds are exceeded.
 * Auto-recovers and sends resolution alerts.
 */
export class ServiceMonitor {
  private state: MonitorState;
  private thresholds: MonitorThresholds;
  private serviceName: string;
  private checkName: string;

  constructor(
    serviceName: string,
    checkName: string,
    thresholds?: Partial<MonitorThresholds>
  ) {
    this.serviceName = serviceName;
    this.checkName = checkName;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.state = {
      consecutiveFailures: 0,
      lastSuccessTime: Date.now(),
      recentResults: [],
      alertSent: false,
      lastAlertTime: 0,
    };
  }

  /**
   * Record a successful check
   */
  async recordSuccess(): Promise<void> {
    const wasAlerting = this.state.alertSent;
    this.state.consecutiveFailures = 0;
    this.state.lastSuccessTime = Date.now();
    this.pushResult(true);

    // Send recovery alert if we were previously alerting
    if (wasAlerting) {
      this.state.alertSent = false;
      logger.info("Service recovered", {
        service: this.serviceName,
        check: this.checkName,
      });
      await sendWarningAlert(
        `✅ ${this.serviceName} — ${this.checkName} recovered`,
        [
          { name: "Service", value: this.serviceName, inline: true },
          { name: "Check", value: this.checkName, inline: true },
          { name: "Error Rate", value: `${(this.getErrorRate() * 100).toFixed(1)}%`, inline: true },
        ]
      );
    }
  }

  /**
   * Record a failed check
   */
  async recordFailure(error?: string): Promise<void> {
    this.state.consecutiveFailures++;
    this.pushResult(false);

    const errorRate = this.getErrorRate();
    const timeSinceSuccess = Date.now() - this.state.lastSuccessTime;
    const shouldAlert =
      this.state.consecutiveFailures >= this.thresholds.maxConsecutiveFailures ||
      timeSinceSuccess >= this.thresholds.maxStalenessMs ||
      errorRate >= this.thresholds.maxErrorRate;

    if (shouldAlert && this.canAlert()) {
      this.state.alertSent = true;
      this.state.lastAlertTime = Date.now();

      const fields = [
        { name: "Service", value: this.serviceName, inline: true },
        { name: "Check", value: this.checkName, inline: true },
        { name: "Consecutive Failures", value: this.state.consecutiveFailures.toString(), inline: true },
        { name: "Error Rate", value: `${(errorRate * 100).toFixed(1)}%`, inline: true },
        { name: "Time Since Success", value: formatDuration(timeSinceSuccess), inline: true },
      ];

      if (error) {
        fields.push({ name: "Last Error", value: error.slice(0, 200), inline: false });
      }

      logger.error("Monitor threshold exceeded", {
        service: this.serviceName,
        check: this.checkName,
        consecutiveFailures: this.state.consecutiveFailures,
        errorRate,
        timeSinceSuccessMs: timeSinceSuccess,
      });

      await sendCriticalAlert(
        `${this.serviceName} — ${this.checkName} failing`,
        fields
      );
    }
  }

  /**
   * Get current error rate (0-1)
   */
  getErrorRate(): number {
    if (this.state.recentResults.length === 0) return 0;
    const failures = this.state.recentResults.filter((r) => !r).length;
    return failures / this.state.recentResults.length;
  }

  /**
   * Get current monitor status
   */
  getStatus(): {
    healthy: boolean;
    consecutiveFailures: number;
    errorRate: number;
    timeSinceSuccessMs: number;
    alertActive: boolean;
  } {
    return {
      healthy: this.state.consecutiveFailures === 0,
      consecutiveFailures: this.state.consecutiveFailures,
      errorRate: this.getErrorRate(),
      timeSinceSuccessMs: Date.now() - this.state.lastSuccessTime,
      alertActive: this.state.alertSent,
    };
  }

  private pushResult(success: boolean): void {
    this.state.recentResults.push(success);
    if (this.state.recentResults.length > this.thresholds.errorRateWindow) {
      this.state.recentResults.shift();
    }
  }

  private canAlert(): boolean {
    return Date.now() - this.state.lastAlertTime >= ALERT_COOLDOWN_MS;
  }
}

/**
 * Create standard monitors for a service
 */
export function createServiceMonitors(serviceName: string) {
  return {
    rpc: new ServiceMonitor(serviceName, "RPC Connectivity", {
      maxConsecutiveFailures: 3,
      maxStalenessMs: 120_000, // 2 min
      maxErrorRate: 0.1,
    }),
    scan: new ServiceMonitor(serviceName, "Market Scan", {
      maxConsecutiveFailures: 3,
      maxStalenessMs: 300_000, // 5 min
    }),
    oracle: new ServiceMonitor(serviceName, "Oracle Price", {
      maxConsecutiveFailures: 5,
      maxStalenessMs: 30_000, // 30s — oracle staleness is critical
      maxErrorRate: 0.2,
    }),
    db: new ServiceMonitor(serviceName, "Database", {
      maxConsecutiveFailures: 2,
      maxStalenessMs: 60_000, // 1 min
    }),
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}
