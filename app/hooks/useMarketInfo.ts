import { useEffect, useState } from "react";
import { supabase, type MarketWithStats } from "@/lib/supabase";

export function useMarketInfo(slabAddress: string) {
  const [market, setMarket] = useState<MarketWithStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("markets_with_stats")
        .select("*")
        .eq("slab_address", slabAddress)
        .single();
      setMarket(data);
      setLoading(false);
    }
    load();

    // Subscribe to stat updates
    const channel = supabase
      .channel(`market-${slabAddress}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "market_stats",
        filter: `slab_address=eq.${slabAddress}`,
      }, (payload) => {
        setMarket((prev) => prev ? { ...prev, ...payload.new } : prev);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [slabAddress]);

  return { market, loading };
}
