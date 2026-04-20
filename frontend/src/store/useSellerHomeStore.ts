import { create } from "zustand";
import { sellerHomeMock } from "../data/mockSellerHome";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { config } from "../lib/config";
import { triggerImpact, triggerNotification, triggerSelection } from "../lib/haptics";
import type {
  AuthSessionResponse,
  CheckoutResponse,
  DraftResponse,
  InventoryHistoryResponse,
  SellerCatalogResponse,
  SellerSalesResponse,
  SellerStartupResponse,
  ShiftDetailsResponse,
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
  shiftDetails: ShiftDetailsResponse | null;
  shiftDetailsLoading: boolean;
  shiftDetailsById: Record<string, ShiftDetailsResponse>;
  pendingStockProductIds: Record<string, true>;
  pendingShiftMutationId: number | null;
  expectedShiftStatus: "active" | "paused" | "inactive" | null;
  shiftBootstrapAttempts: number;
  token: string | null;
  bootstrap: (options?: { skipCache?: boolean }) => Promise<void>;
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
  showShiftDetails: (shiftDetails: ShiftDetailsResponse) => void;
  loadShiftDetails: (shiftId: string) => Promise<void>;
  clearShiftDetails: () => void;
};

const TOKEN_KEY = "telegram-retail-token";
const SELLER_STARTUP_CACHE_KEY = "telegram-retail-seller-startup";
let draftMutationVersion = 0;
let shiftMutationVersion = 0;
let shiftBootstrapRetryTimer: number | null = null;

type SellerStartupCache = {
  token: string;
  startup: SellerStartupResponse;
};

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

function draftItemsMatchLocalState(
  serverDraft: DraftResponse,
  localDraft: DraftResponse | null
) {
  if (!localDraft) {
    return true;
  }

  if (serverDraft.items.length !== localDraft.items.length) {
    return false;
  }

  return serverDraft.items.every((serverItem) => {
    const localItem = localDraft.items.find((item) => item.product_id === serverItem.product_id);

    if (!localItem) {
      return false;
    }

    return (
      localItem.quantity === serverItem.quantity &&
      localItem.discount_type === serverItem.discount_type &&
      (localItem.discount_value ?? null) === (serverItem.discount_value ?? null) &&
      localItem.final_price === serverItem.final_price
    );
  });
}

async function reconcileDraftWithLocalState(
  serverDraft: DraftResponse,
  localDraft: DraftResponse | null,
  token: string
) {
  if (!localDraft || draftItemsMatchLocalState(serverDraft, localDraft)) {
    return serverDraft;
  }

  for (const serverItem of serverDraft.items) {
    const localItem = localDraft.items.find((item) => item.product_id === serverItem.product_id);

    if (!localItem) {
      await apiDelete(`/seller/draft/items/${serverItem.id}`, token).catch(() => null);
      continue;
    }

    const hasMismatch =
      localItem.quantity !== serverItem.quantity ||
      localItem.discount_type !== serverItem.discount_type ||
      (localItem.discount_value ?? null) !== (serverItem.discount_value ?? null) ||
      localItem.final_price !== serverItem.final_price;

    if (!hasMismatch) {
      continue;
    }

    await apiPatch(
      `/seller/draft/items/${serverItem.id}`,
      {
        quantity: localItem.quantity,
        discountType: localItem.discount_type,
        discountValue: localItem.discount_value,
      },
      token
    ).catch(() => null);
  }

  return apiGet<DraftResponse>("/seller/draft", token).catch(() => serverDraft);
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

function readSellerStartupCache(token: string) {
  try {
    const raw = window.localStorage.getItem(SELLER_STARTUP_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const cached = JSON.parse(raw) as SellerStartupCache;
    return cached.token === token ? cached.startup : null;
  } catch {
    return null;
  }
}

function writeSellerStartupCache(token: string, startup: SellerStartupResponse) {
  try {
    window.localStorage.setItem(SELLER_STARTUP_CACHE_KEY, JSON.stringify({ token, startup }));
  } catch {
    // Cache is a UX optimization only; storage failures should never block the POS.
  }
}

function patchSellerStartupCache(
  token: string,
  updater: (startup: SellerStartupResponse) => SellerStartupResponse
) {
  const cachedStartup = readSellerStartupCache(token);

  if (!cachedStartup) {
    return;
  }

  writeSellerStartupCache(token, updater(cachedStartup));
}

function mapCatalogProducts(catalog: SellerCatalogResponse) {
  return catalog.products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.storePrice,
    stock: product.stock,
  }));
}

