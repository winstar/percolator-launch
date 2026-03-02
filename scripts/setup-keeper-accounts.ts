/**
 * Manually setup keeper accounts on all markets with generous wait times
 */
import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, sendAndConfirmTransaction, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { encodeInitUser, encodeDepositCollateral, ACCOUNTS_INIT_USER, ACCOUNTS_DEPOSIT_COLLATERAL, buildAccountMetas, buildIx, WELL_KNOWN, deriveVaultAuthority, parseAllAccounts } from "../packages/core/src/index.js";
import * as fs from "fs";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const deploy = JSON.parse(fs.readFileSync("/tmp/percolator-devnet-deployment.json", "utf8"));
const programId = new PublicKey(deploy.programId);
const mint = new PublicKey(deploy.mint);
const keeperPath = process.argv[2] ?? "/tmp/percolator-keepers/keeper-tight_a.json";
const depositAmount = process.argv[3] ?? "5000000000";

async function sleep(ms: number) { await new Promise(r => setTimeout(r, ms)); }

async function main() {
  const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keeperPath, "utf8"))));
  console.log(`Keeper: ${keeper.publicKey.toBase58()}`);

  for (const m of deploy.markets) {
    const slab = new PublicKey(m.slab);
    const [vaultPda] = deriveVaultAuthority(programId, slab);
    const walletAta = await getAssociatedTokenAddress(mint, keeper.publicKey);
    const vaultAta = await getAssociatedTokenAddress(mint, vaultPda, true);

    // Check existing accounts
    let slabInfo = await conn.getAccountInfo(slab);
    let accounts = parseAllAccounts(new Uint8Array(slabInfo!.data));
    let userAcc = accounts.find(a => a.account.kind === 0 && a.account.owner.equals(keeper.publicKey));

    if (!userAcc) {
      console.log(`${m.label}: creating user account...`);
      const initUserData = encodeInitUser({ feePayment: "1000000" });
      const initUserKeys = buildAccountMetas(ACCOUNTS_INIT_USER, [
        keeper.publicKey, slab, walletAta, vaultAta, WELL_KNOWN.tokenProgram,
      ]);
      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        buildIx({ programId, keys: initUserKeys, data: initUserData }),
      );
      tx.feePayer = keeper.publicKey;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      const sig = await sendAndConfirmTransaction(conn, tx, [keeper], { commitment: "confirmed" });
      console.log(`  InitUser: ${sig.slice(0, 16)}...`);

      // Wait generously for finalization
      console.log("  Waiting 5s for finalization...");
      await sleep(5000);

      // Refetch
      slabInfo = await conn.getAccountInfo(slab);
      accounts = parseAllAccounts(new Uint8Array(slabInfo!.data));
      userAcc = accounts.find(a => a.account.kind === 0 && a.account.owner.equals(keeper.publicKey));
      if (!userAcc) {
        console.log(`  ❌ User still not found after 5s wait. Trying again...`);
        await sleep(3000);
        slabInfo = await conn.getAccountInfo(slab);
        accounts = parseAllAccounts(new Uint8Array(slabInfo!.data));
        userAcc = accounts.find(a => a.account.kind === 0 && a.account.owner.equals(keeper.publicKey));
        if (!userAcc) {
          console.log(`  ❌ User not found. Skipping market.`);
          continue;
        }
      }
      console.log(`  User at index ${userAcc.idx}`);
    } else {
      console.log(`${m.label}: user exists at index ${userAcc.idx}`);
    }

    // Check if needs deposit
    const capital = Number(userAcc.account.capital ?? 0) / 1e6;
    if (capital >= 100) {
      console.log(`  Already funded: $${capital.toFixed(2)}`);
      continue;
    }

    // Deposit
    console.log(`  Depositing $${Number(depositAmount) / 1e6}...`);
    const depositData = encodeDepositCollateral({ userIdx: userAcc.idx, amount: depositAmount });
    const depositKeys = buildAccountMetas(ACCOUNTS_DEPOSIT_COLLATERAL, [
      keeper.publicKey, slab, walletAta, vaultAta, WELL_KNOWN.tokenProgram, SYSVAR_CLOCK_PUBKEY,
    ]);
    const tx2 = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      buildIx({ programId, keys: depositKeys, data: depositData }),
    );
    tx2.feePayer = keeper.publicKey;
    tx2.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    const sig2 = await sendAndConfirmTransaction(conn, tx2, [keeper], { commitment: "confirmed" });
    console.log(`  ✅ Deposit: ${sig2.slice(0, 16)}...`);
    await sleep(2000);
  }
  console.log("\nDone!");
}
main().catch(e => console.error("Error:", e.message));
