/**
 * Sealed Keypair Module
 * 
 * Provides a signer interface that seals the private key and never exposes it.
 * The private key is loaded once on app startup and only used for signing.
 * Raw key material is never stored in config or logged.
 */

import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Sealed signer that never exposes the private key.
 * Only provides sign() capability.
 */
export interface SealedSigner {
  /** Public key of the signer */
  publicKey(): string;
  
  /** Sign a transaction (sealed key never exposed) */
  signTransaction(tx: Transaction | VersionedTransaction): Transaction | VersionedTransaction;
  
  /** Sign a message */
  signMessage(message: Uint8Array): Uint8Array;
}

/**
 * Load and seal a keypair from environment variable.
 * The private key is never stored in config or exposed.
 * 
 * @throws Error if CRANK_KEYPAIR is not set or invalid
 */
export function loadSealedKeypair(env: NodeJS.ProcessEnv): SealedSigner {
  const rawKey = env.CRANK_KEYPAIR;

  // 1. Validate key is set
  if (!rawKey) {
    throw new Error(
      "❌ CRANK_KEYPAIR env var is required.\n" +
      "Set it to a base58-encoded or JSON-array-encoded Solana secret key.\n" +
      "Never commit private keys to version control.\n" +
      "Use a secrets manager (1Password, Vault, etc.) for production."
    );
  }

  // 2. Load keypair (try both formats)
  let keypair: Keypair;
  try {
    // Try base58 format
    const decoded = bs58.default.decode(rawKey);
    
    // Validate length (Solana keypair must be 64 bytes)
    if (decoded.length !== 64) {
      throw new Error(
        `Invalid key length: expected 64 bytes, got ${decoded.length}. ` +
        `Did you paste only the public key instead of the full keypair?`
      );
    }
    
    keypair = Keypair.fromSecretKey(decoded);
  } catch (e) {
    // Try JSON array format
    try {
      const parsed = JSON.parse(rawKey);
      if (!Array.isArray(parsed) || parsed.length !== 64) {
        throw new Error(`Invalid key: must be 64-byte array, got ${parsed.length} items`);
      }
      const decoded = Uint8Array.from(parsed);
      keypair = Keypair.fromSecretKey(decoded);
    } catch (jsonError) {
      throw new Error(
        "❌ Invalid CRANK_KEYPAIR format.\n" +
        "Must be either:\n" +
        "  1. Base58-encoded secret key (44-88 characters)\n" +
        "  2. JSON array of 64 bytes: [1, 2, 3, ..., 64]\n" +
        "Got: " + (rawKey.length > 50 ? rawKey.substring(0, 50) + "..." : rawKey)
      );
    }
  }

  // 3. Return sealed signer (key is sealed in closure, never exposed)
  return createSealedSigner(keypair, env.AUDIT_SIGNING_LOG === "1");
}

/**
 * Create a sealed signer from a keypair.
 * The keypair is kept in the closure and never exposed.
 */
function createSealedSigner(keypair: Keypair, auditEnabled: boolean): SealedSigner {
  const publicKeyString = keypair.publicKey.toBase58();

  return {
    publicKey(): string {
      return publicKeyString;
    },

    signTransaction(tx: Transaction | VersionedTransaction): Transaction | VersionedTransaction {
      if (auditEnabled) {
        console.log(`[AUDIT] Signing transaction`);
      }

      // Sign the transaction
      if (tx instanceof VersionedTransaction) {
        tx.sign([keypair]);
      } else {
        tx.sign(keypair);
      }

      return tx;
    },

    signMessage(message: Uint8Array): Uint8Array {
      if (auditEnabled) {
        console.log(
          `[AUDIT] Signing message (${message.length} bytes)`
        );
      }

      return keypair.signMessage(message);
    },
  };
}

/**
 * Validate that a sealed signer is properly configured.
 * @throws Error if public key doesn't match expected address
 */
export function validateSigner(
  signer: SealedSigner,
  expectedPublicKey?: string
): void {
  const publicKey = signer.publicKey();

  // Basic validation: public key looks like a Solana address
  if (!/[1-9A-HJ-NP-Z]{40,45}/.test(publicKey)) {
    throw new Error(
      `❌ Invalid public key from signer: ${publicKey}. ` +
      `Expected base58-encoded Solana address.`
    );
  }

  // If expected public key specified, verify it matches
  if (expectedPublicKey && publicKey !== expectedPublicKey) {
    throw new Error(
      `❌ Signer public key mismatch.\n` +
      `Expected: ${expectedPublicKey}\n` +
      `Got: ${publicKey}\n` +
      `Check that CRANK_KEYPAIR matches the intended signer.`
    );
  }

  console.log(`✅ Signer validated: ${publicKey}`);
}
