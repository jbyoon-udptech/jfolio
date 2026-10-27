import { ApiErrorNotice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { PortfolioForm } from "@/components/PortfolioForm";
import { PortfolioRowActions } from "@/components/PortfolioRowActions";
import { api, safe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/** FR-030: portfolio list, creation, editing and hiding. */
export default async function PortfoliosPage({
  searchParams,
}: {
  searchParams: Promise<{ showHidden?: string }>;
}) {
  const params = await searchParams;
  const showHidden = params.showHidden === "1";
  const result = await safe(() => api.portfolios({ includeHidden: true }));
  if (!result.data) {
    return <ApiErrorNotice error={result.error} />;
  }
  const portfolios = result.data.items;
  // This management page is the only caller that asks for hidden rows; every
  // other page and selector receives the visible-only list from the API.
  const hiddenCount = portfolios.filter((portfolio) => portfolio.isHidden).length;
  const visible = showHidden
    ? portfolios
    : portfolios.filter((portfolio) => !portfolio.isHidden);

  return (
    <>
      <PageHeader
        title="포트폴리오"
        subtitle="자산을 묶는 단위입니다. 이름·기준 통화를 바꾸거나 기본 포트폴리오를 지정할 수 있습니다."
      />

      <PortfolioForm />

      <div className="card">
        <h2>
          포트폴리오 목록 ({visible.length})
          {hiddenCount > 0 ? (
            <a
              href={showHidden ? "/portfolios" : "/portfolios?showHidden=1"}
              style={{ marginLeft: 12, fontSize: 12, fontWeight: 400 }}
            >
              {showHidden ? "숨긴 항목 가리기" : `숨긴 항목 보기 (${hiddenCount})`}
            </a>
          ) : null}
        </h2>
        {visible.length === 0 ? (
          <div className="empty">
            {portfolios.length === 0
              ? "아직 포트폴리오가 없습니다."
              : "표시할 포트폴리오가 없습니다. 숨긴 항목 보기에서 다시 표시할 수 있습니다."}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>기준 통화</th>
                <th>기본</th>
                <th>생성일</th>
                <th>바로가기</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((portfolio) => (
                <tr key={portfolio.portfolioId}>
                  <td>
                    {portfolio.isHidden ? (
                      portfolio.name
                    ) : (
                      <a href={`/portfolio?portfolioId=${portfolio.portfolioId}`}>
                        {portfolio.name}
                      </a>
                    )}
                    {portfolio.isHidden ? (
                      <span className="badge muted" style={{ marginLeft: 8 }}>
                        숨김
                      </span>
                    ) : null}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {portfolio.portfolioId}
                    </div>
                  </td>
                  <td>{portfolio.baseCurrency}</td>
                  <td>{portfolio.isDefault ? <span className="badge ok">기본</span> : "—"}</td>
                  <td className="muted">{formatDateTime(portfolio.createdAt)}</td>
                  <td>
                    {portfolio.isHidden ? (
                      <span className="muted">숨김 상태</span>
                    ) : (
                      <>
                        <a href={`/portfolio?portfolioId=${portfolio.portfolioId}`}>보유 자산</a>
                        {" · "}
                        <a href={`/transactions?portfolioId=${portfolio.portfolioId}`}>
                          거래 내역
                        </a>
                      </>
                    )}
                  </td>
                  <td>
                    <PortfolioRowActions portfolio={portfolio} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
