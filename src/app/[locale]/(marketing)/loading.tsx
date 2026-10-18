import { Skeleton } from "@/components/ui/skeleton";

/**
 * The marketing pages read the catalogue and the pricing table before they can
 * render a price, so they are not instant either. Kept lighter than the
 * dashboard's: these pages are wide and mostly text.
 */
export default function MarketingLoading() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>

      <Skeleton className="h-9 w-2/3 max-w-lg" />
      <Skeleton className="mt-4 h-5 w-full max-w-xl" />

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <div key={card} className="rounded-2xl border border-white/5 bg-card/60 p-6">
            <Skeleton className="size-11 rounded-xl" />
            <Skeleton className="mt-5 h-5 w-40" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
