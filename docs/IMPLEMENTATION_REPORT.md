# jFolio 구현 결과 보고서

작성일: 2026-10-19 (최초 2026-10-16)
대상: `SPEC.md` 기반 jFolio MVP + Phase 1 Local Login
결과: **실행 가능한 모노레포 MVP** — API, 대시보드, 데이터 수집, 평가, 시그널,
로컬 계정 인증, 테스트, 문서 포함. 아래 모든 수치는 실제 실행 결과입니다.

---

## 1. 요약

- 요구사항 원문(`SPEC.md`)을 기준으로 저장소 구조를 분석하고, 그린필드임을
  확인한 뒤 SPEC 권장 모노레포 구조로 구현했습니다.
- **금융 계산, 시그널 로직, 과거 데이터, API 계약, 공급자 URL/환율** 을 실제
  단위/통합 테스트로 검증했습니다.
- 외부 공급자 3종(Binance / Yahoo / Frankfurter)을 **실제 공개 API로 연동**하고,
  오프라인/결정적 테스트를 위해 **Mock 공급자**를 별도로 제공합니다.
- 라이브 환경에서 시드 → 수집 → 평가 → 대시보드까지 **end-to-end로 검증**했습니다.
- 검증 중 발견한 실제 버그(Frankfurter `providerSymbol` 규약 불일치)와 설계
  공백(USDT 표시 자산의 기준통화 환산)을 수정하고 회귀 테스트를 추가했습니다.
- **Phase 1 Local Login** 을 추가했습니다: 이메일/비밀번호(bcrypt), MongoDB
  서버 세션, 로그인/로그아웃/`/me` API, CSRF, 로그인 rate limit, 페이지/API
  접근 제어, 로그인 UI. Google SSO는 Phase 2용 구조만 준비했습니다.

### 최종 검증 상태

| 항목 | 결과 |
| --- | --- |
| `yarn test` | **148 tests / 14 files, 전부 통과** |
| `yarn typecheck` | 통과 (shared + api + web) |
| `yarn lint` | 통과 |
| `yarn build` | 통과 (API tsup, Web next build 19 routes + proxy) |
| 라이브 E2E | `/health`, `/api/v1/dashboard`, `/system/*` 실제 데이터 반환 |

---

## 2. 실행 방법 (재현 절차)

```bash
yarn install
yarn seed        # 상품 35종 + 데모 거래 9건 + 실데이터 1회 수집
CREATE_USER_PASSWORD='change-me-please' yarn create-user \
  --email you@example.com --name "Your Name"   # 로그인 계정 (최초 1회)
yarn dev         # API :3001, Web :3000 → http://localhost:3000/login
```

`AUTH_REQUIRED` 기본값은 `true` 입니다. 인증 없이 기존 로컬 동작을 유지하려면
`AUTH_REQUIRED=false` 로 설정합니다 (운영 금지). 계정 생성/로그인 절차와 전체
환경 변수는 [`README.md`](../README.md) 3~4장을 참고하세요.

검증:

```bash
yarn test && yarn typecheck && yarn lint
curl -s http://127.0.0.1:3001/health
curl -s http://127.0.0.1:3001/api/v1/dashboard | jq
```

---

## 3. 아키텍처

```
packages/shared  타입 · Zod 스키마 · 상수 · 포맷 유틸 (단일 출처)
apps/api         Express + MongoDB + 스케줄러 + CLI (수집/평가/시그널/API)
apps/web         Next.js 16 App Router 대시보드 (서버 사이드 API 프록시)
```

- **패키지 매니저**: Yarn 1.22 workspaces (PnP 미사용).
- **언어**: TypeScript strict (`noUncheckedIndexedAccess`, `noImplicitOverride`).
- **DB**: MongoDB native driver. `Repositories` 인터페이스에 대해 **memory /
  mongo** 두 구현을 제공하여 테스트가 네트워크/DB 없이 동작합니다.
- **공급자**: `MarketDataProvider` 인터페이스 + 레지스트리. 응답 정규화는
  서비스 경계 안에서만 수행됩니다.
- **웹**: 모든 조회/변경을 Next.js 서버에서 API로 프록시하여 CORS/토큰 노출을
  회피합니다.
