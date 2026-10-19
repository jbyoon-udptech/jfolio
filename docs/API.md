# jFolio REST API

- 기본 경로: `/api/v1`
- 형식: JSON, 날짜는 ISO 8601 (저장은 UTC, UI 기본 표시는 `Asia/Seoul`)
- 통화: ISO 4217 코드 (`USDT` 등 크립토 표기도 사용)
- 오류 응답: 공통 envelope `{ "error": { "code", "message", "details?" } }`

## 인증

Phase 1은 **이메일/비밀번호 로그인 + 서버 세션**입니다. 회원가입·비밀번호
재설정·이메일 인증은 제공하지 않으며, 계정은 관리자가
`yarn create-user`(운영: `node dist/cli/create-user.js`)로 생성합니다.
Google SSO는 Phase 2 예약입니다.

### `/api/auth` 엔드포인트

인증 라우트는 버전 경로(`/api/v1`) 밖에 있으며, 웹에서는 Next.js의 동일 출처
프록시(`/api/auth/*`)를 통해 호출합니다.

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/api/auth/csrf` | 현재 세션의 CSRF 토큰 반환 (없으면 `null`) |
| GET | `/api/auth/me` | `{ authenticated, user }` — `user`는 안전한 공개 필드만 포함 |
| GET | `/api/auth/providers` | `{ local, google }` — Phase 1은 `local=true`, `google=false` |
| POST | `/api/auth/login` | `{ email, password }` 로 로그인. 성공 시 세션 쿠키 발급 |
| POST | `/api/auth/logout` | 서버 세션 파괴 + 인증 쿠키 삭제 |

로그인 응답(예):

```json
{
  "success": true,
  "user": { "id": "usr_...", "email": "you@example.com", "name": "You", "role": "user" }
}
```

- 비밀번호는 bcrypt 해시로만 저장되며 응답/로그에 포함되지 않습니다.
- 존재하지 않는 이메일, 잘못된 비밀번호, 비활성 계정은 모두 동일한
  `401 Invalid email or password` 로 응답합니다(사용자 열거 방지).
- 로그인 성공 시 세션 ID를 새로 발급합니다(session fixation 방지).
- 로그인은 IP + 정규화된 이메일 기준으로 rate limit 되며, 초과 시 `429`
  `RATE_LIMITED` 를 반환합니다.

### 세션 쿠키

| 쿠키 | 기본 이름 | 속성 |
| --- | --- | --- |
| 세션 | `jfolio.sid` | `HttpOnly`, `Secure`(운영), `SameSite=Lax`, `Path=/`, 만료 `SESSION_MAX_AGE_MS` |
| CSRF | `jfolio.csrf` | 읽기 가능(`HttpOnly=false`), 같은 `Secure`/`SameSite`/만료 |

세션은 서버 측 저장소(MongoDB `sessions`)에 보관됩니다. 운영에서
`SESSION_STORE=memory` 는 거부됩니다. 로그아웃과 세션 만료 시 서버 세션이
무효화됩니다.

### CSRF (double-submit)

세션 쿠키를 사용하는 **변경 요청**(`POST`/`PUT`/`PATCH`/`DELETE`)은 다음을
모두 만족해야 합니다.

1. `jfolio.csrf` 쿠키 값과
2. `x-csrf-token` 헤더 값이 일치

`GET /api/auth/csrf`(또는 로그인 전 웹 클라이언트의 자동 호출)로 토큰을 받은
뒤 헤더에 넣습니다. 로그인/로그아웃도 CSRF 검사를 강제합니다. `GET`/`HEAD`/
`OPTIONS` 는 검사하지 않습니다.

### `/api/v1` 인증

`/api/v1` 은 다음 중 하나를 허용합니다.

- **브라우저 세션**: 위 세션 쿠키
- **서비스 토큰**: `API_AUTH_TOKEN` 이 설정된 경우

```
Authorization: Bearer <token>
x-api-key: <token>
```

`API_AUTH_TOKEN` 은 Next.js 서버가 업스트림 호출에 사용하는 신뢰된 서비스
자격 증명입니다. 브라우저에 노출하지 마세요. `AUTH_REQUIRED=false` 이고
`API_AUTH_TOKEN` 도 없으면 기존처럼 모든 요청이 통과합니다(로컬 개발 전용).

인증 예외(항상 공개):

- `GET /health` (루트, 버전 경로 밖)
- `GET /api/v1/system/health`

## 오류 코드

| HTTP | code | 설명 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | 잘못된 요청 |
| 401 | `UNAUTHORIZED` | 세션/토큰 누락 또는 로그인 실패 |
| 403 | `FORBIDDEN` | CSRF 토큰 불일치 / 비활성 로그인 수단 |
| 404 | `NOT_FOUND` | 리소스 없음 / 미정의 경로 |
| 409 | `CONFLICT` | 중복 등 충돌 |
| 422 | `VALIDATION_ERROR` | Zod 검증 실패 (`details` 포함) |
| 429 | `RATE_LIMITED` | 로그인 시도 제한 초과 |
| 503 | `UNAVAILABLE` | 일시적 사용 불가 |

---

## 1. Dashboard

### `GET /api/v1/dashboard`

`portfolioId` 가 없으면 사용자의 기본 포트폴리오를 사용하며, 없으면 생성합니다.

Query:

| 이름 | 타입 | 설명 |
| --- | --- | --- |
| `portfolioId` | string | 조회할 포트폴리오 |
| `baseCurrency` | string | 기준 통화 (기본 `KRW`) |

응답(예):

```json
{
  "portfolioId": "pf_...",
  "baseCurrency": "KRW",
  "asOf": "2026-10-16T07:15:06.345Z",
  "totalAssetValue": 128873374.95,
  "dailyChange": null,
  "dailyChangeRate": null,
  "totalCostBasis": 104322804.9,
  "unrealizedPnL": 24550570.05,
  "unrealizedReturn": 23.5333,
  "dataStatus": "NORMAL",
  "unavailableCount": 0,
  "allocationByAssetType": [{ "key": "CASH", "marketValueBase": 76918000, "weight": 59.68 }],
  "allocationByCurrency": [{ "key": "KRW", "marketValueBase": 71550000, "weight": 55.5 }],
  "topHoldings": [ { "symbol": "005930", "marketValueBase": 21550000, "status": "NORMAL", "...": "..." } ],
  "recentSignals": [],
  "lastDataUpdatedAt": "2026-10-16T07:15:06.345Z"
}
```

> `dailyChange` / `dailyChangeRate` 는 현재 또는 24시간 전 기준 평가금액이
> `UNAVAILABLE` 이면 `null` 입니다 (0으로 표시하지 않음, UI-006).

---

## 2. Assets

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/api/v1/assets` | 자산 목록 + 각 항목의 `latestQuote` (`assetType`, `market`, `currency`, `search`, `isActive`, `limit`, `offset`) |
| POST | `/api/v1/assets` | 자산 등록 |
| GET | `/api/v1/assets/:id` | 자산 상세 + `latestQuote` |
| PATCH | `/api/v1/assets/:id` | 자산 정보 수정 |
| DELETE | `/api/v1/assets/:id` | 자산 비활성화 (물리 삭제 대신 `isActive=false`) |
| GET | `/api/v1/assets/:id/quotes` | 과거 시세 (`interval`, `from`, `to`, `limit`) |

