import type {
  Instrument,
  SignalEvent,
  SignalRule,
  SignalType,
} from "@jfolio/shared";
import { newId } from "../domain/ids";
import { dec, isPositiveFinite, multiply } from "../domain/money";
import type { Repositories } from "../repositories/types";
import { NotFoundError } from "./transaction.service";

export interface CreateSignalRuleInput {
  portfolioId?: string | null;
  instrumentId: string;
  signalType: SignalType;
  threshold: number;
  referenceType: SignalRule["referenceType"];
  referenceValue?: number | null;
  windowSeconds?: number | null;
  isEnabled?: boolean;
  cooldownSeconds?: number | null;
}

export interface SignalEvaluationContext {
  instrument: Instrument;
  observedPrice: number;
  observedAt: Date;
  /** Pre-resolved reference price, if the caller already knows it. */
  referencePrice?: number | null;
  /** Portfolio value for PORTFOLIO_THRESHOLD rules. */
  portfolioValue?: number | null;
}

export interface ConditionEvaluation {
  conditionMet: boolean;
  referencePrice: number;
  changeRate: number;
  invalid?: string;
}

export interface EvaluationOutcome {
  ruleId: string;
  triggered: boolean;
  suppressed: boolean;
  reason: string;
  event?: SignalEvent;
  changeRate?: number;
  referencePrice?: number;
}

