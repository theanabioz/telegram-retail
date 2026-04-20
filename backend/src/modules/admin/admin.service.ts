import {
  closeCurrentAssignment,
  createAdminUser,
  createAdminProduct,
  createAdminStore,
  deleteAdminProduct,
  archiveAdminProduct,
  createInventoryRowsForProduct,
  createStoreProductsForProduct,
  createUserStoreAssignment,
  findAdminProductById,
  findAdminStoreById,
  findAdminStoreProductById,
  listAdminReturnItems,
  listAdminReturns,
  listAdminSales,
  listAdminSaleItems,
  listAdminStores,
  listAdminStoreProducts,
  listAdminUsers,
  listCurrentAssignments,
  listInventoryRows,
  listOpenShifts,
  listProducts,
  restoreAdminProduct,
  getProductReferenceCounts,
  updateAdminStore,
  updateAdminProduct,
  updateAdminStoreProduct,
} from "./admin.repository.js";
import { HttpError } from "../../lib/http-error.js";
import { findCurrentAssignment, findUserById } from "../users/users.repository.js";
import { listInventoryHistory } from "../inventory/inventory.repository.js";
import { runAdminInventoryAdjustment } from "../inventory/inventory.service.js";
import { findOpenShiftByUserId } from "../shifts/shifts.repository.js";

function startOfTodayIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

function buildAdminSalesSummary(input: {
  sales: Awaited<ReturnType<typeof listAdminSales>>;
  returns: Awaited<ReturnType<typeof listAdminReturns>>;
}) {
  const revenue = Number(input.sales.reduce((sum, sale) => sum + sale.total_amount, 0).toFixed(2));
  const cashTotal = Number(
    input.sales
      .filter((sale) => sale.payment_method === "cash")
      .reduce((sum, sale) => sum + sale.total_amount, 0)
      .toFixed(2)
  );
  const cardTotal = Number(
    input.sales
      .filter((sale) => sale.payment_method === "card")
      .reduce((sum, sale) => sum + sale.total_amount, 0)
      .toFixed(2)
  );
  const returnsTotal = Number(input.returns.reduce((sum, entry) => sum + entry.total_amount, 0).toFixed(2));

  return {
    revenue,
    salesCount: input.sales.length,
    cashTotal,
    cardTotal,
    returnsTotal,
    returnsCount: input.returns.length,
    returnedUnits: 0,
    averageReturn: Number((returnsTotal / Math.max(input.returns.length, 1)).toFixed(2)),
  };
}

function buildAdminSalesSummaryFromRows(input: {
  sales: Awaited<ReturnType<typeof listAdminSales>>;
  returns: Awaited<ReturnType<typeof listAdminReturns>>;
  returnItems?: Awaited<ReturnType<typeof listAdminReturnItems>>;
}) {
  return {
    ...buildAdminSalesSummary({ sales: input.sales, returns: input.returns }),
    returnedUnits: (input.returnItems ?? []).reduce((sum, item) => sum + Number(item.quantity), 0),
  };
}

function buildInventoryItems(input: {
  stores: Awaited<ReturnType<typeof listAdminStores>>;
  products: Awaited<ReturnType<typeof listProducts>>;
  storeProducts: Awaited<ReturnType<typeof listAdminStoreProducts>>;
  inventoryRows: Awaited<ReturnType<typeof listInventoryRows>>;
}) {
  const storeMap = new Map(input.stores.map((store) => [store.id, store]));
  const productMap = new Map(input.products.map((product) => [product.id, product]));
  const inventoryMap = new Map(
    input.inventoryRows.map((row) => [`${row.store_id}:${row.product_id}`, Number(row.quantity)])
  );

  return input.storeProducts.flatMap((row) => {
    const store = storeMap.get(row.store_id);
    const product = productMap.get(row.product_id);

    if (!product) {
      return [];
    }

    return [
      {
        storeProductId: row.id,
        storeId: row.store_id,
        storeName: store?.name ?? "Unknown store",
        productId: row.product_id,
        productName: product.name,
        sku: product.sku,
        defaultPrice: Number(product.default_price),
        storePrice: Number(row.price),
        isEnabled: row.is_enabled,
        isProductActive: product.is_active,
        stockQuantity: inventoryMap.get(`${row.store_id}:${row.product_id}`) ?? 0,
        updatedAt: row.updated_at,
      },
    ];
  });
}