function resolveCurrentToken(stateToken: string | null) {
  return getStoredToken() ?? stateToken;
}

function buildOptimisticInventoryMovement(params: {
  productId: string;
  productName: string;
  quantityDelta: number;
  balanceAfter: number;
  reason: string;
  operatorName: string;
}) {
  return {
    id: `optimistic-inventory-${params.productId}-${Date.now()}`,
    movementType: params.quantityDelta >= 0 ? "Restock" : "Write-off",
    quantityDelta: params.quantityDelta,
    balanceAfter: params.balanceAfter,
    reason: params.reason,
    createdAt: new Date().toISOString(),
    product: {
      id: params.productId,
      name: params.productName,
      sku: "",
    },
    actor: {
      id: "optimistic-actor",
      full_name: params.operatorName,
      role: "seller" as const,
    },
    saleId: null,
    returnId: null,
    shiftId: null,
  };
}

function clearShiftBootstrapRetryTimer() {
  if (shiftBootstrapRetryTimer !== null) {
    window.clearTimeout(shiftBootstrapRetryTimer);
    shiftBootstrapRetryTimer = null;
  }
}

async function fetchShiftDetailsById(token: string, shiftId: string) {
  return apiGet<ShiftDetailsResponse>(`/shifts/history/${shiftId}`, token);
}

