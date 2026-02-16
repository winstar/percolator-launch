import { ShimmerSkeleton } from "@/components/ui/ShimmerSkeleton";

export default function TradingPageLoading() {
  return (
    <div className="min-h-[calc(100vh-48px)]">
      {/* Mobile: Sticky header skeleton */}
      <div className="sticky top-0 z-30 border-b border-[var(--border)]/50 bg-[var(--bg)]/95 px-3 py-2 backdrop-blur-sm lg:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShimmerSkeleton className="h-8 w-8 rounded-full" />
            <ShimmerSkeleton className="h-5 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <ShimmerSkeleton className="h-6 w-20" />
            <ShimmerSkeleton className="h-6 w-16" />
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <ShimmerSkeleton className="h-4 w-24" />
          <ShimmerSkeleton className="h-4 w-8" />
        </div>
      </div>

      {/* Desktop: Header skeleton */}
      <div className="hidden lg:flex items-start justify-between px-4 py-2 gap-3 border-b border-[var(--border)]/30">
        <div className="min-w-0">
          <ShimmerSkeleton className="h-3 w-16 mb-2" />
          <div className="flex items-center gap-2.5">
            <ShimmerSkeleton className="h-12 w-12 rounded-full" />
            <ShimmerSkeleton className="h-7 w-40" />
          </div>
          <div className="mt-1 flex items-center gap-3">
            <ShimmerSkeleton className="h-4 w-28" />
            <ShimmerSkeleton className="h-5 w-16" />
            <ShimmerSkeleton className="h-4 w-12" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ShimmerSkeleton className="h-6 w-20" />
          <ShimmerSkeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Mobile layout skeleton */}
      <div className="flex flex-col gap-1.5 px-2 pt-2 pb-4 lg:hidden">
        {/* Chart */}
        <ShimmerSkeleton className="h-[400px] w-full" />
        {/* Trade form */}
        <ShimmerSkeleton className="h-[300px] w-full" />
        {/* Position */}
        <ShimmerSkeleton className="h-[200px] w-full" />
        {/* Tabs */}
        <div className="border border-[var(--border)]">
          <div className="flex border-b border-[var(--border)]/50">
            {[1, 2, 3, 4].map((i) => (
              <ShimmerSkeleton key={i} className="h-8 flex-1 rounded-none" />
            ))}
          </div>
          <ShimmerSkeleton className="h-[250px] w-full rounded-none" />
        </div>
      </div>

      {/* Desktop layout skeleton */}
      <div className="hidden lg:grid grid-cols-[1fr_340px] gap-1.5 px-3 pb-3 pt-1.5">
        {/* Left column */}
        <div className="min-w-0 space-y-1.5">
          {/* Chart */}
          <ShimmerSkeleton className="h-[500px] w-full" />
          {/* Tabs */}
          <div className="border border-[var(--border)]">
            <div className="flex border-b border-[var(--border)]/50">
              {[1, 2, 3].map((i) => (
                <ShimmerSkeleton key={i} className="h-10 flex-1 rounded-none" />
              ))}
            </div>
            <ShimmerSkeleton className="h-[200px] w-full rounded-none" />
          </div>
        </div>

        {/* Right column */}
        <div className="min-w-0 space-y-1.5">
          {/* Trade form */}
          <ShimmerSkeleton className="h-[350px] w-full" />
          {/* Info tabs */}
          <div className="border border-[var(--border)]">
            <div className="flex border-b border-[var(--border)]/50">
              {[1, 2, 3, 4, 5].map((i) => (
                <ShimmerSkeleton key={i} className="h-10 flex-1 rounded-none" />
              ))}
            </div>
            <ShimmerSkeleton className="h-[300px] w-full rounded-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