function buildAdminProductsPayload(input: {
  products: Awaited<ReturnType<typeof listProducts>>;
  stores: Awaited<ReturnType<typeof listAdminStores>>;
  storeProducts: Awaited<ReturnType<typeof listAdminStoreProducts>>;
}) {
  const storeMap = new Map(input.stores.map((store) => [store.id, store]));
  const storeProductsByProduct = input.storeProducts.reduce<Map<string, typeof input.storeProducts>>((map, row) => {
    const rows = map.get(row.product_id) ?? [];
    rows.push(row);
    map.set(row.product_id, rows);
    return map;
  }, new Map());

  return input.products.map((product) => {
    const storeSettings = (storeProductsByProduct.get(product.id) ?? [])
      .map((row) => ({
        storeProductId: row.id,
        storeId: row.store_id,
        storeName: storeMap.get(row.store_id)?.name ?? "Unknown store",
        storeActive: storeMap.get(row.store_id)?.is_active ?? false,
        storePrice: Number(row.price),
        isEnabled: row.is_enabled,
        updatedAt: row.updated_at,
      }))
      .sort((left, right) => left.storeName.localeCompare(right.storeName));

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      defaultPrice: Number(product.default_price),
      isActive: product.is_active,
      isArchived: Boolean(product.archived_at),
      archivedAt: product.archived_at,
      enabledStoreCount: storeSettings.filter((setting) => setting.isEnabled).length,
      storeSettings,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
    };
  });
}

