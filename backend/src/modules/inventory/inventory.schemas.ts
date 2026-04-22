import { z } from "zod";

export const inventoryOperationBodySchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive().max(1_000_000),
  reason: z.string().trim().min(1).max(500),
});

export const inventoryHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
});
