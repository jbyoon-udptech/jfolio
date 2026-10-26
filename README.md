# jFolio

개인 금융자산 통합 관리 시스템 (Personal multi-asset portfolio manager).

jFolio collects market data for stocks, ETFs, crypto and FX rates, lets you
record portfolio transactions, computes valuations and P&L in a base currency,
evaluates price-based signal rules, and exposes everything through a REST API
and a Next.js dashboard.

> 이 문서는 실행/운영 관점의 안내서입니다. 요구사항 원문은
> [`docs/SPEC.md`](docs/SPEC.md), 구현 결과와 요구사항 매핑은
> [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md)를 참고하세요.

---

## 1. 아키텍처

Yarn 1 workspaces 기반 모노레포입니다.

```
jFolio/
├── packages/shared   # 도메인 타입, Zod 스키마, 상수, 포맷 유틸 (소스 전용)
├── apps/api          # Express + MongoDB 수집/평가/시그널 REST API
└── apps/web          # Next.js 16 대시보드 (서버 사이드에서 API 호출)
```

데이터 흐름:

```
외부 공급자(Binance / Yahoo / Frankfurter)
        │  MarketDataProvider 인터페이스
        ▼
CollectionService ──► market_quotes / latest_quotes / fx_rates
        │                       │
        │                       ▼
        │             ValuationService (기준통화 환산, 손익)
        │                       │
        ▼                       ▼
   SignalService ──► signal_events   DashboardService ──► GET /api/v1/dashboard
```

- **API** (`apps/api`): Express, MongoDB native driver, Zod 검증, 인메모리/몽고
  리포지토리 이중 구현, in-process 스케줄러.
- **Web** (`apps/web`): Next.js 16 App Router. 모든 데이터 조회/변경은 Next.js
  서버에서 API로 프록시하므로 API 토큰이 브라우저 번들에 노출되지 않습니다.
- **Shared** (`packages/shared`): API와 Web이 동일한 타입/검증 스키마를 공유합니다.

---

## 2. 요구 사항

- Node.js **>= 20.9** (개발/검증 환경: v22.23)
- Yarn **1.22** (classic)
- MongoDB **6+** (기본 `mongodb://localhost:27017/jFolio`)
- 외부 네트워크 접속 (실데이터 공급자 사용 시)

---

## 3. 빠른 시작

```bash
# 1) 의존성 설치
yarn install

# 2) (선택) 환경 변수 설정 — 없으면 기본값으로 동작
cp .env.example .env

# 3) MongoDB 실행 확인 (예: systemd)
sudo systemctl start mongod
mongosh --eval 'db.runCommand({ ping: 1 })'

# 4) 기준 데이터 + 데모 포트폴리오 시드 (실데이터 1회 수집 포함)
yarn seed

# 5) 로그인용 계정 생성 (최초 1회)
CREATE_USER_PASSWORD='change-me-please' yarn create-user \
  --email you@example.com --name "Your Name"

# 6) API + 웹 동시 실행
yarn dev
#   API  http://127.0.0.1:3001
#   Web  http://localhost:3000
```

웹(`http://localhost:3000`)에 접속하면 `/login` 으로 이동합니다. 위에서 만든
이메일/비밀번호로 로그인하면 대시보드로 들어가며, 사이드바 하단의 `로그아웃`
으로 세션을 종료할 수 있습니다. 비밀번호는 bcrypt 해시로만 저장되고 로그에
남지 않습니다.

`yarn seed` 는 35종의 기본 자산(국내주식 8 · 국내 ETF 4 · 미국주식 7 · 미국
ETF 5 · 코인 5 · FX 3 · 현금 3)과 데모 거래 9건을 생성합니다. 자산은
`(symbol, market, currency)` 기준으로 upsert 되어 반복 실행해도 안전하며,
데모 거래는 기본 포트폴리오가 비어 있을 때만 만들어집니다. 금·채권은 별도
자산군 대신 `GLD`/`TLT` ETF 로 포함됩니다.

API만 띄우려면 `yarn dev:api`, 웹만 띄우려면 `yarn dev:web` 을 사용합니다.

### 3.1 계정 생성 / 로그인 방식

- **회원가입·비밀번호 재설정·이메일 인증은 제공하지 않습니다.** 계정은
  관리자가 CLI로 생성합니다.