- **인증**: Express 앱의 `/api/auth` 라우터 + `express-session` +
  `connect-mongo`. 사용자(`users`)와 인증 수단(`user_identities`)을 분리해
  Phase 2 Google identity를 같은 계정에 연결할 수 있습니다. Next.js는
  `/api/auth/*` 동일 출처 프록시로 `Set-Cookie`를 중계하고, 보호 페이지는
  proxy(빠른 리다이렉트) + `(app)` layout(권한 있는 검증)으로 이중
  보호합니다.

상세: [`DEVELOPMENT.md`](./DEVELOPMENT.md), [`DATA_MODEL.md`](./DATA_MODEL.md),
[`API.md`](./API.md).

---

## 4. 요구사항 커버리지

범례: ✅ 구현·테스트 완료 · ◐ 구현(부분) · ○ 설계/스텁

### 4.1 기능 요구사항 (FR)

| ID | 항목 | 상태 | 구현/근거 |
| --- | --- | --- | --- |
| FR-001 | 금융자산 등록/관리 | ✅ | `InstrumentService`, `/assets` CRUD + 등록/인라인 수정/비활성화 UI, `api.test.ts` |
| FR-002 | 종목 식별자 분리 | ✅ | `instrumentId` + `symbol/market/currency` + `providers[]` |
| FR-003 | 관심 종목 관리 | ✅ | `isWatchlist` 필드 + 목록 필터 + 자산 등록/수정 폼의 관심종목 토글 |
| FR-010 | 공급자 인터페이스 | ✅ | `providers/market-data.provider.ts` |
| FR-011 | 공급자 독립성 | ✅ | 레지스트리 + 정규화. `providers.test.ts` |
| FR-012 | 수집 주기 | ✅ | 자산군별 스케줄러(`scheduler/`) |
| FR-013 | 정합성 검증 | ✅ | `validateQuote` REJECT/FLAG + 급변 플래그 |
| FR-014 | 수집 상태 관리 | ✅ | `provider_states`, `collection_jobs`, `/system/*` |
| FR-020 | 시세 저장 | ✅ | `market_quotes`, `latest_quotes` |
| FR-021 | 시계열 보존 | ✅ | `getHistorical`, `/assets/:id/quotes` |
| FR-022 | 저장 전략 | ✅ | 최신 업서트 + 논리키 중복 제거. T-008 |
| FR-030 | 포트폴리오 생성 | ✅ | `PortfolioService`, `POST`/`PATCH /portfolios`, `/portfolios` 관리 화면 |
| FR-031 | 보유 현황 | ✅ | `PositionService` (원장에서 파생) |
| FR-032 | 거래 이력 | ✅ | `TransactionService`, `/transactions` (등록·수정·삭제) |
| FR-033 | 과거 현황 복원 | ✅ | `asOf` 평가, `historySeries`. H-001/H-002 |
| FR-034 | 거래 수정/삭제 재계산 | ✅ | `PATCH`/`DELETE` + 스냅샷 무효화, `/transactions` 행별 편집 UI. T-007 |
| FR-040 | 기준 통화 설정 | ✅ | `BASE_CURRENCY`, 포트폴리오별 `baseCurrency` |
| FR-041 | 개별 자산 평가 | ✅ | `ValuationService`. T-001 |
| FR-042 | 기준 통화 환산 | ✅ | `getFxRate` direct→inverse→peg. T-003 |
| FR-043 | 전체 자산 평가 | ✅ | `totalAssetValue` |
| FR-044 | 평가손익 | ✅ | 이동평균 원가법, 수수료 포함. T-002 |
| FR-045 | 수익률 | ✅ | `unrealizedReturn` |
| FR-046 | 기간별 투자 성과 | ◐ | 실현손익/배당/이자 **계산 엔진 구현**(`RealizedPnl`)이나 API/UI 미노출. TWR/MWR 미구현 |
| FR-050 | 자산 스냅샷 | ✅ | `SnapshotService` |
| FR-051 | 스냅샷 주기 | ✅ | 매시 정각 + 로컬 자정 + 온디맨드 |
| FR-052 | 스냅샷 멱등성 | ✅ | 유니크 키 + 업서트. H-003 |
| FR-053 | 과거 평가 조회 | ✅ | `asOf`/`history`. H-004 |
| FR-060 | 가격 변동 시그널 | ✅ | `SignalService`. T-101~T-103 |
| FR-061 | 기준 가격 정의 | ✅ | `FIXED_PRICE/PREVIOUS_CLOSE/ROLLING_*` |
| FR-062 | 시그널 설정 데이터 | ✅ | `signal_rules` + Zod 스키마 |
| FR-063 | 반복 알림 제어 | ✅ | 에피소드 전이 + 쿨다운. T-104/T-105 |
| FR-064 | 시그널 이벤트 저장 | ✅ | `signal_events`, 중복키 유니크 |

