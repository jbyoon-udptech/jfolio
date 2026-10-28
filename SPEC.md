# jFolio — 제품 요구사항 및 기술 구현 명세서 (SPEC)

문서 목적: AI Agent가 본 문서를 기반으로 jFolio의 설계, 구현, 테스트 및 실행까지 수행할 수 있도록 제품 요구사항과 기술 사양을 정의한다.

프로젝트명: jFolio
문서 유형: Product Requirements Document (PRD) + Software Requirements Specification (SRS)
대상 구현 환경: AI Coding Agent, Node.js, TypeScript, Next.js
문서 버전: 1.1
기준일: 2026-10-28

1. 프로젝트 개요

1.1. 프로젝트 목적

jFolio는 주식, 가상자산, 외환 등 다양한 금융자산의 시장 데이터를 수집하고, 개인이 보유한 자산 정보를 결합하여 전체 자산 현황과 투자 성과를 통합적으로 조회할 수 있는 웹 애플리케이션이다.

단순한 현재 시세 조회 서비스를 넘어, 과거 자산 현황의 복원, 시계열 데이터 분석, 투자 위험 감지 및 사용자 정의 알림을 지원하는 개인 금융자산 관리 시스템을 구축한다.
1.2. 핵심 목표

    다양한 금융시장 데이터 수집
        국내 및 해외 주식
        가상자산
        외환 및 환율
        향후 채권, ETF, 원자재 등으로 확장 가능한 구조

    자체 데이터베이스 구축
        외부에서 수집한 시장 데이터를 자체 DB에 저장한다.
        현재 가격뿐 아니라 과거 가격도 조회할 수 있어야 한다.
        데이터 수집 시각과 실제 시장 데이터 시각을 구분한다.

    개인 자산 포트폴리오 관리
        사용자가 보유한 자산과 수량을 관리한다.
        자산의 매수, 매도, 입출금, 수량 변경 등을 거래 이력으로 기록한다.
        과거 특정 시점의 자산 구성과 평가금액을 재구성할 수 있어야 한다.

    자산 현황 시각화
        전체 자산 평가금액
        자산별 평가금액과 수익률
        주식, 가상자산 등 자산군별 비중
        통화별 자산 비중
        일별·시간별 자산 평가금액 변화
        기간별 투자 성과

    투자 시그널 및 알림
        특정 자산 가격이 기준 가격보다 5% 이상 하락하면 알림을 발생시킨다.
        사용자가 원하는 가격, 변동률 및 조건으로 알림을 설정할 수 있다.
        시그널 발생 시각, 발생 조건, 실제 관측값 및 처리 상태를 기록한다.

    확장 가능한 시스템 아키텍처
        시장 데이터 수집과 웹 UI를 분리한다.
        새로운 데이터 공급자와 자산 유형을 쉽게 추가할 수 있도록 설계한다.
        데이터 수집 주기, 시그널 규칙 및 포트폴리오 계산을 독립적인 모듈로 구성한다.

1.3. 설계 원칙

다음 원칙은 모든 구현 단계에서 준수해야 한다.

    데이터 우선: 화면보다 데이터의 정확성, 일관성 및 이력 보존을 우선한다.
    시간 기준 명확화: 시장 데이터의 기준 시각과 DB 저장 시각을 구분한다.
    원본 보존: 원본 거래 이력을 유지하고, 자산 현황은 이력으로부터 재구성할 수 있게 한다.
    중복 방지: 동일한 외부 데이터가 반복 수집되어도 중복 저장이나 중복 거래 처리가 발생하지 않게 한다.
    통화 구분: 자산의 거래 통화와 사용자 기준 통화를 명확하게 구분한다.
    실시간성의 현실적 정의: 실시간 데이터 제공 여부와 갱신 주기는 데이터 공급자의 계약 및 API 제한에 따른다.
    확장성: 특정 거래소, 증권사 또는 데이터 공급자에 종속되지 않도록 인터페이스를 분리한다.
    점진적 구현: 핵심 기능부터 구현하고, 실제 동작을 검증한 후 기능을 확장한다.

1.4. 용어 정의
용어 정의
Asset 주식, ETF, 가상자산, 외환 등 금융자산
Instrument 시장에서 거래되는 개별 상품. 예: 삼성전자 주식, BTC/USDT
Market Data 자산 가격, 거래량, 환율 등 시장 데이터
Portfolio 특정 사용자가 보유한 금융자산의 집합
Position 특정 자산에 대한 보유 수량 및 평가 정보
Transaction 매수, 매도, 입금, 출금 등 자산 변동을 발생시키는 거래 기록
Snapshot 특정 시점의 포트폴리오 또는 시장 데이터 상태
Base Currency 전체 자산 평가에 사용하는 기준 통화. 기본값 KRW
Signal 사전에 정의한 조건을 충족했을 때 발생하는 이벤트
Provider 시장 데이터를 제공하는 외부 서비스
As-of Time 시장 데이터가 실제로 기준으로 삼는 시각

2. 기술 스택 및 시스템 구성

2.1. 기술 스택

사용자가 지정한 기술 스택을 기본으로 하며, 세부 라이브러리는 프로젝트 초기 구현 시 확정한다.
영역 기술 용도
Backend Runtime Node.js 서버 및 데이터 수집 실행 환경
Backend Language TypeScript 타입 안전성 확보
Frontend Framework Next.js 웹 UI 및 서버 측 기능
Frontend Language TypeScript 프론트엔드 구현
API REST API 프론트엔드와 백엔드 간 통신
Database MongoDB 권장 시장 데이터, 거래 이력, 포트폴리오 저장
Validation Zod 또는 동등한 라이브러리 API 요청 및 설정 검증
Testing 프로젝트 기존 테스트 프레임워크 우선 단위 및 통합 테스트
Package Manager 기존 저장소 설정 우선 의존성 및 빌드 관리

MongoDB는 사용자의 기존 Node.js·TypeScript 개발 환경과도 잘 맞는 선택이다. 다만 데이터베이스가 아직 확정되지 않았다면, 구현 전에 저장소의 기존 기술 구성을 확인하고 최종 결정한다.

중요: 위 표에서 MongoDB와 라이브러리 선택은 권장안이다. 기존 프로젝트에 이미 적용된 기술이 있다면, 특별한 문제가 없는 한 기존 구성을 우선한다.
2.2. 논리적 아키텍처

시스템은 다음과 같이 구성한다.
    ┌─────────────────────────┐
    │      Next.js Web        │
    │                         │
    │ 대시보드 / 보유 자산     │
    │ 과거 자산 / 거래 내역    │
    │ 자산 목록 / 시그널       │
    │ 시장 데이터 / 포트폴리오 │
    └────────────┬────────────┘
                 │
            REST API
                 │
    ┌────────────▼────────────┐
    │      Backend API        │
    │                         │
    │ Portfolio Service        │
    │ Market Data Query        │
    │ Transaction Service      │
    │ Signal Service           │
    │ Snapshot Service         │
    └────────────┬────────────┘
                 │
    ┌────────────▼────────────┐
    │        Database         │
    │                         │
    │ Instruments / Quotes    │
    │ FX Rates / Transactions │
    │ Portfolio / Snapshots   │
    │ Signals / System State  │
    └────────────▲────────────┘
                 │
    ┌────────────┴────────────┐
    │    Data Collection      │
    │                         │
    │ Stock Providers          │
    │ Crypto Providers         │
    │ FX Providers             │
    │ Scheduler / Workers      │
    └─────────────────────────┘

2.3. Backend와 Frontend의 분리

Backend는 다음 책임을 가진다.

    외부 금융 데이터 수집
    수집 데이터 검증 및 저장
    자산 및 거래 이력 관리
    포트폴리오 평가금액 계산
    시그널 조건 평가
    REST API 제공
    데이터 수집 상태 및 오류 관리

Frontend는 다음 책임을 가진다.

    전체 자산 대시보드 표시
    자산별 상세 정보 표시
    포트폴리오 및 거래 이력 관리 UI 제공
    차트 및 통계 표시
    시그널 설정과 발생 내역 표시
    백엔드 상태 및 데이터 갱신 시각 표시

Frontend는 외부 금융 데이터 공급자에 직접 의존하지 않는다. 모든 시장 데이터 조회는 Backend API를 통한다.
2.4. 데이터 수집 프로세스

데이터 수집기는 웹 요청과 독립적으로 실행되어야 한다.

기본 처리 흐름은 다음과 같다.

    데이터 공급자별 수집 대상 목록을 조회한다.
    공급자 API를 호출한다.
    응답 데이터를 내부 표준 형식으로 변환한다.
    데이터의 유효성, 통화, 기준 시각 및 출처를 검증한다.
    DB에 저장한다.
    시그널 평가에 필요한 조건을 검사한다.
    조건이 충족되면 시그널을 기록한다.
    수집 성공 여부와 오류를 기록한다.

수집 작업은 재시도할 수 있어야 하며, 일시적인 외부 API 장애가 전체 시스템의 작동 중단으로 이어지지 않도록 한다.

3. 기능 요구사항

각 기능에는 고유한 ID를 부여한다. AI Agent는 구현 시 이 ID를 테스트 케이스와 연결하여 기능 누락 여부를 검증한다.
3.1. 금융자산 종목 관리 (Asset Master)

FR-001: 금융자산 등록 및 관리

사용자는 추적할 금융자산을 등록하고 관리할 수 있어야 한다.

필수 속성은 다음과 같다.
필드 설명 예시
instrumentId 내부 고유 ID UUID 또는 MongoDB ObjectId
symbol 종목 식별자 005930
name 종목명 삼성전자
assetType 자산 유형 STOCK
market 거래 시장 KRX
currency 거래 통화 KRW
provider 데이터 공급자 공급자 식별자
providerSymbol 공급자 측 종목 코드 공급자별 코드
isActive 수집 활성화 여부 true
createdAt 등록 시각 UTC timestamp
updatedAt 수정 시각 UTC timestamp

