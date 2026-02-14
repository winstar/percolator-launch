# History Fix Implementation Summary

## Changes Made

### ✅ PART 1: Created `/api/funding/[slab]/history` API Route

**File:** `app/app/api/funding/[slab]/history/route.ts`

- Implements GET endpoint for funding rate history
- Queries `funding_history` table for last 7 days
- Returns data in format expected by FundingRateChart component:
  ```typescript
  {
    history: FundingHistoryPoint[]
  }
  ```
- Each point includes:
  - `timestamp` (epoch ms)
  - `rateBpsPerSlot`
  - `hourlyRate` (calculated: rateBpsPerSlot * 9000 / 100)
  - `aprRate` (calculated: hourlyRate * 24 * 365)
- Includes `export const dynamic = 'force-dynamic'`
- Proper error handling and logging

### ✅ PART 2: Updated StatsCollector

**File:** `packages/server/src/services/StatsCollector.ts`

**Changes:**
1. Added import for `getSupabase` from `../db/client.js`
2. Added three Map properties for rate limiting:
   - `private lastOiHistoryTime = new Map<string, number>();`
   - `private lastInsHistoryTime = new Map<string, number>();`
   - `private lastFundingHistoryTime = new Map<string, number>();`

3. Added three history insert blocks (rate-limited to 5 minutes per market):
   - **OI History** → `oi_history` table
   - **Insurance History** → `insurance_history` table
   - **Funding History** → `funding_history` table

All inserts are non-fatal (errors logged but don't break stats collection).

### ✅ PART 3: TypeScript Compilation

**Files Modified for Type Safety:**
- `app/lib/database.types.ts` - Added `funding_history` table definition

**Compilation Results:**
- ✅ `packages/server`: No errors
- ✅ `app`: No errors (test file warnings unrelated to changes)

## Database Schema Used

### funding_history table
- `id` (string, auto)
- `market_slab` (string)
- `slot` (number)
- `timestamp` (string, auto)
- `rate_bps_per_slot` (number)
- `net_lp_pos` (string)
- `price_e6` (number)
- `funding_index_qpb_e6` (string)
- `created_at` (string, auto)

### oi_history table (existing)
- `market_slab`, `slot`, `total_oi`, `net_lp_pos`, `lp_sum_abs`, `lp_max_abs`

### insurance_history table (existing)
- `market_slab`, `slot`, `balance`, `fee_revenue`

## Testing Recommendations

1. Start the server and verify StatsCollector logs appear without errors
2. Check that history tables are being populated every 5 minutes
3. Navigate to a market page and verify FundingRateChart loads
4. Inspect `/api/funding/[slab]/history` response format

## Notes

- All changes follow existing code patterns
- Rate limiting prevents database bloat
- Non-fatal error handling ensures resilience
- No commits or pushes made per instructions
