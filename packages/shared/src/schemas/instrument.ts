import { z } from "zod";
import { assetTypeSchema, booleanQuery, currencyCode } from "./common";

export const providerLinkSchema = z.object({
  providerId: z.string().min(1),
  providerSymbol: z.string().min(1),
});

export const createInstrumentSchema = z.object({
  symbol: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(256),
  assetType: assetTypeSchema,
  market: z.string().trim().min(1).max(64),
  currency: currencyCode,
  isActive: z.boolean().optional().default(true),
  isWatchlist: z.boolean().optional().default(false),
  providers: z.array(providerLinkSchema).optional().default([]),
});
export type CreateInstrumentDto = z.infer<typeof createInstrumentSchema>;

export const updateInstrumentSchema = createInstrumentSchema.partial();
export type UpdateInstrumentDto = z.infer<typeof updateInstrumentSchema>;

export const listInstrumentsQuery = z.object({
  assetType: assetTypeSchema.optional(),
  market: z.string().optional(),
  currency: currencyCode.optional(),
  isActive: booleanQuery.optional(),
  isWatchlist: booleanQuery.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export const quotesQuery = z.object({
  interval: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(500),
});
