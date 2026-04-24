import { HttpError } from "../../lib/http-error.js";
import { withTransaction } from "../../lib/db.js";
import {
  applyInventoryMovement,
  applyInventoryMovementInTransaction,
  notifyInventoryMovementIfNeeded,
} from "../inventory/inventory.service.js";
import { findOpenShiftByUserId } from "../shifts/shifts.repository.js";
import { findCurrentAssignment } from "../users/users.repository.js";
import {
  createReturn,
  createDraftSale,
  createSale,
  deleteDraftItem,
  deleteDraftSale,
  findDraftItemById,
  findDraftSaleForSeller,
  findSaleById,
  getSellerCatalog,
  insertDraftItem,
  insertReturnItems,
  insertSaleItems,
  listReturnedQuantitiesBySaleItemIds,
  listSalesByStore,
  listSaleItems,
  listSaleItemsBySaleIds,
  listDraftSaleItems,
  softDeleteSale,
  updateDraftItem,
  type DraftSaleItemRecord,
  type SaleItemRecord,
} from "./seller.repository.js";

type DraftSummary = {
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  itemsCount: number;
};

function computeLineTotal(quantity: number, finalPrice: number) {
  return Number((quantity * finalPrice).toFixed(2));
}

function computeReturnLineTotal(quantity: number, returnedPrice: number) {
  return Number((quantity * returnedPrice).toFixed(2));
}

function draftDiscountMatches(
  item: Pick<DraftSaleItemRecord, "discount_type" | "discount_value" | "final_price">,
  params: { discountType?: "amount" | "percent" | null; discountValue?: number | null; finalPrice: number }
) {
  return (
    item.discount_type === (params.discountType ?? null) &&
    (item.discount_value ?? null) === (params.discountValue ?? null) &&
    item.final_price === params.finalPrice
  );
}

async function findMergeableDraftItem(
  draftSaleId: string,
  productId: string,
  params: { discountType?: "amount" | "percent" | null; discountValue?: number | null; finalPrice: number }
) {
  const items = await listDraftSaleItems(draftSaleId);

  return (
    items.find(
      (item) => item.product_id === productId && draftDiscountMatches(item, params)
    ) ?? null
  );
}

function computeDraftSummary(items: DraftSaleItemRecord[]): DraftSummary {
  const subtotalAmount = Number(
    items.reduce((sum, item) => sum + item.base_price * item.quantity, 0).toFixed(2)
  );
  const totalAmount = Number(items.reduce((sum, item) => sum + item.line_total, 0).toFixed(2));
  const discountAmount = Number((subtotalAmount - totalAmount).toFixed(2));
  const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    subtotalAmount,
    discountAmount,
    totalAmount,
    itemsCount,
  };
}

async function getSellerContext(userId: string) {
  const assignment = await findCurrentAssignment(userId);
  if (!assignment) {
    throw new HttpError(403, "Seller has no active store assignment");
  }

  const shift = await findOpenShiftByUserId(userId);
  if (!shift || shift.status === "closed") {
    throw new HttpError(409, "Active shift is required for seller operations");
  }

  if (shift.store_id !== assignment.store_id) {
    throw new HttpError(409, "Open shift store does not match current assignment");
  }

  if (shift.status === "paused") {
    throw new HttpError(409, "Resume the shift before working with sales");
  }

  return {
    assignment,
    shift,
  };
}

async function ensureDraftSale(userId: string, storeId: string, shiftId: string) {
  const existing = await findDraftSaleForSeller(userId);

  if (existing && existing.store_id === storeId && existing.shift_id === shiftId) {
    return existing;
  }

  if (existing) {
    await deleteDraftSale(existing.id);
  }

  return createDraftSale({
    sellerId: userId,
    storeId,
    shiftId,
  });
}

function resolveFinalPrice(input: {
  basePrice: number;
  finalPrice?: number;
  discountType?: "amount" | "percent" | null;
  discountValue?: number | null;
}) {
  if (typeof input.finalPrice === "number") {
    return Number(input.finalPrice.toFixed(2));
  }

  if (!input.discountType || input.discountValue == null) {
    return Number(input.basePrice.toFixed(2));
  }

  if (input.discountType === "amount") {
    return Number(Math.max(0, input.basePrice - input.discountValue).toFixed(2));
  }

  return Number(Math.max(0, input.basePrice * (1 - input.discountValue / 100)).toFixed(2));
}

