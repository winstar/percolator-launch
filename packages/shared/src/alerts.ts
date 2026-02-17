import { createLogger } from "./logger.js";

const logger = createLogger("alerts");

type AlertSeverity = "critical" | "warning" | "info";

interface DiscordEmbed {
  title?: string;
  description: string;
  color: number;
  timestamp: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

interface DiscordPayload {
  content?: string;
  embeds: DiscordEmbed[];
}

// Color mapping for severity levels
const SEVERITY_COLORS: Record<AlertSeverity, number> = {
  critical: 0xdc2626, // Red
  warning: 0xf59e0b, // Amber
  info: 0x3b82f6, // Blue
};

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: "🚨",
  warning: "⚠️",
  info: "ℹ️",
};

/**
 * Send an alert to Discord via webhook
 * @param message - Alert message
 * @param severity - Alert severity level
 * @param fields - Additional structured fields
 */
export async function sendAlert(
  message: string,
  severity: AlertSeverity,
  fields?: Array<{ name: string; value: string; inline?: boolean }>
): Promise<void> {
  const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK;
  
  if (!webhookUrl) {
    logger.debug("Discord webhook not configured, skipping alert", { message, severity });
    return;
  }

  try {
    const embed: DiscordEmbed = {
      title: `${SEVERITY_EMOJI[severity]} ${severity.toUpperCase()} Alert`,
      description: message,
      color: SEVERITY_COLORS[severity],
      timestamp: new Date().toISOString(),
      fields,
    };

    const payload: DiscordPayload = {
      embeds: [embed],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Failed to send Discord alert", {
        status: response.status,
        error: errorText,
        message,
        severity,
      });
    } else {
      logger.debug("Alert sent to Discord", { message, severity });
    }
  } catch (err) {
    logger.error("Error sending Discord alert", {
      error: err instanceof Error ? err.message : String(err),
      message,
      severity,
    });
  }
}

/**
 * Send a critical alert
 */
export async function sendCriticalAlert(
  message: string,
  fields?: Array<{ name: string; value: string; inline?: boolean }>
): Promise<void> {
  await sendAlert(message, "critical", fields);
}

/**
 * Send a warning alert
 */
export async function sendWarningAlert(
  message: string,
  fields?: Array<{ name: string; value: string; inline?: boolean }>
): Promise<void> {
  await sendAlert(message, "warning", fields);
}

/**
 * Send an info alert
 */
export async function sendInfoAlert(
  message: string,
  fields?: Array<{ name: string; value: string; inline?: boolean }>
): Promise<void> {
  await sendAlert(message, "info", fields);
}
