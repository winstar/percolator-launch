import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    if (!config.supabaseUrl || !config.supabaseKey) {
      throw new Error("SUPABASE_URL and SUPABASE_KEY must be set");
    }
    
    // Connection pooling configuration
    // Add db_pool_mode=transaction for Supabase connection pooler
    const url = new URL(config.supabaseUrl);
    if (!url.searchParams.has('db_pool_mode')) {
      url.searchParams.set('db_pool_mode', 'transaction');
    }
    
    _client = createClient(url.toString(), config.supabaseKey, {
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-client-info': '@percolator/api',
        },
      },
      // Connection pooling settings
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return _client;
}
