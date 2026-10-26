import { ApiErrorNotice } from "@/components/Notice";
import { PortfolioSelect } from "@/components/PortfolioSelect";
import {
  TransactionForm,
  type Option,
  type OptionGroup,
} from "@/components/TransactionForm";
import { TransactionRow } from "@/components/TransactionRow";
import { api, safe } from "@/lib/api";
import { groupByCurrency } from "@/lib/instrument";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** FR-033: transaction ledger with create, edit and delete. */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolioId?: string; instrumentId?: string }>;
}) {
  const params = await searchParams;
  const [portfoliosResult, instrumentsResult, transactionsResult] = await Promise.all([
    safe(() => api.portfolios()),
    safe(() => api.instruments()),
    safe(() =>
      api.transactions({
        portfolioId: params.portfolioId,
        instrumentId: params.instrumentId,
        limit: 200,
      }),
    ),
  ]);

  if (!transactionsResult.data) {
    return <ApiErrorNotice error={transactionsResult.error} />;
  }

  // Hidden portfolios are not selectable; drop the stale filter.
  if (
    params.portfolioId &&
    portfoliosResult.data &&
    !portfoliosResult.data.items.some((p) => p.portfolioId === params.portfolioId)
  ) {
    redirect(
      params.instrumentId
        ? `/transactions?instrumentId=${encodeURIComponent(params.instrumentId)}`
        : "/transactions",
    );
  }

  const portfolios = portfoliosResult.data?.items ?? [];
  const instruments = instrumentsResult.data?.items ?? [];
  const allTransactions = transactionsResult.data.items;
  const visiblePortfolioIds = new Set(portfolios.map((p) => p.portfolioId));
  // Hidden portfolios are not shown anywhere, including this global ledger.
  const transactions = portfoliosResult.data
    ? allTransactions.filter((tx) => visiblePortfolioIds.has(tx.portfolioId))
    : allTransactions;
  const hiddenTransactionCount = portfoliosResult.data
    ? allTransactions.length - transactions.length
    : 0;
  const portfolioNameById = new Map(portfolios.map((p) => [p.portfolioId, p.name]));
  const currentPortfolioId = params.portfolioId ?? "";

  const portfolioOptions: Option[] = portfolios.map((p) => ({
    value: p.portfolioId,
    label: `${p.name} (${p.baseCurrency})`,
  }));
  // Currency headers make the mixed-currency asset list easier to scan.
  const instrumentGroups: OptionGroup[] = groupByCurrency(instruments).map(
    (group) => ({
      label: group.currency,
      options: group.items.map((i) => ({
        value: i.instrumentId,
        label: `${i.name} (${i.symbol})`,
      })),
    }),
  );

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">거래 내역</h1>
          <p className="page-sub">
            매수/매도, 입출금, 배당 등 모든 자산 변동을 기록합니다.{" "}
            {hiddenTransactionCount > 0
              ? `표시 ${transactions.length}건 (숨김 포트폴리오 거래 ${hiddenTransactionCount}건 제외).`
              : `총 ${transactionsResult.data.total}건.`}{" "}
            각 행에서 수정·삭제할 수 있습니다.
          </p>
        </div>
        {portfolioOptions.length > 0 ? (
          <PortfolioSelect
            portfolios={portfolioOptions}
            currentId={currentPortfolioId}
            allOptionLabel="전체 포트폴리오"
            extraQuery={
              params.instrumentId
                ? `instrumentId=${encodeURIComponent(params.instrumentId)}`
                : undefined
            }
          />
        ) : null}
      </div>

      {portfolioOptions.length > 0 && instrumentGroups.length > 0 ? (
        <TransactionForm
          portfolios={portfolioOptions}
          instruments={instrumentGroups}
          defaultPortfolioId={params.portfolioId}
        />
      ) : (
        <div className="notice" style={{ marginBottom: 16 }}>
          거래를 등록하려면 포트폴리오와 자산이 먼저 필요합니다. (시드 데이터를 실행하세요.)
        </div>
      )}

      <div className="card">
        {transactions.length === 0 ? (
          <div className="empty">거래 내역이 없습니다.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>일시</th>
                <th>유형</th>
                <th>포트폴리오</th>
                <th>종목명</th>
                <th>코드명</th>
                <th className="num">수량</th>
                <th className="num">단가</th>
                <th className="num">수수료</th>
                <th>메모</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const instrument = instruments.find((i) => i.instrumentId === tx.instrumentId);
                return (
                  <TransactionRow
                    key={tx.transactionId}
                    transaction={tx}
                    name={instrument?.name}
                    symbol={instrument?.symbol}
                    portfolioName={portfolioNameById.get(tx.portfolioId)}
                    portfolioOptions={portfolioOptions}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