- 비밀번호는 환경 변수(`CREATE_USER_PASSWORD`) 또는 stdin으로만 전달합니다.
  인자로 넘기면 셸 히스토리에 남으므로 권장하지 않습니다.

```bash
# 환경 변수 사용
CREATE_USER_PASSWORD='...' yarn create-user --email you@example.com --name "You"

# stdin 사용 (셸 히스토리에 남지 않음)
printf '%s' '...' | yarn create-user --email you@example.com --name "You" --password-stdin

# 관리자 역할 지정 (기본 user)
CREATE_USER_PASSWORD='...' yarn create-user --email admin@example.com --name "Admin" --role admin
```

- 인증이 필요 없는 예전 로컬 모드로 되돌리려면 `AUTH_REQUIRED=false` 로
  설정합니다. 이 경우 페이지 보호와 브라우저 변경 요청의 세션 검사가
  생략됩니다(운영 환경에서는 사용하지 마세요).
- Google SSO는 **Phase 2** 예정이며 현재 구현되어 있지 않습니다. 사용자
  계정과 인증 수단(`user_identities`)이 분리되어 있어 Google identity를
  추가할 수 있는 구조만 준비되어 있습니다.

### 3.2 수동 수집 / 상태 확인

```bash
# 스케줄러와 무관하게 1회 수집
yarn collect:once

# 헬스체크 (인증 불필요)
curl -s http://127.0.0.1:3001/health

# 대시보드 (기본 포트폴리오 자동 생성)
curl -s http://127.0.0.1:3001/api/v1/dashboard
```

### 3.3 과거 시세/환율 백필

실시간 수집은 최신 시세만 저장하므로, 새 자산을 추가하면 대시보드의 과거
평가액이 `UNAVAILABLE`(빈 값)로 보일 수 있습니다. 아래 명령으로 일별
시세/환율 이력을 채웁니다.

```bash
# 모든 활성 자산: 각 자산의 첫 거래일 전날부터 (거래가 없으면 HISTORY_BACKFILL_DAYS)
yarn backfill:history

# 최근 30일만
yarn backfill:history --days 30

# 특정 기간 / 자산군 / 자산
yarn backfill:history --from 2025-01-01 --to 2026-10-26
yarn backfill:history --asset-type STOCK,ETF
yarn backfill:history --instrument ins_abc123 --from 2025-01-01
```

`POST /api/v1/assets` 로 새 자산을 만들면 동일한 백필이 **백그라운드**로
자동 실행됩니다. 자산 생성 응답은 공급자 지연을 기다리지 않으며, 백필
실패는 서버 로그에만 남고 생성은 성공합니다. 자동 백필을 끄려면
`HISTORY_BACKFILL_ENABLED=false` 로 설정하세요.

---

## 4. 환경 변수

