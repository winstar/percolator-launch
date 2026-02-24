import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("@/lib/config", () => ({
  getConfig: () => ({
    network: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    programId: "FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD",
    matcherProgramId: "4HcGCsyjAqnFua5ccuXyt8KRRQzKFbGTJkVChpS7Yfzy",
    crankWallet: "2JaSzRYrf44fPpQBtRJfnCEgThwCmvpFd3FCXi45VXxm",
    explorerUrl: "https://explorer.solana.com",
    slabSize: 992560,
    matcherCtxSize: 320,
    priorityFee: 50000,
  }),
  getRpcEndpoint: () => "https://api.devnet.solana.com",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/hooks/usePrivySafe", () => ({ usePrivyAvailable: () => true }));

const mockLogout = vi.fn();
const mockLogin = vi.fn();
const mockExportWallet = vi.fn();
const mockConnectWallet = vi.fn();

const originalUserAgent = navigator.userAgent;

let privyState = {
  ready: true,
  authenticated: true,
  user: { linkedAccounts: [] },
  logout: mockLogout,
  login: mockLogin,
  connectWallet: mockConnectWallet,
  exportWallet: mockExportWallet,
};

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => privyState,
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  useWallets: () => ({ wallets: [{ address: "1111", standardWallet: { name: "Phantom" } }] }),
  useFundWallet: () => ({ fundWallet: vi.fn() }),
}));

import { ConnectButton } from "@/components/wallet/ConnectButton";

describe("ConnectButton", () => {
  beforeEach(() => {
    mockLogin.mockClear();
    mockConnectWallet.mockClear();
    mockSearchParams = new URLSearchParams();
    Object.defineProperty(window.navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
    });
    privyState = {
      ready: true,
      authenticated: true,
      user: { linkedAccounts: [] },
      logout: mockLogout,
      login: mockLogin,
      connectWallet: mockConnectWallet,
      exportWallet: mockExportWallet,
    };
  });

  it("shows manage actions when authenticated", () => {
    const { getByRole, getByText } = render(<ConnectButton />);
    fireEvent.click(getByRole("button", { name: /wallet:/i }));
    expect(getByText("Manage Wallet")).toBeTruthy();
    expect(getByText("Disconnect")).toBeTruthy();
  });

  it("uses Privy login for unauthenticated users", () => {
    privyState = { ...privyState, authenticated: false };
    const { getByRole } = render(<ConnectButton />);
    fireEvent.click(getByRole("button", { name: /connect/i }));
    expect(mockLogin).toHaveBeenCalledWith({
      loginMethods: ["wallet", "email"],
      walletChainType: "solana-only",
    });
  });

  it("uses WalletConnect fallback on mobile when no injected wallet", () => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      configurable: true,
    });
    privyState = { ...privyState, authenticated: false };
    const { getByRole } = render(<ConnectButton />);
    fireEvent.click(getByRole("button", { name: /connect with walletconnect/i }));
    expect(mockConnectWallet).toHaveBeenCalledWith({
      walletList: ["wallet_connect"],
      walletChainType: "solana-only",
    });
  });

  it("offers email login fallback on mobile when no injected wallet", () => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      configurable: true,
    });
    privyState = { ...privyState, authenticated: false };
    const { getByRole } = render(<ConnectButton />);
    fireEvent.click(getByRole("button", { name: /use email instead/i }));
    expect(mockLogin).toHaveBeenCalledWith({
      loginMethods: ["email"],
      walletChainType: "solana-only",
    });
  });

  it("shows a Solflare deep-link in debug mode when unauthenticated", () => {
    privyState = { ...privyState, authenticated: false };
    mockSearchParams = new URLSearchParams("walletDebug=1");
    const { getByRole } = render(<ConnectButton />);
    const link = getByRole("link", { name: /Open in Solflare/i });
    expect(link.getAttribute("href")).toContain("solflare.com/ul/v1/browse/");
  });
});
