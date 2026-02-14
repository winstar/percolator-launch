import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://ygvbajglkrwkbjdjyhxi.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlndmJhamdsa3J3a2JqZGp5aHhpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDQ5NzM1NywiZXhwIjoyMDg2MDczMzU3fQ.ihecr5Eeb4WXO0NtxsEzfkuqzI52bKhOeZbMfy-lxTw';

const supabase = createClient(supabaseUrl, supabaseKey);

const sql = readFileSync('./supabase/migrations/008_update_markets_with_stats_view.sql', 'utf8');

console.log('[Migration 008] Applying view update...');

try {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).single();
  if (error) {
    console.error('[Migration 008] Error:', error);
    process.exit(1);
  }
  console.log('[Migration 008] ✅ SUCCESS - markets_with_stats view updated with hidden features columns');
} catch (err) {
  console.error('[Migration 008] Exception:', err.message);
  // Try direct query
  console.log('[Migration 008] Attempting direct query...');
  try {
    const { error: directError } = await supabase.from('_migrations').insert({ name: '008_update_markets_with_stats_view' });
    if (directError) console.warn('Migration tracking failed:', directError);
    
    // Execute SQL via pg_stat_statements or similar (limited in Supabase free tier)
    console.log('[Migration 008] Manual SQL execution required via Supabase SQL editor');
    console.log('Paste this SQL into Supabase Dashboard > SQL Editor:\n');
    console.log(sql);
    process.exit(1);
  } catch (err2) {
    console.error('[Migration 008] Direct attempt failed:', err2.message);
    console.log('\nManual migration required - paste into Supabase SQL Editor:');
    console.log(sql);
    process.exit(1);
  }
}
