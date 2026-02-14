import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: 'aws-0-eu-central-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.ygvbajglkrwkbjdjyhxi',
  password: 'Snakeontheplane1234',
});

const sql = `
CREATE OR REPLACE VIEW markets_with_stats AS
SELECT
  m.*,
  s.last_price,
  s.mark_price,
  s.index_price,
  s.volume_24h,
  s.volume_total,
  s.open_interest_long,
  s.open_interest_short,
  s.insurance_fund,
  s.total_accounts,
  s.funding_rate,
  s.total_open_interest,
  s.net_lp_pos,
  s.lp_sum_abs,
  s.lp_max_abs,
  s.insurance_balance,
  s.insurance_fee_revenue,
  s.warmup_period_slots,
  s.updated_at as stats_updated_at
FROM markets m
LEFT JOIN market_stats s ON m.slab_address = s.slab_address;
`;

console.log('[View Update] Connecting to Supabase...');
try {
  await client.connect();
  console.log('[View Update] Connected. Executing SQL...');
  await client.query(sql);
  console.log('[View Update] ✅ SUCCESS - markets_with_stats view updated!');
  await client.end();
} catch (err) {
  console.error('[View Update] ❌ Error:', err.message);
  process.exit(1);
}
