"use client";

import { useCallback, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  encodeTradeCpi,
  encodePushOraclePrice,
  encodeKeeperCrank,
  ACCOUNTS_TRADE_CPI,
  ACCOUNTS_PUSH_ORACLE_PRICE,
  ACCOUNTS_KEEPER_CRANK,
  buildAccountMetas,
  buildIx,
  deriveLpPda,
  derivePythPushOraclePDA,
  WELL_KNOWN,
} from "@percolator/core";
import { sendTx } from "@/lib/tx";
import { getConfig } from "@/lib/config";
import { useSlabState } from "@/components/providers/SlabProvider";

export function useTrade(slabAddress: string) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { config: mktConfig, accounts } = useSlabState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trade = useCallback(
    async (params: { lpIdx: number; userIdx: number; size: bigint }) => {
      setLoading(true);
      setError(null);
      try {
        if (!wallet.publicKey || !mktConfig) throw new Error("Wallet not connected or market not loaded");
        const lpAccount = accounts.find((a) => a.idx === params.lpIdx);
        if (!lpAccount) throw new Error(`LP at index ${params.lpIdx} not found`);

        const programId = new PublicKey(getConfig().programId);
        const slabPk = new PublicKey(slabAddress);
        const [lpPda] = deriveLpPda(programId, slabPk, params.lpIdx);

        // Determine oracle account based on market config
        const feedHex = Array.from(mktConfig.indexFeedId.toBytes()).map(b => b.toString(16).padStart(2, "0")).join("");
        const isHyperp = feedHex === "0".repeat(64);
        const oracleAccount = isHyperp ? slabPk : derivePythPushOraclePDA(feedHex)[0];

        const instructions = [];

        // Auto-crank: push fresh oracle price + crank before trade (admin oracle mode)
        // Only push price if user IS the oracle authority (otherwise crank service handles it)
        const userIsAuthority = mktConfig.oracleAuthority?.equals(wallet.publicKey);
        if (isHyperp && userIsAuthority) {
          const now = Math.floor(Date.now() / 1000);
          // Use last known price from slab state or default
          const priceE6 = mktConfig.authorityPriceE6?.toString() ?? "1000000";
          const pushIx = buildIx({
            programId,
            keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [wallet.publicKey, slabPk]),
            data: encodePushOraclePrice({ priceE6, timestamp: now.toString() }),
          });
          instructions.push(pushIx);

          const crankIx = buildIx({
            programId,
            keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [wallet.publicKey, slabPk, WELL_KNOWN.clock, slabPk]),
            data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }),
          });
          instructions.push(crankIx);
        }

        const tradeIx = buildIx({
          programId,
          keys: buildAccountMetas(ACCOUNTS_TRADE_CPI, [
            wallet.publicKey,
            lpAccount.account.owner,
            slabPk,
            WELL_KNOWN.clock,
            oracleAccount,
            lpAccount.account.matcherProgram,
            lpAccount.account.matcherContext,
            lpPda,
          ]),
          data: encodeTradeCpi({ lpIdx: params.lpIdx, userIdx: params.userIdx, size: params.size.toString() }),
        });
        instructions.push(tradeIx);

        return await sendTx({ connection, wallet, instructions, computeUnits: 600_000 });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [connection, wallet, mktConfig, accounts, slabAddress]
  );

  return { trade, loading, error };
}
