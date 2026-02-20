import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * RPC proxy endpoint — forwards JSON-RPC requests to Helius while keeping the API key server-side.
 * This prevents exposing HELIUS_API_KEY in the client bundle.
 *
 * Usage from frontend:
 *   const response = await fetch('/api/rpc', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] }),
 *   });
 */

const HELIUS_API_KEY = process.env.HELIUS_API_KEY ?? process.env.NEXT_PUBLIC_HELIUS_API_KEY ?? "";
const NETWORK = process.env.NEXT_PUBLIC_DEFAULT_NETWORK?.trim() ?? "devnet";
const RPC_URL = NETWORK === "mainnet"
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

/**
 * Allowlist of JSON-RPC methods that may be proxied to Helius.
 * Prevents abuse of the API key for unauthorized operations.
 * Add methods here as the frontend needs them.
 */
const ALLOWED_RPC_METHODS = new Set([
  // Health & cluster
  "getHealth",
  "getVersion",
  "getSlot",
  "getBlockHeight",
  "getEpochInfo",
  // Account queries
  "getAccountInfo",
  "getMultipleAccounts",
  "getBalance",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getProgramAccounts",
  // Transaction queries
  "getTransaction",
  "getSignaturesForAddress",
  "getSignatureStatuses",
  "getLatestBlockhash",
  "getRecentPrioritizationFees",
  "getFeeForMessage",
  "isBlockhashValid",
  // Transaction submission
  "sendTransaction",
  "simulateTransaction",
  // Misc read
  "getMinimumBalanceForRentExemption",
  "getSupply",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate method is in allowlist
    const method = body?.method;
    if (!method || typeof method !== "string") {
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32600, message: "Invalid request: missing method" }, id: body?.id ?? null },
        { status: 400 }
      );
    }

    if (!ALLOWED_RPC_METHODS.has(method)) {
      console.warn(`[/api/rpc] Blocked disallowed method: ${method}`);
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32601, message: `Method not allowed: ${method}` }, id: body?.id ?? null },
        { status: 403 }
      );
    }

    // Forward the JSON-RPC request to Helius
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[/api/rpc] Error:", error);
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Internal RPC proxy error" }, id: null },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "RPC proxy only accepts POST requests" },
    { status: 405 }
  );
}
