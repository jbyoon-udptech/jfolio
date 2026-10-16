import { statusLabel, statusTone } from "@/lib/status";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  return <span className={`badge ${statusTone(status)}`}>{statusLabel(status)}</span>;
}