export async function getAdminDashboard(input: {
  recentSalesLimit: number;
  lowStockLimit: number;
}) {
  const dashboardSalesFetchLimit = Math.max(input.recentSalesLimit, 500);
  const [sales, stores, users, assignments, openShifts, inventoryRows, products] =
    await Promise.all([
      listAdminSales(dashboardSalesFetchLimit),
      listAdminStores(),
      listAdminUsers(),
      listCurrentAssignments(),
      listOpenShifts(),
      listInventoryRows(),
      listProducts({ archived: false }),
    ]);

  const storeMap = new Map(stores.map((store) => [store.id, store]));
  const userMap = new Map(users.map((user) => [user.id, user]));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const assignmentByStore = assignments.reduce<Map<string, number>>((map, row) => {
    map.set(row.store_id, (map.get(row.store_id) ?? 0) + 1);
    return map;
  }, new Map());

  const todayStart = startOfTodayIso();
  const completedSales = sales.filter((sale) => sale.status === "completed");
  const todaySales = completedSales.filter((sale) => sale.created_at >= todayStart);
  const totalRevenueToday = Number(
    todaySales.reduce((sum, sale) => sum + sale.total_amount, 0).toFixed(2)
  );
  const totalRevenueAllTime = Number(
    completedSales.reduce((sum, sale) => sum + sale.total_amount, 0).toFixed(2)
  );
  const hourlyRevenueToday = Array.from({ length: 24 }, (_, hour) => {
    const total = todaySales
      .filter((sale) => new Date(sale.created_at).getHours() === hour)
      .reduce((sum, sale) => sum + sale.total_amount, 0);

    return {
      hour,
      total: Number(total.toFixed(2)),
    };
  });

  const visibleInventoryRows = inventoryRows.filter((row) => productMap.has(row.product_id));
  const inventoryByStore = visibleInventoryRows.reduce<Map<string, number>>((map, row) => {
    map.set(row.store_id, (map.get(row.store_id) ?? 0) + Number(row.quantity));
    return map;
  }, new Map());

  const lowStockItems = visibleInventoryRows
    .filter((row) => Number(row.quantity) <= 10)
    .sort((a, b) => Number(a.quantity) - Number(b.quantity))
    .slice(0, input.lowStockLimit)
    .map((row) => ({
      inventoryId: row.id,
      quantity: Number(row.quantity),
      store: storeMap.get(row.store_id)
        ? {
            id: row.store_id,
            name: storeMap.get(row.store_id)!.name,
          }
        : null,
      product: productMap.get(row.product_id)
        ? {
            id: row.product_id,
            name: productMap.get(row.product_id)!.name,
            sku: productMap.get(row.product_id)!.sku,
          }
        : null,
    }));

  const recentSales = sales.slice(0, input.recentSalesLimit).map((sale) => ({
    id: sale.id,
    totalAmount: sale.total_amount,
    paymentMethod: sale.payment_method,
    status: sale.status,
    createdAt: sale.created_at,
    store: storeMap.get(sale.store_id)
      ? {
          id: sale.store_id,
          name: storeMap.get(sale.store_id)!.name,
        }
      : null,
    seller: userMap.get(sale.seller_id)
      ? {
          id: sale.seller_id,
          fullName: userMap.get(sale.seller_id)!.full_name,
        }
      : null,
  }));

  const activeShifts = openShifts.map((shift) => ({
    id: shift.id,
    status: shift.status,
    startedAt: shift.started_at,
    pausedTotalSeconds: shift.paused_total_seconds,
    store: storeMap.get(shift.store_id)
      ? {
          id: shift.store_id,
          name: storeMap.get(shift.store_id)!.name,
        }
      : null,
    seller: userMap.get(shift.user_id)
      ? {
          id: shift.user_id,
          fullName: userMap.get(shift.user_id)!.full_name,
        }
      : null,
  }));

  const storePerformance = stores.map((store) => {
    const storeSales = todaySales.filter((sale) => sale.store_id === store.id);
    return {
      id: store.id,
      name: store.name,
      address: store.address,
      active: store.is_active,
      sellerCount: assignmentByStore.get(store.id) ?? 0,
      stockUnits: Number((inventoryByStore.get(store.id) ?? 0).toFixed(3)),
      salesCount: storeSales.length,
      revenue: Number(storeSales.reduce((sum, sale) => sum + sale.total_amount, 0).toFixed(2)),
    };
  });

  return {
    summary: {
      totalRevenueToday,
      totalRevenueAllTime,
      completedSalesToday: todaySales.length,
      totalStores: stores.length,
      totalSellers: users.filter((user) => user.role === "seller" && user.is_active).length,
      activeShifts: openShifts.length,
      lowStockCount: lowStockItems.length,
    },
    hourlyRevenueToday,
    recentSales,
    activeShifts,
    lowStockItems,
    storePerformance,
  };
}

export async function getAdminStores() {
  const [sales, stores, assignments, openShifts, inventoryRows, products] = await Promise.all([
    listAdminSales(500),
    listAdminStores(),
    listCurrentAssignments(),
    listOpenShifts(),
    listInventoryRows(),
    listProducts({ archived: false }),
  ]);

  const visibleProductIds = new Set(products.map((product) => product.id));
  const visibleInventoryRows = inventoryRows.filter((row) => visibleProductIds.has(row.product_id));

  const assignmentByStore = assignments.reduce<Map<string, number>>((map, row) => {
    map.set(row.store_id, (map.get(row.store_id) ?? 0) + 1);
    return map;
  }, new Map());

  const activeShiftsByStore = openShifts.reduce<Map<string, number>>((map, row) => {
    map.set(row.store_id, (map.get(row.store_id) ?? 0) + 1);
    return map;
  }, new Map());

  const stockByStore = visibleInventoryRows.reduce<Map<string, number>>((map, row) => {
    map.set(row.store_id, (map.get(row.store_id) ?? 0) + Number(row.quantity));
    return map;
  }, new Map());

  const todayStart = startOfTodayIso();
  const completedSales = sales.filter((sale) => sale.status === "completed");

  return {
    stores: stores.map((store) => {
      const storeSales = completedSales.filter((sale) => sale.store_id === store.id);
      const todaySales = storeSales.filter((sale) => sale.created_at >= todayStart);
      const storeInventory = visibleInventoryRows.filter((row) => row.store_id === store.id);

      return {
        id: store.id,
        name: store.name,
        address: store.address,
        isActive: store.is_active,
        createdAt: store.created_at,
        updatedAt: store.updated_at,
        sellerCount: assignmentByStore.get(store.id) ?? 0,
        activeShiftCount: activeShiftsByStore.get(store.id) ?? 0,
        stockUnits: Number((stockByStore.get(store.id) ?? 0).toFixed(3)),
        lowStockCount: storeInventory.filter((row) => Number(row.quantity) <= 10).length,
        salesCount: storeSales.length,
        revenueAllTime: Number(
          storeSales.reduce((sum, sale) => sum + sale.total_amount, 0).toFixed(2)
        ),
        revenueToday: Number(
          todaySales.reduce((sum, sale) => sum + sale.total_amount, 0).toFixed(2)
        ),
      };
    }),
  };
}

