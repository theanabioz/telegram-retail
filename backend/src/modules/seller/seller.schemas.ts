import { z } from "zod";

export const addDraftItemBodySchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  finalPrice: z.number().nonnegative().optional(),
  discountType: z.enum(["amount", "percent"]).optional(),
  discountValue: z.number().nonnegative().optional(),
});

export const updateDraftItemBodySchema = z.object({
  quantity: z.number().positive().optional(),
  finalPrice: z.number().nonnegative().optional(),
  discountType: z.enum(["amount", "percent"]).nullable().optional(),
  discountValue: z.number().nonnegative().nullable().optional(),
});

export const draftItemParamsSchema = z.object({
  itemId: z.string().uuid(),
});

export const checkoutBodySchema = z.object({
  paymentMethod: z.enum(["cash", "card"]),
});

export const saleParamsSchema = z.object({
  saleId: z.string().uuid(),
});

export const deleteSaleBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const createReturnBodySchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  items: z
    .array(
      z.object({
        saleItemId: z.string().uuid(),
        quantity: z.number().positive(),
      })
    )
    .min(1),
});

export const salesListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
});