자산 등록 요청(예):

```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "assetType": "STOCK",
  "market": "NASDAQ",
  "currency": "USD",
  "providers": [{ "providerId": "yahoo", "providerSymbol": "AAPL" }]
}
```

`assetType` 값: `STOCK | ETF | CRYPTO | FX | BOND | COMMODITY | CASH`.
`interval` 값: `tick | 10s | 1m | 5m | 1h | 1d`.

`PATCH /assets/:id` 는 부분 수정입니다. 보내지 않은 필드는 기존 값을 유지하며,
빈 본문(`{}`)은 `422` 로 거부됩니다. 자연키(`symbol`+`market`+`currency`)가
다른 자산과 겹치면 `409` 를 반환합니다. `DELETE` 는 거래·시세 이력 보존을 위해
물리 삭제 대신 `isActive=false` 로 비활성화하며, `PATCH { "isActive": true }` 로
복원할 수 있습니다.

> **최신 시세(`latestQuote`)**: `GET /assets` 목록과 `GET /assets/:id` 상세는 자산별
> 최신 시세를 `latestQuote` 필드로 함께 반환합니다(시세가 없으면 `null`). 값은
> `latest_quotes` 컬렉션에 저장된 최신 관측치이며, 수집 실행 시 매 관측마다
> 갱신됩니다(동일 시각의 중복 관측도 `receivedAt` 이 갱신됨). 저장된 최신값보다
> 오래된 시세가 뒤늦게 들어와도 최신값을 덮어쓰지 않습니다.

