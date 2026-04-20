import { z } from "zod";

export const adminDashboardQuerySchema = z.object({
  recentSalesLimit: z.coerce.number().int().positive().max(50).default(12),
  lowStockLimit: z.coerce.number().int().positive().max(50).default(12),
});

export const adminStoreParamsSchema = z.object({
  storeId: z.string().uuid(),
});

export const adminSellerParamsSchema = z.object({
  sellerId: z.string().uuid(),
});

export const createAdminStoreBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(240).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateAdminStoreBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    address: z.string().trim().max(240).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.address !== undefined || value.isActive !== undefined, {
    message: "At least one field is required",
  });

export const assignSellerBodySchema = z.object({
  storeId: z.string().uuid(),
});

export const createAdminSellerBodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  telegramId: z.coerce.number().int().positive(),
  storeId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

export const adminInventoryQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  historyLimit: z.coerce.number().int().positive().max(100).default(20),
});

export const adminStoreProductParamsSchema = z.object({
  storeProductId: z.string().uuid(),
});

export const adminProductParamsSchema = z.object({
  productId: z.string().uuid(),
});

export const adminProductsQuerySchema = z.object({
  archived: z.coerce.boolean().optional().default(false),
});

export const createAdminProductBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().min(2).max(60),
  defaultPrice: z.number().nonnegative(),
  isActive: z.boolean().optional(),
});

export const updateAdminProductBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    sku: z.string().trim().min(2).max(60).optional(),
    defaultPrice: z.number().nonnegative().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.sku !== undefined ||
      value.defaultPrice !== undefined ||
      value.isActive !== undefined,
    {
      message: "At least one field is required",
    }
  );

export const updateAdminStoreProductBodySchema = z
  .object({
    price: z.number().nonnegative().optional(),
    isEnabled: z.boolean().optional(),
  })
  .refine((value) => value.price !== undefined || value.isEnabled !== undefined, {
    message: "At least one field is required",
  });

export const adminInventoryAdjustmentBodySchema = z.object({
  storeId: z.string().uuid(),
  productId: z.string().uuid(),
  movementType: z.enum(["manual_adjustment", "restock", "writeoff"]),
  quantity: z.number().nonnegative(),
  reason: z.string().trim().min(1).max(500),
});

export const adminSalesQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  saleStatus: z.enum(["all", "completed", "deleted"]).default("all"),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(30),
});
