import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ children, config }: any) => (
    <div data-walletlist={JSON.stringify(config.appearance.walletList)}>
      {children}
    </div>
  ),
  usePrivy: () => ({ login: vi.fn() }),
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  toSolanaWalletConnectors: () => [],
  useWallets: () => ({ wallets: [] }),
}));

import PrivyProviderClient from "@/components/providers/PrivyProviderClient";

describe("PrivyProviderClient", () => {
  it("passes ordered walletList into PrivyProvider", () => {
    const { container } = render(
      <PrivyProviderClient appId="test">child</PrivyProviderClient>
    );

    const attr = container.querySelector("div")?.getAttribute("data-walletlist");
    expect(attr).toContain("detected_solana_wallets");
  });
});
