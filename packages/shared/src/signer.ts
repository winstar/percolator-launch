/**
 * Signer Module
 * 
 * Centralized place to get the sealed signer.
 * Loads the crank keypair once and provides sealed signing access.
 */

import { loadSealedKeypair, SealedSigner } from "./sealedKeypair.js";

let _signer: SealedSigner | null = null;

/**
 * Get the sealed signer for crank operations.
 * Loads the keypair from CRANK_KEYPAIR env var on first call.
 * Subsequent calls return the same sealed signer.
 * 
 * @throws Error if CRANK_KEYPAIR env var is not set or invalid
 */
export function getSealedSigner(): SealedSigner {
  if (!_signer) {
    _signer = loadSealedKeypair(process.env);
  }
  return _signer;
}

/**
 * Get the crank wallet public key (string).
 * Safe to log/display (no private key exposure).
 */
export function getCrankPublicKey(): string {
  return getSealedSigner().publicKey();
}
