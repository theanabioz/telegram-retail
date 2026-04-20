import { create } from "zustand";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { triggerImpact, triggerNotification, triggerSelection } from "../lib/haptics";
import type {
  AdminAssignmentMutationResponse,
  AdminInventoryResponse,
  AdminProductMutationResponse,
  AdminProductsResponse,
  AdminSellerMutationResponse,
  AdminSalesOverviewResponse,
  AdminStoreProductMutationResponse,
  AdminStaffResponse,
  AdminStoreMutationResponse,
  AdminStoresResponse,
  AdminStartupResponse,
} from "../types/admin";

const TOKEN_KEY = "telegram-retail-token";
const ADMIN_STARTUP_CACHE_KEY = "telegram-retail-admin-startup";

type AdminStoreItem = AdminStoresResponse["stores"][number];
type AdminInventoryStore = AdminInventoryResponse["stores"][number];
type AdminInventoryItem = AdminInventoryResponse["items"][number];
type AdminInventoryHistoryItem = AdminInventoryResponse["history"][number];
type AdminProduct = AdminProductsResponse["products"][number];

function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function readCachedAdminStartup() {
  try {
    const token = getStoredToken();
    const raw = window.localStorage.getItem(ADMIN_STARTUP_CACHE_KEY);
    if (!token || !raw) {
      return null;
    }

    const cached = JSON.parse(raw) as { token: string; startup: AdminStartupResponse };
    return cached.token === token ? cached.startup : null;
  } catch {
    return null;
  }
}

function writeAdminStartupCache(token: string, startup: AdminStartupResponse) {
  try {
    window.localStorage.setItem(ADMIN_STARTUP_CACHE_KEY, JSON.stringify({ token, startup }));
  } catch {
    // Cache only improves perceived loading.
  }
}

function patchAdminStartupCache(
  token: string,
  updater: (startup: AdminStartupResponse) => AdminStartupResponse
) {
  const cachedStartup = readCachedAdminStartup();

  if (!cachedStartup) {
    return;
  }

  writeAdminStartupCache(token, updater(cachedStartup));
}

function recalculateStoreInventoryMetrics(
  stores: AdminStoreItem[],
  items: AdminInventoryItem[],
  storeId: string
) {
  const storeItems = items.filter((item) => item.storeId === storeId);
  const stockUnits = Number(storeItems.reduce((sum, item) => sum + item.stockQuantity, 0).toFixed(3));
  const lowStockCount = storeItems.filter((item) => item.stockQuantity <= 10).length;

  return stores.map((store) =>
    store.id === storeId
      ? {
          ...store,
          stockUnits,
          lowStockCount,
        }
      : store
  );
}

function updateProductCollections(
  activeProducts: AdminProduct[],
  archivedProducts: AdminProduct[],
  updater: (product: AdminProduct) => AdminProduct | null
) {
  const updateCollection = (collection: AdminProduct[]) =>
    collection.reduce<AdminProduct[]>((next, product) => {
      const updated = updater(product);

      if (updated) {
        next.push(updated);
      }

      return next;
    }, []);

  return {
    products: updateCollection(activeProducts),
    archivedProducts: updateCollection(archivedProducts),
  };
}

function patchStoreSettingInProducts(
  products: AdminProduct[],
  storeProductId: string,
  updates: Partial<AdminProduct["storeSettings"][number]>
) {
  return products.map((product) => {
    let changed = false;
    const nextStoreSettings = product.storeSettings.map((setting) => {
      if (setting.storeProductId !== storeProductId) {
        return setting;
      }

      changed = true;
      return {
        ...setting,
        ...updates,
      };
    });

    if (!changed) {
      return product;
    }

    return {
      ...product,
      storeSettings: nextStoreSettings,
      enabledStoreCount: nextStoreSettings.filter((setting) => setting.isEnabled).length,
      updatedAt: typeof updates.updatedAt === "string" ? updates.updatedAt : product.updatedAt,
    };
  });
}

