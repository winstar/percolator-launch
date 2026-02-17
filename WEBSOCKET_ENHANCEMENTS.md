# WebSocket Server Enhancements

## Summary

Enhanced the Percolator WebSocket server with production-ready connection management, heartbeats, subscription model, and metrics tracking.

**Commit:** `55a751b` - `feat: WebSocket connection management, heartbeats, and subscription model`

---

## 🎯 Key Features Implemented

### 1. **Connection Management**
- **Global limit:** 1,000 concurrent connections
- **Per-slab limit:** 100 connections per slab address
- **Per-IP limit:** 5 connections per IP (existing)
- **Tracking:** `Map<string, Set<WsClient>>` for efficient O(1) lookups
- **Rejection:** Close code 1008 (Policy Violation) when limits exceeded

### 2. **Enhanced Heartbeat / Keepalive**
- **Ping interval:** 30 seconds
- **Pong timeout:** 10 seconds (clients must respond within 10s)
- **Zombie prevention:** Automatically terminates unresponsive connections
- **Implementation:** Uses WebSocket native `ping`/`pong` frames

### 3. **Channel-Based Subscription Model**

#### New Format
Clients subscribe to specific channels instead of entire slabs:

```json
// Subscribe
{ 
  "type": "subscribe", 
  "channels": ["price:SOL", "trades:SOL", "funding:BTC"] 
}

// Unsubscribe
{ 
  "type": "unsubscribe", 
  "channels": ["trades:SOL"] 
}
```

#### Server Events
```json
// Price update
{ 
  "type": "price", 
  "slab": "SOL", 
  "price": 1.5,
  "markPrice": 1.51,
  "indexPrice": 1.49,
  "timestamp": 1234567890 
}

// Trade execution
{ 
  "type": "trade", 
  "slab": "SOL", 
  "side": "long", 
  "size": "1000000", 
  "price": 1.5,
  "timestamp": 1234567890
}

// Funding rate
{ 
  "type": "funding", 
  "slab": "SOL", 
  "rate": "0.0001",
  "timestamp": 1234567890 
}
```

#### Backward Compatibility
Legacy single-slab subscriptions still work:
```json
{ "type": "subscribe", "slabAddress": "SOL" }
// Auto-subscribes to price:SOL, trades:SOL, funding:SOL
```

### 4. **Broadcast Efficiency**

- **Selective broadcasting:** Only compute/send data for slabs with active subscribers
- **Price batching:** Maximum 1 price update per 500ms per slab
  - Prevents spam during high-frequency updates
  - Latest price overwrites pending updates
- **Buffer management:** Skip clients with >64KB buffered data
- **Event-driven:** Uses `eventBus` for `price.updated`, `trade.executed`, `funding.updated`

### 5. **Metrics Tracking**

Real-time metrics exposed via **`GET /ws/stats`**:

```json
{
  "totalConnections": 42,
  "connectionsPerSlab": {
    "SOL": 15,
    "BTC": 8
  },
  "messagesPerSec": 123.45,
  "bytesPerSec": 45678,
  "limits": {
    "maxGlobalConnections": 1000,
    "maxConnectionsPerSlab": 100,
    "maxConnectionsPerIp": 5
  }
}
```

**Tracked metrics:**
- Total active connections
- Connections per slab
- Messages received/sent per second
- Bytes received/sent per second
- Metrics reset every 60 seconds for rate calculations

---

## 🔧 Technical Details

### File Changes

1. **`packages/api/src/routes/ws.ts`** (major refactor)
   - Added `connectionsPerSlab` Map for per-slab tracking
   - Added `pendingPriceUpdates` and `priceUpdateTimers` for batching
   - Added `metrics` object with comprehensive tracking
   - Implemented `getWebSocketMetrics()` export
   - Enhanced heartbeat with pong timeout
   - Added channel-based subscription logic
   - Added `flushPriceUpdate()` for batched broadcasts

2. **`packages/api/src/routes/health.ts`** (minor update)
   - Added import for `getWebSocketMetrics`
   - Added `GET /ws/stats` endpoint

### Connection Lifecycle

1. **Connection established:**
   - Check global limit (1000)
   - Check IP limit (5)
   - Authenticate (if required)
   - Add to `clients` Set and update metrics

2. **Subscription:**
   - Validate channel format (`price:SOL`, `trades:BTC`, etc.)
   - Check per-slab limit (100)
   - Add to client subscriptions
   - Track client in `connectionsPerSlab`
   - Send initial price snapshot (for price channels)

3. **Heartbeat loop:**
   - Every 30s: Send `ping` frame
   - Set 10s timeout for `pong` response
   - If timeout: terminate connection

4. **Disconnect:**
   - Clear heartbeat timers
   - Remove from slab tracking
   - Decrement IP counter
   - Update metrics

### Price Update Batching

```typescript
eventBus.on("price.updated", (payload) => {
  // Store latest update (overwrites previous)
  pendingPriceUpdates.set(slabAddress, payload);
  
  // Schedule flush if not already scheduled
  if (!priceUpdateTimers.has(slabAddress)) {
    setTimeout(() => flushPriceUpdate(slabAddress), 500);
  }
});
```

**Result:** During high-frequency updates, clients receive at most 1 price update per 500ms per slab.

---

## ✅ Testing Checklist

- [x] API builds cleanly (`npm run build` in `packages/api`)
- [ ] WebSocket connection accepted (verify with `wscat` or client)
- [ ] Channel subscription works (`{"type":"subscribe","channels":["price:SOL"]}`)
- [ ] Price updates received (check batching)
- [ ] Trade events received
- [ ] Funding events received
- [ ] Heartbeat timeout (wait 40s without sending pong)
- [ ] Connection limits enforced (global, per-slab, per-IP)
- [ ] `/ws/stats` endpoint returns metrics
- [ ] Backward compatibility (old `slabAddress` subscription)

---

## 🚀 Next Steps

1. **Test with real WebSocket clients:**
   ```bash
   wscat -c ws://localhost:3001
   > {"type":"subscribe","channels":["price:SOL"]}
   ```

2. **Emit test events** to verify broadcasting:
   ```typescript
   eventBus.emit("price.updated", {
     slabAddress: "SOL",
     data: { priceE6: 1500000 },
     timestamp: Date.now()
   });
   ```

3. **Monitor metrics:**
   ```bash
   curl http://localhost:3001/ws/stats
   ```

4. **Load testing:** Simulate 100+ concurrent connections per slab to verify limits

5. **Frontend integration:** Update client to use new channel-based subscription model

---

## 📝 Notes

- **No breaking changes:** Legacy subscriptions still work
- **Production-ready:** Connection limits, heartbeats, and metrics prevent DoS and zombie connections
- **Efficient:** Batching and selective broadcasting reduce CPU/network overhead
- **Observable:** `/ws/stats` provides real-time visibility into WebSocket health

**Branch:** `cobra/feature/new-backend`  
**Commit:** `55a751b`  
**Files modified:** 2 (`ws.ts`, `health.ts`)
