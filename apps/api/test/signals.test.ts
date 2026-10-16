import { describe, expect, it } from "vitest";
import { createInstrument, createTestContext, FIXED_NOW } from "./helpers";
import type { Instrument, SignalRule } from "@jfolio/shared";

async function setupDropRule(container: ReturnType<typeof createTestContext>["container"]) {
  const instrument: Instrument = await createInstrument(container, {
    symbol: "AAA",
    name: "Asset A",
    assetType: "STOCK",
    market: "KRX",
    currency: "KRW",
    providers: [],
  });
  const rule: SignalRule = await container.signals.createRule({
    instrumentId: instrument.instrumentId,
    signalType: "PRICE_DROP",
    threshold: 5,
    referenceType: "FIXED_PRICE",
    referenceValue: 100,
  });
  return { instrument, rule };
}

describe("14.2 signal evaluation", () => {
  it("T-101: a 4% drop does not meet the 5% threshold", async () => {
    const { container } = createTestContext();
    const { instrument, rule } = await setupDropRule(container);

    const outcomes = await container.signals.processObservedPrice(instrument, 96, FIXED_NOW);
    expect(outcomes[0]?.triggered).toBe(false);
    expect(outcomes[0]?.reason).toBe("CONDITION_NOT_MET");
    expect(await container.signals.listEvents({ ruleId: rule.ruleId })).toMatchObject({ total: 0 });
  });

  it("T-102: a 5% drop triggers a signal", async () => {
    const { container } = createTestContext();
    const { instrument, rule } = await setupDropRule(container);

    const outcomes = await container.signals.processObservedPrice(instrument, 95, FIXED_NOW);
    expect(outcomes[0]?.triggered).toBe(true);
    expect(outcomes[0]?.event?.changeRate).toBe(-5);

    const events = await container.signals.listEvents({ ruleId: rule.ruleId });
    expect(events.total).toBe(1);
    expect(events.items[0]?.observedPrice).toBe(95);
  });

  it("T-103: a 6% drop also triggers a signal", async () => {
    const { container } = createTestContext();
    const { instrument, rule } = await setupDropRule(container);

    const outcomes = await container.signals.processObservedPrice(instrument, 94, FIXED_NOW);
    expect(outcomes[0]?.triggered).toBe(true);
    const events = await container.signals.listEvents({ ruleId: rule.ruleId });
    expect(events.total).toBe(1);
  });

  it("T-104: while the condition holds, repeat signals are suppressed", async () => {
    const { container } = createTestContext();
    const { instrument, rule } = await setupDropRule(container);

    await container.signals.processObservedPrice(instrument, 95, FIXED_NOW);
    const second = await container.signals.processObservedPrice(instrument, 94, FIXED_NOW);

    expect(second[0]?.triggered).toBe(false);
    expect(second[0]?.suppressed).toBe(true);
    expect(second[0]?.reason).toBe("DEDUPLICATED_WHILE_CONDITION_HELD");
    expect((await container.signals.listEvents({ ruleId: rule.ruleId })).total).toBe(1);
  });

  it("T-105: after the condition clears, a new drop produces a new signal", async () => {
    const { container } = createTestContext();
    const { instrument, rule } = await setupDropRule(container);

    await container.signals.processObservedPrice(instrument, 95, FIXED_NOW);
    // Condition clears (price recovers).
    await container.signals.processObservedPrice(instrument, 100, FIXED_NOW);
    const again = await container.signals.processObservedPrice(instrument, 95, FIXED_NOW);

    expect(again[0]?.triggered).toBe(true);
    const events = await container.signals.listEvents({ ruleId: rule.ruleId });
    expect(events.total).toBe(2);
    expect(new Set(events.items.map((e) => e.deduplicationKey))).toEqual(
      new Set(["ep0", "ep1"]),
    );
  });

  it("T-106: a disabled rule never fires", async () => {
    const { container } = createTestContext();
    const { instrument, rule } = await setupDropRule(container);
    await container.signals.disableRule(rule.ruleId);

    const outcomes = await container.signals.processObservedPrice(instrument, 90, FIXED_NOW);
    expect(outcomes).toHaveLength(0);
    expect((await container.signals.listEvents({ ruleId: rule.ruleId })).total).toBe(0);
  });

  it("T-107: a zero or negative price is treated as invalid data", async () => {
    const { container } = createTestContext();
    const { instrument, rule } = await setupDropRule(container);

    const zero = await container.signals.processObservedPrice(instrument, 0, FIXED_NOW);
    expect(zero[0]?.triggered).toBe(false);
    expect(zero[0]?.reason).toBe("INVALID_OBSERVED_PRICE");

    const negative = await container.signals.processObservedPrice(instrument, -10, FIXED_NOW);
    expect(negative[0]?.reason).toBe("INVALID_OBSERVED_PRICE");

    const nan = await container.signals.processObservedPrice(instrument, Number.NaN, FIXED_NOW);
    expect(nan[0]?.reason).toBe("INVALID_OBSERVED_PRICE");

    expect((await container.signals.listEvents({ ruleId: rule.ruleId })).total).toBe(0);
  });

  it("T-107b: a PRICE_THRESHOLD rule fires at or below the target", async () => {
    const { container } = createTestContext();
    const instrument = await createInstrument(container, {
      symbol: "AAA",
      name: "Asset A",
      assetType: "STOCK",
      market: "KRX",
      currency: "KRW",
      providers: [],
    });
    const rule = await container.signals.createRule({
      instrumentId: instrument.instrumentId,
      signalType: "PRICE_THRESHOLD",
      threshold: 50,
      referenceType: "FIXED_PRICE",
      referenceValue: 50,
    });

    const above = await container.signals.processObservedPrice(instrument, 51, FIXED_NOW);
    expect(above[0]?.triggered).toBe(false);
    const at = await container.signals.processObservedPrice(instrument, 50, FIXED_NOW);
    expect(at[0]?.triggered).toBe(true);
    expect((await container.signals.listEvents({ ruleId: rule.ruleId })).total).toBe(1);
  });
});
