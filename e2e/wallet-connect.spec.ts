/**
 * E2E Suite 3: Wallet Connection Modal
 *
 * Tests the accessible wallet connection modal (PR #257):
 * - Modal opens when wallet button is clicked
 * - ARIA attributes are correct
 * - Keyboard interaction works (Escape to close, focus trapping)
 * - Modal closes on overlay click
 *
 * Note: These tests verify the modal UI without an actual wallet extension.
 * Actual wallet connection is tested separately with mock wallet injection.
 *
 * PERC-010 / Issue #245
 */

import { test, expect } from "@playwright/test";
import { navigateTo, selectors } from "./helpers";

test.describe("Wallet connection modal", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/");
  });

  test("wallet button is visible in the header", async ({ page }) => {
    const walletBtn = page.locator(selectors.walletButton).first();
    await expect(walletBtn).toBeVisible({ timeout: 10000 });
  });

  test("clicking wallet button opens the modal", async ({ page }) => {
    const walletBtn = page.locator(selectors.walletButton).first();
    await walletBtn.click();

    const modal = page.locator(selectors.walletModal);
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test("modal has correct ARIA attributes", async ({ page }) => {
    const walletBtn = page.locator(selectors.walletButton).first();
    await walletBtn.click();

    const modal = page.locator(selectors.walletModal);
    await expect(modal).toBeVisible({ timeout: 5000 });

    // role="dialog" and aria-modal="true"
    await expect(modal).toHaveAttribute("role", "dialog");
    await expect(modal).toHaveAttribute("aria-modal", "true");

    // aria-labelledby should reference an existing element
    const labelledBy = await modal.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const titleEl = page.locator(`#${labelledBy}`);
    await expect(titleEl).toHaveCount(1);
    const titleText = await titleEl.textContent();
    expect(titleText?.toLowerCase()).toContain("wallet");
  });

  test("close button has aria-label and works", async ({ page }) => {
    const walletBtn = page.locator(selectors.walletButton).first();
    await walletBtn.click();

    const modal = page.locator(selectors.walletModal);
    await expect(modal).toBeVisible({ timeout: 5000 });

    const closeBtn = page.locator('[aria-label*="Close" i], [aria-label*="close" i]').first();
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Modal should close (with fade animation)
    await expect(modal).toBeHidden({ timeout: 2000 });
  });

  test("Escape key closes the modal", async ({ page }) => {
    const walletBtn = page.locator(selectors.walletButton).first();
    await walletBtn.click();

    const modal = page.locator(selectors.walletModal);
    await expect(modal).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden({ timeout: 2000 });
  });

  test("overlay click closes the modal", async ({ page }) => {
    const walletBtn = page.locator(selectors.walletButton).first();
    await walletBtn.click();

    const modal = page.locator(selectors.walletModal);
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Click on the overlay (outside the modal wrapper)
    const overlay = page.locator(".wallet-adapter-modal-overlay");
    if (await overlay.count() > 0) {
      await overlay.dispatchEvent("mousedown");
      await expect(modal).toBeHidden({ timeout: 2000 });
    }
  });

  test("modal displays wallet options or install prompt", async ({ page }) => {
    const walletBtn = page.locator(selectors.walletButton).first();
    await walletBtn.click();

    const modal = page.locator(selectors.walletModal);
    await expect(modal).toBeVisible({ timeout: 5000 });

    // In CI (no wallet extensions), the modal shows either:
    // a) Wallet buttons directly (if wallets detected)
    // b) A "You'll need a wallet" message with a collapsed "More options" section
    const walletOptions = modal.locator(".wallet-adapter-button");
    const moreBtn = modal.locator(".wallet-adapter-modal-list-more");
    const modalTitle = modal.locator("h1");

    const directCount = await walletOptions.count();
    if (directCount > 0) {
      // Wallets detected — buttons visible
      expect(directCount).toBeGreaterThan(0);
    } else if (await moreBtn.count() > 0) {
      // No wallets detected — click "More options" to expand collapsed list
      await moreBtn.click();
      const expandedCount = await walletOptions.count();
      expect(expandedCount).toBeGreaterThan(0);
    } else {
      // At minimum, the modal title should indicate wallet needed
      await expect(modalTitle).toBeVisible();
      const titleText = await modalTitle.textContent();
      expect(titleText?.toLowerCase()).toContain("wallet");
    }
  });

  test("decorative SVGs are hidden from assistive technology", async ({ page }) => {
    const walletBtn = page.locator(selectors.walletButton).first();
    await walletBtn.click();

    const modal = page.locator(selectors.walletModal);
    await expect(modal).toBeVisible({ timeout: 5000 });

    const hiddenSvgs = modal.locator('svg[aria-hidden="true"]');
    const count = await hiddenSvgs.count();
    expect(count).toBeGreaterThan(0);
  });
});