export async function createStore(input: {
  name: string;
  address?: string | null;
  isActive?: boolean;
}) {
  const store = await createAdminStore({
    name: input.name.trim(),
    address: input.address?.trim() || null,
    is_active: input.isActive ?? true,
  });

  return {
    store: {
      id: store.id,
      name: store.name,
      address: store.address,
      isActive: store.is_active,
      createdAt: store.created_at,
      updatedAt: store.updated_at,
    },
  };
}

export async function updateStore(
  storeId: string,
  input: {
    name?: string;
    address?: string | null;
    isActive?: boolean;
  }
) {
  const existing = await findAdminStoreById(storeId);

  if (!existing) {
    throw new HttpError(404, "Store not found");
  }

  const updated = await updateAdminStore(storeId, {
    name: input.name?.trim(),
    address: input.address === undefined ? undefined : input.address?.trim() || null,
    is_active: input.isActive,
  });

  if (!updated) {
    throw new HttpError(404, "Store not found");
  }

  return {
    store: {
      id: updated.id,
      name: updated.name,
      address: updated.address,
      isActive: updated.is_active,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    },
  };
}

export async function getAdminStaff() {
  const [users, stores, assignments, openShifts, sales] = await Promise.all([
    listAdminUsers(),
    listAdminStores(),
    listCurrentAssignments(),
    listOpenShifts(),
    listAdminSales(1000),
  ]);

  const storeMap = new Map(stores.map((store) => [store.id, store]));
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.user_id, assignment]));
  const shiftMap = new Map(openShifts.map((shift) => [shift.user_id, shift]));
  const completedSales = sales.filter((sale) => sale.status === "completed");

  return {
    sellers: users
      .filter((user) => user.role === "seller")
      .map((seller) => {
        const assignment = assignmentMap.get(seller.id);
        const activeShift = shiftMap.get(seller.id);
        const sellerSales = completedSales.filter((sale) => sale.seller_id === seller.id);
        const currentStore = assignment ? storeMap.get(assignment.store_id) ?? null : null;

        return {
          id: seller.id,
          telegramId: seller.telegram_id,
          fullName: seller.full_name,
          isActive: seller.is_active,
          currentAssignment: assignment
            ? {
                id: assignment.id,
                storeId: assignment.store_id,
                storeName: currentStore?.name ?? "Unknown store",
                startedAt: assignment.started_at,
              }
            : null,
          activeShift: activeShift
            ? {
                id: activeShift.id,
                storeId: activeShift.store_id,
                storeName: storeMap.get(activeShift.store_id)?.name ?? "Unknown store",
                status: activeShift.status,
                startedAt: activeShift.started_at,
                pausedTotalSeconds: activeShift.paused_total_seconds,
              }
            : null,
          salesCount: sellerSales.length,
          revenue: Number(
            sellerSales.reduce((sum, sale) => sum + sale.total_amount, 0).toFixed(2)
          ),
          lastSaleAt: sellerSales[0]?.created_at ?? null,
        };
      }),
  };
}

