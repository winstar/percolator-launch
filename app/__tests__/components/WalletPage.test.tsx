import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let privyAvailable = true;
let privyState = {
  ready: true,
  authenticated: true,
  user: {
    linkedAccounts: [
      {
        type: "wallet",
        walletClientType: "privy",
        chainType: "solana",
        address: "Embedded1111",
      },
    ],
  },
  logout: vi.fn(),
  login: vi.fn(),
  connectWallet: vi.fn(),
  exportWallet: vi.fn(),
};

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/usePrivySafe", () => ({
  usePrivyAvailable: () => privyAvailable,
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => privyState,
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  useWallets: () => ({
    wallets: [{ address: "Wallet1111", standardWallet: { name: "Phantom" } }],
  }),
  useFundWallet: () => ({ fundWallet: vi.fn() }),
}));

vi.mock("@/components/ui/ScrollReveal", () => ({
  ScrollReveal: ({ children }: any) => <div>{children}</div>,
}));

import WalletPage from "../../app/wallet/page";

describe("WalletPage", () => {
  beforeEach(() => {
    privyAvailable = true;
    privyState = {
      ...privyState,
      ready: true,
      authenticated: true,
    };
  });

  it("shows wallet actions when authenticated", () => {
    render(<WalletPage />);
    expect(screen.getAllByRole("button", { name: /Add funds/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Export key/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Disconnect/i })).toBeTruthy();
  });

  it("shows connect prompt when unauthenticated", () => {
    privyState = { ...privyState, authenticated: false };
    render(<WalletPage />);
    expect(screen.getByText(/Connect your wallet/i)).toBeTruthy();
  });

  it("shows read-only warning when Privy is unavailable", () => {
    privyAvailable = false;
    render(<WalletPage />);
    expect(screen.getByText(/Wallet features unavailable/i)).toBeTruthy();
  });
});
