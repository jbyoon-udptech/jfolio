import type { Transaction, TransactionInput } from "@jfolio/shared";
import { newId } from "../domain/ids";
import type { ListResult, Repositories, TransactionFilter } from "../repositories/types";
import { NotFoundError, ValidationError } from "./errors";
import { PositionService } from "./position.service";

export { ConflictError, NotFoundError, ValidationError } from "./errors";

/**
 * FR-032 / FR-034: Manages the immutable-ish transaction ledger. Any change to
 * the ledger invalidates snapshots at or after the affected timestamp so
 * historical valuations are recomputed rather than silently stale.
 */
export class TransactionService {
  private readonly positions: PositionService;

  constructor(private readonly repos: Repositories) {
    this.positions = new PositionService(repos);
  }

  async create(input: TransactionInput): Promise<Transaction> {
    const portfolio = await this.repos.portfolios.findById(input.portfolioId);
    if (!portfolio) throw new NotFoundError(`Portfolio ${input.portfolioId} not found`);
    const instrument = await this.repos.instruments.findById(input.instrumentId);
    if (!instrument) throw new NotFoundError(`Instrument ${input.instrumentId} not found`);

    const currency = input.currency ?? instrument.currency;
    if (input.type === "SELL" && input.quantity <= 0) {
      throw new ValidationError("SELL quantity must be positive");
    }
    if (input.type === "SPLIT" && input.quantity <= 0) {
      throw new ValidationError("SPLIT ratio must be positive");
    }

    const now = new Date();
    const transaction: Transaction = {
      transactionId: input.transactionId ?? newId("tx"),
      portfolioId: input.portfolioId,
      instrumentId: input.instrumentId,
      type: input.type,
      timestamp: input.timestamp,
      quantity: input.quantity,
      price: input.price ?? 0,
      currency,
      fee: input.fee ?? 0,
      feeCurrency: input.feeCurrency ?? currency,
      externalReference: input.externalReference ?? null,
      memo: input.memo ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.repos.transactions.create(transaction);
    await this.invalidateSnapshots(created.portfolioId, created.timestamp);
    return created;
  }

  async update(transactionId: string, patch: Partial<Transaction>): Promise<Transaction> {
    const existing = await this.repos.transactions.findById(transactionId);
    if (!existing) throw new NotFoundError(`Transaction ${transactionId} not found`);
    const updated = await this.repos.transactions.update(transactionId, patch);
    if (!updated) throw new NotFoundError(`Transaction ${transactionId} not found`);
    const earliest = new Date(Math.min(existing.timestamp.getTime(), updated.timestamp.getTime()));
    await this.invalidateSnapshots(updated.portfolioId, earliest);
    return updated;
  }

  async delete(transactionId: string): Promise<void> {
    const existing = await this.repos.transactions.findById(transactionId);
    if (!existing) throw new NotFoundError(`Transaction ${transactionId} not found`);
    await this.repos.transactions.delete(transactionId);
    await this.invalidateSnapshots(existing.portfolioId, existing.timestamp);
  }

  async get(transactionId: string): Promise<Transaction | null> {
    return this.repos.transactions.findById(transactionId);
  }

  async list(filter: TransactionFilter = {}): Promise<ListResult<Transaction>> {
    return this.repos.transactions.list(filter);
  }

  private async invalidateSnapshots(portfolioId: string, from: Date): Promise<void> {
    await this.repos.snapshots.deleteAfter(portfolioId, from);
  }
}