export async function createSeller(input: {
  adminUserId: string;
  fullName: string;
  telegramId: number;
  storeId?: string;
  isActive?: boolean;
}) {
  const store = input.storeId ? await findAdminStoreById(input.storeId) : null;

  if (input.storeId && !store) {
    throw new HttpError(404, "Store not found");
  }

  if (store && !store.is_active) {
    throw new HttpError(409, "Seller can only be assigned to an active store");
  }

  const seller = await createAdminUser({
    telegram_id: input.telegramId,
    full_name: input.fullName.trim(),
    role: "seller",
    is_active: input.isActive ?? true,
  });

  const assignment =
    store && seller.is_active
      ? await createUserStoreAssignment({
          userId: seller.id,
          storeId: store.id,
          assignedBy: input.adminUserId,
        })
      : null;

  return {
    seller: {
      id: seller.id,
      telegramId: seller.telegram_id,
      fullName: seller.full_name,
      isActive: seller.is_active,
      currentAssignment: assignment
        ? {
            id: assignment.id,
            storeId: assignment.store_id,
            storeName: store!.name,
            startedAt: assignment.started_at,
          }
        : null,
      activeShift: null,
      salesCount: 0,
      revenue: 0,
      lastSaleAt: null,
    },
  };
}

export async function assignSellerToStore(input: {
  adminUserId: string;
  sellerUserId: string;
  storeId: string;
}) {
  const [seller, store, currentAssignment, openShift] = await Promise.all([
    findUserById(input.sellerUserId),
    findAdminStoreById(input.storeId),
    findCurrentAssignment(input.sellerUserId),
    findOpenShiftByUserId(input.sellerUserId),
  ]);

  if (!seller || seller.role !== "seller") {
    throw new HttpError(404, "Seller not found");
  }

  if (!seller.is_active) {
    throw new HttpError(409, "Inactive seller cannot be assigned");
  }

  if (!store) {
    throw new HttpError(404, "Store not found");
  }

  if (!store.is_active) {
    throw new HttpError(409, "Seller can only be assigned to an active store");
  }

  if (openShift) {
    throw new HttpError(409, "Seller cannot be reassigned while an active shift is open");
  }

  if (currentAssignment?.store_id === input.storeId) {
    return {
      assignment: {
        id: currentAssignment.id,
        sellerId: seller.id,
        sellerName: seller.full_name,
        storeId: store.id,
        storeName: store.name,
        startedAt: currentAssignment.started_at,
      },
    };
  }

  if (currentAssignment) {
    await closeCurrentAssignment(seller.id);
  }

  const assignment = await createUserStoreAssignment({
    userId: seller.id,
    storeId: store.id,
    assignedBy: input.adminUserId,
  });

  return {
    assignment: {
      id: assignment.id,
      sellerId: seller.id,
      sellerName: seller.full_name,
      storeId: store.id,
      storeName: store.name,
      startedAt: assignment.started_at,
    },
  };
}

export async function getAdminInventory(input: {
  storeId?: string;
  historyLimit: number;
}) {
  const [stores, products, storeProducts, allStoreProducts, inventoryRows, history] = await Promise.all([
    listAdminStores(),
    listProducts({ archived: false }),
    listAdminStoreProducts(input.storeId),
    listAdminStoreProducts(),
    listInventoryRows(),
    input.storeId ? listInventoryHistory(input.storeId, input.historyLimit) : Promise.resolve([]),
  ]);
  const items = buildInventoryItems({ stores, products, storeProducts, inventoryRows });
  const allItems = buildInventoryItems({ stores, products, storeProducts: allStoreProducts, inventoryRows });
  const mappedHistory = history.map((entry) => ({
    id: entry.id,
    movementType: entry.movement_type,
    quantityDelta: Number(entry.quantity_delta),
    balanceAfter: Number(entry.balance_after),
    reason: entry.reason,
    createdAt: entry.created_at,
    product: entry.product,
    actor: entry.actor,
    saleId: entry.sale_id,
    returnId: entry.return_id,
    shiftId: entry.shift_id,
  }));
  const storeSnapshotsByStoreId = stores.reduce<Record<string, { items: typeof items; history: typeof mappedHistory }>>(
    (map, store) => {
      map[store.id] = {
        items: allItems.filter((item) => item.storeId === store.id),
        history: input.storeId === store.id ? mappedHistory : [],
      };
      return map;
    },
    {}
  );

  return {
    stores: stores.map((store) => ({
      id: store.id,
      name: store.name,
      isActive: store.is_active,
    })),
    products: buildAdminProductsPayload({ products, stores, storeProducts: allStoreProducts }),
    selectedStoreId: input.storeId ?? null,
    items,
    history: mappedHistory,
    storeSnapshotsByStoreId,
  };
}

