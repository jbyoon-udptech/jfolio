import { z } from "zod";
import { booleanQuery, currencyCode, isoDate, transactionTypeSchema } from "./common";

export const createPortfolioSchema = z.object({
  name: z.string().trim().min(1).max(128),
  baseCurrency: currencyCode.optional().default("KRW"),
  isDefault: z.boolean().optional().default(false),
});
export type CreatePortfolioDto = z.infer<typeof createPortfolioSchema>;

/**
 * FR-030: partial update. At least one mutable field must be present so an
 * empty PATCH is rejected instead of silently succeeding.
 */
export const updatePortfolioSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    baseCurrency: currencyCode.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "at least one of name, baseCurrency or isDefault is required",
  });
export type UpdatePortfolioDto = z.infer<typeof updatePortfolioSchema>;

export const createTransactionSchema = z.object({
  portfolioId: z.string().min(1),
  instrumentId: z.string().min(1),
  type: transactionTypeSchema,
  timestamp: isoDate,
  quantity: z.number().finite(),
  price: z.number().finite().nonnegative().optional().default(0),
  currency: currencyCode.optional(),
  fee: z.number().finite().nonnegative().optional().default(0),
  feeCurrency: currencyCode.optional(),
  externalReference: z.string().max(256).nullable().optional(),
  memo: z.string().max(1024).nullable().optional(),
});
export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = createTransactionSchema.partial();
export type UpdateTransactionDto = z.infer<typeof updateTransactionSchema>;

export const listTransactionsQuery = z.object({
  portfolioId: z.string().optional(),
  instrumentId: z.string().optional(),
  type: transactionTypeSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export const valuationQuery = z.object({
  baseCurrency: currencyCode.optional(),
  asOf: z.string().datetime({ offset: true }).optional(),
});

export const historyQuery = z.object({
  baseCurrency: currencyCode.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  interval: z.enum(["hourly", "daily"]).optional().default("daily"),
  includeSnapshots: booleanQuery.optional().default(false),
});
