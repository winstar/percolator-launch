"use client";

import { useCallback, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  encodeWithdrawCollateral,
  encodePushOraclePrice,
  encodeKeeperCrank,
  ACCOUNTS_WITHDRAW_COLLATERAL,
  ACCOUNTS_PUSH_ORACLE_PRICE,
  ACCOUNTS_KEEPER_CRANK,
  buildAccountMetas,
  WELL_KNOWN,
  buildIx,
  getAta,
  deriveVaultAuthority,
  derivePythPushOraclePDA,
} from "@percolator/core";
import { sendTx } from "@/lib/tx";
import { getConfig } from "@/lib/config";
import { useSlabState } from "@/components/providers/SlabProvider";

export function useWithdraw(slabAddress: string) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { config: mktConfig } = useSlabState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdraw = useCallback(
    async (params: { userIdx: number; amount: bigint }) => {
      setLoading(true);
      setError(null);
      try {
        if (!wallet.publicKey || !mktConfig) throw new Error("Wallet not connected or market not loaded");
        const programId = new PublicKey(getConfig().programId);
        const slabPk = new PublicKey(slabAddress);
        const userAta = await getAta(wallet.publicKey, mktConfig.collateralMint);
        const [vaultPda] = deriveVaultAuthority(programId, slabPk);

        // Determine oracle account based on market config
        const feedHex = Array.from(mktConfig.indexFeedId.toBytes()).map(b => b.toString(16).padStart(2, "0")).join("");
        const isHyperp = feedHex === "0".repeat(64);
        const oracleAccount = isHyperp ? slabPk : derivePythPushOraclePDA(feedHex)[0];

        const instructions = [];

        // Auto-crank: push fresh oracle price + crank before withdraw (admin oracle mode)
        const userIsAuthority = mktConfig.oracleAuthority?.equals(wallet.publicKey);
        if (isHyperp && userIsAuthority) {
          const now = Math.floor(Date.now() / 1000);
          const priceE6 = mktConfig.authorityPriceE6?.toString() ?? "1000000";
          instructions.push(buildIx({
            programId,
            keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [wallet.publicKey, slabPk]),
            data: encodePushOraclePrice({ priceE6, timestamp: now.toString() }),
          }));
          instructions.push(buildIx({
            programId,
            keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [wallet.publicKey, slabPk, WELL_KNOWN.clock, slabPk]),
            data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }),
          }));
        }

        instructions.push(buildIx({
          programId,
          keys: buildAccountMetas(ACCOUNTS_WITHDRAW_COLLATERAL, [
            wallet.publicKey, slabPk, mktConfig.vaultPubkey, userAta, vaultPda, WELL_KNOWN.tokenProgram, WELL_KNOWN.clock, oracleAccount,
          ]),
          data: encodeWithdrawCollateral({ userIdx: params.userIdx, amount: params.amount.toString() }),
        }));

        return await sendTx({ connection, wallet, instructions, computeUnits: 300_000 });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [connection, wallet, mktConfig, slabAddress]
  );

  return { withdraw, loading, error };
}
