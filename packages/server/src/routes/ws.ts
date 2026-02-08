import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { OracleService } from "../services/oracle.js";
import { eventBus } from "../services/events.js";

interface WsClient {
  ws: WebSocket;
  subscriptions: Set<string>;
}

export function setupWebSocket(
  server: Server,
  oracleService: OracleService,
): WebSocketServer {
  const wss = new WebSocketServer({ server });
  const clients: WsClient[] = [];

  // Broadcast price updates to subscribed clients
  eventBus.on("price.updated", (payload) => {
    const msg = JSON.stringify({
      type: "price.updated",
      slabAddress: payload.slabAddress,
      data: payload.data,
      timestamp: payload.timestamp,
    });

    for (const client of clients) {
      if (
        client.ws.readyState === WebSocket.OPEN &&
        (client.subscriptions.has(payload.slabAddress) || client.subscriptions.has("*"))
      ) {
        client.ws.send(msg);
      }
    }
  });

  wss.on("connection", (ws) => {
    const client: WsClient = { ws, subscriptions: new Set(["*"]) };
    clients.push(client);

    // Send current prices on connect
    const crankMarkets = Array.from(new Set([...clients.flatMap((c) => [...c.subscriptions])]));
    // Actually just send all we have — iterate nothing specific, user will subscribe
    ws.send(JSON.stringify({ type: "connected", message: "Percolator WebSocket connected" }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; slabAddress?: string };
        if (msg.type === "subscribe" && msg.slabAddress) {
          client.subscriptions.add(msg.slabAddress);
          ws.send(JSON.stringify({ type: "subscribed", slabAddress: msg.slabAddress }));

          // Send current price if available
          const price = oracleService.getCurrentPrice(msg.slabAddress);
          if (price) {
            ws.send(
              JSON.stringify({
                type: "price.updated",
                slabAddress: msg.slabAddress,
                data: { priceE6: price.priceE6.toString(), source: price.source },
                timestamp: price.timestamp,
              }),
            );
          }
        } else if (msg.type === "unsubscribe" && msg.slabAddress) {
          client.subscriptions.delete(msg.slabAddress);
          ws.send(JSON.stringify({ type: "unsubscribed", slabAddress: msg.slabAddress }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      const idx = clients.indexOf(client);
      if (idx >= 0) clients.splice(idx, 1);
    });
  });

  return wss;
}