> **한국 종목 Yahoo 심볼**: `market` 이 `KRX`/`KOSPI`/`KOSDAQ` 이고 `symbol` 이
> 6자리 숫자이면 Yahoo 공급자가 조회 시 접미사(`.KS`/`.KQ`)를 자동으로 붙입니다.
> `providers[].providerSymbol` 에 접미사를 직접 지정하면 그 값이 우선합니다.
> `KRX` 는 KOSPI/KOSDAQ 을 구분하지 못하므로 두 후보를 순서대로 시도하고,
> 돌려받은 `instrumentType` 이 자산 유형과 맞지 않으면 다음 후보를 사용합니다.

---

## 3. Portfolios

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/api/v1/portfolios` | 포트폴리오 목록 |
| POST | `/api/v1/portfolios` | 포트폴리오 생성 |
| GET | `/api/v1/portfolios/:id` | 포트폴리오 상세 |
| PATCH | `/api/v1/portfolios/:id` | 포트폴리오 수정 (`name`, `baseCurrency`, `isDefault`) |
| GET | `/api/v1/portfolios/:id/holdings` | 보유 자산 평가 |
| GET | `/api/v1/portfolios/:id/valuation` | 평가금액 (`asOf`, `baseCurrency`) |
| GET | `/api/v1/portfolios/:id/history` | 과거 평가 시계열 (`from`, `to`, `interval`) |
| GET | `/api/v1/portfolios/:id/snapshots` | 스냅샷 조회 (`snapshotType`, `from`, `to`, `limit`) |
| POST | `/api/v1/portfolios/:id/snapshots` | 온디맨드 스냅샷 생성 (`snapshotType`, `asOf`, `baseCurrency`) |

`PATCH /portfolios/:id` 는 `name` / `baseCurrency` / `isDefault` 중 **하나 이상**을
받습니다. 빈 본문은 `422` 로 거부되며, `isDefault: true` 로 지정하면 같은 사용자의
다른 포트폴리오는 자동으로 기본 지정이 해제됩니다. 생성·수정 UI는 웹의
`/portfolios` 화면에서 제공됩니다.

`/holdings` 응답에는 각 포지션의 `price`, `fxRateToBase`, `marketValueBase`,
`unrealizedPnL`, `status`, `statusReason` 이 포함됩니다. 가격/환율을 해석할 수
없는 포지션은 `status: "UNAVAILABLE"` 이며 합계에서 제외됩니다.

`snapshotType` 값: `INTRADAY | DAILY | ON_DEMAND`.

---

## 4. Transactions

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/api/v1/transactions` | 거래 이력 (`portfolioId`, `instrumentId`, `type`, `from`, `to`, `limit`, `offset`) |
| POST | `/api/v1/transactions` | 거래 등록 |
| GET | `/api/v1/transactions/:id` | 거래 단건 |
| PATCH | `/api/v1/transactions/:id` | 거래 수정 |
| DELETE | `/api/v1/transactions/:id` | 거래 삭제 (204) |

