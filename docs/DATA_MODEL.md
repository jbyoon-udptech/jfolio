# jFolio 데이터 모델

MongoDB native driver 사용. 컬렉션 정의는
`apps/api/src/db/collections.ts`, 리포지토리 인터페이스는
`apps/api/src/repositories/types.ts`, 도메인 타입은
`packages/shared/src/types/` 에 있습니다.

모든 시각은 UTC `Date` 로 저장하고, UI 표시 시간대만 `Asia/Seoul`(설정 가능)을
사용합니다.

## 컬렉션

| 컬렉션 | 용도 | 보존 원칙 |
| --- | --- | --- |
| `instruments` | 금융상품 마스터 | 사용 이력 보존, 비활성화 방식 |
| `market_quotes` | 시세 시계열 | 중복 제거 후 시계열 보존 |
| `latest_quotes` | 종목별 최신 시세 | 항상 최신으로 갱신 |
| `fx_rates` | 환율 시계열 | 시점별 보존 |
| `portfolios` | 포트폴리오 설정 | 사용자 데이터 |
| `transactions` | 거래 이력 | 원본 이력 불변 보존 |
| `positions` | 현재 보유 상태 | 거래 이력에서 재구성 가능 |
| `portfolio_snapshots` | 평가 스냅샷 | 시점별 보존 |
| `signal_rules` | 시그널 규칙 | 사용자 설정 |
| `signal_events` | 시그널 발생 이력 | 감사용 보존 |
| `collection_jobs` | 수집 작업 이력 | 운영 로그 |
| `provider_states` | 공급자 상태 | 최신 상태 갱신 |

## 엔티티 요약

### Instrument

```
{ instrumentId, symbol, name, assetType, market, currency,
  providers: [{ providerId, providerSymbol }],
  isActive, isWatchlist, createdAt, updatedAt }
```

- `assetType`: `STOCK | ETF | CRYPTO | FX | BOND | COMMODITY | CASH`
- 자연키: `(symbol, market, currency)` — 업서트 기준
- `CASH` 상품은 가격이 1로 고정되며 현금 잔고를 표현합니다.

### MarketQuote / LatestQuote

```
{ instrumentId, providerId, interval, timestamp, receivedAt,
  price, currency, open?, high?, low?, close?, volume?, isFinal? }
```

- `timestamp` = 가격의 기준 시각, `receivedAt` = 서버 저장 시각 (혼동 금지)
- `interval`: `tick | 10s | 1m | 5m | 1h | 1d`
- 논리 중복 키: `(instrumentId, providerId, interval, timestamp)`
- `latest_quotes` 는 종목별 물질화 뷰입니다. 수집 시 매 관측마다 갱신되며(동일
  시각 중복이면 `receivedAt` 만 갱신), 저장된 `timestamp` 보다 오래된 시세는
  반영하지 않아 최신값이 뒤로 가지 않습니다. 목록/상세 API가 `latestQuote` 로
  함께 반환합니다.

### FxRate

```
{ base, quote, rate, timestamp, receivedAt, providerId, isFinal? }
```

- `base` 1단위 = `rate` 단위의 `quote` (예: `{ base: "USD", quote: "KRW", rate: 1345.9 }`)
- 논리 중복 키: `(base, quote, timestamp)`
- FX 상품 시세가 저장될 때 `symbol`(`USD/KRW`) 또는 `providerSymbol` 에서
  base/quote 를 파싱해 `fx_rates` 로 파생 저장합니다.

### Portfolio

```
{ portfolioId, userId, name, baseCurrency, isDefault, createdAt, updatedAt }
```

- `ensureDefault()` 가 사용자별 기본 포트폴리오를 보장합니다 (없으면 생성).

### Transaction

```
{ transactionId, portfolioId, instrumentId, type, timestamp,
  quantity, price, currency, fee, feeCurrency?, externalReference?, memo?,
  createdAt, updatedAt }
```

- `type`: `BUY | SELL | DEPOSIT | WITHDRAWAL | TRANSFER_IN | TRANSFER_OUT |
  DIVIDEND | INTEREST | FEE | SPLIT | ADJUSTMENT`