지원할 자산 유형은 다음과 같다.

    STOCK: 개별 주식
    ETF: 상장지수펀드
    CRYPTO: 가상자산
    FX: 외환 및 환율
    BOND: 채권
    COMMODITY: 원자재
    CASH: 현금

초기 구현은 주식, ETF, 가상자산, 환율 및 현금을 우선 지원한다.

FR-002: 종목 식별자 분리

내부 종목 ID와 외부 공급자의 종목 코드를 분리한다.

하나의 자산에는 하나의 공급자만 연결하며, 공급자별 식별자를 별도로 관리한다.

예를 들어 미국 주식 AAPL은 내부적으로 하나의 Instrument로 관리하면서, 선택한 데이터 공급자의 종목 코드로 연결한다.

단, 실제로 서로 다른 상품을 동일한 종목으로 잘못 통합하지 않도록 거래소, 상품 유형, 통화 등을 함께 검증한다.

FR-003: 관심 종목 관리

사용자는 보유 여부와 관계없이 관심 종목을 등록할 수 있어야 한다.

관심 종목은 가격 감시, 시그널 평가 및 자산 상세 조회의 대상이 될 수 있다.
3.2. 금융시장 데이터 수집

FR-010: 데이터 공급자 인터페이스

모든 외부 데이터 공급자는 공통 인터페이스를 구현한다.

interface MarketDataProvider {
readonly providerId: string;

getLatestQuote(
instrument: Instrument
): Promise<MarketQuote | null>;

getHistoricalQuotes(
instrument: Instrument,
from: Date,
to: Date,
interval: DataInterval
): Promise<MarketQuote[]>;
}

위 코드는 개념적인 인터페이스이며, 실제 구현에서는 데이터 공급자가 지원하지 않는 기능의 처리 방식을 명시한다.

예를 들어 실시간 시세를 지원하지 않는 공급자에 대해서는 최신 시세 조회와 과거 데이터 조회를 별도 인터페이스로 분리할 수 있다.

FR-011: 데이터 공급자 독립성

각 공급자에 대한 구현은 독립 모듈로 관리한다.

권장 디렉터리 구조:
src/
├── providers/
│ ├── market-data.provider.ts
│ ├── stocks/
│ │ ├── stock.provider.ts
│ │ └── ...
│ ├── crypto/
│ │ ├── crypto.provider.ts
│ │ └── ...
│ └── fx/
│ ├── fx.provider.ts
│ └── ...
├── services/
│ ├── market-data.service.ts
│ ├── portfolio.service.ts
│ ├── transaction.service.ts
│ ├── valuation.service.ts
│ └── signal.service.ts
├── repositories/
├── models/
├── api/
├── workers/
├── scheduler/
└── config/

실제 프로젝트 구조는 기존 저장소의 규칙에 맞게 조정할 수 있다.

FR-012: 데이터 수집 주기

자산 유형 및 공급자별로 수집 주기를 설정할 수 있어야 한다.

초기 권장 기본값은 다음과 같다.
데이터 유형 기본 수집 주기 비고
국내 주식 1분 공급자의 갱신 주기 및 이용 조건에 따름
미국 주식 1분 실시간 시세 이용 권한 필요 여부 확인
가상자산 10초 거래소 API 제한 준수
환율 1분 제공자의 갱신 주기에 따름
일별 종가 1일 거래일 종료 후 확정 데이터 수집
과거 데이터 보정 1일 누락 데이터 점검 및 복구

위 주기는 초기 운영을 위한 설정 예시이며, 모든 공급자가 해당 주기로 데이터를 제공한다는 의미는 아니다.

수집 주기는 설정 파일 또는 DB에서 변경할 수 있어야 한다.

실시간 스트리밍(WebSocket)을 지원하는 공급자는 폴링 방식과 별도로 구현할 수 있도록 설계한다.

FR-013: 데이터 정합성 검증

수집 데이터에 대해 다음을 검사한다.

    가격이 유효한 숫자인지 확인한다.
    가격이 음수인지 검사한다.
    종목과 통화가 일치하는지 확인한다.
    시장 데이터의 기준 시각이 유효한지 확인한다.
    중복 데이터인지 확인한다.
    이전 데이터 대비 비정상적인 가격 변화가 있는지 검사한다.
    공급자가 제공하는 데이터 상태와 확정 여부를 기록한다.

비정상 데이터는 무조건 삭제하지 않는다. 원본과 오류 상태를 보존하고, 잘못된 데이터가 포트폴리오 평가나 시그널 발생에 사용되지 않도록 한다.

FR-014: 데이터 수집 상태 관리

각 공급자와 수집 작업에 대해 다음을 관리한다.

    마지막 수집 시각
    마지막 성공 시각
    마지막 오류 시각
    연속 실패 횟수
    마지막 오류 내용
    수집 대상 수
    성공 및 실패 건수
    데이터 지연 상태

대시보드에서 최신 데이터의 시각을 확인할 수 있어야 한다.
3.3. 시장 데이터 저장

FR-020: 시세 데이터 저장

수집한 시장 데이터를 자체 DB에 저장한다.

권장 데이터 구조:

interface MarketQuote {
instrumentId: string;

price: number;
currency: string;

timestamp: Date;
receivedAt: Date;

providerId: string;

interval?: "tick" | "10s" | "1m" | "5m" | "1h" | "1d" | `${number}s` | `${number}m` | `${number}h` | `${number}d`;

open?: number;
high?: number;
low?: number;
close?: number;
volume?: number;

isFinal?: boolean;
}

필드의 의미는 다음과 같다.

    timestamp: 가격이 기준으로 삼는 시각
    receivedAt: 서버가 데이터를 수신한 시각
    price: 현재가 또는 해당 데이터의 대표 가격
    interval: 데이터의 시간 단위. 실시간 수집 시세는 설정된 수집 주기를
              사람이 읽기 쉬운 라벨로 저장한다 (예: 600초 → "10m").
    isFinal: 해당 데이터가 확정된 값인지 나타내는 선택적 필드

실제 공급자별 데이터는 이 표준 형식으로 변환한 뒤 저장한다.

FR-021: 시계열 데이터 보존

시세 데이터는 시점별로 보존한다.

동일 종목에 대한 여러 시점의 데이터를 저장할 수 있어야 하며, 과거 시세를 조회할 수 있어야 한다.

중복 방지를 위한 논리적 키는 다음과 같이 정의한다.
instrumentId + providerId + interval + timestamp

단, tick 데이터처럼 같은 시각에 복수 이벤트가 발생할 수 있는 유형은 공급자 이벤트 ID 등을 추가하여 식별한다.

FR-022: 저장 전략

데이터 양에 따라 다음 방식을 선택할 수 있도록 한다.

    원본 시세: 수집된 원본 이벤트 또는 최소 가공 데이터
    집계 시세: 1분, 5분, 1시간, 1일 단위 OHLCV
    최신 시세: 종목별 최신 상태를 빠르게 조회하기 위한 별도 컬렉션 또는 캐시

초기 버전에서는 모든 데이터 유형의 모든 원본 이벤트를 무기한 저장하지 않는다.

특히 가상자산의 10초 단위 수집은 데이터가 빠르게 증가하므로 보존 기간과 집계 정책을 설정할 수 있어야 한다.
3.4. 개인 포트폴리오 관리

FR-030: 포트폴리오 생성

사용자는 하나 이상의 포트폴리오를 생성할 수 있다.

예시:

    전체 자산
    국내 주식
    미국 주식
    가상자산
    연금 계좌

초기에는 단일 사용자, 단일 기본 포트폴리오로 시작할 수 있다. 다만 데이터 모델은 향후 여러 사용자와 여러 포트폴리오를 지원할 수 있게 설계한다.

FR-031: 자산 보유 현황 관리

사용자는 자산별 보유 수량을 등록할 수 있어야 한다.

필수 속성:
필드 설명
portfolioId 포트폴리오 ID
instrumentId 자산 ID
quantity 보유 수량
averageCost 평균 매입 단가
costCurrency 매입 원가 통화
acquisitionDate 최초 취득일 또는 취득 관련 날짜
updatedAt 최종 갱신 시각

다만 보유 수량과 평균 매입 단가는 거래 이력에서 계산할 수 있으므로, 거래 이력을 기준 데이터로 두고 현재 보유 현황은 계산 결과 또는 캐시로 관리하는 방식을 권장한다.

FR-032: 거래 이력 관리

다음 거래 유형을 지원한다.

    BUY: 매수
    SELL: 매도
    DEPOSIT: 자산 입금
    WITHDRAWAL: 자산 출금
    TRANSFER_IN: 외부 계좌에서 이체
    TRANSFER_OUT: 외부 계좌로 이체
    DIVIDEND: 배당금 수령
    INTEREST: 이자 수령
    FEE: 수수료
    SPLIT: 주식 분할 또는 병합
    ADJUSTMENT: 사용자 정정

거래 기록에는 거래 시각, 자산, 수량, 단가, 수수료, 통화, 거래 메모를 저장한다.

매수·매도 거래는 실제 체결 금액과 수수료를 구분한다.

FR-033: 과거 자산 현황 복원

사용자가 특정 날짜를 선택하면 해당 날짜의 포트폴리오 구성을 복원할 수 있어야 한다.

예를 들어 2026년 6월 30일을 선택하면 해당 날짜까지의 거래 내역을 반영한 자산 수량과 해당 시점의 시장 가격을 사용하여 평가금액을 계산한다.

과거 현황 복원에는 두 가지 방식이 사용된다.

    거래 이력과 과거 시세를 사용해 계산한다.
    저장된 자산 스냅샷을 조회한다.

가능하면 두 방식을 함께 제공하여, 저장된 스냅샷과 재계산 결과의 일관성을 검증할 수 있도록 한다.

