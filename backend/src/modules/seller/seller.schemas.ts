import { z } from "zod";

const quantitySchema = z.number().positive().max(999);
const moneySchema = z.number().nonnegative().max(100_000);
const discountTypeSchema = z.enum(["amount", "percent"]);
const discountValueSchema = z.number().nonnegative().max(100_000);
const discountScopeSchema = z.enum(["line", "single_unit"]);

function validateDiscountValue(value: { discountType?: "amount" | "percent" | null; discountValue?: number | null }, ctx: z.RefinementCtx) {
  if (value.discountType === "percent" && value.discountValue != null && value.discountValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discountValue"],
      message: "Percent discount cannot exceed 100",
    });
  }
}

export const addDraftItemBodySchema = z
  .object({
    productId: z.string().uuid(),
    quantity: quantitySchema,
    finalPrice: moneySchema.optional(),
    discountType: discountTypeSchema.optional(),
    discountValue: discountValueSchema.optional(),
  })
  .superRefine(validateDiscountValue);

export const updateDraftItemBodySchema = z
  .object({
    quantity: quantitySchema.optional(),
    finalPrice: moneySchema.optional(),
    discountType: discountTypeSchema.nullable().optional(),
    discountValue: discountValueSchema.nullable().optional(),
    discountScope: discountScopeSchema.optional(),
  })
  .superRefine(validateDiscountValue);

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
        quantity: quantitySchema,
      })
    )
    .min(1),
});

export const salesListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
});
