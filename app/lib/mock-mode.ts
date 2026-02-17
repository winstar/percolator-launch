/**
 * Mock mode utilities for dev-only UI testing.
 * Mock mode is active when:
 *   NEXT_PUBLIC_MOCK_MODE === "true" (explicit opt-in)
 *
 * Previously: NODE_ENV === "development" was sufficient, which caused accidental
 * mock data leaks when testing real markets in dev. Now requires explicit flag.
 */

export function isMockMode(): boolean {
  // Explicit opt-in only — no defaults
  const flag = process.env.NEXT_PUBLIC_MOCK_MODE;
  return flag === "true" || flag === "1";
}
