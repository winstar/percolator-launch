import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// GET /api/markets — list all active markets with stats
export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("markets_with_stats")
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ markets: data });
}

// POST /api/markets — register a new market after deployment
export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    slab_address,
    mint_address,
    symbol,
    name,
    decimals,
    deployer,
    oracle_authority,
    initial_price_e6,
    max_leverage,
    trading_fee_bps,
    lp_collateral,
    matcher_context,
  } = body;

  if (!slab_address || !mint_address || !deployer) {
    return NextResponse.json(
      { error: "Missing required fields: slab_address, mint_address, deployer" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  // Insert market
  const { data: market, error: marketError } = await supabase
    .from("markets")
    .insert({
      slab_address,
      mint_address,
      symbol: symbol || mint_address.slice(0, 4).toUpperCase(),
      name: name || `Token ${mint_address.slice(0, 8)}`,
      decimals: decimals || 6,
      deployer,
      oracle_authority: oracle_authority || deployer,
      initial_price_e6,
      max_leverage: max_leverage || 10,
      trading_fee_bps: trading_fee_bps || 10,
      lp_collateral,
      matcher_context,
    })
    .select()
    .single();

  if (marketError) {
    return NextResponse.json({ error: marketError.message }, { status: 500 });
  }

  // Create initial stats row
  await supabase.from("market_stats").insert({
    slab_address,
    last_price: initial_price_e6 ? initial_price_e6 / 1_000_000 : null,
  });

  return NextResponse.json({ market }, { status: 201 });
}