export async function getAdminProducts(input?: { archived?: boolean }) {
  const [products, stores, storeProducts] = await Promise.all([
    listProducts({ archived: input?.archived ?? false }),
    listAdminStores(),
    listAdminStoreProducts(),
  ]);

  return {
    products: buildAdminProductsPayload({ products, stores, storeProducts }),
  };
}

export async function createProduct(input: {
  name: string;
  sku: string;
  defaultPrice: number;
  isActive?: boolean;
}) {
  const [stores, product] = await Promise.all([
    listAdminStores(),
    createAdminProduct({
      name: input.name.trim(),
      sku: input.sku.trim(),
      default_price: input.defaultPrice,
      is_active: input.isActive ?? true,
    }),
  ]);

  const storeIds = stores.map((store) => store.id);

  await Promise.all([
    createStoreProductsForProduct({
      productId: product.id,
      price: Number(product.default_price),
      storeIds,
    }),
    createInventoryRowsForProduct({
      productId: product.id,
      storeIds,
    }),
  ]);

  return {
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      defaultPrice: Number(product.default_price),
      isActive: product.is_active,
      isArchived: Boolean(product.archived_at),
      archivedAt: product.archived_at,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
    },
  };
}

export async function updateProduct(
  productId: string,
  input: {
    name?: string;
    sku?: string;
    defaultPrice?: number;
    isActive?: boolean;
  }
) {
  const existing = await findAdminProductById(productId);

  if (!existing) {
    throw new HttpError(404, "Product not found");
  }

  const updated = await updateAdminProduct(productId, {
    name: input.name?.trim(),
    sku: input.sku?.trim(),
    default_price: input.defaultPrice,
    is_active: input.isActive,
  });

  if (!updated) {
    throw new HttpError(404, "Product not found");
  }

  return {
    product: {
      id: updated.id,
      name: updated.name,
      sku: updated.sku,
      defaultPrice: Number(updated.default_price),
      isActive: updated.is_active,
      isArchived: Boolean(updated.archived_at),
      archivedAt: updated.archived_at,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    },
  };
}

export async function deleteProduct(productId: string) {
  const existing = await findAdminProductById(productId);

  if (!existing) {
    throw new HttpError(404, "Product not found");
  }

  const references = await getProductReferenceCounts(productId);
  const hasCommercialHistory = references.saleItems > 0 || references.returnItems > 0;

  if (hasCommercialHistory) {
    throw new HttpError(
      409,
      "Product has sales or returns history. Disable it instead to preserve reports."
    );
  }

  await deleteAdminProduct(productId);

  return { ok: true };
}

export async function archiveProduct(productId: string) {
  const existing = await findAdminProductById(productId);

  if (!existing) {
    throw new HttpError(404, "Product not found");
  }

  const archived = await archiveAdminProduct(productId);

  if (!archived) {
    throw new HttpError(404, "Product not found");
  }

  return {
    product: {
      id: archived.id,
      name: archived.name,
      sku: archived.sku,
      defaultPrice: Number(archived.default_price),
      isActive: archived.is_active,
      isArchived: Boolean(archived.archived_at),
      archivedAt: archived.archived_at,
      createdAt: archived.created_at,
      updatedAt: archived.updated_at,
    },
  };
}

