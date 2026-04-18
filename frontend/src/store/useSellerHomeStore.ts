import { create } from "zustand";
import { sellerHomeMock } from "../data/mockSellerHome";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { config } from "../lib/config";
import type {
  AuthSessionResponse,
  CheckoutResponse,
  DraftResponse,
  InventoryHistoryResponse,
  SellerCatalogResponse,
  SellerSalesResponse,
  ShiftHistoryResponse,
  ShiftSummary,
  ShiftStateResponse,
} from "../types/seller";

type SellerHomeState = {
  mode: "demo" | "live";
  loading: boolean;
  actionLoading: boolean;
  error: string | null;
  storeId: string | null;
  storeName: string;
  operatorName: string;
  shiftActive: boolean;
  shiftStatus: "active" | "paused" | "closed" | "inactive";
  shiftSummary: ShiftSummary | null;
  localIpLabel: string;
  products: typeof sellerHomeMock.products;
  draft: DraftResponse | null;
  sales: SellerSalesResponse["sales"];
  inventoryHistory: InventoryHistoryResponse["items"];
  shiftHistory: ShiftHistoryResponse["items"];
  shiftHistoryPagination: ShiftHistoryResponse["pagination"] | null;
  token: string | null;
  bootstrap: () => Promise<void>;
  startShift: () => Promise<void>;
  pauseShift: () => Promise<void>;
  resumeShift: () => Promise<void>;
  stopShift: () => Promise<void>;
  addToDraft: (productId: string) => Promise<void>;
  updateDraftItem: (
    itemId: string,
    updates: {
      quantity?: number;
      discountType?: "amount" | "percent" | null;
      discountValue?: number | null;
    }
  ) => Promise<void>;
  removeDraftItem: (itemId: string) => Promise<void>;
  checkout: (paymentMethod: "cash" | "card") => Promise<void>;
  deleteSale: (saleId: string, reason: string) => Promise<void>;
  returnSaleItem: (saleId: string, saleItemId: string, reason: string) => Promise<void>;
  restockProduct: (productId: string, quantity: number, reason: string) => Promise<void>;
  writeoffProduct: (productId: string, quantity: number, reason: string) => Promise<void>;
  loadShiftHistory: (limit?: number, offset?: number) => Promise<void>;
};

const TOKEN_KEY = "telegram-retail-token";
let draftMutationVersion = 0;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function summarizeDraftItems(items: DraftResponse["items"]) {
  const subtotalAmount = Number(items.reduce((sum, item) => sum + item.base_price * item.quantity, 0).toFixed(2));
  const totalAmount = Number(items.reduce((sum, item) => sum + item.line_total, 0).toFixed(2));

  return {
    subtotalAmount,
    discountAmount: Number((subtotalAmount - totalAmount).toFixed(2)),
    totalAmount,
    itemsCount: items.length,
  };
}

function buildDraftState(
  previousDraft: DraftResponse | null,
  items: DraftResponse["items"],
  storeId: string | null
): DraftResponse {
  return {
    draft: previousDraft?.draft ?? {
      id: "optimistic-draft",
      seller_id: "",
      store_id: storeId ?? "",
      shift_id: "",
    },
    items,
    summary: summarizeDraftItems(items),
  };
}

function resolveDraftFinalPrice(
  item: DraftResponse["items"][number],
  updates: {
    quantity?: number;
    discountType?: "amount" | "percent" | null;
    discountValue?: number | null;
  }
) {
  const isDiscountUpdate = updates.discountType !== undefined || updates.discountValue !== undefined;

  if (!isDiscountUpdate) {
    return item.final_price;
  }

  const discountType = updates.discountType === undefined ? item.discount_type : updates.discountType;
  const discountValue = updates.discountValue === undefined ? item.discount_value : updates.discountValue;

  if (!discountType || discountValue == null) {
    return Number(item.base_price.toFixed(2));
  }

  if (discountType === "amount") {
    return Number(Math.max(0, item.base_price - discountValue).toFixed(2));
  }

  return Number(Math.max(0, item.base_price * (1 - discountValue / 100)).toFixed(2));
}

