import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

import { WalletDebugPanel } from "@/components/wallet/WalletDebugPanel";

describe("WalletDebugPanel", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
  });

  it("renders nothing when debug flag is absent", () => {
    render(<WalletDebugPanel />);
    expect(screen.queryByText(/Wallet Debug/i)).toBeNull();
  });

  it("shows debug tools when walletDebug is enabled", () => {
    mockSearchParams = new URLSearchParams("walletDebug=1");
    render(<WalletDebugPanel />);
    expect(screen.getByText(/Wallet Debug/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Open in Solflare/i });
    expect(link.getAttribute("href")).toContain("solflare.com/ul/v1/browse/");
  });
});
