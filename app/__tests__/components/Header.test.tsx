import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/markets",
}));

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="connect-button" />,
}));

vi.mock("gsap", () => ({
  default: {
    fromTo: vi.fn(),
    to: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

vi.mock("@/lib/config", () => ({
  getConfig: () => ({ network: "devnet" }),
  setNetwork: vi.fn(),
}));

import { Header } from "@/components/layout/Header";

describe("Header", () => {
  it("includes a Wallet link", () => {
    render(<Header />);
    const walletLink = screen.getByRole("link", { name: /Wallet/i });
    expect(walletLink).toHaveAttribute("href", "/wallet");
  });
});