function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export const useSellerHomeStore = create<SellerHomeState>((set, get) => ({
  mode: "demo",
  loading: true,
  actionLoading: false,
  error: null,
  storeId: null,
  storeName: sellerHomeMock.storeName,
  operatorName: sellerHomeMock.operatorName,
  shiftActive: false,
  shiftStatus: "inactive",
  shiftSummary: null,
  localIpLabel: sellerHomeMock.localIpLabel,
  products: sellerHomeMock.products,
  draft: null,
  sales: [],
  inventoryHistory: [],
  shiftHistory: [],
  shiftHistoryPagination: null,
  token: getStoredToken(),

  bootstrap: async () => {
    set({ loading: true, error: null });

    try {
      let token = get().token ?? getStoredToken();

      if (!token) {
        const session = await apiPost<AuthSessionResponse>("/auth/dev-login", {
          telegramId: config.devTelegramId,
        });
        token = session.token;
        setStoredToken(token);
        set({
          token,
          operatorName: session.user.full_name,
          storeId: session.assignment?.store_id ?? null,
          storeName: session.assignment?.store_name ?? sellerHomeMock.storeName,
        });
      }

      const [me, shiftState, shiftHistory] = await Promise.all([
        apiGet<{
          user: {
            id: string;
            full_name: string;
          };
          assignment: {
            store_id: string;
            store_name: string;
          } | null;
        }>("/auth/me", token),
        apiGet<ShiftStateResponse>("/shifts/current", token),
        apiGet<ShiftHistoryResponse>("/shifts/history?limit=7&offset=0", token),
      ]);

      set({
        token,
        operatorName: me.user.full_name,
        storeId: me.assignment?.store_id ?? null,
        storeName: me.assignment?.store_name ?? sellerHomeMock.storeName,
        shiftActive: Boolean(shiftState.activeShift && shiftState.activeShift.status === "active"),
        shiftStatus: shiftState.activeShift?.status ?? "inactive",
        shiftSummary: shiftState.summary,
        shiftHistory: shiftHistory.items,
        shiftHistoryPagination: shiftHistory.pagination,
      });

      if (!shiftState.activeShift || shiftState.activeShift.status !== "active") {
        set({
          mode: "demo",
          loading: false,
          products: sellerHomeMock.products,
          draft: null,
          sales: [],
          inventoryHistory: [],
        });
        return;
      }

      const [catalog, draft, sales, inventoryHistory] = await Promise.all([
        apiGet<SellerCatalogResponse>("/seller/catalog", token),
        apiGet<DraftResponse>("/seller/draft", token),
        apiGet<SellerSalesResponse>("/seller/sales?limit=12", token),
        apiGet<InventoryHistoryResponse>("/seller/inventory/history?limit=20", token),
      ]);

      set({
        mode: "live",
        loading: false,
        error: null,
        shiftActive: true,
        shiftStatus: catalog.shift.status,
        storeId: catalog.store.store_id,
        storeName: catalog.store.store_name,
        products: catalog.products.map((product) => ({
          id: product.id,
          name: product.name,
          price: product.storePrice,
          stock: product.stock,
        })),
        draft,
        sales: sales.sales,
        inventoryHistory: inventoryHistory.items,
      });
    } catch (error) {
      set({
        mode: "demo",
        loading: false,
        error: error instanceof Error ? error.message : "Failed to bootstrap seller home",
        products: sellerHomeMock.products,
        draft: null,
        sales: [],
        inventoryHistory: [],
        shiftStatus: "inactive",
        shiftSummary: null,
      });
    }
  },

  startShift: async () => {
    const { token, storeId } = get();

    if (!token || !storeId) {
      set({ error: "Missing token or store assignment" });
      return;
    }

    set({ actionLoading: true, error: null });

    try {
      await apiPost("/shifts/start", { storeId }, token);
      set({ actionLoading: false });
      await get().bootstrap();
    } catch (error) {
      set({
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to start shift",
      });
    }
  },

  pauseShift: async () => {
    const { token } = get();
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ actionLoading: true, error: null });

    try {
      await apiPost("/shifts/pause", {}, token);
      set({ actionLoading: false });
      await get().bootstrap();
    } catch (error) {
      set({
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to pause shift",
      });
    }
  },

  resumeShift: async () => {
    const { token } = get();
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ actionLoading: true, error: null });

    try {
      await apiPost("/shifts/resume", {}, token);
      set({ actionLoading: false });
      await get().bootstrap();
    } catch (error) {
      set({
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to resume shift",
      });
    }
  },

  stopShift: async () => {
    const { token } = get();
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ actionLoading: true, error: null });

    try {
      await apiPost("/shifts/stop", {}, token);
      set({ actionLoading: false });
      await get().bootstrap();
    } catch (error) {
      set({
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to stop shift",
      });
    }
  },

  addToDraft: async (productId: string) => {
    const { token } = get();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const previousDraft = get().draft;
    const product = get().products.find((item) => item.id === productId);

    if (product) {
      const existing = previousDraft?.items.find((item) => item.product_id === productId);
      const nextItems = existing
        ? previousDraft!.items.map((item) =>
            item.product_id === productId
              ? {
                  ...item,
                  quantity: item.quantity + 1,
                  line_total: Number(((item.quantity + 1) * item.final_price).toFixed(2)),
                }
              : item
          )
        : [
            ...(previousDraft?.items ?? []),
            {
              id: `optimistic-${productId}-${Date.now()}`,
              product_id: productId,
              product_name_snapshot: product.name,
              sku_snapshot: "",
              base_price: product.price,
              final_price: product.price,
              discount_type: null,
              discount_value: null,
              quantity: 1,
              line_total: product.price,
            },
          ];
      set({
        error: null,
        draft: buildDraftState(previousDraft ?? null, nextItems, get().storeId),
      });
    } else {
      set({ error: null });
    }

    const mutationVersion = ++draftMutationVersion;

    try {
      const draft = await apiPost<DraftResponse>(
        "/seller/draft/items",
        {
          productId,
          quantity: 1,
        },
        token
      );

      if (mutationVersion === draftMutationVersion) {
        set({ draft, mode: "live", error: null });
      } else {
        const currentDraft = get().draft;
        const outOfSyncItems = draft.items.filter((serverItem) => {
          const localItem = currentDraft?.items.find((item) => item.product_id === serverItem.product_id);
          return !localItem || localItem.quantity < serverItem.quantity;
        });

        void Promise.all(
          outOfSyncItems.map((serverItem) => {
            const localItem = currentDraft?.items.find((item) => item.product_id === serverItem.product_id);

            return localItem
              ? apiPatch(`/seller/draft/items/${serverItem.id}`, { quantity: localItem.quantity }, token).catch(() => null)
              : apiDelete(`/seller/draft/items/${serverItem.id}`, token).catch(() => null);
          })
        );
      }
    } catch (error) {
      if (mutationVersion === draftMutationVersion) {
        set({
          draft: previousDraft,
          error: error instanceof Error ? error.message : "Failed to add item to cart",
        });
      }
    }
  },

  updateDraftItem: async (itemId, updates) => {
    const { token } = get();
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const previousDraft = get().draft;
    const currentItem = previousDraft?.items.find((item) => item.id === itemId);

    if (previousDraft && currentItem) {
      const nextItems = previousDraft.items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const nextQuantity = updates.quantity ?? item.quantity;
        const nextFinalPrice = resolveDraftFinalPrice(item, updates);
        const nextDiscountType = updates.discountType === undefined ? item.discount_type : updates.discountType;
        const nextDiscountValue = updates.discountValue === undefined ? item.discount_value : updates.discountValue;

        return {
          ...item,
          quantity: nextQuantity,
          final_price: nextFinalPrice,
          discount_type: nextDiscountType,
          discount_value: nextDiscountValue,
          line_total: Number((nextQuantity * nextFinalPrice).toFixed(2)),
        };
      });

      set({ error: null, draft: buildDraftState(previousDraft, nextItems, get().storeId) });
    } else {
      set({ error: null });
    }

    const mutationVersion = ++draftMutationVersion;

    try {
      const draft = await apiPatch<DraftResponse>(`/seller/draft/items/${itemId}`, updates, token);
      if (mutationVersion === draftMutationVersion) {
        set({ draft });
      }
    } catch (error) {
      if (mutationVersion === draftMutationVersion) {
        set({
          draft: previousDraft,
          error: error instanceof Error ? error.message : "Failed to update cart item",
        });
      }
    }
  },

  removeDraftItem: async (itemId: string) => {
    const { token } = get();
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const previousDraft = get().draft;

    if (previousDraft) {
      const nextItems = previousDraft.items.filter((item) => item.id !== itemId);
      set({
        error: null,
        draft: buildDraftState(previousDraft, nextItems, get().storeId),
      });
    } else {
      set({ error: null });
    }

    const mutationVersion = ++draftMutationVersion;

    try {
      if (isUuid(itemId)) {
        const draft = await apiDelete<DraftResponse>(`/seller/draft/items/${itemId}`, token);
        if (mutationVersion === draftMutationVersion) {
          set({ draft });
        }
      }
    } catch (error) {
      if (mutationVersion === draftMutationVersion) {
        set({
          draft: previousDraft,
          error: error instanceof Error ? error.message : "Failed to remove cart item",
        });
      }
    }
  },

  checkout: async (paymentMethod: "cash" | "card") => {
    const { token } = get();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const previousDraft = get().draft;
    const previousSales = get().sales;
    const previousProducts = get().products;

    if (!previousDraft || previousDraft.items.length === 0) {
      set({ error: "Draft cart is empty" });
      return;
    }

    const optimisticSale = {
      id: `optimistic-sale-${Date.now()}`,
      seller_id: previousDraft.draft.seller_id,
      store_id: previousDraft.draft.store_id,
      shift_id: previousDraft.draft.shift_id,
      payment_method: paymentMethod,
      status: "completed" as const,
      subtotal_amount: previousDraft.summary.subtotalAmount,
      discount_amount: previousDraft.summary.discountAmount,
      total_amount: previousDraft.summary.totalAmount,
      created_at: new Date().toISOString(),
      items: previousDraft.items,
    };

    set({
      error: null,
      draft: buildDraftState(previousDraft, [], get().storeId),
      sales: [optimisticSale, ...previousSales],
      products: previousProducts.map((product) => {
        const soldQuantity = previousDraft.items
          .filter((item) => item.product_id === product.id)
          .reduce((sum, item) => sum + item.quantity, 0);

        return soldQuantity > 0
          ? {
              ...product,
              stock: Math.max(0, product.stock - soldQuantity),
            }
          : product;
      }),
    });

    const mutationVersion = ++draftMutationVersion;

    try {
      const checkoutResult = await apiPost<CheckoutResponse>("/seller/checkout", { paymentMethod }, token);

      if (mutationVersion === draftMutationVersion) {
        const sale = {
          ...checkoutResult.sale,
          items: checkoutResult.items,
        };

        set({
          draft: buildDraftState(previousDraft, [], get().storeId),
          sales: [sale, ...get().sales.filter((item) => item.id !== optimisticSale.id)],
          error: null,
        });
      }
    } catch (error) {
      if (mutationVersion === draftMutationVersion) {
        set({
          draft: previousDraft,
          sales: previousSales,
          products: previousProducts,
          error: error instanceof Error ? error.message : "Checkout failed",
        });
      }
    }
  },

  deleteSale: async (saleId: string, reason: string) => {
    const { token } = get();
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ actionLoading: true, error: null });

    try {
      await apiPost(`/seller/sales/${saleId}/delete`, { reason }, token);
      set({ actionLoading: false });
      await get().bootstrap();
    } catch (error) {
      set({
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to delete sale",
      });
    }
  },

  returnSaleItem: async (saleId: string, saleItemId: string, reason: string) => {
    const { token } = get();
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ actionLoading: true, error: null });

    try {
      await apiPost(
        "/seller/returns",
        {
          saleId,
          reason,
          items: [{ saleItemId, quantity: 1 }],
        },
        token
      );
      set({ actionLoading: false });
      await get().bootstrap();
    } catch (error) {
      set({
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to create return",
      });
    }
  },

  restockProduct: async (productId: string, quantity: number, reason: string) => {
    const { token } = get();
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ actionLoading: true, error: null });

    try {
      await apiPost(
        "/seller/inventory/restock",
        {
          productId,
          quantity,
          reason,
        },
        token
      );
      set({ actionLoading: false });
      await get().bootstrap();
    } catch (error) {
      set({
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to restock product",
      });
    }
  },

  writeoffProduct: async (productId: string, quantity: number, reason: string) => {
    const { token } = get();
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ actionLoading: true, error: null });

    try {
      await apiPost(
        "/seller/inventory/writeoff",
        {
          productId,
          quantity,
          reason,
        },
        token
      );
      set({ actionLoading: false });
      await get().bootstrap();
    } catch (error) {
      set({
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to write off product",
      });
    }
  },

  loadShiftHistory: async (limit = 7, offset = 0) => {
    const { token } = get();

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    try {
      const history = await apiGet<ShiftHistoryResponse>(
        `/shifts/history?limit=${limit}&offset=${offset}`,
        token
      );
      set({
        shiftHistory: offset > 0 ? [...get().shiftHistory, ...history.items] : history.items,
        shiftHistoryPagination: history.pagination,
        error: null,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to load shift history",
      });
    }
  },
}));
