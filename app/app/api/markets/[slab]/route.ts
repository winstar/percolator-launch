import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// GET /api/markets/[slab] — get single market with stats
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slab: string }> }
) {
  const { slab } = await params;
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("markets_with_stats")
    .select("*")
    .eq("slab_address", slab)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }

  return NextResponse.json({ market: data });
}
