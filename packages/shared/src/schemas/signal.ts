import { z } from "zod";
import { referenceTypeSchema, signalTypeSchema } from "./common";

export const createSignalRuleSchema = z
  .object({
    portfolioId: z.string().min(1).nullable().optional(),
    instrumentId: z.string().min(1),
    signalType: signalTypeSchema,
    threshold: z.number().finite(),
    referenceType: referenceTypeSchema,
    referenceValue: z.number().finite().nullable().optional(),
    windowSeconds: z.number().int().positive().nullable().optional(),
    isEnabled: z.boolean().optional().default(true),
    cooldownSeconds: z.number().int().nonnegative().nullable().optional(),
  })
  .refine(
    (rule) =>
      rule.referenceType !== "FIXED_PRICE" ||
      (rule.referenceValue !== null && rule.referenceValue !== undefined),
    { message: "referenceValue is required when referenceType is FIXED_PRICE", path: ["referenceValue"] },
  )
  .refine((rule) => rule.threshold >= 0, {
    message: "threshold must be a non-negative number",
    path: ["threshold"],
  });
export type CreateSignalRuleDto = z.infer<typeof createSignalRuleSchema>;

export const updateSignalRuleSchema = z.object({
  threshold: z.number().finite().nonnegative().optional(),
  referenceValue: z.number().finite().nullable().optional(),
  windowSeconds: z.number().int().positive().nullable().optional(),
  isEnabled: z.boolean().optional(),
  cooldownSeconds: z.number().int().nonnegative().nullable().optional(),
});
export type UpdateSignalRuleDto = z.infer<typeof updateSignalRuleSchema>;

export const listSignalEventsQuery = z.object({
  ruleId: z.string().optional(),
  instrumentId: z.string().optional(),
  portfolioId: z.string().optional(),
  status: z.enum(["OPEN", "RESOLVED", "IGNORED"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