### 4.2 UI 요구사항

| ID | 화면 | 상태 |
| --- | --- | --- |
| UI-001 | 전체 자산 대시보드 (`/`) | ✅ |
| UI-002 | 보유 자산 목록 (`/portfolio`) | ✅ |
| UI-003 | 개별 자산 상세 (`/assets/[id]`) | ✅ |
| UI-004 | 과거 자산 현황 (`/history`) | ✅ |
| UI-005 | 시그널 관리 (`/signals`) | ✅ |
| UI-006 | 공통 상태 표시 | ✅ `StatusBadge`, `format.ts`, UNAVAILABLE≠0 |
| (추가) | 자산 마스터 관리 (`/assets`) | ✅ 자산 등록 폼 + 행별 인라인 수정·비활성화·복원, 검색/유형 필터 |
| (추가) | 포트폴리오 관리 (`/portfolios`) | ✅ 생성·이름/통화 수정·기본 지정, 대시보드/보유자산 포트폴리오 선택 |
| (추가) | 거래(자산 내역) 편집 (`/transactions`) | ✅ 행별 인라인 수정·삭제, 포트폴리오 필터, 보유자산/포트폴리오에서 바로가기 |
| (추가) | 좌측 메뉴 접기/펼치기 | ✅ 토글 시 사라지지 않고 **아이콘 레일**로 축소, 아이콘 hover 시 라벨 툴팁, 쿠키로 상태 유지 |

### 4.3 비기능 요구사항 (NFR)

| ID | 항목 | 상태 | 근거 |
| --- | --- | --- | --- |
| NFR-001 | 응답 시간 | ◐ | 인덱스/경량 쿼리 설계. 정식 벤치마크는 미실시 |
| NFR-002 | 장애 대응 | ✅ | 공급자 실패 격리, 상태 기록, UNAVAILABLE 처리 |
| NFR-003 | 사용자 데이터 보호 | ✅ | 로컬 계정 + 서버 세션, bcrypt 해시, CSRF, 로그인 rate limit, 세션/페이지/API 접근 제어 |
| NFR-004 | 금융 정밀도 | ✅ | `decimal.js` 기반 연산. T-004b |
| NFR-005 | 로그/운영 상태 | ✅ | `collection_jobs`, `provider_states`, health |
| NFR-006 | 테스트 환경 | ✅ | Mock 공급자 + 인메모리 리포지토리 |

### 4.4 테스트 요구사항 (SPEC 14)

| ID | 항목 | 위치 |
| --- | --- | --- |
| T-001~T-008 | 금융 계산 | `apps/api/test/financial.test.ts` |
| T-101~T-107 | 시그널 | `apps/api/test/signals.test.ts` |
| 14.3 과거 데이터 | 이력/스냅샷/시간대 | `apps/api/test/history.test.ts` (H-001~H-006) |
| TEST-001~TEST-012 | Phase 1 로그인/세션/CSRF/rate limit | `apps/api/test/auth.test.ts` |

### 4.5 Phase 1 Local Login (AUTH-001~AUTH-009)

