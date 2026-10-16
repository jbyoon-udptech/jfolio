import type { Instrument, InstrumentInput } from "@jfolio/shared";
import { newId } from "../domain/ids";
import type { InstrumentFilter, ListResult, Repositories } from "../repositories/types";
import { ConflictError, NotFoundError } from "./errors";

/**
 * FR-001 / FR-002 / FR-003: Asset master management. The natural key
 * (symbol + market + currency) is kept unique so the same instrument cannot be
 * registered twice, while provider symbols stay decoupled per provider link.
 */
export class InstrumentService {
  constructor(private readonly repos: Repositories) {}

  async create(input: InstrumentInput): Promise<Instrument> {
    const existing = await this.repos.instruments.findBySymbol(
      input.symbol,
      input.market,
      input.currency,
    );
    if (existing) {
      throw new ConflictError(
        `Instrument ${input.symbol}/${input.market}/${input.currency} already exists`,
      );
    }
    const now = new Date();
    const instrument: Instrument = {
      instrumentId: input.instrumentId ?? newId("ins"),
      symbol: input.symbol,
      name: input.name,
      assetType: input.assetType,
      market: input.market,
      currency: input.currency,
      isActive: input.isActive ?? true,
      isWatchlist: input.isWatchlist ?? false,
      providers: input.providers ?? [],
      createdAt: now,
      updatedAt: now,
    };
    return this.repos.instruments.create(instrument);
  }

  /** Idempotent create used by seeding / provider bootstrapping. */
  async upsert(input: InstrumentInput): Promise<Instrument> {
    const existing = await this.repos.instruments.findBySymbol(
      input.symbol,
      input.market,
      input.currency,
    );
    const now = new Date();
    const instrument: Instrument = {
      instrumentId: existing?.instrumentId ?? input.instrumentId ?? newId("ins"),
      symbol: input.symbol,
      name: input.name,
      assetType: input.assetType,
      market: input.market,
      currency: input.currency,
      isActive: input.isActive ?? existing?.isActive ?? true,
      isWatchlist: input.isWatchlist ?? existing?.isWatchlist ?? false,
      providers: input.providers ?? existing?.providers ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return this.repos.instruments.upsertByNaturalKey(instrument);
  }

  async get(instrumentId: string): Promise<Instrument | null> {
    return this.repos.instruments.findById(instrumentId);
  }

  async getOrThrow(instrumentId: string): Promise<Instrument> {
    const instrument = await this.repos.instruments.findById(instrumentId);
    if (!instrument) throw new NotFoundError(`Instrument ${instrumentId} not found`);
    return instrument;
  }

  async list(filter: InstrumentFilter = {}): Promise<ListResult<Instrument>> {
    return this.repos.instruments.list(filter);
  }

  async update(instrumentId: string, patch: Partial<Instrument>): Promise<Instrument | null> {
    const existing = await this.repos.instruments.findById(instrumentId);
    if (!existing) throw new NotFoundError(`Instrument ${instrumentId} not found`);
    // Guard the natural key if any of its components change.
    const symbol = patch.symbol ?? existing.symbol;
    const market = patch.market ?? existing.market;
    const currency = patch.currency ?? existing.currency;
    if (symbol !== existing.symbol || market !== existing.market || currency !== existing.currency) {
      const clash = await this.repos.instruments.findBySymbol(symbol, market, currency);
      if (clash && clash.instrumentId !== instrumentId) {
        throw new ConflictError(`Instrument ${symbol}/${market}/${currency} already exists`);
      }
    }
    return this.repos.instruments.update(instrumentId, patch);
  }

  /**
   * SPEC 8.3: deleting an instrument that may be referenced by transactions or
   * snapshots is a soft delete (deactivate) to preserve history.
   */
  async deactivate(instrumentId: string): Promise<Instrument | null> {
    const existing = await this.repos.instruments.findById(instrumentId);
    if (!existing) throw new NotFoundError(`Instrument ${instrumentId} not found`);
    return this.repos.instruments.update(instrumentId, { isActive: false });
  }

  async findActive(): Promise<Instrument[]> {
    return this.repos.instruments.findActive();
  }
}
