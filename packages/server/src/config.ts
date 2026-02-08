import "dotenv/config";

export const config = {
  rpcUrl: process.env.RPC_URL ?? "https://devnet.helius-rpc.com/?api-key=e568033d-06d6-49d1-ba90-b3564c91851b",
  programId: process.env.PROGRAM_ID ?? "EXsr2Tfz8ntWYP3vgCStdknFBoafvJQugJKAh4nFdo8f",
  crankKeypair: process.env.CRANK_KEYPAIR ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseKey: process.env.SUPABASE_KEY ?? "",
  heliusApiKey: process.env.HELIUS_API_KEY ?? "e568033d-06d6-49d1-ba90-b3564c91851b",
  port: Number(process.env.PORT ?? 3001),
  crankIntervalMs: Number(process.env.CRANK_INTERVAL_MS ?? 10_000),
} as const;
