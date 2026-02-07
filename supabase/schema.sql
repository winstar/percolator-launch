-- Percolator Launch — Market Registry Schema
-- Run in Supabase SQL Editor

-- Markets table — core registry
create table markets (
  id uuid default gen_random_uuid() primary key,
  slab_address text unique not null,
  mint_address text not null,
  symbol text not null,
  name text not null,
  decimals int not null default 6,
  deployer text not null,
  oracle_authority text,
  initial_price_e6 bigint,
  max_leverage int not null default 10,
  trading_fee_bps int not null default 10,
  lp_collateral numeric,
  matcher_context text,
  status text not null default 'active' check (status in ('active', 'paused', 'resolved')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Market stats — updated by indexer/crank
create table market_stats (
  slab_address text primary key references markets(slab_address) on delete cascade,
  last_price numeric,
  mark_price numeric,
  index_price numeric,
  volume_24h numeric default 0,
  volume_total numeric default 0,
  open_interest_long numeric default 0,
  open_interest_short numeric default 0,
  insurance_fund numeric default 0,
  total_accounts int default 0,
  funding_rate numeric default 0,
  updated_at timestamptz default now()
);

-- Trade history — populated by indexer
create table trades (
  id uuid default gen_random_uuid() primary key,
  slab_address text not null references markets(slab_address) on delete cascade,
  trader text not null,
  side text not null check (side in ('long', 'short')),
  size numeric not null,
  price numeric not null,
  fee numeric not null default 0,
  tx_signature text unique,
  slot bigint,
  created_at timestamptz default now()
);

-- Oracle price history — for charts
create table oracle_prices (
  id bigserial primary key,
  slab_address text not null references markets(slab_address) on delete cascade,
  price_e6 bigint not null,
  timestamp bigint not null,
  tx_signature text,
  created_at timestamptz default now()
);

-- Indexes
create index idx_markets_status on markets(status);
create index idx_markets_mint on markets(mint_address);
create index idx_markets_deployer on markets(deployer);
create index idx_trades_slab on trades(slab_address, created_at desc);
create index idx_trades_trader on trades(trader, created_at desc);
create index idx_oracle_prices_slab on oracle_prices(slab_address, created_at desc);
create index idx_oracle_prices_slab_time on oracle_prices(slab_address, timestamp desc);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger markets_updated_at
  before update on markets
  for each row execute function update_updated_at();

create trigger market_stats_updated_at
  before update on market_stats
  for each row execute function update_updated_at();

-- RLS policies
alter table markets enable row level security;
alter table market_stats enable row level security;
alter table trades enable row level security;
alter table oracle_prices enable row level security;

-- Public read access
create policy "Markets readable by all" on markets for select using (true);
create policy "Stats readable by all" on market_stats for select using (true);
create policy "Trades readable by all" on trades for select using (true);
create policy "Prices readable by all" on oracle_prices for select using (true);

-- Service role writes (API routes use service key)
create policy "Service can insert markets" on markets for insert with check (true);
create policy "Service can update markets" on markets for update using (true);
create policy "Service can insert stats" on market_stats for insert with check (true);
create policy "Service can update stats" on market_stats for update using (true);
create policy "Service can insert trades" on trades for insert with check (true);
create policy "Service can insert prices" on oracle_prices for insert with check (true);

-- Realtime subscriptions
alter publication supabase_realtime add table markets;
alter publication supabase_realtime add table market_stats;

-- View: markets with stats joined (for frontend)
create or replace view markets_with_stats as
select
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
  s.updated_at as stats_updated_at
from markets m
left join market_stats s on m.slab_address = s.slab_address
where m.status = 'active'
order by s.volume_24h desc nulls last;
