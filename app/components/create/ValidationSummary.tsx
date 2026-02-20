"use client";

import { FC } from "react";

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface ValidationSummaryProps {
  errors: ValidationError[];
  className?: string;
}

/**
 * Collects and displays all form validation errors/warnings in one place.
 * Shows before the submit button so users can see everything that needs fixing.
 */
export const ValidationSummary: FC<ValidationSummaryProps> = ({ errors, className = "" }) => {
  const criticalErrors = errors.filter((e) => e.severity === "error");
  const warnings = errors.filter((e) => e.severity === "warning");

  if (errors.length === 0) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {criticalErrors.length > 0 && (
        <div className="border border-[var(--short)]/20 bg-[var(--short)]/[0.04] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-4 w-4 items-center justify-center border border-[var(--short)]/30 text-[8px] text-[var(--short)]">✕</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--short)]">
              {criticalErrors.length} {criticalErrors.length === 1 ? "Error" : "Errors"}
            </span>
          </div>
          <ul className="space-y-1.5">
            {criticalErrors.map((err, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px]">
                <span className="mt-0.5 text-[var(--short)]/60">•</span>
                <div>
                  <span className="font-medium text-[var(--short)]">{err.field}:</span>{" "}
                  <span className="text-[var(--text-secondary)]">{err.message}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="border border-[var(--warning)]/20 bg-[var(--warning)]/[0.04] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-4 w-4 items-center justify-center border border-[var(--warning)]/30 text-[8px] text-[var(--warning)]">!</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--warning)]">
              {warnings.length} {warnings.length === 1 ? "Warning" : "Warnings"}
            </span>
          </div>
          <ul className="space-y-1.5">
            {warnings.map((warn, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px]">
                <span className="mt-0.5 text-[var(--warning)]/60">•</span>
                <div>
                  <span className="font-medium text-[var(--warning)]">{warn.field}:</span>{" "}
                  <span className="text-[var(--text-secondary)]">{warn.message}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
