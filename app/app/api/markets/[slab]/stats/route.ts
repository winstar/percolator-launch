import { NextRequest, NextResponse } from "next/server";
import { requireAuth, UNAUTHORIZED } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase";
export const dynamic = "force-dynamic";

// POST /api/markets/[slab]/stats — update market stats (called by indexer/keeper)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slab: string }> }
) {
  if (!requireAuth(req)) return UNAUTHORIZED;
  const { slab } = await params;

  const body = await req.json();
  const supabase = getServiceClient();

  // Allowlist of permitted fields to prevent mass assignment
  const ALLOWED_FIELDS = new Set([
    'last_price', 'mark_price', 'index_price', 'volume_24h', 'volume_total',
    'open_interest_long', 'open_interest_short', 'insurance_fund', 'total_accounts',
    'funding_rate', 'total_open_interest', 'net_lp_pos', 'lp_sum_abs', 'lp_max_abs',
    'insurance_balance', 'insurance_fee_revenue', 'warmup_period_slots',
    'vault_balance', 'lifetime_liquidations', 'lifetime_force_closes',
    'c_tot', 'pnl_pos_tot', 'last_crank_slot', 'max_crank_staleness_slots',
    'maintenance_fee_per_slot', 'liquidation_fee_bps', 'liquidation_fee_cap',
    'liquidation_buffer_bps',
  ]);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(key)) {
      sanitized[key] = value;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase
    .from("market_stats") as any)
    .upsert({
      slab_address: slab,
      ...sanitized,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
