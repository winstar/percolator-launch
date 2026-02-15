"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Transaction,
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  SendTransactionError,
  Connection,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  getMintLen,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import {
  encodeInitMarket,
  encodeInitLP,
  encodeInitVamm,
  encodeSetOracleAuthority,
  encodePushOraclePrice,
  encodeSetOraclePriceCap,
  encodeUpdateConfig,
  encodeKeeperCrank,
  encodeDepositCollateral,
  encodeTopUpInsurance,
  ACCOUNTS_INIT_MARKET,
  ACCOUNTS_INIT_LP,
  ACCOUNTS_SET_ORACLE_AUTHORITY,
  ACCOUNTS_PUSH_ORACLE_PRICE,
  ACCOUNTS_UPDATE_CONFIG,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_DEPOSIT_COLLATERAL,
  ACCOUNTS_TOPUP_INSURANCE,
  buildAccountMetas,
  WELL_KNOWN,
  buildIx,
  deriveVaultAuthority,
  SLAB_TIERS,
  deriveLpPda,
} from "@percolator/core";
import { ScenarioSelector } from "@/components/simulation/ScenarioSelector";
import { SimulationControls } from "@/components/simulation/SimulationControls";
import { LiveEventFeed } from "@/components/simulation/LiveEventFeed";
import { SimulationMetrics } from "@/components/simulation/SimulationMetrics";
import { BotLeaderboard } from "@/components/simulation/BotLeaderboard";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

/* ─── Constants ─── */
const PROGRAM_ID = new PublicKey("FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD");
const MATCHER_PROGRAM_ID = new PublicKey("4HcGCsyjAqnFua5ccuXyt8KRRQzKFbGTJkVChpS7Yfzy");
const MIN_SOL = 0.5;
const MIN_LAMPORTS = MIN_SOL * LAMPORTS_PER_SOL;
const MINT_AMOUNT = 10_000_000_000n;
const LP_FEE = 1_000_000n;
const INITIAL_PRICE_E6 = 1_000_000n;
const MATCHER_CTX_SIZE = 320;
const MINT_RENT = 1_461_600;
const SLAB_RENT = 438_034_560;
const MATCHER_CTX_RENT = 3_118_080;

const RPC_URL = `https://devnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY ?? ""}`;

/* ─── Types ─── */
interface SimState {
  running: boolean;
  slabAddress: string | null;
  price: number;
  scenario: string | null;
  model: string;
  uptime: number;
}

interface TokenPreview {
  name: string;
  symbol: string;
  description: string;
  decimals: number;
}

interface PricePoint {
  time: number;
  price: number;
}

type Phase = "deposit" | "building" | "running" | "ended";

/* ─── Helpers ─── */
function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

