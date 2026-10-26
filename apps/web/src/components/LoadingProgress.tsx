/**
 * Indeterminate progress bar for server-rendered data loading. The server does
 * not report byte-level progress, so the bar animates until the new page is
 * ready. The visible label doubles as the accessible name.
 */
export function LoadingProgress({
  label = "데이터를 불러오는 중...",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className={`loading-progress${compact ? " compact" : ""}`}>
      <div
        className="loading-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuetext={label}
        aria-busy="true"
      >
        <span className="loading-progress-indicator" aria-hidden="true" />
      </div>
      <p className="loading-progress-label" role="status" aria-live="polite">
        {label}
      </p>
    </div>
  );
}