type AdminManagementState = {
  loadingStores: boolean;
  loadingStaff: boolean;
  mutating: boolean;
  loadingInventory: boolean;
  loadingSales: boolean;
  creatingProduct: boolean;
  error: string | null;
  pendingStoreProductIds: Record<string, true>;
  pendingProductIds: Record<string, true>;
  stores: AdminStoresResponse["stores"];
  staff: AdminStaffResponse["sellers"];
  inventoryStores: AdminInventoryResponse["stores"];
  products: AdminProductsResponse["products"];
  archivedProducts: AdminProductsResponse["products"];
  inventoryItems: AdminInventoryResponse["items"];
  inventoryHistory: AdminInventoryResponse["history"];
  salesFilters: AdminSalesOverviewResponse["filters"] | null;
  salesStores: AdminSalesOverviewResponse["stores"];
  salesSellers: AdminSalesOverviewResponse["sellers"];
  salesOverview: AdminSalesOverviewResponse["sales"];
  returnsOverview: AdminSalesOverviewResponse["returns"];
  loadStores: () => Promise<void>;
  loadStaff: () => Promise<void>;
  loadInventory: (storeId?: string, options?: { silent?: boolean }) => Promise<void>;
  loadProducts: (options?: { archived?: boolean }) => Promise<void>;
  loadSalesOverview: (filters?: {
    storeId?: string;
    sellerId?: string;
    saleStatus?: "all" | "completed" | "deleted";
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }, options?: { silent?: boolean }) => Promise<void>;
  createStore: (input: { name: string; address?: string | null; isActive?: boolean }) => Promise<void>;
  createSeller: (input: {
    fullName: string;
    telegramId: number;
    storeId?: string;
    isActive?: boolean;
  }) => Promise<void>;
  updateStore: (
    storeId: string,
    input: { name?: string; address?: string | null; isActive?: boolean }
  ) => Promise<void>;
  assignSeller: (sellerId: string, storeId: string) => Promise<void>;
  updateStoreProduct: (
    storeProductId: string,
    input: { price?: number; isEnabled?: boolean }
  ) => Promise<void>;
  adjustInventory: (input: {
    storeId: string;
    productId: string;
    movementType: "manual_adjustment" | "restock" | "writeoff";
    quantity: number;
    reason: string;
  }) => Promise<void>;
  createProduct: (input: {
    name: string;
    sku: string;
    defaultPrice: number;
    isActive?: boolean;
  }) => Promise<void>;
  updateProduct: (
    productId: string,
    input: {
      name?: string;
      sku?: string;
      defaultPrice?: number;
      isActive?: boolean;
    }
  ) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  archiveProduct: (productId: string) => Promise<void>;
  restoreProduct: (productId: string) => Promise<void>;
  hydrateStartup: (startup: AdminStartupResponse) => void;
};

const cachedAdminStartup = readCachedAdminStartup();