| ID | 요구사항 | 상태 | 구현/근거 |
| --- | --- | --- | --- |
| AUTH-001 | 이메일/비밀번호 로그인 | ✅ | `POST /api/auth/login`, `LocalAuthProvider`, `LoginForm` |
| AUTH-002 | 안전한 비밀번호 저장 | ✅ | bcrypt(cost 12, 테스트 4), 평문/해시 비노출, TEST-004 |
| AUTH-003 | 서버 세션 + 안전한 쿠키 | ✅ | `connect-mongo`, HttpOnly/Secure/SameSite, `SESSION_MAX_AGE_MS`, TEST-005/011 |
| AUTH-004 | 사용자 열거/타이밍 완화 | ✅ | 동일한 401 응답 + 더미 bcrypt 비교, TEST-003/010 |
| AUTH-005 | 로그인 시 세션 재발급 | ✅ | `req.session.regenerate()` + save, TEST-006 |
| AUTH-006 | 관리자 계정 프로비저닝 | ✅ | `UserService` + `yarn create-user` CLI, HTTP signup 없음 |
| AUTH-007 | 로그아웃/세션 무효화 | ✅ | 서버 세션 destroy + 쿠키 삭제, TEST-007 |
| AUTH-008 | CSRF 보호 | ✅ | double-submit 쿠키(`jfolio.csrf`) + `x-csrf-token`, login/logout 강제, TEST-008 |
| AUTH-009 | 로그인 rate limit / 접근 제어 | ✅ | IP+email 제한(429), `/api/v1` 세션/토큰 게이트, TEST-001/009/012 |
| Phase 2 | Google SSO 확장 구조 | ○ | `AuthProviderId`, `user_identities`, provider 인터페이스/설정만 준비 (라우트 없음) |

---

## 5. 테스트 결과 (실제 실행)

```
packages/shared   Test Files 1 passed   Tests 11 passed
apps/api          Test Files 7 passed   Tests 99 passed
apps/web          Test Files 4 passed   Tests 23 passed
--------------------------------------------------------
합계              12 files              133 tests passed
```

API 테스트 파일별 구성:

| 파일 | 테스트 | 검증 내용 |
| --- | --- | --- |
| `financial.test.ts` | 10 | 평가금액/손익/환산/이동평균/분할수량 (T-001~T-008) |
| `signals.test.ts` | 8 | 임계/전이/쿨다운/비활성/잘못된 값 (T-101~T-107) |
| `history.test.ts` | 8 | `asOf` 거래, 과거 환율, 스냅샷 멱등/재계산 일치, 누락 구간 UNAVAILABLE, 시간대 경계 |
| `api.test.ts` | 38 | 인증, 검증(422), 자산 CRUD(부분 수정/409/404/복원) + 목록 `latestQuote`, 거래 수정/삭제, 포트폴리오 생성/수정, 대시보드, 오류 envelope, 최신 시세 갱신/역행 방지 |
| `providers.test.ts` | 13 | Frankfurter URL 구성/관용 처리, Yahoo 한국 종목 접미사 자동 해석(.KS/.KQ) 및 타입 검증 |
| `fx.test.ts` | 7 | 환율 direct/inverse/스테이블코인 페그 |
| `auth.test.ts` | 15 | TEST-001~012: 무세션 401, 로그인/`me`, 열거 방지, bcrypt 저장, 쿠키 속성, 세션 재발급, 로그아웃, CSRF, rate limit, 비활성 계정, 만료, API 토큰 호환 + 계정 프로비저닝/Google 비활성 |

웹 테스트 파일별 구성:

| 파일 | 테스트 | 검증 내용 |
| --- | --- | --- |
| `format.test.ts` | 11 | 통화/수량/날짜 포맷, UNAVAILABLE≠0, 로컬 datetime 변환 |
| `instrument.test.ts` | 4 | 공급자 링크 텍스트 파싱/직렬화 및 잘못된 형식 거부 |
| `nav.test.ts` | 5 | 사이드바 링크 모델/활성 경로 판정(`/portfolio` vs `/portfolios` 구분) |
| `sidebar.test.ts` | 3 | 사이드바 접힘 쿠키 이름/값 파싱 |

추가로 `yarn typecheck`, `yarn lint`, `yarn build` 모두 통과했습니다.

---

## 6. 실연동 vs Mock 구분

| 대상 | 구분 | 비고 |
| --- | --- | --- |
| Binance (`api.binance.com`) | **실연동** | BTCUSDT/ETHUSDT/SOLUSDT 실시세 수집 확인 |
| Yahoo Chart (`query1.finance.yahoo.com`) | **실연동** | AAPL/MSFT/NVDA/SPY/QQQ/005930.KS/000660.KS 실시세, 한국 종목 코드 자동 접미사 |
| Frankfurter (`api.frankfurter.dev`, ECB) | **실연동** | USD/KRW, EUR/KRW, JPY/KRW 실환율 저장 확인 |
| Mock 공급자 | 테스트 전용 | 결정적 합성 데이터, 네트워크 불필요 |

