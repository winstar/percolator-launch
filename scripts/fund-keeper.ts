import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, sendAndConfirmTransaction, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { encodeDepositCollateral, ACCOUNTS_DEPOSIT_COLLATERAL, buildAccountMetas, buildIx, WELL_KNOWN, deriveVaultAuthority, parseAllAccounts } from "../packages/core/src/index.js";
import * as fs from "fs";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const deploy = JSON.parse(fs.readFileSync("/tmp/percolator-devnet-deployment.json", "utf8"));
const programId = new PublicKey(deploy.programId);
const mint = new PublicKey(deploy.mint);
const keeperPath = process.argv[2] ?? "/tmp/percolator-keepers/keeper-tight_a.json";
const amount = process.argv[3] ?? "5000000000"; // 5000 USDC

async function main() {
  const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keeperPath, "utf8"))));
  console.log(`Keeper: ${keeper.publicKey.toBase58()}`);

  for (const m of deploy.markets) {
    const slab = new PublicKey(m.slab);
    const [vaultPda] = deriveVaultAuthority(programId, slab);
    const walletAta = await getAssociatedTokenAddress(mint, keeper.publicKey);
    const vaultAta = await getAssociatedTokenAddress(mint, vaultPda, true);

    const slabInfo = await conn.getAccountInfo(slab);
    const accounts = parseAllAccounts(new Uint8Array(slabInfo!.data));
    const userAcc = accounts.find(a => a.account.kind === 0 && a.account.owner.equals(keeper.publicKey));
    if (!userAcc) { console.log(`${m.label}: no user account`); continue; }

    const capital = Number(userAcc.account.capital ?? 0) / 1e6;
    if (capital >= 100) { console.log(`${m.label}: already funded ($${capital})`); continue; }

    console.log(`${m.label}: depositing to user idx=${userAcc.idx}...`);
    const depositData = encodeDepositCollateral({ userIdx: userAcc.idx, amount });
    const depositKeys = buildAccountMetas(ACCOUNTS_DEPOSIT_COLLATERAL, [
      keeper.publicKey, slab, walletAta, vaultAta, WELL_KNOWN.tokenProgram, SYSVAR_CLOCK_PUBKEY,
    ]);
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      buildIx({ programId, keys: depositKeys, data: depositData }),
    );
    tx.feePayer = keeper.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    const sig = await sendAndConfirmTransaction(conn, tx, [keeper], { commitment: "confirmed" });
    console.log(`${m.label}: ✅ deposited → ${sig.slice(0, 16)}...`);
  }
}
main().catch(e => console.error("Error:", e.message));
