"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

interface HeroDataChipProps {
  icon: string;
  text: string;
  delay?: number;
  /** CSS class for absolute positioning */
  className?: string;
  /** Opposite float phase offset in seconds */
  floatPhase?: number;
}

export function HeroDataChip({
  icon,
  text,
  delay = 1.0,
  className = "",
  floatPhase = 0,
}: HeroDataChipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReduced = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReduced || !ref.current) return;
    gsap.fromTo(
      ref.current,
      { opacity: 0, scale: 0.9 },
      { opacity: 1, scale: 1, duration: 0.5, delay, ease: "power2.out" }
    );
  }, [delay, prefersReduced]);

  return (
    <div
      ref={ref}
      className={`hidden md:flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs text-white/60 backdrop-blur-sm ${prefersReduced ? '' : 'gsap-fade'} ${className}`}
      style={{
        animation: prefersReduced
          ? undefined
          : `chip-float 3.5s ease-in-out ${floatPhase}s infinite`,
      }}
    >
      <span>{icon}</span>
      <span className="whitespace-nowrap font-medium">{text}</span>
    </div>
  );
}
