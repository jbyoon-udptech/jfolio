import { ApiErrorNotice } from "@/components/Notice";
import { TransactionForm, type Option } from "@/components/TransactionForm";
import { api, safe } from "@/lib/api";
import { formatCurrency, formatDateTime, formatPrice, formatQuantity } from "@/lib/format";

export const dynamic = "force-dynamic";

/** FR-033: transaction ledger with a creation form. */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: { portfolioId?: string; instrumentId?: string };
}) {
  const [portfoliosResult, instrumentsResult, transactionsResult] = await Promise.all([
    safe(() => api.portfolios()),
    safe(() => api.instruments()),
    safe(() =>
      api.transactions({
        portfolioId: searchParams.portfolioId,
        instrumentId: searchParams.instrumentId,
        limit: 200,
      }),
    ),
  ]);

  if (!transactionsResult.data) {
    return <ApiErrorNotice error={transactionsResult.error} />;
  }

  const portfolios = portfoliosResult.data?.items ?? [];
  const instruments = instrumentsResult.data?.items ?? [];
  const transactions = transactionsResult.data.items;

  const portfolioOptions: Option[] = portfolios.map((p) => ({
    value: p.portfolioId,
    label: `${p.name} (${p.baseCurrency})`,
  }));
  const instrumentOptions: Option[] = instruments.map((i) => ({
    value: i.instrumentId,
    label: `${i.name} (${i.symbol})`,
  }));

  return (
    <>
      <h1 className="page-title">거래 내역</h1>
      <p className="page-sub">
        매수/매도, 입출금, 배당 등 모든 자산 변동을 기록합니다. 총 {transactionsResult.data.total}건.
      </p>

      {portfolioOptions.length > 0 && instrumentOptions.length > 0 ? (
        <TransactionForm portfolios={portfolioOptions} instruments={instrumentOptions} />
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
                <th>자산</th>
                <th className="num">수량</th>
                <th className="num">단가</th>
                <th className="num">수수료</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const instrument = instruments.find((i) => i.instrumentId === tx.instrumentId);
                return (
                  <tr key={tx.transactionId}>
                    <td className="muted">{formatDateTime(tx.timestamp)}</td>
                    <td>{tx.type}</td>
                    <td>
                      {instrument ? (
                        <a href={`/assets/${tx.instrumentId}`}>{instrument.symbol}</a>
                      ) : (
                        tx.instrumentId
                      )}
                    </td>
                    <td className="num">{formatQuantity(tx.quantity)}</td>
                    <td className="num">{formatPrice(tx.price, tx.currency)}</td>
                    <td className="num">{formatCurrency(tx.fee, tx.feeCurrency ?? tx.currency)}</td>
                    <td className="muted">{tx.memo ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
