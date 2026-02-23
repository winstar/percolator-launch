"use client";

import { FC, ReactNode, useMemo } from "react";
import { PrivyProvider, usePrivy, type WalletListEntry } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { SentryUserContext } from "@/components/providers/SentryUserContext";
import { PrivyLoginContext } from "@/hooks/usePrivySafe";

/**
 * Client-only Privy provider wrapper. Loaded via next/dynamic with ssr:false
 * to prevent Privy SDK from crashing during server-side rendering.
 */
const PrivyProviderClient: FC<{ appId: string; children: ReactNode }> = ({
  appId,
  children,
}) => {
  const solanaConnectors = useMemo(() => toSolanaWalletConnectors(), []);
  const walletConnectCloudProjectId =
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  const walletList = useMemo<WalletListEntry[]>(
    () => ["phantom", "solflare", "backpack", "jupiter", "detected_solana_wallets"],
    []
  );

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          walletChainType: "solana-only",
          showWalletLoginFirst: true,
          walletList,
        },
        loginMethods: ["wallet", "email"],
        walletConnectCloudProjectId,
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <SentryUserContext />
      <PrivyLoginBridge>{children}</PrivyLoginBridge>
    </PrivyProvider>
  );
};

/**
 * Bridge that exposes Privy's login function via context so components
 * outside the Privy tree can trigger wallet connection safely.
 */
const PrivyLoginBridge: FC<{ children: ReactNode }> = ({ children }) => {
  const { login } = usePrivy();
  return (
    <PrivyLoginContext.Provider value={login}>
      {children}
    </PrivyLoginContext.Provider>
  );
};

export default PrivyProviderClient;
