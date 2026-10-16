"use client";

import { ASSET_TYPES } from "@/lib/instrument";

/** Editable shape of an asset master record, shared by create and edit forms. */
export interface AssetDraft {
  symbol: string;
  name: string;
  assetType: string;
  market: string;
  currency: string;
  /** Raw provider text, e.g. `"binance:BTCUSDT, yahoo:BTC-USD"`. */
  providers: string;
  isWatchlist: boolean;
  isActive: boolean;
}

export const EMPTY_ASSET_DRAFT: AssetDraft = {
  symbol: "",
  name: "",
  assetType: "STOCK",
  market: "",
  currency: "KRW",
  providers: "",
  isWatchlist: false,
  isActive: true,
};

const CURRENCIES = ["KRW", "USD", "JPY", "EUR", "USDT"];

/** FR-001/FR-003: the input fields of the asset master, reused by both forms. */
export function AssetFields({
  draft,
  onChange,
}: {
  draft: AssetDraft;
  onChange: (patch: Partial<AssetDraft>) => void;
}) {
  return (
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
          onChange={(event) => onChange({ symbol: event.target.value })}
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
        <input
          value={draft.market}
          onChange={(event) => onChange({ market: event.target.value })}
          required
          maxLength={64}
          placeholder="KRX, NASDAQ, BINANCE…"
        />
      </label>
      <label>
        통화
        <input
          value={draft.currency}
          onChange={(event) => onChange({ currency: event.target.value.toUpperCase() })}
          required
          maxLength={5}
          list="asset-currencies"
        />
      </label>
      <label>
        공급자
        <input
          value={draft.providers}
          onChange={(event) => onChange({ providers: event.target.value })}
          placeholder="binance:BTCUSDT, yahoo:BTC-USD"
        />
      </label>
      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={draft.isWatchlist}
          onChange={(event) => onChange({ isWatchlist: event.target.checked })}
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
      <datalist id="asset-currencies">
        {CURRENCIES.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
    </div>
  );
}
