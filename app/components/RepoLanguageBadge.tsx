"use client";

import { FC } from "react";
import { LANGUAGE_COLORS, DEFAULT_LANGUAGE_COLOR } from "@/lib/github";

interface Props {
  language: string | null;
}

export const RepoLanguageBadge: FC<Props> = ({ language }) => {
  if (!language) return null;

  const color = LANGUAGE_COLORS[language] ?? DEFAULT_LANGUAGE_COLOR;

  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
        {language}
      </span>
    </span>
  );
};
