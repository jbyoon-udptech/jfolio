# jFolio 개발 가이드

## 1. 저장소 구조

```
jFolio/
├── packages/shared/
│   ├── src/
│   │   ├── constants/domain.ts   # 열거형/상수 (단일 출처)
│   │   ├── types/                # 도메인 타입
│   │   ├── schemas/              # Zod 요청/쿼리 스키마
│   │   ├── utils/format.ts       # 표시 포맷 유틸
│   │   └── index.ts
│   └── test/schemas.test.ts
├── apps/api/
│   ├── src/
│   │   ├── config/               # env 로딩/검증
│   │   ├── db/                   # Mongo 연결 + 컬렉션/인덱스
│   │   ├── domain/               # ids, money(decimal), intervals, position 계산
│   │   ├── providers/            # 공급자 인터페이스 + binance/yahoo/frankfurter/mock
│   │   ├── repositories/         # types + memory + mongo 구현
│   │   ├── services/             # 비즈니스 로직
│   │   ├── api/                  # express app, routes, auth, validate, middleware
│   │   ├── scheduler/            # 주기 수집 + 스냅샷
│   │   ├── cli/                  # seed, collect-once, backfill, backup, restore, create-user
│   │   ├── container.ts          # 의존성 조립
│   │   └── index.ts              # 진입점
│   └── test/                     # vitest + supertest
└── apps/web/
    ├── src/app/                  # Next.js App Router 페이지 + API 라우트 핸들러
    ├── src/components/           # 프레젠테이션 컴포넌트
    ├── src/lib/                  # api 클라이언트, format, status, types
    └── test/
```

## 2. 의존성 설치 및 실행

```bash
yarn install          # 루트에서 1회
yarn dev              # API(3001) + Web(3000)
yarn dev:api          # tsx watch
yarn dev:web          # next dev
```

MongoDB가 필요합니다. 기본 연결은 `mongodb://localhost:27017/jFolio` 입니다.

## 3. 코드 스타일

- TypeScript strict + `noUncheckedIndexedAccess` + `noImplicitOverride`.
- `target/lib ES2022`, `module ESNext`, `moduleResolution Bundler`.
- ESLint 8 (typescript-eslint). `dist`, `.next`, `coverage`, `*.config.*` 제외.
- 웹 빌드는 `eslint.ignoreDuringBuilds: true` 이므로 **lint의 기준은 루트
  `yarn lint`** 입니다.

```bash
yarn lint
yarn typecheck
```

## 4. 테스트 전략

프레임워크: **Vitest**. API 통합 테스트는 **supertest** + 인메모리 리포지토리 +
**mock 공급자**로 네트워크 없이 결정적으로 동작합니다.

```bash
yarn test          # 전체 (shared + api + web)
yarn test:api
yarn test:web
yarn workspace @jfolio/api test:watch
```

### 테스트 헬퍼 (`apps/api/test/helpers.ts`)

```ts
const FIXED_NOW = new Date("2026-10-16T12:00:00.000Z");

// 인메모리 리포지토리 + mock 공급자 + 고정 시계
const { container, repos } = createTestContext(FIXED_NOW, { API_AUTH_TOKEN: "s3cret" });

// 서비스를 통한 상품/포트폴리오 생성 (검증/자연키 적용)
const instrument = await createInstrument(container, { symbol: "AAPL", ... });
const portfolio = await createPortfolio(container, "KRW");
```

- 모든 외부 I/O는 인메모리 또는 mock 으로 대체합니다.
- 금융 계산은 `apps/api/test/financial.test.ts` 에 명시적 수치 기대값으로 검증합니다.
- 시그널 발생 로직은 `apps/api/test/signals.test.ts`.
- 이력/스냅샷은 `apps/api/test/history.test.ts`.
- DB 논리 백업/복원은 `apps/api/test/backup.test.ts`, `restore.test.ts`
  (인메모리 Mongo 스텁 + 임시 디렉터리).
- API 계약(인증/검증/CRUD/대시보드)은 `apps/api/test/api.test.ts`.
- Phase 1 로그인/세션/CSRF/rate limit은 `apps/api/test/auth.test.ts` (TEST-001~012).
- 공급자 URL 구성/페그는 `apps/api/test/providers.test.ts`, `fx.test.ts`.
- 웹 표시 포맷/상태는 `apps/web/test/format.test.ts`.

### supertest 예

```ts
const app = createApp(container);
const res = await request(app).get("/api/v1/dashboard");
expect(res.status).toBe(200);
```

## 5. 빌드

```bash
yarn build
```

- `packages/shared` 는 소스 전용(`main`/`types` = `src/index.ts`)이므로 API는
  tsup `noExternal: ["@jfolio/shared"]` 로 번들에 포함하고, 웹은
  `transpilePackages` 로 소스를 직접 컴파일합니다.
- API 산출물: `apps/api/dist`, 웹: `apps/web/.next`.

## 6. 스케줄러 동작

