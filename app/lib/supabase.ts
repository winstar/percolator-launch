import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side (anon key, respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side (service role, bypasses RLS)
export function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceKey);
}

export interface Market {
  id: string;
  slab_address: string;
  mint_address: string;
  symbol: string;
  name: string;
  decimals: number;
  deployer: string;
  oracle_authority: string | null;
  initial_price_e6: number | null;
  max_leverage: number;
  trading_fee_bps: number;
  lp_collateral: number | null;
  matcher_context: string | null;
  status: string;
  created_at: string;
}

export interface MarketWithStats extends Market {
  last_price: number | null;
  mark_price: number | null;
  index_price: number | null;
  volume_24h: number | null;
  volume_total: number | null;
  open_interest_long: number | null;
  open_interest_short: number | null;
  insurance_fund: number | null;
  total_accounts: number | null;
  funding_rate: number | null;
  stats_updated_at: string | null;
}

export interface Trade {
  id: string;
  slab_address: string;
  trader: string;
  side: "long" | "short";
  size: number;
  price: number;
  fee: number;
  tx_signature: string | null;
  created_at: string;
}

export interface OraclePrice {
  id: number;
  slab_address: string;
  price_e6: number;
  timestamp: number;
  created_at: string;
}
