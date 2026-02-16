import { ShimmerSkeleton } from "@/components/ui/ShimmerSkeleton";

export default function HomeLoading() {
  return (
    <div className="relative">
      {/* Hero section skeleton */}
      <section className="relative flex min-h-[85dvh] items-center justify-center">
        <div className="absolute inset-x-0 top-0 h-full bg-grid pointer-events-none" />
        
        <div className="relative z-10 mx-auto max-w-[960px] px-6 text-center">
          <ShimmerSkeleton className="mx-auto h-10 w-48 mb-5" />
          <ShimmerSkeleton className="mx-auto h-20 w-full max-w-3xl mb-3" />
          <ShimmerSkeleton className="mx-auto h-1 w-32 mb-4" />
          <ShimmerSkeleton className="mx-auto h-16 w-full max-w-md mb-6" />
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ShimmerSkeleton className="h-12 w-40" />
            <ShimmerSkeleton className="h-12 w-40" />
          </div>
        </div>
      </section>

      {/* Stats section skeleton */}
      <section className="relative py-16">
        <div className="mx-auto max-w-[1100px] px-6">
          <div className="mb-10 text-center">
            <ShimmerSkeleton className="mx-auto h-3 w-32 mb-2" />
            <ShimmerSkeleton className="mx-auto h-8 w-64" />
          </div>
          
          <div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-[var(--panel-bg)] p-6">
                <ShimmerSkeleton className="h-3 w-24 mb-3" />
                <ShimmerSkeleton className="h-10 w-32" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works skeleton */}
      <section className="relative overflow-hidden py-16">
        <div className="mx-auto max-w-[1100px] px-6">
          <div className="mb-10 text-center">
            <ShimmerSkeleton className="mx-auto h-3 w-32 mb-2" />
            <ShimmerSkeleton className="mx-auto h-8 w-72" />
          </div>
          
          <div className="grid grid-cols-1 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-[var(--panel-bg)] p-5">
                <div className="mb-4 flex items-start justify-between">
                  <ShimmerSkeleton className="h-10 w-10" />
                  <ShimmerSkeleton className="h-6 w-8" />
                </div>
                <ShimmerSkeleton className="h-5 w-40 mb-2" />
                <ShimmerSkeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features skeleton */}
      <section className="relative overflow-hidden py-16">
        <div className="mx-auto max-w-[1100px] px-6">
          <div className="mb-10 text-center">
            <ShimmerSkeleton className="mx-auto h-3 w-32 mb-2" />
            <ShimmerSkeleton className="mx-auto h-8 w-80" />
          </div>
          
          <ShimmerSkeleton className="h-64 w-full mb-px" />
          
          <div className="grid grid-cols-1 gap-px overflow-hidden border border-t-0 border-[var(--border)] bg-[var(--border)] md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-[var(--panel-bg)] p-5">
                <div className="mb-4 flex items-start justify-between">
                  <ShimmerSkeleton className="h-10 w-10" />
                  <ShimmerSkeleton className="h-4 w-16" />
                </div>
                <ShimmerSkeleton className="h-5 w-32 mb-2" />
                <ShimmerSkeleton className="h-14 w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA skeleton */}
      <section className="relative overflow-hidden pt-16 pb-28">
        <div className="relative z-10 mx-auto max-w-[1100px] px-6 text-center">
          <ShimmerSkeleton className="mx-auto h-3 w-20 mb-3" />
          <ShimmerSkeleton className="mx-auto h-12 w-96 mb-5" />
          <ShimmerSkeleton className="mx-auto h-16 w-80 mb-8" />
          <ShimmerSkeleton className="mx-auto h-14 w-48" />
        </div>
      </section>
    </div>
  );
}