function buildSellerStartupState(startup: SellerStartupResponse, token: string) {
  const isLive = Boolean(
    startup.shiftState.activeShift &&
      startup.shiftState.activeShift.status === "active" &&
      startup.catalog &&
      startup.draft &&
      startup.sales &&
      startup.inventoryHistory
  );

  return {
    mode: isLive ? ("live" as const) : ("demo" as const),
    loading: false,
    error: null,
    token,
    operatorName: startup.me.user.full_name,
    storeId: startup.me.assignment?.store_id ?? startup.catalog?.store.store_id ?? null,
    storeName:
      startup.catalog?.store.store_name ??
      startup.me.assignment?.store_name ??
      sellerHomeMock.storeName,
    shiftActive: Boolean(startup.shiftState.activeShift && startup.shiftState.activeShift.status === "active"),
    shiftStatus: startup.shiftState.activeShift?.status ?? ("inactive" as const),
    shiftSummary: startup.shiftState.summary,
    shiftHistory: startup.shiftHistory.items,
    shiftHistoryPagination: startup.shiftHistory.pagination,
    shiftDetails: null,
    shiftDetailsLoading: false,
    products: isLive && startup.catalog ? mapCatalogProducts(startup.catalog) : sellerHomeMock.products,
    draft: isLive ? startup.draft : null,
    sales: isLive && startup.sales ? startup.sales.sales : [],
    inventoryHistory: isLive && startup.inventoryHistory ? startup.inventoryHistory.items : [],
  };
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
  shiftDetails: null,
  shiftDetailsLoading: false,
  shiftDetailsById: {},
  pendingStockProductIds: {},
  pendingShiftMutationId: null,
  expectedShiftStatus: null,
  shiftBootstrapAttempts: 0,
  token: getStoredToken(),

  bootstrap: async (options) => {
    set({ error: null });
    let usedCachedStartup = false;

    try {
      let token = resolveCurrentToken(get().token);

      if (!token) {
        set({ loading: true });
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

      if (token !== get().token) {
        set({ token });
      }

      const cachedStartup = options?.skipCache ? null : readSellerStartupCache(token);
      if (cachedStartup) {
        usedCachedStartup = true;
        set(buildSellerStartupState(cachedStartup, token));
      } else {
        set({ loading: true });
      }

      const startup = await apiGet<SellerStartupResponse>("/seller/startup", token);
      const pendingShiftMutationId = get().pendingShiftMutationId;
      const expectedShiftStatus = get().expectedShiftStatus;
      const startupShiftStatus = startup.shiftState.activeShift?.status ?? "inactive";

      if (
        pendingShiftMutationId !== null &&
        expectedShiftStatus !== null &&
        startupShiftStatus !== expectedShiftStatus
      ) {
        const nextAttempts = get().shiftBootstrapAttempts + 1;
        set({
          loading: false,
          error: null,
          shiftBootstrapAttempts: nextAttempts,
        });
        clearShiftBootstrapRetryTimer();
        if (nextAttempts <= 5) {
          shiftBootstrapRetryTimer = window.setTimeout(() => {
            if (get().pendingShiftMutationId === pendingShiftMutationId) {
              void get().bootstrap({ skipCache: true });
            }
          }, nextAttempts < 3 ? 350 : 650);
        }
        return;
      }

      clearShiftBootstrapRetryTimer();
      writeSellerStartupCache(token, startup);
      set({
        ...buildSellerStartupState(startup, token),
        pendingShiftMutationId: null,
        expectedShiftStatus: null,
        shiftBootstrapAttempts: 0,
      });

      void Promise.allSettled(
        startup.shiftHistory.items.slice(0, 7).map(async (entry) => {
          const shiftDetails = await fetchShiftDetailsById(token, entry.shift.id);
          set((current) => ({
            shiftDetailsById: {
              ...current.shiftDetailsById,
              [entry.shift.id]: shiftDetails,
            },
          }));
        })
      );
    } catch (error) {
      if (usedCachedStartup) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : "Failed to refresh seller home",
        });
        return;
      }

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
        shiftDetails: null,
        shiftDetailsLoading: false,
        shiftDetailsById: {},
      });
    }
  },

  startShift: async () => {
    const token = resolveCurrentToken(get().token);
    const { storeId } = get();

    if (!token || !storeId) {
      set({ error: "Missing token or store assignment" });
      return;
    }

    const previous = {
      shiftActive: get().shiftActive,
      shiftStatus: get().shiftStatus,
      shiftSummary: get().shiftSummary,
      mode: get().mode,
      pendingShiftMutationId: get().pendingShiftMutationId,
      expectedShiftStatus: get().expectedShiftStatus,
      shiftBootstrapAttempts: get().shiftBootstrapAttempts,
    };
    const mutationId = ++shiftMutationVersion;

    triggerSelection();
    clearShiftBootstrapRetryTimer();
    set({
      actionLoading: false,
      error: null,
      mode: "live",
      shiftActive: true,
      shiftStatus: "active",
      shiftSummary: previous.shiftSummary ?? { totalSeconds: 0, pausedSeconds: 0, workedSeconds: 0 },
      pendingShiftMutationId: mutationId,
      expectedShiftStatus: "active",
      shiftBootstrapAttempts: 0,
    });

    try {
      await apiPost("/shifts/start", { storeId }, token);
      patchSellerStartupCache(token, (startup) => ({
        ...startup,
        shiftState: {
          activeShift: {
            id: startup.shiftState.activeShift?.id ?? "pending-shift",
            user_id: startup.me.user.id,
            store_id: storeId,
            status: "active",
            started_at: new Date().toISOString(),
            ended_at: null,
            paused_total_seconds: 0,
            current_pause_started_at: null,
          },
          summary: { totalSeconds: 0, pausedSeconds: 0, workedSeconds: 0 },
        },
      }));
      triggerNotification("success");
      void get().bootstrap({ skipCache: true });
    } catch (error) {
      triggerNotification("error");
      clearShiftBootstrapRetryTimer();
      set({
        ...previous,
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to start shift",
      });
    }
  },

  pauseShift: async () => {
    const token = resolveCurrentToken(get().token);
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const previous = {
      shiftActive: get().shiftActive,
      shiftStatus: get().shiftStatus,
      shiftSummary: get().shiftSummary,
      mode: get().mode,
      pendingShiftMutationId: get().pendingShiftMutationId,
      expectedShiftStatus: get().expectedShiftStatus,
      shiftBootstrapAttempts: get().shiftBootstrapAttempts,
    };
    const mutationId = ++shiftMutationVersion;

    triggerSelection();
    clearShiftBootstrapRetryTimer();
    set({
      actionLoading: false,
      error: null,
      shiftActive: false,
      shiftStatus: "paused",
      pendingShiftMutationId: mutationId,
      expectedShiftStatus: "paused",
      shiftBootstrapAttempts: 0,
    });

    try {
      await apiPost("/shifts/pause", {}, token);
      patchSellerStartupCache(token, (startup) => ({
        ...startup,
        shiftState: startup.shiftState.activeShift
          ? {
              ...startup.shiftState,
              activeShift: {
                ...startup.shiftState.activeShift,
                status: "paused",
                current_pause_started_at: new Date().toISOString(),
              },
            }
          : startup.shiftState,
      }));
      void get().bootstrap({ skipCache: true });
    } catch (error) {
      triggerNotification("error");
      clearShiftBootstrapRetryTimer();
      set({
        ...previous,
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to pause shift",
      });
    }
  },

  resumeShift: async () => {
    const token = resolveCurrentToken(get().token);
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const previous = {
      shiftActive: get().shiftActive,
      shiftStatus: get().shiftStatus,
      shiftSummary: get().shiftSummary,
      mode: get().mode,
      pendingShiftMutationId: get().pendingShiftMutationId,
      expectedShiftStatus: get().expectedShiftStatus,
      shiftBootstrapAttempts: get().shiftBootstrapAttempts,
    };
    const mutationId = ++shiftMutationVersion;

    triggerSelection();
    clearShiftBootstrapRetryTimer();
    set({
      actionLoading: false,
      error: null,
      mode: "live",
      shiftActive: true,
      shiftStatus: "active",
      pendingShiftMutationId: mutationId,
      expectedShiftStatus: "active",
      shiftBootstrapAttempts: 0,
    });

    try {
      await apiPost("/shifts/resume", {}, token);
      patchSellerStartupCache(token, (startup) => ({
        ...startup,
        shiftState: startup.shiftState.activeShift
          ? {
              ...startup.shiftState,
              activeShift: {
                ...startup.shiftState.activeShift,
                status: "active",
                current_pause_started_at: null,
              },
            }
          : startup.shiftState,
      }));
      triggerNotification("success");
      void get().bootstrap({ skipCache: true });
    } catch (error) {
      triggerNotification("error");
      clearShiftBootstrapRetryTimer();
      set({
        ...previous,
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to resume shift",
      });
    }
  },

  stopShift: async () => {
    const token = resolveCurrentToken(get().token);
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const previous = {
      shiftActive: get().shiftActive,
      shiftStatus: get().shiftStatus,
      shiftSummary: get().shiftSummary,
      mode: get().mode,
      draft: get().draft,
      pendingShiftMutationId: get().pendingShiftMutationId,
      expectedShiftStatus: get().expectedShiftStatus,
      shiftBootstrapAttempts: get().shiftBootstrapAttempts,
    };
    const mutationId = ++shiftMutationVersion;

    triggerSelection();
    clearShiftBootstrapRetryTimer();
    set({
      actionLoading: false,
      error: null,
      mode: "demo",
      shiftActive: false,
      shiftStatus: "inactive",
      shiftSummary: null,
      draft: null,
      pendingShiftMutationId: mutationId,
      expectedShiftStatus: "inactive",
      shiftBootstrapAttempts: 0,
    });

    try {
      await apiPost("/shifts/stop", {}, token);
      patchSellerStartupCache(token, (startup) => ({
        ...startup,
        shiftState: {
          activeShift: null,
          summary: null,
        },
        catalog: null,
        draft: null,
        sales: null,
        inventoryHistory: null,
      }));
      triggerNotification("warning");
      void get().bootstrap({ skipCache: true });
    } catch (error) {
      triggerNotification("error");
      clearShiftBootstrapRetryTimer();
      set({
        ...previous,
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to stop shift",
      });
    }
  },

  addToDraft: async (productId: string) => {
    const token = resolveCurrentToken(get().token);

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
        const reconciledDraft = await reconcileDraftWithLocalState(draft, get().draft, token);
        patchSellerStartupCache(token, (startup) => ({
          ...startup,
          draft: reconciledDraft,
        }));
        triggerSelection();
        set({ draft: reconciledDraft, mode: "live", error: null });
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
        triggerNotification("error");
        set({
          draft: previousDraft,
          error: error instanceof Error ? error.message : "Failed to add item to cart",
        });
      }
    }
  },

  updateDraftItem: async (itemId, updates) => {
    const token = resolveCurrentToken(get().token);
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

      if (!isUuid(itemId)) {
        return;
      }
    } else {
      set({ error: null });
    }

    const mutationVersion = ++draftMutationVersion;

    try {
      const draft = await apiPatch<DraftResponse>(`/seller/draft/items/${itemId}`, updates, token);
      if (mutationVersion === draftMutationVersion) {
        patchSellerStartupCache(token, (startup) => ({
          ...startup,
          draft,
        }));
        if (updates.discountType !== undefined || updates.discountValue !== undefined) {
          triggerImpact("soft");
        } else {
          triggerSelection();
        }
        set({ draft });
      }
    } catch (error) {
      if (mutationVersion === draftMutationVersion) {
        triggerNotification("error");
        set({
          draft: previousDraft,
          error: error instanceof Error ? error.message : "Failed to update cart item",
        });
      }
    }
  },

  removeDraftItem: async (itemId: string) => {
    const token = resolveCurrentToken(get().token);
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
          patchSellerStartupCache(token, (startup) => ({
            ...startup,
            draft,
          }));
          triggerImpact("rigid");
          set({ draft });
        }
      }
    } catch (error) {
      if (mutationVersion === draftMutationVersion) {
        triggerNotification("error");
        set({
          draft: previousDraft,
          error: error instanceof Error ? error.message : "Failed to remove cart item",
        });
      }
    }
  },

  checkout: async (paymentMethod: "cash" | "card") => {
    const token = resolveCurrentToken(get().token);

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

        patchSellerStartupCache(token, (startup) => ({
          ...startup,
          draft: buildDraftState(previousDraft, [], get().storeId),
          sales: startup.sales
            ? {
                ...startup.sales,
                sales: [sale, ...startup.sales.sales],
              }
            : startup.sales,
        }));
        triggerNotification("success");
        set({
          draft: buildDraftState(previousDraft, [], get().storeId),
          sales: [sale, ...get().sales.filter((item) => item.id !== optimisticSale.id)],
          error: null,
        });
      }
    } catch (error) {
      if (mutationVersion === draftMutationVersion) {
        triggerNotification("error");
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
    const token = resolveCurrentToken(get().token);
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    set({ actionLoading: true, error: null });

    try {
      await apiPost(`/seller/sales/${saleId}/delete`, { reason }, token);
      triggerNotification("warning");
      set({ actionLoading: false });
      await get().bootstrap();
    } catch (error) {
      triggerNotification("error");
      set({
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to delete sale",
      });
    }
  },

  returnSaleItem: async (saleId: string, saleItemId: string, reason: string) => {
    const token = resolveCurrentToken(get().token);
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
      triggerNotification("warning");
      set({ actionLoading: false });
      await get().bootstrap();
    } catch (error) {
      triggerNotification("error");
      set({
        actionLoading: false,
        error: error instanceof Error ? error.message : "Failed to create return",
      });
    }
  },

  restockProduct: async (productId: string, quantity: number, reason: string) => {
    const token = resolveCurrentToken(get().token);
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const previousProducts = get().products;
    const previousInventoryHistory = get().inventoryHistory;
    const product = previousProducts.find((item) => item.id === productId);

    if (!product) {
      set({ error: "Product not found" });
      return;
    }

    const nextStock = product.stock + quantity;
    const optimisticMovement = buildOptimisticInventoryMovement({
      productId,
      productName: product.name,
      quantityDelta: quantity,
      balanceAfter: nextStock,
      reason,
      operatorName: get().operatorName,
    });

    set((current) => ({
      error: null,
      products: current.products.map((item) =>
        item.id === productId
          ? {
              ...item,
              stock: nextStock,
            }
          : item
      ),
      inventoryHistory: [optimisticMovement, ...current.inventoryHistory],
      pendingStockProductIds: {
        ...current.pendingStockProductIds,
        [productId]: true,
      },
    }));

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

      patchSellerStartupCache(token, (startup) => ({
        ...startup,
        catalog: startup.catalog
          ? {
              ...startup.catalog,
              products: startup.catalog.products.map((item) =>
                item.id === productId
                  ? {
                      ...item,
                      stock: nextStock,
                    }
                  : item
              ),
            }
          : startup.catalog,
        inventoryHistory: startup.inventoryHistory
          ? {
              ...startup.inventoryHistory,
              items: [optimisticMovement, ...startup.inventoryHistory.items],
            }
          : startup.inventoryHistory,
      }));

      triggerNotification("success");
      set((current) => {
        const nextPending = { ...current.pendingStockProductIds };
        delete nextPending[productId];
        return {
          pendingStockProductIds: nextPending,
          error: null,
        };
      });
    } catch (error) {
      triggerNotification("error");
      set((current) => {
        const nextPending = { ...current.pendingStockProductIds };
        delete nextPending[productId];
        return {
          products: previousProducts,
          inventoryHistory: previousInventoryHistory,
          pendingStockProductIds: nextPending,
          error: error instanceof Error ? error.message : "Failed to restock product",
        };
      });
    }
  },

  writeoffProduct: async (productId: string, quantity: number, reason: string) => {
    const token = resolveCurrentToken(get().token);
    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const previousProducts = get().products;
    const previousInventoryHistory = get().inventoryHistory;
    const product = previousProducts.find((item) => item.id === productId);

    if (!product) {
      set({ error: "Product not found" });
      return;
    }

    const nextStock = Math.max(0, product.stock - quantity);
    const optimisticMovement = buildOptimisticInventoryMovement({
      productId,
      productName: product.name,
      quantityDelta: -quantity,
      balanceAfter: nextStock,
      reason,
      operatorName: get().operatorName,
    });

    set((current) => ({
      error: null,
      products: current.products.map((item) =>
        item.id === productId
          ? {
              ...item,
              stock: nextStock,
            }
          : item
      ),
      inventoryHistory: [optimisticMovement, ...current.inventoryHistory],
      pendingStockProductIds: {
        ...current.pendingStockProductIds,
        [productId]: true,
      },
    }));

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

      patchSellerStartupCache(token, (startup) => ({
        ...startup,
        catalog: startup.catalog
          ? {
              ...startup.catalog,
              products: startup.catalog.products.map((item) =>
                item.id === productId
                  ? {
                      ...item,
                      stock: nextStock,
                    }
                  : item
              ),
            }
          : startup.catalog,
        inventoryHistory: startup.inventoryHistory
          ? {
              ...startup.inventoryHistory,
              items: [optimisticMovement, ...startup.inventoryHistory.items],
            }
          : startup.inventoryHistory,
      }));

      triggerNotification("warning");
      set((current) => {
        const nextPending = { ...current.pendingStockProductIds };
        delete nextPending[productId];
        return {
          pendingStockProductIds: nextPending,
          error: null,
        };
      });
    } catch (error) {
      triggerNotification("error");
      set((current) => {
        const nextPending = { ...current.pendingStockProductIds };
        delete nextPending[productId];
        return {
          products: previousProducts,
          inventoryHistory: previousInventoryHistory,
          pendingStockProductIds: nextPending,
          error: error instanceof Error ? error.message : "Failed to write off product",
        };
      });
    }
  },

  loadShiftHistory: async (limit = 7, offset = 0) => {
    const token = resolveCurrentToken(get().token);

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    try {
      const history = await apiGet<ShiftHistoryResponse>(
        `/shifts/history?limit=${limit}&offset=${offset}`,
        token
      );
      const nextHistory = offset > 0 ? [...get().shiftHistory, ...history.items] : history.items;
      set({
        shiftHistory: nextHistory,
        shiftHistoryPagination: history.pagination,
        error: null,
      });

      void Promise.allSettled(
        history.items.slice(0, 7).map(async (entry) => {
          if (get().shiftDetailsById[entry.shift.id]) {
            return;
          }

          const shiftDetails = await fetchShiftDetailsById(token, entry.shift.id);
          set((current) => ({
            shiftDetailsById: {
              ...current.shiftDetailsById,
              [entry.shift.id]: shiftDetails,
            },
          }));
        })
      );
    } catch (error) {
      triggerNotification("error");
      set({
        error: error instanceof Error ? error.message : "Failed to load shift history",
      });
    }
  },

  loadShiftDetails: async (shiftId: string) => {
    const token = resolveCurrentToken(get().token);

    if (!token) {
      set({ error: "Missing auth token" });
      return;
    }

    const cachedDetails = get().shiftDetailsById[shiftId];

    if (cachedDetails) {
      set({
        shiftDetails: cachedDetails,
        shiftDetailsLoading: false,
        error: null,
      });

      void fetchShiftDetailsById(token, shiftId)
        .then((shiftDetails) => {
          set((current) => ({
            shiftDetails: current.shiftDetails?.shift.id === shiftId ? shiftDetails : current.shiftDetails,
            shiftDetailsById: {
              ...current.shiftDetailsById,
              [shiftId]: shiftDetails,
            },
            error: null,
          }));
        })
        .catch(() => undefined);
      return;
    }

    const currentDetails = get().shiftDetails;
    set({
      shiftDetailsLoading: true,
      shiftDetails: currentDetails?.shift.id === shiftId ? currentDetails : null,
      error: null,
    });

    try {
      const shiftDetails = await fetchShiftDetailsById(token, shiftId);
      set({
        shiftDetails,
        shiftDetailsById: {
          ...get().shiftDetailsById,
          [shiftId]: shiftDetails,
        },
        shiftDetailsLoading: false,
        error: null,
      });
    } catch (error) {
      triggerNotification("error");
      set({
        shiftDetails: null,
        shiftDetailsLoading: false,
        error: error instanceof Error ? error.message : "Failed to load shift details",
      });
    }
  },

  showShiftDetails: (shiftDetails: ShiftDetailsResponse) => {
    set((current) => ({
      shiftDetails,
      shiftDetailsById: {
        ...current.shiftDetailsById,
        [shiftDetails.shift.id]: shiftDetails,
      },
      shiftDetailsLoading: false,
      error: null,
    }));
  },

  clearShiftDetails: () => {
    set({ shiftDetails: null, shiftDetailsLoading: false });
  },
}));
