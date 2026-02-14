/**
 * PNL Warmup API Routes
 * 
 * GET /api/warmup/:slab/:accountIdx
 * - Returns warmup progress for a specific account
 */

import { Router, Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { parseAccount } from '../utils/parser.js';
import { u128ToBigInt } from '../utils/types.js';
import { getMarketStats } from '../db/queries.js';

const router = Router();

// Solana connection (initialized from env)
let connection: Connection;

export function initWarmupRouter(rpcUrl: string): Router {
  connection = new Connection(rpcUrl, 'confirmed');
  return router;
}

/**
 * Calculate warmup progress
 */
function calculateWarmupProgress(
  warmupStartedAtSlot: bigint,
  warmupSlopePerStep: bigint,
  warmupPeriodSlots: bigint,
  currentSlot: bigint,
  capital: bigint,
  pnl: bigint
) {
  // Calculate elapsed slots since warmup started
  const elapsedSlots = currentSlot >= warmupStartedAtSlot 
    ? currentSlot - warmupStartedAtSlot 
    : 0n;

  // Warmup active if elapsed < period
  const warmupActive = elapsedSlots < warmupPeriodSlots;

  // Slots remaining
  const slotsRemaining = warmupActive 
    ? warmupPeriodSlots - elapsedSlots 
    : 0n;

  // Percent complete (0-100)
  const percentComplete = warmupPeriodSlots > 0n
    ? Number((elapsedSlots * 100n) / warmupPeriodSlots)
    : 100;

  // Warmed up cap = slope * elapsed_slots (capped at total PNL if positive)
  const warmedUpCap = warmupSlopePerStep * elapsedSlots;
  
  // Available to withdraw = capital + min(pnl, warmed_up_cap)
  const unlockedPnl = pnl > 0n 
    ? (pnl < warmedUpCap ? pnl : warmedUpCap)
    : pnl; // If PNL is negative, it's always "unlocked" (loss is realized)

  const lockedPnl = pnl > 0n && pnl > warmedUpCap
    ? pnl - warmedUpCap
    : 0n;

  // Estimate seconds remaining (assuming ~400ms per slot)
  const estimatedSecondsRemaining = Number(slotsRemaining) * 0.4;

  return {
    warmupActive,
    warmupStartSlot: Number(warmupStartedAtSlot),
    currentSlot: Number(currentSlot),
    totalPeriodSlots: Number(warmupPeriodSlots),
    slotsRemaining: Number(slotsRemaining),
    percentComplete: Math.min(percentComplete, 100),
    lockedAmount: lockedPnl.toString(),
    unlockedAmount: unlockedPnl.toString(),
    totalPnl: pnl.toString(),
    capital: capital.toString(),
    estimatedSecondsRemaining: Math.max(0, Math.round(estimatedSecondsRemaining)),
  };
}

/**
 * GET /api/warmup/:slab/:accountIdx
 * 
 * Returns warmup progress for an account
 */
router.get('/:slab/:accountIdx', async (req: Request, res: Response) => {
  try {
    const { slab, accountIdx } = req.params;

    // Validate inputs
    if (!slab || !accountIdx) {
      res.status(400).json({ error: 'Missing slab or accountIdx parameter' });
      return;
    }

    const accountIndex = parseInt(accountIdx, 10);
    if (isNaN(accountIndex)) {
      res.status(400).json({ error: 'Invalid accountIdx (must be integer)' });
      return;
    }

    // Get market stats to retrieve warmup_period_slots
    const marketStats = await getMarketStats(slab);
    if (!marketStats || !marketStats.warmup_period_slots) {
      res.status(404).json({ 
        error: 'Market not found or warmup_period_slots not available' 
      });
      return;
    }

    const warmupPeriodSlots = BigInt(marketStats.warmup_period_slots.toString());

    // Fetch account data from on-chain
    // TODO: Derive account PDA from slab + account_idx
    // For now, we'll return a placeholder response
    // In production, you'd calculate the PDA and fetch the account

    // Placeholder: You need to implement PDA derivation based on your program
    // const accountPda = deriveAccountPda(slab, accountIndex);
    // const accountInfo = await connection.getAccountInfo(accountPda);

    // For demonstration, returning a mock response
    res.status(501).json({
      error: 'PDA derivation not yet implemented',
      message: 'Need to implement account PDA derivation from slab + account_idx',
      warmupPeriodSlots: warmupPeriodSlots.toString(),
    });

    // PRODUCTION CODE (uncomment when PDA derivation is ready):
    /*
    if (!accountInfo) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Parse account data
    const account = parseAccount(accountInfo.data);
    
    // Get current slot
    const currentSlot = await connection.getSlot('confirmed');

    // Extract warmup fields
    const warmupStartedAtSlot = account.warmupStartedAtSlot || 0n;
    const warmupSlopePerStep = account.warmupSlopePerStep 
      ? u128ToBigInt(account.warmupSlopePerStep)
      : 0n;
    const capital = account.capital ? u128ToBigInt(account.capital) : 0n;
    const pnl = account.pnl ? i128ToBigInt(account.pnl) : 0n;

    // Calculate warmup progress
    const progress = calculateWarmupProgress(
      warmupStartedAtSlot,
      warmupSlopePerStep,
      warmupPeriodSlots,
      BigInt(currentSlot),
      capital,
      pnl
    );

    res.json({
      accountIdx: accountIndex,
      slab,
      ...progress,
    });
    */

  } catch (error) {
    console.error('[Warmup API] Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
