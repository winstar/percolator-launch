# @percolator/api Test Suite

## Summary

✅ **97 tests passing** across 12 test files

## Test Coverage

### Middleware Tests (23 tests)

#### `validateSlab.test.ts` (7 tests)
- ✅ Valid Solana public key passes through
- ✅ Invalid base58 returns 400
- ✅ Empty/missing slab passes through  
- ✅ Too-short string returns 400
- ✅ Various valid address formats accepted
- ✅ Invalid base58 characters rejected

#### `rate-limit.test.ts` (8 tests)
- ✅ Read requests within limit pass (60 GET/min)
- ✅ Read requests exceeding limit get 429
- ✅ Write requests within limit pass (10 POST/min)
- ✅ Write requests exceeding limit get 429
- ✅ Different IPs have separate buckets
- ✅ Buckets reset after window expires

#### `auth.test.ts` (8 tests)
- ✅ No API_AUTH_KEY env = dev mode = all requests pass
- ✅ Valid x-api-key header accepted
- ✅ Invalid x-api-key returns 401
- ✅ Missing x-api-key returns 401
- ✅ Production mode without API_AUTH_KEY returns 500
- ✅ Empty string API_AUTH_KEY handled correctly
- ✅ Case-sensitive API key validation

### Route Tests (74 tests)

#### `health.test.ts` (6 tests)
- ✅ Returns 200 with healthy status when RPC + DB work
- ✅ Returns 503 with degraded when RPC fails
- ✅ Returns 503 with degraded when DB fails
- ✅ Returns 503 when both fail
- ✅ Response includes service name "api"
- ✅ Handles 0 markets count

#### `markets.test.ts` (8 tests)
- ✅ GET /markets returns merged market + stats data
- ✅ Handles markets without stats
- ✅ GET /markets/stats returns all stats
- ✅ GET /markets/:slab/stats returns single market stats
- ✅ GET /markets/:slab returns on-chain data
- ✅ Invalid slab returns 400
- ✅ Handles on-chain fetch errors

#### `trades.test.ts` (14 tests)
- ✅ GET /markets/:slab/trades returns recent trades
- ✅ GET /markets/:slab/volume returns 24h volume
- ✅ GET /markets/:slab/prices returns price history
- ✅ GET /trades/recent returns global recent trades
- ✅ Invalid slab format returns 400
- ✅ Limit param clamped to 1-200
- ✅ Hours param clamped to 1-720
- ✅ Error handling for all endpoints

#### `funding.test.ts` (14 tests)
- ✅ GET /funding/:slab returns current rate + 24h history
- ✅ Rate calculations correct (hourly/daily/annual from bps/slot)
- ✅ GET /funding/:slab/history with limit and since params
- ✅ Limit clamped to max 1000
- ✅ GET /funding/global returns all markets
- ✅ 404 when market not found
- ✅ Handles zero and negative funding rates

#### `prices.test.ts` (7 tests)
- ✅ GET /prices/markets returns all market prices
- ✅ GET /prices/:slab returns price history
- ✅ Handles database errors
- ✅ Handles empty results
- ✅ Invalid slab returns 400

#### `insurance.test.ts` (6 tests)
- ✅ GET /insurance/:slab returns current balance + history
- ✅ 404 when market not found
- ✅ Handles null values gracefully
- ✅ Limits history to 100 records
- ✅ Invalid slab returns 400

#### `open-interest.test.ts` (7 tests)
- ✅ GET /open-interest/:slab returns OI data + history
- ✅ 404 when market not found
- ✅ Handles null values gracefully
- ✅ Limits history to 100 records
- ✅ Invalid slab returns 400

#### `stats.test.ts` (5 tests)
- ✅ GET /stats returns aggregated platform stats
- ✅ BigInt aggregation works correctly
- ✅ Handles zero values
- ✅ Handles null values in stats
- ✅ Handles database errors

#### `crank.test.ts` (7 tests)
- ✅ GET /crank/status returns market crank data
- ✅ Handles empty markets list
- ✅ Handles null values
- ✅ Handles large slot numbers
- ✅ Preserves order from database

## Implementation Details

### Testing Approach
- **Pure unit tests** - all external dependencies mocked
- **Hono test helper** - uses `app.request()` for direct testing (no supertest needed)
- **Mocked dependencies**:
  - `@percolator/shared` (getSupabase, getConnection, etc.)
  - `@percolator/core` (fetchSlab, parseHeader, parseConfig, parseEngine)

### Configuration
- **Framework**: Vitest 4.0.18
- **Test files**: `packages/api/tests/**/*.test.ts`
- **Coverage**: v8 provider with text/json/html reporters

### Run Tests
```bash
# Run all tests
pnpm --filter @percolator/api test

# Watch mode
pnpm --filter @percolator/api test:watch
```

## Bug Fixes During Testing

### Route Ordering Issue (funding.ts)
**Problem**: `/funding/global` was defined after `/funding/:slab`, causing Hono to match "global" as a slab parameter, which then failed validateSlab.

**Solution**: Reordered routes so specific paths come before parameterized paths:
```typescript
// ✅ Correct order
app.get("/funding/global", ...)      // Specific route first
app.get("/funding/:slab", ...)       // Parameterized route second
app.get("/funding/:slab/history", ...)
```

This ensures literal route matches take precedence over pattern matches.

## Test Quality

- ✅ **Comprehensive coverage** of all middleware and routes
- ✅ **Edge cases** tested (null values, invalid inputs, errors)
- ✅ **Error handling** verified for all failure scenarios
- ✅ **Type safety** maintained throughout
- ✅ **Realistic mocks** that mirror actual behavior
- ✅ **Fast execution** (~2s for full suite)
