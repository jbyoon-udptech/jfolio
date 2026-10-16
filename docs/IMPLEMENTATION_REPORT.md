# jFolio 구현 결과 보고서

작성일: 2026-10-16
대상: `SPEC.md` 기반 jFolio MVP 구현
결과: **실행 가능한 모노레포 MVP** — API, 대시보드, 데이터 수집, 평가, 시그널,
테스트, 문서 포함. 아래 모든 수치는 실제 실행 결과입니다.

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

### 최종 검증 상태

| 항목 | 결과 |
| --- | --- |
| `yarn test` | **97 tests / 9 files, 전부 통과** |
| `yarn typecheck` | 통과 (shared + api + web) |
| `yarn lint` | 통과 |
| `yarn build` | 통과 (API tsup, Web next build 19 routes) |
| 라이브 E2E | `/health`, `/api/v1/dashboard`, `/system/*` 실제 데이터 반환 |

---

## 2. 실행 방법 (재현 절차)

```bash
yarn install
yarn seed        # 상품 9종 + 데모 거래 5건 + 실데이터 1회 수집
yarn dev         # API :3001, Web :3000
```

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
apps/web         Next.js 14 App Router 대시보드 (서버 사이드 API 프록시)
```

- **패키지 매니저**: Yarn 1.22 workspaces (PnP 미사용).
- **언어**: TypeScript strict (`noUncheckedIndexedAccess`, `noImplicitOverride`).
- **DB**: MongoDB native driver. `Repositories` 인터페이스에 대해 **memory /
  mongo** 두 구현을 제공하여 테스트가 네트워크/DB 없이 동작합니다.
- **공급자**: `MarketDataProvider` 인터페이스 + 레지스트리. 응답 정규화는
  서비스 경계 안에서만 수행됩니다.
- **웹**: 모든 조회/변경을 Next.js 서버에서 API로 프록시하여 CORS/토큰 노출을
  회피합니다.

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

### 4.3 비기능 요구사항 (NFR)

| ID | 항목 | 상태 | 근거 |
| --- | --- | --- | --- |
| NFR-001 | 응답 시간 | ◐ | 인덱스/경량 쿼리 설계. 정식 벤치마크는 미실시 |
| NFR-002 | 장애 대응 | ✅ | 공급자 실패 격리, 상태 기록, UNAVAILABLE 처리 |
| NFR-003 | 사용자 데이터 보호 | ✅ | 선택적 Bearer/`x-api-key` 인증 |
| NFR-004 | 금융 정밀도 | ✅ | `decimal.js` 기반 연산. T-004b |
| NFR-005 | 로그/운영 상태 | ✅ | `collection_jobs`, `provider_states`, health |
| NFR-006 | 테스트 환경 | ✅ | Mock 공급자 + 인메모리 리포지토리 |

### 4.4 테스트 요구사항 (SPEC 14)

| ID | 항목 | 위치 |
| --- | --- | --- |
| T-001~T-008 | 금융 계산 | `apps/api/test/financial.test.ts` |
| T-101~T-107 | 시그널 | `apps/api/test/signals.test.ts` |
| 14.3 과거 데이터 | 이력/스냅샷/시간대 | `apps/api/test/history.test.ts` (H-001~H-006) |

---

## 5. 테스트 결과 (실제 실행)

```
packages/shared   Test Files 1 passed   Tests 11 passed
apps/api          Test Files 6 passed   Tests 71 passed
apps/web          Test Files 2 passed   Tests 15 passed
--------------------------------------------------------
합계              9 files               97 tests passed
```

API 테스트 파일별 구성:

| 파일 | 테스트 | 검증 내용 |
| --- | --- | --- |
| `financial.test.ts` | 10 | 평가금액/손익/환산/이동평균/분할수량 (T-001~T-008) |
| `signals.test.ts` | 8 | 임계/전이/쿨다운/비활성/잘못된 값 (T-101~T-107) |
| `history.test.ts` | 8 | `asOf` 거래, 과거 환율, 스냅샷 멱등/재계산 일치, 누락 구간 UNAVAILABLE, 시간대 경계 |
| `api.test.ts` | 35 | 인증, 검증(422), 자산 CRUD(부분 수정/409/404/복원), 거래 수정/삭제, 포트폴리오 생성/수정, 대시보드, 오류 envelope |
| `providers.test.ts` | 3 | Frankfurter URL 구성/관용 처리 |
| `fx.test.ts` | 7 | 환율 direct/inverse/스테이블코인 페그 |

웹 테스트 파일별 구성:

| 파일 | 테스트 | 검증 내용 |
| --- | --- | --- |
| `format.test.ts` | 11 | 통화/수량/날짜 포맷, UNAVAILABLE≠0, 로컬 datetime 변환 |
| `instrument.test.ts` | 4 | 공급자 링크 텍스트 파싱/직렬화 및 잘못된 형식 거부 |

추가로 `yarn typecheck`, `yarn lint`, `yarn build` 모두 통과했습니다.

---

## 6. 실연동 vs Mock 구분

| 대상 | 구분 | 비고 |
| --- | --- | --- |
| Binance (`api.binance.com`) | **실연동** | BTCUSDT/ETHUSDT 실시세 수집 확인 |
| Yahoo Chart (`query1.finance.yahoo.com`) | **실연동** | AAPL/MSFT/SPY/005930.KS 실시세 |
| Frankfurter (`api.frankfurter.dev`, ECB) | **실연동** | USD/KRW 실환율 저장 확인 |
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

### 열린 결정 (후속)

- 실현손익·기간수익률(TWR/MWR) API/UI 노출 여부와 계산 방식.
- 멀티유저/권한 모델 (현재 `userId` 는 예약 필드).
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
AAPL(30주), 005930(100주). 각 포지션에 가격·환율·평가금액·손익이 채워졌습니다.

---

## 10. 알려진 한계

- 인증은 단일 공유 토큰 기반(사용자별 권한/멀티테넌시 없음).
- 실현손익/배당/이자는 계산되지만 API·UI에 노출되지 않음 (FR-046 부분).
- NFR-001(응답 시간)은 정식 부하/지연 벤치마크를 수행하지 않음.
- BOND/COMMODITY는 타입만 정의, 기본 공급자 없음.
- 과거 구간에 시세가 없으면 해당 시점은 `UNAVAILABLE`/`NO_DATA` 로 표시(0 아님).

---

## 11. 산출물 목록

- 코드: `packages/shared`, `apps/api`, `apps/web`
- 테스트: 위 5장 (97 tests)
- 문서: `README.md`, `docs/API.md`, `docs/DATA_MODEL.md`,
  `docs/DEVELOPMENT.md`, `docs/IMPLEMENTATION_REPORT.md`, `docs/SPEC.md`
- 운영: `yarn seed`, `yarn collect:once`, `/api/v1/system/*`
