import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import {
  adminInventoryAdjustmentBodySchema,
  adminInventoryQuerySchema,
  adminDashboardQuerySchema,
  adminProductParamsSchema,
  adminSellerParamsSchema,
  adminSalesQuerySchema,
  adminStoreProductParamsSchema,
  adminStoreParamsSchema,
  assignSellerBodySchema,
  createAdminProductBodySchema,
  createAdminStoreBodySchema,
  updateAdminProductBodySchema,
  updateAdminStoreProductBodySchema,
  updateAdminStoreBodySchema,
} from "../modules/admin/admin.schemas.js";
import {
  assignSellerToStore,
  createAdminInventoryAdjustment,
  createProduct,
  createStore,
  deleteProduct,
  getAdminDashboard,
  getAdminInventory,
  getAdminProducts,
  getAdminSalesOverview,
  getAdminStaff,
  getAdminStores,
  updateStore,
  updateProduct,
  updateStoreProductSettings,
} from "../modules/admin/admin.service.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const query = adminDashboardQuerySchema.parse(req.query);
    const result = await getAdminDashboard(query);
    res.json(result);
  })
);

adminRouter.get(
  "/stores",
  asyncHandler(async (_req, res) => {
    const result = await getAdminStores();
    res.json(result);
  })
);

adminRouter.post(
  "/stores",
  asyncHandler(async (req, res) => {
    const body = createAdminStoreBodySchema.parse(req.body);
    const result = await createStore(body);
    res.status(201).json(result);
  })
);

adminRouter.patch(
  "/stores/:storeId",
  asyncHandler(async (req, res) => {
    const params = adminStoreParamsSchema.parse(req.params);
    const body = updateAdminStoreBodySchema.parse(req.body);
    const result = await updateStore(params.storeId, body);
    res.json(result);
  })
);

adminRouter.get(
  "/staff",
  asyncHandler(async (_req, res) => {
    const result = await getAdminStaff();
    res.json(result);
  })
);

adminRouter.get(
  "/sales",
  asyncHandler(async (req, res) => {
    const query = adminSalesQuerySchema.parse(req.query);
    const result = await getAdminSalesOverview(query);
    res.json(result);
  })
);

adminRouter.get(
  "/inventory",
  asyncHandler(async (req, res) => {
    const query = adminInventoryQuerySchema.parse(req.query);
    const result = await getAdminInventory(query);
    res.json(result);
  })
);

adminRouter.get(
  "/products",
  asyncHandler(async (_req, res) => {
    const result = await getAdminProducts();
    res.json(result);
  })
);

adminRouter.post(
  "/products",
  asyncHandler(async (req, res) => {
    const body = createAdminProductBodySchema.parse(req.body);
    const result = await createProduct(body);
    res.status(201).json(result);
  })
);

adminRouter.patch(
  "/products/:productId",
  asyncHandler(async (req, res) => {
    const params = adminProductParamsSchema.parse(req.params);
    const body = updateAdminProductBodySchema.parse(req.body);
    const result = await updateProduct(params.productId, body);
    res.json(result);
  })
);

adminRouter.delete(
  "/products/:productId",
  asyncHandler(async (req, res) => {
    const params = adminProductParamsSchema.parse(req.params);
    const result = await deleteProduct(params.productId);
    res.json(result);
  })
);

adminRouter.patch(
  "/store-products/:storeProductId",
  asyncHandler(async (req, res) => {
    const params = adminStoreProductParamsSchema.parse(req.params);
    const body = updateAdminStoreProductBodySchema.parse(req.body);
    const result = await updateStoreProductSettings({
      storeProductId: params.storeProductId,
      price: body.price,
      isEnabled: body.isEnabled,
    });
    res.json(result);
  })
);

adminRouter.post(
  "/inventory/adjustment",
  asyncHandler(async (req, res) => {
    const body = adminInventoryAdjustmentBodySchema.parse(req.body);
    const result = await createAdminInventoryAdjustment({
      adminUserId: req.auth!.app_user_id,
      storeId: body.storeId,
      productId: body.productId,
      movementType: body.movementType,
      quantity: body.quantity,
      reason: body.reason,
    });
    res.status(201).json(result);
  })
);

adminRouter.post(
  "/staff/:sellerId/assignment",
  asyncHandler(async (req, res) => {
    const params = adminSellerParamsSchema.parse(req.params);
    const body = assignSellerBodySchema.parse(req.body);
    const result = await assignSellerToStore({
      adminUserId: req.auth!.app_user_id,
      sellerUserId: params.sellerId,
      storeId: body.storeId,
    });
    res.json(result);
  })
);