`.env.example` 를 복사해 사용합니다. **비밀 값은 절대 소스에 하드코딩하지
마세요.** 모든 값은 환경 변수로만 주입됩니다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 실행 모드 |
| `APP_TIMEZONE` | `Asia/Seoul` | UI 표시/스냅샷 경계 계산 시간대 |
| `BASE_CURRENCY` | `KRW` | 기본 기준 통화 |
| `API_HOST` / `API_PORT` | `127.0.0.1` / `3001` | API 바인딩 |
| `API_BASE_PATH` | `/api/v1` | API 기본 경로 |
| `API_AUTH_TOKEN` | (빈 값) | 선택적 서비스 토큰. 설정 시 `/api/v1` 이 세션 **또는** Bearer / `x-api-key` 를 허용 |
| `AUTH_REQUIRED` | `true` | 보호 페이지/API에 로그인 필수. `false` 는 무인증 레거시 모드 |
| `AUTH_LOCAL_ENABLED` | `true` | 이메일/비밀번호 로그인 활성화 |
| `AUTH_GOOGLE_ENABLED` | `false` | Phase 2 예약 (현재 Google 라우트 없음) |
| `SESSION_SECRET` | 개발용 기본값 | 세션 서명 키. 운영에서는 **필수**, 32자 이상 |
| `SESSION_STORE` | `mongo` (test: `memory`) | 서버 세션 저장소. 운영에서 `memory` 금지 |
| `SESSION_COOKIE_NAME` | `jfolio.sid` | HttpOnly 세션 쿠키 이름 (웹과 동일해야 함) |
| `AUTH_CSRF_COOKIE_NAME` | `jfolio.csrf` | 읽기 가능한 double-submit CSRF 쿠키 이름 |
| `SESSION_MAX_AGE_MS` | `604800000` (7일) | 세션/쿠키 만료 |
| `SESSION_COOKIE_SECURE` | `auto` (운영 `true`) | Secure 쿠키 여부 |
| `SESSION_COOKIE_SAMESITE` | `lax` | `lax` / `strict` / `none` |
| `SESSION_TRUST_PROXY` | Secure와 동일 | Next.js 프록시의 `X-Forwarded-Proto` 신뢰 |
| `AUTH_BCRYPT_ROUNDS` | `12` | bcrypt cost (테스트는 4) |
| `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` | 로그인 시도 제한 창 (15분) |
| `AUTH_LOGIN_RATE_LIMIT_MAX` | `10` | 창당 로그인 시도 횟수 (IP + 이메일 기준) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | (빈 값) | Phase 2 예약 |
| `MONGODB_URI` | `mongodb://localhost:27017/jFolio` | MongoDB 연결 |
| `MONGODB_DB` | (URI에서 파생) | DB 이름 재정의 |
| `STOCK_COLLECTION_INTERVAL_SECONDS` | `60` | 주식/ETF 수집 주기 |
| `CRYPTO_COLLECTION_INTERVAL_SECONDS` | `10` | 크립토 수집 주기 |
| `FX_COLLECTION_INTERVAL_SECONDS` | `60` | 환율 수집 주기 |
| `STOCK_PROVIDER` / `CRYPTO_PROVIDER` / `FX_PROVIDER` | `live` | 자산군별 `live` 또는 `mock` |
| `COLLECTION_SCHEDULER_ENABLED` | `true` | API 기동 시 스케줄러 시작 |
| `HISTORY_BACKFILL_ENABLED` | `true` (test: `false`) | 새 자산 생성 시 과거 일별 시세/환율 백그라운드 백필 |
| `HISTORY_BACKFILL_DAYS` | `365` | 거래가 없는 자산의 기본 백필 기간(일) |
| `HOURLY_SNAPSHOT_ENABLED` / `DAILY_SNAPSHOT_ENABLED` | `true` | 스냅샷 생성 |
| `STABLECOIN_USD_PEGS` | `USDT,USDC,BUSD,DAI,TUSD,FDUSD` | USD 1:1 페그로 취급할 스테이블코인 |
| `API_BASE_URL` (web) | `http://127.0.0.1:3001/api/v1` | 웹이 호출할 API 주소 (`AUTH_URL` 파생 기준) |
| `API_AUTH_URL` (web) | `API_BASE_URL` 에서 파생 | 인증 API 주소 재정의 (기본 `.../api/auth`) |
| `NEXT_PUBLIC_TIME_ZONE` | `Asia/Seoul` | 웹 표시 시간대 |

---

## 5. 주요 스크립트 (루트)

| 스크립트 | 설명 |
| --- | --- |
| `yarn dev` | API + 웹 동시 개발 실행 |
| `yarn build` | shared 타입체크 + API(tsup) + 웹(next build) 빌드 |
| `yarn start:api` / `yarn start:web` | 빌드 산출물 실행 |
| `yarn test` | shared + api + web 전체 테스트 |
| `yarn typecheck` | 전체 워크스페이스 타입체크 |
| `yarn lint` | ESLint (`.ts`, `.tsx`) |
| `yarn seed` | 기준 상품/데모 포트폴리오 시드 + 1회 수집 |
| `yarn create-user` | 로그인 계정 생성 (관리자/CLI 전용) |
| `yarn collect:once` | 1회 수집 실행 |
| `yarn backfill:history` | 과거 일별 시세/환율 백필 (`--from`, `--to`, `--days`, `--asset-type`, `--instrument`) |

---

## 6. 데이터 공급자

| 자산군 | 공급자 | 엔드포인트 | 인증 |
| --- | --- | --- | --- |
| 주식 / ETF | Yahoo Chart | `query1.finance.yahoo.com/v8/finance/chart` | 불필요 |
| 크립토 | Binance | `api.binance.com/api/v3` | 불필요 |
| FX | Frankfurter (ECB) | `api.frankfurter.dev/v1` | 불필요 |
| (테스트/오프라인) | Mock | 결정적 합성 데이터 | — |

