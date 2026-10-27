import { ApiErrorNotice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { SignalRuleActions } from "@/components/SignalRuleActions";
import { SignalRuleForm } from "@/components/SignalRuleForm";
import { StatusBadge } from "@/components/StatusBadge";
import type { Option } from "@/components/TransactionForm";
import { api, safe } from "@/lib/api";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

/** UI-005: signal rule management and event history. */
export default async function SignalsPage() {
  const [rulesResult, eventsResult, instrumentsResult, portfoliosResult] = await Promise.all([
    safe(() => api.signalRules()),
    safe(() => api.signalEvents({})),
    safe(() => api.instruments()),
    safe(() => api.portfolios()),
  ]);

  if (!rulesResult.data) {
    return <ApiErrorNotice error={rulesResult.error} />;
  }

  const rules = rulesResult.data.items;
  const events = eventsResult.data?.items ?? [];
  const instruments = instrumentsResult.data?.items ?? [];
  const portfolios = portfoliosResult.data?.items ?? [];

  const instrumentOptions: Option[] = instruments.map((i) => ({
    value: i.instrumentId,
    label: `${i.name} (${i.symbol})`,
  }));
  const portfolioOptions: Option[] = portfolios.map((p) => ({
    value: p.portfolioId,
    label: p.name,
  }));

  const symbolOf = (instrumentId: string) =>
    instruments.find((i) => i.instrumentId === instrumentId)?.symbol ?? instrumentId;
  const ruleOf = (ruleId: string) => rules.find((r) => r.ruleId === ruleId);

  return (
    <>
      <PageHeader
        title="시그널"
        subtitle="가격/포트폴리오 조건을 정의하고, 조건 충족 시 발생한 이력을 확인합니다. 동일 조건이 지속되는 동안에는 중복 발생하지 않습니다."
      />

      {instrumentOptions.length > 0 ? (
        <SignalRuleForm instruments={instrumentOptions} portfolios={portfolioOptions} />
      ) : (
        <div className="notice" style={{ marginBottom: 16 }}>
          시그널 규칙을 만들려면 자산이 먼저 필요합니다. (시드 데이터를 실행하세요.)
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>시그널 규칙 ({rules.length})</h2>
        {rules.length === 0 ? (
          <div className="empty">등록된 시그널 규칙이 없습니다.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>자산</th>
                <th>유형</th>
                <th className="num">임계값</th>
                <th>기준</th>
                <th className="num">관측기간(초)</th>
                <th className="num">쿨다운(초)</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.ruleId}>
                  <td>
                    <a href={`/assets/${rule.instrumentId}`}>{symbolOf(rule.instrumentId)}</a>
                  </td>
                  <td>{rule.signalType}</td>
                  <td className="num">{rule.threshold}</td>
                  <td>
                    {rule.referenceType}
                    {rule.referenceValue !== null ? ` (${rule.referenceValue})` : ""}
                  </td>
                  <td className="num">{rule.windowSeconds ?? "—"}</td>
                  <td className="num">{rule.cooldownSeconds ?? "—"}</td>
                  <td>
                    <StatusBadge status={rule.isEnabled ? "NORMAL" : "IGNORED"} />
                  </td>
                  <td>
                    <SignalRuleActions ruleId={rule.ruleId} isEnabled={rule.isEnabled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>발생 이력 ({eventsResult.data?.total ?? events.length})</h2>
        {events.length === 0 ? (
          <div className="empty">발생한 시그널이 없습니다.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>발생 시각</th>
                <th>자산</th>
                <th>유형</th>
                <th className="num">관측값</th>
                <th className="num">기준값</th>
                <th className="num">변동률</th>
                <th>중복키</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const rule = ruleOf(event.ruleId);
                return (
                  <tr key={event.eventId}>
                    <td className="muted">{formatDateTime(event.triggeredAt)}</td>
                    <td>{symbolOf(event.instrumentId)}</td>
                    <td>{event.signalType}</td>
                    <td className="num">{formatNumber(event.observedPrice)}</td>
                    <td className="num">
                      {event.referencePrice === null ? "—" : formatNumber(event.referencePrice)}
                    </td>
                    <td className="num">{formatPercent(event.changeRate)}</td>
                    <td className="muted" title={rule ? `rule ${rule.ruleId}` : undefined}>
                      {event.deduplicationKey}
                    </td>
                    <td>
                      <StatusBadge status={event.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
