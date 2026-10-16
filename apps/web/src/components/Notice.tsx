export function ApiErrorNotice({ error }: { error: string | null }) {
  return (
    <div className="notice error">
      API에 연결할 수 없습니다: {error ?? "알 수 없는 오류"}
      <div style={{ marginTop: 6, fontSize: 12 }}>
        API 서버가 실행 중인지 확인하세요 (기본 http://127.0.0.1:3001).
      </div>
    </div>
  );
}
