/**
 * GitHub API helpers for the /developers page.
 * Fetches public repo metadata with Next.js ISR (5-min revalidation).
 */

export interface RepoData {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  updated_at: string;
  html_url: string;
}

/** Hardcoded repo list — order determines fallback display order */
export const REPOS = [
  "percolator-launch",
  "percolator",
  "percolator-prog",
  "percolator-matcher",
  "percolator-stake",
  "percolator-sdk",
  "percolator-ops",
  "percolator-mobile",
] as const;

/** Fallback descriptions when GitHub API fails */
export const REPO_DESCRIPTIONS: Record<string, string> = {
  "percolator-launch":
    "Permissionless perpetual futures launcher — deploy a perp market for any Solana token",
  percolator: "Core on-chain program",
  "percolator-prog": "Percolator programs",
  "percolator-matcher":
    "Prediction market matcher program (Solana on-chain)",
  "percolator-stake":
    "Insurance LP staking — PDA admin architecture, Kani formal verification",
  "percolator-sdk":
    "TypeScript SDK for interacting with Percolator on-chain programs",
  "percolator-ops": "AI-powered ops dashboard",
  "percolator-mobile": "Solana Seeker mobile app",
};

/** Fallback languages */
export const REPO_LANGUAGES: Record<string, string> = {
  "percolator-launch": "TypeScript",
  percolator: "Rust",
  "percolator-prog": "Rust",
  "percolator-matcher": "Rust",
  "percolator-stake": "Rust",
  "percolator-sdk": "TypeScript",
  "percolator-ops": "TypeScript",
  "percolator-mobile": "TypeScript",
};

/** Language colour dots (GitHub standard) */
export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  Rust: "#ce412b",
  JavaScript: "#f1e05a",
};

export const DEFAULT_LANGUAGE_COLOR = "rgba(255,255,255,0.25)";

/** Fetch a single repo's metadata from GitHub */
async function fetchRepo(repo: string): Promise<RepoData | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/dcccrypto/${repo}`,
      { next: { revalidate: 300 } } // ISR: 5-min cache
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Fetch all repos, returning live data merged with fallbacks */
export async function getAllRepos(): Promise<RepoData[]> {
  const results = await Promise.allSettled(REPOS.map(fetchRepo));

  return REPOS.map((name, i) => {
    const result = results[i];
    const live =
      result.status === "fulfilled" ? result.value : null;

    if (live) {
      // Merge fallback description when GitHub returns null (e.g. forks)
      return {
        ...live,
        description: live.description || REPO_DESCRIPTIONS[name] || null,
      };
    }

    // Fallback: return static data with a fixed date (avoid misleading "Updated 0m ago")
    return {
      name,
      description: REPO_DESCRIPTIONS[name] ?? null,
      language: REPO_LANGUAGES[name] ?? null,
      stargazers_count: 0,
      forks_count: 0,
      open_issues_count: 0,
      updated_at: "", // empty signals "no live data available"
      html_url: `https://github.com/dcccrypto/${name}`,
    };
  });
}

/** Format "Updated X ago" from ISO date string */
export function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
