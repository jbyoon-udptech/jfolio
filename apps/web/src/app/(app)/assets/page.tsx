import { AssetForm } from "@/components/AssetForm";
import { AssetRow } from "@/components/AssetRow";
import { ApiErrorNotice } from "@/components/Notice";
import { api, safe } from "@/lib/api";
import { ASSET_TYPES } from "@/lib/instrument";

export const dynamic = "force-dynamic";

/** UI-003: asset master list with search, filtering and inline CRUD. */
export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; assetType?: string }>;
}) {
  const params = await searchParams;
  const result = await safe(() =>
    api.instruments({ search: params.search, assetType: params.assetType }),
  );
  if (!result.data) {
    return <ApiErrorNotice error={result.error} />;
  }
  const { items, total } = result.data;

  return (
    <>
      <h1 className="page-title">자산 목록</h1>
      <p className="page-sub">
        등록된 자산 마스터를 조회하고 등록·수정·비활성화합니다. 삭제는 이력을 보존하는
        비활성화(`isActive=false`)로 처리됩니다.
      </p>

      <AssetForm />

      <form className="card" method="get" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <input
            name="search"
            placeholder="종목명/코드 검색"
            defaultValue={params.search ?? ""}
          />
          <select name="assetType" defaultValue={params.assetType ?? ""}>
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
          <div className="table-scroll table-scroll-capped table-scroll-actions">
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
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((instrument) => (
                  <AssetRow key={instrument.instrumentId} instrument={instrument} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