FR-034: 거래 수정 및 삭제

사용자가 잘못 입력한 거래를 수정하거나 삭제할 수 있어야 한다.

다만 과거 자산 현황의 정확성을 위해 거래 변경이 이전 평가 결과에 미치는 영향을 처리해야 한다.

초기 구현에서는 거래 변경 후 해당 거래 시점 이후의 관련 포지션 및 스냅샷을 무효화하거나 재계산하는 방식을 권장한다.

4. 자산 평가 및 투자 성과 계산

4.1. 기준 통화

FR-040: 기준 통화 설정

기본 기준 통화는 KRW로 설정한다.

사용자는 향후 USD 등 다른 기준 통화를 선택할 수 있도록 설계한다.

자산의 거래 통화와 포트폴리오의 기준 통화는 서로 다를 수 있다.

예를 들어 미국 주식의 가격은 USD로 관리하고, 전체 자산 평가금액은 KRW로 환산하여 표시한다.
4.2. 자산 평가금액

FR-041: 개별 자산 평가금액

자산 평가금액은 보유 수량과 평가 가격을 곱하여 계산한다.
Vi=Qi×Pi
Vi​=Qi​×Pi​

    ViVi​: 자산 ii의 평가금액
    QiQi​: 보유 수량
    PiPi​: 자산의 현재 가격

FR-042: 기준 통화 환산

외화 자산은 기준 통화로 환산한다.
Vi,KRW=Qi×Pi,CCY×FXCCY→KRW
Vi,KRW​=Qi​×Pi,CCY​×FXCCY→KRW​

예를 들어 USD로 거래되는 주식은 USD 기준 평가금액을 구한 다음 USD/KRW 환율을 적용한다.

환율은 해당 평가 시점에 적합한 데이터를 사용해야 한다.

과거 자산 평가에서는 현재 환율이 아니라 과거 평가 시점의 환율을 사용한다.

FR-043: 전체 자산 평가금액

전체 포트폴리오 평가금액은 개별 자산 평가금액과 현금 잔액을 합산하여 계산한다.
Vportfolio=∑iVi+∑jCashj
Vportfolio​=i∑​Vi​+j∑​Cashj​

단, 현금이 이미 자산 포지션으로 포함된 경우에는 중복 합산하지 않는다.

대출 등 부채까지 관리하게 되면 총자산과 순자산을 별도로 계산할 수 있도록 확장한다.
4.3. 손익 및 수익률

FR-044: 평가손익

평가손익은 평가금액에서 해당 자산의 매입 원가를 차감하여 계산한다.
UnrealizedPnL=MarketValue−CostBasis
UnrealizedPnL=MarketValue−CostBasis

평균 매입 원가 계산 방식은 원가법에 따라 결과가 달라질 수 있으므로, 초기 버전에서는 이동평균법 또는 총평균법 중 하나를 명확히 선택한다.

세금 신고 목적의 원가 계산은 지원 범위에서 제외하며, 필요한 경우 별도의 세무 계산 모듈로 확장한다.

FR-045: 수익률

기본 수익률은 다음과 같이 계산한다.
Return(%)=MarketValue−CostBasisCostBasis×100
Return(%)=CostBasisMarketValue−CostBasis​×100

이 값은 미실현 손익 기준 수익률이다.

배당금, 입출금, 추가 매수 및 매도까지 포함한 기간별 투자 성과는 별도 계산한다.

FR-046: 기간별 투자 성과

향후 다음 지표를 제공할 수 있도록 설계한다.

    일간 수익률
    주간 수익률
    월간 수익률
    연간 수익률
    누적 수익률
    실현 손익
    미실현 손익
    배당 및 이자 수익
    환율 변동에 따른 손익

단순히 시작 자산과 종료 자산을 비교하면 입출금 때문에 수익률이 왜곡될 수 있다.

따라서 자금 유입·유출을 반영하는 기간별 성과 계산은 초기 평가손익과 구분하여 구현한다. 필요하면 시간가중수익률(TWR) 또는 금액가중수익률(MWR/XIRR)을 추가한다.

5. 자산 스냅샷 및 과거 데이터 관리

5.1. 스냅샷 생성

FR-050: 자산 스냅샷

특정 시점의 포트폴리오 상태를 스냅샷으로 저장한다.

스냅샷에는 다음 정보를 포함한다.

interface PortfolioSnapshot {
portfolioId: string;

asOf: Date;
capturedAt: Date;

baseCurrency: string;

totalAssetValue: number;
totalCostBasis: number;
unrealizedPnL: number;

positions: Array<{
instrumentId: string;
quantity: number;

    price: number;
    priceCurrency: string;

    fxRateToBase: number;
    marketValue: number;
    marketValueBase: number;

    costBasis?: number;
    unrealizedPnL?: number;

}>;

cashBalances: Array<{
currency: string;
amount: number;
valueInBaseCurrency: number;
}>;
}

실제 구현에서는 실현 손익, 현금 잔액, 데이터 품질 등의 항목을 추가할 수 있다.

FR-051: 스냅샷 생성 주기

초기 기본 정책은 다음과 같다.
스냅샷 유형 생성 주기 목적
Intraday 1시간 시간별 자산 변화
Daily 1일 일별 자산 현황
On-demand 사용자 요청 시 특정 시점 분석

스냅샷 생성 주기는 설정으로 변경할 수 있어야 한다.

시간별 스냅샷은 실제 시세 갱신 주기와 일치하지 않을 수 있으므로, 평가에 사용한 각 자산 가격의 기준 시각을 별도로 보존해야 한다.

FR-052: 스냅샷 멱등성

동일한 포트폴리오와 평가 시점에 대한 스냅샷 생성 요청이 반복되더라도 중복 데이터가 생성되지 않도록 한다.

논리적 고유 키:
portfolioId + snapshotType + asOf

기존 스냅샷을 갱신할 경우에는 해당 스냅샷의 계산 기준과 갱신 시각을 기록한다.
5.2. 과거 시점 평가

FR-053: 과거 평가금액 조회

사용자는 특정 날짜 또는 기간을 지정하여 자산 현황을 조회할 수 있어야 한다.

지원 조회 범위:

    특정 시점의 전체 자산
    날짜별 전체 자산
    자산별 과거 가격
    자산별 보유 수량 변화
    통화별 평가금액 변화
    자산군별 비중 변화

스냅샷이 없는 과거 시점은 거래 이력과 과거 시세를 이용하여 계산한다.

다만 과거 시세가 없거나 불완전한 경우에는 추정값으로 대체하지 않고, 평가 불가 또는 데이터 불충분 상태를 명시한다.

6. 투자 시그널 및 알림

6.1. 시그널 규칙

FR-060: 가격 변동 시그널

사용자는 특정 종목에 대해 가격 변동 조건을 설정할 수 있어야 한다.

초기 기본 규칙:

    종목의 기준 가격 대비 하락률이 5% 이상이면 시그널을 발생시킨다.

하락률은 다음과 같이 계산한다.
Drop(%)=Pcurrent−PreferencePreference×100
Drop(%)=Preference​Pcurrent​−Preference​​×100

예를 들어 기준 가격이 100이고 현재 가격이 94라면 하락률은 -6%이므로, 5% 이상 하락 조건을 충족한다.

FR-061: 기준 가격 정의

가격 변동 시그널의 기준 가격은 명확하게 정의해야 한다.

초기 지원 방식:

    사용자가 지정한 가격
    직전 거래일 종가
    최근 N시간 또는 N일의 기준 가격
    최근 고점 대비 하락률

사용자가 별도로 지정하지 않은 경우에는 직전 거래일 종가 대비 변동률을 기본으로 한다.

단, 거래일과 시간대가 다른 자산은 해당 시장의 거래 일정과 데이터 기준 시각을 고려해야 한다.

FR-062: 시그널 설정 데이터

interface SignalRule {
id: string;
portfolioId?: string;
instrumentId: string;

signalType:
| "PRICE_DROP"
| "PRICE_RISE"
| "PRICE_THRESHOLD"
| "PORTFOLIO_THRESHOLD";

threshold: number;

referenceType:
| "FIXED_PRICE"
| "PREVIOUS_CLOSE"
| "ROLLING_HIGH"
| "ROLLING_WINDOW";

referenceValue?: number;

isEnabled: boolean;

cooldownSeconds?: number;

createdAt: Date;
updatedAt: Date;
}

위 타입은 기본 구조다. 롤링 기준을 사용하는 경우에는 관찰 기간 등 추가 속성이 필요하다.
6.2. 시그널 중복 방지

FR-063: 반복 알림 제어

가격이 임계치를 계속 밑돌고 있다는 이유로 동일한 알림이 반복 발생하지 않도록 한다.

기본 동작:

    조건이 처음 충족되면 시그널을 발생시킨다.
    조건이 유지되는 동안 중복 알림을 억제한다.
    조건이 해제된 후 다시 충족되면 새로운 시그널을 발생시킬 수 있다.
    사용자가 설정한 쿨다운 시간이 지나면 재알림을 허용할 수 있다.

시그널의 상태와 발생 이력을 구분하여 저장한다.
6.3. 시그널 발생 이력

FR-064: 시그널 이벤트 저장

시그널이 발생하면 다음 정보를 기록한다.

    시그널 ID
    관련 종목 또는 포트폴리오
    발생 시각
    기준 가격
    관측 가격
    계산된 변동률
    규칙 ID
    시그널 상태
    알림 전송 상태
    오류 정보

시그널 발생과 실제 알림 전송은 별도의 단계로 관리한다.

초기 버전은 웹 UI의 시그널 내역을 우선 지원한다. 이메일, 모바일 푸시, 메신저 등은 추후 알림 채널로 추가할 수 있다.

7. Web UI 요구사항

7.1. 전체 메뉴 구조