- 모든 공급자는 `MarketDataProvider` 인터페이스 뒤에 숨겨져 있으며,
  응답 형식은 서비스 경계를 넘지 않습니다.
- 자산군별로 `*_PROVIDER=mock` 을 주면 실네트워크 없이 결정적 데이터로
  동작합니다 (테스트에서 사용).
- 공급자 상태(성공/실패 횟수, 마지막 오류)는 `provider_states` 에 기록되어
  `/api/v1/system/providers` 로 노출됩니다.
- **한국 종목 코드 자동 해석**: 시장을 `KRX`/`KOSPI`/`KOSDAQ` 로 지정하고 6자리
  코드를 입력하면 Yahoo 접미사(`.KS`/`.KQ`)가 조회 시 자동으로 붙습니다
  (`000660` → `000660.KS`). `KRX` 는 KOSPI/KOSDAQ 을 알 수 없어 두 후보를
  순서대로 시도하며, 잘못된 보드로 해석되면(예: KOSDAQ 코드의 `.KS` 가
  `MUTUALFUND`) 자산 유형과 대조해 건너뜁니다. 접미사를 직접 지정하면 그 값이
  우선합니다.

---

## 7. 대시보드 화면

| 경로 | 내용 |
| --- | --- |
| `/` | 총자산, 손익, 자산군/통화 배분, 상위 보유, 최근 시그널 |
| `/portfolio` | 보유 자산 상세(평가금액/손익/상태), 현금 잔고 |
| `/history` | 기준통화 평가금액 시계열 |
| `/assets` | 자산 목록/검색/등록 + 최신 시세 + 행별 인라인 수정·비활성화·복원 |
| `/assets/[id]` | 자산 상세 + 시세 차트 |
| `/transactions` | 거래 내역 조회/등록/수정/삭제 (행별 인라인 편집) |
| `/portfolios` | 포트폴리오 생성/수정(이름·기준통화·기본 지정) |
| `/signals` | 시그널 규칙 생성/수정/비활성화, 발생 이력 |
| `/market-data` | 공급자 상태, 수집 작업 이력, 자산별 최신 시세, 수동 수집 트리거 |

대시보드(`/`)와 보유자산(`/portfolio`) 화면 상단에서 조회할 포트폴리오를 선택할 수
있습니다. 선택하지 않으면 기본 포트폴리오가 사용됩니다.

UI는 데이터 상태를 `정상 / 지연 / 오류 / 데이터없음 / 평가불가` 로 구분해
표시하며, **조회 불가 값을 0으로 표시하지 않습니다** (UI-006).

좌측 메뉴는 상단 토글 버튼으로 접고 펼칠 수 있습니다. 접을 때 메뉴가 사라지지
않고 **아이콘 레일**(약 68px)로 축소되며, 각 아이콘에 마우스를 올리면 이름이
툴팁으로 표시됩니다. 접힘 상태는 쿠키(`jfolio_sidebar`)에 저장되어 새로고침
후에도 유지되고, 서버가 같은 상태로 렌더링하므로 깜빡임이 없습니다.

---

## 8. 핵심 설계 가정

자세한 내용과 근거는 [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md)
7장을 참고하세요. 요약:

1. **원가법**: 이동평균 원가법 사용, 매수 수수료는 취득원가에 포함.
2. **현금 모델**: 현금을 `assetType=CASH` 상품으로 모델링(가격=1). 비현금
   매매는 현금을 자동 차감하지 않고 `DEPOSIT`/`WITHDRAWAL` 로 명시적으로
   관리합니다.
3. **환율 부재 시**: 기준통화 환산이 불가하면 0원이 아니라 `UNAVAILABLE` 로
   표시하고 합계에서 제외합니다.
4. **스테이블코인 페그**: USDT 등은 fiat FX 공급자가 제공하지 않으므로 USD에
   1:1 페그로 간주해 `USDT → USD → KRW` 로 환산합니다
   (`STABLECOIN_USD_PEGS` 로 조정 가능).
5. **중복 방지 키**: 시세 `instrumentId+providerId+interval+timestamp`,
   시그널 이벤트 `ruleId+deduplicationKey`.
6. **시그널 발생 규칙**: 조건이 false→true 로 바뀌는 순간에만 발생, 쿨다운
   경과 시 새 에피소드로 재발생.