export async function restoreProduct(productId: string) {
  const existing = await findAdminProductById(productId);

  if (!existing) {
    throw new HttpError(404, "Product not found");
  }

  const restored = await restoreAdminProduct(productId);

  if (!restored) {
    throw new HttpError(404, "Product not found");
  }

  return {
    product: {
      id: restored.id,
      name: restored.name,
      sku: restored.sku,
      defaultPrice: Number(restored.default_price),
      isActive: restored.is_active,
      isArchived: Boolean(restored.archived_at),
      archivedAt: restored.archived_at,
      createdAt: restored.created_at,
      updatedAt: restored.updated_at,
    },
  };
}

export async function updateStoreProductSettings(input: {
  storeProductId: string;
  price?: number;
  isEnabled?: boolean;
}) {
  const existing = await findAdminStoreProductById(input.storeProductId);

  if (!existing) {
    throw new HttpError(404, "Store product not found");
  }

  const updated = await updateAdminStoreProduct(input.storeProductId, {
    price: input.price,
    is_enabled: input.isEnabled,
  });

  if (!updated) {
    throw new HttpError(404, "Store product not found");
  }

  return {
    item: {
      storeProductId: updated.id,
      storeId: updated.store_id,
      productId: updated.product_id,
      storePrice: Number(updated.price),
      isEnabled: updated.is_enabled,
      updatedAt: updated.updated_at,
    },
  };
}

export async function createAdminInventoryAdjustment(input: {
  adminUserId: string;
  storeId: string;
  productId: string;
  movementType: "manual_adjustment" | "restock" | "writeoff";
  quantity: number;
  reason: string;
}) {
  const store = await findAdminStoreById(input.storeId);

  if (!store) {
    throw new HttpError(404, "Store not found");
  }

  await runAdminInventoryAdjustment(input);

  return { ok: true };
}