Next.js 기반 웹 UI는 다음 메뉴를 제공한다.
jFolio
├── 대시보드
├── 보유 자산
├── 과거 자산
├── 거래 내역
├── 자산 목록
├── 포트폴리오
├── 시그널
└── 시장 데이터

대시보드·보유 자산·과거 자산 화면은 상단의 포트폴리오 선택기를 공유한다.
포트폴리오 선택기는 숨김 포트폴리오를 제외한 목록을 보여 주며, 대시보드에서는
`All`을 선택해 모든 표시 포트폴리오를 하나의 기준 통화로 합산할 수 있다.

로그인·로그아웃은 별도 설정 메뉴가 아니라 사이드바 하단의 계정 영역에서
수행한다. 공급자 선택은 환경변수로, 수집 상태 확인과 수동 수집은
`/market-data` 화면과 `/api/v1/system/*` API로, 백업·복원과 계정 생성은
CLI로 제공한다.
7.2. Dashboard

UI-001: 전체 자산 대시보드

대시보드는 사용자가 접속했을 때 가장 먼저 확인하는 화면이다.

필수 표시 항목:

    전체 자산 평가금액
    전일 대비 평가금액 변화
    전일 대비 변동률
    총 매입 원가
    미실현 손익 및 수익률
    자산군별 평가금액
    자산군별 비중
    자산 평가금액의 기간별 추이
    주요 보유 종목
    최근 발생한 시그널
    마지막 데이터 갱신 시각

권장 화면 구성:
┌──────────────────────────────────────────────────────┐
│ jFolio      [포트폴리오 선택 ▾]      대시보드   [NORMAL] │
├──────────────────────────────────────────────────────┤
│ 기준 통화 KRW(₩1,328/USD) 기준 시각 2026-10-28 11:17:33 │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Total Asset Value         Daily Change              │
│  ₩350,000,000              +₩2,500,000 (+0.72%)      │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Portfolio Performance                               │
│  [1D] [1W] [1M] [3M] [6M] [YTD] [1Y] [ALL]           │
│                                                      │
│  [자산 평가금액 추이 차트 + 최고/최저 주석]                 │
│                                                      │
├──────────────────────────┬───────────────────────────┤
│ Asset Allocation         │ Top Holdings              │
│                          │                           │
│ [자산 비중 차트]            │ 종목 / 평가금액(현재가) /     │
│                          │ 수익율(전일대비)             │
│                          │                           │
├──────────────────────────┴───────────────────────────┤
│ Recent Signals                                       │
│ 발생 시각 / 종목 / 조건 / 관측값                          │
├──────────────────────────────────────────────────────┤
│ Data Status: Updated at YYYY-MM-DD HH:mm:ss          │
└──────────────────────────────────────────────────────┘

위 금액은 화면 구성 예시이며 실제 사용자 자산을 의미하지 않는다.

구현 기준 상세:

    페이지 제목은 접근성용으로만 유지하고, 화면에는 `기준 통화 {baseCurrency}({rate}/{referenceCurrency}) 기준 시각 {referenceTime}` 형식의 한 줄을 표시한다. 환율은 저장된 최신 FX 데이터(`GET /api/v1/system/fx-rate`)를 사용하고, 기준 시각은 해당 페이지 데이터의 `asOf`를 사용한다. FX 시세 시각을 페이지 기준 시각으로 오인해 표시하지 않는다. 환율이 없으면 `기준 통화 {baseCurrency}`만 표시하고 0으로 대체하지 않는다.
    포트폴리오 선택기가 단일 포트폴리오와 `All`을 제공한다. `All`은 숨김 포트폴리오를 제외한 모든 포트폴리오를 기본 포트폴리오의 기준 통화로 합산하며, `포트폴리오별 평가금액` 표와 다중 시계열 차트를 추가로 표시한다.
    차트 기간은 `1D`, `1W`, `1M`, `3M`, `6M`, `YTD`, `1Y`, `ALL`이며 기본 선택은 `3M`이다.
    차트에는 기간 내 최고점과 최저점을 표시한다. 주석의 화면 텍스트는 날짜(`MM-DD`)와 최신값 대비 변동률만 표시하고 `최대`/`최소` 문구는 노출하지 않는다. 변동률은 `(최신값 - 극값) / 극값 × 100`으로 계산하며, 접근성 레이블에는 최대/최소 의미를 유지한다.
    누락된 평가 시점은 보간하지 않고 선을 끊어 표시한다.
    보유 종목 표는 `종목`, `평가금액/현재가`, `수익율/전일대비` 3개 컬럼으로 구성한다. 평가금액은 기준 통화, 현재가는 자산의 거래 통화로 표시한다. 보유 종목은 거래 통화별로 묶어 `KRW`, `USD`, `USDT`, 기타 통화 순으로 구분해 표시하고, 표 상단의 통화 필터로 `전체` 또는 특정 통화만 볼 수 있다. 기본값은 `전체`이다. 현금과 평가 불가 종목은 이 표에서 제외하며, 현금 잔고는 보유 자산 화면의 현금 잔고 카드에서 확인하고 평가 불가 종목 수는 `unavailableCount`로 집계한다. 평가 불가 값을 0원으로 대체하지 않는다.
7.3. Portfolio 화면

UI-002: 보유 자산 목록

다음 2단 컬럼을 제공한다. 각 컬럼은 주 값을 첫 줄에, 보조 값을 둘째 줄에
표시해 가로 폭을 줄인다.

    자산: 종목명, 보조 줄에 코드와 자산 유형
    현재가(수량): 자산 거래 통화 기준 현재가와 보유 수량, 보조 줄에 매입평균가(기준 통화)
    전일대비: 최신가와 직전 일봉 종가의 등락률. 헤더 둘째 줄은 `등락률`이며 별도 보조 값은 없다.
    평가금액: 기준 통화 평가금액, 보조 줄에 매입 원가(기준 통화)
    미실현 손익: 미실현 손익(기준 통화), 보조 줄에 수익률
    비중: 전체 자산 대비 비중
    시세 기준: 시세 기준 시각, 보조 줄에 데이터 상태 배지

정렬과 검색 기능을 제공하며, 종목을 선택하면 상세 화면으로 이동한다.
현금은 별도 현금 잔고 카드에서 표시하고 이 표에서는 제외한다. 평가금액과
매입 원가는 기준 통화로, 현재가는 자산의 거래 통화로 표시한다. 값이 없으면
0으로 대체하지 않고 `평가 불가` 또는 `—`로 표시한다.
7.4. Asset Detail 화면

UI-003: 개별 자산 상세

다음 항목을 표시한다.

    종목명 및 종목 코드
    거래 시장
    거래 통화
    현재가
    가격 변동률
    거래량
    기간별 가격 차트
    보유 수량
    매입 원가
    평가손익
    거래 이력
    관련 시그널
    데이터 공급자 및 최종 갱신 시각

기간별 가격 차트는 대시보드의 자산 평가금액 추이와 같은 축, 마우스 툴팁,
최고점/최저점 주석 구조를 사용한다. 기간은 `1D`, `1W`, `1M`, `3M`, `6M`,
`YTD`, `1Y`, `ALL`이며 기본 선택은 `3M`이다. `1D`는 저장된 단기 시세를
사용하고 나머지 기간은 일별 종가를 사용하며, 선택 기간에 따라 차트 제목의
`(시간별 시세)`/`(일별 종가)` 표기를 바꾼다.

7.5. Historical Performance 화면

UI-004: 과거 자산 현황

사용자는 날짜 범위와 기준 통화를 선택할 수 있어야 한다.

차트는 일별 또는 시간별 자산 평가금액을 표시한다.

추가로 다음 기능을 제공한다.

    특정 날짜 선택
    선택 날짜의 보유 종목 및 수량 확인
    해당 날짜의 평가금액 확인
    자산군별 비중 비교
    기간 시작점과 종료점 비교

과거 데이터가 누락된 구간은 차트에서 명확하게 표현해야 하며, 누락 구간을 실제 데이터처럼 보간해서는 안 된다.
7.6. Signals 화면

UI-005: 시그널 관리

사용자는 다음 작업을 수행할 수 있어야 한다.

    시그널 규칙 생성
    시그널 규칙 수정
    시그널 활성화 및 비활성화
    발생 이력 조회
    발생 시각 및 관측값 확인
    동일 시그널의 중복 발생 여부 확인

7.7. UI 공통 요구사항

UI-006: 공통 상태 표시

모든 주요 화면은 다음 상태를 명확히 구분해야 한다.

    정상 데이터
    데이터 갱신 지연
    데이터 수집 실패
    데이터 없음
    평가 불가
    과거 데이터 불완전

데이터를 조회할 수 없을 때 0원 또는 0%로 표시해서는 안 된다.

예를 들어 환율을 조회할 수 없는 경우에는 해당 자산의 KRW 평가금액을 0원으로 표시하는 대신 평가 불가로 표시한다.

8. REST API 명세
8.1. API 기본 규칙

    기본 경로: /api/v1
    데이터 형식: JSON
    날짜 형식: ISO 8601
    내부 시간 저장: UTC
    UI 표시 시간대: 기본 Asia/Seoul
    통화: ISO 4217 코드 사용
    가격 및 수량: 적절한 정밀도를 유지한다.
    오류 응답: 일관된 공통 형식을 사용한다.

API는 사용자 데이터에 접근할 때 인증과 권한 검사를 수행한다. Phase 1은
이메일/비밀번호 로그인과 서버 세션을 사용하며, 인증 라우트는 버전 경로 밖의
`/api/auth`에 있다. 세션 인증을 사용하는 변경 요청은 double-submit CSRF
(`jfolio.csrf` 쿠키 + `x-csrf-token` 헤더)를 요구한다. `API_AUTH_TOKEN` 서비스
토큰으로 인증한 요청은 CSRF 검사를 생략한다. 오류 응답은
`{ "error": { "code", "message", "details?" } }` 형식을 사용한다.
8.2. Dashboard API

