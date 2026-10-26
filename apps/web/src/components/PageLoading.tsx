import { LoadingProgress } from "@/components/LoadingProgress";

/**
 * Route-level fallback used by `(app)/loading.tsx`. The chart-shaped skeleton
 * reserves roughly the same space as a chart card, so the page does not jump
 * when the real data arrives.
 */
export function PageLoading({ label }: { label?: string }) {
  return (
    <div className="loading-page" aria-busy="true">
      <LoadingProgress label={label} />
      <div className="loading-skeleton" aria-hidden="true">
        <div className="loading-skeleton-title" />
        <div className="card loading-skeleton-card">
          <div className="loading-skeleton-line short" />
          <div className="loading-skeleton-chart" />
          <div className="loading-skeleton-line" />
        </div>
      </div>
    </div>
  );
}
