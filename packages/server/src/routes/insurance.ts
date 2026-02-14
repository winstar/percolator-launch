/**
 * Insurance Fund API Routes
 * 
 * GET /api/insurance/:slab
 * - Returns insurance fund metrics
 * 
 * POST /api/insurance/:slab/topup
 * - Returns unsigned transaction for topup (TODO)
 */

import { Router, Request, Response } from 'express';
import {
  getMarketStats,
  getInsuranceFundHealth,
  getInsuranceHistory,
  get24hFeeGrowth,
} from '../db/queries.js';

const router = Router();

/**
 * GET /api/insurance/:slab
 * 
 * Returns insurance fund dashboard data
 */
router.get('/:slab', async (req: Request, res: Response) => {
  try {
    const { slab } = req.params;

    if (!slab) {
      res.status(400).json({ error: 'Missing slab parameter' });
      return;
    }

    // Get current insurance fund health
    const health = await getInsuranceFundHealth(slab);
    if (!health) {
      res.status(404).json({ error: 'Market not found' });
      return;
    }

    // Get 24h fee growth
    const feeGrowth24h = await get24hFeeGrowth(slab);

    // Get historical data (last 24 hours)
    const history = await getInsuranceHistory(slab, 24);

    // Calculate 24h accumulation rate (if we have historical data)
    let accumulationRatePerHour = null;
    if (feeGrowth24h && Number(feeGrowth24h) > 0) {
      accumulationRatePerHour = (Number(feeGrowth24h) / 24).toFixed(2);
    }

    // Response
    res.json({
      slab,
      current: {
        balance: health.insurance_balance,
        feeRevenue: health.insurance_fee_revenue,
        totalOpenInterest: health.total_open_interest,
        healthRatio: health.health_ratio,
      },
      metrics: {
        feeGrowth24h: feeGrowth24h || '0',
        accumulationRatePerHour,
      },
      history: history.map((h) => ({
        slot: h.slot.toString(),
        timestamp: h.timestamp,
        balance: h.balance,
        feeRevenue: h.fee_revenue,
      })),
    });

  } catch (error) {
    console.error('[Insurance API] Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/insurance/:slab/topup
 * 
 * Build unsigned transaction for insurance fund topup
 * (Placeholder - requires program instruction encoding)
 */
router.post('/:slab/topup', async (req: Request, res: Response) => {
  try {
    const { slab } = req.params;
    const { amount } = req.body;

    if (!slab || !amount) {
      res.status(400).json({ error: 'Missing slab or amount' });
      return;
    }

    // Validate amount is a positive number
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      res.status(400).json({ error: 'Invalid amount (must be positive number)' });
      return;
    }

    // TODO: Implement transaction building
    // This requires:
    // 1. Access to percolator program's encodeTopUpInsurance function
    // 2. Building the transaction with proper accounts
    // 3. Returning unsigned transaction for client to sign

    res.status(501).json({
      error: 'Not implemented',
      message: 'Transaction building requires program instruction encoder',
      slab,
      amount,
    });

  } catch (error) {
    console.error('[Insurance API] Topup error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
