import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { getCurrentSessionUser } from "../modules/auth/auth.service.js";
import {
  getSellerInventoryHistory,
  runManualInventoryAdjustment,
  runRestock,
  runWriteoff,
} from "../modules/inventory/inventory.service.js";
import {
  inventoryHistoryQuerySchema,
  inventoryOperationBodySchema,
} from "../modules/inventory/inventory.schemas.js";
import {
  addDraftItemBodySchema,
  checkoutBodySchema,
  createReturnBodySchema,
  deleteSaleBodySchema,
  draftItemParamsSchema,
  saleParamsSchema,
  salesListQuerySchema,
  updateDraftItemBodySchema,
} from "../modules/seller/seller.schemas.js";
import {
  addItemToDraft,
  checkoutDraft,
  createSaleReturn,
  deleteCompletedSale,
  getSellerDraft,
  getSellerHomeCatalog,
  listRecentSales,
  removeDraftSaleItem,
  updateDraftSaleItem,
} from "../modules/seller/seller.service.js";
import { getShiftHistory, getShiftState } from "../modules/shifts/shifts.service.js";
import { emitRealtimeEvent } from "../realtime/server.js";

export const sellerRouter = Router();

sellerRouter.use(requireAuth, requireRole("seller"));

sellerRouter.get(
  "/startup",
  asyncHandler(async (req, res) => {
    const userId = req.auth!.app_user_id;
    const [me, shiftState, shiftHistory] = await Promise.all([
      getCurrentSessionUser(userId),
      getShiftState(userId),
      getShiftHistory(userId, 7, 0),
    ]);

    if (!shiftState.activeShift || shiftState.activeShift.status !== "active") {
      res.json({
        me,
        shiftState,
        shiftHistory,
        catalog: null,
        draft: null,
        sales: null,
        inventoryHistory: null,
      });
      return;
    }

    const [catalog, draft, sales, inventoryHistory] = await Promise.all([
      getSellerHomeCatalog(userId),
      getSellerDraft(userId),
      listRecentSales(userId, 12),
      getSellerInventoryHistory(userId, 20),
    ]);

    res.json({
      me,
      shiftState,
      shiftHistory,
      catalog,
      draft,
      sales,
      inventoryHistory,
    });
  })
);

sellerRouter.get(
  "/catalog",
  asyncHandler(async (req, res) => {
    const result = await getSellerHomeCatalog(req.auth!.app_user_id);
    res.json(result);
  })
);

sellerRouter.get(
  "/inventory/history",
  asyncHandler(async (req, res) => {
    const query = inventoryHistoryQuerySchema.parse(req.query);
    const result = await getSellerInventoryHistory(req.auth!.app_user_id, query.limit);
    res.json(result);
  })
);

sellerRouter.post(
  "/inventory/manual-adjustment",
  asyncHandler(async (req, res) => {
    const body = inventoryOperationBodySchema.parse(req.body);
    const result = await runManualInventoryAdjustment({
      userId: req.auth!.app_user_id,
      productId: body.productId,
      quantity: body.quantity,
      reason: body.reason,
    });
    emitRealtimeEvent(
      {
        type: "inventory.updated",
        scope: {
          storeId: req.auth!.store_id,
          productId: body.productId,
        },
        meta: {
          sourceUserId: req.auth!.app_user_id,
          sourceRole: req.auth!.app_role,
        },
      },
      { roles: ["admin", "seller"], storeIds: [req.auth!.store_id] }
    );
    res.status(201).json(result);
  })
);

sellerRouter.post(
  "/inventory/restock",
  asyncHandler(async (req, res) => {
    const body = inventoryOperationBodySchema.parse(req.body);
    const result = await runRestock({
      userId: req.auth!.app_user_id,
      productId: body.productId,
      quantity: body.quantity,
      reason: body.reason,
    });
    emitRealtimeEvent(
      {
        type: "inventory.updated",
        scope: {
          storeId: req.auth!.store_id,
          productId: body.productId,
        },
        meta: {
          sourceUserId: req.auth!.app_user_id,
          sourceRole: req.auth!.app_role,
        },
      },
      { roles: ["admin", "seller"], storeIds: [req.auth!.store_id] }
    );
    res.status(201).json(result);
  })
);

sellerRouter.post(
  "/inventory/writeoff",
  asyncHandler(async (req, res) => {
    const body = inventoryOperationBodySchema.parse(req.body);
    const result = await runWriteoff({
      userId: req.auth!.app_user_id,
      productId: body.productId,
      quantity: body.quantity,
      reason: body.reason,
    });
    emitRealtimeEvent(
      {
        type: "inventory.updated",
        scope: {
          storeId: req.auth!.store_id,
          productId: body.productId,
        },
        meta: {
          sourceUserId: req.auth!.app_user_id,
          sourceRole: req.auth!.app_role,
        },
      },
      { roles: ["admin", "seller"], storeIds: [req.auth!.store_id] }
    );
    res.status(201).json(result);
  })
);

