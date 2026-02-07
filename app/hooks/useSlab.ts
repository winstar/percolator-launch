"use client";

export { useSlabState } from "@/components/providers/SlabProvider";

import { useSlabState } from "@/components/providers/SlabProvider";

export function useSlabRaw() {
  const { raw, loading, error } = useSlabState();
  return { raw, loading, error };
}