GET /api/v1/dashboard

전체 자산 현황을 조회한다. `portfolioId`를 생략하면 사용자의 기본
포트폴리오를 사용하고, 없으면 생성한다. `portfolioId=all`이면 숨김
포트폴리오를 제외한 모든 포트폴리오를 기본 포트폴리오의 기준 통화로
합산하고 `portfolios` 배열에 포트폴리오별 내역을 함께 반환한다.

요청 예시:
GET /api/v1/dashboard?portfolioId=all&baseCurrency=KRW

응답 예시:

{
"portfolioId": "all",
"baseCurrency": "KRW",
"asOf": "2026-10-16T05:00:00.000Z",
"totalAssetValue": 350000000,
"dailyChange": 2500000,
"dailyChangeRate": 0.72,
"totalCostBasis": 320000000,
"unrealizedPnL": 30000000,
"unrealizedReturn": 9.375,
"dataStatus": "NORMAL",
"unavailableCount": 0,
"allocationByAssetType": [],
"allocationByCurrency": [],
"topHoldings": [],
"recentSignals": [],
"portfolios": [],
"lastDataUpdatedAt": "2026-10-16T05:00:00.000Z"
}

위 응답은 API 계약 예시이며 실제 계산 결과가 아니다.

`dailyChange`와 `dailyChangeRate`는 현재 또는 비교 시점의 평가 상태가
`UNAVAILABLE`이면 `null`이다. 0으로 대체하지 않는다. `topHoldings`는 현금과
평가 불가 종목을 제외한 보유 종목을 평가금액 내림차순으로 반환하며, 외화 자산의
`marketValueBase`는 기준 통화, `price`는 자산의 거래 통화로 제공한다.

GET /api/v1/dashboard/history

대시보드 차트용 평가금액 시계열을 조회한다. Query는 `portfolioId`,
`baseCurrency`, `from`, `to`, `interval`(`hourly | daily`, 기본 `daily`),
`includeSnapshots`(기본 `false`)이다.
`portfolioId=all`이거나 생략하면 숨김 포트폴리오를 제외한 전체를 하나의 기준
통화로 합산한다. 한 포트폴리오라도 해당 시점 평가가 불가하면 그 시점 값은
`null`이며, UI는 누락 구간을 보간하지 않는다. `all` 응답에는 포트폴리오별
`series: [{ portfolioId, name, items }]`가 추가된다.
8.3. Asset API
Method Endpoint 설명
GET /api/v1/assets 자산 목록 조회
GET /api/v1/assets/:id 자산 상세 조회
POST /api/v1/assets 자산 등록
PATCH /api/v1/assets/:id 자산 정보 수정
DELETE /api/v1/assets/:id 자산 비활성화 또는 삭제 정책 적용
GET /api/v1/assets/:id/quotes 과거 시세 조회

목록과 상세 응답은 자산별 최신 시세를 `latestQuote`로 함께 반환한다(없으면
`null`). 삭제 API는 과거 거래 및 스냅샷 참조를 보존하도록 물리 삭제 대신
`isActive=false`로 비활성화하며, `PATCH { "isActive": true }`로 복원할 수 있다.
8.4. Portfolio API
Method Endpoint 설명
GET /api/v1/portfolios 포트폴리오 목록 (기본: 숨김 제외, `includeHidden=true`로 포함)
POST /api/v1/portfolios 포트폴리오 생성
GET /api/v1/portfolios/:id 포트폴리오 상세
PATCH /api/v1/portfolios/:id 이름·기준 통화·기본·숨김 수정
GET /api/v1/portfolios/:id/holdings 보유 자산 조회
GET /api/v1/portfolios/:id/valuation 현재 평가금액 조회
GET /api/v1/portfolios/:id/history 과거 자산 현황 조회
GET /api/v1/portfolios/:id/snapshots 스냅샷 조회
POST /api/v1/portfolios/:id/snapshots 온디맨드 스냅샷 생성

`isHidden=true`인 포트폴리오는 목록·선택·대시보드에서 기본적으로 제외하되
데이터는 유지한다. 기본 포트폴리오는 숨길 수 없고, 숨김 포트폴리오를 기본으로
지정하면 자동으로 다시 표시한다. `isDefault=true`로 지정하면 같은 사용자의 다른
포트폴리오는 기본 지정이 해제된다. 빈 PATCH 본문은 `422`로 거부한다.
8.5. Transaction API
Method Endpoint 설명
GET /api/v1/transactions 거래 이력 조회
POST /api/v1/transactions 거래 등록
PATCH /api/v1/transactions/:id 거래 수정
DELETE /api/v1/transactions/:id 거래 취소 또는 삭제 처리

거래 등록과 수정은 포지션 계산에 영향을 미치므로, 트랜잭션 처리와 재계산 정책을 함께 구현한다.
8.6. Signal API
Method Endpoint 설명
GET /api/v1/signals/rules 규칙 목록
POST /api/v1/signals/rules 규칙 생성
PATCH /api/v1/signals/rules/:id 규칙 수정
DELETE /api/v1/signals/rules/:id 규칙 비활성화
GET /api/v1/signals/events 시그널 발생 이력
8.7. System API
Method Endpoint 설명
GET /api/v1/system/health 시스템 상태 (인증 예외)
GET /api/v1/system/data-status 수집 작업 상태
GET /api/v1/system/providers 공급자 상태
GET /api/v1/system/fx-rate 기준 통화 환율 최신값 (`baseCurrency`, `referenceCurrency`)
POST /api/v1/system/collection/run 인증된 사용자의 수동 수집 실행

`GET /api/v1/system/fx-rate`는 모든 인증 페이지 헤더에 표시하는 기준 환율을
반환한다. 기본값은 `baseCurrency=KRW`, `referenceCurrency=USD`이며, 저장된
`fx_rates`의 최신값을 사용하고 외부 공급자를 직접 호출하지 않는다. 환율을
찾지 못하면 `rate: null`을 반환하며 0으로 대체하지 않는다.

수동 수집 API는 인증된 요청에만 허용하고, 호출 남용을 방지해야 한다.

8.8. Authentication API

인증 라우트는 `/api/v1` 밖의 `/api/auth`에 있으며, 웹은 동일 출처 프록시
`/api/auth/*`를 통해 호출한다.

Method Endpoint 설명
GET /api/auth/csrf 현재 세션의 CSRF 토큰 반환
GET /api/auth/me `{ authenticated, user }` 반환
GET /api/auth/providers 사용 가능한 로그인 수단 반환
POST /api/auth/login 이메일/비밀번호 로그인
POST /api/auth/logout 세션 종료 및 쿠키 삭제

회원가입·비밀번호 재설정은 제공하지 않으며, 계정은 관리자가
`yarn create-user`(운영: `node apps/api/dist/cli/create-user.js`)로 생성한다.
로그인 실패는 계정 존재 여부를 노출하지 않도록 동일한 메시지를 사용하고,
IP와 이메일 조합 기준 rate limit을 적용한다. Google SSO는 Phase 2 예약이다.

9. MongoDB 데이터 모델

이 절은 MongoDB를 사용하는 경우의 권장 스키마다. 실제 컬렉션과 필드는 구현 과정에서 조정할 수 있지만, 데이터 간의 관계와 무결성 원칙은 유지해야 한다.
9.1. 컬렉션 구성
Collection 용도 보존 원칙
users 내부 사용자 계정 계정 상태·감사 목적 보존
user_identities 인증 수단(local/Google) 연결 사용자당 provider별 1개
sessions 서버 측 로그인 세션 만료·로그아웃 시 삭제
instruments 금융상품 마스터 사용 이력 보존
market_quotes 시장 시세 시계열 보존 기간 및 집계 정책 적용
latest_quotes 종목별 최신 시세 최신 상태 갱신
fx_rates 환율 시계열 시점별 보존
portfolios 포트폴리오 설정 사용자 데이터
transactions 거래 이력 원본 이력 보존
positions 현재 보유 자산 조회용 상태 거래 이력에서 재구성 가능
portfolio_snapshots 자산 평가 스냅샷 시점별 보존
signal_rules 시그널 규칙 사용자 설정
signal_events 시그널 발생 이력 중복 방지 및 이력 보존
collection_jobs 수집 작업 상태 운영 상태 기록
provider_states 공급자별 상태 장애 분석 및 복구

`users`/`user_identities`/`sessions`는 Phase 1 로컬 로그인 구현에 포함된다.
포트폴리오·거래 데이터는 현재 `DEFAULT_USER_ID` 아래에서 공유되며, 인증 계정
도입과 사용자별 데이터 분리는 별도 단계다.
9.2. instruments

금융상품의 기본 정보를 저장한다.

{
"instrumentId": "instrument-id",
"symbol": "AAPL",
"name": "Apple Inc.",
"assetType": "STOCK",
"market": "NASDAQ",
"currency": "USD",
"isActive": true,
"isWatchlist": false,
"providers": [
{
"providerId": "provider-a",
"providerSymbol": "AAPL"
}
],
"createdAt": "2026-10-16T00:00:00.000Z",
"updatedAt": "2026-10-16T00:00:00.000Z"
}

9.3. market_quotes

{
"instrumentId": "instrument-id",
"providerId": "provider-a",
"interval": "1m",
"timestamp": "2026-10-16T05:00:00.000Z",
"receivedAt": "2026-10-16T05:00:01.000Z",
"price": 250.8,
"currency": "USD",
"open": 250.1,
"high": 251.0,
"low": 249.8,
"close": 250.8,
"volume": 12000,
"isFinal": true
}

OHLCV 데이터는 가격의 의미를 명확히 구분한다.

    open: 해당 구간의 시가
    high: 해당 구간의 고가
    low: 해당 구간의 저가
    close: 해당 구간의 종가 또는 구간 종료 시 가격
    volume: 해당 구간의 거래량

