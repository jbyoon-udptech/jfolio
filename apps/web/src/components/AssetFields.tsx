"use client";

import {
  ASSET_TYPES,
  currencyOptions,
  defaultProviderSymbol,
  marketOptions,
  providerOptions,
} from "@/lib/instrument";

/** Editable shape of an asset master record, shared by create and edit forms. */
export interface AssetDraft {
  symbol: string;
  name: string;
  assetType: string;
  market: string;
  currency: string;
  /** Selected provider, if any. An asset links to at most one provider. */
  providerId: string;
  /** Symbol used by the selected provider (e.g. AAPL, BTCUSDT, USD). */
  providerSymbol: string;
  isWatchlist: boolean;
  isActive: boolean;
}

export const EMPTY_ASSET_DRAFT: AssetDraft = {
  symbol: "",
  name: "",
  assetType: "STOCK",
  market: "",
  currency: "KRW",
  providerId: "",
  providerSymbol: "",
  isWatchlist: false,
  isActive: true,
};

function providerSymbolPlaceholder(providerId: string): string {
  if (!providerId) return "공급자 선택 후 입력";
  switch (providerId) {
    case "binance":
      return "BTCUSDT";
    case "frankfurter":
      return "USD";
    case "yahoo":
      return "AAPL";
    default:
      return "공급자 심볼";
  }
}

/** FR-001/FR-003: the input fields of the asset master, reused by both forms. */
export function AssetFields({
  draft,
  onChange,
}: {
  draft: AssetDraft;
  onChange: (patch: Partial<AssetDraft>) => void;
}) {
  return (
    <>
      <div className="form-grid">
        <label>
          종목명
          <input
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
            required
            maxLength={256}
          />
        </label>
        <label>
          코드
          <input
            value={draft.symbol}
            onChange={(event) => {
              const symbol = event.target.value;
              onChange({
                symbol,
                // Until the user edits the provider symbol, mirror the code.
                providerSymbol: defaultProviderSymbol(
                  symbol,
                  draft.providerSymbol,
                  draft.symbol,
                ),
              });
            }}
            required
            maxLength={64}
          />
        </label>
        <label>
          유형
          <select
            value={draft.assetType}
            onChange={(event) => onChange({ assetType: event.target.value })}
          >
            {ASSET_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          시장
          <select
            value={draft.market.trim()}
            onChange={(event) => onChange({ market: event.target.value })}
            required
          >
            <option value="">시장 선택</option>
            {marketOptions(draft.market).map((market) => (
              <option key={market} value={market}>
                {market}
              </option>
            ))}
          </select>
        </label>
        <label>
          공급자
          <select
            value={draft.providerId}
            onChange={(event) => {
              const providerId = event.target.value;
              onChange({
                providerId,
                // A symbol only makes sense together with a provider. If none
                // has been entered yet, default it to the asset code.
                providerSymbol: providerId
                  ? draft.providerSymbol || draft.symbol
                  : "",
              });
            }}
          >
            <option value="">공급자 없음</option>
            {providerOptions(draft.providerId).map((option) => (
              <option key={option.providerId} value={option.providerId}>
                {option.displayName} ({option.providerId})
              </option>
            ))}
          </select>
        </label>
        <label>
          공급자 심볼
          <input
            value={draft.providerSymbol}
            onChange={(event) =>
              onChange({ providerSymbol: event.target.value })
            }
            placeholder={providerSymbolPlaceholder(draft.providerId)}
            maxLength={64}
            required={draft.providerId !== ""}
            disabled={!draft.providerId}
          />
        </label>
        <label>
          통화
          <select
            value={draft.currency.trim().toUpperCase()}
            onChange={(event) => onChange({ currency: event.target.value })}
          >
            {currencyOptions(draft.currency).map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={draft.isWatchlist}
              onChange={(event) =>
                onChange({ isWatchlist: event.target.checked })
              }
              style={{ width: "auto" }}
            />
            관심종목
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => onChange({ isActive: event.target.checked })}
              style={{ width: "auto" }}
            />
            활성 (시세 수집 대상)
          </label>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        공급자는 자산당 하나만 지정할 수 있습니다. 코드를 입력하면 공급자 심볼이
        같은 값으로 자동 입력되며, 필요하면 직접 수정할 수 있습니다. Yahoo는
        주식·ETF, Binance는 암호화폐, Frankfurter는 환율에 사용합니다. 공급자
        심볼은 공급자별 조회 코드로, Yahoo는 AAPL·005930.KS, Binance는 BTCUSDT,
        Frankfurter는 기준 통화(USD)를 입력합니다. 공급자를 지정하지 않아도
        됩니다.
      </p>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        한국 주식은 시장을 <strong>KRX</strong>·<strong>KOSPI</strong>·<strong>KOSDAQ</strong>로
        지정하면 Yahoo 접미사(<code>.KS</code>/<code>.KQ</code>)가 조회 시 자동으로 붙습니다.
        코드는 6자리로 입력하세요.
      </p>
    </>
  );
}
