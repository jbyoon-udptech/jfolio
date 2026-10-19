import { ApiErrorNotice } from "@/components/Notice";
import { PortfolioForm } from "@/components/PortfolioForm";
import { PortfolioRowActions } from "@/components/PortfolioRowActions";
import { api, safe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/** FR-030: portfolio list, creation and editing. */
export default async function PortfoliosPage() {
  const result = await safe(() => api.portfolios());
  if (!result.data) {
    return <ApiErrorNotice error={result.error} />;
  }
  const portfolios = result.data.items;

  return (
    <>
      <h1 className="page-title">포트폴리오</h1>
      <p className="page-sub">
        자산을 묶는 단위입니다. 이름·기준 통화를 바꾸거나 기본 포트폴리오를 지정할 수 있습니다.
      </p>

      <PortfolioForm />

      <div className="card">
        <h2>포트폴리오 목록 ({portfolios.length})</h2>
        {portfolios.length === 0 ? (
          <div className="empty">아직 포트폴리오가 없습니다.</div>
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
              {portfolios.map((portfolio) => (
                <tr key={portfolio.portfolioId}>
                  <td>
                    <a href={`/portfolio?portfolioId=${portfolio.portfolioId}`}>
                      {portfolio.name}
                    </a>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {portfolio.portfolioId}
                    </div>
                  </td>
                  <td>{portfolio.baseCurrency}</td>
                  <td>{portfolio.isDefault ? <span className="badge ok">기본</span> : "—"}</td>
                  <td className="muted">{formatDateTime(portfolio.createdAt)}</td>
                  <td>
                    <a href={`/portfolio?portfolioId=${portfolio.portfolioId}`}>보유 자산</a>
                    {" · "}
                    <a href={`/transactions?portfolioId=${portfolio.portfolioId}`}>거래 내역</a>
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