최신 시세를 저장하는 방식과 과거 시세를 저장하는 방식은 분리한다.
`latest_quotes`는 종목별 물질화 뷰로, 수집 시 매 관측마다 갱신한다. 저장된
`timestamp`보다 오래된 시세가 뒤늦게 들어와도 최신값을 덮어쓰지 않는다. 동일
시각의 중복 관측은 원본 시세 행을 추가하지 않고 최신 뷰의 `receivedAt`을
포함한 수집 메타데이터를 갱신한다.

`1d` 일봉은 자산 생성 시 백필과 별도로 스케줄러가 UTC 자정과 기동 시점에
마지막 `1d` 다음 UTC 날짜부터 직전 UTC 완료일까지 증분 생성한다. 진행 중인
당일 일봉은 저장하지 않고, 논리 중복 키로 재실행을 멱등하게 만든다.
9.4. transactions

{
"transactionId": "transaction-id",
"portfolioId": "portfolio-id",
"instrumentId": "instrument-id",
"type": "BUY",
"timestamp": "2026-10-10T02:00:00.000Z",
"quantity": 10,
"price": 250.0,
"currency": "USD",
"fee": 1.5,
"externalReference": null,
"memo": "Initial purchase",
"createdAt": "2026-10-10T02:01:00.000Z",
"updatedAt": "2026-10-10T02:01:00.000Z"
}

금액은 거래 통화로 기록한다. 거래 수수료 역시 통화를 명시해야 한다.

입출금과 거래를 정확히 구분하고, 내부 계좌 간 자산 이동을 매수·매도로 잘못 계산하지 않도록 한다.
9.5. 인덱스 설계

현재 구현된 주요 인덱스는 다음과 같다. 대부분은 `ensureIndexes()`가 기동 시
best-effort로 생성하고, `sessions` TTL 인덱스는 세션 스토어가 관리한다.
Collection Index 옵션·목적
users { email: 1 } Unique
user_identities { provider: 1, providerUserId: 1 } Unique
user_identities { userId: 1, provider: 1 } Unique
sessions TTL `SESSION_MAX_AGE_MS` 기준
instruments { symbol: 1, market: 1, currency: 1 } Unique 자연키
instruments { assetType: 1, isActive: 1 } 자산군/활성 조회
market_quotes { instrumentId: 1, providerId: 1, interval: 1, timestamp: 1 } Unique 논리 중복 방지
market_quotes { instrumentId: 1, interval: 1, timestamp: -1 } 과거 시세 조회
latest_quotes { instrumentId: 1 } Unique 종목별 최신 시세
fx_rates { base: 1, quote: 1, timestamp: 1 } Unique 논리 중복 방지
fx_rates { base: 1, quote: 1, timestamp: -1 } 최신 환율 조회
portfolios { userId: 1, isDefault: 1 } 사용자별 기본 조회
transactions { portfolioId: 1, timestamp: 1 } 거래 이력 조회
transactions { instrumentId: 1, timestamp: 1 } 종목별 거래 조회
positions { portfolioId: 1, instrumentId: 1 } Unique 포지션
portfolio_snapshots { portfolioId: 1, snapshotType: 1, asOf: 1 } Unique 스냅샷 중복 방지
signal_rules { portfolioId: 1, isEnabled: 1 } 활성 규칙 조회
signal_rules { instrumentId: 1, isEnabled: 1 } 종목별 활성 규칙 조회
signal_events { ruleId: 1, deduplicationKey: 1 } Unique 시그널 중복 방지
signal_events { instrumentId: 1, triggeredAt: -1 } 종목별 이력 조회
collection_jobs { providerId: 1, startedAt: -1 } 수집 이력 조회
provider_states { providerId: 1 } Unique 공급자 상태

인덱스의 고유성 및 키 구성은 실제 컬렉션 설계에 맞게 검증한다. 사용자별 데이터
분리가 필요한 컬렉션에는 userId를 포함해야 한다.

주의: MongoDB는 컬렉션 간 관계를 자동으로 보장하지 않는다. 참조 대상의 존재 여부, 거래 이력의 일관성, 중복 방지 및 동시성 처리를 애플리케이션에서 구현해야 한다.

10. 비기능 요구사항

10.1. 성능

NFR-001: 응답 시간

초기 목표는 다음과 같다.
항목 목표
일반 API 응답 시간 p95 500ms 이내
대시보드 API 응답 시간 p95 1초 이내
시세 조회 API p95 500ms 이내
데이터 수집 작업 다음 예정 수집 주기까지 처리 완료

위 수치는 개발 및 테스트 환경에서 검증할 목표다. 외부 공급자의 응답 시간과 네트워크 지연은 별도로 측정한다.

대시보드 조회 시 외부 API를 매번 직접 호출하지 않는다. 저장된 시세와 평가 결과를 사용하여 응답 시간을 안정화한다.
10.2. 안정성

NFR-002: 장애 대응

    외부 API 장애 시 재시도한다.
    반복 실패 시 지수형 백오프를 적용한다.
    공급자별 API 요청 제한을 준수한다.
    한 공급자의 장애가 다른 공급자의 수집까지 중단시키지 않도록 한다.
    오래된 시세를 최신 시세로 오인하지 않도록 한다.
    수집 실패 및 복구 이력을 기록한다.

재시도 횟수와 최대 대기 시간은 설정 가능하게 한다.
10.3. 보안

NFR-003: 사용자 데이터 보호

개인 금융자산 정보는 민감한 데이터로 취급한다.

    인증되지 않은 사용자의 자산 조회를 차단한다.
    사용자별 데이터 접근 권한을 검사한다.
    API 키와 비밀번호를 소스 코드에 저장하지 않는다.
    비밀 정보는 환경변수 또는 비밀 관리 시스템을 통해 제공한다.
    로그에 API 키, 비밀번호 및 민감한 금융정보를 노출하지 않는다.
    운영 환경에서 HTTPS를 사용한다.
    DB 접근 권한을 최소화한다.
    외부 API 호출에 대한 요청 제한과 오류 처리를 적용한다.

MVP가 개인용 단일 사용자 환경에서 실행되더라도, 네트워크에 공개되는 경우에는 인증을 반드시 적용한다.

초기 버전에서는 사용자가 직접 거래를 입력하는 방식으로 시작하고, 증권사 계좌 자동 연결은 별도 기능으로 취급한다.
10.4. 데이터 정확성

NFR-004: 금융 데이터 정밀도

금융 계산에 JavaScript의 부동소수점 연산을 무분별하게 사용하지 않는다.

권장 원칙:

    가격과 수량의 정밀도를 명시한다.
    금액 계산에 Decimal 연산 라이브러리 사용을 검토한다.
    통화별 반올림 규칙을 분리한다.
    DB 저장 시 데이터 타입과 정밀도 손실을 검증한다.
    계산 결과와 원본 데이터를 구분한다.

단순한 가격 비교에서도 통화, 시장 거래 시간, 가격 기준 시각을 확인한다.
10.5. 관측 가능성

NFR-005: 로그 및 운영 상태

시스템은 다음을 기록해야 한다.

    API 요청 및 오류
    데이터 수집 시작과 종료
    공급자별 요청 및 실패 횟수
    DB 저장 오류
    시그널 평가 및 발생 결과
    스냅샷 생성 결과
    백그라운드 작업의 지연 및 실패

로그는 구조화된 형식을 사용하고, 동일한 오류가 과도하게 반복될 경우 로그량을 제어한다.
10.6. 테스트 가능성

NFR-006: 테스트 환경

외부 금융 데이터 API에 의존하지 않고도 주요 기능을 테스트할 수 있어야 한다.

이를 위해 다음을 지원한다.

    공급자 API Mock
    고정된 시세 데이터 Fixture
    테스트용 거래 이력
    고정된 기준 시각
    테스트용 포트폴리오
    테스트용 환율
    시그널 평가 결과 검증

실제 시장 데이터가 변하더라도 단위 테스트 결과는 동일해야 한다.

11. 프로젝트 디렉터리 구조

Backend와 Frontend를 분리하되, 하나의 저장소에서 관리하는 모노레포로
구성되어 있다.
jFolio/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── api/
│   │   │   │   └── routes/
│   │   │   ├── auth/
│   │   │   ├── cli/
│   │   │   ├── config/
│   │   │   ├── db/
│   │   │   ├── domain/
│   │   │   ├── providers/
│   │   │   │   ├── crypto/
│   │   │   │   ├── fx/
│   │   │   │   ├── mock/
│   │   │   │   └── stocks/
│   │   │   ├── repositories/
│   │   │   │   ├── memory/
│   │   │   │   └── mongo/
│   │   │   ├── scheduler/
│   │   │   ├── services/
│   │   │   └── users/
│   │   ├── test/
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── (app)/
│       │   │   ├── api/
│       │   │   └── login/
│       │   ├── components/
│       │   └── lib/
│       ├── test/
│       └── package.json
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── constants/
│       │   ├── schemas/
│       │   ├── types/
│       │   └── utils/
│       └── test/
├── docs/
│   ├── SPEC.md
│   ├── API.md
│   ├── DATA_MODEL.md
│   ├── DEVELOPMENT.md
│   └── IMPLEMENTATION_REPORT.md
├── deploy/
│   └── nginx/
├── scripts/
├── .env.example
├── package.json
└── README.md

`packages/shared`는 소스 전용 패키지다(`main`/`types`가 `src/index.ts`).
API는 tsup `noExternal`, 웹은 Next `transpilePackages`로 같은 소스를 사용한다.
리포지토리는 `memory`와 `mongo` 두 구현을 함께 유지한다.
11.1. 모듈 간 의존성 규칙

모듈 간 의존성은 다음 방향을 권장한다.
API Layer
↓
Application Services
↓
Domain Logic
↓
Repository Interfaces
↓
Database Implementations

데이터 공급자 역시 인터페이스를 통해 연결한다.

