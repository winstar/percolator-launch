/**
 * Open Interest (OI) API Routes
 * 
 * GET /api/oi/:slab
 * - Returns open interest metrics and imbalance
 * 
 * GET /api/oi/global
 * - Returns aggregated OI across all markets
 */

import { Router, Request, Response } from 'express';
import {
  getMarketStats,
  getOIImbalance,
  getOIHistory,
} from '../db/queries.js';
import pool from '../db/client.js';

const router = Router();

/**
 * GET /api/oi/:slab
 * 
 * Returns open interest metrics for a specific market
 */
router.get('/:slab', async (req: Request, res: Response) => {
  try {
    const { slab } = req.params;

    if (!slab) {
      res.status(400).json({ error: 'Missing slab parameter' });
      return;
    }

    // Get OI imbalance metrics
    const imbalance = await getOIImbalance(slab);
    if (!imbalance) {
      res.status(404).json({ error: 'Market not found' });
      return;
    }

    // Get historical OI data (last 24 hours)
    const history = await getOIHistory(slab, 24);

    // Calculate 24h change
    let oiChange24h = null;
    if (history.length >= 2) {
      const latest = Number(history[0].total_oi);
      const earliest = Number(history[history.length - 1].total_oi);
      if (earliest > 0) {
        oiChange24h = {
          absolute: (latest - earliest).toString(),
          percent: (((latest - earliest) / earliest) * 100).toFixed(2),
        };
      }
    }

    // Response
    res.json({
      slab,
      current: {
        totalOI: imbalance.total_open_interest,
        longOI: imbalance.long_oi,
        shortOI: imbalance.short_oi,
        netLpPosition: imbalance.net_lp_pos,
        lpSumAbs: imbalance.lp_sum_abs,
        lpMaxAbs: imbalance.lp_max_abs,
        imbalancePercent: imbalance.imbalance_percent,
      },
      metrics: {
        oiChange24h,
        longPercent: calculatePercent(imbalance.long_oi, imbalance.total_open_interest),
        shortPercent: calculatePercent(imbalance.short_oi, imbalance.total_open_interest),
      },
      history: history.map((h) => ({
        slot: h.slot.toString(),
        timestamp: h.timestamp,
        totalOI: h.total_oi,
        netLpPos: h.net_lp_pos,
        lpSumAbs: h.lp_sum_abs,
        lpMaxAbs: h.lp_max_abs,
      })),
    });

  } catch (error) {
    console.error('[OI API] Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/oi/global
 * 
 * Returns aggregated OI across all tracked markets
 */
router.get('/global', async (req: Request, res: Response) => {
  try {
    // Query all markets
    const query = `
      SELECT 
        slab_address,
        total_open_interest,
        net_lp_pos,
        lp_sum_abs,
        lp_max_abs
      FROM market_stats
      WHERE total_open_interest IS NOT NULL
    `;

    const result = await pool.query(query);
    const markets = result.rows;

    if (markets.length === 0) {
      res.json({
        totalMarkets: 0,
        aggregateTotalOI: '0',
        markets: [],
      });
      return;
    }

    // Calculate aggregate metrics
    const aggregateTotalOI = markets.reduce(
      (sum, m) => sum + BigInt(m.total_open_interest || '0'),
      0n
    );

    const aggregateLpSumAbs = markets.reduce(
      (sum, m) => sum + BigInt(m.lp_sum_abs || '0'),
      0n
    );

    // Response
    res.json({
      totalMarkets: markets.length,
      aggregateTotalOI: aggregateTotalOI.toString(),
      aggregateLpSumAbs: aggregateLpSumAbs.toString(),
      markets: markets.map((m) => ({
        slab: m.slab_address,
        totalOI: m.total_open_interest,
        netLpPos: m.net_lp_pos,
        lpSumAbs: m.lp_sum_abs,
        lpMaxAbs: m.lp_max_abs,
      })),
    });

  } catch (error) {
    console.error('[OI API] Global error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Helper: Calculate percentage (returns number rounded to 2 decimals)
 */
function calculatePercent(value: string, total: string): number {
  const val = Number(value);
  const tot = Number(total);
  if (tot === 0) return 0;
  return Math.round((val / tot) * 10000) / 100; // Round to 2 decimals
}

export default router;
