/**
 * Mock mode utilities for dev-only UI testing.
 * Mock mode is active when:
 *   1. NODE_ENV === "development"
 *   2. NEXT_PUBLIC_MOCK_DATA === "true" (or not explicitly set — defaults to on in dev)
 *
 * This never activates in production builds.
 */

export function isMockMode(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  // Default to true in dev unless explicitly disabled
  const flag = process.env.NEXT_PUBLIC_MOCK_DATA;
  if (flag === "false" || flag === "0") return false;
  return true;
}
