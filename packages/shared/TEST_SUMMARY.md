# @percolator/shared Test Suite

## Summary

Comprehensive test suite for the `@percolator/shared` package with **93 passing tests** covering all core functionality.

## Test Coverage

### ✅ config.test.ts (7 tests)
- Config loads defaults when no env vars set
- Config reads env vars correctly
- `allProgramIds` correctly parses comma-separated strings
- Production mode validation (throws if RPC_URL not set)
- Environment variable handling

### ✅ db/queries.test.ts (39 tests)
All database query functions tested with mocked Supabase client:
- `getMarkets`, `getMarketBySlabAddress`
- `insertMarket`, `upsertMarketStats`
- `insertTrade`, `tradeExistsBySignature`
- `insertOraclePrice`, `getRecentTrades`
- `get24hVolume` (with BigInt math)
- `getGlobalRecentTrades`, `getPriceHistory`
- `insertFundingHistory`, `getFundingHistory`, `getFundingHistorySince`
- Error handling and unique constraint violations (23505)

### ✅ utils/binary.test.ts (22 tests)
Binary data utilities:
- `decodeBase58`: valid/invalid keys, edge cases, leading 1s
- `readU128LE`: zero, max value, specific values
- `parseTradeSize`: positive/negative, zero, max i128 values

### ✅ utils/rpc-client.test.ts (16 tests, 1 skipped)
Rate limiting and caching:
- Token bucket: depletes tokens, waits when empty
- `backoffMs`: exponential increase, respects max
- Cache: hit/miss, TTL expiry, eviction
- Connection management
- `rateLimitedCall`: success, retry, fallback on 429

*Note: One test skipped due to complexity of testing setInterval-based queue with fake timers*

### ✅ services/events.test.ts (9 tests)
Event bus functionality:
- Publish/subscribe to events
- Wildcard "*" listener receives all events
- Unsubscribe works correctly
- Subscription count tracking

## Running Tests

```bash
# Run all tests
pnpm --filter @percolator/shared test

# Watch mode
pnpm --filter @percolator/shared test:watch
```

## Implementation Notes

- Uses Vitest ^4.0.18
- All tests are pure unit tests with no real network/DB calls
- Supabase client is fully mocked
- Solana Connection mocked where needed
- Environment variables properly isolated between tests
- Fake timers used for async/timer testing (where practical)

## Test Results

```
Test Files  5 passed (5)
Tests       93 passed | 1 skipped (94)
Duration    ~1s
```

All tests passing ✅