export async function getAdminSalesOverview(input: {
  storeId?: string;
  sellerId?: string;
  saleStatus: "all" | "completed" | "deleted";
  dateFrom?: string;
  dateTo?: string;
  limit: number;
}) {
  const fetchLimit = Math.max(input.limit * 3, 4000);
  const [sales, returns, stores, users] = await Promise.all([
    listAdminSales(fetchLimit),
    listAdminReturns(fetchLimit),
    listAdminStores(),
    listAdminUsers(),
  ]);

  const storeMap = new Map(stores.map((store) => [store.id, store]));
  const userMap = new Map(users.map((user) => [user.id, user]));

  const inRange = (iso: string) => {
    if (input.dateFrom && iso < input.dateFrom) {
      return false;
    }

    if (input.dateTo && iso > input.dateTo) {
      return false;
    }

    return true;
  };

  const allFilteredSales = sales
    .filter((sale) => (input.storeId ? sale.store_id === input.storeId : true))
    .filter((sale) => (input.sellerId ? sale.seller_id === input.sellerId : true))
    .filter((sale) => (input.saleStatus === "all" ? true : sale.status === input.saleStatus))
    .filter((sale) => inRange(sale.created_at));

  const allFilteredReturns = returns
    .filter((entry) => (input.storeId ? entry.store_id === input.storeId : true))
    .filter((entry) => (input.sellerId ? entry.seller_id === input.sellerId : true))
    .filter((entry) => inRange(entry.created_at));

  const filteredSales = allFilteredSales.slice(0, input.limit);
  const filteredReturns = allFilteredReturns.slice(0, input.limit);

  const [saleItems, returnItems] = await Promise.all([
    listAdminSaleItems(filteredSales.map((sale) => sale.id)),
    listAdminReturnItems(allFilteredReturns.map((entry) => entry.id)),
  ]);
  const summary = buildAdminSalesSummaryFromRows({
    sales: allFilteredSales,
    returns: allFilteredReturns,
    returnItems,
  });

  const saleItemsBySale = saleItems.reduce<Map<string, typeof saleItems>>((map, item) => {
    const list = map.get(item.sale_id) ?? [];
    list.push(item);
    map.set(item.sale_id, list);
    return map;
  }, new Map());

  const returnItemsByReturn = returnItems.reduce<Map<string, typeof returnItems>>((map, item) => {
    const list = map.get(item.return_id) ?? [];
    list.push(item);
    map.set(item.return_id, list);
    return map;
  }, new Map());

  return {
    filters: {
      storeId: input.storeId ?? null,
      sellerId: input.sellerId ?? null,
      saleStatus: input.saleStatus,
      dateFrom: input.dateFrom ?? null,
      dateTo: input.dateTo ?? null,
    },
    stores: stores.map((store) => ({
      id: store.id,
      name: store.name,
      isActive: store.is_active,
    })),
    sellers: users
      .filter((user) => user.role === "seller")
      .map((user) => ({
        id: user.id,
        fullName: user.full_name,
        isActive: user.is_active,
      })),
    summary,
    sales: filteredSales.map((sale) => ({
      id: sale.id,
      status: sale.status,
      paymentMethod: sale.payment_method,
      subtotalAmount: Number(sale.subtotal_amount),
      discountAmount: Number(sale.discount_amount),
      totalAmount: Number(sale.total_amount),
      createdAt: sale.created_at,
      deletedAt: sale.deleted_at ?? null,
      deletionReason: sale.deletion_reason ?? null,
      store: storeMap.get(sale.store_id)
        ? { id: sale.store_id, name: storeMap.get(sale.store_id)!.name }
        : null,
      seller: userMap.get(sale.seller_id)
        ? { id: sale.seller_id, fullName: userMap.get(sale.seller_id)!.full_name }
        : null,
      deletedBy: sale.deleted_by && userMap.get(sale.deleted_by)
        ? { id: sale.deleted_by, fullName: userMap.get(sale.deleted_by)!.full_name }
        : null,
      items: (saleItemsBySale.get(sale.id) ?? []).map((item) => ({
        id: item.id,
        productId: item.product_id,
        productNameSnapshot: item.product_name_snapshot,
        skuSnapshot: item.sku_snapshot,
        basePrice: Number(item.base_price),
        finalPrice: Number(item.final_price),
        discountType: item.discount_type,
        discountValue: item.discount_value == null ? null : Number(item.discount_value),
        quantity: Number(item.quantity),
        lineTotal: Number(item.line_total),
      })),
    })),
    returns: filteredReturns.map((entry) => ({
      id: entry.id,
      saleId: entry.sale_id,
      reason: entry.reason,
      totalAmount: Number(entry.total_amount),
      createdAt: entry.created_at,
      store: storeMap.get(entry.store_id)
        ? { id: entry.store_id, name: storeMap.get(entry.store_id)!.name }
        : null,
      seller: userMap.get(entry.seller_id)
        ? { id: entry.seller_id, fullName: userMap.get(entry.seller_id)!.full_name }
        : null,
      items: (returnItemsByReturn.get(entry.id) ?? []).map((item) => ({
        id: item.id,
        saleItemId: item.sale_item_id,
        productId: item.product_id,
        productNameSnapshot: item.product_name_snapshot,
        skuSnapshot: item.sku_snapshot,
        returnedPrice: Number(item.returned_price),
        quantity: Number(item.quantity),
        lineTotal: Number(item.line_total),
      })),
    })),
  };
}

export async function getAdminSalesPeriodSummaries() {
  const [sales, returns] = await Promise.all([listAdminSales(4000), listAdminReturns(4000)]);
  const returnItems = await listAdminReturnItems(returns.map((entry) => entry.id));

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  const weekday = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const buildPeriodSummary = (dateFrom: Date) => {
    const iso = dateFrom.toISOString();
    const periodSales = sales.filter((sale) => sale.created_at >= iso);
    const periodReturns = returns.filter((entry) => entry.created_at >= iso);
    const periodReturnIds = new Set(periodReturns.map((entry) => entry.id));

    return buildAdminSalesSummaryFromRows({
      sales: periodSales,
      returns: periodReturns,
      returnItems: returnItems.filter((item) => periodReturnIds.has(item.return_id)),
    });
  };

  return {
    today: buildPeriodSummary(todayStart),
    week: buildPeriodSummary(weekStart),
    month: buildPeriodSummary(monthStart),
  };
}
