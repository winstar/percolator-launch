import { config } from "../config.js";

const HELIUS_WEBHOOKS_URL = `https://api.helius.dev/v0/webhooks`;

/**
 * Manages Helius webhook registration on server startup.
 * Creates or updates a webhook to receive enhanced transaction data
 * for all Percolator program IDs.
 */
export class HeliusWebhookManager {
  private webhookId: string | null = null;

  async start(): Promise<void> {
    if (!config.heliusApiKey) {
      console.warn("[HeliusWebhookManager] No HELIUS_API_KEY — skipping webhook registration");
      return;
    }
    if (!config.webhookUrl) {
      console.warn("[HeliusWebhookManager] No WEBHOOK_URL — skipping webhook registration");
      return;
    }

    try {
      // Check for existing webhook first
      const existing = await this.findExistingWebhook();
      if (existing) {
        console.log(`[HeliusWebhookManager] Found existing webhook ${existing.webhookID}, updating...`);
        await this.updateWebhook(existing.webhookID);
        this.webhookId = existing.webhookID;
      } else {
        console.log("[HeliusWebhookManager] Creating new webhook...");
        this.webhookId = await this.createWebhook();
      }
      console.log(`[HeliusWebhookManager] Webhook active: ${this.webhookId}`);
    } catch (err) {
      console.error("[HeliusWebhookManager] Failed to register webhook:", err instanceof Error ? err.message : err);
      console.warn("[HeliusWebhookManager] Falling back to polling-only mode");
    }
  }

  async stop(): Promise<void> {
    // Don't delete webhook on shutdown — it persists across deploys
    this.webhookId = null;
  }

  private get webhookPayload() {
    const webhookURL = `${config.webhookUrl}/webhook/trades`;
    // Detect network from RPC URL
    const isDevnet = config.rpcUrl.includes("devnet");
    return {
      webhookURL,
      transactionTypes: ["ANY"],
      accountAddresses: config.allProgramIds,
      webhookType: "enhanced" as const,
      authHeader: config.webhookSecret || undefined,
      // Helius requires network field — defaults to mainnet-beta if omitted
      ...(isDevnet ? { network: "devnet" } : {}),
    };
  }

  private async findExistingWebhook(): Promise<any | null> {
    const res = await fetch(`${HELIUS_WEBHOOKS_URL}?api-key=${config.heliusApiKey}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      console.warn(`[HeliusWebhookManager] Failed to list webhooks: ${res.status}`);
      return null;
    }

    const webhooks: any[] = await res.json();
    const targetURL = `${config.webhookUrl}/webhook/trades`;

    // Find webhook matching our URL
    return webhooks.find((w) => w.webhookURL === targetURL) ?? null;
  }

  private async createWebhook(): Promise<string> {
    const res = await fetch(`${HELIUS_WEBHOOKS_URL}?api-key=${config.heliusApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.webhookPayload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Helius webhook creation failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data.webhookID;
  }

  private async updateWebhook(webhookId: string): Promise<void> {
    const res = await fetch(`${HELIUS_WEBHOOKS_URL}/${webhookId}?api-key=${config.heliusApiKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.webhookPayload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Helius webhook update failed: ${res.status} ${text}`);
    }
  }
}
