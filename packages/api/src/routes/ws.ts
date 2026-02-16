import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { IncomingMessage } from "node:http";
import { createHmac } from "node:crypto";
import { eventBus, getSupabase, createLogger, sanitizeSlabAddress } from "@percolator/shared";

const logger = createLogger("api:ws");

// H2: Configurable limits
const MAX_WS_CONNECTIONS = Number(process.env.MAX_WS_CONNECTIONS ?? 500);
const MAX_BUFFER_BYTES = 64 * 1024; // 64KB
const MAX_SUBSCRIPTIONS_PER_CLIENT = 50; // Prevent Helius WS subscription exhaustion
const MAX_GLOBAL_SUBSCRIPTIONS = 1000; // Global subscription cap to prevent DoS
const MAX_CONNECTIONS_PER_IP = 5; // Max concurrent connections per IP

// Authentication settings
const WS_AUTH_REQUIRED = process.env.WS_AUTH_REQUIRED === "true";
const WS_AUTH_SECRET = process.env.WS_AUTH_SECRET || "percolator-ws-secret-change-in-production";
const AUTH_TIMEOUT_MS = 5_000; // 5 seconds to authenticate

interface WsClient {
  ws: WebSocket;
  subscriptions: Set<string>;
  pingInterval?: ReturnType<typeof setInterval>; // BH2: Heartbeat timer
  isAlive: boolean; // BH2: Track pong responses
  authenticated: boolean; // Auth status
  ip: string; // Client IP address
  authTimeout?: ReturnType<typeof setTimeout>; // Auth timeout timer
}

// Track global subscription count across all clients
let globalSubscriptionCount = 0;

// Track connections per IP
const connectionsPerIp = new Map<string, number>();

// BH2: Heartbeat configuration
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Extract client IP from request
 */
function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

/**
 * Generate an auth token (HMAC of slab address + timestamp)
 * This is a simple token system - can be upgraded to JWT later
 */
export function generateWsToken(slabAddress: string): string {
  const timestamp = Date.now();
  const payload = `${slabAddress}:${timestamp}`;
  const hmac = createHmac("sha256", WS_AUTH_SECRET);
  hmac.update(payload);
  return `${payload}:${hmac.digest("hex")}`;
}

/**
 * Verify an auth token
 */