거래 등록 요청(예):

```json
{
  "portfolioId": "pf_...",
  "instrumentId": "ins_...",
  "type": "BUY",
  "timestamp": "2026-10-06T01:00:00.000Z",
  "quantity": 100,
  "price": 72000,
  "currency": "KRW",
  "fee": 1500
}
```

`type` 값: `BUY | SELL | DEPOSIT | WITHDRAWAL | TRANSFER_IN | TRANSFER_OUT |
DIVIDEND | INTEREST | FEE | SPLIT | ADJUSTMENT`. `currency` 는 선택이며
생략 시 상품 통화로 해석됩니다. 거래 생성/수정/삭제는 이후 스냅샷을
무효화하고 포지션을 원장에서 재계산합니다 (FR-034).

`PATCH /transactions/:id` 는 **부분 수정**입니다. 전달한 필드만 변경되며
(예: `{"quantity": 12}` 는 수량만 바꾸고 `price`/`fee`/`memo` 는 유지),
존재하지 않는 거래는 `404` 를 반환합니다. 대시보드의 `/transactions`
화면에서 각 행의 `수정`/`삭제` 로 동일한 동작을 수행할 수 있습니다.
거래의 `portfolioId`/`instrumentId` 변경은 통화 정합성 문제로 UI 에서는
제공하지 않습니다(잘못된 자산은 삭제 후 재등록).

---

## 5. Signals

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/api/v1/signals/rules` | 규칙 목록 (`portfolioId`, `instrumentId`, `isEnabled`) |
| POST | `/api/v1/signals/rules` | 규칙 생성 |
| GET | `/api/v1/signals/rules/:id` | 규칙 단건 |
| PATCH | `/api/v1/signals/rules/:id` | 규칙 수정 |
| DELETE | `/api/v1/signals/rules/:id` | 규칙 비활성화 |
| GET | `/api/v1/signals/events` | 발생 이력 (`ruleId`, `instrumentId`, `portfolioId`, `status`, `from`, `to`, `limit`, `offset`) |

규칙 생성 요청(예):

```json
{
  "instrumentId": "ins_...",
  "type": "PRICE_THRESHOLD",
  "threshold": 200000,
  "referenceType": "FIXED_PRICE",
  "cooldownSeconds": 3600,
  "isEnabled": true
}
```

`type` 값: `PRICE_DROP | PRICE_RISE | PRICE_THRESHOLD | PORTFOLIO_THRESHOLD`.
`referenceType` 값: `FIXED_PRICE | PREVIOUS_CLOSE | ROLLING_HIGH | ROLLING_WINDOW`.

발생 규칙: 조건이 false→true 로 전이하는 순간에만 발생하며, 쿨다운이 지나면
새 에피소드로 다시 발생할 수 있습니다. `(ruleId, deduplicationKey)` 유니크
제약으로 중복 저장을 방지합니다.

---

## 6. System

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/api/v1/system/health` | 시스템 상태 (인증 예외) |
| GET | `/api/v1/system/data-status` | 수집/데이터 최신성 상태 |
| GET | `/api/v1/system/providers` | 공급자 상태 목록 |
| POST | `/api/v1/system/collection/run` | 수동 수집 실행 (인증 필요) |

수동 수집 요청(예):

```json
{ "assetTypes": ["CRYPTO", "FX"], "instrumentIds": ["ins_..."] }
```

두 필드 모두 선택이며, 생략 시 활성 상품 전체를 수집합니다.

---

## 7. 데이터 상태 값

`dataStatus` / `status` 는 다음 중 하나입니다 (UI-006).

| 값 | 의미 |
| --- | --- |
| `NORMAL` | 정상 |
| `DELAYED` | 갱신 지연 |
| `STALE` | 데이터 노후 |
| `ERROR` | 수집 실패 |
| `NO_DATA` | 데이터 없음 |
| `UNAVAILABLE` | 평가 불가 (0으로 대체 금지) |