- 기본값 `*_PROVIDER=live` 로 실제 공개 API를 호출합니다.
- 테스트/CI는 `*_PROVIDER=mock` + 인메모리 리포지토리로 완전 결정적으로 동작합니다.
- 공급자 상태(성공/실패/마지막 오류)는 실제 값이 `provider_states` 에 기록됩니다.

---

## 7. 핵심 설계 가정 및 열린 결정

1. **원가 계산**: 이동평균 원가법. 매수 수수료는 취득원가에 포함, 매도 시 평균
   원가만큼 제거하고 실현손익에서 수수료 차감. (SPEC은 방식을 명시하지 않음)
2. **현금 모델**: 현금을 `assetType=CASH` 상품(가격 1)으로 모델링. 비현금 매매는
   현금을 자동 차감하지 않으며 입출금은 `DEPOSIT`/`WITHDRAWAL` 로 명시 관리.
3. **환율 부재**: 환산 불가 시 0원이 아니라 `UNAVAILABLE` 로 표시하고 합계에서
   제외 (UI-006, T-006).
4. **스테이블코인 페그 (신규)**: USDT 등은 fiat FX 공급자가 제공하지 않으므로
   USD에 1:1 페그로 간주해 `USDT → USD → KRW` 로 환산. `STABLECOIN_USD_PEGS`
   로 조정/비활성화 가능. 직접 저장된 환율이 있으면 항상 우선.
5. **시그널 발생**: false→true 전이 시에만 발생, 쿨다운 경과 후 재발생 가능.
   `PRICE_THRESHOLD` 는 관측가 ≤ 임계값일 때 충족.
6. **중복 방지 키**: 시세 `instrumentId+providerId+interval+timestamp`, 시그널
   이벤트 `ruleId+deduplicationKey`.
7. **스냅샷 경계**: 매시 정각(UTC hour) + `APP_TIMEZONE` 기준 로컬 자정.
8. **인증**: `API_AUTH_TOKEN` 설정 시에만 활성화, health는 예외.
9. **일별 변동**: 현재/24h 기준 평가금액 중 하나라도 UNAVAILABLE이면 `null`.
10. **자산 삭제 = 비활성화**: 거래·시세·스냅샷이 참조하는 자산은 물리 삭제하지
    않고 `isActive=false`로 비활성화하며 같은 행에서 복원할 수 있습니다. 자연키
    (`symbol`+`market`+`currency`)는 수정 시에도 유일성을 유지합니다.
11. **한국 종목 Yahoo 심볼 자동 해석 (신규)**: Yahoo는 국내 종목을 맨 코드로
    조회하지 못하므로(`000660` ✗ → `000660.KS` ✓), `Instrument.market`이
    `KRX`/`KOSPI`/`KOSDAQ`이고 코드가 6자리 숫자이면 공급자가 접미사를 자동으로
    붙입니다(`KRX`는 `.KS`·`.KQ` 둘 다 시도). 사용자가 접미사를 직접 지정하면 그
    값을 그대로 사용합니다. KRX는 KOSPI/KOSDAQ 구분이 없어, 파생 접미사 후보가
    돌려준 Yahoo `instrumentType`이 자산 유형과 맞지 않으면(예: KOSDAQ 코드의
    `.KS`가 `MUTUALFUND`로 해석됨) 다음 후보로 넘어가 잘못된 시세를 저장하지
    않습니다. 공급자별 심볼 규약은 공급자 경계 안에 머물러 FR-011을 지킵니다.
12. **인증 경계**: Phase 1 인증은 기존 Express API(`/api/auth`)에 두어 새
    서비스/프레임워크를 추가하지 않았습니다. 세션은 `express-session` +
    `connect-mongo` 로 MongoDB에 저장하고, 웹은 동일 출처 `/api/auth/*` 프록시로
    쿠키를 중계합니다. 브라우저는 세션 쿠키, Next.js 서버는 기존
    `API_AUTH_TOKEN` 을 서비스 자격 증명으로 사용하므로 `/api/v1` 의 기존
    서버 간 호출 계약을 깨지 않습니다.
