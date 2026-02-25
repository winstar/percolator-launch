import type { Metadata } from "next";
import { getAllRepos } from "@/lib/github";
import { DevelopersClient } from "./DevelopersClient";

export const metadata: Metadata = {
  title: "Developers — Percolator",
  description:
    "Open-source repos powering Percolator permissionless perpetuals on Solana. Browse, fork, and contribute.",
  openGraph: {
    title: "Developers — Percolator",
    description:
      "Open-source repos powering Percolator permissionless perpetuals on Solana.",
    type: "website",
  },
};

export default async function DevelopersPage() {
  const repos = await getAllRepos();
  // Check if any repo has live stats (stars > 0 means we got real data)
  const isLive = repos.some((r) => r.stargazers_count > 0 || r.forks_count > 0);

  return <DevelopersClient repos={repos} isLive={isLive} />;
}