export class SignalService {
  constructor(
    private readonly repos: Repositories,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---- Rule CRUD -----------------------------------------------------------

  async createRule(input: CreateSignalRuleInput): Promise<SignalRule> {
    const instrument = await this.repos.instruments.findById(input.instrumentId);
    if (!instrument) throw new NotFoundError(`Instrument ${input.instrumentId} not found`);
    if (input.referenceType === "FIXED_PRICE" && input.referenceValue == null) {
      throw new Error("referenceValue is required for FIXED_PRICE rules");
    }
    const now = this.now();
    const rule: SignalRule = {
      ruleId: newId("rule"),
      portfolioId: input.portfolioId ?? null,
      instrumentId: input.instrumentId,
      signalType: input.signalType,
      threshold: input.threshold,
      referenceType: input.referenceType,
      referenceValue: input.referenceValue ?? null,
      windowSeconds: input.windowSeconds ?? null,
      isEnabled: input.isEnabled ?? true,
      cooldownSeconds: input.cooldownSeconds ?? null,
      isTriggered: false,
      episode: 0,
      lastTriggeredAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return this.repos.signalRules.create(rule);
  }

  async updateRule(ruleId: string, patch: Partial<SignalRule>): Promise<SignalRule | null> {
    return this.repos.signalRules.update(ruleId, patch);
  }

  async getRule(ruleId: string): Promise<SignalRule | null> {
    return this.repos.signalRules.findById(ruleId);
  }

  async listRules(filter?: {
    portfolioId?: string;
    instrumentId?: string;
    isEnabled?: boolean;
  }): Promise<SignalRule[]> {
    return this.repos.signalRules.list(filter);
  }

  async disableRule(ruleId: string): Promise<SignalRule | null> {
    return this.repos.signalRules.update(ruleId, { isEnabled: false, isTriggered: false });
  }

  async listEvents(filter?: Parameters<Repositories["signalEvents"]["list"]>[0]) {
    return this.repos.signalEvents.list(filter);
  }

  // ---- Evaluation ----------------------------------------------------------

  /** Resolve the reference price for a rule (FR-061). */
  async resolveReferencePrice(rule: SignalRule, ctx: SignalEvaluationContext): Promise<number | null> {
    if (ctx.referencePrice != null) return ctx.referencePrice;
    switch (rule.referenceType) {
      case "FIXED_PRICE":
        return rule.referenceValue ?? null;
      case "PREVIOUS_CLOSE": {
        const startOfDay = new Date(ctx.observedAt);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const previous = await this.repos.quotes.getLastBefore(
          rule.instrumentId,
          startOfDay,
          "1d",
        );
        const fallback = previous ?? (await this.repos.quotes.getLastBefore(rule.instrumentId, startOfDay));
        return fallback?.price ?? null;
      }
      case "ROLLING_HIGH": {
        const windowMs = (rule.windowSeconds ?? 86_400) * 1000;
        const from = new Date(ctx.observedAt.getTime() - windowMs);
        const quotes = await this.repos.quotes.getHistorical(rule.instrumentId, {
          from,
          to: ctx.observedAt,
          limit: 5000,
        });
        const prices = quotes.map((q) => q.high ?? q.price).filter(isPositiveFinite);
        return prices.length ? Math.max(...prices) : null;
      }
      case "ROLLING_WINDOW": {
        const windowMs = (rule.windowSeconds ?? 86_400) * 1000;
        const at = new Date(ctx.observedAt.getTime() - windowMs);
        const quote = await this.repos.quotes.getLastBefore(rule.instrumentId, new Date(at.getTime() + 1));
        return quote?.price ?? null;
      }
      default:
        return null;
    }
  }

  /** Pure condition evaluation — no side effects (testable in isolation). */
  evaluateCondition(
    rule: SignalRule,
    ctx: SignalEvaluationContext,
    referencePrice: number | null,
  ): ConditionEvaluation {
    if (!isPositiveFinite(ctx.observedPrice)) {
      return { conditionMet: false, referencePrice: 0, changeRate: 0, invalid: "INVALID_OBSERVED_PRICE" };
    }
    switch (rule.signalType) {
      case "PRICE_DROP": {
        if (!isPositiveFinite(referencePrice)) {
          return { conditionMet: false, referencePrice: 0, changeRate: 0, invalid: "NO_REFERENCE_PRICE" };
        }
        const changeRate = multiply(dec(ctx.observedPrice).minus(referencePrice).div(referencePrice).toNumber(), 100);
        return { conditionMet: changeRate <= -rule.threshold, referencePrice, changeRate };
      }
      case "PRICE_RISE": {
        if (!isPositiveFinite(referencePrice)) {
          return { conditionMet: false, referencePrice: 0, changeRate: 0, invalid: "NO_REFERENCE_PRICE" };
        }
        const changeRate = multiply(dec(ctx.observedPrice).minus(referencePrice).div(referencePrice).toNumber(), 100);
        return { conditionMet: changeRate >= rule.threshold, referencePrice, changeRate };
      }
      case "PRICE_THRESHOLD": {
        const changeRate = multiply(dec(ctx.observedPrice).minus(rule.threshold).div(rule.threshold).toNumber(), 100);
        return { conditionMet: ctx.observedPrice <= rule.threshold, referencePrice: rule.threshold, changeRate };
      }
      case "PORTFOLIO_THRESHOLD": {
        const value = ctx.portfolioValue;
        if (value == null || !Number.isFinite(value)) {
          return { conditionMet: false, referencePrice: rule.threshold, changeRate: 0, invalid: "NO_PORTFOLIO_VALUE" };
        }
        const changeRate = rule.threshold === 0 ? 0 : multiply(dec(value).minus(rule.threshold).div(rule.threshold).toNumber(), 100);
        return { conditionMet: value <= rule.threshold, referencePrice: rule.threshold, changeRate };
      }
      default:
        return { conditionMet: false, referencePrice: 0, changeRate: 0, invalid: "UNSUPPORTED_SIGNAL_TYPE" };
    }
  }

  /**
   * FR-063: Evaluate one rule and apply de-duplication / cooldown state
   * transitions, persisting an event only on a genuine new episode.
   */
  async evaluateRule(
    rule: SignalRule,
    ctx: SignalEvaluationContext,
  ): Promise<EvaluationOutcome> {
    if (!rule.isEnabled) {
      return { ruleId: rule.ruleId, triggered: false, suppressed: false, reason: "RULE_DISABLED" };
    }
    const referencePrice = await this.resolveReferencePrice(rule, ctx);
    const evaluation = this.evaluateCondition(rule, ctx, referencePrice);
    if (evaluation.invalid) {
      return {
        ruleId: rule.ruleId,
        triggered: false,
        suppressed: false,
        reason: evaluation.invalid,
        referencePrice: referencePrice ?? undefined,
      };
    }

    const now = this.now();
    if (!evaluation.conditionMet) {
      if (rule.isTriggered) {
        await this.repos.signalRules.update(rule.ruleId, { isTriggered: false });
      }
      return {
        ruleId: rule.ruleId,
        triggered: false,
        suppressed: false,
        reason: "CONDITION_NOT_MET",
        referencePrice: evaluation.referencePrice,
        changeRate: evaluation.changeRate,
      };
    }

    // Condition is met. Decide whether this is a new episode.
    const cooldownMs = (rule.cooldownSeconds ?? 0) * 1000;
    const cooldownElapsed =
      rule.lastTriggeredAt != null &&
      cooldownMs > 0 &&
      now.getTime() - rule.lastTriggeredAt.getTime() >= cooldownMs;
    if (rule.isTriggered && !cooldownElapsed) {
      return {
        ruleId: rule.ruleId,
        triggered: false,
        suppressed: true,
        reason: "DEDUPLICATED_WHILE_CONDITION_HELD",
        referencePrice: evaluation.referencePrice,
        changeRate: evaluation.changeRate,
      };
    }

    const event: SignalEvent = {
      eventId: newId("evt"),
      ruleId: rule.ruleId,
      portfolioId: rule.portfolioId ?? null,
      instrumentId: rule.instrumentId,
      signalType: rule.signalType,
      triggeredAt: now,
      referencePrice: evaluation.referencePrice,
      observedPrice: ctx.observedPrice,
      changeRate: evaluation.changeRate,
      threshold: rule.threshold,
      status: "OPEN",
      notificationStatus: "PENDING",
      deduplicationKey: `ep${rule.episode}`,
      message: buildMessage(rule, evaluation.referencePrice, ctx.observedPrice, evaluation.changeRate),
      error: null,
    };
    const inserted = await this.repos.signalEvents.insert(event);
    await this.repos.signalRules.update(rule.ruleId, {
      isTriggered: true,
      episode: rule.episode + 1,
      lastTriggeredAt: now,
    });

    return {
      ruleId: rule.ruleId,
      triggered: inserted,
      suppressed: !inserted,
      reason: inserted ? "TRIGGERED" : "DUPLICATE_EVENT_KEY",
      event: inserted ? event : undefined,
      referencePrice: evaluation.referencePrice,
      changeRate: evaluation.changeRate,
    };
  }

  /**
   * Evaluate every enabled rule for an instrument against a freshly observed
   * price. Called by the collection pipeline after storing a quote.
   */
  async processObservedPrice(
    instrument: Instrument,
    observedPrice: number,
    observedAt: Date,
    portfolioValue?: number | null,
  ): Promise<EvaluationOutcome[]> {
    const rules = await this.repos.signalRules.findByInstrument(instrument.instrumentId);
    const outcomes: EvaluationOutcome[] = [];
    for (const rule of rules) {
      if (!rule.isEnabled) continue;
      const outcome = await this.evaluateRule(rule, {
        instrument,
        observedPrice,
        observedAt,
        portfolioValue,
      });
      outcomes.push(outcome);
    }
    return outcomes;
  }
}

function buildMessage(
  rule: SignalRule,
  referencePrice: number,
  observedPrice: number,
  changeRate: number,
): string {
  const pct = changeRate.toFixed(2);
  switch (rule.signalType) {
    case "PRICE_DROP":
      return `가격 하락 ${pct}% (기준 ${referencePrice} → 현재 ${observedPrice}, 임계 ${rule.threshold}%)`;
    case "PRICE_RISE":
      return `가격 상승 ${pct}% (기준 ${referencePrice} → 현재 ${observedPrice}, 임계 ${rule.threshold}%)`;
    case "PRICE_THRESHOLD":
      return `가격이 목표 ${rule.threshold} 이하로 도달 (현재 ${observedPrice})`;
    case "PORTFOLIO_THRESHOLD":
      return `포트폴리오 평가금액이 ${rule.threshold} 이하 (현재 ${observedPrice})`;
    default:
      return `시그널 발생 (${rule.signalType})`;
  }
}