7. **인증**: Phase 1은 이메일/비밀번호 + 서버 세션. 브라우저는 HttpOnly
   세션 쿠키(`jfolio.sid`)로 인증하고, `/api/v1` 은 세션 **또는** 선택적
   `API_AUTH_TOKEN`(서비스 자격 증명)을 허용합니다. 로그인 시 세션 ID를
   재발급하고, 로그아웃 시 서버 세션을 파괴하며, 세션 쿠키 변경 API는
   double-submit CSRF 토큰을 검증합니다. 로그인은 IP + 이메일 기준으로
   rate limit 되고, `/health` 와 `/api/v1/system/health` 는 인증 예외입니다.
8. **최신 시세(`latest_quotes`)**: 자산별 최신 시세는 별도 컬렉션에 물질화되어
   목록/상세 API가 함께 반환합니다. 수집 시 매 관측마다 갱신되며(동일 시각 중복도
   `receivedAt` 갱신), 저장된 최신값보다 오래된 시세가 뒤늦게 들어와도 최신값을
   덮어쓰지 않습니다.

---

## 9. 테스트

```bash
yarn test        # 전체
yarn test:api    # API 단위/통합 (supertest, 인메모리 리포지토리, mock 공급자)
yarn test:web    # 웹 포맷/상태 유틸
```

금융 계산(평가금액, 손익, 환산, 이동평균 원가), 시그널 발생 로직, 이력/스냅샷,
API 계약(인증/검증/CRUD), 공급자 URL 구성 등은 실제 단위 테스트로 검증됩니다.
현재 테스트 수와 결과는 `docs/IMPLEMENTATION_REPORT.md` 참고.

---

## 10. 알려진 한계

- Phase 1 인증은 로컬 계정/세션까지만 구현되어 있습니다. Google SSO, 회원가입,
  비밀번호 재설정, 이메일 인증은 없습니다.
- 인증된 사용자 개념은 도입되었지만 포트폴리오/거래 데이터는 여전히
  `DEFAULT_USER_ID` 기준의 단일 공유 데이터입니다. 사용자별 데이터 격리와
  역할 기반 권한 검사는 후속 작업입니다.
- 실데이터 공급자는 무료 공개 API에 의존하므로 요율 제한/일시 장애에 영향을
  받을 수 있습니다 (장애는 기록되고 `provider_states` 로 노출됨).
- BOND / COMMODITY 자산군은 타입/스키마만 정의되어 있고 기본 공급자가 없습니다.
- 스냅샷/이력 시계열은 저장된 시세를 재구성하며, 과거 구간 데이터가 없으면
  해당 시점은 `UNAVAILABLE`/`NO_DATA` 로 표시됩니다.

---

## 11. 문서

- [`docs/SPEC.md`](docs/SPEC.md) — 요구사항 원문
- [`docs/API.md`](docs/API.md) — REST API 레퍼런스
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — MongoDB 컬렉션/인덱스/관계
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — 개발/테스트/설계 노트
- [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md) — 구현 결과 보고서

---

## 12. 배포 (OCI)

개발자 Linux PC에서 **`./deploy.sh production` 한 번**으로 OCI 인스턴스에
릴리즈합니다. 개발 PC에서 빌드한 뒤 API 산출물(`apps/api/dist`)·웹 산출물
(`apps/web/.next`)·프로덕션 의존성만 묶어 `rsync` 로 전송하고, 서버의 PM2가
API/웹을 (재)기동합니다.

```
개발 PC: yarn build → .deploy/<target>/ (release) ──rsync──▶ OCI: <DEPLOY_PATH>
                                                              ├─ nginx: 80 → 443 (TLS) → 127.0.0.1:3000
                                                              ├─ PM2: jfolio-web(127.0.0.1:3000) + jfolio-api(127.0.0.1:3001)
                                                              └─ MongoDB(로컬 mongod)
```

### 12.1 서버 1회 준비 (OCI 인스턴스)

- Node.js **>= 20.9** 설치.
- MongoDB 6+ 설치/기동 (`mongod`). 배포 스크립트는 연결만 사용합니다.
- PM2는 배포 시 없으면 `npm install -g pm2` 로 자동 설치를 시도합니다
  (권한 문제 시 `sudo npm install -g pm2`).