export const useAdminManagementStore = create<AdminManagementState>((set, get) => ({
  loadingStores: false,
  loadingStaff: false,
  mutating: false,
  loadingInventory: false,
  loadingSales: false,
  creatingProduct: false,
  error: null,
  pendingStoreProductIds: {},
  pendingProductIds: {},
  stores: cachedAdminStartup?.stores.stores ?? [],
  staff: cachedAdminStartup?.staff.sellers ?? [],
  inventoryStores: cachedAdminStartup?.inventory.stores ?? [],
  products: cachedAdminStartup?.inventory.products ?? [],
  archivedProducts: [],
  inventoryItems: cachedAdminStartup?.inventory.items ?? [],
  inventoryHistory: cachedAdminStartup?.inventory.history ?? [],
  salesFilters: cachedAdminStartup?.sales.filters ?? null,
  salesStores: cachedAdminStartup?.sales.stores ?? [],
  salesSellers: cachedAdminStartup?.sales.sellers ?? [],
  salesOverview: cachedAdminStartup?.sales.sales ?? [],
  returnsOverview: cachedAdminStartup?.sales.returns ?? [],

  hydrateStartup: (startup) => {
    set({
      loadingStores: false,
      loadingStaff: false,
      loadingInventory: false,
      loadingSales: false,
      creatingProduct: false,
      error: null,
      pendingStoreProductIds: {},
      pendingProductIds: {},
      stores: startup.stores.stores,
      staff: startup.staff.sellers,
      inventoryStores: startup.inventory.stores,
      products: startup.inventory.products,
      archivedProducts: [],
      inventoryItems: startup.inventory.items,
      inventoryHistory: startup.inventory.history,
      salesFilters: startup.sales.filters,
      salesStores: startup.sales.stores,
      salesSellers: startup.sales.sellers,
      salesOverview: startup.sales.sales,
      returnsOverview: startup.sales.returns,
    });
  },

  loadStores: async () => {
    const token = getStoredToken();

    if (!token) {
      set({ loadingStores: false, error: "Missing auth token" });
      return;
    }

    set({ loadingStores: true, error: null });

    try {
      const data = await apiGet<AdminStoresResponse>("/admin/stores", token);
      set({ stores: data.stores, loadingStores: false, error: null });
    } catch (error) {
      set({
        loadingStores: false,
        error: error instanceof Error ? error.message : "Failed to load stores",
      });
    }
  },

  loadStaff: async () => {
    const token = getStoredToken();

    if (!token) {
      set({ loadingStaff: false, error: "Missing auth token" });
      return;
    }

    set({ loadingStaff: true, error: null });

    try {
      const data = await apiGet<AdminStaffResponse>("/admin/staff", token);
      set({ staff: data.sellers, loadingStaff: false, error: null });
    } catch (error) {
      set({
        loadingStaff: false,
        error: error instanceof Error ? error.message : "Failed to load staff",
      });
    }
  },

  loadInventory: async (storeId, options) => {
    const token = getStoredToken();

    if (!token) {
      set({ loadingInventory: false, error: "Missing auth token" });
      return;
    }

    if (!options?.silent) {
      set({ loadingInventory: true, error: null });
    } else {
      set({ error: null });
    }

    try {
      const query = storeId ? `?storeId=${encodeURIComponent(storeId)}&historyLimit=20` : "?historyLimit=20";
      const data = await apiGet<AdminInventoryResponse>(`/admin/inventory${query}`, token);
      set({
        inventoryStores: data.stores,
        products: data.products,
        inventoryItems: data.items,
        inventoryHistory: data.history,
        loadingInventory: false,
        error: null,
      });
    } catch (error) {
      set({
        loadingInventory: false,
        error: error instanceof Error ? error.message : "Failed to load inventory",
      });
    }
  },

  loadProducts: async (options) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    try {
      const query = options?.archived ? "?archived=true" : "";
      const data = await apiGet<AdminProductsResponse>(`/admin/products${query}`, token);
      set(options?.archived ? { archivedProducts: data.products, error: null } : { products: data.products, error: null });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to load products",
      });
    }
  },

  loadSalesOverview: async (filters, options) => {
    const token = getStoredToken();

    if (!token) {
      set({ loadingSales: false, error: "Missing auth token" });
      return;
    }

    if (!options?.silent) {
      set({ loadingSales: true, error: null });
    } else {
      set({ error: null });
    }

    try {
      const params = new URLSearchParams();

      if (filters?.storeId) {
        params.set("storeId", filters.storeId);
      }

      if (filters?.sellerId) {
        params.set("sellerId", filters.sellerId);
      }

      if (filters?.saleStatus) {
        params.set("saleStatus", filters.saleStatus);
      }

      if (filters?.dateFrom) {
        params.set("dateFrom", filters.dateFrom);
      }

      if (filters?.dateTo) {
        params.set("dateTo", filters.dateTo);
      }

      params.set("limit", String(filters?.limit ?? 20));

      const data = await apiGet<AdminSalesOverviewResponse>(`/admin/sales?${params.toString()}`, token);
      set({
        salesFilters: data.filters,
        salesStores: data.stores,
        salesSellers: data.sellers,
        salesOverview: data.sales,
        returnsOverview: data.returns,
        loadingSales: false,
        error: null,
      });
    } catch (error) {
      set({
        loadingSales: false,
        error: error instanceof Error ? error.message : "Failed to load sales overview",
      });
    }
  },

  createStore: async (input) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ mutating: true, error: null });

    try {
      await apiPost<AdminStoreMutationResponse>("/admin/stores", input, token);
      triggerNotification("success");
      await get().loadStores();
      set({ mutating: false, error: null });
    } catch (error) {
      triggerNotification("error");
      set({
        mutating: false,
        error: error instanceof Error ? error.message : "Failed to create store",
      });
    }
  },

  createSeller: async (input) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ mutating: true, error: null });

    try {
      await apiPost<AdminSellerMutationResponse>("/admin/staff", input, token);
      triggerNotification("success");
      await Promise.all([get().loadStaff(), get().loadStores()]);
      set({ mutating: false, error: null });
    } catch (error) {
      triggerNotification("error");
      set({
        mutating: false,
        error: error instanceof Error ? error.message : "Failed to create seller",
      });
    }
  },

  updateStore: async (storeId, input) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ mutating: true, error: null });

    try {
      await apiPatch<AdminStoreMutationResponse>(`/admin/stores/${storeId}`, input, token);
      triggerNotification("success");
      await get().loadStores();
      set({ mutating: false, error: null });
    } catch (error) {
      triggerNotification("error");
      set({
        mutating: false,
        error: error instanceof Error ? error.message : "Failed to update store",
      });
    }
  },

  assignSeller: async (sellerId, storeId) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ mutating: true, error: null });

    try {
      await apiPost<AdminAssignmentMutationResponse>(
        `/admin/staff/${sellerId}/assignment`,
        { storeId },
        token
      );
      triggerImpact("medium");
      await Promise.all([get().loadStaff(), get().loadStores()]);
      set({ mutating: false, error: null });
    } catch (error) {
      triggerNotification("error");
      set({
        mutating: false,
        error: error instanceof Error ? error.message : "Failed to assign seller",
      });
    }
  },

  updateStoreProduct: async (storeProductId, input) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const currentStoreId = get().inventoryItems.find((item) => item.storeProductId === storeProductId)?.storeId;
    const previousItems = get().inventoryItems;
    const previousProducts = get().products;
    const previousArchivedProducts = get().archivedProducts;
    const optimisticUpdatedAt = new Date().toISOString();

    set((state) => ({
      error: null,
      pendingStoreProductIds: {
        ...state.pendingStoreProductIds,
        [storeProductId]: true,
      },
      inventoryItems: state.inventoryItems.map((item) =>
        item.storeProductId === storeProductId
          ? {
              ...item,
              storePrice: input.price ?? item.storePrice,
              isEnabled: input.isEnabled ?? item.isEnabled,
              updatedAt: optimisticUpdatedAt,
            }
          : item
      ),
      products: patchStoreSettingInProducts(state.products, storeProductId, {
        storePrice: input.price,
        isEnabled: input.isEnabled,
        updatedAt: optimisticUpdatedAt,
      }),
      archivedProducts: patchStoreSettingInProducts(state.archivedProducts, storeProductId, {
        storePrice: input.price,
        isEnabled: input.isEnabled,
        updatedAt: optimisticUpdatedAt,
      }),
    }));

    patchAdminStartupCache(token, (startup) => ({
      ...startup,
      inventory: {
        ...startup.inventory,
        items: startup.inventory.items.map((item) =>
          item.storeProductId === storeProductId
            ? {
                ...item,
                storePrice: input.price ?? item.storePrice,
                isEnabled: input.isEnabled ?? item.isEnabled,
                updatedAt: optimisticUpdatedAt,
              }
            : item
        ),
        products: patchStoreSettingInProducts(startup.inventory.products, storeProductId, {
          storePrice: input.price,
          isEnabled: input.isEnabled,
          updatedAt: optimisticUpdatedAt,
        }),
      },
    }));

    try {
      const response = await apiPatch<AdminStoreProductMutationResponse>(
        `/admin/store-products/${storeProductId}`,
        input,
        token
      );
      triggerNotification("success");
      set((state) => ({
        error: null,
        pendingStoreProductIds: Object.fromEntries(
          Object.entries(state.pendingStoreProductIds).filter(([id]) => id !== storeProductId)
        ),
        inventoryItems: state.inventoryItems.map((item) =>
          item.storeProductId === storeProductId
            ? {
                ...item,
                storePrice: response.item.storePrice,
                isEnabled: response.item.isEnabled,
                updatedAt: response.item.updatedAt,
              }
            : item
        ),
        products: patchStoreSettingInProducts(state.products, storeProductId, {
          storePrice: response.item.storePrice,
          isEnabled: response.item.isEnabled,
          updatedAt: response.item.updatedAt,
        }),
        archivedProducts: patchStoreSettingInProducts(state.archivedProducts, storeProductId, {
          storePrice: response.item.storePrice,
          isEnabled: response.item.isEnabled,
          updatedAt: response.item.updatedAt,
        }),
      }));

      patchAdminStartupCache(token, (startup) => ({
        ...startup,
        inventory: {
          ...startup.inventory,
          items: startup.inventory.items.map((item) =>
            item.storeProductId === storeProductId
              ? {
                  ...item,
                  storePrice: response.item.storePrice,
                  isEnabled: response.item.isEnabled,
                  updatedAt: response.item.updatedAt,
                }
              : item
          ),
          products: patchStoreSettingInProducts(startup.inventory.products, storeProductId, {
            storePrice: response.item.storePrice,
            isEnabled: response.item.isEnabled,
            updatedAt: response.item.updatedAt,
          }),
        },
      }));

      if (currentStoreId) {
        void get().loadInventory(currentStoreId, { silent: true });
      }
    } catch (error) {
      triggerNotification("error");
      set((state) => ({
        error: error instanceof Error ? error.message : "Failed to update store product",
        pendingStoreProductIds: Object.fromEntries(
          Object.entries(state.pendingStoreProductIds).filter(([id]) => id !== storeProductId)
        ),
        inventoryItems: previousItems,
        products: previousProducts,
        archivedProducts: previousArchivedProducts,
      }));
    }
  },

  adjustInventory: async (input) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }
    const targetItem = get().inventoryItems.find(
      (item) => item.storeId === input.storeId && item.productId === input.productId
    );

    if (!targetItem) {
      set({ error: "Product inventory row not found" });
      return;
    }

    const previousItems = get().inventoryItems;
    const previousHistory = get().inventoryHistory;
    const previousStores = get().stores;
    const optimisticUpdatedAt = new Date().toISOString();
    const nextQuantity =
      input.movementType === "manual_adjustment"
        ? Math.max(0, input.quantity)
        : input.movementType === "restock"
          ? targetItem.stockQuantity + input.quantity
          : Math.max(0, targetItem.stockQuantity - input.quantity);
    const quantityDelta = nextQuantity - targetItem.stockQuantity;
    const optimisticHistoryEntry: AdminInventoryHistoryItem = {
      id: `optimistic-movement-${targetItem.storeProductId}-${Date.now()}`,
      movementType: input.movementType,
      quantityDelta,
      balanceAfter: nextQuantity,
      reason: input.reason || null,
      createdAt: optimisticUpdatedAt,
      product: {
        id: targetItem.productId,
        name: targetItem.productName,
        sku: targetItem.sku,
      },
      actor: null,
      saleId: null,
      returnId: null,
      shiftId: null,
    };

    const nextItems = previousItems.map((item) =>
      item.storeProductId === targetItem.storeProductId
        ? {
            ...item,
            stockQuantity: nextQuantity,
            updatedAt: optimisticUpdatedAt,
          }
        : item
    );
    const nextStores = recalculateStoreInventoryMetrics(previousStores, nextItems, input.storeId);

    set((state) => ({
      error: null,
      pendingStoreProductIds: {
        ...state.pendingStoreProductIds,
        [targetItem.storeProductId]: true,
      },
      inventoryItems: nextItems,
      inventoryHistory: [optimisticHistoryEntry, ...state.inventoryHistory].slice(0, 20),
      stores: nextStores,
    }));

    patchAdminStartupCache(token, (startup) => ({
      ...startup,
      stores: {
        ...startup.stores,
        stores: recalculateStoreInventoryMetrics(startup.stores.stores, nextItems, input.storeId),
      },
      inventory: {
        ...startup.inventory,
        items: nextItems,
        history: [optimisticHistoryEntry, ...startup.inventory.history].slice(0, 20),
      },
    }));

    try {
      await apiPost("/admin/inventory/adjustment", input, token);
      if (input.movementType === "writeoff") {
        triggerNotification("warning");
      } else if (input.movementType === "restock") {
        triggerNotification("success");
      } else {
        triggerSelection();
      }
      set((state) => ({
        error: null,
        pendingStoreProductIds: Object.fromEntries(
          Object.entries(state.pendingStoreProductIds).filter(([id]) => id !== targetItem.storeProductId)
        ),
      }));
      void get().loadInventory(input.storeId, { silent: true });
      void get().loadStores();
    } catch (error) {
      triggerNotification("error");
      set((state) => ({
        error: error instanceof Error ? error.message : "Failed to adjust inventory",
        pendingStoreProductIds: Object.fromEntries(
          Object.entries(state.pendingStoreProductIds).filter(([id]) => id !== targetItem.storeProductId)
        ),
        inventoryItems: previousItems,
        inventoryHistory: previousHistory,
        stores: previousStores,
      }));
    }
  },

  createProduct: async (input) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }
    const previousProducts = get().products;
    const previousItems = get().inventoryItems;
    const previousStores = get().stores;
    const storeRows = get().stores;
    const inventoryStoreRows = get().inventoryStores;
    const currentStoreId = get().inventoryItems[0]?.storeId ?? inventoryStoreRows[0]?.id ?? null;
    const currentStoreName =
      storeRows.find((store) => store.id === currentStoreId)?.name ??
      inventoryStoreRows.find((store) => store.id === currentStoreId)?.name ??
      "Selected store";
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticProductId = `optimistic-product-${Date.now()}`;
    const optimisticProduct: AdminProduct = {
      id: optimisticProductId,
      name: input.name.trim(),
      sku: input.sku.trim(),
      defaultPrice: input.defaultPrice,
      isActive: input.isActive ?? true,
      isArchived: false,
      archivedAt: null,
      enabledStoreCount: storeRows.length,
      storeSettings: storeRows.map((store) => ({
        storeProductId: `optimistic-store-product-${store.id}-${optimisticProductId}`,
        storeId: store.id,
        storeName: store.name,
        storeActive: store.isActive,
        storePrice: input.defaultPrice,
        isEnabled: true,
        updatedAt: optimisticCreatedAt,
      })),
      createdAt: optimisticCreatedAt,
      updatedAt: optimisticCreatedAt,
    };
    const optimisticCurrentStoreItem =
      currentStoreId && !previousItems.some((item) => item.productId === optimisticProductId)
        ? {
            storeProductId: `optimistic-store-product-${currentStoreId}-${optimisticProductId}`,
            storeId: currentStoreId,
            storeName: currentStoreName,
            productId: optimisticProductId,
            productName: optimisticProduct.name,
            sku: optimisticProduct.sku,
            defaultPrice: optimisticProduct.defaultPrice,
            storePrice: optimisticProduct.defaultPrice,
            isEnabled: true,
            isProductActive: optimisticProduct.isActive,
            stockQuantity: 0,
            updatedAt: optimisticCreatedAt,
          }
        : null;
    const nextItems = optimisticCurrentStoreItem ? [optimisticCurrentStoreItem, ...previousItems] : previousItems;
    const nextStores = currentStoreId
      ? recalculateStoreInventoryMetrics(previousStores, nextItems, currentStoreId)
      : previousStores;

    set({
      creatingProduct: true,
      error: null,
      products: [optimisticProduct, ...previousProducts],
      inventoryItems: nextItems,
      stores: nextStores,
    });

    patchAdminStartupCache(token, (startup) => ({
      ...startup,
      stores: {
        ...startup.stores,
        stores: nextStores,
      },
      inventory: {
        ...startup.inventory,
        products: [optimisticProduct, ...startup.inventory.products],
        items: nextItems,
      },
    }));

    try {
      const response = await apiPost<AdminProductMutationResponse>("/admin/products", input, token);
      triggerNotification("success");
      const confirmedProduct: AdminProduct = {
        ...optimisticProduct,
        ...response.product,
      };

      set((state) => ({
        creatingProduct: false,
        error: null,
        products: state.products.map((product) =>
          product.id === optimisticProductId ? confirmedProduct : product
        ),
        inventoryItems: state.inventoryItems.map((item) =>
          item.productId === optimisticProductId
            ? {
                ...item,
                storeProductId: `pending-server-store-product-${response.product.id}`,
                productId: response.product.id,
                productName: response.product.name,
                sku: response.product.sku,
                defaultPrice: response.product.defaultPrice,
                storePrice: response.product.defaultPrice,
                isProductActive: response.product.isActive,
              }
            : item
        ),
      }));

      patchAdminStartupCache(token, (startup) => ({
        ...startup,
        inventory: {
          ...startup.inventory,
          products: startup.inventory.products.map((product) =>
            product.id === optimisticProductId ? confirmedProduct : product
          ),
          items: startup.inventory.items.map((item) =>
            item.productId === optimisticProductId
              ? {
                  ...item,
                  storeProductId: `pending-server-store-product-${response.product.id}`,
                  productId: response.product.id,
                  productName: response.product.name,
                  sku: response.product.sku,
                  defaultPrice: response.product.defaultPrice,
                  storePrice: response.product.defaultPrice,
                  isProductActive: response.product.isActive,
                }
              : item
          ),
        },
      }));

      void get().loadProducts();
      void get().loadProducts({ archived: true });
      if (currentStoreId) {
        void get().loadInventory(currentStoreId, { silent: true });
      }
    } catch (error) {
      triggerNotification("error");
      set({
        creatingProduct: false,
        products: previousProducts,
        inventoryItems: previousItems,
        stores: previousStores,
        error: error instanceof Error ? error.message : "Failed to create product",
      });
    }
  },

  updateProduct: async (productId, input) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }
    const previousProducts = get().products;
    const previousArchivedProducts = get().archivedProducts;
    const previousItems = get().inventoryItems;
    const optimisticUpdatedAt = new Date().toISOString();
    const nextCollections = updateProductCollections(previousProducts, previousArchivedProducts, (product) =>
      product.id === productId
        ? {
            ...product,
            name: input.name ?? product.name,
            sku: input.sku ?? product.sku,
            defaultPrice: input.defaultPrice ?? product.defaultPrice,
            isActive: input.isActive ?? product.isActive,
            updatedAt: optimisticUpdatedAt,
          }
        : product
    );
    const nextItems = previousItems.map((item) =>
      item.productId === productId
        ? {
            ...item,
            productName: input.name ?? item.productName,
            sku: input.sku ?? item.sku,
            defaultPrice: input.defaultPrice ?? item.defaultPrice,
            isProductActive: input.isActive ?? item.isProductActive,
          }
        : item
    );

    set((state) => ({
      error: null,
      pendingProductIds: {
        ...state.pendingProductIds,
        [productId]: true,
      },
      products: nextCollections.products,
      archivedProducts: nextCollections.archivedProducts,
      inventoryItems: nextItems,
    }));

    try {
      const response = await apiPatch<AdminProductMutationResponse>(`/admin/products/${productId}`, input, token);
      triggerNotification("success");
      const confirmedCollections = updateProductCollections(
        get().products,
        get().archivedProducts,
        (product) => (product.id === productId ? { ...product, ...response.product } : product)
      );

      set((state) => ({
        error: null,
        pendingProductIds: Object.fromEntries(
          Object.entries(state.pendingProductIds).filter(([id]) => id !== productId)
        ),
        products: confirmedCollections.products,
        archivedProducts: confirmedCollections.archivedProducts,
        inventoryItems: state.inventoryItems.map((item) =>
          item.productId === productId
            ? {
                ...item,
                productName: response.product.name,
                sku: response.product.sku,
                defaultPrice: response.product.defaultPrice,
                isProductActive: response.product.isActive,
              }
            : item
        ),
      }));

      void get().loadProducts();
      void get().loadProducts({ archived: true });
      const currentStoreId = get().inventoryItems[0]?.storeId;
      if (currentStoreId) {
        void get().loadInventory(currentStoreId, { silent: true });
      }
    } catch (error) {
      triggerNotification("error");
      set((state) => ({
        error: error instanceof Error ? error.message : "Failed to update product",
        pendingProductIds: Object.fromEntries(
          Object.entries(state.pendingProductIds).filter(([id]) => id !== productId)
        ),
        products: previousProducts,
        archivedProducts: previousArchivedProducts,
        inventoryItems: previousItems,
      }));
    }
  },

  deleteProduct: async (productId) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const currentStoreId = get().inventoryItems[0]?.storeId;
    const previousProducts = get().products;
    const previousArchivedProducts = get().archivedProducts;
    const previousItems = get().inventoryItems;
    const previousStores = get().stores;
    const nextItems = previousItems.filter((item) => item.productId !== productId);
    const nextStores = currentStoreId
      ? recalculateStoreInventoryMetrics(previousStores, nextItems, currentStoreId)
      : previousStores;

    set((state) => ({
      error: null,
      pendingProductIds: {
        ...state.pendingProductIds,
        [productId]: true,
      },
      products: state.products.filter((product) => product.id !== productId),
      archivedProducts: state.archivedProducts.filter((product) => product.id !== productId),
      inventoryItems: nextItems,
      stores: nextStores,
    }));

    try {
      await apiDelete<{ ok: boolean }>(`/admin/products/${productId}`, token);
      triggerNotification("success");
      set((state) => ({
        error: null,
        pendingProductIds: Object.fromEntries(
          Object.entries(state.pendingProductIds).filter(([id]) => id !== productId)
        ),
      }));
      void get().loadProducts();
      void get().loadProducts({ archived: true });
      if (currentStoreId) {
        void get().loadInventory(currentStoreId, { silent: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete product";
      triggerNotification("error");
      set((state) => ({
        error: message,
        pendingProductIds: Object.fromEntries(
          Object.entries(state.pendingProductIds).filter(([id]) => id !== productId)
        ),
        products: previousProducts,
        archivedProducts: previousArchivedProducts,
        inventoryItems: previousItems,
        stores: previousStores,
      }));
      throw error instanceof Error ? error : new Error(message);
    }
  },

  archiveProduct: async (productId) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const currentStoreId = get().inventoryItems[0]?.storeId;
    const previousProducts = get().products;
    const previousArchivedProducts = get().archivedProducts;
    const previousItems = get().inventoryItems;
    const previousStores = get().stores;
    const productToArchive = previousProducts.find((product) => product.id === productId);

    if (!productToArchive) {
      set({ error: "Product not found" });
      return;
    }

    const archivedAt = new Date().toISOString();
    const archivedProduct: AdminProduct = {
      ...productToArchive,
      isArchived: true,
      archivedAt,
      updatedAt: archivedAt,
    };
    const nextItems = previousItems.filter((item) => item.productId !== productId);
    const nextStores = currentStoreId
      ? recalculateStoreInventoryMetrics(previousStores, nextItems, currentStoreId)
      : previousStores;

    set((state) => ({
      error: null,
      pendingProductIds: {
        ...state.pendingProductIds,
        [productId]: true,
      },
      products: state.products.filter((product) => product.id !== productId),
      archivedProducts: [archivedProduct, ...state.archivedProducts.filter((product) => product.id !== productId)],
      inventoryItems: nextItems,
      stores: nextStores,
    }));

    try {
      await apiPost<AdminProductMutationResponse>(`/admin/products/${productId}/archive`, {}, token);
      triggerNotification("success");
      set((state) => ({
        error: null,
        pendingProductIds: Object.fromEntries(
          Object.entries(state.pendingProductIds).filter(([id]) => id !== productId)
        ),
      }));
      void get().loadProducts();
      void get().loadProducts({ archived: true });
      if (currentStoreId) {
        void get().loadInventory(currentStoreId, { silent: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to archive product";
      triggerNotification("error");
      set((state) => ({
        error: message,
        pendingProductIds: Object.fromEntries(
          Object.entries(state.pendingProductIds).filter(([id]) => id !== productId)
        ),
        products: previousProducts,
        archivedProducts: previousArchivedProducts,
        inventoryItems: previousItems,
        stores: previousStores,
      }));
      throw error instanceof Error ? error : new Error(message);
    }
  },

  restoreProduct: async (productId) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const currentStoreId = get().inventoryItems[0]?.storeId;
    const previousProducts = get().products;
    const previousArchivedProducts = get().archivedProducts;
    const previousItems = get().inventoryItems;
    const previousStores = get().stores;
    const productToRestore = previousArchivedProducts.find((product) => product.id === productId);

    if (!productToRestore) {
      set({ error: "Product not found" });
      return;
    }

    const restoredProduct: AdminProduct = {
      ...productToRestore,
      isArchived: false,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    };
    const currentStoreSetting = productToRestore.storeSettings.find((setting) => setting.storeId === currentStoreId);
    const optimisticInventoryItem =
      currentStoreId && currentStoreSetting
        ? {
            storeProductId: currentStoreSetting.storeProductId,
            storeId: currentStoreId,
            storeName: currentStoreSetting.storeName,
            productId: restoredProduct.id,
            productName: restoredProduct.name,
            sku: restoredProduct.sku,
            defaultPrice: restoredProduct.defaultPrice,
            storePrice: currentStoreSetting.storePrice,
            isEnabled: currentStoreSetting.isEnabled,
            isProductActive: restoredProduct.isActive,
            stockQuantity: 0,
            updatedAt: restoredProduct.updatedAt,
          }
        : null;
    const nextItems =
      optimisticInventoryItem && !previousItems.some((item) => item.productId === productId)
        ? [optimisticInventoryItem, ...previousItems]
        : previousItems;
    const nextStores = currentStoreId
      ? recalculateStoreInventoryMetrics(previousStores, nextItems, currentStoreId)
      : previousStores;

    set((state) => ({
      error: null,
      pendingProductIds: {
        ...state.pendingProductIds,
        [productId]: true,
      },
      products: [restoredProduct, ...state.products.filter((product) => product.id !== productId)],
      archivedProducts: state.archivedProducts.filter((product) => product.id !== productId),
      inventoryItems: nextItems,
      stores: nextStores,
    }));

    try {
      await apiPost<AdminProductMutationResponse>(`/admin/products/${productId}/restore`, {}, token);
      triggerNotification("success");
      set((state) => ({
        error: null,
        pendingProductIds: Object.fromEntries(
          Object.entries(state.pendingProductIds).filter(([id]) => id !== productId)
        ),
      }));
      void get().loadProducts();
      void get().loadProducts({ archived: true });
      if (currentStoreId) {
        void get().loadInventory(currentStoreId, { silent: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to restore product";
      triggerNotification("error");
      set((state) => ({
        error: message,
        pendingProductIds: Object.fromEntries(
          Object.entries(state.pendingProductIds).filter(([id]) => id !== productId)
        ),
        products: previousProducts,
        archivedProducts: previousArchivedProducts,
        inventoryItems: previousItems,
        stores: previousStores,
      }));
      throw error instanceof Error ? error : new Error(message);
    }
  },
}));