13. **인증 수단 분리**: `users` 는 내부 계정/상태/역할만, `user_identities` 는
    provider(local/Google)별 외부 식별자를 가집니다. local identity의
    `providerUserId` 는 정규화된 이메일입니다. Phase 2 Google 로그인은 identity를
    조회/연결하는 provider만 추가하면 됩니다.
14. **CSRF**: 세션 쿠키 기반 변경 요청은 double-submit 방식(서버 세션의
    `csrfToken`, 읽기 가능한 `jfolio.csrf` 쿠키, `x-csrf-token` 헤더)으로
    검증합니다. 로그인/로그아웃도 강제하며, 서비스 토큰 요청은 ambient
    credential이 없으므로 CSRF 검사 대상에서 제외합니다.
15. **세션/쿠키 정책**: 로그인 시 세션 ID를 재발급하고(고정 공격 방지),
    로그아웃 시 서버 세션을 파괴합니다. 쿠키는 HttpOnly/Secure/SameSite/만료를
    적용하고, 운영에서는 `SESSION_STORE=memory` 와 32자 미만 `SESSION_SECRET` 을
    설정 검증 단계에서 거부합니다.
16. **계정 프로비저닝**: HTTP 회원가입을 만들지 않고 `create-user` CLI로만
    계정을 생성합니다. 비밀번호는 `CREATE_USER_PASSWORD` 또는 stdin으로 받아
    프로세스 목록/셸 히스토리 노출을 줄이고, bcrypt 해시만 저장합니다.
17. **로그인 방어**: IP + 정규화 이메일 기준 rate limit을 적용하고, 존재하지
    않는 이메일/잘못된 비밀번호/비활성 계정을 동일한 401로 응답하며 더미 bcrypt
    비교로 타이밍 차이를 줄입니다.

### 열린 결정 (후속)

- 실현손익·기간수익률(TWR/MWR) API/UI 노출 여부와 계산 방식.
- 멀티유저 데이터 격리 및 역할 기반 권한 검사 (현재 인증은 사용자 단위지만
  포트폴리오/거래는 `DEFAULT_USER_ID` 공유 데이터).
- BOND/COMMODITY 공급자 및 파생상품 모델링.
- 요율 제한 대응(백오프/캐시 정책)의 정식화.

---

## 8. 구현 중 발견·수정한 문제

1. **Frankfurter 규약 불일치 (실버그)**
   - 증상: 시드의 FX 상품 `providerSymbol: "USD/KRW"` 로 요청 시
     `base=USD/KRW` → HTTP 404, 환율 미저장.
   - 수정: `providerSymbol` 을 기준통화(`"USD"`)로 시드, 공급자는 전체 페어가
     들어와도 파싱하도록 방어. 회귀 테스트 2건 추가.
2. **USDT 자산 평가 불가 (설계 공백)**
   - 증상: BTCUSDT가 `NO_FX_RATE` 로 `UNAVAILABLE` → 대시보드 `dataStatus=UNAVAILABLE`.
   - 수정: 스테이블코인 USD 페그 도입 + 테스트 7건. 대시보드가 `NORMAL`,
     `unavailableCount=0` 으로 정상화.
3. **테스트 타입 오류**: `providers.test.ts` 의 `RequestInfo`(DOM 전용) 사용 →
   `string | URL` 로 교체하여 `yarn typecheck` 통과.
4. **한국 종목 Yahoo 조회 실패 (실버그)**
   - 증상: 신규 등록한 국내 종목(예: 하이닉스 `000660`)이 시장 데이터 조회에
     실패. Yahoo는 `000660.KS`로 조회해야 하는데 맨 코드 `000660`으로 요청.
   - 수정: 시장(`KRX`/`KOSPI`/`KOSDAQ`) + 6자리 코드 → Yahoo 접미사 자동 적용.
     `KRX`는 KOSPI/KOSDAQ을 알 수 없어 `.KS`·`.KQ`를 순서대로 시도하고, 파생
     후보의 `instrumentType`이 자산 유형과 다르면 건너뜁니다(예: KOSDAQ 코드
     `247540`의 `.KS`는 `MUTUALFUND` 194,000, `.KQ`는 `EQUITY` 106,900).
     `providers.test.ts`에 순수 함수 5건 + 공급자 5건 회귀 테스트 추가.
   - 라이브 검증: `000660`(KRX, 공급자 미지정) → 1,272,000 KRW,
     `247540`(KRX) → 106,900 KRW 정상 수집.