- 부팅 시 자동 시작을 원하면 서버에서 1회:
  `pm2 startup` (안내되는 명령 실행) → `pm2 save`.
- nginx(80/443)를 앞단에 두고 Next.js는 `127.0.0.1:3000` 에만 바인딩합니다.
  API(3001)는 원래 loopback 전용이므로 열지 않습니다.
- OCI 보안 목록/방화벽에서 **80/443** 만 엽니다. 웹 포트(3000)는 nginx가
  프록시하는 내부 포트이므로 닫습니다.

#### TLS (nginx + Let's Encrypt)

운영 세션/CSRF 쿠키는 `Secure` 로 발급됩니다. 평문 HTTP로 접속하면 브라우저가
쿠키를 저장하지 않아 **로그인이 항상 `403 A valid CSRF token is required`**
로 실패합니다(Express 세션 쿠키도 HTTPS가 아니면 발급되지 않음). 따라서
운영은 반드시 HTTPS여야 합니다.

1. 도메인의 A 레코드를 인스턴스 공인 IP로 설정합니다.
2. `deploy/production.env` 에 값을 채웁니다.

   ```bash
   NGINX_DOMAIN=jfolio.example.com
   NGINX_ACME_EMAIL=you@example.com
   ```

3. 개발 PC에서 한 번 실행합니다(멱등 — 재실행해도 안전).

   ```bash
   ./deploy-nginx.sh production
   ```

   이 스크립트는 nginx/certbot 설치 → ACME webroot용 HTTP vhost →
   `certbot certonly --webroot` 인증서 발급 → HTTPS 리버스 프록시
   (`deploy/nginx/jfolio.conf.template`) 설치/리로드 → HTTPS 응답과
   `Secure` 쿠키 발급 검증까지 수행합니다. 인증서 갱신은 certbot의 systemd
   타이머가 처리하며 `--deploy-hook` 으로 nginx를 리로드합니다.

4. `./deploy.sh production --skip-build` 로 재배포해 Next.js를 loopback에
   바인딩한 뒤 `https://<도메인>` 으로 접속합니다.


### 12.2 개발 PC 준비

`node`, `yarn`, `rsync`, `ssh`, `scp` 필요. OCI 접속용 SSH 키를 준비합니다.

```bash
cp deploy/production.env.example deploy/production.env          # 접속 정보
cp deploy/production.app.env.example deploy/production.app.env  # 런타임 환경
# 두 파일을 실제 값으로 수정 (둘 다 .gitignore 대상, 커밋되지 않음)
```

`deploy/production.env`:

| 변수 | 설명 |
| --- | --- |
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_PORT` | OCI 접속 정보 |
| `DEPLOY_SSH_KEY` | 개인키 경로 (`~` 확장) |
| `DEPLOY_PATH` | 서버 릴리즈 디렉터리 (없으면 생성) |
| `DEPLOY_APP_ENV_FILE` | 업로드할 앱 환경 파일 (기본 `deploy/<target>.app.env`) |
| `DEPLOY_API_PORT` / `DEPLOY_WEB_PORT` | 배포 후 헬스체크 포트 (nginx가 `DEPLOY_WEB_PORT` 로 프록시) |
| `NGINX_DOMAIN` | TLS 인증서를 발급할 공인 FQDN (`./deploy-nginx.sh`) |
| `NGINX_ACME_EMAIL` | Let's Encrypt 연락 이메일 |
| `NEXT_PUBLIC_*` | 빌드 시 인라인되는 값 (예: `NEXT_PUBLIC_TIME_ZONE`) |

`deploy/production.app.env` 는 서버의 `<DEPLOY_PATH>/.env` 로 업로드되어 PM2가
두 프로세스에 주입합니다. 운영에서는 다음을 반드시 설정하세요.

- `SESSION_SECRET`: 32자 이상의 랜덤 값 (`openssl rand -hex 32`). 미설정/짧으면
  API가 기동하지 않습니다.
- `SESSION_STORE=mongo`: 운영에서 `memory` 는 거부됩니다.
- `API_AUTH_TOKEN`: 긴 랜덤 값. Next.js 서버가 API를 호출할 때 사용하므로
  `API_BASE_URL` 과 함께 관리합니다. 브라우저 로그인은 이 토큰이 아니라 세션
  쿠키를 사용합니다.
- HTTPS 종료 지점에 맞춰 `SESSION_COOKIE_SECURE` / `SESSION_TRUST_PROXY` 를
  설정합니다. nginx가 `X-Forwarded-Proto: https` 를 넘기므로 둘 다 `true` 가
  기본값이며, 이 조합이 아니면 로그인이 CSRF 오류로 실패합니다.

서버에 계정이 없으면 배포 후 관리자 계정을 한 번 생성합니다. `SESSION_SECRET`
등은 서버의 `<DEPLOY_PATH>/.env` 에서 로드됩니다.

```bash
# 서버에서
cd <DEPLOY_PATH>
CREATE_USER_PASSWORD='...' node apps/api/dist/cli/create-user.js \
  --email you@example.com --name "You"
