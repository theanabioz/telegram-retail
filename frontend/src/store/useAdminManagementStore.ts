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

type AdminManagementState = {
  loadingStores: boolean;
  loadingStaff: boolean;
  mutating: boolean;
  loadingInventory: boolean;
  loadingSales: boolean;
  error: string | null;
  stores: AdminStoresResponse["stores"];
  staff: AdminStaffResponse["sellers"];
  inventoryStores: AdminInventoryResponse["stores"];
  products: AdminProductsResponse["products"];
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
  loadProducts: () => Promise<void>;
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
  hydrateStartup: (startup: AdminStartupResponse) => void;
};

const cachedAdminStartup = readCachedAdminStartup();

export const useAdminManagementStore = create<AdminManagementState>((set, get) => ({
  loadingStores: false,
  loadingStaff: false,
  mutating: false,
  loadingInventory: false,
  loadingSales: false,
  error: null,
  stores: cachedAdminStartup?.stores.stores ?? [],
  staff: cachedAdminStartup?.staff.sellers ?? [],
  inventoryStores: cachedAdminStartup?.inventory.stores ?? [],
  products: cachedAdminStartup?.inventory.products ?? [],
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
      error: null,
      stores: startup.stores.stores,
      staff: startup.staff.sellers,
      inventoryStores: startup.inventory.stores,
      products: startup.inventory.products,
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

  loadProducts: async () => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    try {
      const data = await apiGet<AdminProductsResponse>("/admin/products", token);
      set({ products: data.products, error: null });
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

    set({ mutating: true, error: null });

    try {
      await apiPatch<AdminStoreProductMutationResponse>(
        `/admin/store-products/${storeProductId}`,
        input,
        token
      );
      triggerNotification("success");
      await get().loadInventory(currentStoreId);
      set({ mutating: false, error: null });
    } catch (error) {
      triggerNotification("error");
      set({
        mutating: false,
        error: error instanceof Error ? error.message : "Failed to update store product",
      });
    }
  },

  adjustInventory: async (input) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ mutating: true, error: null });

    try {
      await apiPost("/admin/inventory/adjustment", input, token);
      if (input.movementType === "writeoff") {
        triggerNotification("warning");
      } else if (input.movementType === "restock") {
        triggerNotification("success");
      } else {
        triggerSelection();
      }
      await get().loadInventory(input.storeId);
      await get().loadStores();
      set({ mutating: false, error: null });
    } catch (error) {
      triggerNotification("error");
      set({
        mutating: false,
        error: error instanceof Error ? error.message : "Failed to adjust inventory",
      });
    }
  },

  createProduct: async (input) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ mutating: true, error: null });

    try {
      const data = await apiPost<AdminProductMutationResponse>("/admin/products", input, token);
      triggerNotification("success");
      set((current) => ({
        products: [data.product, ...current.products.filter((product) => product.id !== data.product.id)],
      }));
      await get().loadInventory();
      set({ mutating: false, error: null });
    } catch (error) {
      triggerNotification("error");
      set({
        mutating: false,
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

    set({ mutating: true, error: null });

    try {
      await apiPatch<AdminProductMutationResponse>(`/admin/products/${productId}`, input, token);
      triggerNotification("success");
      await Promise.all([get().loadProducts(), get().loadInventory()]);
      set({ mutating: false, error: null });
    } catch (error) {
      triggerNotification("error");
      set({
        mutating: false,
        error: error instanceof Error ? error.message : "Failed to update product",
      });
    }
  },

  deleteProduct: async (productId) => {
    const token = getStoredToken();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const currentStoreId = get().inventoryItems[0]?.storeId;

    set({ mutating: true, error: null });

    try {
      await apiDelete<{ ok: boolean }>(`/admin/products/${productId}`, token);
      triggerNotification("success");
      await Promise.all([get().loadProducts(), get().loadInventory(currentStoreId)]);
      set({ mutating: false, error: null });
    } catch (error) {
      triggerNotification("error");
      set({
        mutating: false,
        error: error instanceof Error ? error.message : "Failed to delete product",
      });
    }
  },
}));
