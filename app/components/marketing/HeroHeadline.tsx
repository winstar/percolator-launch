"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

export function HeroHeadline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReduced = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReduced || !containerRef.current) return;
    const lines = containerRef.current.querySelectorAll(".hero-line");
    gsap.fromTo(
      lines,
      { opacity: 0, y: 24 },
      {
        opacity: 1,
        y: 0,
        duration: 0.5,
        stagger: 0.12,
        delay: 0.1,
        ease: "power3.out",
      }
    );
  }, [prefersReduced]);

  return (
    <div ref={containerRef}>
      <h1
        className="text-[36px] font-bold leading-[1.0] tracking-[-0.03em] sm:text-[44px] md:text-[56px] lg:text-[72px]"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        <span
          className="hero-line block text-white"
          style={{ opacity: prefersReduced ? 1 : 0 }}
        >
          Any Token.
        </span>
        <span
          className="hero-line block text-white"
          style={{ opacity: prefersReduced ? 1 : 0 }}
        >
          Any Market.
        </span>
        <span
          className="hero-line block bg-gradient-to-r from-purple-400 via-violet-300 to-cyan-400 bg-clip-text text-transparent"
          style={{ opacity: prefersReduced ? 1 : 0 }}
        >
          Permissionless.
        </span>
      </h1>
    </div>
  );
}