function verifyWsToken(token: string): boolean {
  try {
    const parts = token.split(":");
    if (parts.length !== 3) return false;
    
    const [slabAddress, timestampStr, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    
    // Check timestamp is within last 5 minutes
    const now = Date.now();
    if (now - timestamp > 5 * 60 * 1000) {
      return false;
    }
    
    // Verify HMAC
    const payload = `${slabAddress}:${timestampStr}`;
    const hmac = createHmac("sha256", WS_AUTH_SECRET);
    hmac.update(payload);
    const expectedSignature = hmac.digest("hex");
    
    return signature === expectedSignature;
  } catch {
    return false;
  }
}

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, maxPayload: 4096 });
  // H2: Use Set for O(1) removal
  const clients = new Set<WsClient>();

  // Broadcast price updates to subscribed clients
  eventBus.on("price.updated", (payload: any) => {
    const msg = JSON.stringify({
      type: "price.updated",
      slabAddress: payload.slabAddress,
      data: payload.data,
      timestamp: payload.timestamp,
    });

    for (const client of clients) {
      if (
        client.ws.readyState === WebSocket.OPEN &&
        client.subscriptions.has(payload.slabAddress) // H2: removed default "*" — must explicitly subscribe
      ) {
        // H2: Check bufferedAmount before sending
        if (client.ws.bufferedAmount > MAX_BUFFER_BYTES) continue;
        client.ws.send(msg);
      }
    }
  });

  // Broadcast trade events to subscribed clients
  eventBus.on("trade.executed", (payload: any) => {
    const msg = JSON.stringify({
      type: "trade.executed",
      slabAddress: payload.slabAddress,
      data: payload.data,
      timestamp: payload.timestamp,
    });

    for (const client of clients) {
      if (
        client.ws.readyState === WebSocket.OPEN &&
        client.subscriptions.has(payload.slabAddress)
      ) {
        if (client.ws.bufferedAmount > MAX_BUFFER_BYTES) continue;
        client.ws.send(msg);
      }
    }
  });

  wss.on("connection", (ws, req: IncomingMessage) => {
    const clientIp = getClientIp(req);
    
    // H2: Reject if at max connections
    if (clients.size >= MAX_WS_CONNECTIONS) {
      logger.warn("Max global WS connections reached", { ip: clientIp });
      ws.close(1013, "Max connections reached");
      return;
    }
    
    // Check connections per IP
    const ipConnections = connectionsPerIp.get(clientIp) || 0;
    if (ipConnections >= MAX_CONNECTIONS_PER_IP) {
      logger.warn("Max connections per IP reached", { ip: clientIp, count: ipConnections });
      ws.close(1013, `Max ${MAX_CONNECTIONS_PER_IP} connections per IP`);
      return;
    }
    
    // Increment IP connection count
    connectionsPerIp.set(clientIp, ipConnections + 1);
    
    // Check for auth token in query params (optional)
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    
    // Determine if authenticated
    let authenticated = !WS_AUTH_REQUIRED; // If auth not required, auto-authenticate
    if (WS_AUTH_REQUIRED && token) {
      authenticated = verifyWsToken(token);
      if (!authenticated) {
        logger.warn("Invalid WS auth token provided", { ip: clientIp });
      }
    }

    // H2: No default "*" subscription — clients must explicitly subscribe
    const client: WsClient = { 
      ws, 
      subscriptions: new Set(), 
      isAlive: true,
      authenticated,
      ip: clientIp
    };
    clients.add(client);
    
    logger.info("WebSocket connection established", { 
      ip: clientIp, 
      authenticated,
      totalClients: clients.size 
    });
    
    // If auth required and not authenticated, set timeout
    if (WS_AUTH_REQUIRED && !authenticated) {
      client.authTimeout = setTimeout(() => {
        if (!client.authenticated) {
          logger.warn("Client failed to authenticate within timeout", { ip: clientIp });
          ws.close(1008, "Authentication timeout");
        }
      }, AUTH_TIMEOUT_MS);
    }

    // BH2: Set up ping/pong heartbeat
    ws.on("pong", () => {
      client.isAlive = true;
    });

    client.pingInterval = setInterval(() => {
      if (!client.isAlive) {
        // Client didn't respond to last ping — terminate
        clearInterval(client.pingInterval);
        ws.terminate();
        return;
      }
      client.isAlive = false;
      ws.ping();
    }, HEARTBEAT_INTERVAL_MS);

    ws.send(JSON.stringify({ type: "connected", message: "Percolator WebSocket connected" }));

    ws.on("message", async (raw) => {
      try {
        const rawStr = raw.toString();
        
        // Limit message size
        if (rawStr.length > 1024) {
          ws.send(JSON.stringify({ type: "error", message: "Message too large" }));
          return;
        }
        
        const msg = JSON.parse(rawStr) as { type: string; slabAddress?: string; token?: string };
        
        // Handle auth message
        if (msg.type === "auth" && msg.token) {
          if (verifyWsToken(msg.token)) {
            client.authenticated = true;
            if (client.authTimeout) {
              clearTimeout(client.authTimeout);
              client.authTimeout = undefined;
            }
            logger.info("Client authenticated via message", { ip: client.ip });
            ws.send(JSON.stringify({ type: "authenticated" }));
          } else {
            logger.warn("Invalid auth token in message", { ip: client.ip });
            ws.send(JSON.stringify({ type: "error", message: "Invalid authentication token" }));
          }
          return;
        }
        
        // If auth required and not authenticated, reject all other messages
        if (WS_AUTH_REQUIRED && !client.authenticated) {
          ws.send(JSON.stringify({ type: "error", message: "Authentication required" }));
          return;
        }
        
        if (msg.type === "subscribe" && msg.slabAddress) {
          // Sanitize slab address
          const sanitized = sanitizeSlabAddress(msg.slabAddress);
          if (!sanitized) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid slab address" }));
            return;
          }
          
          // Cap global subscriptions to prevent DoS
          if (globalSubscriptionCount >= MAX_GLOBAL_SUBSCRIPTIONS) {
            ws.send(JSON.stringify({ type: "error", message: `Server subscription limit reached (${MAX_GLOBAL_SUBSCRIPTIONS})` }));
            return;
          }
          
          // Cap subscriptions per client to prevent Helius WS exhaustion
          if (client.subscriptions.size >= MAX_SUBSCRIPTIONS_PER_CLIENT) {
            ws.send(JSON.stringify({ type: "error", message: `Max ${MAX_SUBSCRIPTIONS_PER_CLIENT} subscriptions per connection` }));
            return;
          }
          
          client.subscriptions.add(sanitized);
          globalSubscriptionCount++;

          ws.send(JSON.stringify({ type: "subscribed", slabAddress: sanitized }));

          // Optionally send current price from Supabase
          try {
            const { data: stats } = await getSupabase()
              .from("market_stats")
              .select("last_price, mark_price, index_price, updated_at")
              .eq("slab_address", sanitized)
              .single();

            if (stats && stats.last_price) {
              if (ws.bufferedAmount <= MAX_BUFFER_BYTES) {
                ws.send(
                  JSON.stringify({
                    type: "price.updated",
                    slabAddress: sanitized,
                    data: { 
                      priceE6: stats.last_price,
                      markPriceE6: stats.mark_price,
                      indexPriceE6: stats.index_price,
                      source: "supabase"
                    },
                    timestamp: stats.updated_at,
                  }),
                );
              }
            }
          } catch {
            // Ignore errors fetching initial price
          }
        } else if (msg.type === "unsubscribe" && msg.slabAddress) {
          const sanitized = sanitizeSlabAddress(msg.slabAddress);
          if (sanitized && client.subscriptions.delete(sanitized)) {
            globalSubscriptionCount--;
          }
          ws.send(JSON.stringify({ type: "unsubscribed", slabAddress: sanitized }));
        }
      } catch (err) {
        logger.warn("Error processing WS message", { ip: client.ip, error: err });
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      // BH2: Clean up heartbeat interval
      if (client.pingInterval) {
        clearInterval(client.pingInterval);
      }
      
      // Clean up auth timeout
      if (client.authTimeout) {
        clearTimeout(client.authTimeout);
      }
      
      // Decrement IP connection count
      const ipCount = connectionsPerIp.get(client.ip) || 1;
      if (ipCount <= 1) {
        connectionsPerIp.delete(client.ip);
      } else {
        connectionsPerIp.set(client.ip, ipCount - 1);
      }
      
      // H2: O(1) removal with Set
      // Decrement global subscription count for all client subscriptions
      globalSubscriptionCount -= client.subscriptions.size;
      clients.delete(client);
      
      logger.info("WebSocket connection closed", { 
        ip: client.ip, 
        totalClients: clients.size 
      });
    });
  });

  return wss;
}