- `quantity` 의미: 매매/입출금은 수량, `SPLIT` 은 분할 비율, `ADJUSTMENT` 는
  목표 절대 수량.
- 거래 생성/수정/삭제 시 `asOf` 이후 스냅샷을 무효화하고 포지션을 재계산합니다
  (FR-034).

### Position (파생)

```
{ portfolioId, instrumentId, quantity, averageCost, costCurrency,
  costBasis, firstAcquiredAt, updatedAt }
```

- 이동평균 원가법. 매수 수수료는 취득원가에 포함.
- 거래 이력에서 항상 재구성 가능한 파생 상태입니다.

### PortfolioSnapshot

```
{ snapshotId, portfolioId, snapshotType, asOf, capturedAt, baseCurrency,
  totalAssetValue, totalCostBasis, unrealizedPnL, dataStatus,
  positions: [...], cashBalances: [...] }
```

- `snapshotType`: `INTRADAY | DAILY | ON_DEMAND`
- `(portfolioId, snapshotType, asOf)` 유니크 — 멱등 업서트.

### SignalRule / SignalEvent

```
SignalRule  { ruleId, portfolioId?, instrumentId, type, threshold?,
              referenceType, referenceValue?, windowSeconds?, cooldownSeconds?,
              isEnabled, createdAt, updatedAt }
SignalEvent { eventId, ruleId, instrumentId, portfolioId?, triggeredAt,
              observedValue, threshold?, message?, status, deduplicationKey }
```

- `type`: `PRICE_DROP | PRICE_RISE | PRICE_THRESHOLD | PORTFOLIO_THRESHOLD`
- `referenceType`: `FIXED_PRICE | PREVIOUS_CLOSE | ROLLING_HIGH | ROLLING_WINDOW`
- 이벤트 중복 키: `(ruleId, deduplicationKey)`.

### CollectionJob / ProviderState

```
CollectionJob { jobId, providerId, assetType, startedAt, finishedAt, status,
                targetCount, successCount, failureCount, error }
ProviderState { providerId, lastRunAt, lastSuccessAt, lastDataTimestamp,
                lastError, lastErrorAt, successCount, failureCount,
                consecutiveFailures, targetCount }
```

## 인덱스

`ensureIndexes()` 가 기동 시 best-effort 로 생성합니다.

| 컬렉션 | 키 | 옵션 |
| --- | --- | --- |
| `instruments` | `{symbol, market, currency}` | unique |
| `instruments` | `{assetType, isActive}` | |
| `market_quotes` | `{instrumentId, providerId, interval, timestamp}` | unique |
| `market_quotes` | `{instrumentId, interval, timestamp:-1}` | |
| `latest_quotes` | `{instrumentId}` | unique |
| `fx_rates` | `{base, quote, timestamp}` | unique |
| `fx_rates` | `{base, quote, timestamp:-1}` | |
| `portfolios` | `{userId, isDefault}` | |
| `transactions` | `{portfolioId, timestamp}` / `{instrumentId, timestamp}` | |
| `positions` | `{portfolioId, instrumentId}` | unique |
| `portfolio_snapshots` | `{portfolioId, snapshotType, asOf}` | unique |
| `signal_rules` | `{portfolioId, isEnabled}` / `{instrumentId, isEnabled}` | |
| `signal_events` | `{ruleId, deduplicationKey}` | unique |
| `signal_events` | `{instrumentId, triggeredAt:-1}` | |
| `collection_jobs` | `{providerId, startedAt:-1}` | |
| `provider_states` | `{providerId}` | unique |

## 관계 무결성 원칙

- `transactions` 는 원본이며 삭제/수정되어도 `positions`/`snapshots` 는 원장에서
  재계산됩니다.
- 상품 삭제는 물리 삭제 대신 `isActive=false` 로 처리해 과거 거래/스냅샷 참조를
  보존합니다.
- 평가 시점 환율을 사용하며, 해석 불가 시 `UNAVAILABLE` 로 표시하고 합계에서
  제외합니다 (0으로 대체 금지).
