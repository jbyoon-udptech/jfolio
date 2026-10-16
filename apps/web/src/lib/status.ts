/** UI-006: maps machine-readable data states to human labels and tones. */

export type StatusTone = "ok" | "warn" | "error" | "muted";

const LABELS: Record<string, string> = {
  NORMAL: "정상",
  DELAYED: "갱신 지연",
  STALE: "갱신 지연",
  ERROR: "수집 실패",
  NO_DATA: "데이터 없음",
  UNAVAILABLE: "평가 불가",
  RUNNING: "수집 중",
  SUCCESS: "성공",
  PARTIAL: "부분 성공",
  FAILED: "실패",
  OPEN: "미처리",
  RESOLVED: "해결",
  IGNORED: "무시",
};

const TONES: Record<string, StatusTone> = {
  NORMAL: "ok",
  SUCCESS: "ok",
  DELAYED: "warn",
  STALE: "warn",
  RUNNING: "warn",
  PARTIAL: "warn",
  ERROR: "error",
  FAILED: "error",
  UNAVAILABLE: "error",
  NO_DATA: "muted",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "알 수 없음";
  return LABELS[status] ?? status;
}

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return "muted";
  return TONES[status] ?? "muted";
}
