"use client";

import { FC, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  encodeSetOracleAuthority,
  ACCOUNTS_SET_ORACLE_AUTHORITY,
  buildAccountMetas,
  buildIx,
} from "@percolator/core";
import { sendTx } from "@/lib/tx";
import { getConfig } from "@/lib/config";
import { useSlabState } from "@/components/providers/SlabProvider";

export const DelegateCrankButton: FC<{ slabAddress: string }> = ({ slabAddress }) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { config: mktConfig, header } = useSlabState();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const cfg = getConfig();
  if (!cfg.crankWallet || !wallet.publicKey || !mktConfig || !header) return null;

  const crankPk = new PublicKey(cfg.crankWallet);
  const isAdmin = header.admin.equals(wallet.publicKey);
  const alreadyDelegated = mktConfig.oracleAuthority?.equals(crankPk);

  if (!isAdmin || alreadyDelegated) return null;

  async function delegate() {
    if (!wallet.publicKey) return;
    setLoading(true);
    try {
      const programId = new PublicKey(cfg.programId);
      const slabPk = new PublicKey(slabAddress);
      const ix = buildIx({
        programId,
        keys: buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [wallet.publicKey, slabPk]),
        data: encodeSetOracleAuthority({ newAuthority: crankPk }),
      });
      await sendTx({ connection, wallet, instructions: [ix] });
      setDone(true);
    } catch (e) {
      console.error("Delegate failed:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-800/50 bg-amber-900/20 p-3">
      <p className="mb-2 text-xs text-amber-200">
        Oracle authority is your wallet. Delegate to crank service for automatic price updates.
      </p>
      <button
        onClick={delegate}
        disabled={loading || done}
        className="w-full rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
      >
        {done ? "✅ Delegated" : loading ? "Delegating..." : "Delegate to Crank Service"}
      </button>
    </div>
  );
};
