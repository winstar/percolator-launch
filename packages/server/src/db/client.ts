import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    if (!config.supabaseUrl || !config.supabaseKey) {
      throw new Error("SUPABASE_URL and SUPABASE_KEY must be set");
    }
    _client = createClient(config.supabaseUrl, config.supabaseKey);
  }
  return _client;
}