export async function getSellerHomeCatalog(userId: string) {
  const { assignment, shift } = await getSellerContext(userId);
  const rows = await getSellerCatalog(assignment.store_id);

  return {
    store: assignment,
    shift,
    products: rows.map((row) => ({
      id: row.product.id,
      name: row.product.name,
      sku: row.product.sku,
      defaultPrice: row.product.default_price,
      storePrice: row.price,
      stock: row.stock_quantity,
      isEnabled: row.is_enabled,
      isActive: row.product.is_active,
    })),
  };
}

export async function getSellerDraft(userId: string) {
  const { assignment, shift } = await getSellerContext(userId);
  const draft = await ensureDraftSale(userId, assignment.store_id, shift.id);
  const items = await listDraftSaleItems(draft.id);

  return {
    draft,
    items,
    summary: computeDraftSummary(items),
  };
}

export async function addItemToDraft(
  userId: string,
  input: {
    productId: string;
    quantity: number;
    finalPrice?: number;
    discountType?: "amount" | "percent";
    discountValue?: number;
  }
) {
  const { assignment, shift } = await getSellerContext(userId);
  const draft = await ensureDraftSale(userId, assignment.store_id, shift.id);
  const catalog = await getSellerCatalog(assignment.store_id);
  const catalogItem = catalog.find((item) => item.product_id === input.productId);

  if (!catalogItem || !catalogItem.product.is_active || !catalogItem.is_enabled) {
    throw new HttpError(404, "Product is not available in the assigned store");
  }

  const basePrice = catalogItem.price;
  const finalPrice = resolveFinalPrice({
    basePrice,
    finalPrice: input.finalPrice,
    discountType: input.discountType ?? null,
    discountValue: input.discountValue ?? null,
  });

  const existing = await findMergeableDraftItem(draft.id, input.productId, {
    discountType: input.discountType ?? null,
    discountValue: input.discountValue ?? null,
    finalPrice,
  });

  if (existing) {
    await updateDraftItem(existing.id, {
      quantity: Number((existing.quantity + input.quantity).toFixed(3)),
      final_price: finalPrice,
      discount_type: input.discountType ?? null,
      discount_value: input.discountValue ?? null,
      line_total: computeLineTotal(existing.quantity + input.quantity, finalPrice),
    });
  } else {
    await insertDraftItem({
      draft_sale_id: draft.id,
      product_id: input.productId,
      product_name_snapshot: catalogItem.product.name,
      sku_snapshot: catalogItem.product.sku,
      base_price: basePrice,
      final_price: finalPrice,
      discount_type: input.discountType ?? null,
      discount_value: input.discountValue ?? null,
      quantity: input.quantity,
      line_total: computeLineTotal(input.quantity, finalPrice),
    });
  }

  return getSellerDraft(userId);
}

export async function updateDraftSaleItem(
  userId: string,
  itemId: string,
  input: {
    quantity?: number;
    finalPrice?: number;
    discountType?: "amount" | "percent" | null;
    discountValue?: number | null;
    discountScope?: "line" | "single_unit";
  }
) {
  const draftState = await getSellerDraft(userId);
  const item = await findDraftItemById(draftState.draft.id, itemId);

  if (!item) {
    throw new HttpError(404, "Draft item not found");
  }

  const nextQuantity = input.quantity ?? item.quantity;
  const isDiscountUpdate = input.discountType !== undefined || input.discountValue !== undefined;
  const nextDiscountType = input.discountType === undefined ? item.discount_type : input.discountType;
  const nextDiscountValue = input.discountValue === undefined ? item.discount_value : input.discountValue;
  const nextFinalPrice = resolveFinalPrice({
    basePrice: item.base_price,
    finalPrice: input.finalPrice !== undefined ? input.finalPrice : isDiscountUpdate ? undefined : item.final_price,
    discountType: nextDiscountType,
    discountValue: nextDiscountValue,
  });

  const shouldSplitSingleUnit =
    input.discountScope === "single_unit" &&
    isDiscountUpdate &&
    nextDiscountType != null &&
    nextDiscountValue != null &&
    item.quantity > 1;

  if (shouldSplitSingleUnit) {
    const remainingQuantity = Number((item.quantity - 1).toFixed(3));

    await updateDraftItem(item.id, {
      quantity: remainingQuantity,
      final_price: item.base_price,
      discount_type: null,
      discount_value: null,
      line_total: computeLineTotal(remainingQuantity, item.base_price),
    });

    await insertDraftItem({
      draft_sale_id: draftState.draft.id,
      product_id: item.product_id,
      product_name_snapshot: item.product_name_snapshot,
      sku_snapshot: item.sku_snapshot,
      base_price: item.base_price,
      final_price: nextFinalPrice,
      discount_type: nextDiscountType,
      discount_value: nextDiscountValue,
      quantity: 1,
      line_total: computeLineTotal(1, nextFinalPrice),
    });

    return getSellerDraft(userId);
  }

  await updateDraftItem(item.id, {
    quantity: nextQuantity,
    final_price: nextFinalPrice,
    discount_type: nextDiscountType,
    discount_value: nextDiscountValue,
    line_total: computeLineTotal(nextQuantity, nextFinalPrice),
  });

  return getSellerDraft(userId);
}

