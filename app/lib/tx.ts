import { Connection, Transaction, TransactionInstruction, ComputeBudgetProgram } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import type { Signer } from "@solana/web3.js";
import { getConfig } from "./config";

export interface SendTxParams {
  connection: Connection;
  wallet: WalletContextState;
  instructions: TransactionInstruction[];
  computeUnits?: number;
  signers?: Signer[];
  /** Max retries on blockhash expiry (default 2) */
  maxRetries?: number;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_TIME_MS = 90_000;
const PRIORITY_FEE = Number(process.env.NEXT_PUBLIC_PRIORITY_FEE ?? 100_000);

// Network detection cache — only check once per session
let networkValidated = false;
let lastGenesisHash: string | null = null;

/**
 * Validate that the wallet's connected network matches the app's expected network.
 * Throws an error if there's a mismatch (e.g. wallet on mainnet, app on devnet).
 */
async function validateNetwork(connection: Connection): Promise<void> {
  if (networkValidated) return; // Already validated this session
  
  try {
    const genesisHash = await connection.getGenesisHash();
    const cfg = getConfig();
    
    // Known genesis hashes for Solana clusters
    const GENESIS_HASHES = {
      mainnet: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
      devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
      testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
    };
    
    const expectedHash = GENESIS_HASHES[cfg.network as keyof typeof GENESIS_HASHES];
    
    if (expectedHash && genesisHash !== expectedHash) {
      // Cache the detected hash to show in error message
      lastGenesisHash = genesisHash;
      
      // Determine which network the wallet is actually on
      let detectedNetwork = "unknown";
      for (const [net, hash] of Object.entries(GENESIS_HASHES)) {
        if (hash === genesisHash) {
          detectedNetwork = net;
          break;
        }
      }
      
      throw new Error(
        `Network mismatch: App is configured for ${cfg.network.toUpperCase()} but your wallet is connected to ${detectedNetwork.toUpperCase()}. ` +
        `Please switch your wallet to ${cfg.network.toUpperCase()} or change the app network in settings.`
      );
    }
    
    networkValidated = true;
    lastGenesisHash = genesisHash;
  } catch (error) {
    // If it's our network mismatch error, rethrow it
    if (error instanceof Error && error.message.includes("Network mismatch")) {
      throw error;
    }
    // Otherwise, log but don't block (RPC might not support getGenesisHash)
    console.warn("[validateNetwork] Failed to validate network:", error);
  }
}

/**
 * Poll getSignatureStatuses until confirmed or timeout.
 * More reliable than confirmTransaction which can falsely report expiry.
 */
async function pollConfirmation(
  connection: Connection,
  signature: string,
): Promise<void> {
  const start = Date.now();
  let pollCount = 0;

  while (Date.now() - start < MAX_POLL_TIME_MS) {
    pollCount++;
    try {
      const resp = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: pollCount > 5,
      });
      const status = resp.value[0];

      if (status) {
        if (status.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        if (
          status.confirmationStatus === "confirmed" ||
          status.confirmationStatus === "finalized"
        ) {
          return; // Success!
        }
      }
    } catch (e) {
      // If it's our own "Transaction failed" error, rethrow
      if (e instanceof Error && e.message.startsWith("Transaction failed:")) throw e;
      // Otherwise RPC hiccup — keep polling
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(
    `Confirmation timeout (${MAX_POLL_TIME_MS / 1000}s) — tx may still land. Check explorer: ${signature}`
  );
}

/**
 * Send a transaction with polling-based confirmation.
 *
 * Uses getSignatureStatuses polling instead of confirmTransaction,
 * which can falsely report "block height exceeded" when the tx
 * actually landed on-chain.
 */
export async function sendTx({
  connection,
  wallet,
  instructions,
  computeUnits = 200_000,
  signers = [],
  maxRetries = 2,
}: SendTxParams): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }
  
  // Validate network before sending any transactions
  await validateNetwork(connection);

  let lastError: Error | null = null;
  let lastSignature: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }));
      for (const ix of instructions) {
        tx.add(ix);
      }

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      if (signers.length > 0) {
        tx.partialSign(...signers);
      }

      const signed = await wallet.signTransaction(tx);

      lastSignature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 5,
      });

      // Poll for confirmation instead of using confirmTransaction
      // (confirmTransaction falsely reports "block height exceeded" on devnet)
      await pollConfirmation(connection, lastSignature);

      return lastSignature;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = e instanceof Error ? e : new Error(msg);

      const isBlockhashExpired =
        msg.includes("block height exceeded") ||
        msg.includes("Blockhash not found") ||
        msg.includes("has expired");

      if (isBlockhashExpired && attempt < maxRetries) {
        // R2-S7: Before retrying, check if the original tx actually landed
        if (lastSignature) {
          try {
            const statusResp = await connection.getSignatureStatuses([lastSignature], {
              searchTransactionHistory: true,
            });
            const prevStatus = statusResp.value[0];
            if (
              prevStatus &&
              !prevStatus.err &&
              (prevStatus.confirmationStatus === "confirmed" ||
                prevStatus.confirmationStatus === "finalized")
            ) {
              return lastSignature; // Already landed — no retry needed
            }
          } catch {
            // RPC error checking status — proceed with retry
          }
        }
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("Transaction failed after retries");
}