5. **자산별 최신 시세 테이블 미갱신 (실버그)**
   - 증상: 수집을 실행해도 `/market-data` 의 "자산별 최신 시세" 표와 `/assets` 목록의
     현재가가 계속 비어 있었음("데이터 없음").
   - 원인: 자산 **목록** API(`GET /assets`)가 `latestQuote` 를 포함하지 않았음
     (`getLatestMany` 가 구현만 되어 있고 미사용). 또 `latest_quotes` 는 시세가
     새로 insert 될 때만 갱신되어, 동일 시각의 중복 관측은 반영되지 않았고,
     Mongo 구현은 뒤늦게 들어온 더 오래된 시세로 최신값을 덮어쓸 수 있었음.
   - 수정: 목록 API가 `getLatestMany` 로 항목별 `latestQuote`(없으면 `null`)를
     채우도록 하고, `insertQuote` 가 **매 관측마다** 최신값을 갱신하되 저장된
     값보다 오래된 시세는 무시하도록 memory/mongo 두 구현을 일치시킴.
     `api.test.ts` 에 회귀 테스트 3건 추가.
   - 라이브 검증: 수집 실행 시 BTCUSDT/ETHUSDT 최신가 갱신, 휴장 중 종목도
     `receivedAt` 갱신(가격·시세 시각은 유지). 목록 응답에 8개 자산의 최신가 반환.
6. **사이드바 접힘 상태 미반영 (실버그)**
   - 증상: 토글 시 좌측 메뉴가 아이콘 레일로 축소되도록 구현했으나, 새로고침
     후 서버가 접힘 상태를 반영하지 않아 항상 펼쳐진 상태로 렌더링됨.
   - 원인: 접힘 여부를 저장하는 쿠키 이름 상수를 `"use client"` 모듈
     (`Sidebar.tsx`)에서 내보내고 서버 레이아웃(`layout.tsx`)에서 import 함.
     Next.js는 클라이언트 모듈의 export를 **클라이언트 참조**로 바꾸므로
     서버에서는 문자열이 아닌 프록시가 되어 쿠키 조회가 실패했음.
   - 수정: 상수와 파싱 함수를 클라이언트 지시문이 없는 공용 모듈
     (`lib/sidebar.ts`)로 옮겨 서버/클라이언트 양쪽에서 실제 문자열을 사용.
     `sidebar.test.ts` 회귀 테스트 3건 추가.
   - 검증: 쿠키 없음/`expanded` → `<aside class="sidebar">`,
     `collapsed` → `<aside class="sidebar collapsed">` 로 SSR 출력 확인.

---

## 9. 라이브 E2E 검증 기록

시드 후 수집·평가 결과(실제 관측값):

| 항목 | 값 |
| --- | --- |
| 총자산 (KRW) | 128,873,374.95 |
| 총원가 (KRW) | 104,322,804.9 |
| 미실현손익 (KRW) | 24,550,570.05 |
| 미실현수익률 | 23.5333% |
| `dataStatus` | NORMAL |
| `unavailableCount` | 0 |

보유 포지션(수집 시세 기준): KRW 현금, USD 현금(1,345.9 환산), BTCUSDT(0.15),
AAPL(30주), 005930(100주) — 위 수치는 초기 5건 데모 거래 기준 관측값입니다.
시드 확장 후에는 NVDA(20주), QQQ(10주), SOLUSDT(20), 000660(30주)가 추가되어
각 포지션에 가격·환율·평가금액·손익이 채워집니다.

---

## 10. 알려진 한계

- Phase 1 인증은 로컬 이메일/비밀번호 + 세션만 지원합니다. Google SSO,
  회원가입, 비밀번호 재설정, 이메일 인증은 없습니다.
- 로그인 사용자 개념은 도입되었지만 금융 데이터는 여전히 `DEFAULT_USER_ID`
  기준의 단일 공유 데이터이며, 사용자별 격리/역할 기반 권한 검사는 없습니다.
- 실현손익/배당/이자는 계산되지만 API·UI에 노출되지 않음 (FR-046 부분).
- NFR-001(응답 시간)은 정식 부하/지연 벤치마크를 수행하지 않음.
- BOND/COMMODITY는 타입만 정의, 기본 공급자 없음.
- 과거 구간에 시세가 없으면 해당 시점은 `UNAVAILABLE`/`NO_DATA` 로 표시(0 아님).

