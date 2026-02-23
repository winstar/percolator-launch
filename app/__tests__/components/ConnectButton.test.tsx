import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/usePrivySafe", () => ({ usePrivyAvailable: () => true }));

const mockLogout = vi.fn();
const mockLogin = vi.fn();
const mockConnectWallet = vi.fn();
const mockExportWallet = vi.fn();

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
    mockConnectWallet.mockClear();
    mockLogin.mockClear();
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

  it("offers email login and preselects installed wallet", () => {
    privyState = { ...privyState, authenticated: false };
    const { getByRole } = render(<ConnectButton />);
    fireEvent.click(getByRole("button", { name: /connect wallet/i }));
    expect(mockLogin).toHaveBeenCalledWith({
      loginMethods: ["wallet", "email"],
      walletChainType: "solana-only",
    });
  });
});
