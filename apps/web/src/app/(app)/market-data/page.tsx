import { CollectionTrigger } from "@/components/CollectionTrigger";
import { ApiErrorNotice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { api, safe } from "@/lib/api";
import { formatCollectionInterval, formatDateTime, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

/** FR-020 / SPEC 8.7: market data, provider and collection status. */
export default async function MarketDataPage() {
  const [statusResult, providersResult, instrumentsResult] = await Promise.all([
    safe(() => api.dataStatus()),
    safe(() => api.providers()),
    safe(() => api.instruments()),
  ]);

  if (!statusResult.data) {
    return <ApiErrorNotice error={statusResult.error} />;
  }

  const status = statusResult.data;
  const providers = providersResult.data?.items ?? [];
  const instruments = instrumentsResult.data?.items ?? [];

  return (
    <>
      <PageHeader
        actions={<StatusBadge status={status.status} />}
        title="시장 데이터"
        subtitle={
          <>
            데이터 수집 상태와 공급자별 현황을 확인합니다. 마지막 갱신{" "}
            {formatDateTime(status.lastUpdatedAt)}
          </>
        }
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>수동 수집</h2>
          <CollectionTrigger />
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          마지막 수집 {formatDateTime(status.latestCollectionAt)} · 최신 시세{" "}
          {formatDateTime(status.latestQuoteAt)}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>데이터 공급자 ({providers.length})</h2>
        {providers.length === 0 ? (
          <div className="empty">등록된 공급자가 없습니다.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>공급자</th>
                <th>자산 유형</th>
                <th>데이터 수집 주기</th>
                <th>마지막 실행</th>
                <th>마지막 성공</th>
                <th className="num">연속 실패</th>
                <th>상태</th>
                <th>마지막 오류</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider.providerId}>
                  <td>
                    {provider.displayName}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {provider.providerId}
                    </div>
                  </td>
                  <td className="muted">{provider.assetTypes.join(", ") || "—"}</td>
                  <td
                    className="muted"
                    title={
                      provider.schedulerEnabled
                        ? undefined
                        : "스케줄러가 비활성화되어 수동 수집만 동작합니다."
                    }
                  >
                    {formatCollectionInterval(
                      provider.collectionIntervals,
                      provider.schedulerEnabled,
                    )}
                  </td>
                  <td className="muted">{formatDateTime(provider.state?.lastRunAt)}</td>
                  <td className="muted">{formatDateTime(provider.state?.lastSuccessAt)}</td>
                  <td className="num">{provider.state?.consecutiveFailures ?? 0}</td>
                  <td>
                    <StatusBadge status={provider.state?.status ?? "NO_DATA"} />
                  </td>
                  <td className="muted" style={{ maxWidth: 280, overflow: "hidden" }}>
                    {provider.state?.lastError ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>최근 수집 작업</h2>
        {status.recentJobs.length === 0 ? (
          <div className="empty">수집 이력이 없습니다.</div>
        ) : (
          <div className="table-scroll table-scroll-capped table-scroll-compact">
            <table>
              <thead>
                <tr>
                  <th>시작</th>
                  <th>공급자</th>
                  <th>자산 유형</th>
                  <th>상태</th>
                  <th className="num">저장</th>
                  <th className="num">실패</th>
                  <th>종료</th>
                </tr>
              </thead>
              <tbody>
                {status.recentJobs.map((job) => (
                  <tr key={job.jobId}>
                    <td className="muted">{formatDateTime(job.startedAt)}</td>
                    <td>{job.providerId}</td>
                    <td>{job.assetType}</td>
                    <td>
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="num">{job.insertedCount}</td>
                    <td className="num">{job.failedCount}</td>
                    <td className="muted">{formatDateTime(job.finishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>자산별 최신 시세 ({instruments.length})</h2>
        {instruments.length === 0 ? (
          <div className="empty">등록된 자산이 없습니다.</div>
        ) : (
          <div className="table-scroll table-scroll-capped">
            <table>
              <thead>
                <tr>
                  <th>자산</th>
                  <th>공급자</th>
                  <th>유형</th>
                  <th className="num">현재가</th>
                  <th>시세 시각</th>
                  <th>실행 시각</th>
                </tr>
              </thead>
              <tbody>
                {instruments.map((instrument) => (
                  <tr key={instrument.instrumentId}>
                    <td>
                      <a href={`/assets/${instrument.instrumentId}`}>{instrument.name}</a>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {instrument.symbol}
                      </div>
                    </td>
                    <td className="muted">
                      {instrument.latestQuote?.providerId ||
                        instrument.providers.map((p) => p.providerId).join(", ") ||
                        "—"}
                    </td>
                    <td>{instrument.assetType}</td>
                    <td className="num">
                      {instrument.latestQuote
                        ? formatPrice(instrument.latestQuote.price, instrument.latestQuote.currency)
                        : "데이터 없음"}
                    </td>
                    <td className="muted">{formatDateTime(instrument.latestQuote?.timestamp)}</td>
                    <td className="muted">{formatDateTime(instrument.latestQuote?.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