핵심 자산 평가 로직은 특정 공급자 API의 응답 형식에 의존하지 않아야 한다. 12. 환경 설정 및 실행
12.1. 환경변수

.env.example에 필요한 환경변수를 정의한다. 현재 기본값은 다음과 같다.

# Application

NODE_ENV=development
APP_TIMEZONE=Asia/Seoul
BASE_CURRENCY=KRW

# Backend API

API_HOST=127.0.0.1
API_PORT=3001
API_BASE_PATH=/api/v1
API_AUTH_TOKEN=

# Authentication / sessions

AUTH_REQUIRED=true
AUTH_LOCAL_ENABLED=true
AUTH_GOOGLE_ENABLED=false
SESSION_SECRET=local-development-session-secret-change-me
SESSION_STORE=mongo
SESSION_COOKIE_NAME=jfolio.sid
AUTH_CSRF_COOKIE_NAME=jfolio.csrf
SESSION_MAX_AGE_MS=604800000
SESSION_COOKIE_SECURE=auto
SESSION_COOKIE_SAMESITE=lax
SESSION_TRUST_PROXY=true
AUTH_BCRYPT_ROUNDS=12
AUTH_LOGIN_RATE_LIMIT_WINDOW_MS=900000
AUTH_LOGIN_RATE_LIMIT_MAX=10

# Frontend (Next.js server-side)

WEB_PORT=3000
API_BASE_URL=http://localhost:3001/api/v1
# API_AUTH_URL=http://localhost:3001/api/auth
# API_AUTH_TOKEN=
# NEXT_PUBLIC_TIME_ZONE=Asia/Seoul

# Database

MONGODB_URI=mongodb://localhost:27017/jFolio
MONGODB_DB=jFolio

# Collection

STOCK_COLLECTION_INTERVAL_SECONDS=60
CRYPTO_COLLECTION_INTERVAL_SECONDS=10
FX_COLLECTION_INTERVAL_SECONDS=60
STOCK_PROVIDER=live
CRYPTO_PROVIDER=live
FX_PROVIDER=live
COLLECTION_SCHEDULER_ENABLED=true
HISTORY_BACKFILL_ENABLED=true
HISTORY_BACKFILL_DAYS=365

# Snapshot

HOURLY_SNAPSHOT_ENABLED=true
DAILY_SNAPSHOT_ENABLED=true

# FX

STABLECOIN_USD_PEGS=USDT,USDC,BUSD,DAI,TUSD,FDUSD

# Provider credentials
# 기본 공급자(Binance/Yahoo/Frankfurter)는 공개 API라 키가 필요 없다.

API는 리포지토리 루트의 `.env`를 명시적으로 읽는다. Next.js는 그 파일을 읽지
않으므로 웹 변수(`API_BASE_URL`, `API_AUTH_URL`, `API_AUTH_TOKEN`,
`AUTH_REQUIRED`, `SESSION_COOKIE_NAME`, `AUTH_CSRF_COOKIE_NAME`,
`NEXT_PUBLIC_TIME_ZONE`)는 셸 또는 `apps/web/.env*`에서 제공한다. 운영에서는
PM2가 업로드한 `<DEPLOY_PATH>/.env`를 두 프로세스에 주입한다.

운영 환경에서는 `SESSION_SECRET`이 32자 이상이어야 하고
`SESSION_STORE=memory`는 거부된다. `AUTH_REQUIRED=false`는 레거시 무인증
모드이며 운영에서 사용하지 않는다. 계정은 다음 명령으로 생성한다.

CREATE_USER_PASSWORD='...' yarn create-user --email you@example.com --name "You"

보안 규칙

    .env는 Git에 커밋하지 않는다.
    .env.example에는 실제 비밀 정보를 기록하지 않는다.
    브라우저에 노출되는 NEXT_PUBLIC_ 환경변수에는 비밀 정보를 저장하지 않는다.
    개발·테스트·운영 환경의 설정을 분리한다.

12.2. 실행 명령

루트 `package.json`에서 다음 명령을 제공한다.

# 의존성 설치

yarn install

# 개발 모드 (API :3001 + Next.js :3000)

yarn dev
yarn dev:api
yarn dev:web

# 빌드·검사

yarn build
yarn typecheck
yarn lint

# 테스트

yarn test
yarn test:api
yarn test:web
yarn workspace @jfolio/api test test/financial.test.ts

# 시드·수집·백필

yarn seed
yarn collect:once
yarn backfill:history --days 30

# 백업·복원

yarn backup
yarn restore --dir backup/jfolio-backup-...

# 계정 생성

CREATE_USER_PASSWORD='...' yarn create-user --email you@example.com --name "You"

API 서버, 수집 스케줄러와 Next.js 웹 서버는 독립적으로 실행하고 종료할 수
있다. 테스트는 MongoDB나 네트워크 없이 인메모리 리포지토리·Mock 공급자·고정
시각으로 실행된다. 전체 운영 명령과 배포 절차는 `README.md`를 따른다.

13. MVP 개발 범위

초기부터 모든 기능을 구현하면 외부 API 선정, 금융 계산, 데이터 저장 및 UI 작업이 서로 얽혀 개발 복잡도가 높아진다.

따라서 데이터 수집 → 자산 평가 → 시계열 저장 → 시그널 → UI 순서로 점진적으로 구현한다.
Phase 1. 기본 인프라 및 데이터 수집

목표: 외부 시장 데이터를 수집하여 DB에 저장한다.

구현 항목:

    프로젝트 기본 구조 생성
    Backend API 구축
    Next.js 기본 앱 구축
    MongoDB 연결
    금융상품 마스터 관리
    시장 데이터 공급자 인터페이스
    최소 1개 주식 데이터 공급자 연동
    최소 1개 가상자산 데이터 공급자 연동
    환율 데이터 공급자 연동
    시세 수집 스케줄러
    과거 시세 저장
    최신 시세 조회
    수집 오류 및 상태 기록
    단위 테스트 및 통합 테스트

완료 조건

    최소 1개 주식, 1개 가상자산 및 1개 환율 데이터 공급자를 실제로 연동한다.
    수집 데이터가 DB에 저장된다.
    동일 데이터가 반복 수집되어도 중복 저장되지 않는다.
    최신 시세와 과거 시세를 API로 조회할 수 있다.
    공급자 장애 시 오류가 기록되고 복구가 가능하다.

외부 API 키나 유료 데이터 이용 권한이 없는 경우에는 Mock 공급자로 개발을 진행하되, 실제 연동 완료와 구분하여 보고한다.
Phase 2. 개인 포트폴리오 관리

목표: 개인이 보유한 자산을 등록하고 평가금액을 계산한다.

구현 항목:

    포트폴리오 생성
    거래 이력 등록 및 조회
    매수·매도 처리
    현금 잔액 관리
    보유 수량 계산
    평균 매입 원가 계산
    현재 평가금액 계산
    환율 환산
    미실현 손익 계산
    과거 시점 자산 평가

완료 조건

    사용자가 거래 이력을 등록하면 보유 수량이 정확하게 계산된다.
    매수·매도 이후 잔여 수량과 원가가 일관되게 유지된다.
    외화 자산이 KRW 기준으로 평가된다.
    과거 거래 이력과 시세를 사용해 과거 자산 현황을 복원할 수 있다.

Phase 3. Dashboard 및 시각화

목표: 자산 현황을 웹에서 직관적으로 조회한다.

구현 항목:

    전체 자산 평가금액
    전일 대비 변화
    자산별 평가금액
    자산군별 비중
    기간별 자산 평가금액 차트
    자산 상세 화면
    거래 이력 화면
    데이터 갱신 시각 표시
    오류 및 데이터 지연 표시

완료 조건

대시보드에 표시되는 주요 수치가 Backend API의 계산 결과와 일치해야 한다.
Phase 4. 투자 시그널

목표: 사용자가 설정한 조건에 따라 자동으로 시그널을 생성한다.

구현 항목:

    가격 급락 감지
    가격 급등 감지
    고정 가격 도달 감지
    사용자 정의 임계치
    시그널 중복 방지
    시그널 발생 이력
    웹 UI 시그널 목록
    규칙 활성화 및 비활성화

완료 조건

가격 변화 시뮬레이션을 통해 조건 충족 시 시그널이 발생하고, 조건이 지속되는 동안 중복 이벤트가 생성되지 않음을 검증한다.
Phase 5. 운영 안정화 및 확장

목표: 지속적으로 데이터를 수집하고 안정적으로 운영할 수 있는 시스템을 완성한다.

구현 항목:

    수집 실패 자동 복구
    과거 데이터 누락 검사
    스냅샷 자동 생성
    DB 백업 및 복구 절차
    사용자 인증
    데이터 공급자 추가
    수집 상태 모니터링
    성능 및 부하 테스트
    배포 및 운영 문서

14. 테스트 요구사항

AI Agent는 기능 구현뿐 아니라 테스트 코드도 작성해야 한다.
14.1. 금융 계산 테스트
테스트 ID 테스트 항목 기대 결과
T-001 수량 10, 가격 100 평가금액 1,000
T-002 수량 10, 가격 100, 매입 원가 800 미실현 손익 200
T-003 USD 자산 100달러, 환율 1,400원 KRW 평가금액 140,000원
T-004 매수 10주 후 매도 3주 잔여 수량 7주
T-005 거래 이력 없는 포트폴리오 보유 자산 없음
T-006 환율 데이터 누락 평가 불가 상태
T-007 거래 취소 후 재계산 보유 수량 및 원가 일치
T-008 동일 시세 반복 수집 중복 데이터 없음

