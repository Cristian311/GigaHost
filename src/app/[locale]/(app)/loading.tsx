import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while a dashboard or admin page fetches. Every page in this group does
 * at least one database round trip, and several also sync status with the
 * provider, so without this the customer gets a blank frame for as long as the
 * slowest call takes.
 *
 * Shaped like the pages it stands in for — a heading and a few cards — so the
 * layout does not jump when the real content arrives.
 */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="mb-8 space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((card) => (
          <div key={card} className="rounded-2xl border border-white/5 bg-card p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="mt-5 h-9 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
