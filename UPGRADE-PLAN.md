# Smart Contract Upgrade Plan — v2

## Phase 1: No Layout Changes (Safe — existing markets compatible)

### F1: Better Risk Gate Defaults
- Change `DEFAULT_THRESH_ALPHA_BPS` from 1000 (10%) to 5000 (50%) — faster decay
- Change `DEFAULT_THRESH_RISK_BPS` from 50 (0.5%) to 200 (2%) — less aggressive trigger
- Change `DEFAULT_THRESH_STEP_BPS` from 500 to 2000 — bigger decay steps
- **Tests:** Create market, open long, close, verify short works without manual reset

### F2: Extend UpdateRiskParams with Trading Fee
- Currently: tag(22) + initial_margin_bps(8) + maintenance_margin_bps(8) = 17 bytes
- New: tag(22) + initial_margin_bps(8) + maintenance_margin_bps(8) + [trading_fee_bps(8)] = 25 bytes
- If instruction data has extra 8 bytes, read and update trading_fee_bps
- If not, leave trading_fee_bps unchanged (backwards compatible)
- **Tests:** Update margin params only (old format), update all 3 params (new format), verify fee changes

### F3: Max Leverage Validation
- Already implicit via initial_margin_bps (500bps = 20x max)
- Add EXPLICIT check: reject trades where `position_size * price / capital > 10000 / initial_margin_bps`
- Log max leverage in market stats
- **Tests:** Create market with 500bps margin, try 21x leverage trade → rejected, 20x → accepted

### F4: Better Liquidation Event Logging
- Add distinct log tags: `LIQ_PARTIAL` vs `LIQ_FULL` vs `LIQ_FALLBACK`
- Include: account_idx, oracle_price, position_size, capital_before, capital_after, fee_charged
- **Tests:** Force liquidation, verify correct log type in tx logs

### F5: Funding Rate Dampening on Low Liquidity
- Scale funding rate by min(1, total_OI / (2 * vault_balance))
- When OI < 2x vault, funding rate is proportionally reduced
- Prevents extreme funding on thin markets
- **Tests:** Create market with small vault, open large position, verify funding rate is dampened

### F6: Market Pause
- Repurpose `_padding[0]` in SlabHeader as `flags` byte
- Bit 0 = paused (1 = paused, 0 = active)
- New instruction: Tag 28 = PauseMarket, Tag 29 = UnpauseMarket (admin only)
- When paused: block Trade, Deposit, Withdraw, InitUser. Allow: Crank, Liquidate, AdminForceClose, Unpause
- **Tests:** Pause market, try trade → rejected, try liquidation → works, unpause → trade works

## Phase 2: Layout Changes (Future version)

### F7: Cumulative Oracle Deviation Check
- Track cumulative price change over rolling window
- Block if cumulative deviation exceeds threshold
- Needs new config field: `oracle_cumulative_cap_bps`, `oracle_window_slots`

### F8: Insurance Fund Cap + Overflow
- Max insurance balance field in config
- Excess routed to LP holders or vault
- Needs new config field: `max_insurance_balance`

## Test Matrix

| Feature | Unit Test | On-chain Test | Regression |
|---------|-----------|---------------|------------|
| F1 | defaults check | market lifecycle | existing markets still work |
| F2 | instruction parse | fee update tx | old format still works |
| F3 | leverage calc | over-leveraged trade | normal trades unaffected |
| F4 | log parsing | forced liquidation | crank still works |
| F5 | funding math | funding accrual | normal funding unaffected |
| F6 | flag read/write | pause/unpause cycle | unpause restores full function |