T-001부터 T-004까지는 단순 계산에 대한 기본 테스트이며, 실제 구현에서는 수수료, 소수점 수량, 원가 계산 방식 등을 추가로 검증한다.
14.2. 시그널 테스트
테스트 ID 조건 기대 결과
T-101 기준 가격 100, 현재 가격 96 5% 하락 조건 미충족
T-102 기준 가격 100, 현재 가격 95 5% 하락 시그널 발생
T-103 기준 가격 100, 현재 가격 94 5% 하락 시그널 발생
T-104 조건이 지속적으로 충족 중복 시그널 억제
T-105 조건 해제 후 다시 충족 새 시그널 발생 가능
T-106 규칙 비활성화 시그널 미발생
T-107 가격이 0 또는 잘못된 값 유효하지 않은 데이터로 처리
14.3. 과거 데이터 테스트

    과거 특정 시점의 거래 이력이 올바르게 반영되는지 검증한다.
    과거 환율을 사용하여 평가금액을 계산하는지 검증한다.
    스냅샷과 재계산 결과를 비교한다.
    시세가 누락된 기간에 잘못된 평가금액을 생성하지 않는지 검증한다.
    시간대 변환 및 일별 스냅샷 경계가 정확한지 검증한다.

15. AI Agent 구현 지침

이 절은 실제 코드를 작성할 AI Agent를 위한 필수 작업 지침이다.
15.1. 구현 기본 원칙

    코드를 작성하기 전에 기존 저장소의 구조를 조사한다.
    기존 언어, 프레임워크, 패키지 매니저 및 코딩 규칙을 우선한다.
    기존 코드가 없다면 본 문서의 권장 구조를 사용한다.
    기능을 구현할 때 관련 테스트를 함께 작성한다.
    실제로 실행하지 않은 테스트를 통과했다고 보고하지 않는다.
    실제 연동하지 않은 외부 API를 연동 완료로 보고하지 않는다.
    구현하지 않은 기능을 완성된 기능으로 표시하지 않는다.
    금융 계산은 단위 테스트를 통해 검증한다.
    외부 API 호출과 DB 접근을 핵심 비즈니스 로직에서 분리한다.
    불확실한 요구사항은 임의로 확정하기보다 문서에 가정으로 기록한다.

15.2. 작업 순서

AI Agent는 다음 순서로 작업한다.

Step 1. 저장소 분석

    기존 파일과 디렉터리를 확인한다.
    package.json, TypeScript 설정, 테스트 설정을 확인한다.
    기존 DB 및 API 구조를 확인한다.
    현재 실행 가능한 테스트와 빌드 명령을 확인한다.

Step 2. 구현 계획 수립

    필요한 모듈을 정의한다.
    데이터 모델과 API 계약을 확정한다.
    외부 API 의존성을 식별한다.
    구현 순서와 테스트 계획을 작성한다.

Step 3. 핵심 기능 구현

    DB 모델 및 Repository
    금융상품 마스터
    데이터 공급자 인터페이스
    시세 수집기
    포트폴리오 계산
    시그널 엔진
    REST API
    Next.js UI

Step 4. 검증

    타입 검사
    코드 검사
    단위 테스트
    통합 테스트
    빌드
    실행 및 기본 기능 검증

Step 5. 결과 보고

다음 내용을 요약한다.

    구현된 기능
    변경된 파일
    실행 방법
    테스트 결과
    외부 API 연동 상태
    남은 작업
    발견된 문제점

15.3. 구현 완료 기준

다음 조건을 모두 충족해야 MVP가 완료된 것으로 판단한다.

    Backend와 Frontend가 독립적으로 실행된다.
    DB 연결과 데이터 저장이 정상 동작한다.
    시장 데이터 수집 작업이 실행된다.
    시세 및 과거 데이터를 조회할 수 있다.
    거래 이력으로부터 보유 자산을 계산할 수 있다.
    다중 통화 자산의 기준 통화 환산이 가능하다.
    대시보드에서 전체 자산 현황을 조회할 수 있다.
    과거 시점의 자산 현황을 조회할 수 있다.
    가격 하락 시그널이 정상적으로 발생한다.
    핵심 금융 계산 테스트가 통과한다.
    실행 및 설정 방법이 README에 기록되어 있다.

16. 초기 버전에서 제외할 기능

개발 범위가 불필요하게 커지는 것을 방지하기 위해 다음 기능은 초기 MVP에서 제외한다.

    증권사 계좌 자동 연결
    자동 매매 및 주문 실행
    세금 신고 및 세무 최적화
    복잡한 파생상품 평가
    옵션 및 선물의 증거금 계산
    AI 기반 매매 추천
    모바일 앱
    다중 사용자 공개 서비스
    이메일 및 모바일 푸시 알림
    외부 회계 시스템 연동

다만 데이터 모델과 모듈 구조는 향후 확장을 고려하여 설계한다.

17. 구현 전 반드시 결정해야 할 사항

현재 요구사항만으로 기본적인 개발은 시작할 수 있다. 그러나 다음 항목은 실제 운영에 영향을 미치므로 구현 전에 확인하거나, 초기 가정을 명시해야 한다.
항목 권장 초기 결정 이유
DB MongoDB 기존 개발 환경과의 호환성
기준 통화 KRW 전체 자산 평가의 일관성
사용자 수 단일 사용자로 시작 초기 인증 및 권한 구현 범위 축소
거래 입력 수동 입력 증권사 연동 없이 포트폴리오 구현 가능
주식 데이터 실제 이용 가능한 공급자 1개 이상 데이터 접근 권한 및 API 제한 확인
가상자산 데이터 거래소 API 1개 이상 가격 데이터 수집 및 검증
환율 데이터 환율 공급자 1개 이상 외화 자산의 KRW 환산
스냅샷 주기 1시간 및 1일 시간별·일별 자산 이력 관리
실시간성 공급자별 갱신 주기 준수 실제 시세 제공 조건 반영
투자 성과 평가손익과 기간 수익률 분리 입출금으로 인한 수익률 왜곡 방지

특히 중요한 결정은 시장 데이터 공급자 선정이다. 주식 시세는 시장과 공급자에 따라 실시간 제공 권한, 호출 제한, 과거 데이터 범위 및 상업적 이용 조건이 다르다. 따라서 공급자 인터페이스를 먼저 구현하고, 실제 공급자는 이용 가능한 API와 계약 조건을 확인한 후 연결하는 것이 좋다.

18. 최종 개발 권고

jFolio는 단순한 주가 조회 웹사이트가 아니라, 금융 데이터 수집과 개인의 거래 이력을 결합하여 과거와 현재의 자산 상태를 재구성하는 시스템으로 설계하는 것이 바람직하다.

초기 개발에서 가장 중요한 것은 화면의 완성도가 아니라 다음 세 가지다.

첫째, 시장 데이터의 신뢰성. 데이터의 출처, 기준 시각, 통화 및 수집 상태가 명확해야 한다.

둘째, 포트폴리오 계산의 정확성. 거래 이력과 과거 시세로부터 보유 수량, 평가금액 및 손익을 일관되게 계산할 수 있어야 한다.

셋째, 데이터의 시간적 일관성. 과거 시점의 자산 현황을 현재 데이터와 혼동하지 않고 복원할 수 있어야 한다.

이 세 가지가 확립되면 자산 대시보드, 시그널, 투자 성과 분석 및 AI 기반 분석 기능은 그 위에 단계적으로 추가할 수 있다.

부록 A. 현재 구현 현황 (2026-10-28)

A.1. 구현 완료

    모노레포: `packages/shared`(소스 전용) + `apps/api`(Express/MongoDB) + `apps/web`(Next.js 16/React 19).
    인증: 이메일/비밀번호 로그인, bcryptjs, MongoDB 서버 세션, CSRF double-submit, 로그인 rate limit, `/api/auth` 라우트, 로그인 페이지와 접근 제어. 계정은 `yarn create-user`로 생성한다.
    공급자: Binance(크립토), Yahoo Chart(주식/ETF, 국내 6자리 종목 접미사 자동 처리), Frankfurter(ECB FX), 결정적 Mock 공급자. 주식/ETF, 크립토, FX를 자산군별로 live/mock 선택할 수 있다.
    수집: 인프로세스 스케줄러, 수동 수집 API, 과거 일별 시세/FX 백필, UTC 자정·기동 시 `1d` 증분 생성, 최신 시세 물질화(`latest_quotes`).
    포트폴리오: 생성·조회·수정, 기본/숨김 포트폴리오, 단일 포트폴리오와 `All` 통합 대시보드, 과거 평가 시계열, 스냅샷.
    대시보드: 통합 기준 통화/기준 시각 헤더, 기간별 평가금액 차트(기본 `3M`), 최고/최저 주석, 자산군·통화 비중, 통화별 보유 종목 표와 통화 필터, 최근 시그널, 데이터 상태.
    평가: 이동평균 원가(매수 수수료 포함), 기준 통화 환산, FX 직접/역방향/스테이블코인 USD 페그 해석, 평가 불가를 `null`/`UNAVAILABLE`로 유지하고 합계에서 제외.
    시그널: 가격 하락·상승·임계치·포트폴리오 임계치 규칙, 중복 방지, 발생 이력, 웹 규칙 관리.
    운영: `yarn seed`, `yarn collect:once`, `yarn backfill:history`, `yarn backup`/`yarn restore`, PM2 기반 배포 스크립트, nginx TLS 부트스트랩, 빌드 버전 표시와 로딩 진행 UI.
    검증: `yarn typecheck`, `yarn lint`, `yarn test` 통과(shared 11, API 179, web 71 테스트).

A.2. 후속 범위

    Google SSO는 Phase 2용 구조(`user_identities`)만 준비되어 있고 라우트는 없다.
    회원가입·비밀번호 재설정·이메일 인증은 제공하지 않는다.
    인증 계정은 도입되었지만 포트폴리오·거래 데이터는 아직 `DEFAULT_USER_ID` 아래에서 공유된다.
    이메일·모바일 푸시 등 외부 알림 채널과 증권사 계좌 자동 연동은 포함되지 않는다.