sellerRouter.get(
  "/sales",
  asyncHandler(async (req, res) => {
    const query = salesListQuerySchema.parse(req.query);
    const result = await listRecentSales(req.auth!.app_user_id, query.limit);
    res.json(result);
  })
);

sellerRouter.get(
  "/draft",
  asyncHandler(async (req, res) => {
    const result = await getSellerDraft(req.auth!.app_user_id);
    res.json(result);
  })
);

sellerRouter.post(
  "/draft/items",
  asyncHandler(async (req, res) => {
    const body = addDraftItemBodySchema.parse(req.body);
    const result = await addItemToDraft(req.auth!.app_user_id, body);
    res.status(201).json(result);
  })
);

sellerRouter.patch(
  "/draft/items/:itemId",
  asyncHandler(async (req, res) => {
    const params = draftItemParamsSchema.parse(req.params);
    const body = updateDraftItemBodySchema.parse(req.body);
    const result = await updateDraftSaleItem(req.auth!.app_user_id, params.itemId, {
      quantity: body.quantity,
      finalPrice: body.finalPrice,
      discountType: body.discountType,
      discountValue: body.discountValue,
    });
    res.json(result);
  })
);

sellerRouter.delete(
  "/draft/items/:itemId",
  asyncHandler(async (req, res) => {
    const params = draftItemParamsSchema.parse(req.params);
    const result = await removeDraftSaleItem(req.auth!.app_user_id, params.itemId);
    res.json(result);
  })
);

sellerRouter.post(
  "/sales/:saleId/delete",
  asyncHandler(async (req, res) => {
    const params = saleParamsSchema.parse(req.params);
    const body = deleteSaleBodySchema.parse(req.body);
    const result = await deleteCompletedSale(req.auth!.app_user_id, params.saleId, body.reason);
    emitRealtimeEvent(
      {
        type: "sales.updated",
        scope: {
          storeId: result.sale.store_id,
          sellerId: req.auth!.app_user_id,
        },
        meta: {
          sourceUserId: req.auth!.app_user_id,
          sourceRole: req.auth!.app_role,
        },
      },
      { roles: ["admin", "seller"], storeIds: [result.sale.store_id] }
    );
    emitRealtimeEvent(
      {
        type: "inventory.updated",
        scope: {
          storeId: result.sale.store_id,
        },
        meta: {
          sourceUserId: req.auth!.app_user_id,
          sourceRole: req.auth!.app_role,
        },
      },
      { roles: ["admin", "seller"], storeIds: [result.sale.store_id] }
    );
    res.json(result);
  })
);

sellerRouter.post(
  "/returns",
  asyncHandler(async (req, res) => {
    const body = createReturnBodySchema.parse(req.body);
    const result = await createSaleReturn(req.auth!.app_user_id, body);
    emitRealtimeEvent(
      {
        type: "sales.updated",
        scope: {
          storeId: result.return.store_id,
          sellerId: req.auth!.app_user_id,
        },
        meta: {
          sourceUserId: req.auth!.app_user_id,
          sourceRole: req.auth!.app_role,
        },
      },
      { roles: ["admin", "seller"], storeIds: [result.return.store_id] }
    );
    emitRealtimeEvent(
      {
        type: "inventory.updated",
        scope: {
          storeId: result.return.store_id,
        },
        meta: {
          sourceUserId: req.auth!.app_user_id,
          sourceRole: req.auth!.app_role,
        },
      },
      { roles: ["admin", "seller"], storeIds: [result.return.store_id] }
    );
    res.status(201).json(result);
  })
);

sellerRouter.post(
  "/checkout",
  asyncHandler(async (req, res) => {
    const body = checkoutBodySchema.parse(req.body);
    const result = await checkoutDraft(req.auth!.app_user_id, body.paymentMethod);
    emitRealtimeEvent(
      {
        type: "sales.updated",
        scope: {
          storeId: result.sale.store_id,
          sellerId: req.auth!.app_user_id,
        },
        meta: {
          sourceUserId: req.auth!.app_user_id,
          sourceRole: req.auth!.app_role,
        },
      },
      { roles: ["admin", "seller"], storeIds: [result.sale.store_id] }
    );
    emitRealtimeEvent(
      {
        type: "inventory.updated",
        scope: {
          storeId: result.sale.store_id,
        },
        meta: {
          sourceUserId: req.auth!.app_user_id,
          sourceRole: req.auth!.app_role,
        },
      },
      { roles: ["admin", "seller"], storeIds: [result.sale.store_id] }
    );
    res.status(201).json(result);
  })
);
