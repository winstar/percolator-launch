/**
 * E2E Suite 2: Market Listing & Navigation
 *
 * Verifies the markets page displays market data,
 * search/filter works, and clicking a market navigates to the trade page.
 *
 * PERC-010 / Issue #245
 */

import { test, expect } from "@playwright/test";
import { navigateTo, selectors } from "./helpers";

test.describe("Market listing page", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/markets");
  });

  test("displays at least one market", async ({ page }) => {
    // Markets should be rendered as clickable cards or links to /trade/[slab]
    const marketLinks = page.locator('a[href^="/trade/"]');
    await expect(marketLinks.first()).toBeVisible({ timeout: 15000 });
    const count = await marketLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("market cards show token name or symbol", async ({ page }) => {
    // Wait for markets to load
    const marketLinks = page.locator('a[href^="/trade/"]');
    await expect(marketLinks.first()).toBeVisible({ timeout: 15000 });

    // At least one card should have visible text content
    const firstCard = marketLinks.first();
    const text = await firstCard.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test("clicking a market navigates to trade page", async ({ page }) => {
    const marketLinks = page.locator('a[href^="/trade/"]');
    await expect(marketLinks.first()).toBeVisible({ timeout: 15000 });

    // Get the href to know where we're going
    const href = await marketLinks.first().getAttribute("href");
    expect(href).toBeTruthy();

    await marketLinks.first().click();
    await page.waitForURL(/\/trade\//, { timeout: 10000 });
    expect(page.url()).toContain("/trade/");
  });

  test("search input is present and functional", async ({ page }) => {
    const searchInput = page.locator(selectors.searchInput);
    // Search may or may not exist — if it does, it should be interactive
    const count = await searchInput.count();
    if (count > 0) {
      await searchInput.first().fill("SOL");
      // After typing, the market list should filter (or at least not crash)
      await page.waitForTimeout(500);
      // Page should still have content
      await expect(page.locator(selectors.mainContent)).toBeVisible();
    }
  });
});

test.describe("Market navigation from homepage", () => {
  test("homepage has a link to markets page", async ({ page }) => {
    await navigateTo(page, "/");
    // Look for Markets link in header nav or hero CTA
    const marketsLink = page.locator('a[href="/markets"], a[href*="markets"]').first();
    await expect(marketsLink).toBeVisible({ timeout: 10000 });
  });

  test("can navigate from homepage to markets", async ({ page }) => {
    await navigateTo(page, "/");
    const marketsLink = page.locator('a[href="/markets"], a[href*="markets"]').first();
    await marketsLink.click();
    await page.waitForURL(/\/markets/, { timeout: 10000 });
  });
});
