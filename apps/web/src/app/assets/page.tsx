import Link from "next/link";
import { ApiErrorNotice } from "@/components/Notice";
import { api, safe } from "@/lib/api";
import { formatDateTime, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

const ASSET_TYPES = ["STOCK", "ETF", "CRYPTO", "FX", "BOND", "COMMODITY", "CASH"];

/** Asset master list with search and asset-type filter. */
export default async function AssetsPage({
  searchParams,
}: {
  searchParams: { search?: string; assetType?: string };
}) {
  const result = await safe(() =>
    api.instruments({ search: searchParams.search, assetType: searchParams.assetType }),
  );
  if (!result.data) {
    return <ApiErrorNotice error={result.error} />;
  }
  const { items, total } = result.data;

  return (
    <>
      <h1 className="page-title">자산 목록</h1>
      <p className="page-sub">등록된 자산 마스터를 조회하고 상세 화면으로 이동합니다.</p>

      <form className="card" method="get" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <input
            name="search"
            placeholder="종목명/코드 검색"
            defaultValue={searchParams.search ?? ""}
          />
          <select name="assetType" defaultValue={searchParams.assetType ?? ""}>
            <option value="">전체 유형</option>
            {ASSET_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button type="submit" className="primary">
            검색
          </button>
          <span className="muted" style={{ marginLeft: "auto" }}>
            총 {total}건
          </span>
        </div>
      </form>

      <div className="card">
        {items.length === 0 ? (
          <div className="empty">조건에 맞는 자산이 없습니다.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>종목명</th>
                <th>코드</th>
                <th>유형</th>
                <th>시장</th>
                <th>통화</th>
                <th className="num">현재가</th>
                <th>시세 시각</th>
                <th>공급자</th>
              </tr>
            </thead>
            <tbody>
              {items.map((instrument) => (
                <tr key={instrument.instrumentId}>
                  <td>
                    <Link href={`/assets/${instrument.instrumentId}`}>{instrument.name}</Link>
                  </td>
                  <td>{instrument.symbol}</td>
                  <td>{instrument.assetType}</td>
                  <td>{instrument.market}</td>
                  <td>{instrument.currency}</td>
                  <td className="num">
                    {instrument.latestQuote
                      ? formatPrice(instrument.latestQuote.price, instrument.latestQuote.currency)
                      : "—"}
                  </td>
                  <td className="muted">{formatDateTime(instrument.latestQuote?.timestamp)}</td>
                  <td className="muted">
                    {instrument.providers.map((p) => p.providerId).join(", ") || "—"}
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