export async function removeDraftSaleItem(userId: string, itemId: string) {
  const draftState = await getSellerDraft(userId);
  const item = await findDraftItemById(draftState.draft.id, itemId);

  if (!item) {
    throw new HttpError(404, "Draft item not found");
  }

  await deleteDraftItem(item.id);
  return getSellerDraft(userId);
}

export async function checkoutDraft(userId: string, paymentMethod: "cash" | "card") {
  const { assignment, shift } = await getSellerContext(userId);
  const draftState = await getSellerDraft(userId);

  if (draftState.items.length === 0) {
    throw new HttpError(409, "Draft cart is empty");
  }

  const result = await withTransaction(async (client) => {
    const sale = await createSale(
      {
        sellerId: userId,
        storeId: assignment.store_id,
        shiftId: shift.id,
        paymentMethod,
        subtotalAmount: draftState.summary.subtotalAmount,
        discountAmount: draftState.summary.discountAmount,
        totalAmount: draftState.summary.totalAmount,
      },
      client
    );

    await insertSaleItems(
      sale.id,
      draftState.items.map((item) => ({
        productId: item.product_id,
        productNameSnapshot: item.product_name_snapshot,
        skuSnapshot: item.sku_snapshot,
        basePrice: item.base_price,
        finalPrice: item.final_price,
        discountType: item.discount_type,
        discountValue: item.discount_value,
        quantity: item.quantity,
        lineTotal: item.line_total,
      })),
      client
    );

    const movements = [];
    for (const item of draftState.items) {
      const movementInput = {
        storeId: assignment.store_id,
        productId: item.product_id,
        actorUserId: userId,
        movementType: "sale" as const,
        quantityDelta: -item.quantity,
        saleId: sale.id,
        shiftId: shift.id,
        reason: `Sale checkout for ${item.product_name_snapshot}`,
      };
      const movement = await applyInventoryMovementInTransaction(movementInput, client);
      movements.push({ input: movementInput, movement });
    }

    await deleteDraftSale(draftState.draft.id, client);

    return { sale, movements };
  });

  for (const movement of result.movements) {
    notifyInventoryMovementIfNeeded(movement.input, movement.movement);
  }

  return {
    sale: result.sale,
    items: draftState.items,
    summary: draftState.summary,
  };
}

export async function deleteCompletedSale(userId: string, saleId: string, reason: string) {
  const { assignment, shift } = await getSellerContext(userId);
  const sale = await findSaleById(saleId);

  if (!sale) {
    throw new HttpError(404, "Sale not found");
  }

  if (sale.store_id !== assignment.store_id) {
    throw new HttpError(403, "Sale belongs to another store");
  }

  if (sale.status !== "completed") {
    throw new HttpError(409, "Only completed sales can be deleted");
  }

  const saleItems = await listSaleItems(sale.id);
  if (saleItems.length === 0) {
    throw new HttpError(409, "Sale has no items to restore");
  }

  const deletedSale = await softDeleteSale({
    saleId: sale.id,
    deletedBy: userId,
    reason,
  });

  for (const item of saleItems) {
    await applyInventoryMovement({
      storeId: assignment.store_id,
      productId: item.product_id,
      actorUserId: userId,
      movementType: "sale_deletion",
      quantityDelta: item.quantity,
      saleId: sale.id,
      shiftId: shift.id,
      reason: `Sale deleted: ${reason}`,
    });
  }

  return {
    sale: deletedSale,
    items: saleItems,
  };
}

