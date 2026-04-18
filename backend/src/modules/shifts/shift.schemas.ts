import { z } from "zod";

export const startShiftBodySchema = z.object({
  storeId: z.string().uuid(),
});

export const stopShiftBodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const shiftHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(7),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const shiftParamsSchema = z.object({
  shiftId: z.string().uuid(),
});