async function extractError(err: unknown): Promise<string> {
  if (err instanceof SendTransactionError) {
    try {
      const logs = await (err as SendTransactionError & { getLogs: (c?: unknown) => Promise<string[]> }).getLogs(undefined);
      if (logs?.length) {
        const fails = logs.filter((l: string) => l.includes("failed") || l.includes("Error"));
        if (fails.length) return `${err.message} | ${fails.join("; ")}`;
        return `${err.message} | ${logs.slice(-5).join("; ")}`;
      }
    } catch {
      const raw = (err as unknown as Record<string, unknown>);
      const anyLogs = raw.transactionLogs || raw.logs;
      if (Array.isArray(anyLogs)) return `${err.message} | ${(anyLogs as string[]).slice(-5).join("; ")}`;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function sendAndConfirm(
  conn: Connection,
  tx: Transaction,
  signers: Keypair[],
  label: string
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = signers[0].publicKey;
  tx.partialSign(...signers);
  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    return sig;
  } catch (err) {
    const msg = await extractError(err);
    throw new Error(`[${label}] ${msg}`);
  }
}

/* ─── Component ─── */
export default function SimulationPage() {
  const rpcConnection = useRef(new Connection(RPC_URL, "confirmed")).current;
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection: walletConnection } = useConnection();

  const [phase, setPhase] = useState<Phase>("deposit");
  const [payer] = useState(() => Keypair.generate());
  const [balance, setBalance] = useState(0);
  const [tokenPreview, setTokenPreview] = useState<TokenPreview | null>(null);
  const [slabAddress, setSlabAddress] = useState<string | null>(null);
  const [mintAddress, setMintAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState("");
  const [stepNum, setStepNum] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [state, setState] = useState<SimState>({ running: false, slabAddress: null, price: 1_000_000, scenario: null, model: "random-walk", uptime: 0 });
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const buildingRef = useRef(false);

  /* ─── Fetch random token ─── */
  const fetchTokenPreview = useCallback(async () => {
    try {
      const res = await fetch("/api/simulation/random-token");
      if (res.ok) {
        const data = await res.json();
        setTokenPreview({ name: data.name, symbol: data.symbol, description: data.description, decimals: data.decimals ?? 6 });
      }
    } catch {
      setTokenPreview({ name: "Mystery Token", symbol: "???", description: "Could not load", decimals: 6 });
    }
  }, []);

  useEffect(() => { fetchTokenPreview(); }, [fetchTokenPreview]);

  /* ─── Poll balance while waiting for deposit ─── */
  useEffect(() => {
    if (phase !== "deposit") return;
    const interval = setInterval(async () => {
      try {
        const bal = await rpcConnection.getBalance(payer.publicKey);
        setBalance(bal);
        if (bal >= MIN_LAMPORTS && !buildingRef.current) {
          buildingRef.current = true;
          clearInterval(interval);
          buildMarket();
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, payer]);

  /* ─── Poll simulation state ─── */
  useEffect(() => {
    if (phase !== "running") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/simulation");
        if (res.ok) {
          const data = await res.json();
          const newPrice = data.price ?? state.price;
          setState(prev => ({ ...prev, running: data.running, price: newPrice, scenario: data.scenario ?? prev.scenario, model: data.model ?? prev.model, uptime: data.uptime ?? prev.uptime }));
          setPriceHistory(prev => {
            const next = [...prev, { time: Date.now(), price: newPrice / 1e6 }];
            return next.slice(-120); // keep last 120 data points (~6 min at 3s interval)
          });
          if (!data.running) setPhase("ended");
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ─── Send SOL via wallet ─── */
  const handleWalletSend = async () => {
    if (!publicKey || !sendTransaction) return;
    setSending(true);
    setError(null);
    try {
      const { blockhash, lastValidBlockHeight } = await walletConnection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: publicKey }).add(
        SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: payer.publicKey, lamports: MIN_LAMPORTS })
      );
      const sig = await sendTransaction(tx, walletConnection, { skipPreflight: true });
      await walletConnection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      // Balance poll will detect it and trigger buildMarket
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("reject")) {
        setError(`Transfer failed: ${msg}. Make sure Phantom is on devnet with SOL.`);
      }
    } finally {
      setSending(false);
    }
  };

  /* ─── Build market (all automatic after deposit detected) ─── */
  const buildMarket = async () => {
    setPhase("building");
    setError(null);
    setStepNum(0);

    try {
      const decimals = tokenPreview?.decimals ?? 6;
      const oracleKp = Keypair.generate();
      const mintKp = Keypair.generate();
      const slabKp = Keypair.generate();
      const matcherCtxKp = Keypair.generate();

      const tier = SLAB_TIERS.small;
      const [vaultPda] = deriveVaultAuthority(PROGRAM_ID, slabKp.publicKey);
      const vaultAta = await getAssociatedTokenAddress(mintKp.publicKey, vaultPda, true);
      const [lpPda] = deriveLpPda(PROGRAM_ID, slabKp.publicKey, 0);
      const payerAta = await getAssociatedTokenAddress(mintKp.publicKey, payer.publicKey);

      // Step 1: Create mint + slab + market
      setStep("Creating mint, slab & market..."); setStepNum(1);
      {
        const tx = new Transaction();
        tx.add(SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: mintKp.publicKey, lamports: MINT_RENT, space: getMintLen([]), programId: TOKEN_PROGRAM_ID }));
        tx.add(createInitializeMint2Instruction(mintKp.publicKey, decimals, payer.publicKey, null));
        tx.add(SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: slabKp.publicKey, lamports: SLAB_RENT, space: tier.dataSize, programId: PROGRAM_ID }));
        tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, vaultAta, vaultPda, mintKp.publicKey));
        tx.add(buildIx({
          programId: PROGRAM_ID,
          keys: buildAccountMetas(ACCOUNTS_INIT_MARKET, [payer.publicKey, slabKp.publicKey, mintKp.publicKey, vaultAta, WELL_KNOWN.tokenProgram, WELL_KNOWN.clock, WELL_KNOWN.rent, vaultPda, WELL_KNOWN.systemProgram]),
          data: encodeInitMarket({
            admin: payer.publicKey, collateralMint: mintKp.publicKey, indexFeedId: "0".repeat(64),
            maxStalenessSecs: "86400", confFilterBps: 0, invert: 0, unitScale: 0,
            initialMarkPriceE6: INITIAL_PRICE_E6.toString(), warmupPeriodSlots: "10",
            maintenanceMarginBps: "500", initialMarginBps: "1000", tradingFeeBps: "30",
            maxAccounts: "256", newAccountFee: "1000000", riskReductionThreshold: "0",
            maintenanceFeePerSlot: "0", maxCrankStalenessSlots: "400", liquidationFeeBps: "100",
            liquidationFeeCap: "100000000000", liquidationBufferBps: "50", minLiquidationAbs: "1000000",
          }),
        }));
        await sendAndConfirm(rpcConnection, tx, [payer, mintKp, slabKp], "Create market");
      }
      setSlabAddress(slabKp.publicKey.toBase58());
      setMintAddress(mintKp.publicKey.toBase58());

      // Step 2: Oracle + Config + Crank
      setStep("Setting up oracle & config..."); setStepNum(2);
      {
        const tx = new Transaction();
        const t = nowSecs();
        tx.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [payer.publicKey, slabKp.publicKey]), data: encodeSetOracleAuthority({ newAuthority: payer.publicKey }) }));
        tx.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, slabKp.publicKey]), data: encodePushOraclePrice({ priceE6: INITIAL_PRICE_E6.toString(), timestamp: t.toString() }) }));
        tx.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [payer.publicKey, slabKp.publicKey]), data: encodeSetOraclePriceCap({ maxChangeE2bps: 100_000n }) }));
        tx.add(buildIx({
          programId: PROGRAM_ID,
          keys: buildAccountMetas(ACCOUNTS_UPDATE_CONFIG, [payer.publicKey, slabKp.publicKey]),
          data: encodeUpdateConfig({
            fundingHorizonSlots: "3600", fundingKBps: "100", fundingInvScaleNotionalE6: "1000000000000",
            fundingMaxPremiumBps: "1000", fundingMaxBpsPerSlot: "10", threshFloor: "0", threshRiskBps: "500",
            threshUpdateIntervalSlots: "100", threshStepBps: "100", threshAlphaBps: "5000",
            threshMin: "0", threshMax: "1000000000000000000", threshMinStep: "0",
          }),
        }));
        tx.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, slabKp.publicKey, WELL_KNOWN.clock, slabKp.publicKey]), data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }) }));
        await sendAndConfirm(rpcConnection, tx, [payer], "Oracle+config");
      }

      // Step 3: LP + vAMM
      setStep("Initializing LP & vAMM..."); setStepNum(3);
      {
        const tx = new Transaction();
        tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, payerAta, payer.publicKey, mintKp.publicKey));
        tx.add(SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: matcherCtxKp.publicKey, lamports: MATCHER_CTX_RENT, space: MATCHER_CTX_SIZE, programId: MATCHER_PROGRAM_ID }));
        tx.add(createMintToInstruction(mintKp.publicKey, payerAta, payer.publicKey, LP_FEE));
        tx.add(buildIx({
          programId: PROGRAM_ID,
          keys: buildAccountMetas(ACCOUNTS_INIT_LP, [payer.publicKey, slabKp.publicKey, payerAta, vaultAta, WELL_KNOWN.tokenProgram]),
          data: encodeInitLP({ matcherProgram: MATCHER_PROGRAM_ID, matcherContext: matcherCtxKp.publicKey, feePayment: LP_FEE.toString() }),
        }));
        tx.add(buildIx({
          programId: MATCHER_PROGRAM_ID,
          keys: [
            { pubkey: lpPda, isSigner: false, isWritable: false },
            { pubkey: matcherCtxKp.publicKey, isSigner: false, isWritable: true },
          ],
          data: encodeInitVamm({
            mode: 0, tradingFeeBps: 30, baseSpreadBps: 50, maxTotalBps: 200,
            impactKBps: 0, liquidityNotionalE6: 10_000_000_000_000n,
            maxFillAbs: 1_000_000_000_000n, maxInventoryAbs: 0n,
          }),
        }));
        await sendAndConfirm(rpcConnection, tx, [payer, matcherCtxKp], "LP+vAMM");
      }

      // Step 4: Delegate oracle + final crank
      setStep("Finalizing oracle..."); setStepNum(4);
      {
        const tx = new Transaction();
        const t = nowSecs();
        tx.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, slabKp.publicKey]), data: encodePushOraclePrice({ priceE6: INITIAL_PRICE_E6.toString(), timestamp: t.toString() }) }));
        tx.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, slabKp.publicKey, WELL_KNOWN.clock, slabKp.publicKey]), data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }) }));
        tx.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [payer.publicKey, slabKp.publicKey]), data: encodeSetOracleAuthority({ newAuthority: oracleKp.publicKey }) }));
        tx.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [oracleKp.publicKey, slabKp.publicKey]), data: encodePushOraclePrice({ priceE6: INITIAL_PRICE_E6.toString(), timestamp: (t + 1).toString() }) }));
        await sendAndConfirm(rpcConnection, tx, [payer, oracleKp], "Finalize oracle");
      }

      // Step 5: Fund market
      setStep("Minting tokens & funding market..."); setStepNum(5);
      {
        const tx1 = new Transaction();
        tx1.add(createMintToInstruction(mintKp.publicKey, payerAta, payer.publicKey, MINT_AMOUNT));
        await sendAndConfirm(rpcConnection, tx1, [payer], "Mint tokens");
      }
      {
        const tx2 = new Transaction();
        const lpCollateral = (MINT_AMOUNT * 70n) / 100n;
        const insuranceAmt = (MINT_AMOUNT * 20n) / 100n;
        tx2.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_DEPOSIT_COLLATERAL, [payer.publicKey, slabKp.publicKey, payerAta, vaultAta, WELL_KNOWN.tokenProgram, WELL_KNOWN.clock]), data: encodeDepositCollateral({ userIdx: 0, amount: lpCollateral.toString() }) }));
        tx2.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_TOPUP_INSURANCE, [payer.publicKey, slabKp.publicKey, payerAta, vaultAta, WELL_KNOWN.tokenProgram]), data: encodeTopUpInsurance({ amount: insuranceAmt.toString() }) }));
        const t = nowSecs();
        tx2.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [oracleKp.publicKey, slabKp.publicKey]), data: encodePushOraclePrice({ priceE6: INITIAL_PRICE_E6.toString(), timestamp: t.toString() }) }));
        tx2.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, slabKp.publicKey, WELL_KNOWN.clock, slabKp.publicKey]), data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }) }));
        await sendAndConfirm(rpcConnection, tx2, [payer, oracleKp], "Fund market");
      }

      // Step 6: Start simulation engine
      setStep("Starting simulation engine..."); setStepNum(6);
      const oracleSecret = Buffer.from(oracleKp.secretKey).toString("base64");
      const startRes = await fetch("/api/simulation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slabAddress: slabKp.publicKey.toBase58(), oracleSecret, startPriceE6: Number(INITIAL_PRICE_E6), intervalMs: 5000 / speed }),
      });
      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.details || err.error || "Failed to start");
      }

      setState({ running: true, slabAddress: slabKp.publicKey.toBase58(), price: Number(INITIAL_PRICE_E6), scenario: null, model: "random-walk", uptime: 0 });
      setPriceHistory([{ time: Date.now(), price: Number(INITIAL_PRICE_E6) / 1e6 }]);
      setPhase("running");
    } catch (err: unknown) {
      console.error("Build error:", err);
      setError(await extractError(err));
      setPhase("deposit");
      buildingRef.current = false;
    }
  };

  /* ─── Controls ─── */
  const handleStop = async () => {
    setLoading(true);
    try {
      await fetch("/api/simulation/stop", { method: "POST" });
      setState({ running: false, slabAddress: null, price: 1_000_000, scenario: null, model: "random-walk", uptime: 0 });
      setPhase("ended");
    } catch (err) { console.error("Stop error:", err); }
    finally { setLoading(false); }
  };

  const handleRestart = () => {
    setPhase("deposit");
    setSlabAddress(null);
    setMintAddress(null);
    setError(null);
    setStep("");
    setStepNum(0);
    setPriceHistory([]);
    buildingRef.current = false;
    fetchTokenPreview();
  };

  const handleScenarioSelect = async (scenario: string) => {
    try {
      await fetch("/api/simulation/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      setState(prev => ({ ...prev, scenario }));
    } catch (err) { console.error("Scenario error:", err); }
  };

  const handlePriceOverride = async (price: number) => {
    try {
      await fetch("/api/simulation/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceE6: price }),
      });
    } catch (err) { console.error("Price override error:", err); }
  };

  const formatUptime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(payer.publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ─── Mini price chart (SVG) ─── */
  const MiniChart = ({ data, width = 320, height = 80 }: { data: PricePoint[]; width?: number; height?: number }) => {
    if (data.length < 2) return null;
    const prices = data.map(d => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d.price - min) / range) * (height - 8) - 4;
      return `${x},${y}`;
    }).join(" ");
    const lastPrice = prices[prices.length - 1];
    const firstPrice = prices[0];
    const color = lastPrice >= firstPrice ? "var(--long)" : "var(--short)";
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
        <circle cx={(data.length - 1) / (data.length - 1) * width} cy={height - ((lastPrice - min) / range) * (height - 8) - 4} r="3" fill={color} />
      </svg>
    );
  };

  /* ─── Deposit Screen ─── */
  if (phase === "deposit") {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="border-b border-[var(--border)]/30 bg-[var(--bg)]/95 px-4 py-3">
          <div className="mx-auto max-w-lg">
            <p className="mb-0.5 text-[9px] font-medium uppercase tracking-[0.2em] text-[var(--accent)]/70">// SIMULATION</p>
            <h1 className="text-lg font-bold text-[var(--text)]" style={{ fontFamily: "var(--font-display)" }}>Self-Service Demo</h1>
            <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">Fund with devnet SOL -- market creation is fully automatic</p>
          </div>
        </div>

        <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
          {/* Token Preview */}
          {tokenPreview && (
            <div className="border border-[var(--accent)]/20 bg-[var(--accent)]/[0.03] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)] mb-1">Your Token</p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--accent)]">{tokenPreview.symbol}</p>
                  <p className="text-[14px] font-bold text-[var(--text)] mt-0.5">{tokenPreview.name}</p>
                  <p className="text-[10px] text-[var(--text-dim)] mt-0.5">{tokenPreview.description}</p>
                </div>
                <button onClick={fetchTokenPreview} className="border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:border-[var(--accent)]/30 hover:text-[var(--text)] transition-colors">Reroll</button>
              </div>
            </div>
          )}

          {/* Quick Send via Wallet */}
          <div className="border border-[var(--accent)]/30 bg-[var(--accent)]/[0.03] p-5 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)]">Quick Start</p>
            {!connected ? (
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-[var(--text-secondary)]">Connect wallet to send {MIN_SOL} devnet SOL in one click</p>
                <WalletMultiButton />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2" style={{ backgroundColor: "var(--long)" }} />
                  <span className="text-[11px] font-mono text-[var(--text)]">{publicKey?.toBase58().slice(0, 8)}...{publicKey?.toBase58().slice(-8)}</span>
                </div>
                <button
                  onClick={handleWalletSend}
                  disabled={sending}
                  className="w-full border border-[var(--accent)]/50 bg-[var(--accent)]/[0.08] py-3.5 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--accent)] transition-all hover:border-[var(--accent)] hover:bg-[var(--accent)]/[0.15] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? "Sending..." : `Send ${MIN_SOL} SOL & Launch`}
                </button>
                <p className="text-[9px] text-[var(--text-dim)] text-center">Make sure Phantom is set to devnet</p>
              </div>
            )}
          </div>

          {/* Manual Alternative */}
          <div className="border border-[var(--border)] bg-[var(--bg)]/80 p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)]">Or send manually</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)]/50 px-3 py-2 text-[10px] font-mono text-[var(--text)] break-all select-all">{payer.publicKey.toBase58()}</code>
              <button onClick={copyAddress} className="border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors whitespace-nowrap">
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2" style={{ backgroundColor: balance >= MIN_LAMPORTS ? "var(--long)" : "var(--text-dim)" }} />
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {balance > 0 ? `${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL received` : "Waiting for deposit..."}
                </span>
              </div>
              {balance > 0 && balance < MIN_LAMPORTS && (
                <span className="text-[9px] text-[var(--short)]">Need {((MIN_LAMPORTS - balance) / LAMPORTS_PER_SOL).toFixed(4)} more</span>
              )}
            </div>
            <p className="text-[9px] text-[var(--text-dim)]">Need devnet SOL? <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">faucet.solana.com</a></p>
          </div>

          {/* Error */}
          {error && (
            <div className="border border-[var(--short)]/30 bg-[var(--short)]/[0.04] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--short)] mb-1">Error</p>
              <p className="text-[10px] text-[var(--short)] break-all">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─── Building Screen ─── */
  if (phase === "building") {
    const steps = ["Create market", "Oracle & config", "LP & vAMM", "Finalize oracle", "Fund market", "Start engine"];
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="max-w-md w-full px-4">
          <div className="border border-[var(--accent)]/30 bg-[var(--accent)]/[0.02] p-6 space-y-5">
            <div>
              <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-[var(--accent)]/70 mb-1">// BUILDING</p>
              <p className="text-[14px] font-bold text-[var(--text)]">{tokenPreview?.symbol || "SIM"} Market</p>
              <p className="text-[10px] text-[var(--text-secondary)]">{tokenPreview?.name}</p>
            </div>

            {/* Step progress */}
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={s} className="flex items-center gap-3">
                  <div className="h-5 w-5 flex items-center justify-center text-[8px] font-bold" style={{
                    backgroundColor: i + 1 < stepNum ? "var(--long)" : i + 1 === stepNum ? "var(--accent)" : "transparent",
                    color: i + 1 <= stepNum ? "var(--bg)" : "var(--text-dim)",
                    border: i + 1 <= stepNum ? "none" : "1px solid var(--text-dim)",
                  }}>
                    {i + 1 < stepNum ? "\u2713" : i + 1}
                  </div>
                  <span className="text-[11px]" style={{
                    color: i + 1 < stepNum ? "var(--long)" : i + 1 === stepNum ? "var(--text)" : "var(--text-dim)",
                  }}>{s}</span>
                  {i + 1 === stepNum && <div className="h-3 w-3 animate-spin border border-[var(--border)] border-t-[var(--accent)]" />}
                </div>
              ))}
            </div>

            <div className="h-1 bg-[var(--border)]">
              <div className="h-1 bg-[var(--accent)] transition-all" style={{ width: `${(stepNum / 6) * 100}%` }} />
            </div>
            <p className="text-[9px] text-[var(--text-dim)]">{step}</p>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Ended Screen ─── */
  if (phase === "ended") {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="max-w-md w-full px-4">
          <div className="border border-[var(--border)] bg-[var(--bg)]/80 p-5 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)]">Simulation Complete</p>
            {tokenPreview && <p className="text-[14px] font-bold text-[var(--text)]">{tokenPreview.symbol} -- {tokenPreview.name}</p>}
            {slabAddress && <p className="text-[10px] font-mono text-[var(--text-secondary)]">Market: {slabAddress.slice(0, 12)}...{slabAddress.slice(-12)}</p>}
            {priceHistory.length > 1 && (
              <div>
                <p className="text-[9px] text-[var(--text-dim)] mb-1">Price History</p>
                <MiniChart data={priceHistory} height={60} />
              </div>
            )}
            <button onClick={handleRestart} className="w-full border border-[var(--accent)]/50 bg-[var(--accent)]/[0.08] py-3 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--accent)] hover:bg-[var(--accent)]/[0.15] transition-all">Launch New Simulation</button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Running Dashboard ─── */
  const currentPrice = state.price / 1e6;
  const priceChange = priceHistory.length > 1 ? ((currentPrice - priceHistory[0].price) / priceHistory[0].price) * 100 : 0;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <div className="border-b border-[var(--border)]/30 bg-[var(--bg)]/95 px-4 py-3">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-0.5 text-[9px] font-medium uppercase tracking-[0.2em] text-[var(--accent)]/70">// SIMULATION</p>
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-bold text-[var(--text)]" style={{ fontFamily: "var(--font-display)" }}>{tokenPreview?.symbol || "SIM"}/USD</h1>
                <span className="text-[20px] font-bold font-mono text-[var(--text)]">${currentPrice.toFixed(4)}</span>
                <span className="text-[11px] font-mono" style={{ color: priceChange >= 0 ? "var(--long)" : "var(--short)" }}>
                  {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="border border-[var(--border)]/50 bg-[var(--bg-elevated)] px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse" style={{ backgroundColor: state.running ? "var(--long)" : "var(--short)" }} />
                  <div className="text-right">
                    <p className="text-[8px] uppercase tracking-[0.15em] text-[var(--text-dim)]">{state.running ? "Live" : "Stopped"}</p>
                    {state.running && state.uptime > 0 && <p className="text-[9px] font-mono text-[var(--text)]">{formatUptime(state.uptime)}</p>}
                  </div>
                </div>
              </div>
              <button onClick={handleStop} disabled={loading} className="border border-[var(--short)]/50 bg-[var(--short)]/[0.08] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--short)] hover:bg-[var(--short)]/[0.15] transition-all disabled:opacity-50">{loading ? "Ending..." : "End Simulation"}</button>
            </div>
          </div>
        </div>
      </div>

      {/* Price Chart */}
      <div className="mx-auto max-w-7xl px-3 pt-3">
        <div className="border border-[var(--border)]/30 bg-[var(--bg)]/80 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)]">Oracle Price</p>
            <p className="text-[9px] text-[var(--text-dim)]">{priceHistory.length} data points</p>
          </div>
          {priceHistory.length > 1 ? (
            <MiniChart data={priceHistory} width={800} height={120} />
          ) : (
            <div className="h-[120px] flex items-center justify-center text-[10px] text-[var(--text-dim)]">Collecting price data...</div>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="mx-auto max-w-7xl px-3 py-3">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-3">
          {/* Left Sidebar */}
          <div className="space-y-3">
            {/* Market Info */}
            <div className="border border-[var(--border)]/50 bg-[var(--bg)]/80 p-3 space-y-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)]">Market Info</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[8px] uppercase tracking-[0.15em] text-[var(--text-dim)]">Token</p>
                  <p className="text-[12px] font-bold text-[var(--accent)]">{tokenPreview?.symbol}</p>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-[0.15em] text-[var(--text-dim)]">Model</p>
                  <p className="text-[12px] font-bold text-[var(--text)]">{state.model}</p>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-[0.15em] text-[var(--text-dim)]">Scenario</p>
                  <p className="text-[12px] font-bold text-[var(--text)]">{state.scenario || "none"}</p>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-[0.15em] text-[var(--text-dim)]">Speed</p>
                  <p className="text-[12px] font-bold text-[var(--text)]">{speed}x</p>
                </div>
              </div>
              {mintAddress && <p className="text-[8px] font-mono text-[var(--text-dim)] truncate">Mint: {mintAddress}</p>}
              {slabAddress && <p className="text-[8px] font-mono text-[var(--text-dim)] truncate">Slab: {slabAddress}</p>}
            </div>

            <SimulationControls isRunning={state.running} currentSlab={state.slabAddress || slabAddress} speed={speed} onStart={async () => {}} onStop={handleStop} onSpeedChange={(s: number) => setSpeed(s)} onPriceOverride={handlePriceOverride} />

            <div className="border border-[var(--border)]/50 bg-[var(--bg)]/80 p-3">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)] mb-3">Scenarios</h3>
              <ScenarioSelector activeScenario={state.scenario} onScenarioSelect={handleScenarioSelect} disabled={loading} />
            </div>
          </div>

          {/* Right Content */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <SimulationMetrics isSimulationRunning={state.running} />
              <LiveEventFeed isSimulationRunning={state.running} />
            </div>
            <BotLeaderboard isSimulationRunning={state.running} />
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-[var(--border)]/30 bg-[var(--bg)]/95 backdrop-blur-sm px-4 py-2">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <p className="text-[9px] uppercase tracking-[0.15em] text-[var(--text-dim)]">
            {state.running ? `${tokenPreview?.symbol}/USD | ${state.model} | ${state.scenario || "no scenario"} | ${speed}x` : "Simulation paused"}
          </p>
          {(state.slabAddress || slabAddress) && (
            <p className="text-[9px] font-mono text-[var(--text-secondary)]">{(state.slabAddress || slabAddress || "").slice(0, 8)}...{(state.slabAddress || slabAddress || "").slice(-8)}</p>
          )}
        </div>
      </div>
    </div>
  );
}
