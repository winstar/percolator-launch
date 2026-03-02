import { Connection, PublicKey } from "@solana/web3.js";
import { parseAllAccounts } from "../packages/core/src/index.js";

const conn = new Connection("https://api.devnet.solana.com");
const wallet = new PublicKey("8ov3Htkb6tB3C6Ku1EkCzhJ6ayrcfqapuL91yD9PpMZB");
const slabs: Record<string, string> = {
  SOL: "GGU89iQLmceyXRDK8vgAxVvdi9RJb9JsPhXZ2NoFSENV",
  BTC: "AB3ZN1vxbBEh8FZRfrL55QQUUaLCwawqvCYzTDpgbuLF",
};

async function check(label: string, addr: string) {
  const slab = await conn.getAccountInfo(new PublicKey(addr));
  if (!slab) { console.log(label + ": not found"); return; }
  const data = new Uint8Array(slab.data);
  const accounts = parseAllAccounts(data);
  console.log(label + ": " + accounts.length + " accounts");
  for (const a of accounts) {
    const owner = a.account.owner.toBase58();
    const isWallet = a.account.owner.equals(wallet);
    const kind = a.account.kind === 0 ? "USER" : a.account.kind === 1 ? "LP" : "OTHER(" + a.account.kind + ")";
    const col = Number(a.account.capital ?? 0) / 1e6;
    const pos = Number(a.account.positionSize ?? 0) / 1e6;
    const pnl = Number(a.account.pnl ?? 0) / 1e6;
    console.log(`  idx=${a.idx} kind=${kind} owner=${owner.slice(0, 12)}... capital=$${col.toFixed(2)} pos=${pos.toFixed(6)} pnl=$${pnl.toFixed(2)}${isWallet ? " ← KEEPER" : ""}`);
  }
}

async function main() {
  for (const [label, addr] of Object.entries(slabs)) {
    await check(label, addr);
    console.log();
  }
}
main().catch(e => console.error(e.message));