- 자산군별 주기: 주식/ETF·FX 60초, 크립토 10초 (`*_COLLECTION_INTERVAL_SECONDS`).
- 스냅샷: 매시 정각(UTC hour 경계) + 로컬 자정(`APP_TIMEZONE` 기준 일 경계).
- 자기 재예약 `setTimeout` + `unref()` 로 이벤트 루프를 붙잡지 않습니다.
- 실행 중복 방지(overlap guard) 적용.
- `COLLECTION_SCHEDULER_ENABLED=false` 로 비활성화할 수 있습니다(테스트/CI).

## 7. 새 공급자 추가하기

1. `MarketDataProvider` (`providers/market-data.provider.ts`)를 구현합니다.
   `providerId`, `displayName`, `assetTypes`, `capabilities`,
   `getLatestQuote`, `getHistoricalQuotes`.
2. 응답을 `MarketQuote` 로 정규화합니다. `timestamp`(가격 기준)와
   `receivedAt`(저장 시각)을 구분하세요.
3. `providers/registry.ts` 에 등록하고 자산군 모드 매핑을 추가합니다.
4. `providerId` 별 단위 테스트를 추가합니다(네트워크는 주입된 `fetchImpl` 로 대체).
5. API 키가 필요하면 **반드시 환경 변수**로만 읽습니다.

## 8. 새 엔드포인트 추가하기

1. `packages/shared/src/schemas` 에 요청/쿼리 Zod 스키마를 추가합니다.
2. 라우터(`apps/api/src/api/routes/*`)에서 `parseBody`/`parseQuery` 로 검증합니다.
3. 비즈니스 로직은 `services/` 에 두고 `container.ts` 로 조립합니다.
4. `apps/api/test/api.test.ts` 에 supertest 케이스를 추가합니다.
5. 웹에서 필요하면 `apps/web/src/lib/api.ts` 에 메서드와 타입을 추가합니다.

## 9. 디자인 노트

- **금융 정밀도**: `decimal.js` 기반 `domain/money.ts` 의 `add/subtract/multiply/
  divide/round` 를 사용하고 JS 부동소수점 연산을 직접 하지 않습니다.
- **환율 부재**: `getFxRate` 는 direct → inverse → 스테이블코인 페그 순으로
  시도하고, 실패 시 `null` 을 반환합니다(0 아님).
- **평가 상태**: `UNAVAILABLE` 포지션은 합계에서 제외되며, `dailyChange` 도
  기준 평가금액이 불가하면 `null` 입니다.
- **웹 변경 요청**: 클라이언트는 동일 출처 Next 라우트 핸들러로 POST 하고,
  핸들러가 서버 사이드에서 API를 호출합니다(CORS/토큰 노출 회피).
- **인증/세션**: 브라우저는 API가 발급한 HttpOnly 세션 쿠키를 사용하고,
  Next.js의 `/api/auth/*` 프록시가 `Set-Cookie`를 중계합니다. 변경 요청은
  `apiFetch`가 `jfolio.csrf` 쿠키를 `x-csrf-token` 헤더로 보내고, Next 라우트의
  `guardMutation`과 API의 `requireCsrf`가 각각 검증합니다. 테스트는
  `AUTH_REQUIRED=false`(레거시 계약 테스트) 또는 auth fixture
  (`AUTH_REQUIRED=true`, `SESSION_STORE=memory`, `AUTH_BCRYPT_ROUNDS=4`)를
  사용합니다.

자세한 설계 가정과 열린 결정은
[`IMPLEMENTATION_REPORT.md`](./IMPLEMENTATION_REPORT.md) 를 참고하세요.

## 10. 트러블슈팅

| 증상 | 확인 |
| --- | --- |
| API 기동 실패 | MongoDB 실행 여부, `MONGODB_URI` |
| 대시보드가 `UNAVAILABLE` | 해당 자산 시세/환율 수집 여부, `/api/v1/system/providers` |
| 시세가 안 들어옴 | 외부 네트워크/요율 제한, `provider_states.lastError` |
| 웹에서 데이터 안 보임 | `API_BASE_URL`, `API_AUTH_TOKEN` 일치 여부 |
| 로그인 후 다시 `/login` 으로 감 | `SESSION_SECRET`, 쿠키 이름(`SESSION_COOKIE_NAME`/`AUTH_CSRF_COOKIE_NAME`) 일치, HTTPS에서 `SESSION_COOKIE_SECURE`/`SESSION_TRUST_PROXY` 확인 |
| `401`/`403` (변경 요청) | 로그인 세션 존재 여부, `jfolio.csrf` 쿠키와 `x-csrf-token` 헤더 일치 여부 |
| 로그인 시 `403 A valid CSRF token is required` | HTTPS 접속 여부. 운영 쿠키는 `Secure` 라서 평문 HTTP에서는 저장되지 않고 세션 쿠키도 발급되지 않음 → `./deploy-nginx.sh <target>` |
| API 기동 시 세션 설정 오류 | `SESSION_SECRET` 32자 이상, 운영에서 `SESSION_STORE=mongo` |
| 테스트가 실패 | `FIXED_NOW` 기준 시각 사용, mock 공급자 여부 |
