import { z } from "zod";

export const telegramAuthBodySchema = z.object({
  initData: z.string().min(1),
});

export const impersonationParamsSchema = z.object({
  sellerId: z.string().uuid(),
});

export const devLoginBodySchema = z.object({
  telegramId: z.number().int().positive().optional(),
  role: z.enum(["admin", "seller"]).optional(),
}).refine((value) => value.telegramId || value.role, {
  message: "telegramId or role is required",
});

export type TelegramAuthBody = z.infer<typeof telegramAuthBodySchema>;