---

## 11. 산출물 목록

- 코드: `packages/shared`, `apps/api`, `apps/web`
- 테스트: 위 5장 (**133 tests / 12 files**)
- 문서: `README.md`, `docs/API.md`, `docs/DATA_MODEL.md`,
  `docs/DEVELOPMENT.md`, `docs/IMPLEMENTATION_REPORT.md`, `docs/SPEC.md`
- 운영: `yarn seed`, `yarn collect:once`, `yarn backfill:history`, `yarn backup`,
  `yarn restore`, `yarn create-user`, `node apps/api/dist/cli/create-user.js`,
  `node apps/api/dist/cli/backup.js`, `node apps/api/dist/cli/restore.js`,
  `/api/v1/system/*`

---

## 12. Phase 1 Local Login 변경 파일

### Shared

- `packages/shared/src/types/auth.ts` — 사용자/세션/로그인 응답 타입
- `packages/shared/src/schemas/auth.ts` — 이메일 정규화, 비밀번호/로그인/계정 생성 스키마
- `packages/shared/src/index.ts` — auth 타입/스키마 export

### API

- `apps/api/src/users/` — `user.types.ts`, `user.repository.ts`, `password.ts`, `user.service.ts`
- `apps/api/src/auth/` — `auth.types.ts`, `auth.service.ts`, `local-auth.provider.ts`,
  `auth.middleware.ts`, `session.ts`
- `apps/api/src/repositories/` — memory/Mongo 사용자·identity 저장소 및 container 연결
- `apps/api/src/db/collections.ts` — `users`, `user_identities`, `sessions` + 인덱스
- `apps/api/src/api/auth-routes.ts` — csrf/me/providers/login/logout
- `apps/api/src/api/app.ts` — 세션/인증/CSRF 미들웨어 및 라우터 마운트
- `apps/api/src/config/env.ts` — 인증/세션/rate limit/Google 예약 설정과 운영 검증
- `apps/api/src/cli/create-user.ts` — 관리자 계정 생성 CLI
- `apps/api/tsup.config.ts` — `create-user` 빌드 산출물 포함
- `apps/api/test/auth.test.ts` — TEST-001~012 및 프로비저닝 테스트

### Web

- `apps/web/src/lib/auth-config.ts` — 인증 플래그/쿠키 이름/인증 URL
- `apps/web/src/lib/server-auth.ts` — 페이지 세션 확인, mutation 가드, CSRF 검증
- `apps/web/src/lib/client-fetch.ts` — CSRF 쿠키/헤더 처리 `apiFetch`
- `apps/web/src/app/api/auth/[...path]/route.ts` — `/api/auth/*` 쿠키 중계 프록시
- `apps/web/src/proxy.ts` — 미인증 페이지 리다이렉트
- `apps/web/src/app/(app)/layout.tsx` — 보호 레이아웃(서버 세션 검증) + 사이드바 사용자
- `apps/web/src/app/login/page.tsx`, `apps/web/src/components/LoginForm.tsx` — 로그인 UI
- `apps/web/src/components/Sidebar.tsx` — 사용자 표시/로그아웃
- 기존 mutation route/component — `guardMutation`/`apiFetch` 적용

### 문서/환경

- `.env.example`, `deploy/production.app.env.example` — 인증/세션 환경 변수
- `README.md`, `docs/API.md`, `docs/DATA_MODEL.md`, `docs/IMPLEMENTATION_REPORT.md`

### 주요 환경 변수

`AUTH_REQUIRED`, `AUTH_LOCAL_ENABLED`, `AUTH_GOOGLE_ENABLED`, `SESSION_SECRET`,
`SESSION_STORE`, `SESSION_COOKIE_NAME`, `AUTH_CSRF_COOKIE_NAME`,
`SESSION_MAX_AGE_MS`, `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`,
`SESSION_TRUST_PROXY`, `AUTH_BCRYPT_ROUNDS`, `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS`,
`AUTH_LOGIN_RATE_LIMIT_MAX`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`(예약), `API_AUTH_TOKEN`(선택적 서비스 토큰).
