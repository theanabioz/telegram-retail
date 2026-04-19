import { useCallback, useEffect, useState, type PointerEvent } from "react";
import {
  Avatar,
  Box,
  Button,
  Container,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { AdminNav, type AdminTab } from "../components/AdminNav";
import { apiGet } from "../lib/api";
import { formatEur } from "../lib/currency";
import { canUseTelegramBackButton, useTelegramBackButton } from "../lib/telegramBackButton";
import { useAdminDashboardStore } from "../store/useAdminDashboardStore";
import { useAdminManagementStore } from "../store/useAdminManagementStore";
import type {
  AdminDashboardResponse,
  AdminInventoryResponse,
  AdminSalesOverviewResponse,
  AdminStartupResponse,
} from "../types/admin";

const panelSurface = "rgba(255,255,255,0.88)";
const panelMutedSurface = "rgba(241,240,236,0.82)";
const panelShadow = "0 18px 36px rgba(18, 18, 18, 0.06)";
const panelRadius = "24px";
const bottomNavReservedSpace = "calc(96px + env(safe-area-inset-bottom, 0px))";
const ADMIN_OVERVIEW_CHART_MOCK_LAYER = true;
const ADMIN_OVERVIEW_CHART_MOCK_TOTALS: Record<number, number> = {
  0: 18,
  1: 26,
  2: 14,
  8: 32,
  9: 48,
  10: 44,
  11: 57,
  12: 63,
  13: 52,
  14: 68,
  15: 74,
  16: 59,
  17: 82,
  18: 91,
  19: 76,
  20: 88,
  21: 72,
  22: 54,
  23: 37,
};
const TOKEN_KEY = "telegram-retail-token";
const ADMIN_STARTUP_CACHE_KEY = "telegram-retail-admin-startup";
const adminTabTitle: Record<AdminTab, string> = {
  overview: "Overview",
  sales: "Sales",
  inventory: "Inventory",
  team: "Team",
  settings: "Settings",
};

type AdminDashboardScreenProps = {
  operatorName: string;
  currentPanel: "admin" | "seller";
  onSwitchPanel: (panel: "admin" | "seller") => Promise<void>;
  onViewAsSeller: (sellerId: string) => Promise<void>;
};

type SalesLedgerMode = "sales" | "returns";
type SalesPeriod = "today" | "week" | "month" | "custom";
type SalesLedgerSnapshot = Pick<AdminSalesOverviewResponse, "sales" | "returns">;
type InventoryMode = "stock" | "products";
type InventorySnapshot = Pick<AdminInventoryResponse, "items" | "history">;
type InventoryMovementType = "manual_adjustment" | "restock" | "writeoff";
type TeamMode = "staff" | "stores";

function getCachedAdminStartup() {
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
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

function scrollToSectionTop() {
  if (typeof window === "undefined") {
    return;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getSalesPeriodRange(period: Exclude<SalesPeriod, "custom">) {
  const now = new Date();
  const from = new Date(now);

  if (period === "week") {
    const day = from.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    from.setDate(from.getDate() + mondayOffset);
  }

  if (period === "month") {
    from.setDate(1);
  }

  return {
    from: toDateInputValue(from),
    to: toDateInputValue(now),
  };
}

function formatSalesTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildSalesCacheKey(input: {
  period: SalesPeriod;
  storeId: string;
  sellerId: string;
  saleStatus: "all" | "completed" | "deleted";
  dateFrom: string;
  dateTo: string;
}) {
  return [
    input.period,
    input.storeId || "all-stores",
    input.sellerId || "all-sellers",
    input.saleStatus,
    input.dateFrom || "open-from",
    input.dateTo || "open-to",
  ].join("|");
}

function readAdminStartupCache(token: string) {
  const cached = getCachedAdminStartup();
  return cached;
}

function writeAdminStartupCache(token: string, startup: AdminStartupResponse) {
  try {
    window.localStorage.setItem(ADMIN_STARTUP_CACHE_KEY, JSON.stringify({ token, startup }));
  } catch {
    // Startup cache only improves perceived loading; storage failures are safe to ignore.
  }
}

function generateInternalProductCode(name: string) {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);

  return `${slug || "PRODUCT"}-${Date.now().toString(36).toUpperCase()}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "No activity yet";
  }

  return new Date(value).toLocaleString();
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function withOverviewChartMockLayer(hourlyRevenueToday: AdminDashboardResponse["hourlyRevenueToday"]) {
  if (!ADMIN_OVERVIEW_CHART_MOCK_LAYER) {
    return hourlyRevenueToday;
  }

  return hourlyRevenueToday.map((entry) => ({
    ...entry,
    total: entry.total > 0 ? entry.total : (ADMIN_OVERVIEW_CHART_MOCK_TOTALS[entry.hour] ?? 0),
  }));
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "red" | "blue" | "orange" | "gray" }) {
  const styles = {
    green: { bg: "rgba(34, 197, 94, 0.12)", color: "green.600" },
    red: { bg: "rgba(248, 113, 113, 0.14)", color: "red.500" },
    blue: { bg: "rgba(74, 132, 244, 0.14)", color: "brand.600" },
    orange: { bg: "rgba(251, 191, 36, 0.18)", color: "orange.500" },
    gray: { bg: "rgba(148, 163, 184, 0.16)", color: "surface.600" },
  } as const;

  return (
    <Box
      px={2.5}
      py={1}
      borderRadius="999px"
      fontSize="xs"
      fontWeight="800"
      letterSpacing="0.02em"
      bg={styles[tone].bg}
      color={styles[tone].color}
    >
      {label}
    </Box>
  );
}

export function AdminDashboardScreen({
  operatorName,
  currentPanel,
  onSwitchPanel,
  onViewAsSeller,
}: AdminDashboardScreenProps) {
  const { data, error, loading, load, hydrate: hydrateDashboard } = useAdminDashboardStore();
  const {
    stores,
    staff,
    error: managementError,
    loadingStores,
    loadingStaff,
    loadingInventory,
    loadingSales,
    mutating,
    loadStores,
    loadStaff,
    loadInventory,
    loadProducts,
    loadSalesOverview,
    hydrateStartup,
    createStore,
    updateStore,
    assignSeller,
    inventoryStores,
    products,
    inventoryItems,
    inventoryHistory,
    salesStores,
    salesSellers,
    salesOverview,
    returnsOverview,
    updateStoreProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    adjustInventory,
  } = useAdminManagementStore();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [selectedOverviewHour, setSelectedOverviewHour] = useState<number | null>(null);
  const [salesLedgerMode, setSalesLedgerMode] = useState<SalesLedgerMode>("sales");
  const [selectedAdminSaleId, setSelectedAdminSaleId] = useState<string | null>(null);
  const [selectedAdminReturnId, setSelectedAdminReturnId] = useState<string | null>(null);
  const [salesView, setSalesView] = useState<SalesLedgerSnapshot>(() => {
    const cachedStartup = getCachedAdminStartup();
    return {
      sales: cachedStartup?.sales.sales ?? [],
      returns: cachedStartup?.sales.returns ?? [],
    };
  });
  const [salesCache, setSalesCache] = useState<Record<string, SalesLedgerSnapshot>>({});
  const [salesSoftRefreshing, setSalesSoftRefreshing] = useState(false);
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("stock");
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string | null>(null);
  const [inventoryView, setInventoryView] = useState<InventorySnapshot>(() => {
    const cachedStartup = getCachedAdminStartup();
    return {
      items: cachedStartup?.inventory.items ?? [],
      history: cachedStartup?.inventory.history ?? [],
    };
  });
  const [inventoryCache, setInventoryCache] = useState<Record<string, InventorySnapshot>>(() => {
    const cachedStartup = getCachedAdminStartup();
    const selectedStoreId = cachedStartup?.inventory.selectedStoreId;

    if (!selectedStoreId) {
      return {};
    }

    return {
      [selectedStoreId]: {
        items: cachedStartup.inventory.items,
        history: cachedStartup.inventory.history,
      },
    };
  });
  const [inventorySoftRefreshing, setInventorySoftRefreshing] = useState(false);
  const [inventoryMovementTypes, setInventoryMovementTypes] = useState<Record<string, InventoryMovementType>>({});
  const [teamMode, setTeamMode] = useState<TeamMode>("staff");
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreAddress, setNewStoreAddress] = useState("");
  const [newProduct, setNewProduct] = useState({
    name: "",
    sku: "",
    defaultPrice: "",
  });
  const [selectedInventoryStoreId, setSelectedInventoryStoreId] = useState(
    () => getCachedAdminStartup()?.inventory.selectedStoreId ?? ""
  );
  const [salesStoreFilter, setSalesStoreFilter] = useState("");
  const [salesSellerFilter, setSalesSellerFilter] = useState("");
  const [salesStatusFilter, setSalesStatusFilter] = useState<"all" | "completed" | "deleted">("all");
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>("today");
  const [salesDateFrom, setSalesDateFrom] = useState(() => getSalesPeriodRange("today").from);
  const [salesDateTo, setSalesDateTo] = useState(() => getSalesPeriodRange("today").to);
  const [storeEdits, setStoreEdits] = useState<
    Record<string, { name: string; address: string; isActive: boolean }>
  >({});
  const [staffAssignments, setStaffAssignments] = useState<Record<string, string>>({});
  const [inventoryEdits, setInventoryEdits] = useState<
    Record<string, { price: string; isEnabled: boolean; adjustQuantity: string; adjustReason: string }>
  >({});
  const [productEdits, setProductEdits] = useState<
    Record<string, { name: string; sku: string; defaultPrice: string; isActive: boolean }>
  >({});
  const supportsTelegramBackButton = canUseTelegramBackButton();

  const resetAdminSection = useCallback((tab: AdminTab) => {
    if (tab === "overview") {
      setSelectedOverviewHour(null);
    }

    if (tab === "sales") {
      setSelectedAdminSaleId(null);
      setSelectedAdminReturnId(null);
    }

    if (tab === "inventory") {
      setSelectedInventoryItemId(null);
    }

    scrollToSectionTop();
  }, []);

  const handleAdminTabChange = useCallback((tab: AdminTab) => {
    setActiveTab(tab);
    scrollToSectionTop();
  }, []);

  useTelegramBackButton(
    activeTab === "sales"
      ? Boolean(selectedAdminSaleId || selectedAdminReturnId)
      : activeTab === "inventory"
        ? Boolean(selectedInventoryItemId)
        : false,
    () => {
      if (activeTab === "sales" && selectedAdminSaleId) {
        setSelectedAdminSaleId(null);
        return;
      }

      if (activeTab === "sales" && selectedAdminReturnId) {
        setSelectedAdminReturnId(null);
        return;
      }

      if (activeTab === "inventory" && selectedInventoryItemId) {
        setSelectedInventoryItemId(null);
      }
    }
  );

  const handleOverviewChartPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();

    if (rect.width <= 0) {
      return;
    }

    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width - 1);
    const hour = Math.min(23, Math.max(0, Math.floor((x / rect.width) * 24)));

    setSelectedOverviewHour(hour);
  };

  useEffect(() => {
    const loadInitialAdminSnapshot = async () => {
      const token = window.localStorage.getItem(TOKEN_KEY);

      if (!token) {
        void load();
        void loadStores();
        void loadStaff();
        void loadInventory();
        void loadProducts();
        return;
      }

      const hydrateAdminStartup = (startup: AdminStartupResponse) => {
        hydrateDashboard(startup.dashboard);
        hydrateStartup(startup);
        if (startup.inventory.selectedStoreId) {
          setSelectedInventoryStoreId(startup.inventory.selectedStoreId);
          setInventoryView({
            items: startup.inventory.items,
            history: startup.inventory.history,
          });
          setInventoryCache((current) => ({
            ...current,
            [startup.inventory.selectedStoreId ?? "all"]: {
              items: startup.inventory.items,
              history: startup.inventory.history,
            },
          }));
        }
      };

      const cachedStartup = readAdminStartupCache(token);
      if (cachedStartup) {
        hydrateAdminStartup(cachedStartup);
      }

      try {
        const startup = await apiGet<AdminStartupResponse>("/admin/startup", token);
        writeAdminStartupCache(token, startup);
        hydrateAdminStartup(startup);
      } catch {
        if (cachedStartup) {
          return;
        }

        void load();
        void loadStores();
        void loadStaff();
        void loadInventory();
        void loadProducts();
        const today = getSalesPeriodRange("today");
        void loadSalesOverview({
          saleStatus: "all",
          dateFrom: new Date(`${today.from}T00:00:00`).toISOString(),
          dateTo: new Date(`${today.to}T23:59:59`).toISOString(),
          limit: 20,
        });
      }
    };

    void loadInitialAdminSnapshot();
  }, [
    hydrateDashboard,
    hydrateStartup,
    load,
    loadStaff,
    loadStores,
    loadInventory,
    loadProducts,
    loadSalesOverview,
  ]);

  useEffect(() => {
    setStoreEdits((current) => {
      const next = { ...current };

      for (const store of stores) {
        next[store.id] ??= {
          name: store.name,
          address: store.address ?? "",
          isActive: store.isActive,
        };
      }

      return next;
    });
  }, [stores]);

  useEffect(() => {
    setStaffAssignments((current) => {
      const next = { ...current };

      for (const seller of staff) {
        next[seller.id] ??= seller.currentAssignment?.storeId ?? "";
      }

      return next;
    });
  }, [staff]);

  useEffect(() => {
    if (!selectedInventoryStoreId && inventoryStores.length > 0) {
      const firstActiveStore = inventoryStores.find((store) => store.isActive) ?? inventoryStores[0];
      setSelectedInventoryStoreId(firstActiveStore.id);
    }
  }, [inventoryStores, selectedInventoryStoreId]);

  useEffect(() => {
    const snapshot = { sales: salesOverview, returns: returnsOverview };
    const key = buildSalesCacheKey({
      period: salesPeriod,
      storeId: salesStoreFilter,
      sellerId: salesSellerFilter,
      saleStatus: salesStatusFilter,
      dateFrom: salesDateFrom,
      dateTo: salesDateTo,
    });

    setSalesView(snapshot);
    setSalesSoftRefreshing(false);
    setSalesCache((current) => ({
      ...current,
      [key]: snapshot,
    }));
  }, [salesOverview, returnsOverview]);

  useEffect(() => {
    const snapshot = { items: inventoryItems, history: inventoryHistory };
    const responseStoreId = inventoryItems[0]?.storeId ?? selectedInventoryStoreId;
    const key = responseStoreId || "all";

    setInventoryCache((current) => ({
      ...current,
      [key]: snapshot,
    }));

    if (!selectedInventoryStoreId || !responseStoreId || responseStoreId === selectedInventoryStoreId) {
      setInventoryView(snapshot);
      setInventorySoftRefreshing(false);
    }
  }, [inventoryItems, inventoryHistory]);

  useEffect(() => {
    setInventoryEdits((current) => {
      const next = { ...current };

      for (const item of inventoryItems) {
        next[item.storeProductId] ??= {
          price: item.storePrice.toFixed(2),
          isEnabled: item.isEnabled,
          adjustQuantity: "1",
          adjustReason: "",
        };
      }

      return next;
    });
  }, [inventoryItems]);

  useEffect(() => {
    setProductEdits((current) => {
      const next = { ...current };

      for (const product of products) {
        next[product.id] ??= {
          name: product.name,
          sku: product.sku,
          defaultPrice: product.defaultPrice.toFixed(2),
          isActive: product.isActive,
        };
      }

      return next;
    });
  }, [products]);

  useEffect(() => {
    if (selectedInventoryStoreId) {
      const cachedSnapshot = inventoryCache[selectedInventoryStoreId];
      const currentSnapshotStoreId = inventoryItems[0]?.storeId ?? null;

      if (currentSnapshotStoreId === selectedInventoryStoreId) {
        setInventoryView({ items: inventoryItems, history: inventoryHistory });
        setInventorySoftRefreshing(false);
        return;
      }

      if (cachedSnapshot) {
        setInventoryView(cachedSnapshot);
      }

      setInventorySoftRefreshing(true);
      setSelectedInventoryItemId(null);
      void loadInventory(selectedInventoryStoreId).finally(() => setInventorySoftRefreshing(false));
    }
  }, [inventoryCache, inventoryHistory, inventoryItems, loadInventory, selectedInventoryStoreId]);

  const managementStatus = managementError ?? error;

  const handleCreateStore = async () => {
    if (!newStoreName.trim()) {
      return;
    }

    await createStore({
      name: newStoreName,
      address: newStoreAddress || null,
      isActive: true,
    });
    await load();
    setNewStoreName("");
    setNewStoreAddress("");
  };

  const handleSaveStore = async (storeId: string) => {
    const draft = storeEdits[storeId];

    if (!draft || !draft.name.trim()) {
      return;
    }

    await updateStore(storeId, {
      name: draft.name,
      address: draft.address || null,
      isActive: draft.isActive,
    });
    await load();
  };

  const handleAssignSeller = async (sellerId: string) => {
    const storeId = staffAssignments[sellerId];

    if (!storeId) {
      return;
    }

    await assignSeller(sellerId, storeId);
    await load();
  };

  const handleSaveStoreProduct = async (storeProductId: string) => {
    const draft = inventoryEdits[storeProductId];

    if (!draft) {
      return;
    }

    const parsedPrice = Number(draft.price);

    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      return;
    }

    await updateStoreProduct(storeProductId, {
      price: parsedPrice,
      isEnabled: draft.isEnabled,
    });
  };

  const handleCreateProduct = async () => {
    const parsedPrice = Number(newProduct.defaultPrice);

    if (!newProduct.name.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return;
    }

    await createProduct({
      name: newProduct.name,
      sku: newProduct.sku.trim() || generateInternalProductCode(newProduct.name),
      defaultPrice: parsedPrice,
      isActive: true,
    });

    setNewProduct({ name: "", sku: "", defaultPrice: "" });
    if (selectedInventoryStoreId) {
      await loadInventory(selectedInventoryStoreId);
    }
  };

  const handleSaveProduct = async (productId: string) => {
    const draft = productEdits[productId];
    const parsedPrice = Number(draft?.defaultPrice);

    if (!draft || !draft.name.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return;
    }

    await updateProduct(productId, {
      name: draft.name,
      sku: draft.sku.trim() || generateInternalProductCode(draft.name),
      defaultPrice: parsedPrice,
      isActive: draft.isActive,
    });

    if (selectedInventoryStoreId) {
      await loadInventory(selectedInventoryStoreId);
    }
  };

  const handleDeleteProduct = async (productId: string, productName: string) => {
    const confirmed = window.confirm(`Delete ${productName}? This is only possible if the product has no history.`);

    if (!confirmed) {
      return;
    }

    await deleteProduct(productId);

    if (selectedInventoryStoreId) {
      await loadInventory(selectedInventoryStoreId);
    }
  };

  const handleInventoryAdjustment = async (
    storeProductId: string,
    movementType: "manual_adjustment" | "restock" | "writeoff"
  ) => {
    const item = inventoryItems.find((entry) => entry.storeProductId === storeProductId);
    const draft = inventoryEdits[storeProductId];

    if (!item || !draft) {
      return;
    }

    const parsedQuantity = Number(draft.adjustQuantity);

    if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
      return;
    }

    await adjustInventory({
      storeId: item.storeId,
      productId: item.productId,
      movementType,
      quantity: parsedQuantity,
      reason:
        draft.adjustReason.trim() ||
        (movementType === "restock"
          ? "Admin restock"
          : movementType === "writeoff"
            ? "Admin writeoff"
            : "Admin manual adjustment"),
    });

    setInventoryEdits((current) => ({
      ...current,
      [storeProductId]: {
        ...draft,
        adjustReason: "",
      },
    }));
  };

  const handleApplySalesFilters = async (overrides?: {
    storeId?: string;
    sellerId?: string;
    saleStatus?: "all" | "completed" | "deleted";
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const nextStoreId = overrides?.storeId ?? salesStoreFilter;
    const nextSellerId = overrides?.sellerId ?? salesSellerFilter;
    const nextSaleStatus = overrides?.saleStatus ?? salesStatusFilter;
    const nextDateFrom = overrides?.dateFrom ?? salesDateFrom;
    const nextDateTo = overrides?.dateTo ?? salesDateTo;
    const cachedSnapshot = salesCache[
      buildSalesCacheKey({
        period: salesPeriod,
        storeId: nextStoreId,
        sellerId: nextSellerId,
        saleStatus: nextSaleStatus,
        dateFrom: nextDateFrom,
        dateTo: nextDateTo,
      })
    ];

    if (cachedSnapshot) {
      setSalesView(cachedSnapshot);
    }

    setSalesSoftRefreshing(true);

    const dateFrom = nextDateFrom ? new Date(`${nextDateFrom}T00:00:00`).toISOString() : undefined;
    const dateTo = nextDateTo ? new Date(`${nextDateTo}T23:59:59`).toISOString() : undefined;

    await loadSalesOverview({
      storeId: nextStoreId || undefined,
      sellerId: nextSellerId || undefined,
      saleStatus: nextSaleStatus,
      dateFrom,
      dateTo,
      limit: 20,
    });
    setSalesSoftRefreshing(false);
  };

  const handleSelectSalesPeriod = async (period: SalesPeriod) => {
    setSalesPeriod(period);

    if (period === "custom") {
      return;
    }

    const range = getSalesPeriodRange(period);
    const cachedSnapshot = salesCache[
      buildSalesCacheKey({
        period,
        storeId: salesStoreFilter,
        sellerId: salesSellerFilter,
        saleStatus: salesStatusFilter,
        dateFrom: range.from,
        dateTo: range.to,
      })
    ];

    if (cachedSnapshot) {
      setSalesView(cachedSnapshot);
    }

    setSalesDateFrom(range.from);
    setSalesDateTo(range.to);
    await handleApplySalesFilters({ dateFrom: range.from, dateTo: range.to });
  };

  const renderDashboard = () => (
    <VStack spacing={4} align="stretch">
      <SimpleGrid columns={2} spacing={3}>
        {[
          { label: "Today Revenue", value: data ? formatEur(data.summary.totalRevenueToday) : "..." },
          { label: "Sales Today", value: data ? String(data.summary.completedSalesToday) : "..." },
          { label: "Low Stock", value: data ? String(data.summary.lowStockCount) : "..." },
          { label: "Active Sellers", value: data ? String(data.summary.totalSellers) : "..." },
        ].map((card) => (
          <Box key={card.label} bg={panelSurface} borderRadius="22px" px={4} py={4} boxShadow={panelShadow}>
            <Text fontSize="xs" textTransform="uppercase" color="surface.500" letterSpacing="0.08em">
              {card.label}
            </Text>
            <Text fontSize="2xl" fontWeight="900" mt={2}>
              {card.value}
            </Text>
          </Box>
        ))}
      </SimpleGrid>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={4}>
          <HStack justify="space-between" align="center">
            <VStack align="start" spacing={0}>
              <Text fontWeight="900" fontSize="lg">
                Today Profit Flow
              </Text>
              <Text color="surface.500" fontSize="sm">
                Revenue by hour across today
              </Text>
            </VStack>
            <Text color="surface.500" fontWeight="800" fontSize="sm">
              {data ? formatEur(data.summary.totalRevenueToday) : formatEur(0)}
            </Text>
          </HStack>

          {data ? (
            <VStack align="stretch" spacing={2}>
              <Box
                display="grid"
                gridTemplateColumns="repeat(24, minmax(0, 1fr))"
                columnGap={1.5}
                h="164px"
                px={1}
                overflow="hidden"
                cursor="crosshair"
                style={{ touchAction: "none" }}
                onPointerDown={handleOverviewChartPointer}
                onPointerMove={handleOverviewChartPointer}
                onPointerLeave={() => setSelectedOverviewHour(null)}
              >
                {(() => {
                  const chartSeries = withOverviewChartMockLayer(data.hourlyRevenueToday);
                  const maxHourTotal = Math.max(...chartSeries.map((entry) => entry.total), 1);

                  return chartSeries.map((entry) => {
                    const height = Math.max(12, (entry.total / maxHourTotal) * 132);
                    const isActiveHour = entry.total > 0;
                    const isSelected = selectedOverviewHour === entry.hour;

                    return (
                      <VStack key={entry.hour} minW={0} spacing={2} align="center" justify="end" h="full">
                        <Text
                          fontSize="10px"
                          fontWeight="900"
                          color="surface.700"
                          opacity={isSelected ? 1 : 0}
                          noOfLines={1}
                          h="12px"
                          lineHeight="12px"
                        >
                          {isSelected ? entry.total.toFixed(0) : ""}
                        </Text>
                        <Box
                          as="button"
                          type="button"
                          w="full"
                          maxW="12px"
                          h={`${height}px`}
                          borderRadius="999px"
                          cursor="pointer"
                          transition="all 0.18s ease"
                          bg={
                            isActiveHour
                              ? isSelected
                                ? "linear-gradient(180deg, rgba(53,102,216,1) 0%, rgba(82,129,236,0.88) 100%)"
                                : "linear-gradient(180deg, rgba(82,129,236,0.98) 0%, rgba(82,129,236,0.72) 100%)"
                              : "rgba(226,224,218,0.8)"
                          }
                          boxShadow={
                            isActiveHour
                              ? isSelected
                                ? "0 10px 22px rgba(82,129,236,0.28)"
                                : "0 8px 18px rgba(82,129,236,0.18)"
                              : "none"
                          }
                          transform={isSelected ? "scaleX(1.12)" : "scaleX(1)"}
                          _active={{ transform: "scale(0.96)" }}
                          onClick={() => setSelectedOverviewHour(entry.hour)}
                        />
                      </VStack>
                    );
                  });
                })()}
              </Box>

              <Box
                display="grid"
                gridTemplateColumns="repeat(24, minmax(0, 1fr))"
                columnGap={1.5}
                h="12px"
                px={1}
              >
                {[0, 3, 6, 9, 12, 15, 18, 21, 23].map((hour) => (
                  <Text
                    key={hour}
                    gridColumn={`${hour + 1}`}
                    fontSize="10px"
                    color="surface.500"
                    fontWeight="700"
                    lineHeight="12px"
                    textAlign="center"
                    whiteSpace="nowrap"
                  >
                    {hour === 23 ? "00" : String(hour).padStart(2, "0")}
                  </Text>
                ))}
              </Box>
            </VStack>
          ) : null}
        </VStack>
      </Box>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Text fontWeight="900" fontSize="lg">
              Recent Sales
            </Text>
            <Text color="surface.500" fontWeight="700" fontSize="sm">
              {(data?.recentSales ?? []).slice(0, 5).length} latest
            </Text>
          </HStack>
          {(data?.recentSales ?? []).slice(0, 5).map((sale) => (
            <HStack key={sale.id} justify="space-between" align="start">
              <VStack align="start" spacing={0}>
                <Text fontWeight="800">{sale.store?.name ?? "Unknown store"}</Text>
                <Text fontSize="sm" color="surface.500">
                  {sale.seller?.fullName ?? "Unknown seller"} · {sale.paymentMethod.toUpperCase()}
                </Text>
                <Text fontSize="xs" color="surface.500">
                  {new Date(sale.createdAt).toLocaleString()}
                </Text>
              </VStack>
              <Text fontWeight="900">{formatEur(sale.totalAmount)}</Text>
            </HStack>
          ))}
        </VStack>
      </Box>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Text fontWeight="900" fontSize="lg">
              Store Performance
            </Text>
            <Text color="surface.500" fontWeight="700" fontSize="sm">
              {data?.storePerformance.length ?? 0} stores
            </Text>
          </HStack>
          {(data?.storePerformance ?? []).map((store) => (
            <Box key={store.id} bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
              <HStack justify="space-between" align="start">
                <VStack align="start" spacing={0}>
                  <Text fontWeight="800">{store.name}</Text>
                  <Text fontSize="sm" color="surface.500">
                    {store.sellerCount} sellers · {store.salesCount} sales
                  </Text>
                  <Text fontSize="xs" color="surface.500">
                    {store.stockUnits} units in stock
                  </Text>
                </VStack>
                <Text fontWeight="900">{formatEur(store.revenue)}</Text>
              </HStack>
            </Box>
          ))}
        </VStack>
      </Box>
    </VStack>
  );

  const renderStoresSection = () => (
    <VStack spacing={4} align="stretch">
      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <VStack align="start" spacing={0}>
              <Text fontWeight="900" fontSize="lg">
                Add Store
              </Text>
              <Text color="surface.500" fontSize="sm">
                Create a new sales location.
              </Text>
            </VStack>
          </HStack>
          <Input
            value={newStoreName}
            onChange={(event) => setNewStoreName(event.target.value)}
            placeholder="Store name"
            borderRadius="18px"
            bg="white"
            borderColor="rgba(226,224,218,0.95)"
          />
          <Input
            value={newStoreAddress}
            onChange={(event) => setNewStoreAddress(event.target.value)}
            placeholder="Address or short location note"
            borderRadius="18px"
            bg="white"
            borderColor="rgba(226,224,218,0.95)"
          />
          <Button
            borderRadius="18px"
            bg="brand.500"
            color="white"
            _hover={{ bg: "brand.600" }}
            isLoading={mutating}
            onClick={() => void handleCreateStore()}
          >
            Add Store
          </Button>
        </VStack>
      </Box>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Text fontWeight="900" fontSize="lg">
              Store Directory
            </Text>
            <Text color="surface.500" fontWeight="700" fontSize="sm">
              {stores.length} locations
            </Text>
          </HStack>

          {stores.map((store) => {
            const draft = storeEdits[store.id] ?? {
              name: store.name,
              address: store.address ?? "",
              isActive: store.isActive,
            };

            return (
              <Box key={store.id} bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                <VStack align="stretch" spacing={3}>
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={0}>
                      <Text fontWeight="900">{store.name}</Text>
                      <Text fontSize="sm" color="surface.500">
                        {store.address || `Created ${formatShortDate(store.createdAt)}`}
                      </Text>
                    </VStack>
                    <StatusPill label={store.isActive ? "Active" : "Inactive"} tone={store.isActive ? "green" : "red"} />
                  </HStack>

                  <SimpleGrid columns={2} spacing={2}>
                    <Box bg="rgba(255,255,255,0.7)" borderRadius="16px" px={3} py={3}>
                      <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em">
                        Sellers
                      </Text>
                      <Text fontWeight="900">{store.sellerCount}</Text>
                    </Box>
                    <Box bg="rgba(255,255,255,0.7)" borderRadius="16px" px={3} py={3}>
                      <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em">
                        Today
                      </Text>
                      <Text fontWeight="900">{formatEur(store.revenueToday)}</Text>
                    </Box>
                  </SimpleGrid>

                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      setStoreEdits((current) => ({
                        ...current,
                        [store.id]: { ...draft, name: event.target.value },
                      }))
                    }
                    placeholder="Store name"
                    borderRadius="14px"
                    bg="white"
                    borderColor="rgba(226,224,218,0.95)"
                  />
                  <Input
                    value={draft.address}
                    onChange={(event) =>
                      setStoreEdits((current) => ({
                        ...current,
                        [store.id]: { ...draft, address: event.target.value },
                      }))
                    }
                    placeholder="Store address"
                    borderRadius="14px"
                    bg="white"
                    borderColor="rgba(226,224,218,0.95)"
                  />
                  <Button
                    size="sm"
                    borderRadius="14px"
                    bg={draft.isActive ? "rgba(34,197,94,0.12)" : "rgba(248,113,113,0.14)"}
                    color={draft.isActive ? "green.600" : "red.500"}
                    _hover={{ bg: draft.isActive ? "rgba(34,197,94,0.18)" : "rgba(248,113,113,0.2)" }}
                    onClick={() =>
                      setStoreEdits((current) => ({
                        ...current,
                        [store.id]: { ...draft, isActive: !draft.isActive },
                      }))
                    }
                  >
                    {draft.isActive ? "Active" : "Inactive"}
                  </Button>
                  <Button
                    borderRadius="16px"
                    bg="surface.900"
                    color="white"
                    _hover={{ bg: "surface.700" }}
                    isLoading={mutating}
                    onClick={() => void handleSaveStore(store.id)}
                  >
                    Save Store
                  </Button>
                </VStack>
              </Box>
            );
          })}
        </VStack>
      </Box>
    </VStack>
  );

  const renderInventory = () => {
    const visibleInventoryItems = inventoryView.items;
    const visibleInventoryHistory = inventoryView.history;
    const selectedStore = inventoryStores.find((store) => store.id === selectedInventoryStoreId) ?? null;
    const selectedItem = selectedInventoryItemId
      ? visibleInventoryItems.find((item) => item.storeProductId === selectedInventoryItemId) ?? null
      : null;
    const totalUnits = visibleInventoryItems.reduce((total, item) => total + item.stockQuantity, 0);
    const lowStockCount = visibleInventoryItems.filter((item) => item.stockQuantity <= 10).length;
    const disabledCount = visibleInventoryItems.filter((item) => !item.isEnabled || !item.isProductActive).length;
    const inventorySummaryCards = [
      { label: "Total Units", value: String(totalUnits) },
      { label: "Low Stock", value: String(lowStockCount) },
      { label: "Disabled", value: String(disabledCount) },
      { label: "Products", value: String(visibleInventoryItems.length) },
    ];

    if (selectedItem) {
      const draft = inventoryEdits[selectedItem.storeProductId] ?? {
        price: selectedItem.storePrice.toFixed(2),
        isEnabled: selectedItem.isEnabled,
        adjustQuantity: "1",
        adjustReason: "",
      };
      const movementType = inventoryMovementTypes[selectedItem.storeProductId] ?? "restock";
      const movementQuantity = Math.max(1, Number(draft.adjustQuantity) || 1);
      const movementLabel =
        movementType === "restock" ? "Restock" : movementType === "writeoff" ? "Write-off" : "Adjust";
      const movementTone =
        movementType === "restock"
          ? { bg: "brand.500", hover: "brand.600", color: "white" }
          : movementType === "writeoff"
            ? { bg: "rgba(248,113,113,0.14)", hover: "rgba(248,113,113,0.22)", color: "red.500" }
            : { bg: "surface.900", hover: "surface.700", color: "white" };

      return (
        <VStack spacing={4} align="stretch">
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={4}>
              <HStack justify="space-between" align="start">
                <VStack align="start" spacing={1}>
                  <Text fontWeight="900" fontSize="xl">
                    Product Details
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    {selectedStore?.name ?? selectedItem.storeName}
                  </Text>
                </VStack>
                {!supportsTelegramBackButton ? (
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor="var(--app-border)"
                    onClick={() => setSelectedInventoryItemId(null)}
                  >
                    Back
                  </Button>
                ) : null}
              </HStack>

              <HStack justify="space-between" align="start">
                <VStack align="start" spacing={1}>
                  <Text fontWeight="900" fontSize="2xl">
                    {selectedItem.productName}
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    Default {formatEur(selectedItem.defaultPrice)}
                  </Text>
                </VStack>
                <StatusPill
                  label={`${selectedItem.stockQuantity} units`}
                  tone={selectedItem.stockQuantity <= 10 ? "orange" : "blue"}
                />
              </HStack>

              <SimpleGrid columns={2} spacing={3}>
                <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                  <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em">
                    Store Price
                  </Text>
                  <Text fontWeight="900" fontSize="xl">
                    {formatEur(selectedItem.storePrice)}
                  </Text>
                </Box>
                <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                  <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em">
                    Status
                  </Text>
                  <Text fontWeight="900" fontSize="xl">
                    {draft.isEnabled && selectedItem.isProductActive ? "Active" : "Off"}
                  </Text>
                </Box>
              </SimpleGrid>

              <VStack align="stretch" spacing={3}>
                <Text fontWeight="900">Price & Status</Text>
                <Input
                  value={draft.price}
                  onChange={(event) =>
                    setInventoryEdits((current) => ({
                      ...current,
                      [selectedItem.storeProductId]: {
                        ...draft,
                        price: event.target.value,
                      },
                    }))
                  }
                  placeholder="Store price"
                  inputMode="decimal"
                  borderRadius="18px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />
                <HStack spacing={2}>
                  <Button
                    flex="1"
                    borderRadius="16px"
                    bg={draft.isEnabled ? "brand.500" : "rgba(241,240,236,0.95)"}
                    color={draft.isEnabled ? "white" : "surface.800"}
                    _hover={{ bg: draft.isEnabled ? "brand.600" : "rgba(225,223,218,0.95)" }}
                    onClick={() =>
                      setInventoryEdits((current) => ({
                        ...current,
                        [selectedItem.storeProductId]: { ...draft, isEnabled: true },
                      }))
                    }
                  >
                    Enabled
                  </Button>
                  <Button
                    flex="1"
                    borderRadius="16px"
                    bg={!draft.isEnabled ? "rgba(248,113,113,0.14)" : "rgba(241,240,236,0.95)"}
                    color={!draft.isEnabled ? "red.500" : "surface.800"}
                    _hover={{ bg: !draft.isEnabled ? "rgba(248,113,113,0.2)" : "rgba(225,223,218,0.95)" }}
                    onClick={() =>
                      setInventoryEdits((current) => ({
                        ...current,
                        [selectedItem.storeProductId]: { ...draft, isEnabled: false },
                      }))
                    }
                  >
                    Disabled
                  </Button>
                </HStack>
                <Button
                  borderRadius="18px"
                  bg="surface.900"
                  color="white"
                  _hover={{ bg: "surface.700" }}
                  isLoading={mutating}
                  onClick={() => void handleSaveStoreProduct(selectedItem.storeProductId)}
                >
                  Save Price & Status
                </Button>
              </VStack>

              <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

              <VStack align="stretch" spacing={3}>
                <Text fontWeight="900">Stock Movement</Text>
                <SimpleGrid columns={3} spacing={2}>
                  {([
                    ["restock", "Restock"],
                    ["writeoff", "Write-off"],
                    ["manual_adjustment", "Adjust"],
                  ] as Array<[InventoryMovementType, string]>).map(([type, label]) => {
                    const isActive = movementType === type;

                    return (
                      <Button
                        key={type}
                        size="sm"
                        borderRadius="14px"
                        bg={isActive ? "surface.900" : panelMutedSurface}
                        color={isActive ? "white" : type === "writeoff" ? "red.500" : "surface.700"}
                        _hover={{ bg: isActive ? "surface.900" : "rgba(232,231,226,0.96)" }}
                        onClick={() =>
                          setInventoryMovementTypes((current) => ({
                            ...current,
                            [selectedItem.storeProductId]: type,
                          }))
                        }
                      >
                        {label}
                      </Button>
                    );
                  })}
                </SimpleGrid>

                <HStack justify="center" spacing={6} bg={panelMutedSurface} py={3} px={5} borderRadius="20px">
                  <Button
                    aria-label="Decrease movement quantity"
                    minW="48px"
                    h="48px"
                    borderRadius="999px"
                    bg="white"
                    color="surface.700"
                    fontSize="2xl"
                    fontWeight="800"
                    _hover={{ bg: "surface.50" }}
                    onClick={() =>
                      setInventoryEdits((current) => ({
                        ...current,
                        [selectedItem.storeProductId]: {
                          ...draft,
                          adjustQuantity: String(Math.max(1, movementQuantity - 1)),
                        },
                      }))
                    }
                  >
                    -
                  </Button>
                  <VStack spacing={0}>
                    <Text fontSize="2xl" fontWeight="900" color="surface.900" lineHeight="1">
                      {movementQuantity}
                    </Text>
                    <Text fontSize="10px" fontWeight="800" color="surface.400" textTransform="uppercase">
                      Units
                    </Text>
                  </VStack>
                  <Button
                    aria-label="Increase movement quantity"
                    minW="48px"
                    h="48px"
                    borderRadius="999px"
                    bg="white"
                    color="surface.700"
                    fontSize="2xl"
                    fontWeight="800"
                    _hover={{ bg: "surface.50" }}
                    onClick={() =>
                      setInventoryEdits((current) => ({
                        ...current,
                        [selectedItem.storeProductId]: {
                          ...draft,
                          adjustQuantity: String(movementQuantity + 1),
                        },
                      }))
                    }
                  >
                    +
                  </Button>
                </HStack>

                <Input
                  value={draft.adjustReason}
                  onChange={(event) =>
                    setInventoryEdits((current) => ({
                      ...current,
                      [selectedItem.storeProductId]: {
                        ...draft,
                        adjustReason: event.target.value,
                      },
                    }))
                  }
                  placeholder="Reason (optional)"
                  borderRadius="18px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />

                <Button
                  borderRadius="18px"
                  bg={movementTone.bg}
                  color={movementTone.color}
                  _hover={{ bg: movementTone.hover }}
                  isLoading={mutating}
                  onClick={() => void handleInventoryAdjustment(selectedItem.storeProductId, movementType)}
                >
                  {movementLabel} {movementQuantity} Units
                </Button>
              </VStack>
            </VStack>
          </Box>
        </VStack>
      );
    }

    return (
      <VStack spacing={4} align="stretch">
        <SimpleGrid columns={2} spacing={3}>
          {inventorySummaryCards.map((card) => (
            <Box key={card.label} bg={panelSurface} borderRadius="22px" px={4} py={4} boxShadow={panelShadow}>
              <Text fontSize="xs" textTransform="uppercase" color="surface.500" letterSpacing="0.08em">
                {card.label}
              </Text>
              <Text fontSize="2xl" fontWeight="900" mt={2}>
                {card.value}
              </Text>
            </Box>
          ))}
        </SimpleGrid>

        <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between">
              <VStack align="start" spacing={0}>
                <Text fontWeight="900" fontSize="lg">
                  Store Inventory
                </Text>
                <Text fontSize="sm" color="surface.500">
                  {selectedStore?.name ?? "Select store"}
                </Text>
              </VStack>
              {inventorySoftRefreshing || loadingInventory ? <StatusPill label="Updating" tone="blue" /> : null}
            </HStack>
            <HStack spacing={2} overflowX="auto" pb={1}>
              {inventoryStores.map((store) => {
                const isActive = selectedInventoryStoreId === store.id;

                return (
                  <Button
                    key={store.id}
                    size="sm"
                    flexShrink={0}
                    borderRadius="999px"
                    bg={isActive ? "brand.500" : panelMutedSurface}
                    color={isActive ? "white" : "surface.700"}
                    _hover={{ bg: isActive ? "brand.600" : "rgba(232,231,226,0.96)" }}
                    onClick={() => setSelectedInventoryStoreId(store.id)}
                  >
                    {store.name}
                  </Button>
                );
              })}
            </HStack>
          </VStack>
        </Box>

        <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
          <HStack spacing={2}>
            {(["stock", "products"] as InventoryMode[]).map((mode) => {
              const isActive = inventoryMode === mode;

              return (
                <Button
                  key={mode}
                  flex="1"
                  size="sm"
                  borderRadius="999px"
                  bg={isActive ? "surface.900" : "transparent"}
                  color={isActive ? "white" : "surface.500"}
                  _hover={{ bg: isActive ? "surface.900" : panelMutedSurface }}
                  onClick={() => setInventoryMode(mode)}
                >
                  {mode === "stock" ? `Stock · ${visibleInventoryItems.length}` : `Products · ${products.length}`}
                </Button>
              );
            })}
          </HStack>
        </Box>

        {inventoryMode === "stock" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between">
                <Text fontWeight="900" fontSize="lg">
                  Stock List
                </Text>
                <Text color="surface.500" fontWeight="700" fontSize="sm">
                  {visibleInventoryItems.length} items
                </Text>
              </HStack>

              {visibleInventoryItems.map((item) => (
                <Box
                  key={item.storeProductId}
                  as="button"
                  type="button"
                  textAlign="left"
                  bg={panelMutedSurface}
                  borderRadius="18px"
                  px={3}
                  py={3}
                  onClick={() => setSelectedInventoryItemId(item.storeProductId)}
                >
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={1} minW={0}>
                      <HStack spacing={2}>
                        <Text fontWeight="900">{item.productName}</Text>
                        {!item.isProductActive ? <StatusPill label="Product Off" tone="orange" /> : null}
                      </HStack>
                      <Text fontSize="sm" color="surface.600" fontWeight="700">
                        {formatEur(item.storePrice)}
                      </Text>
                      <Text fontSize="xs" color="surface.500">
                        Default {formatEur(item.defaultPrice)} · Updated {formatShortDate(item.updatedAt)}
                      </Text>
                    </VStack>
                    <VStack align="end" spacing={1}>
                      <Text fontWeight="900" fontSize="lg">
                        {item.stockQuantity}
                      </Text>
                      <StatusPill
                        label={item.isEnabled ? "Enabled" : "Disabled"}
                        tone={item.isEnabled ? (item.stockQuantity <= 10 ? "orange" : "green") : "red"}
                      />
                    </VStack>
                  </HStack>
                </Box>
              ))}
            </VStack>
          </Box>
        ) : (
          <VStack spacing={4} align="stretch">
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <VStack align="start" spacing={0}>
                  <Text fontWeight="900" fontSize="lg">
                    Add Product
                  </Text>
                  <Text color="surface.500" fontSize="sm">
                    New products appear in every store with zero stock.
                  </Text>
                </VStack>
                <Input
                  value={newProduct.name}
                  onChange={(event) => setNewProduct((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Product name"
                  borderRadius="18px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />
                <Input
                  value={newProduct.defaultPrice}
                  onChange={(event) => setNewProduct((current) => ({ ...current, defaultPrice: event.target.value }))}
                  placeholder="Default price"
                  inputMode="decimal"
                  borderRadius="18px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />
                <Button
                  borderRadius="18px"
                  bg="brand.500"
                  color="white"
                  _hover={{ bg: "brand.600" }}
                  isLoading={mutating}
                  onClick={() => void handleCreateProduct()}
                >
                  Add Product
                </Button>
              </VStack>
            </Box>

            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <HStack justify="space-between">
                  <Text fontWeight="900" fontSize="lg">
                    Product Catalog
                  </Text>
                  <Text color="surface.500" fontWeight="700" fontSize="sm">
                    {products.length} items
                  </Text>
                </HStack>

                {products.map((product) => {
                  const draft = productEdits[product.id] ?? {
                    name: product.name,
                    sku: product.sku,
                    defaultPrice: product.defaultPrice.toFixed(2),
                    isActive: product.isActive,
                  };

                  return (
                    <Box key={product.id} bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                      <VStack align="stretch" spacing={3}>
                        <HStack justify="space-between">
                          <VStack align="start" spacing={0}>
                            <Text fontWeight="900">{product.name}</Text>
                            <Text fontSize="sm" color="surface.500">
                              Default {formatEur(product.defaultPrice)}
                            </Text>
                          </VStack>
                          <StatusPill label={product.isActive ? "Active" : "Inactive"} tone={product.isActive ? "green" : "red"} />
                        </HStack>
                        <Input
                          value={draft.name}
                          onChange={(event) =>
                            setProductEdits((current) => ({
                              ...current,
                              [product.id]: { ...draft, name: event.target.value },
                            }))
                          }
                          placeholder="Product name"
                          borderRadius="14px"
                          bg="white"
                          borderColor="rgba(226,224,218,0.95)"
                        />
                        <Input
                          value={draft.defaultPrice}
                          onChange={(event) =>
                            setProductEdits((current) => ({
                              ...current,
                              [product.id]: { ...draft, defaultPrice: event.target.value },
                            }))
                          }
                          placeholder="Default price"
                          inputMode="decimal"
                          borderRadius="14px"
                          bg="white"
                          borderColor="rgba(226,224,218,0.95)"
                        />
                        <Button
                          size="sm"
                          borderRadius="14px"
                          bg={draft.isActive ? "rgba(34,197,94,0.12)" : "rgba(248,113,113,0.14)"}
                          color={draft.isActive ? "green.600" : "red.500"}
                          _hover={{
                            bg: draft.isActive ? "rgba(34,197,94,0.18)" : "rgba(248,113,113,0.2)",
                          }}
                          onClick={() =>
                            setProductEdits((current) => ({
                              ...current,
                              [product.id]: { ...draft, isActive: !draft.isActive },
                            }))
                          }
                        >
                          {draft.isActive ? "Active" : "Inactive"}
                        </Button>
                        <Button
                          borderRadius="16px"
                          bg="surface.900"
                          color="white"
                          _hover={{ bg: "surface.700" }}
                          isLoading={mutating}
                          onClick={() => void handleSaveProduct(product.id)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          borderRadius="14px"
                          variant="ghost"
                          color="red.500"
                          _hover={{ bg: "rgba(248,113,113,0.12)" }}
                          isLoading={mutating}
                          onClick={() => void handleDeleteProduct(product.id, product.name)}
                        >
                          Delete Product
                        </Button>
                      </VStack>
                    </Box>
                  );
                })}
              </VStack>
            </Box>
          </VStack>
        )}

        {inventoryMode === "stock" && visibleInventoryHistory.length > 0 ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between">
                <Text fontWeight="900" fontSize="lg">
                  Recent Movements
                </Text>
                <Text color="surface.500" fontWeight="700" fontSize="sm">
                  {visibleInventoryHistory.length} entries
                </Text>
              </HStack>

              {visibleInventoryHistory.slice(0, 6).map((entry) => (
                <HStack key={entry.id} justify="space-between" align="start">
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="800">{entry.product?.name ?? "Unknown product"}</Text>
                    <Text fontSize="sm" color="surface.500">
                      {entry.movementType} · balance {entry.balanceAfter}
                    </Text>
                    <Text fontSize="xs" color="surface.500">
                      {formatDateTime(entry.createdAt)} · {entry.actor?.full_name ?? "Unknown actor"}
                    </Text>
                  </VStack>
                  <Text fontWeight="900" color={entry.quantityDelta >= 0 ? "green.500" : "red.400"}>
                    {entry.quantityDelta >= 0 ? "+" : ""}
                    {entry.quantityDelta}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </Box>
        ) : null}
      </VStack>
    );
  };

  const renderSales = () => {
    const visibleSales = salesView.sales;
    const visibleReturns = salesView.returns;
    const selectedSale = selectedAdminSaleId
      ? visibleSales.find((sale) => sale.id === selectedAdminSaleId) ?? null
      : null;
    const selectedReturn = selectedAdminReturnId
      ? visibleReturns.find((entry) => entry.id === selectedAdminReturnId) ?? null
      : null;
    const salesTotal = visibleSales.reduce((total, sale) => total + sale.totalAmount, 0);
    const cashTotal = visibleSales
      .filter((sale) => sale.paymentMethod === "cash")
      .reduce((total, sale) => total + sale.totalAmount, 0);
    const cardTotal = visibleSales
      .filter((sale) => sale.paymentMethod === "card")
      .reduce((total, sale) => total + sale.totalAmount, 0);
    const returnsTotal = visibleReturns.reduce((total, entry) => total + entry.totalAmount, 0);
    const returnedUnits = visibleReturns.reduce(
      (total, entry) => total + entry.items.reduce((itemTotal, item) => itemTotal + item.quantity, 0),
      0
    );
    const salesSummaryCards = salesLedgerMode === "sales"
      ? [
          { label: "Revenue", value: formatEur(salesTotal) },
          { label: "Sales", value: String(visibleSales.length) },
          { label: "Cash", value: formatEur(cashTotal) },
          { label: "Card", value: formatEur(cardTotal) },
        ]
      : [
          { label: "Returned", value: formatEur(returnsTotal) },
          { label: "Returns", value: String(visibleReturns.length) },
          { label: "Units", value: String(returnedUnits) },
          { label: "Avg Return", value: formatEur(returnsTotal / Math.max(visibleReturns.length, 1)) },
        ];

    if (selectedSale) {
      return (
        <VStack spacing={4} align="stretch">
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={4}>
              <HStack justify="space-between" align="start">
                <VStack align="start" spacing={1}>
                  <Text fontWeight="900" fontSize="xl">
                    Sale Receipt
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    {selectedSale.store?.name ?? "Unknown store"} · {selectedSale.seller?.fullName ?? "Unknown seller"}
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    {formatDateTime(selectedSale.createdAt)}
                  </Text>
                </VStack>
                {!supportsTelegramBackButton ? (
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor="var(--app-border)"
                    onClick={() => setSelectedAdminSaleId(null)}
                  >
                    Back
                  </Button>
                ) : null}
              </HStack>

              <HStack justify="space-between">
                <StatusPill
                  label={selectedSale.status === "deleted" ? "Deleted Sale" : "Completed Sale"}
                  tone={selectedSale.status === "deleted" ? "red" : "green"}
                />
                <Text fontWeight="900">{selectedSale.paymentMethod.toUpperCase()}</Text>
              </HStack>

              <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

              {selectedSale.items.map((item) => (
                <HStack key={item.id} justify="space-between" align="start">
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="800">{item.productNameSnapshot}</Text>
                    <Text fontSize="sm" color="surface.500">
                      Qty {item.quantity} x {formatEur(item.finalPrice)}
                    </Text>
                    {item.discountType ? (
                      <Text fontSize="xs" color="surface.500">
                        Discount {item.discountType}: {item.discountValue}
                      </Text>
                    ) : null}
                  </VStack>
                  <Text fontWeight="900">{formatEur(item.lineTotal)}</Text>
                </HStack>
              ))}

              <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

              <VStack align="stretch" spacing={2}>
                <HStack justify="space-between">
                  <Text color="surface.500" fontWeight="700">
                    Subtotal
                  </Text>
                  <Text fontWeight="800">{formatEur(selectedSale.subtotalAmount)}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text color="surface.500" fontWeight="700">
                    Discount
                  </Text>
                  <Text fontWeight="800">{formatEur(selectedSale.discountAmount)}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="lg" fontWeight="900">
                    Total
                  </Text>
                  <Text fontSize="lg" fontWeight="900">
                    {formatEur(selectedSale.totalAmount)}
                  </Text>
                </HStack>
              </VStack>

              {selectedSale.status === "deleted" ? (
                <Box bg="rgba(248,113,113,0.08)" borderRadius="16px" px={3} py={3}>
                  <Text fontSize="sm" fontWeight="800" color="red.500">
                    Deleted {selectedSale.deletedAt ? formatDateTime(selectedSale.deletedAt) : ""}
                  </Text>
                  <Text fontSize="xs" color="surface.500">
                    {selectedSale.deletedBy?.fullName ?? "Unknown user"} · {selectedSale.deletionReason ?? "No reason"}
                  </Text>
                </Box>
              ) : null}

              <Text fontSize="xs" color="surface.500">
                Sale ID: {selectedSale.id}
              </Text>
            </VStack>
          </Box>
        </VStack>
      );
    }

    if (selectedReturn) {
      return (
        <VStack spacing={4} align="stretch">
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={4}>
              <HStack justify="space-between" align="start">
                <VStack align="start" spacing={1}>
                  <Text fontWeight="900" fontSize="xl">
                    Return Receipt
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    {selectedReturn.store?.name ?? "Unknown store"} · {selectedReturn.seller?.fullName ?? "Unknown seller"}
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    {formatDateTime(selectedReturn.createdAt)}
                  </Text>
                </VStack>
                {!supportsTelegramBackButton ? (
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor="var(--app-border)"
                    onClick={() => setSelectedAdminReturnId(null)}
                  >
                    Back
                  </Button>
                ) : null}
              </HStack>

              <Box bg="rgba(74,132,244,0.08)" borderRadius="16px" px={3} py={3}>
                <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                  Reason
                </Text>
                <Text fontWeight="800">{selectedReturn.reason}</Text>
              </Box>

              <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

              {selectedReturn.items.map((item) => (
                <HStack key={item.id} justify="space-between" align="start">
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="800">{item.productNameSnapshot}</Text>
                    <Text fontSize="sm" color="surface.500">
                      Qty {item.quantity} x {formatEur(item.returnedPrice)}
                    </Text>
                  </VStack>
                  <Text fontWeight="900">{formatEur(item.lineTotal)}</Text>
                </HStack>
              ))}

              <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

              <HStack justify="space-between">
                <Text fontSize="lg" fontWeight="900">
                  Total Returned
                </Text>
                <Text fontSize="lg" fontWeight="900">
                  {formatEur(selectedReturn.totalAmount)}
                </Text>
              </HStack>

              <Text fontSize="xs" color="surface.500">
                Return ID: {selectedReturn.id} · Sale {selectedReturn.saleId.slice(0, 8)}
              </Text>
            </VStack>
          </Box>
        </VStack>
      );
    }

    return (
      <VStack spacing={4} align="stretch">
        <SimpleGrid columns={2} spacing={3}>
          {salesSummaryCards.map((card) => (
            <Box key={card.label} bg={panelSurface} borderRadius="22px" px={4} py={4} boxShadow={panelShadow}>
              <Text fontSize="xs" textTransform="uppercase" color="surface.500" letterSpacing="0.08em">
                {card.label}
              </Text>
              <Text fontSize="2xl" fontWeight="900" mt={2}>
                {card.value}
              </Text>
            </Box>
          ))}
        </SimpleGrid>

        <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
          <VStack align="stretch" spacing={3}>
            <HStack spacing={2}>
              {(["today", "week", "month", "custom"] as SalesPeriod[]).map((period) => {
                const isActive = salesPeriod === period;

                return (
                  <Button
                    key={period}
                    size="sm"
                    flex="1"
                    borderRadius="999px"
                    bg={isActive ? "brand.500" : panelMutedSurface}
                    color={isActive ? "white" : "surface.700"}
                    _hover={{ bg: isActive ? "brand.600" : "rgba(232,231,226,0.96)" }}
                    onClick={() => void handleSelectSalesPeriod(period)}
                  >
                    {period === "today" ? "Today" : period === "week" ? "Week" : period === "month" ? "Month" : "Custom"}
                  </Button>
                );
              })}
            </HStack>

            <SimpleGrid columns={2} spacing={2}>
              <Select
                value={salesStoreFilter}
                onChange={(event) => {
                  const storeId = event.target.value;
                  setSalesStoreFilter(storeId);
                  void handleApplySalesFilters({ storeId });
                }}
                borderRadius="18px"
                bg="white"
                borderColor="rgba(226,224,218,0.95)"
              >
                <option value="">All stores</option>
                {salesStores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </Select>
              <Select
                value={salesSellerFilter}
                onChange={(event) => {
                  const sellerId = event.target.value;
                  setSalesSellerFilter(sellerId);
                  void handleApplySalesFilters({ sellerId });
                }}
                borderRadius="18px"
                bg="white"
                borderColor="rgba(226,224,218,0.95)"
              >
                <option value="">All sellers</option>
                {salesSellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.fullName}
                  </option>
                ))}
              </Select>
              <Select
                value={salesStatusFilter}
                onChange={(event) => {
                  const saleStatus = event.target.value as "all" | "completed" | "deleted";
                  setSalesStatusFilter(saleStatus);
                  void handleApplySalesFilters({ saleStatus });
                }}
                borderRadius="18px"
                bg="white"
                borderColor="rgba(226,224,218,0.95)"
              >
                <option value="all">All sales</option>
                <option value="completed">Completed</option>
                <option value="deleted">Deleted</option>
              </Select>
              <Button
                borderRadius="18px"
                bg={panelMutedSurface}
                color="surface.700"
                _hover={{ bg: "rgba(232,231,226,0.96)" }}
                isLoading={loadingSales}
                onClick={() => void handleApplySalesFilters()}
              >
                Refresh
              </Button>
            </SimpleGrid>

            {salesPeriod === "custom" ? (
              <SimpleGrid columns={2} spacing={2}>
                <Input
                  value={salesDateFrom}
                  onChange={(event) => setSalesDateFrom(event.target.value)}
                  type="date"
                  borderRadius="18px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />
                <Input
                  value={salesDateTo}
                  onChange={(event) => setSalesDateTo(event.target.value)}
                  type="date"
                  borderRadius="18px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />
                <Button
                  gridColumn="1 / -1"
                  borderRadius="18px"
                  bg="brand.500"
                  color="white"
                  _hover={{ bg: "brand.600" }}
                  isLoading={loadingSales}
                  onClick={() => void handleApplySalesFilters()}
                >
                  Apply Custom Range
                </Button>
              </SimpleGrid>
            ) : null}
          </VStack>
        </Box>

        <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
          <HStack spacing={2}>
            {(["sales", "returns"] as SalesLedgerMode[]).map((mode) => {
              const isActive = salesLedgerMode === mode;

              return (
                <Button
                  key={mode}
                  flex="1"
                  size="sm"
                  borderRadius="999px"
                  bg={isActive ? "surface.900" : "transparent"}
                  color={isActive ? "white" : "surface.500"}
                  _hover={{ bg: isActive ? "surface.900" : panelMutedSurface }}
                  onClick={() => setSalesLedgerMode(mode)}
                >
                  {mode === "sales" ? `Sales · ${visibleSales.length}` : `Returns · ${visibleReturns.length}`}
                </Button>
              );
            })}
          </HStack>
        </Box>

        <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between">
              <Text fontWeight="900" fontSize="lg">
                {salesLedgerMode === "sales" ? "Sales Ledger" : "Returns Ledger"}
              </Text>
              {salesSoftRefreshing || loadingSales ? (
                <StatusPill label="Updating" tone="blue" />
              ) : (
                <Text color="surface.500" fontWeight="700" fontSize="sm">
                  {salesLedgerMode === "sales" ? visibleSales.length : visibleReturns.length} items
                </Text>
              )}
            </HStack>

            {salesLedgerMode === "sales" && visibleSales.length === 0 ? (
              <Text color="surface.500" fontSize="sm">
                No sales match the current filters.
              </Text>
            ) : null}

            {salesLedgerMode === "returns" && visibleReturns.length === 0 ? (
              <Text color="surface.500" fontSize="sm">
                No returns match the current filters.
              </Text>
            ) : null}

            {salesLedgerMode === "sales"
              ? visibleSales.map((sale) => (
                  <Box
                    key={sale.id}
                    as="button"
                    type="button"
                    textAlign="left"
                    bg={panelMutedSurface}
                    borderRadius="18px"
                    px={3}
                    py={3}
                    onClick={() => setSelectedAdminSaleId(sale.id)}
                  >
                    <HStack justify="space-between" align="start">
                      <VStack align="start" spacing={1} minW={0}>
                        <HStack spacing={2}>
                          <Text fontWeight="900">
                            {sale.status === "deleted" ? "Deleted Sale" : "Completed Sale"}
                          </Text>
                          <StatusPill
                            label={sale.paymentMethod.toUpperCase()}
                            tone={sale.paymentMethod === "cash" ? "green" : "blue"}
                          />
                        </HStack>
                        <Text fontSize="sm" color="surface.600" fontWeight="700">
                          {sale.store?.name ?? "Unknown store"}
                        </Text>
                        <Text fontSize="xs" color="surface.500">
                          {formatShortDate(sale.createdAt)} · {formatSalesTime(sale.createdAt)} ·{" "}
                          {sale.seller?.fullName ?? "Unknown seller"} · {sale.items.length} items
                        </Text>
                      </VStack>
                      <VStack align="end" spacing={1}>
                        <Text fontWeight="900">{formatEur(sale.totalAmount)}</Text>
                        <StatusPill
                          label={sale.status === "deleted" ? "Deleted" : "Completed"}
                          tone={sale.status === "deleted" ? "red" : "green"}
                        />
                      </VStack>
                    </HStack>
                  </Box>
                ))
              : visibleReturns.map((entry) => (
                  <Box
                    key={entry.id}
                    as="button"
                    type="button"
                    textAlign="left"
                    bg={panelMutedSurface}
                    borderRadius="18px"
                    px={3}
                    py={3}
                    onClick={() => setSelectedAdminReturnId(entry.id)}
                  >
                    <HStack justify="space-between" align="start">
                      <VStack align="start" spacing={1} minW={0}>
                        <HStack spacing={2}>
                          <Text fontWeight="900">Return</Text>
                          <StatusPill label="Return" tone="orange" />
                        </HStack>
                        <Text fontSize="sm" color="surface.600" fontWeight="700">
                          {entry.store?.name ?? "Unknown store"}
                        </Text>
                        <Text fontSize="xs" color="surface.500">
                          {formatShortDate(entry.createdAt)} · {formatSalesTime(entry.createdAt)} ·{" "}
                          {entry.seller?.fullName ?? "Unknown seller"} · {entry.items.length} items
                        </Text>
                      </VStack>
                      <VStack align="end" spacing={1}>
                        <Text fontWeight="900">{formatEur(entry.totalAmount)}</Text>
                        <Text fontSize="xs" color="surface.500" fontWeight="700">
                          Sale {entry.saleId.slice(0, 8)}
                        </Text>
                      </VStack>
                    </HStack>
                  </Box>
                ))}
          </VStack>
        </Box>
      </VStack>
    );
  };

  const renderStaffSection = () => (
    <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
      <VStack align="stretch" spacing={3}>
        <HStack justify="space-between">
          <Text fontWeight="900" fontSize="lg">
            Staff Directory
          </Text>
          <Text color="surface.500" fontWeight="700" fontSize="sm">
            {staff.length} sellers
          </Text>
        </HStack>

        {staff.map((seller) => (
          <Box key={seller.id} bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between" align="start">
                <VStack align="start" spacing={0}>
                  <Text fontWeight="900">{seller.fullName}</Text>
                  <Text fontSize="sm" color="surface.500">
                    {seller.currentAssignment?.storeName ?? "Unassigned"}
                  </Text>
                </VStack>
                {seller.activeShift ? (
                  <StatusPill
                    label={seller.activeShift.status === "paused" ? "Paused" : "On Shift"}
                    tone={seller.activeShift.status === "paused" ? "orange" : "blue"}
                  />
                ) : (
                  <StatusPill label={seller.isActive ? "Active" : "Inactive"} tone={seller.isActive ? "green" : "red"} />
                )}
              </HStack>

              <SimpleGrid columns={2} spacing={2}>
                <Box bg="rgba(255,255,255,0.7)" borderRadius="16px" px={3} py={3}>
                  <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em">
                    Sales
                  </Text>
                  <Text fontWeight="900">{seller.salesCount}</Text>
                </Box>
                <Box bg="rgba(255,255,255,0.7)" borderRadius="16px" px={3} py={3}>
                  <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em">
                    Revenue
                  </Text>
                  <Text fontWeight="900">{formatEur(seller.revenue)}</Text>
                </Box>
              </SimpleGrid>

              <Select
                value={staffAssignments[seller.id] ?? ""}
                onChange={(event) =>
                  setStaffAssignments((current) => ({
                    ...current,
                    [seller.id]: event.target.value,
                  }))
                }
                borderRadius="16px"
                bg="white"
                borderColor="rgba(226,224,218,0.95)"
              >
                <option value="" disabled>
                  Select assigned store
                </option>
                {stores
                  .filter((store) => store.isActive)
                  .map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
              </Select>

              <Button
                borderRadius="16px"
                bg="brand.500"
                color="white"
                _hover={{ bg: "brand.600" }}
                isLoading={mutating}
                isDisabled={!seller.isActive || !staffAssignments[seller.id]}
                onClick={() => void handleAssignSeller(seller.id)}
              >
                Reassign Seller
              </Button>
              <Button
                size="sm"
                borderRadius="14px"
                variant="ghost"
                color="surface.700"
                _hover={{ bg: "rgba(255,255,255,0.65)" }}
                isDisabled={!seller.currentAssignment || !seller.isActive}
                onClick={() => void onViewAsSeller(seller.id)}
              >
                View as Seller
              </Button>
            </VStack>
          </Box>
        ))}
      </VStack>
    </Box>
  );

  const renderTeam = () => {
    const activeStores = stores.filter((store) => store.isActive).length;
    const liveShifts = stores.reduce((total, store) => total + store.activeShiftCount, 0);
    const unassignedSellers = staff.filter((seller) => !seller.currentAssignment).length;
    const activeSellers = staff.filter((seller) => seller.isActive).length;
    const teamSummaryCards = [
      { label: "Active Stores", value: String(activeStores) },
      { label: "Sellers", value: String(activeSellers) },
      { label: "Live Shifts", value: String(liveShifts) },
      { label: "Unassigned", value: String(unassignedSellers) },
    ];

    return (
      <VStack spacing={4} align="stretch">
        <SimpleGrid columns={2} spacing={3}>
          {teamSummaryCards.map((card) => (
            <Box key={card.label} bg={panelSurface} borderRadius="22px" px={4} py={4} boxShadow={panelShadow}>
              <Text fontSize="xs" textTransform="uppercase" color="surface.500" letterSpacing="0.08em">
                {card.label}
              </Text>
              <Text fontSize="2xl" fontWeight="900" mt={2}>
                {card.value}
              </Text>
            </Box>
          ))}
        </SimpleGrid>

        <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
          <HStack spacing={2}>
            {(["staff", "stores"] as TeamMode[]).map((mode) => {
              const isActive = teamMode === mode;

              return (
                <Button
                  key={mode}
                  flex="1"
                  size="sm"
                  borderRadius="999px"
                  bg={isActive ? "surface.900" : "transparent"}
                  color={isActive ? "white" : "surface.500"}
                  _hover={{ bg: isActive ? "surface.900" : panelMutedSurface }}
                  onClick={() => setTeamMode(mode)}
                >
                  {mode === "staff" ? `Staff · ${staff.length}` : `Stores · ${stores.length}`}
                </Button>
              );
            })}
          </HStack>
        </Box>

        {teamMode === "staff" ? renderStaffSection() : renderStoresSection()}
      </VStack>
    );
  };

  const renderPlaceholder = (title: string, description: string) => (
    <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={5} boxShadow={panelShadow}>
      <Text fontWeight="900" fontSize="lg">
        {title}
      </Text>
      <Text color="surface.500" fontSize="sm" mt={2}>
        {description}
      </Text>
    </Box>
  );

  const renderTab = () => {
    switch (activeTab) {
      case "sales":
        return renderSales();
      case "inventory":
        return renderInventory();
      case "team":
        return renderTeam();
      case "settings":
        return (
          <VStack spacing={4} align="stretch">
            {renderPlaceholder(
              "Admin Settings",
              "Session controls and admin-side environment tools live here for now. Later we can add account preferences and support diagnostics."
            )}
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <Text fontWeight="900" fontSize="lg">
                  Developer Switch
                </Text>
                <Text color="surface.500" fontSize="sm">
                  Switch between admin and seller without restarting the app.
                </Text>
                <HStack spacing={3}>
                  <Button
                    flex="1"
                    borderRadius="16px"
                    bg={currentPanel === "seller" ? "brand.500" : "rgba(241,240,236,0.95)"}
                    color={currentPanel === "seller" ? "white" : "surface.800"}
                    _hover={{
                      bg: currentPanel === "seller" ? "brand.600" : "rgba(225,223,218,0.95)",
                    }}
                    onClick={() => void onSwitchPanel("seller")}
                  >
                    Seller
                  </Button>
                  <Button
                    flex="1"
                    borderRadius="16px"
                    bg={currentPanel === "admin" ? "brand.500" : "rgba(241,240,236,0.95)"}
                    color={currentPanel === "admin" ? "white" : "surface.800"}
                    _hover={{
                      bg: currentPanel === "admin" ? "brand.600" : "rgba(225,223,218,0.95)",
                    }}
                    onClick={() => void onSwitchPanel("admin")}
                  >
                    Admin
                  </Button>
                </HStack>
              </VStack>
            </Box>
          </VStack>
        );
      case "overview":
      default:
        return renderDashboard();
    }
  };

  return (
    <Box minH="100vh" px={3} pt="var(--app-screen-pt)" pb={bottomNavReservedSpace}>
      <Container maxW="container.sm" px={0}>
        <VStack spacing={5} align="stretch">
          <HStack justify="space-between" align="center" px={1} pt={2} mb={2}>
            <Text
              fontSize="3xl"
              fontWeight="900"
              letterSpacing="-0.04em"
              color="surface.900"
              lineHeight="1"
            >
              {adminTabTitle[activeTab]}
            </Text>

            <HStack
              spacing={3}
              bg="rgba(255,255,255,0.9)"
              borderRadius="18px"
              px={3}
              py={2}
              boxShadow="0 12px 30px rgba(17, 17, 17, 0.06)"
            >
              <Avatar size="sm" name={operatorName} bg="surface.200" color="surface.800" />
              <VStack align="start" spacing={0}>
                <Text fontWeight="800" lineHeight="1">
                  {operatorName}
                </Text>
                <Text fontSize="xs" color="surface.500" fontWeight="700" lineHeight="1.1">
                  Admin
                </Text>
              </VStack>
            </HStack>
          </HStack>

          {loading || loadingStores || loadingStaff ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={5} boxShadow={panelShadow}>
              <Text fontWeight="800">
                {activeTab === "team" ? "Loading team data..." : "Loading admin data..."}
              </Text>
            </Box>
          ) : null}

          {mutating ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <Text fontWeight="700" color="surface.600">
                Saving changes...
              </Text>
            </Box>
          ) : null}

          {managementStatus ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={5} boxShadow={panelShadow}>
              <Text fontWeight="800" color="red.400">
                {managementStatus}
              </Text>
            </Box>
          ) : null}

          {renderTab()}
        </VStack>
      </Container>

      <Box position="fixed" left={0} right={0} bottom={0} zIndex={30}>
        <AdminNav activeTab={activeTab} onChange={handleAdminTabChange} onReselect={resetAdminSection} />
      </Box>
    </Box>
  );
}
