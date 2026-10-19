import { z } from "zod";

/**
 * Canonical email form. The API always stores and looks users up by this value
 * so `User@Example.com` and `user@example.com` cannot create two accounts.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const email = z
  .string()
  .trim()
  .email("A valid email address is required")
  .max(254)
  .transform(normalizeEmail);

/** bcrypt only considers the first 72 bytes, so reject longer inputs. */
export function passwordByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine((value) => passwordByteLength(value) <= 72, {
    message: "Password must be at most 72 bytes",
  });

/**
 * Login only checks presence/length: password policy is enforced when the
 * account is created, so existing passwords remain usable if policy changes.
 */
export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(128),
});

export const createUserSchema = z.object({
  email,
  name: z.string().trim().min(1).max(100),
  password: passwordSchema,
  role: z.enum(["user", "admin"]).optional().default("user"),
  status: z.enum(["active", "disabled"]).optional().default("active"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
