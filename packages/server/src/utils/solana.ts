import { Connection, Keypair, Transaction, TransactionInstruction, SendOptions } from "@solana/web3.js";
import { config } from "../config.js";

let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(config.rpcUrl, "confirmed");
  }
  return _connection;
}

/** Base58 alphabet */
const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(str: string): Uint8Array {
  const bytes: number[] = [];
  for (const c of str) {
    const idx = B58_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error(`Invalid base58 character: ${c}`);
    let carry = idx;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const c of str) {
    if (c !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

export function loadKeypair(raw: string): Keypair {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  return Keypair.fromSecretKey(base58Decode(trimmed));
}

export async function sendWithRetry(
  connection: Connection,
  ix: TransactionInstruction,
  signers: Keypair[],
  maxRetries = 3,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const tx = new Transaction().add(ix);
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = signers[0].publicKey;
      tx.sign(...signers);

      const opts: SendOptions = { skipPreflight: false, preflightCommitment: "confirmed" };
      const sig = await connection.sendRawTransaction(tx.serialize(), opts);
      await connection.confirmTransaction(sig, "confirmed");
      return sig;
    } catch (err) {
      lastErr = err;
      const delay = Math.min(1000 * 2 ** attempt, 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