```

`yarn create-user` 는 개발 환경용이며, 빌드 산출물을 사용하는 운영 서버에서는
위와 같이 `dist/cli/create-user.js` 를 직접 실행합니다.

### 12.3 배포

```bash
./deploy.sh production                 # 빌드 → 패키징 → 전송 → PM2 재기동 → 헬스체크
./deploy.sh production --skip-build    # 기존 빌드 산출물 재사용 (빠른 재배포)
./deploy.sh production --skip-restart  # 파일만 동기화, 프로세스는 재시작 안 함
./deploy.sh production --seed          # 전송 후 서버 DB에 기준 상품/데모 시드 실행
./deploy.sh --help
```

`--seed` 는 `apps/api/dist/cli/seed.js`(빌드 산출물)를 서버에서 `node` 로 실행해
서버 MongoDB(`<DEPLOY_PATH>/.env` 의 `MONGODB_URI`)에 기본 자산 목록을
upsert 합니다. 멱등이며, 데모 거래는 기본 포트폴리오가 비어 있을 때만
생성됩니다. `--skip-build` 와 함께 쓸 때는 미리 `yarn build` 로 `dist/cli/seed.js`
를 만들어 두어야 합니다.

배포 스크립트는 `yarn install --frozen-lockfile` → `yarn build` 로 로컬 빌드 후,
`.deploy/<target>/` 에 릴리즈를 조립하고(프로덕션 의존성만 `yarn install
--production`), `rsync -az --delete` 로 전송합니다. 서버의 `.env` 는 보존되며
업로드 파일로 교체됩니다.

### 12.4 운영

```bash
# 서버에서
pm2 status
pm2 logs jfolio-api          # API 로그
pm2 logs jfolio-web          # 웹 로그
pm2 restart jfolio-api
```

문제 발생 시: API 기동 실패는 MongoDB 연결(`MONGODB_URI`), `SESSION_SECRET`
(32자 이상), `SESSION_STORE=mongo` 와 `pm2 logs jfolio-api` 를 확인하세요. 웹
데이터 미표시는 `API_BASE_URL`/`API_AUTH_TOKEN` 일치 여부를 확인합니다.

로그인 직후 `/login` 으로 되돌아가거나 `403 A valid CSRF token is required`
가 뜨면 거의 항상 **HTTPS가 아닌 접속**이 원인입니다. 운영 쿠키는 `Secure`
라서 평문 HTTP에서는 브라우저가 저장하지 않고, Express도 HTTPS가 아닌
요청에는 세션 쿠키를 내려주지 않습니다. 확인 순서:

```bash
# 서버에서 쿠키 속성 확인 — Secure 가 보이고 sid 도 함께 내려와야 정상
curl -sD - -o /dev/null http://127.0.0.1:3000/api/auth/csrf | grep -i set-cookie
```

- `Secure` 가 없고 `sid` 만 없다면 → `SESSION_COOKIE_SECURE`/`SESSION_TRUST_PROXY`
- `Secure` 가 있는데 HTTP로 접속 중이라면 → `./deploy-nginx.sh <target>` 로
  TLS를 구성하고 `https://` 로 접속(HTTPS 환경의 쿠키 이름
  `SESSION_COOKIE_NAME`/`AUTH_CSRF_COOKIE_NAME` 도 웹과 일치해야 함)

### 12.4 data backup & restore

```bash
server $ ssh ubunut@jbnix.retailtrend.net
server $ mongoexport  --db=jFolio --collection=instruments --out=instruments.json
# copy to local
local $ mongoimport  --db=jFolio --collection=instruments --file=instruments.json
```