export async function createSaleReturn(
  userId: string,
  input: {
    saleId: string;
    reason: string;
    items: Array<{
      saleItemId: string;
      quantity: number;
    }>;
  }
) {
  const { assignment, shift } = await getSellerContext(userId);
  const sale = await findSaleById(input.saleId);

  if (!sale) {
    throw new HttpError(404, "Sale not found");
  }

  if (sale.store_id !== assignment.store_id) {
    throw new HttpError(403, "Sale belongs to another store");
  }

  if (sale.status !== "completed") {
    throw new HttpError(409, "Returns can only be created for completed sales");
  }

  const saleItems = await listSaleItems(sale.id);
  const saleItemMap = new Map<string, SaleItemRecord>(saleItems.map((item) => [item.id, item]));
  const returnedQuantities = await listReturnedQuantitiesBySaleItemIds(saleItems.map((item) => item.id));
  const returnedQuantityMap = new Map(returnedQuantities.map((item) => [item.sale_item_id, item.returned_quantity]));

  const normalizedItems = input.items.map((requested) => {
    const original = saleItemMap.get(requested.saleItemId);

    if (!original) {
      throw new HttpError(404, `Sale item ${requested.saleItemId} not found`);
    }

    if (requested.quantity > original.quantity) {
      throw new HttpError(409, `Return quantity exceeds sold quantity for ${original.product_name_snapshot}`);
    }

    const alreadyReturnedQuantity = returnedQuantityMap.get(original.id) ?? 0;
    const remainingQuantity = Number((original.quantity - alreadyReturnedQuantity).toFixed(3));

    if (remainingQuantity <= 0) {
      throw new HttpError(409, `No remaining quantity can be returned for ${original.product_name_snapshot}`);
    }

    if (requested.quantity > remainingQuantity) {
      throw new HttpError(
        409,
        `Return quantity exceeds remaining quantity for ${original.product_name_snapshot}`
      );
    }

    return {
      original,
      quantity: requested.quantity,
      lineTotal: computeReturnLineTotal(requested.quantity, original.final_price),
    };
  });

  const totalAmount = Number(
    normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)
  );

  const createdReturn = await createReturn({
    saleId: sale.id,
    sellerId: userId,
    storeId: assignment.store_id,
    shiftId: shift.id,
    reason: input.reason,
    totalAmount,
  });

  await insertReturnItems(
    createdReturn.id,
    normalizedItems.map((item) => ({
      saleItemId: item.original.id,
      productId: item.original.product_id,
      productNameSnapshot: item.original.product_name_snapshot,
      skuSnapshot: item.original.sku_snapshot,
      returnedPrice: item.original.final_price,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    }))
  );

  for (const item of normalizedItems) {
    await applyInventoryMovement({
      storeId: assignment.store_id,
      productId: item.original.product_id,
      actorUserId: userId,
      movementType: "return",
      quantityDelta: item.quantity,
      saleId: sale.id,
      returnId: createdReturn.id,
      shiftId: shift.id,
      reason: `Return created: ${input.reason}`,
    });
  }

  return {
    return: createdReturn,
    items: normalizedItems.map((item) => ({
      saleItemId: item.original.id,
      productId: item.original.product_id,
      productName: item.original.product_name_snapshot,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    totalAmount,
  };
}

export async function listRecentSales(userId: string, limit: number) {
  const { assignment } = await getSellerContext(userId);
  const sales = await listSalesByStore(assignment.store_id, limit);
  const saleItems = await listSaleItemsBySaleIds(sales.map((sale) => sale.id));
  const itemsBySaleId = saleItems.reduce<Map<string, typeof saleItems>>((map, item) => {
    const items = map.get(item.sale_id) ?? [];
    items.push(item);
    map.set(item.sale_id, items);
    return map;
  }, new Map());

  const salesWithItems = sales.map((sale) => ({
    ...sale,
    items: itemsBySaleId.get(sale.id) ?? [],
  }));

  return {
    storeId: assignment.store_id,
    storeName: assignment.store_name,
    sales: salesWithItems,
  };
}
