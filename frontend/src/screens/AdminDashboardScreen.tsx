import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
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
import { LuActivity, LuCheck, LuChevronDown, LuClock3, LuMinus, LuPlus, LuReceiptText } from "react-icons/lu";
import type { IconType } from "react-icons";
import { AdminNav, type AdminTab } from "../components/AdminNav";
import { apiGet } from "../lib/api";
import { formatEur } from "../lib/currency";
import { canUseTelegramBackButton, useTelegramBackButton } from "../lib/telegramBackButton";
import { isTelegramFullscreenLike } from "../lib/telegramViewport";
import { useAdminDashboardStore } from "../store/useAdminDashboardStore";
import { useAdminManagementStore } from "../store/useAdminManagementStore";
import type {
  AdminDashboardResponse,
  AdminInventoryResponse,
  AdminSalesOverviewResponse,
  AdminStaffResponse,
  AdminStoresResponse,
  AdminStartupResponse,
} from "../types/admin";

const panelSurface = "rgba(255,255,255,0.88)";
const panelMutedSurface = "rgba(241,240,236,0.82)";
const panelShadow = "0 18px 36px rgba(18, 18, 18, 0.06)";
const panelRadius = "24px";
const bottomNavReservedSpace = "calc(96px + env(safe-area-inset-bottom, 0px))";
const ADMIN_SOFT_POLLING_INTERVAL_MS = 30000;
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

function getLowStockCardProps(shouldPulse: boolean) {
  return shouldPulse
    ? {
        className: "low-stock-card-pulse",
        border: "1px solid rgba(248,113,113,0.18)",
      }
    : {};
}

type AdminDashboardScreenProps = {
  operatorName: string;
  currentPanel: "admin" | "seller";
  onSwitchPanel: (panel: "admin" | "seller") => Promise<void>;
  onViewAsSeller: (sellerId: string) => Promise<void>;
};

type SalesLedgerMode = "sales" | "returns";
type SalesPeriod = "today" | "week" | "month" | "custom";
type SalesLedgerSnapshot = Pick<AdminSalesOverviewResponse, "sales" | "returns">;
type SalesPeriodSummary = AdminSalesOverviewResponse["summary"];
type SalesPeriodSummaryMap = NonNullable<AdminSalesOverviewResponse["periodSummaries"]>;
type InventoryMode = "stock" | "products";
type InventoryDetailMode = "overview" | "settings" | "stock";
type ProductDetailMode = "overview" | "settings" | "stores";
type InventorySnapshot = Pick<AdminInventoryResponse, "items" | "history">;
type InventoryItem = AdminInventoryResponse["items"][number];
type InventoryMovementType = "manual_adjustment" | "restock" | "writeoff";
type TeamMode = "staff" | "stores";
type StaffDetailMode = "overview" | "profile" | "worklog" | "activity";
type StaffSeller = AdminStaffResponse["sellers"][number];
type StoreDetailMode = "overview" | "profile" | "staff" | "activity";
type TeamStore = AdminStoresResponse["stores"][number];
type TeamVirtualKeyboardField = "storeName" | "storeAddress" | "sellerName" | "sellerTelegramId";
type ProductVirtualKeyboardField = "productName" | "productPrice";

function compareInventoryItems(left: InventoryItem, right: InventoryItem) {
  const nameComparison = left.productName.localeCompare(right.productName, undefined, {
    sensitivity: "base",
    numeric: true,
  });

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return left.storeProductId.localeCompare(right.storeProductId);
}

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

function hasCompleteInventorySnapshots(startup: AdminStartupResponse | null) {
  if (!startup) {
    return false;
  }

  const snapshots = startup.inventory.storeSnapshotsByStoreId;

  if (!snapshots) {
    return false;
  }

  return startup.inventory.stores.every((store) => {
    const snapshot = snapshots[store.id];
    return Boolean(snapshot && snapshot.items.every((item) => item.storeId === store.id));
  });
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

function getMatchingPresetSalesPeriod(filters: AdminSalesOverviewResponse["filters"] | null) {
  if (!filters || filters.storeId || filters.sellerId || filters.saleStatus !== "all") {
    return null;
  }

  const normalizedFrom = filters.dateFrom ? toDateInputValue(new Date(filters.dateFrom)) : "";
  const normalizedTo = filters.dateTo ? toDateInputValue(new Date(filters.dateTo)) : "";

  for (const period of ["today", "week", "month"] as const) {
    const range = getSalesPeriodRange(period);

    if (range.from === normalizedFrom && range.to === normalizedTo) {
      return period;
    }
  }

  return null;
}

function formatSalesTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
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
  return hasCompleteInventorySnapshots(cached) ? cached : null;
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

  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function parseDecimalInput(value: string) {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

const demoStoreAddressOverrides: Record<string, string> = {
  "Central Mall Store": "Rua Augusta 275, Lisboa",
  "North Point Store": "Avenida da Boavista 412, Porto",
  "Riverside Store": "Largo do Toural 9, Guimaraes",
};

function getStoreAddressLabel(store: { name: string; address?: string | null }) {
  const normalizedAddress = store.address?.trim();

  if (!normalizedAddress) {
    return demoStoreAddressOverrides[store.name] ?? "Address not specified";
  }

  return demoStoreAddressOverrides[store.name] ?? normalizedAddress;
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatHeaderDate(value: Date) {
  return value.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
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
    creatingStore,
    creatingSeller,
    creatingProduct,
    pendingStoreIds,
    pendingSellerIds,
    pendingStoreProductIds,
    pendingProductIds,
    loadStores,
    loadStaff,
    loadInventory,
    loadProducts,
    loadSalesOverview,
    hydrateStartup,
    createStore,
    createSeller,
    updateStore,
    assignSeller,
    inventoryStores,
    products,
    archivedProducts,
    inventoryItems,
    inventoryHistory,
    salesFilters,
    salesStores,
    salesSellers,
    salesSummary,
    salesOverview,
    returnsOverview,
    updateStoreProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    archiveProduct,
    restoreProduct,
    adjustInventory,
  } = useAdminManagementStore();
  const hasPendingAdminInventoryMutation =
    creatingProduct ||
    Object.keys(pendingStoreProductIds).length > 0 ||
    Object.keys(pendingProductIds).length > 0;
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
  const [salesSummaryCache, setSalesSummaryCache] = useState<Partial<SalesPeriodSummaryMap>>(
    () => getCachedAdminStartup()?.sales.periodSummaries ?? {}
  );
  const [displayedSalesSummary, setDisplayedSalesSummary] = useState<SalesPeriodSummary | null>(
    () => getCachedAdminStartup()?.sales.periodSummaries?.today ?? null
  );
  const [salesCache, setSalesCache] = useState<Record<string, SalesLedgerSnapshot>>({});
  const [salesSoftRefreshing, setSalesSoftRefreshing] = useState(false);
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("stock");
  const [inventoryDetailMode, setInventoryDetailMode] = useState<InventoryDetailMode>("overview");
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productDetailMode, setProductDetailMode] = useState<ProductDetailMode>("overview");
  const [productCatalogMode, setProductCatalogMode] = useState<"catalog" | "archive">("catalog");
  const [inventoryView, setInventoryView] = useState<InventorySnapshot>(() => {
    const cachedStartup = getCachedAdminStartup();
    return {
      items: hasCompleteInventorySnapshots(cachedStartup) ? cachedStartup?.inventory.items ?? [] : [],
      history: hasCompleteInventorySnapshots(cachedStartup) ? cachedStartup?.inventory.history ?? [] : [],
    };
  });
  const [inventoryCache, setInventoryCache] = useState<Record<string, InventorySnapshot>>(() => {
    const cachedStartup = getCachedAdminStartup();
    return hasCompleteInventorySnapshots(cachedStartup) ? cachedStartup?.inventory.storeSnapshotsByStoreId ?? {} : {};
  });
  const [trustedInventoryStoreIds, setTrustedInventoryStoreIds] = useState<Record<string, boolean>>({});
  const [inventorySoftRefreshing, setInventorySoftRefreshing] = useState(false);
  const [inventoryMovementTypes, setInventoryMovementTypes] = useState<Record<string, InventoryMovementType>>({});
  const [teamMode, setTeamMode] = useState<TeamMode>("stores");
  const [selectedStaffSellerId, setSelectedStaffSellerId] = useState<string | null>(null);
  const [staffDetailMode, setStaffDetailMode] = useState<StaffDetailMode>("overview");
  const [staffActivityPage, setStaffActivityPage] = useState(0);
  const [staffCommissionDrafts, setStaffCommissionDrafts] = useState<Record<string, string>>({});
  const [selectedTeamStoreId, setSelectedTeamStoreId] = useState<string | null>(null);
  const [storeDetailMode, setStoreDetailMode] = useState<StoreDetailMode>("overview");
  const [storeActivityPage, setStoreActivityPage] = useState(0);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreAddress, setNewStoreAddress] = useState("");
  const [showNewStoreModal, setShowNewStoreModal] = useState(false);
  const [showNewSellerModal, setShowNewSellerModal] = useState(false);
  const [teamKeyboardField, setTeamKeyboardField] = useState<TeamVirtualKeyboardField>("storeName");
  const [teamKeyboardCapsLock, setTeamKeyboardCapsLock] = useState(false);
  const [newSeller, setNewSeller] = useState({
    fullName: "",
    telegramId: "",
    storeId: "",
    isActive: true,
  });
  const [newProduct, setNewProduct] = useState({
    name: "",
    sku: "",
    defaultPrice: "",
  });
  const [newProductIsActive, setNewProductIsActive] = useState(true);
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [productKeyboardField, setProductKeyboardField] = useState<ProductVirtualKeyboardField>("productName");
  const [productKeyboardCapsLock, setProductKeyboardCapsLock] = useState(false);
  const [showInventoryStoreSelector, setShowInventoryStoreSelector] = useState(false);
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
  const [productStoreEdits, setProductStoreEdits] = useState<
    Record<string, { price: string; isEnabled: boolean }>
  >({});
  const [showFullscreenHeaderContext, setShowFullscreenHeaderContext] = useState(() => isTelegramFullscreenLike());
  const supportsTelegramBackButton = canUseTelegramBackButton();
  const softRefreshInFlightRef = useRef(false);
  const inventorySelectionRefreshStoreIdRef = useRef<string | null>(null);
  const selectedStaffSeller = selectedStaffSellerId
    ? staff.find((seller) => seller.id === selectedStaffSellerId) ?? null
    : null;
  const selectedTeamStore = selectedTeamStoreId
    ? stores.find((store) => store.id === selectedTeamStoreId) ?? null
    : null;
  const headerContextLabel =
    activeTab === "overview"
      ? "Live dashboard"
      : activeTab === "sales"
        ? "Revenue and returns"
        : activeTab === "inventory"
          ? "Stock across stores"
          : activeTab === "team"
            ? selectedStaffSeller
              ? "Seller management"
              : selectedTeamStore
                ? "Store management"
                : "Stores and staff"
            : "Workspace settings";

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
      setInventoryDetailMode("overview");
      setSelectedProductId(null);
      setProductDetailMode("overview");
      setProductCatalogMode("catalog");
    }

    if (tab === "team") {
      setSelectedStaffSellerId(null);
      setStaffDetailMode("overview");
      setStaffActivityPage(0);
      setSelectedTeamStoreId(null);
      setStoreDetailMode("overview");
      setStoreActivityPage(0);
    }

    scrollToSectionTop();
  }, []);

  const handleAdminTabChange = useCallback((tab: AdminTab) => {
    setActiveTab(tab);
    scrollToSectionTop();
  }, []);

  const adminPageTitle =
    activeTab === "inventory" && selectedInventoryItemId
      ? "Product Details"
      : activeTab === "inventory" && selectedProductId
        ? "Product Details"
      : activeTab === "team" && selectedStaffSeller
        ? "Seller Details"
        : activeTab === "team" && selectedTeamStore
          ? "Store Details"
      : adminTabTitle[activeTab];

  const selectedInventoryHeaderItem = selectedInventoryItemId
    ? inventoryView.items.find((item) => item.storeProductId === selectedInventoryItemId) ?? null
    : null;
  const adminPageSubtitle =
    activeTab === "inventory" && selectedInventoryHeaderItem
      ? inventoryStores.find((store) => store.id === selectedInventoryStoreId)?.name ??
        selectedInventoryHeaderItem.storeName
      : activeTab === "inventory" && selectedProductId
        ? productCatalogMode === "archive"
          ? "Product archive"
          : "Product catalog"
      : null;

  useTelegramBackButton(
    activeTab === "sales"
      ? Boolean(selectedAdminSaleId || selectedAdminReturnId)
      : activeTab === "inventory"
        ? Boolean(selectedInventoryItemId || selectedProductId)
        : activeTab === "team"
          ? Boolean(selectedStaffSeller || selectedTeamStore)
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
        setInventoryDetailMode("overview");
        return;
      }

      if (activeTab === "inventory" && selectedProductId) {
        setSelectedProductId(null);
        setProductDetailMode("overview");
        return;
      }

      if (activeTab === "team" && selectedStaffSeller) {
        setSelectedStaffSellerId(null);
        setStaffDetailMode("overview");
        setStaffActivityPage(0);
        return;
      }

      if (activeTab === "team" && selectedTeamStore) {
        setSelectedTeamStoreId(null);
        setStoreDetailMode("overview");
        setStoreActivityPage(0);
      }
    }
  );

  useEffect(() => {
    const syncFullscreenState = () => setShowFullscreenHeaderContext(isTelegramFullscreenLike());

    syncFullscreenState();
    window.addEventListener("appfullscreenchange", syncFullscreenState);

    return () => {
      window.removeEventListener("appfullscreenchange", syncFullscreenState);
    };
  }, []);

  const refreshActiveAdminTab = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }

    if (softRefreshInFlightRef.current || hasPendingAdminInventoryMutation) {
      return;
    }

    softRefreshInFlightRef.current = true;

    try {
      if (activeTab === "overview") {
        await load({ silent: true });
        return;
      }

      if (activeTab === "sales") {
        setSalesSoftRefreshing(true);
        await loadSalesOverview(
          {
            storeId: salesStoreFilter || undefined,
            sellerId: salesSellerFilter || undefined,
            saleStatus: salesStatusFilter,
            dateFrom: new Date(`${salesDateFrom}T00:00:00`).toISOString(),
            dateTo: new Date(`${salesDateTo}T23:59:59`).toISOString(),
            limit: 20,
          },
          { silent: true }
        );
        return;
      }

      if (activeTab === "inventory" && selectedInventoryStoreId) {
        setInventorySoftRefreshing(true);
        await loadInventory(selectedInventoryStoreId, { silent: true });
      }
    } finally {
      setSalesSoftRefreshing(false);
      setInventorySoftRefreshing(false);
      softRefreshInFlightRef.current = false;
    }
  }, [
    activeTab,
    load,
    loadInventory,
    loadSalesOverview,
    hasPendingAdminInventoryMutation,
    salesDateFrom,
    salesDateTo,
    salesSellerFilter,
    salesStatusFilter,
    salesStoreFilter,
    selectedInventoryStoreId,
  ]);

  useEffect(() => {
    if (activeTab !== "overview" && activeTab !== "sales" && activeTab !== "inventory") {
      return;
    }

    const triggerRefresh = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      void refreshActiveAdminTab();
    };

    triggerRefresh();

    const intervalId = window.setInterval(triggerRefresh, ADMIN_SOFT_POLLING_INTERVAL_MS);
    window.addEventListener("focus", triggerRefresh);
    document.addEventListener("visibilitychange", triggerRefresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", triggerRefresh);
      document.removeEventListener("visibilitychange", triggerRefresh);
    };
  }, [activeTab, refreshActiveAdminTab]);

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

      const hydrateAdminStartup = (startup: AdminStartupResponse, source: "cache" | "network") => {
        hydrateDashboard(startup.dashboard);
        hydrateStartup(startup);
        setSalesSummaryCache(startup.sales.periodSummaries ?? {});
        if (startup.inventory.selectedStoreId) {
          setSelectedInventoryStoreId(startup.inventory.selectedStoreId);
          setInventoryView({
            items: startup.inventory.items,
            history: startup.inventory.history,
          });
          setInventoryCache(startup.inventory.storeSnapshotsByStoreId ?? {});
          setTrustedInventoryStoreIds(
            source === "network"
              ? Object.fromEntries(startup.inventory.stores.map((store) => [store.id, true]))
              : {}
          );
        }
      };

      const cachedStartup = readAdminStartupCache(token);
      if (cachedStartup) {
        hydrateAdminStartup(cachedStartup, "cache");
      }

      try {
        const startup = await apiGet<AdminStartupResponse>("/admin/startup", token);
        writeAdminStartupCache(token, startup);
        hydrateAdminStartup(startup, "network");
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
    setProductStoreEdits((current) => {
      const next = { ...current };

      for (const product of products) {
        for (const setting of product.storeSettings) {
          next[setting.storeProductId] ??= {
            price: setting.storePrice.toFixed(2),
            isEnabled: setting.isEnabled,
          };
        }
      }

      return next;
    });
  }, [products]);

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
    const matchedPeriod = getMatchingPresetSalesPeriod(salesFilters);

    if (!matchedPeriod) {
      return;
    }

    if (!salesSummary) {
      return;
    }

    setSalesSummaryCache((current) => ({
      ...current,
      [matchedPeriod]: salesSummary,
    }));
    setDisplayedSalesSummary(salesSummary);
  }, [salesFilters, salesSummary]);

  useEffect(() => {
    if (
      salesPeriod !== "custom" &&
      !salesStoreFilter &&
      !salesSellerFilter &&
      salesStatusFilter === "all"
    ) {
      const cachedSummary = salesSummaryCache[salesPeriod];
      if (cachedSummary) {
        setDisplayedSalesSummary(cachedSummary);
      }
      return;
    }

    setDisplayedSalesSummary(null);
  }, [salesPeriod, salesSellerFilter, salesStatusFilter, salesStoreFilter, salesSummaryCache]);

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

      for (const product of [...products, ...archivedProducts]) {
        next[product.id] ??= {
          name: product.name,
          sku: product.sku,
          defaultPrice: product.defaultPrice.toFixed(2),
          isActive: product.isActive,
        };
      }

      return next;
    });
  }, [archivedProducts, products]);

  useEffect(() => {
    if (productCatalogMode === "archive") {
      void loadProducts({ archived: true });
    }
  }, [loadProducts, productCatalogMode]);

  useEffect(() => {
    if (selectedInventoryStoreId) {
      const cachedSnapshot = inventoryCache[selectedInventoryStoreId];
      const currentSnapshotStoreId = inventoryItems[0]?.storeId ?? null;

      if (currentSnapshotStoreId === selectedInventoryStoreId) {
        setInventoryView({ items: inventoryItems, history: inventoryHistory });
        setInventorySoftRefreshing(false);
        return;
      }

      if (cachedSnapshot && trustedInventoryStoreIds[selectedInventoryStoreId]) {
        setInventoryView(cachedSnapshot);
        setSelectedInventoryItemId(null);
        if (inventorySelectionRefreshStoreIdRef.current !== selectedInventoryStoreId) {
          inventorySelectionRefreshStoreIdRef.current = selectedInventoryStoreId;
          void loadInventory(selectedInventoryStoreId, { silent: true }).finally(() => {
            if (inventorySelectionRefreshStoreIdRef.current === selectedInventoryStoreId) {
              setInventorySoftRefreshing(false);
            }
          });
        }
        return;
      }

      setInventorySoftRefreshing(true);
      setSelectedInventoryItemId(null);
      inventorySelectionRefreshStoreIdRef.current = selectedInventoryStoreId;
      void loadInventory(selectedInventoryStoreId).then(() => {
        setTrustedInventoryStoreIds((current) => ({ ...current, [selectedInventoryStoreId]: true }));
      }).finally(() => {
        if (inventorySelectionRefreshStoreIdRef.current === selectedInventoryStoreId) {
          setInventorySoftRefreshing(false);
        }
      });
    }
  }, [inventoryCache, inventoryHistory, inventoryItems, loadInventory, selectedInventoryStoreId, trustedInventoryStoreIds]);

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
    setNewStoreName("");
    setNewStoreAddress("");
    setShowNewStoreModal(false);
  };

  const handleCreateSeller = async () => {
    const fullName = newSeller.fullName.trim();
    const telegramId = Number(newSeller.telegramId.trim());

    if (!fullName || !Number.isFinite(telegramId) || telegramId <= 0) {
      return;
    }

    await createSeller({
      fullName,
      telegramId,
      storeId: newSeller.storeId || undefined,
      isActive: newSeller.isActive,
    });
    setNewSeller({
      fullName: "",
      telegramId: "",
      storeId: "",
      isActive: true,
    });
    setShowNewSellerModal(false);
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
  };

  const handleAssignSeller = async (sellerId: string) => {
    const storeId = staffAssignments[sellerId];

    if (!storeId) {
      return;
    }

    await assignSeller(sellerId, storeId);
  };

  const sortedProducts = useMemo(
    () =>
      [...products].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [products]
  );

  const handleSaveStoreProduct = async (storeProductId: string) => {
    const draft = inventoryEdits[storeProductId];

    if (!draft) {
      return;
    }

    const parsedPrice = parseDecimalInput(draft.price);

    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      window.alert("Enter a valid price. You can use either 12.50 or 12,50.");
      return;
    }

    await updateStoreProduct(storeProductId, {
      price: parsedPrice,
      isEnabled: draft.isEnabled,
    });
  };

  const handleCreateProduct = async () => {
    const parsedPrice = parseDecimalInput(newProduct.defaultPrice);

    if (!newProduct.name.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      window.alert("Enter product name and a valid price. You can use either 12.50 or 12,50.");
      return;
    }

    await createProduct({
      name: newProduct.name,
      sku: newProduct.sku.trim() || generateInternalProductCode(newProduct.name),
      defaultPrice: parsedPrice,
      isActive: newProductIsActive,
    });

    setNewProduct({ name: "", sku: "", defaultPrice: "" });
    setNewProductIsActive(true);
    setShowNewProductModal(false);
  };

  const handleSaveProduct = async (productId: string) => {
    const draft = productEdits[productId];
    const parsedPrice = parseDecimalInput(draft?.defaultPrice ?? "");

    if (!draft || !draft.name.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      window.alert("Enter product name and a valid price. You can use either 12.50 or 12,50.");
      return;
    }

    await updateProduct(productId, {
      name: draft.name,
      sku: draft.sku.trim() || generateInternalProductCode(draft.name),
      defaultPrice: parsedPrice,
      isActive: draft.isActive,
    });
  };

  const handleDeleteProduct = async (productId: string, productName: string) => {
    const confirmed = window.confirm(`Delete ${productName}? This is only possible if the product has no history.`);

    if (!confirmed) {
      return;
    }

    try {
      await deleteProduct(productId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete product";
      window.alert(message);
      return;
    }

    setSelectedProductId(null);
    setProductDetailMode("overview");
    setProductEdits((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  };

  const handleArchiveProduct = async (productId: string, productName: string) => {
    const confirmed = window.confirm(`Archive ${productName}? It will be removed from the active product catalog.`);

    if (!confirmed) {
      return;
    }

    try {
      await archiveProduct(productId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to archive product";
      window.alert(message);
      return;
    }

    setSelectedProductId(null);
    setProductDetailMode("overview");
    setProductCatalogMode("catalog");
  };

  const handleRestoreProduct = async (productId: string, productName: string) => {
    const confirmed = window.confirm(`Restore ${productName} back to the active product catalog?`);

    if (!confirmed) {
      return;
    }

    try {
      await restoreProduct(productId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to restore product";
      window.alert(message);
      return;
    }

    setSelectedProductId(null);
    setProductDetailMode("overview");
    setProductCatalogMode("catalog");
  };

  const handleSaveProductStoreSetting = async (storeProductId: string) => {
    const draft = productStoreEdits[storeProductId];

    if (!draft) {
      return;
    }

    const parsedPrice = parseDecimalInput(draft.price);

    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      window.alert("Enter a valid price. You can use either 12.50 or 12,50.");
      return;
    }

    await updateStoreProduct(storeProductId, {
      price: parsedPrice,
      isEnabled: draft.isEnabled,
    });
  };

  const handleInventoryAdjustment = async (
    storeProductId: string,
    movementType: "manual_adjustment" | "restock" | "writeoff"
  ) => {
    const item =
      inventoryView.items.find((entry) => entry.storeProductId === storeProductId) ??
      inventoryItems.find((entry) => entry.storeProductId === storeProductId);
    const draft =
      inventoryEdits[storeProductId] ??
      (item
        ? {
            price: item.storePrice.toFixed(2),
            isEnabled: item.isEnabled,
            adjustQuantity: "1",
            adjustReason: "",
          }
        : undefined);

    if (!item || !draft) {
      window.alert("Product details are not ready yet. Please reopen the product and try again.");
      return;
    }

    const parsedQuantity = Number(draft.adjustQuantity);

    if (
      Number.isNaN(parsedQuantity) ||
      (movementType === "manual_adjustment" ? parsedQuantity < 0 : parsedQuantity <= 0)
    ) {
      window.alert(
        movementType === "manual_adjustment"
          ? "Enter a stock quantity of 0 or more."
          : "Enter a quantity greater than 0."
      );
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
            : `Admin set stock to ${parsedQuantity}`),
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

    try {
      await loadSalesOverview(
        {
          storeId: nextStoreId || undefined,
          sellerId: nextSellerId || undefined,
          saleStatus: nextSaleStatus,
          dateFrom,
          dateTo,
          limit: 20,
        },
        { silent: true }
      );
    } finally {
      setSalesSoftRefreshing(false);
    }
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

    if (!salesStoreFilter && !salesSellerFilter && salesStatusFilter === "all") {
      const cachedSummary = salesSummaryCache[period];
      if (cachedSummary) {
        setDisplayedSalesSummary(cachedSummary);
      }
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
          <Box
            key={card.label}
            bg={panelSurface}
            borderRadius="22px"
            px={4}
            py={4}
            boxShadow={panelShadow}
            {...getLowStockCardProps(card.label === "Low Stock" && Boolean(data && data.summary.lowStockCount > 0))}
          >
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
                Today Revenue Flow
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
                  {formatDateTime(sale.createdAt)}
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
                    {store.address?.trim() || "Address not specified"}
                  </Text>
                  <Text fontSize="xs" color="surface.500">
                    {store.stockUnits} Units in stock
                  </Text>
                </VStack>
                <VStack align="end" spacing={0.5}>
                  <Text fontWeight="900">{formatEur(store.revenue)}</Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="700">
                    {store.salesCount} sales
                  </Text>
                </VStack>
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
          <VStack align="start" spacing={0}>
            <Text fontWeight="900" fontSize="lg">
              Store Directory
            </Text>
            <Text color="surface.500" fontSize="sm" fontWeight="700">
              Tap a store to manage profile, staff and activity.
            </Text>
          </VStack>

          {stores.map((store) => (
            <Box
              key={store.id}
              as="button"
              type="button"
              textAlign="left"
              bg={panelMutedSurface}
              borderRadius="18px"
              px={3}
              py={3}
              border={0}
              onClick={() => {
                setSelectedTeamStoreId(store.id);
                setStoreDetailMode("overview");
                setStoreActivityPage(0);
                scrollToSectionTop();
              }}
            >
              <HStack justify="space-between" align="center" gap={3}>
                <VStack align="start" spacing={0} minW={0}>
                  <Text fontWeight="900" noOfLines={1}>
                    {store.name}
                  </Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="700" noOfLines={1}>
                    {store.address || `Created ${formatShortDate(store.createdAt)}`}
                  </Text>
                </VStack>

                <Box flexShrink={0}>
                  <StatusPill
                    label={store.isActive ? "Active" : "Inactive"}
                    tone={store.isActive ? "green" : "red"}
                  />
                </Box>
              </HStack>
            </Box>
          ))}

          <Button
            w="full"
            h="52px"
            borderRadius="18px"
            bg="surface.900"
            color="white"
            _hover={{ bg: "surface.700" }}
            onClick={() => {
              setTeamKeyboardField("storeName");
              setTeamKeyboardCapsLock(false);
              setShowNewStoreModal(true);
            }}
          >
            New Store
          </Button>
        </VStack>
      </Box>

    </VStack>
  );

  const renderStoreDetail = (store: TeamStore) => {
    const draft = storeEdits[store.id] ?? {
      name: store.name,
      address: store.address ?? "",
      isActive: store.isActive,
    };
    const assignedStaff = staff.filter((seller) => seller.currentAssignment?.storeId === store.id);
    const activeStoreShifts = assignedStaff.filter((seller) => seller.activeShift?.storeId === store.id);
    const storeSales = salesOverview.filter((sale) => sale.store?.id === store.id);
    const storeReturns = returnsOverview.filter((entry) => entry.store?.id === store.id);
    const activityItems: Array<{
      id: string;
      title: string;
      meta: string;
      date: string;
      icon: IconType;
      iconLabel: string;
      iconBg: string;
      iconColor: string;
    }> = [
      ...storeSales.map((sale) => ({
        id: `sale-${sale.id}`,
        title: sale.status === "deleted" ? "Sale deleted" : "Sale completed",
        meta: `${sale.seller?.fullName ?? "Unknown seller"} · ${formatEur(sale.totalAmount)} · ${sale.paymentMethod.toUpperCase()}`,
        date: sale.createdAt,
        icon: LuReceiptText,
        iconLabel: sale.status === "deleted" ? "Deleted" : "Sale",
        iconBg: sale.status === "deleted" ? "rgba(248,113,113,0.14)" : "rgba(34,197,94,0.12)",
        iconColor: sale.status === "deleted" ? "red.500" : "green.600",
      })),
      ...storeReturns.map((entry) => ({
        id: `return-${entry.id}`,
        title: "Return created",
        meta: `${entry.seller?.fullName ?? "Unknown seller"} · ${formatEur(entry.totalAmount)}`,
        date: entry.createdAt,
        icon: LuActivity,
        iconLabel: "Return",
        iconBg: "rgba(251,191,36,0.18)",
        iconColor: "orange.500",
      })),
      ...activeStoreShifts.map((seller) => ({
        id: `shift-${seller.activeShift?.id ?? seller.id}`,
        title: seller.activeShift?.status === "paused" ? "Shift paused" : "Shift active",
        meta: `${seller.fullName} · started ${formatDateTime(seller.activeShift?.startedAt ?? null)}`,
        date: seller.activeShift?.startedAt ?? new Date().toISOString(),
        icon: LuClock3,
        iconLabel: "Shift",
        iconBg: seller.activeShift?.status === "paused" ? "rgba(251,191,36,0.18)" : "rgba(74,132,244,0.14)",
        iconColor: seller.activeShift?.status === "paused" ? "orange.500" : "brand.600",
      })),
    ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    const activityPageSize = 6;
    const activityTotalPages = Math.max(1, Math.ceil(activityItems.length / activityPageSize));
    const safeActivityPage = Math.min(storeActivityPage, activityTotalPages - 1);
    const visibleActivityItems = activityItems.slice(
      safeActivityPage * activityPageSize,
      safeActivityPage * activityPageSize + activityPageSize
    );

    return (
      <>
        <VStack spacing={4} align="stretch">
        <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
          <VStack align="stretch" spacing={4}>
            {!supportsTelegramBackButton ? (
              <HStack justify="flex-start">
                <Button
                  size="sm"
                  borderRadius="14px"
                  variant="outline"
                  borderColor="var(--app-border)"
                  onClick={() => {
                    setSelectedTeamStoreId(null);
                    setStoreDetailMode("overview");
                  }}
                >
                  Back
                </Button>
              </HStack>
            ) : null}

            <HStack justify="space-between" align="center">
              <VStack align="start" spacing={0} minW={0}>
                <Text fontWeight="900" fontSize="xl" noOfLines={1}>
                  {store.name}
                </Text>
                <Text fontSize="sm" color="surface.500" fontWeight="700" noOfLines={1}>
                  {store.address || "Address not specified"}
                </Text>
              </VStack>
              <StatusPill label={store.isActive ? "Active" : "Inactive"} tone={store.isActive ? "green" : "red"} />
            </HStack>
          </VStack>
        </Box>

        <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
          <HStack spacing={2} overflowX="auto" pb={1}>
            {(["overview", "profile", "staff", "activity"] as StoreDetailMode[]).map((mode) => {
              const isActive = storeDetailMode === mode;

              return (
                <Button
                  key={mode}
                  size="sm"
                  flexShrink={0}
                  minW="88px"
                  borderRadius="999px"
                  bg={isActive ? "surface.900" : "transparent"}
                  color={isActive ? "white" : "surface.500"}
                  _hover={{ bg: isActive ? "surface.900" : panelMutedSurface }}
                  onClick={() => setStoreDetailMode(mode)}
                >
                  {mode === "overview"
                    ? "Overview"
                    : mode === "profile"
                      ? "Profile"
                      : mode === "staff"
                        ? "Staff"
                        : "Activity"}
                </Button>
              );
            })}
          </HStack>
        </Box>

        {storeDetailMode === "overview" ? (
          <VStack spacing={4} align="stretch">
            <SimpleGrid columns={2} spacing={3}>
              {[
                { label: "Today Revenue", value: formatEur(store.revenueToday) },
                { label: "Sales Today", value: String(store.salesCount) },
                { label: "Stock Units", value: String(store.stockUnits) },
                { label: "Low Stock", value: String(store.lowStockCount) },
              ].map((card) => (
                <Box
                  key={card.label}
                  bg={panelSurface}
                  borderRadius="22px"
                  px={4}
                  py={4}
                  boxShadow={panelShadow}
                  {...getLowStockCardProps(card.label === "Low Stock" && store.lowStockCount > 0)}
                >
                  <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em">
                    {card.label}
                  </Text>
                  <Text mt={2} fontWeight="900" fontSize="2xl" noOfLines={1}>
                    {card.value}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>

            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <HStack justify="space-between">
                  <Text fontWeight="900" fontSize="lg">
                    Store Snapshot
                  </Text>
                  <Text color="surface.500" fontSize="sm" fontWeight="800">
                    {assignedStaff.length} sellers
                  </Text>
                </HStack>
                {[
                  { label: "Address", value: store.address || "Address not specified" },
                  { label: "Active Shifts", value: String(store.activeShiftCount) },
                  { label: "All-Time Revenue", value: formatEur(store.revenueAllTime) },
                  { label: "Created", value: formatShortDate(store.createdAt) },
                ].map((item) => (
                  <HStack key={item.label} justify="space-between" bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                    <Text color="surface.500" fontSize="sm" fontWeight="800">
                      {item.label}
                    </Text>
                    <Text fontWeight="900" textAlign="right" maxW="58%" noOfLines={2}>
                      {item.value}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            </Box>
          </VStack>
        ) : null}

        {storeDetailMode === "profile" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={4}>
              <VStack align="start" spacing={0}>
                <Text fontWeight="900" fontSize="lg">
                  Store Profile
                </Text>
                <Text color="surface.500" fontSize="sm" fontWeight="700">
                  Update public store name, address and availability.
                </Text>
              </VStack>

              <VStack align="stretch" spacing={2}>
                <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                  Store name
                </Text>
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    setStoreEdits((current) => ({
                      ...current,
                      [store.id]: { ...draft, name: event.target.value },
                    }))
                  }
                  placeholder="Store name"
                  borderRadius="16px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />
              </VStack>

              <VStack align="stretch" spacing={2}>
                <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                  Address
                </Text>
                <Input
                  value={draft.address}
                  onChange={(event) =>
                    setStoreEdits((current) => ({
                      ...current,
                      [store.id]: { ...draft, address: event.target.value },
                    }))
                  }
                  placeholder="Address or short location note"
                  borderRadius="16px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />
              </VStack>

              <SimpleGrid columns={2} spacing={2}>
                {[
                  { label: "Enabled", value: true },
                  { label: "Disabled", value: false },
                ].map((option) => {
                  const isActive = draft.isActive === option.value;

                  return (
                    <Button
                      key={option.label}
                      borderRadius="16px"
                      bg={isActive ? "brand.500" : panelMutedSurface}
                      color={isActive ? "white" : "surface.700"}
                      _hover={{ bg: isActive ? "brand.600" : "rgba(232,231,226,0.95)" }}
                      onClick={() =>
                        setStoreEdits((current) => ({
                          ...current,
                          [store.id]: { ...draft, isActive: option.value },
                        }))
                      }
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </SimpleGrid>

              <Button
                borderRadius="18px"
                bg="surface.900"
                color="white"
                _hover={{ bg: "surface.700" }}
                isLoading={Boolean(pendingStoreIds[store.id])}
                onClick={() => void handleSaveStore(store.id)}
              >
                Save Store
              </Button>
            </VStack>
          </Box>
        ) : null}

        {storeDetailMode === "staff" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between">
                <Text fontWeight="900" fontSize="lg">
                  Assigned Staff
                </Text>
                <Text color="surface.500" fontSize="sm" fontWeight="800">
                  {assignedStaff.length} sellers
                </Text>
              </HStack>

              {assignedStaff.length ? (
                assignedStaff.map((seller) => {
                  const status = getSellerStatus(seller);

                  return (
                    <Box
                      key={seller.id}
                      as="button"
                      type="button"
                      textAlign="left"
                      bg={panelMutedSurface}
                      borderRadius="18px"
                      px={3}
                      py={3}
                      border={0}
                      onClick={() => {
                        setSelectedStaffSellerId(seller.id);
                        setStaffDetailMode("overview");
                        setStaffActivityPage(0);
                        scrollToSectionTop();
                      }}
                    >
                      <HStack justify="space-between" align="center">
                        <HStack spacing={3} minW={0}>
                          <Avatar size="sm" name={seller.fullName} bg="surface.200" color="surface.800" />
                          <VStack align="start" spacing={0} minW={0}>
                            <Text fontWeight="900" noOfLines={1}>
                              {seller.fullName}
                            </Text>
                            <Text fontSize="sm" color="surface.500" fontWeight="700" noOfLines={1}>
                              {seller.salesCount} sales · {formatEur(seller.revenue)}
                            </Text>
                          </VStack>
                        </HStack>
                        <StatusPill label={status.label} tone={status.tone} />
                      </HStack>
                    </Box>
                  );
                })
              ) : (
                <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={4}>
                  <Text fontWeight="900">No assigned sellers</Text>
                  <Text color="surface.500" fontSize="sm" mt={1}>
                    Assign sellers from a staff profile when this store is ready.
                  </Text>
                </Box>
              )}
            </VStack>
          </Box>
        ) : null}

        {storeDetailMode === "activity" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between">
                <Text fontWeight="900" fontSize="lg">
                  Activity Feed
                </Text>
                <Text color="surface.500" fontSize="sm" fontWeight="800">
                  {activityItems.length} events
                </Text>
              </HStack>

              {visibleActivityItems.length ? (
                visibleActivityItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <HStack key={item.id} spacing={3} align="center" bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                      <Box
                        w="40px"
                        h="40px"
                        borderRadius="16px"
                        bg={item.iconBg}
                        color={item.iconColor}
                        display="grid"
                        placeItems="center"
                        flexShrink={0}
                      >
                        <Icon size={21} strokeWidth={2.5} />
                      </Box>
                      <VStack align="start" spacing={0} minW={0} flex="1">
                        <Text fontWeight="900" noOfLines={1}>
                          {item.title}
                        </Text>
                        <Text fontSize="sm" color="surface.500" fontWeight="700" noOfLines={1}>
                          {item.meta}
                        </Text>
                      </VStack>
                      <Text fontSize="xs" color="surface.500" fontWeight="800" flexShrink={0}>
                        {formatSalesTime(item.date)}
                      </Text>
                    </HStack>
                  );
                })
              ) : (
                <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={4}>
                  <Text fontWeight="900">No recent activity</Text>
                  <Text color="surface.500" fontSize="sm" mt={1}>
                    Sales, returns and active shift events will appear here.
                  </Text>
                </Box>
              )}

              {activityTotalPages > 1 ? (
                <HStack justify="space-between">
                  <Button
                    size="sm"
                    borderRadius="14px"
                    bg={panelMutedSurface}
                    color="surface.700"
                    isDisabled={safeActivityPage === 0}
                    onClick={() => setStoreActivityPage((page) => Math.max(0, page - 1))}
                  >
                    Previous
                  </Button>
                  <Text color="surface.500" fontSize="sm" fontWeight="800">
                    Page {safeActivityPage + 1} of {activityTotalPages}
                  </Text>
                  <Button
                    size="sm"
                    borderRadius="14px"
                    bg={panelMutedSurface}
                    color="surface.700"
                    isDisabled={safeActivityPage >= activityTotalPages - 1}
                    onClick={() => setStoreActivityPage((page) => Math.min(activityTotalPages - 1, page + 1))}
                  >
                    Next
                  </Button>
                </HStack>
              ) : null}
            </VStack>
          </Box>
        ) : null}
        </VStack>
      </>
    );
  };

  const renderInventory = () => {
    const trustedInventorySnapshot =
      selectedInventoryStoreId && trustedInventoryStoreIds[selectedInventoryStoreId]
        ? inventoryCache[selectedInventoryStoreId]
        : null;
    const activeInventorySnapshot = trustedInventorySnapshot ?? inventoryView;
    const visibleInventoryItems = [...activeInventorySnapshot.items].sort(compareInventoryItems);
    const visibleInventoryHistory = activeInventorySnapshot.history;
    const visibleProductCatalog = productCatalogMode === "archive" ? archivedProducts : products;
    const selectedStore = inventoryStores.find((store) => store.id === selectedInventoryStoreId) ?? null;
    const selectedItem = selectedInventoryItemId
      ? visibleInventoryItems.find((item) => item.storeProductId === selectedInventoryItemId) ?? null
      : null;
    const selectedProduct = selectedProductId
      ? visibleProductCatalog.find((product) => product.id === selectedProductId) ?? null
      : null;
    const totalUnits = visibleInventoryItems.reduce((total, item) => total + item.stockQuantity, 0);
    const lowStockCount = visibleInventoryItems.filter((item) => item.stockQuantity <= 10).length;
    const inventorySummaryCards = [
      { label: "Total Units", value: String(totalUnits) },
      { label: "Low Stock", value: String(lowStockCount) },
    ];
    const itemMovementHistory = selectedItem
      ? visibleInventoryHistory.filter((entry) => entry.product?.id === selectedItem.productId).slice(0, 6)
      : [];
    const getInventoryMovementUi = (movementType: string, quantityDelta: number) => {
      if (movementType === "sale") {
        return {
          title: "Sale",
          icon: LuReceiptText,
          iconBg: "rgba(74,132,244,0.14)",
          iconColor: "brand.600",
        };
      }

      if (movementType === "return") {
        return {
          title: "Return",
          icon: LuReceiptText,
          iconBg: "rgba(34,197,94,0.12)",
          iconColor: "green.600",
        };
      }

      if (movementType === "restock") {
        return {
          title: "Restock",
          icon: LuPlus,
          iconBg: "rgba(74,132,244,0.14)",
          iconColor: "brand.600",
        };
      }

      if (movementType === "writeoff") {
        return {
          title: "Write-off",
          icon: LuMinus,
          iconBg: "rgba(248,113,113,0.14)",
          iconColor: "red.500",
        };
      }

      if (movementType === "manual_adjustment") {
        return {
          title: "Set Stock",
          icon: quantityDelta >= 0 ? LuPlus : LuMinus,
          iconBg: quantityDelta >= 0 ? "rgba(34,197,94,0.12)" : "rgba(248,113,113,0.14)",
          iconColor: quantityDelta >= 0 ? "green.600" : "red.500",
        };
      }

      if (movementType === "sale_deletion") {
        return {
          title: "Sale Deleted",
          icon: LuMinus,
          iconBg: "rgba(248,113,113,0.14)",
          iconColor: "red.500",
        };
      }

      return {
        title: movementType
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase()),
        icon: LuActivity,
        iconBg: "rgba(148,163,184,0.16)",
        iconColor: "surface.600",
      };
    };

    if (inventoryMode === "products" && selectedProduct) {
      const draft = productEdits[selectedProduct.id] ?? {
        name: selectedProduct.name,
        sku: selectedProduct.sku,
        defaultPrice: selectedProduct.defaultPrice.toFixed(2),
        isActive: selectedProduct.isActive,
      };

      return (
        <VStack spacing={4} align="stretch">
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={4}>
              {!supportsTelegramBackButton ? (
                <HStack justify="flex-start">
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor="var(--app-border)"
                    onClick={() => {
                      setSelectedProductId(null);
                      setProductDetailMode("overview");
                    }}
                  >
                    Back
                  </Button>
                </HStack>
              ) : null}

              <HStack justify="space-between" align="center" gap={3}>
                <VStack align="start" spacing={0} minW={0}>
                  <Text fontWeight="900" fontSize="xl" noOfLines={2}>
                    {selectedProduct.name}
                  </Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="700" noOfLines={1}>
                    {selectedProduct.isArchived
                      ? `Archived ${selectedProduct.archivedAt ? formatShortDate(selectedProduct.archivedAt) : ""}`.trim()
                      : `${selectedProduct.enabledStoreCount} stores enabled`}
                  </Text>
                </VStack>
                <StatusPill
                  label={selectedProduct.isArchived ? "Archived" : selectedProduct.isActive ? "Active" : "Inactive"}
                  tone={selectedProduct.isArchived ? "orange" : selectedProduct.isActive ? "green" : "red"}
                />
              </HStack>
            </VStack>
          </Box>

          <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
            <HStack spacing={2}>
              {(["overview", "settings", "stores"] as ProductDetailMode[]).map((mode) => {
                const isActive = productDetailMode === mode;

                return (
                  <Button
                    key={mode}
                    flex="1"
                    size="sm"
                    borderRadius="999px"
                    bg={isActive ? "surface.900" : "transparent"}
                    color={isActive ? "white" : "surface.500"}
                    _hover={{ bg: isActive ? "surface.900" : panelMutedSurface }}
                    onClick={() => setProductDetailMode(mode)}
                  >
                    {mode === "overview" ? "Overview" : mode === "settings" ? "Settings" : "Stores"}
                  </Button>
                );
              })}
            </HStack>
          </Box>

          {productDetailMode === "overview" ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <SimpleGrid columns={2} spacing={3}>
                  {[
                    { label: "Default Price", value: formatEur(selectedProduct.defaultPrice) },
                    {
                      label: "Status",
                      value: selectedProduct.isArchived ? "Archived" : selectedProduct.isActive ? "Active" : "Inactive",
                    },
                    { label: "Stores Enabled", value: `${selectedProduct.enabledStoreCount}` },
                    {
                      label: selectedProduct.isArchived ? "Archived" : "Updated",
                      value: formatShortDate(selectedProduct.isArchived ? selectedProduct.archivedAt ?? selectedProduct.updatedAt : selectedProduct.updatedAt),
                    },
                  ].map((card) => (
                    <Box key={card.label} bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                      <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                        {card.label}
                      </Text>
                      <Text fontWeight="900" fontSize="xl" mt={1}>
                        {card.value}
                      </Text>
                    </Box>
                  ))}
                </SimpleGrid>
              </VStack>
            </Box>
          ) : null}

          {productDetailMode === "settings" ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <VStack align="stretch" spacing={2}>
                  <Text fontSize="10px" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                    Product name
                  </Text>
                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      setProductEdits((current) => ({
                        ...current,
                        [selectedProduct.id]: { ...draft, name: event.target.value },
                      }))
                    }
                    placeholder="Product name"
                    borderRadius="18px"
                    bg="white"
                    borderColor="rgba(226,224,218,0.95)"
                  />
                </VStack>

                <VStack align="stretch" spacing={2}>
                  <Text fontSize="10px" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                    Default price
                  </Text>
                  <Input
                    value={draft.defaultPrice}
                    onChange={(event) =>
                      setProductEdits((current) => ({
                        ...current,
                        [selectedProduct.id]: { ...draft, defaultPrice: event.target.value },
                      }))
                    }
                    placeholder="Default price"
                    inputMode="decimal"
                    borderRadius="18px"
                    bg="white"
                    borderColor="rgba(226,224,218,0.95)"
                  />
                </VStack>

                <SimpleGrid columns={2} spacing={2}>
                  <Button
                    borderRadius="16px"
                    bg={draft.isActive ? "brand.500" : "rgba(241,240,236,0.95)"}
                    color={draft.isActive ? "white" : "surface.800"}
                    _hover={{ bg: draft.isActive ? "brand.600" : "rgba(225,223,218,0.95)" }}
                    onClick={() =>
                      setProductEdits((current) => ({
                        ...current,
                        [selectedProduct.id]: { ...draft, isActive: true },
                      }))
                    }
                  >
                    Active
                  </Button>
                  <Button
                    borderRadius="16px"
                    bg={!draft.isActive ? "rgba(248,113,113,0.14)" : "rgba(241,240,236,0.95)"}
                    color={!draft.isActive ? "red.500" : "surface.800"}
                    _hover={{ bg: !draft.isActive ? "rgba(248,113,113,0.2)" : "rgba(225,223,218,0.95)" }}
                    onClick={() =>
                      setProductEdits((current) => ({
                        ...current,
                        [selectedProduct.id]: { ...draft, isActive: false },
                      }))
                    }
                  >
                    Inactive
                  </Button>
                </SimpleGrid>

                <Button
                  h="52px"
                  borderRadius="18px"
                  bg="surface.900"
                  color="white"
                  _hover={{ bg: "surface.700" }}
                  isLoading={Boolean(pendingProductIds[selectedProduct.id])}
                  onClick={() => void handleSaveProduct(selectedProduct.id)}
                >
                  Save Product
                </Button>

                {selectedProduct.isArchived ? (
                  <>
                    <Button
                      size="sm"
                      borderRadius="14px"
                      variant="ghost"
                      color="brand.600"
                      _hover={{ bg: "rgba(74,132,244,0.12)" }}
                      isLoading={Boolean(pendingProductIds[selectedProduct.id])}
                      onClick={() => void handleRestoreProduct(selectedProduct.id, selectedProduct.name)}
                    >
                      Restore Product
                    </Button>
                    <Button
                      size="sm"
                      borderRadius="14px"
                      variant="ghost"
                      color="red.500"
                      _hover={{ bg: "rgba(248,113,113,0.12)" }}
                      isLoading={Boolean(pendingProductIds[selectedProduct.id])}
                      onClick={() => void handleDeleteProduct(selectedProduct.id, selectedProduct.name)}
                    >
                      Delete Product
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      borderRadius="14px"
                      variant="ghost"
                      color="red.500"
                      _hover={{ bg: "rgba(248,113,113,0.12)" }}
                      isLoading={Boolean(pendingProductIds[selectedProduct.id])}
                      onClick={() => void handleDeleteProduct(selectedProduct.id, selectedProduct.name)}
                    >
                      Delete Product
                    </Button>
                    <Button
                      size="sm"
                      borderRadius="14px"
                      variant="ghost"
                      color="surface.700"
                      _hover={{ bg: "rgba(18,18,18,0.06)" }}
                      isLoading={Boolean(pendingProductIds[selectedProduct.id])}
                      onClick={() => void handleArchiveProduct(selectedProduct.id, selectedProduct.name)}
                    >
                      Archive Product
                    </Button>
                  </>
                )}
              </VStack>
            </Box>
          ) : null}

          {productDetailMode === "stores" ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <VStack align="start" spacing={0}>
                  <Text fontWeight="900" fontSize="lg">
                    Store Availability
                  </Text>
                  <Text color="surface.500" fontSize="sm" fontWeight="700">
                    Enable the product and set store-specific pricing.
                  </Text>
                </VStack>

                {selectedProduct.storeSettings.map((setting) => {
                  const storeDraft = productStoreEdits[setting.storeProductId] ?? {
                    price: setting.storePrice.toFixed(2),
                    isEnabled: setting.isEnabled,
                  };
                  const storeInfo = stores.find((store) => store.id === setting.storeId);

                  return (
                    <Box key={setting.storeProductId} bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                      <VStack align="stretch" spacing={3}>
                        <HStack justify="space-between" align="center" gap={3}>
                          <VStack align="start" spacing={0} minW={0}>
                            <Text fontWeight="900" noOfLines={1}>
                              {setting.storeName}
                            </Text>
                            <Text fontSize="sm" color="surface.500" fontWeight="700" noOfLines={1}>
                              {storeInfo?.address?.trim() || "Store location not specified"}
                            </Text>
                          </VStack>
                          <StatusPill label={storeDraft.isEnabled ? "Enabled" : "Disabled"} tone={storeDraft.isEnabled ? "green" : "red"} />
                        </HStack>

                        <VStack align="stretch" spacing={2}>
                          <Text fontSize="10px" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                            Store price
                          </Text>
                          <Input
                            value={storeDraft.price}
                            onChange={(event) =>
                              setProductStoreEdits((current) => ({
                                ...current,
                                [setting.storeProductId]: {
                                  ...storeDraft,
                                  price: event.target.value,
                                },
                              }))
                            }
                            placeholder="Store price"
                            inputMode="decimal"
                            borderRadius="16px"
                            bg="white"
                            borderColor="rgba(226,224,218,0.95)"
                          />
                        </VStack>

                        <SimpleGrid columns={2} spacing={2}>
                          <Button
                            borderRadius="16px"
                            bg={storeDraft.isEnabled ? "brand.500" : "rgba(241,240,236,0.95)"}
                            color={storeDraft.isEnabled ? "white" : "surface.800"}
                            _hover={{ bg: storeDraft.isEnabled ? "brand.600" : "rgba(225,223,218,0.95)" }}
                            onClick={() =>
                              setProductStoreEdits((current) => ({
                                ...current,
                                [setting.storeProductId]: { ...storeDraft, isEnabled: true },
                              }))
                            }
                          >
                            Enabled
                          </Button>
                          <Button
                            borderRadius="16px"
                            bg={!storeDraft.isEnabled ? "rgba(248,113,113,0.14)" : "rgba(241,240,236,0.95)"}
                            color={!storeDraft.isEnabled ? "red.500" : "surface.800"}
                            _hover={{ bg: !storeDraft.isEnabled ? "rgba(248,113,113,0.2)" : "rgba(225,223,218,0.95)" }}
                            onClick={() =>
                              setProductStoreEdits((current) => ({
                                ...current,
                                [setting.storeProductId]: { ...storeDraft, isEnabled: false },
                              }))
                            }
                          >
                            Disabled
                          </Button>
                        </SimpleGrid>

                        <Button
                          h="48px"
                          borderRadius="16px"
                          bg="surface.900"
                          color="white"
                          _hover={{ bg: "surface.700" }}
                          isLoading={Boolean(pendingStoreProductIds[setting.storeProductId])}
                          onClick={() => void handleSaveProductStoreSetting(setting.storeProductId)}
                        >
                          Save Store Settings
                        </Button>
                      </VStack>
                    </Box>
                  );
                })}
              </VStack>
            </Box>
          ) : null}
        </VStack>
      );
    }

    if (selectedItem) {
      const draft = inventoryEdits[selectedItem.storeProductId] ?? {
        price: selectedItem.storePrice.toFixed(2),
        isEnabled: selectedItem.isEnabled,
        adjustQuantity: "1",
        adjustReason: "",
      };
      const movementType = inventoryMovementTypes[selectedItem.storeProductId] ?? "restock";
      const isAbsoluteAdjust = movementType === "manual_adjustment";
      const movementQuantity = isAbsoluteAdjust
        ? Math.max(0, Number(draft.adjustQuantity) || 0)
        : Math.max(1, Number(draft.adjustQuantity) || 1);
      const movementLabel =
        movementType === "restock" ? "Restock" : movementType === "writeoff" ? "Write-off" : "Set Stock";
      const movementTone =
        movementType === "restock"
          ? { bg: "brand.500", hover: "brand.600", color: "white" }
          : movementType === "writeoff"
            ? { bg: "rgba(248,113,113,0.14)", hover: "rgba(248,113,113,0.22)", color: "red.500" }
            : { bg: "surface.900", hover: "surface.700", color: "white" };
      const isProductAvailable = draft.isEnabled && selectedItem.isProductActive;

      return (
        <VStack spacing={4} align="stretch">
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={4}>
              {!supportsTelegramBackButton ? (
                <HStack justify="flex-start">
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor="var(--app-border)"
                    onClick={() => {
                      setSelectedInventoryItemId(null);
                      setInventoryDetailMode("overview");
                    }}
                  >
                    Back
                  </Button>
                </HStack>
              ) : null}

              <HStack justify="space-between" align="center" gap={3}>
                <VStack align="start" spacing={0} minW={0}>
                  <Text fontWeight="900" fontSize="xl" noOfLines={2}>
                    {selectedItem.productName}
                  </Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="700" noOfLines={1}>
                    {selectedStore?.name ?? selectedItem.storeName}
                  </Text>
                </VStack>
                <VStack align="end" spacing={1} flexShrink={0}>
                  <StatusPill
                    label={`${selectedItem.stockQuantity} units`}
                    tone={selectedItem.stockQuantity <= 10 ? "orange" : "blue"}
                  />
                  <StatusPill label={isProductAvailable ? "Active" : "Inactive"} tone={isProductAvailable ? "green" : "red"} />
                </VStack>
              </HStack>
            </VStack>
          </Box>

          <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
            <HStack spacing={2}>
              {(["overview", "settings", "stock"] as InventoryDetailMode[]).map((mode) => {
                const isActive = inventoryDetailMode === mode;

                return (
                  <Button
                    key={mode}
                    flex="1"
                    size="sm"
                    borderRadius="999px"
                    bg={isActive ? "surface.900" : "transparent"}
                    color={isActive ? "white" : "surface.500"}
                    _hover={{ bg: isActive ? "surface.900" : panelMutedSurface }}
                    onClick={() => setInventoryDetailMode(mode)}
                  >
                    {mode === "overview" ? "Overview" : mode === "settings" ? "Settings" : "Stock"}
                  </Button>
                );
              })}
            </HStack>
          </Box>

          {inventoryDetailMode === "overview" ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <HStack justify="space-between">
                  <Text fontWeight="900" fontSize="lg">
                    Product Overview
                  </Text>
                  <Text color="surface.500" fontWeight="800" fontSize="sm">
                    Updated {formatShortDate(selectedItem.updatedAt)}
                  </Text>
                </HStack>

                <SimpleGrid columns={2} spacing={3}>
                  {[
                    { label: "Store Price", value: formatEur(selectedItem.storePrice) },
                    { label: "Default Price", value: formatEur(selectedItem.defaultPrice) },
                    { label: "Current Stock", value: `${selectedItem.stockQuantity}` },
                    { label: "Status", value: isProductAvailable ? "Active" : "Inactive" },
                  ].map((card) => (
                    <Box key={card.label} bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                      <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                        {card.label}
                      </Text>
                      <Text fontWeight="900" fontSize="xl" mt={1}>
                        {card.value}
                      </Text>
                    </Box>
                  ))}
                </SimpleGrid>

                <VStack align="stretch" spacing={0}>
                  <HStack justify="space-between" pb={2}>
                    <Text fontWeight="900" fontSize="lg">
                      Recent Movements
                    </Text>
                    <Text color="surface.500" fontWeight="800" fontSize="sm">
                      {itemMovementHistory.length} latest
                    </Text>
                  </HStack>

                  {itemMovementHistory.length ? (
                    itemMovementHistory.map((entry, index) => {
                      const movementUi = getInventoryMovementUi(entry.movementType, entry.quantityDelta);
                      const movementMeta =
                        entry.movementType === "sale" || entry.movementType === "return"
                          ? null
                          : entry.reason?.trim() || null;

                      return (
                        <HStack
                          key={entry.id}
                          justify="space-between"
                          align="start"
                          py={3}
                          borderTop={index === 0 ? "1px solid" : "1px solid"}
                          borderColor="rgba(226,224,218,0.82)"
                        >
                          <VStack align="start" spacing={0} minW={0} flex="1">
                            <Text fontWeight="900" noOfLines={1}>
                              {movementUi.title}
                            </Text>
                            {movementMeta ? (
                              <Text fontSize="sm" color="surface.500" fontWeight="700" noOfLines={1}>
                                {movementMeta}
                              </Text>
                            ) : null}
                            <Text fontSize="xs" color="surface.500" fontWeight="700" noOfLines={1}>
                              {formatDateTime(entry.createdAt)} · {entry.actor?.full_name ?? "Unknown actor"}
                            </Text>
                          </VStack>
                          <VStack align="end" spacing={0} flexShrink={0}>
                            <Text fontWeight="900" color={entry.quantityDelta >= 0 ? "green.500" : "red.400"}>
                              {entry.quantityDelta >= 0 ? "+" : ""}
                              {entry.quantityDelta}
                            </Text>
                            <Text fontSize="10px" color="surface.500" fontWeight="800" textTransform="uppercase">
                              Units
                            </Text>
                          </VStack>
                        </HStack>
                      );
                    })
                  ) : (
                    <Text color="surface.500" fontSize="sm" py={2}>
                      No recent product movements yet.
                    </Text>
                  )}
                </VStack>
              </VStack>
            </Box>
          ) : null}

          {inventoryDetailMode === "settings" ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <VStack align="start" spacing={0}>
                  <Text fontWeight="900" fontSize="lg">
                    Price & Availability
                  </Text>
                  <Text color="surface.500" fontSize="sm" fontWeight="700">
                    Store-specific price and product visibility.
                  </Text>
                </VStack>

                <VStack align="stretch" spacing={2}>
                  <Text fontSize="10px" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                    Store price
                  </Text>
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
                </VStack>

                <SimpleGrid columns={2} spacing={2}>
                  <Button
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
                </SimpleGrid>

                <Button
                  h="52px"
                  borderRadius="18px"
                  bg="surface.900"
                  color="white"
                  _hover={{ bg: "surface.700" }}
                  isLoading={Boolean(pendingStoreProductIds[selectedItem.storeProductId])}
                  onClick={() => void handleSaveStoreProduct(selectedItem.storeProductId)}
                >
                  Save Price & Status
                </Button>
              </VStack>
            </Box>
          ) : null}

          {inventoryDetailMode === "stock" ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <VStack align="start" spacing={0}>
                  <Text fontWeight="900" fontSize="lg">
                    Stock Movement
                  </Text>
                  <Text color="surface.500" fontSize="sm" fontWeight="700">
                    Restock, write off or set a manual balance.
                  </Text>
                </VStack>

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
                        onClick={() => {
                          if (type === "manual_adjustment") {
                            setInventoryEdits((current) => ({
                              ...current,
                              [selectedItem.storeProductId]: {
                                ...draft,
                                adjustQuantity: String(selectedItem.stockQuantity),
                              },
                            }));
                          }

                          setInventoryMovementTypes((current) => ({
                            ...current,
                            [selectedItem.storeProductId]: type,
                          }));
                        }}
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
                          adjustQuantity: String(Math.max(isAbsoluteAdjust ? 0 : 1, movementQuantity - 1)),
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
                  h="52px"
                  borderRadius="18px"
                  bg={movementTone.bg}
                  color={movementTone.color}
                  _hover={{ bg: movementTone.hover }}
                  isLoading={Boolean(pendingStoreProductIds[selectedItem.storeProductId])}
                  onClick={() => void handleInventoryAdjustment(selectedItem.storeProductId, movementType)}
                >
                  {movementLabel} {movementQuantity} Units
                </Button>
              </VStack>
            </Box>
          ) : null}
        </VStack>
      );
    }

    return (
      <>
        <VStack spacing={4} align="stretch">
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
                  {mode === "stock" ? "Stock" : "Products"}
                </Button>
              );
            })}
          </HStack>
        </Box>

        {inventoryMode === "stock" ? (
          <SimpleGrid columns={2} spacing={3}>
            {inventorySummaryCards.map((card) => (
              <Box
                key={card.label}
                bg={panelSurface}
                borderRadius="22px"
                px={4}
                py={4}
                boxShadow={panelShadow}
                {...getLowStockCardProps(card.label === "Low Stock" && lowStockCount > 0)}
              >
                <Text fontSize="xs" textTransform="uppercase" color="surface.500" letterSpacing="0.08em">
                  {card.label}
                </Text>
                <Text fontSize="2xl" fontWeight="900" mt={2}>
                  {card.value}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
        ) : null}

        {inventoryMode === "stock" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={3}>
              <Button
                h="76px"
                px={4}
                borderRadius="22px"
                bg={panelMutedSurface}
                color="surface.900"
                justifyContent="space-between"
                _hover={{ bg: "rgba(232,231,226,0.96)" }}
                onClick={() => setShowInventoryStoreSelector(true)}
              >
                <VStack align="start" spacing={0} minW={0}>
                  <Text fontWeight="900" fontSize="lg" noOfLines={1}>
                    {selectedStore?.name ?? "Select store"}
                  </Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="700">
                    {visibleInventoryItems.length} products in this store
                  </Text>
                </VStack>
                <Box color="surface.500" flexShrink={0}>
                  <LuChevronDown size={20} />
                </Box>
              </Button>
            </VStack>
          </Box>
        ) : null}

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
                  onClick={() => {
                    setSelectedInventoryItemId(item.storeProductId);
                    setInventoryDetailMode("overview");
                    scrollToSectionTop();
                  }}
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
                    <VStack align="center" justify="center" spacing={0} minW="56px" flexShrink={0} alignSelf="stretch">
                      <Text fontWeight="900" fontSize="2xl" lineHeight="1">
                        {item.stockQuantity}
                      </Text>
                      <Text fontSize="10px" color="surface.500" fontWeight="800" textTransform="uppercase" letterSpacing="0.08em">
                        Units
                      </Text>
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
                <HStack justify="space-between">
                  <Text fontWeight="900" fontSize="lg">
                    {productCatalogMode === "archive" ? "Product Archive" : "Product Catalog"}
                  </Text>
                  <Text color="surface.500" fontWeight="700" fontSize="sm">
                    {visibleProductCatalog.length} items
                  </Text>
                </HStack>

                {(productCatalogMode === "archive" ? visibleProductCatalog : sortedProducts).map((product) => {
                  return (
                    <Box
                      key={product.id}
                      as="button"
                      type="button"
                      textAlign="left"
                      bg={panelMutedSurface}
                      borderRadius="18px"
                      px={3}
                      py={3}
                      onClick={() => {
                        setSelectedProductId(product.id);
                        setProductDetailMode("overview");
                        scrollToSectionTop();
                      }}
                    >
                      <HStack justify="space-between" align="center" gap={3}>
                        <VStack align="start" spacing={0} minW={0}>
                          <Text fontWeight="900" noOfLines={1}>
                            {product.name}
                          </Text>
                          <Text fontSize="sm" color="surface.500" fontWeight="700" noOfLines={1}>
                            Default {formatEur(product.defaultPrice)}
                          </Text>
                          <Text fontSize="xs" color="surface.500" fontWeight="700" noOfLines={1}>
                            {productCatalogMode === "archive"
                              ? `Archived ${product.archivedAt ? formatShortDate(product.archivedAt) : ""}`.trim()
                              : `${product.enabledStoreCount} stores enabled`}
                          </Text>
                        </VStack>
                        <StatusPill
                          label={productCatalogMode === "archive" ? "Archived" : product.isActive ? "Active" : "Inactive"}
                          tone={productCatalogMode === "archive" ? "orange" : product.isActive ? "green" : "red"}
                        />
                      </HStack>
                    </Box>
                  );
                })}

                {visibleProductCatalog.length === 0 ? (
                  <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={4}>
                    <Text fontWeight="900">
                      {productCatalogMode === "archive" ? "Archive is empty" : "No products yet"}
                    </Text>
                    <Text color="surface.500" fontSize="sm" mt={1}>
                      {productCatalogMode === "archive"
                        ? "Archived products will appear here and can be restored anytime."
                        : "Create your first product to start filling the catalog."}
                    </Text>
                  </Box>
                ) : null}

                {productCatalogMode === "archive" ? (
                  <Button
                    w="full"
                    h="52px"
                    borderRadius="18px"
                    bg={panelMutedSurface}
                    color="surface.900"
                    _hover={{ bg: "rgba(232,231,226,0.96)" }}
                    onClick={() => {
                      setSelectedProductId(null);
                      setProductDetailMode("overview");
                      setProductCatalogMode("catalog");
                    }}
                  >
                    Back to Products
                  </Button>
                ) : (
                  <>
                    <Button
                      w="full"
                      h="52px"
                      borderRadius="18px"
                      bg="surface.900"
                      color="white"
                      _hover={{ bg: "surface.700" }}
                      onClick={() => {
                        setProductKeyboardField("productName");
                        setProductKeyboardCapsLock(false);
                        setShowNewProductModal(true);
                      }}
                    >
                      New Product
                    </Button>
                    <Button
                      w="full"
                      h="48px"
                      borderRadius="18px"
                      bg={panelMutedSurface}
                      color="surface.900"
                      _hover={{ bg: "rgba(232,231,226,0.96)" }}
                      onClick={() => {
                        setSelectedProductId(null);
                        setProductDetailMode("overview");
                        setProductCatalogMode("archive");
                      }}
                    >
                      Product Archive
                    </Button>
                  </>
                )}
              </VStack>
            </Box>
          </VStack>
        )}
        </VStack>
        {renderProductCreationModal()}
        {renderInventoryStoreSelector()}
      </>
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
    const computedSalesSummary: SalesPeriodSummary = {
      revenue: salesTotal,
      salesCount: visibleSales.length,
      cashTotal,
      cardTotal,
      returnsTotal,
      returnsCount: visibleReturns.length,
      returnedUnits,
      averageReturn: returnsTotal / Math.max(visibleReturns.length, 1),
    };
    const activeSalesSummary =
      salesPeriod !== "custom" &&
      !salesStoreFilter &&
      !salesSellerFilter &&
      salesStatusFilter === "all"
        ? displayedSalesSummary ?? salesSummaryCache[salesPeriod] ?? computedSalesSummary
        : computedSalesSummary;
    const salesSummaryCards = salesLedgerMode === "sales"
      ? [
          { label: "Revenue", value: formatEur(activeSalesSummary.revenue) },
          { label: "Sales", value: String(activeSalesSummary.salesCount) },
          { label: "Cash", value: formatEur(activeSalesSummary.cashTotal) },
          { label: "Card", value: formatEur(activeSalesSummary.cardTotal) },
        ]
      : [
          { label: "Returned", value: formatEur(activeSalesSummary.returnsTotal) },
          { label: "Returns", value: String(activeSalesSummary.returnsCount) },
          { label: "Units", value: String(activeSalesSummary.returnedUnits) },
          { label: "Avg Return", value: formatEur(activeSalesSummary.averageReturn) },
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

  const getSellerStatus = (seller: StaffSeller) => {
    if (!seller.isActive) {
      return { label: "Inactive", tone: "red" as const };
    }

    if (seller.activeShift?.status === "paused") {
      return { label: "Paused", tone: "orange" as const };
    }

    if (seller.activeShift) {
      return { label: "Online", tone: "blue" as const };
    }

    return { label: "Offline", tone: "gray" as const };
  };

  const renderStaffSection = () => (
    <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
      <VStack align="stretch" spacing={3}>
        <VStack align="start" spacing={0}>
          <Text fontWeight="900" fontSize="lg">
            Staff Directory
          </Text>
          <Text color="surface.500" fontSize="sm" fontWeight="700">
            Tap a seller to manage profile, schedule and activity.
          </Text>
        </VStack>

        {staff.map((seller) => {
          const status = getSellerStatus(seller);

          return (
            <Box
              key={seller.id}
              as="button"
              type="button"
              textAlign="left"
              bg={panelMutedSurface}
              borderRadius="18px"
              px={3}
              py={3}
              border={0}
              onClick={() => {
                setSelectedStaffSellerId(seller.id);
                setStaffDetailMode("overview");
                setStaffActivityPage(0);
                scrollToSectionTop();
              }}
            >
              <HStack justify="space-between" align="center" gap={3}>
                <VStack align="start" spacing={0} minW={0}>
                  <Text fontWeight="900" noOfLines={1}>
                    {seller.fullName}
                  </Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="700" noOfLines={1}>
                    {seller.currentAssignment?.storeName ?? "Unassigned"}
                  </Text>
                </VStack>

                <Box flexShrink={0}>
                  <StatusPill label={status.label} tone={status.tone} />
                </Box>
              </HStack>
            </Box>
          );
        })}

        <Button
          w="full"
          h="52px"
          borderRadius="18px"
          bg="surface.900"
          color="white"
          _hover={{ bg: "surface.700" }}
          onClick={() => {
            setTeamKeyboardField("sellerName");
            setTeamKeyboardCapsLock(false);
            setShowNewSellerModal(true);
          }}
        >
          New Seller
        </Button>
      </VStack>
    </Box>
  );

  const renderSellerDetail = (seller: StaffSeller) => {
    const status = getSellerStatus(seller);
    const sellerSales = salesOverview.filter((sale) => sale.seller?.id === seller.id);
    const sellerReturns = returnsOverview.filter((entry) => entry.seller?.id === seller.id);
    const sellerStockActivity = inventoryHistory.filter((entry) => entry.actor?.id === seller.id);
    const activeShiftStartedAt = seller.activeShift?.startedAt ? new Date(seller.activeShift.startedAt).getTime() : null;
    const activeShiftMinutes = activeShiftStartedAt
      ? Math.max(0, Math.floor((Date.now() - activeShiftStartedAt) / 60000))
      : 0;
    const activityItems: Array<{
      id: string;
      title: string;
      meta: string;
      date: string;
      icon: IconType;
      iconLabel: string;
      iconBg: string;
      iconColor: string;
    }> = [
      ...sellerSales.map((sale) => ({
        id: `sale-${sale.id}`,
        title: sale.status === "deleted" ? "Sale deleted" : "Sale completed",
        meta: `${sale.store?.name ?? "Unknown store"} · ${formatEur(sale.totalAmount)} · ${sale.paymentMethod.toUpperCase()}`,
        date: sale.createdAt,
        icon: LuReceiptText,
        iconLabel: sale.status === "deleted" ? "Deleted" : "Sale",
        iconBg: sale.status === "deleted" ? "rgba(248,113,113,0.14)" : "rgba(34,197,94,0.12)",
        iconColor: sale.status === "deleted" ? "red.500" : "green.600",
      })),
      ...sellerReturns.map((entry) => ({
        id: `return-${entry.id}`,
        title: "Return created",
        meta: `${entry.store?.name ?? "Unknown store"} · ${formatEur(entry.totalAmount)}`,
        date: entry.createdAt,
        icon: LuActivity,
        iconLabel: "Return",
        iconBg: "rgba(251,191,36,0.18)",
        iconColor: "orange.500",
      })),
      ...sellerStockActivity.map((entry) => ({
        id: `stock-${entry.id}`,
        title:
          entry.movementType === "restock"
            ? "Stock restocked"
            : entry.movementType === "writeoff"
              ? "Stock written off"
              : "Stock adjusted",
        meta: `${entry.product?.name ?? "Unknown product"} · ${entry.quantityDelta > 0 ? "+" : ""}${entry.quantityDelta} units`,
        date: entry.createdAt,
        icon: entry.quantityDelta < 0 ? LuMinus : LuPlus,
        iconLabel: entry.quantityDelta < 0 ? "Write-off" : "Restock",
        iconBg: entry.quantityDelta < 0 ? "rgba(248,113,113,0.14)" : "rgba(74,132,244,0.14)",
        iconColor: entry.quantityDelta < 0 ? "red.500" : "brand.600",
      })),
      ...(seller.activeShift
        ? [
            {
              id: `shift-${seller.activeShift.id}`,
              title: seller.activeShift.status === "paused" ? "Shift paused" : "Shift active",
              meta: `${seller.activeShift.storeName} · started ${formatDateTime(seller.activeShift.startedAt)}`,
              date: seller.activeShift.startedAt,
              icon: LuClock3,
              iconLabel: "Shift",
              iconBg: seller.activeShift.status === "paused" ? "rgba(251,191,36,0.18)" : "rgba(74,132,244,0.14)",
              iconColor: seller.activeShift.status === "paused" ? "orange.500" : "brand.600",
            },
          ]
        : []),
    ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    const activityPageSize = 6;
    const activityTotalPages = Math.max(1, Math.ceil(activityItems.length / activityPageSize));
    const safeActivityPage = Math.min(staffActivityPage, activityTotalPages - 1);
    const visibleActivityItems = activityItems.slice(
      safeActivityPage * activityPageSize,
      safeActivityPage * activityPageSize + activityPageSize
    );
    const commissionDraft = staffCommissionDrafts[seller.id] ?? "0";

    return (
      <VStack spacing={4} align="stretch">
        <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
          <VStack align="stretch" spacing={4}>
            {!supportsTelegramBackButton ? (
              <HStack justify="flex-start">
                <Button
                  size="sm"
                  borderRadius="14px"
                  variant="outline"
                  borderColor="var(--app-border)"
                  onClick={() => {
                    setSelectedStaffSellerId(null);
                    setStaffDetailMode("overview");
                  }}
                >
                  Back
                </Button>
              </HStack>
            ) : null}

            <HStack justify="space-between" align="center">
              <HStack spacing={3} minW={0}>
                <Avatar size="md" name={seller.fullName} bg="surface.200" color="surface.800" />
                <VStack align="start" spacing={0} minW={0}>
                  <Text fontWeight="900" fontSize="xl" noOfLines={1}>
                    {seller.fullName}
                  </Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="700" noOfLines={1}>
                    {seller.currentAssignment?.storeName ?? "Unassigned"}
                  </Text>
                </VStack>
              </HStack>
              <StatusPill label={status.label} tone={status.tone} />
            </HStack>

          </VStack>
        </Box>

        <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
          <HStack spacing={2} overflowX="auto" pb={1}>
            {(["overview", "profile", "worklog", "activity"] as StaffDetailMode[]).map((mode) => {
              const isActive = staffDetailMode === mode;

              return (
                <Button
                  key={mode}
                  size="sm"
                  flexShrink={0}
                  minW="88px"
                  borderRadius="999px"
                  bg={isActive ? "surface.900" : "transparent"}
                  color={isActive ? "white" : "surface.500"}
                  _hover={{ bg: isActive ? "surface.900" : panelMutedSurface }}
                  onClick={() => setStaffDetailMode(mode)}
                >
                  {mode === "overview"
                    ? "Overview"
                    : mode === "profile"
                      ? "Profile"
                      : mode === "worklog"
                        ? "Worklog"
                        : "Activity"}
                </Button>
              );
            })}
          </HStack>
        </Box>

        {staffDetailMode === "overview" ? (
          <VStack spacing={4} align="stretch">
            <SimpleGrid columns={2} spacing={3}>
              {[
                { label: "Revenue", value: formatEur(seller.revenue) },
                { label: "Sales", value: String(seller.salesCount) },
                { label: "Commission", value: "0%" },
                { label: "Last Sale", value: seller.lastSaleAt ? formatDateTime(seller.lastSaleAt) : "No activity" },
              ].map((card) => (
                <Box key={card.label} bg={panelSurface} borderRadius="22px" px={4} py={4} boxShadow={panelShadow}>
                  <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em">
                    {card.label}
                  </Text>
                  <Text mt={2} fontWeight="900" fontSize={card.label === "Last Sale" ? "sm" : "2xl"} noOfLines={2}>
                    {card.value}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>

            {seller.activeShift ? (
              <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
                <VStack align="stretch" spacing={3}>
                  <HStack justify="space-between">
                    <Text fontWeight="900" fontSize="lg">
                      Current Shift
                    </Text>
                    <StatusPill label={seller.activeShift.status} tone={seller.activeShift.status === "paused" ? "orange" : "blue"} />
                  </HStack>
                  <Box bg="rgba(255,255,255,0.54)" borderRadius="20px" overflow="hidden">
                    <VStack align="stretch" spacing={0}>
                      {[
                        { label: "Started", value: formatSalesTime(seller.activeShift.startedAt) },
                        { label: "Time Open", value: `${Math.floor(activeShiftMinutes / 60)}h ${activeShiftMinutes % 60}m` },
                        { label: "Store", value: seller.activeShift.storeName },
                      ].map((row, index, rows) => (
                        <HStack
                          key={row.label}
                          justify="space-between"
                          px={1}
                          py={3}
                          borderBottom={index === rows.length - 1 ? 0 : "1px solid"}
                          borderColor="rgba(226,224,218,0.82)"
                        >
                          <Text color="surface.500" fontWeight="800" fontSize="sm">
                            {row.label}
                          </Text>
                          <Text fontWeight="900" textAlign="right">
                            {row.value}
                          </Text>
                        </HStack>
                      ))}
                    </VStack>
                  </Box>
                </VStack>
              </Box>
            ) : null}

            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <HStack justify="space-between">
                  <Text fontWeight="900" fontSize="lg">
                    Recent Seller Sales
                  </Text>
                  <Text color="surface.500" fontWeight="700" fontSize="sm">
                    {sellerSales.length} loaded
                  </Text>
                </HStack>
                {sellerSales.length > 0 ? (
                  <Box bg="rgba(255,255,255,0.54)" borderRadius="20px" overflow="hidden">
                    <VStack align="stretch" spacing={0}>
                      {sellerSales.slice(0, 5).map((sale, index, rows) => (
                        <Box
                          key={sale.id}
                          as="button"
                          type="button"
                          textAlign="left"
                          border={0}
                          bg="transparent"
                          px={1}
                          py={3}
                          borderBottom={index === rows.length - 1 ? 0 : "1px solid"}
                          borderColor="rgba(226,224,218,0.82)"
                          onClick={() => {
                            setSelectedAdminSaleId(sale.id);
                            setActiveTab("sales");
                            scrollToSectionTop();
                          }}
                        >
                          <HStack justify="space-between" align="start">
                            <VStack align="start" spacing={0}>
                              <Text fontWeight="900">{sale.store?.name ?? "Unknown store"}</Text>
                              <Text fontSize="xs" color="surface.500">
                                {formatDateTime(sale.createdAt)} · {sale.paymentMethod.toUpperCase()}
                              </Text>
                            </VStack>
                            <VStack align="end" spacing={0}>
                              <Text fontWeight="900">{formatEur(sale.totalAmount)}</Text>
                              <Text fontSize="xs" color="brand.500" fontWeight="800">
                                Open receipt
                              </Text>
                            </VStack>
                          </HStack>
                        </Box>
                      ))}
                    </VStack>
                  </Box>
                ) : null}
                {sellerSales.length === 0 ? (
                  <Text color="surface.500" fontSize="sm">
                    No seller sales are loaded in the current admin sales snapshot.
                  </Text>
                ) : null}
              </VStack>
            </Box>
          </VStack>
        ) : null}

        {staffDetailMode === "profile" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between" align="center">
                <Text fontWeight="900" fontSize="lg">
                  Profile
                </Text>
                <StatusPill label={seller.isActive ? "Active" : "Inactive"} tone={seller.isActive ? "green" : "red"} />
              </HStack>
              <Box bg="rgba(255,255,255,0.54)" borderRadius="20px" overflow="hidden">
                <VStack align="stretch" spacing={0}>
                  <HStack justify="space-between" px={1} py={3} borderBottom="1px solid" borderColor="rgba(226,224,218,0.82)">
                    <Text color="surface.500" fontWeight="800" fontSize="sm">
                      Telegram ID
                    </Text>
                    <Text fontWeight="900">{seller.telegramId}</Text>
                  </HStack>
                  <HStack justify="space-between" px={1} py={3} borderBottom="1px solid" borderColor="rgba(226,224,218,0.82)">
                    <Text color="surface.500" fontWeight="800" fontSize="sm">
                      Account
                    </Text>
                    <Text fontWeight="900">{seller.isActive ? "Active" : "Inactive"}</Text>
                  </HStack>
                  <HStack justify="space-between" align="center" px={1} py={3} borderBottom="1px solid" borderColor="rgba(226,224,218,0.82)">
                    <Text color="surface.500" fontWeight="800" fontSize="sm">
                      Assigned Store
                    </Text>
                    <Select
                      value={staffAssignments[seller.id] ?? ""}
                      onChange={(event) =>
                        setStaffAssignments((current) => ({
                          ...current,
                          [seller.id]: event.target.value,
                        }))
                      }
                      h="42px"
                      maxW="190px"
                      borderRadius="14px"
                      bg="white"
                      borderColor="rgba(226,224,218,0.95)"
                      fontWeight="800"
                    >
                      <option value="" disabled>
                        Select store
                      </option>
                      {stores
                        .filter((store) => store.isActive)
                        .map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))}
                    </Select>
                  </HStack>
                  <HStack justify="space-between" align="center" px={1} py={3}>
                    <Text color="surface.500" fontWeight="800" fontSize="sm">
                      Commission %
                    </Text>
                    <Input
                      value={commissionDraft}
                      onChange={(event) =>
                        setStaffCommissionDrafts((current) => ({
                          ...current,
                          [seller.id]: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      h="42px"
                      maxW="90px"
                      borderRadius="14px"
                      bg="white"
                      borderColor="rgba(226,224,218,0.95)"
                      fontWeight="900"
                      textAlign="center"
                      placeholder="0"
                    />
                  </HStack>
                </VStack>
              </Box>
              <Text fontSize="sm" color="surface.500" lineHeight="1.45">
                Commission editing is prepared visually. The next backend step is to persist a personal commission rate and feed it into shift reports.
              </Text>

              <Button
                borderRadius="18px"
                bg="brand.500"
                color="white"
                _hover={{ bg: "brand.600" }}
                isLoading={Boolean(pendingSellerIds[seller.id])}
                isDisabled={!seller.isActive || !staffAssignments[seller.id]}
                onClick={() => void handleAssignSeller(seller.id)}
              >
                Save Assignment
              </Button>
              <Button
                borderRadius="18px"
                variant="outline"
                borderColor="surface.200"
                color="surface.800"
                isDisabled={!seller.currentAssignment || !seller.isActive}
                onClick={() => void onViewAsSeller(seller.id)}
              >
                View as Seller
              </Button>
            </VStack>
          </Box>
        ) : null}

        {staffDetailMode === "worklog" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between">
                <Text fontWeight="900" fontSize="lg">
                  Worklog
                </Text>
                <Text color="surface.500" fontSize="sm" fontWeight="700">
                  Timesheet
                </Text>
              </HStack>
              <Box bg="rgba(255,255,255,0.54)" borderRadius="20px" overflow="hidden">
                <VStack align="stretch" spacing={0}>
                  {seller.activeShift ? (
                    <HStack justify="space-between" align="start" px={1} py={3} borderBottom="1px solid" borderColor="rgba(226,224,218,0.82)">
                      <VStack align="start" spacing={0}>
                        <Text fontWeight="900">Current shift</Text>
                        <Text fontSize="sm" color="surface.500">
                          {seller.activeShift.storeName} · started {formatSalesTime(seller.activeShift.startedAt)}
                        </Text>
                      </VStack>
                      <StatusPill label={seller.activeShift.status} tone={seller.activeShift.status === "paused" ? "orange" : "blue"} />
                    </HStack>
                  ) : null}
                  <Box px={1} py={3}>
                    <Text fontWeight="900">Full shift history needs the next backend payload</Text>
                    <Text mt={1} fontSize="sm" color="surface.500" lineHeight="1.45">
                      We need `/admin/staff/:sellerId/details` to show monthly timesheets with start, end, worked hours,
                      pauses, sales, revenue and commission per shift.
                    </Text>
                  </Box>
                </VStack>
              </Box>
            </VStack>
          </Box>
        ) : null}

        {staffDetailMode === "activity" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between">
                <Text fontWeight="900" fontSize="lg">
                  Activity Feed
                </Text>
                <Text color="surface.500" fontWeight="700" fontSize="sm">
                  {activityItems.length} actions
                </Text>
              </HStack>
              {visibleActivityItems.length > 0 ? (
                <Box bg="rgba(255,255,255,0.54)" borderRadius="20px" overflow="hidden">
                  <VStack align="stretch" spacing={0}>
                    {visibleActivityItems.map((item, index) => {
                      const Icon = item.icon;

                      return (
                        <HStack
                          key={item.id}
                          justify="space-between"
                          align="start"
                          px={1}
                          py={3}
                          borderBottom={index === visibleActivityItems.length - 1 ? 0 : "1px solid"}
                          borderColor="rgba(226,224,218,0.82)"
                        >
                          <HStack spacing={3} align="start" minW={0}>
                            <Box
                              w="42px"
                              h="42px"
                              borderRadius="16px"
                              display="grid"
                              placeItems="center"
                              bg={item.iconBg}
                              color={item.iconColor}
                              flexShrink={0}
                            >
                              <Box as={Icon} boxSize={6} strokeWidth={2.5} />
                            </Box>
                            <VStack align="start" spacing={0} minW={0}>
                              <Text fontWeight="900">{item.title}</Text>
                              <Text fontSize="sm" color="surface.500" noOfLines={2}>
                                {item.meta}
                              </Text>
                              <Text fontSize="xs" color="surface.400" fontWeight="700">
                                {formatDateTime(item.date)}
                              </Text>
                            </VStack>
                          </HStack>
                          <Text fontSize="xs" color="surface.400" fontWeight="900" textTransform="uppercase" pt={1}>
                            {item.iconLabel}
                          </Text>
                        </HStack>
                      );
                    })}
                  </VStack>
                </Box>
              ) : null}
              {activityItems.length > activityPageSize ? (
                <HStack justify="space-between" pt={1}>
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor="surface.200"
                    isDisabled={safeActivityPage === 0}
                    onClick={() => setStaffActivityPage((current) => Math.max(0, current - 1))}
                  >
                    Previous
                  </Button>
                  <Text color="surface.500" fontSize="sm" fontWeight="800">
                    {safeActivityPage + 1} / {activityTotalPages}
                  </Text>
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor="surface.200"
                    isDisabled={safeActivityPage >= activityTotalPages - 1}
                    onClick={() => setStaffActivityPage((current) => Math.min(activityTotalPages - 1, current + 1))}
                  >
                    Next
                  </Button>
                </HStack>
              ) : null}
              {activityItems.length === 0 ? (
                <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                  <Text fontWeight="900">No loaded activity yet</Text>
                  <Text mt={1} fontSize="sm" color="surface.500" lineHeight="1.45">
                    The complete seller action log should be built from shifts, sales, returns and inventory movements in the next backend step.
                  </Text>
                </Box>
              ) : null}
            </VStack>
          </Box>
        ) : null}
      </VStack>
    );
  };

  const getTeamKeyboardValue = (field: TeamVirtualKeyboardField) => {
    if (field === "storeName") {
      return newStoreName;
    }

    if (field === "storeAddress") {
      return newStoreAddress;
    }

    if (field === "sellerName") {
      return newSeller.fullName;
    }

    return newSeller.telegramId;
  };

  const setTeamKeyboardValue = (field: TeamVirtualKeyboardField, value: string) => {
    if (field === "storeName") {
      setNewStoreName(value);
      return;
    }

    if (field === "storeAddress") {
      setNewStoreAddress(value);
      return;
    }

    if (field === "sellerName") {
      setNewSeller((current) => ({ ...current, fullName: value }));
      return;
    }

    setNewSeller((current) => ({ ...current, telegramId: value.replace(/\D/g, "") }));
  };

  const pressTeamKeyboardKey = (key: string) => {
    const value = getTeamKeyboardValue(teamKeyboardField);

    if (key === "delete") {
      setTeamKeyboardValue(teamKeyboardField, value.slice(0, -1));
      return;
    }

    if (key === "clear") {
      setTeamKeyboardValue(teamKeyboardField, "");
      return;
    }

    if (key === "space") {
      if (teamKeyboardField !== "sellerTelegramId" && value && !value.endsWith(" ")) {
        setTeamKeyboardValue(teamKeyboardField, `${value} `);
      }
      return;
    }

    if (key === "caps") {
      setTeamKeyboardCapsLock((current) => !current);
      return;
    }

    if (teamKeyboardField === "sellerTelegramId") {
      if (/^\d$/.test(key) && value.length < 16) {
        setTeamKeyboardValue(teamKeyboardField, `${value}${key}`);
      }
      return;
    }

    const shouldUppercase = teamKeyboardCapsLock || !value || value.endsWith(" ");
    const nextChar = key.length === 1 && /[a-z]/i.test(key)
      ? shouldUppercase
        ? key.toUpperCase()
        : key.toLowerCase()
      : key;

    if (value.length < 80) {
      setTeamKeyboardValue(teamKeyboardField, `${value}${nextChar}`);
      if (teamKeyboardCapsLock && key.length === 1 && /[a-z]/i.test(key)) {
        setTeamKeyboardCapsLock(false);
      }
    }
  };

  const renderTeamVirtualField = (input: {
    field: TeamVirtualKeyboardField;
    label: string;
    value: string;
    placeholder: string;
  }) => {
    const isActive = teamKeyboardField === input.field;

    return (
      <VStack align="stretch" spacing={2}>
        <Text fontSize="10px" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
          {input.label}
        </Text>
        <Button
          h="44px"
          justifyContent="flex-start"
          borderRadius="18px"
          bg="surface.50"
          border="1px solid"
          borderColor={isActive ? "brand.400" : "rgba(226,224,218,0.95)"}
          color={input.value ? "surface.900" : "surface.400"}
          fontWeight="800"
          boxShadow={isActive ? "0 0 0 3px rgba(74,132,244,0.12)" : "none"}
          _hover={{ bg: "surface.50" }}
          _active={{ transform: "scale(0.99)" }}
          onClick={() => setTeamKeyboardField(input.field)}
        >
          <Text noOfLines={1}>{input.value || input.placeholder}</Text>
        </Button>
      </VStack>
    );
  };

  const renderTeamVirtualKeyboard = () => {
    const isNumeric = teamKeyboardField === "sellerTelegramId";
    const numericKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "delete"];
    const alphaRows = [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
      ["z", "x", "c", "v", "b", "n", "m"],
    ];

    if (isNumeric) {
      return (
        <SimpleGrid columns={3} spacing={2} h="full" alignContent="stretch">
          {numericKeys.map((key) => (
            <Button
              key={key}
              h="50px"
              borderRadius="16px"
              bg={key === "delete" || key === "clear" ? "surface.50" : "white"}
              color="surface.900"
              fontSize={key === "delete" || key === "clear" ? "sm" : "xl"}
              fontWeight="800"
              border="1px solid"
              borderColor="surface.100"
              _hover={{ bg: "surface.50" }}
              _active={{ transform: "scale(0.92)", bg: "surface.100" }}
              onClick={() => pressTeamKeyboardKey(key)}
            >
              {key === "delete" ? "Del" : key === "clear" ? "Clear" : key}
            </Button>
          ))}
        </SimpleGrid>
      );
    }

    return (
      <VStack align="stretch" spacing={1.5} w="full" h="full">
        {alphaRows.map((row, index) => (
          <HStack key={index} spacing={1.5} justify="center" w="full">
            {row.map((key) => (
              <Button
                key={key}
                h="38px"
                flex="1"
                minW={0}
                px={0}
                borderRadius="11px"
                bg="white"
                color="surface.900"
                fontSize="sm"
                fontWeight="900"
                border="1px solid"
                borderColor="surface.100"
                _hover={{ bg: "surface.50" }}
                _active={{ transform: "scale(0.92)", bg: "surface.100" }}
                onClick={() => pressTeamKeyboardKey(key)}
              >
                {key.toUpperCase()}
              </Button>
            ))}
          </HStack>
        ))}
        <HStack spacing={2}>
          <Button
            flex="1"
            h="42px"
            borderRadius="16px"
            bg={teamKeyboardCapsLock ? "brand.500" : "surface.50"}
            color={teamKeyboardCapsLock ? "white" : "surface.800"}
            fontWeight="800"
            border="1px solid"
            borderColor={teamKeyboardCapsLock ? "brand.500" : "surface.100"}
            onClick={() => pressTeamKeyboardKey("caps")}
          >
            Caps
          </Button>
          <Button
            flex="1"
            h="42px"
            borderRadius="16px"
            bg="surface.50"
            color="surface.800"
            fontWeight="800"
            border="1px solid"
            borderColor="surface.100"
            onClick={() => pressTeamKeyboardKey("clear")}
          >
            Clear
          </Button>
          <Button
            flex="2"
            h="42px"
            borderRadius="16px"
            bg="white"
            color="surface.800"
            fontWeight="800"
            border="1px solid"
            borderColor="surface.100"
            onClick={() => pressTeamKeyboardKey("space")}
          >
            Space
          </Button>
          <Button
            flex="1"
            h="42px"
            borderRadius="16px"
            bg="surface.50"
            color="surface.800"
            fontWeight="800"
            border="1px solid"
            borderColor="surface.100"
            onClick={() => pressTeamKeyboardKey("delete")}
          >
            Del
          </Button>
        </HStack>
      </VStack>
    );
  };

  const renderTeamCreationModals = () => (
    <>
      {showNewStoreModal ? (
        <Box position="fixed" inset={0} zIndex={1400}>
          <Box
            position="absolute"
            inset={0}
            bg="rgba(14, 12, 10, 0.4)"
            overscrollBehavior="none"
            style={{ touchAction: "none" }}
            onClick={() => setShowNewStoreModal(false)}
          />
          <Box
            role="dialog"
            aria-modal="true"
            aria-label="New Store"
            position="absolute"
            left={0}
            right={0}
            bottom={0}
            w="100%"
            maxH="88vh"
            bg="white"
            borderTopRadius="32px"
            boxShadow="0 -20px 60px rgba(0,0,0,0.15)"
            overflow="hidden"
            display="flex"
            flexDirection="column"
            overscrollBehavior="contain"
            onClick={(event) => event.stopPropagation()}
          >
            <Box w="full" py={2} display="flex" justifyContent="center" onClick={() => setShowNewStoreModal(false)} cursor="pointer">
              <Box w="40px" h="4px" borderRadius="full" bg="surface.200" />
            </Box>

            <VStack align="stretch" spacing={2.5} px={4} pt={1} pb={2} overflowY="auto" flex="1" minH={0}>
              <HStack justify="space-between" align="center">
                <VStack align="start" spacing={0}>
                  <Text fontWeight="900" fontSize="xl" letterSpacing="-0.02em">
                    New Store
                  </Text>
                  <Text color="surface.500" fontSize="xs" fontWeight="700">
                    Create a new sales location.
                  </Text>
                </VStack>
                <Button
                  aria-label="Close new store modal"
                  minW="42px"
                  h="42px"
                  px={0}
                  borderRadius="999px"
                  bg="surface.50"
                  color="surface.700"
                  fontSize="24px"
                  lineHeight="1"
                  fontWeight="700"
                  _hover={{ bg: "rgba(232,231,226,0.95)" }}
                  onClick={() => setShowNewStoreModal(false)}
                >
                  ×
                </Button>
              </HStack>

              {renderTeamVirtualField({
                field: "storeName",
                label: "Store name",
                value: newStoreName,
                placeholder: "Central Mall Store",
              })}

              {renderTeamVirtualField({
                field: "storeAddress",
                label: "Address",
                value: newStoreAddress,
                placeholder: "Address or short location note",
              })}

              <Box
                bg="rgba(246,244,239,0.96)"
                borderRadius="22px"
                mx={-2}
                px={2}
                pt={2}
                pb={3}
                h="250px"
                flexShrink={0}
                border="1px solid"
                borderColor="rgba(223,219,210,0.78)"
              >
                {renderTeamVirtualKeyboard()}
              </Box>
            </VStack>

            <Box px={4} pt={2} pb="calc(10px + env(safe-area-inset-bottom, 0px))" bg="white" boxShadow="0 -8px 22px rgba(18,18,18,0.04)">
              <Button
                w="full"
                h="52px"
                borderRadius="18px"
                bg="surface.900"
                color="white"
                _hover={{ bg: "surface.700" }}
                isLoading={creatingStore}
                isDisabled={!newStoreName.trim()}
                onClick={() => void handleCreateStore()}
              >
                Create Store
              </Button>
            </Box>
          </Box>
        </Box>
      ) : null}

      {showNewSellerModal ? (
        <Box position="fixed" inset={0} zIndex={1400}>
          <Box
            position="absolute"
            inset={0}
            bg="rgba(14, 12, 10, 0.4)"
            overscrollBehavior="none"
            style={{ touchAction: "none" }}
            onClick={() => setShowNewSellerModal(false)}
          />
          <Box
            role="dialog"
            aria-modal="true"
            aria-label="New Seller"
            position="absolute"
            left={0}
            right={0}
            bottom={0}
            w="100%"
            maxH="88vh"
            bg="white"
            borderTopRadius="32px"
            boxShadow="0 -20px 60px rgba(0,0,0,0.15)"
            overflow="hidden"
            display="flex"
            flexDirection="column"
            overscrollBehavior="contain"
            onClick={(event) => event.stopPropagation()}
          >
            <Box w="full" py={2} display="flex" justifyContent="center" onClick={() => setShowNewSellerModal(false)} cursor="pointer">
              <Box w="40px" h="4px" borderRadius="full" bg="surface.200" />
            </Box>

            <VStack align="stretch" spacing={2.5} px={4} pt={1} pb={2} overflowY="auto" flex="1" minH={0}>
              <HStack justify="space-between" align="center">
                <VStack align="start" spacing={0}>
                  <Text fontWeight="900" fontSize="xl" letterSpacing="-0.02em">
                    New Seller
                  </Text>
                  <Text color="surface.500" fontSize="xs" fontWeight="700">
                    Add seller account and optional store assignment.
                  </Text>
                </VStack>
                <Button
                  aria-label="Close new seller modal"
                  minW="42px"
                  h="42px"
                  px={0}
                  borderRadius="999px"
                  bg="surface.50"
                  color="surface.700"
                  fontSize="24px"
                  lineHeight="1"
                  fontWeight="700"
                  _hover={{ bg: "rgba(232,231,226,0.95)" }}
                  onClick={() => setShowNewSellerModal(false)}
                >
                  ×
                </Button>
              </HStack>

              {renderTeamVirtualField({
                field: "sellerName",
                label: "Full name",
                value: newSeller.fullName,
                placeholder: "John Seller",
              })}

              {renderTeamVirtualField({
                field: "sellerTelegramId",
                label: "Telegram ID",
                value: newSeller.telegramId,
                placeholder: "123456789",
              })}

              <VStack align="stretch" spacing={2}>
                <Text fontSize="10px" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                  Assigned store
                </Text>
                <Select
                  value={newSeller.storeId}
                  onChange={(event) =>
                    setNewSeller((current) => ({ ...current, storeId: event.target.value }))
                  }
                  borderRadius="18px"
                  bg="surface.50"
                  borderColor="rgba(226,224,218,0.95)"
                  fontWeight="800"
                  h="44px"
                >
                  <option value="">No store yet</option>
                  {stores
                    .filter((store) => store.isActive)
                    .map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                </Select>
              </VStack>

              <SimpleGrid columns={2} spacing={2}>
                {[
                  { label: "Active", value: true },
                  { label: "Inactive", value: false },
                ].map((option) => {
                  const isActive = newSeller.isActive === option.value;

                  return (
                    <Button
                      key={option.label}
                      borderRadius="16px"
                      bg={isActive ? "brand.500" : panelMutedSurface}
                      color={isActive ? "white" : "surface.700"}
                      _hover={{ bg: isActive ? "brand.600" : "rgba(232,231,226,0.95)" }}
                      onClick={() =>
                        setNewSeller((current) => ({ ...current, isActive: option.value }))
                      }
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </SimpleGrid>

              <Box
                bg="rgba(246,244,239,0.96)"
                borderRadius="22px"
                mx={-2}
                px={2}
                pt={2}
                pb={3}
                h="250px"
                flexShrink={0}
                border="1px solid"
                borderColor="rgba(223,219,210,0.78)"
              >
                {renderTeamVirtualKeyboard()}
              </Box>
            </VStack>

            <Box px={4} pt={2} pb="calc(10px + env(safe-area-inset-bottom, 0px))" bg="white" boxShadow="0 -8px 22px rgba(18,18,18,0.04)">
              <Button
                w="full"
                h="52px"
                borderRadius="18px"
                bg="surface.900"
                color="white"
                _hover={{ bg: "surface.700" }}
                isLoading={creatingSeller}
                isDisabled={!newSeller.fullName.trim() || !newSeller.telegramId.trim()}
                onClick={() => void handleCreateSeller()}
              >
                Create Seller
              </Button>
            </Box>
          </Box>
        </Box>
      ) : null}
    </>
  );

  const renderProductCreationModal = () =>
    showNewProductModal ? (
      <Box position="fixed" inset={0} zIndex={1400}>
        <Box
          position="absolute"
          inset={0}
          bg="rgba(14, 12, 10, 0.4)"
          overscrollBehavior="none"
          style={{ touchAction: "none" }}
          onClick={() => setShowNewProductModal(false)}
        />
        <Box
          role="dialog"
          aria-modal="true"
          aria-label="New Product"
          position="absolute"
          left={0}
          right={0}
          bottom={0}
          w="100%"
          maxH="82vh"
          bg="white"
          borderTopRadius="32px"
          boxShadow="0 -20px 60px rgba(0,0,0,0.15)"
          overflow="hidden"
          display="flex"
          flexDirection="column"
          overscrollBehavior="contain"
          onClick={(event) => event.stopPropagation()}
        >
          <Box w="full" py={2} display="flex" justifyContent="center" onClick={() => setShowNewProductModal(false)} cursor="pointer">
            <Box w="40px" h="4px" borderRadius="full" bg="surface.200" />
          </Box>

          <VStack align="stretch" spacing={3} px={4} pt={1} pb={3}>
            <HStack justify="space-between" align="center">
              <VStack align="start" spacing={0}>
                <Text fontWeight="900" fontSize="xl" letterSpacing="-0.02em">
                  New Product
                </Text>
                <Text color="surface.500" fontSize="xs" fontWeight="700">
                  Create a product and make it available across stores.
                </Text>
              </VStack>
              <Button
                aria-label="Close new product modal"
                minW="42px"
                h="42px"
                px={0}
                borderRadius="999px"
                bg="surface.50"
                color="surface.700"
                fontSize="24px"
                lineHeight="1"
                fontWeight="700"
                _hover={{ bg: "rgba(232,231,226,0.95)" }}
                onClick={() => setShowNewProductModal(false)}
              >
                ×
              </Button>
            </HStack>

            {renderProductVirtualField({
              field: "productName",
              label: "Product name",
              value: newProduct.name,
              placeholder: "Product name",
            })}

            {renderProductVirtualField({
              field: "productPrice",
              label: "Default price",
              value: newProduct.defaultPrice,
              placeholder: "24,90",
            })}

            <SimpleGrid columns={2} spacing={2}>
              <Button
                borderRadius="16px"
                bg={newProductIsActive ? "brand.500" : "rgba(241,240,236,0.95)"}
                color={newProductIsActive ? "white" : "surface.800"}
                _hover={{ bg: newProductIsActive ? "brand.600" : "rgba(225,223,218,0.95)" }}
                onClick={() => setNewProductIsActive(true)}
              >
                Active
              </Button>
              <Button
                borderRadius="16px"
                bg={!newProductIsActive ? "rgba(248,113,113,0.14)" : "rgba(241,240,236,0.95)"}
                color={!newProductIsActive ? "red.500" : "surface.800"}
                _hover={{ bg: !newProductIsActive ? "rgba(248,113,113,0.2)" : "rgba(225,223,218,0.95)" }}
                onClick={() => setNewProductIsActive(false)}
              >
                Inactive
              </Button>
            </SimpleGrid>

            <Box
              bg="rgba(246,244,239,0.96)"
              borderRadius="22px"
              mx={-2}
              px={2}
              pt={2}
              pb={3}
              h="250px"
              flexShrink={0}
              border="1px solid"
              borderColor="rgba(223,219,210,0.78)"
            >
              {renderProductVirtualKeyboard()}
            </Box>
          </VStack>

          <Box px={4} pt={2} pb="calc(10px + env(safe-area-inset-bottom, 0px))" bg="white" boxShadow="0 -8px 22px rgba(18,18,18,0.04)">
            <Button
              w="full"
              h="52px"
              borderRadius="18px"
              bg="surface.900"
              color="white"
              _hover={{ bg: "surface.700" }}
              isLoading={creatingProduct}
              isDisabled={!newProduct.name.trim() || !newProduct.defaultPrice.trim()}
              onClick={() => void handleCreateProduct()}
            >
              Create Product
            </Button>
          </Box>
        </Box>
      </Box>
    ) : null;

  const renderInventoryStoreSelector = () =>
    showInventoryStoreSelector ? (
      <Box position="fixed" inset={0} zIndex={1400}>
        <Box
          position="absolute"
          inset={0}
          bg="rgba(14, 12, 10, 0.4)"
          overscrollBehavior="none"
          style={{ touchAction: "none" }}
          onClick={() => setShowInventoryStoreSelector(false)}
        />
        <Box
          role="dialog"
          aria-modal="true"
          aria-label="Select Store"
          position="absolute"
          left={0}
          right={0}
          bottom={0}
          w="100%"
          maxH="78vh"
          bg="white"
          borderTopRadius="32px"
          boxShadow="0 -20px 60px rgba(0,0,0,0.15)"
          overflow="hidden"
          display="flex"
          flexDirection="column"
          overscrollBehavior="contain"
          onClick={(event) => event.stopPropagation()}
        >
          <Box w="full" py={2} display="flex" justifyContent="center" onClick={() => setShowInventoryStoreSelector(false)} cursor="pointer">
            <Box w="40px" h="4px" borderRadius="full" bg="surface.200" />
          </Box>

          <VStack align="stretch" spacing={3} px={4} pt={1} pb={4}>
            <HStack justify="space-between" align="center">
              <VStack align="start" spacing={0}>
                <Text fontWeight="900" fontSize="xl" letterSpacing="-0.02em">
                  Select Store
                </Text>
                <Text color="surface.500" fontSize="xs" fontWeight="700">
                  Switch inventory view between your active locations.
                </Text>
              </VStack>
              <Button
                aria-label="Close store selector"
                minW="42px"
                h="42px"
                px={0}
                borderRadius="999px"
                bg="surface.50"
                color="surface.700"
                fontSize="24px"
                lineHeight="1"
                fontWeight="700"
                _hover={{ bg: "rgba(232,231,226,0.95)" }}
                onClick={() => setShowInventoryStoreSelector(false)}
              >
                ×
              </Button>
            </HStack>

            <VStack align="stretch" spacing={2}>
              {inventoryStores.map((store) => {
                const isActive = selectedInventoryStoreId === store.id;

                return (
                  <Button
                    key={store.id}
                    justifyContent="space-between"
                    h="64px"
                    px={4}
                    borderRadius="20px"
                    bg={isActive ? "rgba(74,132,244,0.12)" : panelMutedSurface}
                    color="surface.900"
                    border="1px solid"
                    borderColor={isActive ? "rgba(74,132,244,0.24)" : "transparent"}
                    _hover={{ bg: isActive ? "rgba(74,132,244,0.14)" : "rgba(232,231,226,0.96)" }}
                    onClick={() => {
                      const cachedSnapshot = inventoryCache[store.id];
                      if (cachedSnapshot && trustedInventoryStoreIds[store.id]) {
                        setInventoryView(cachedSnapshot);
                        setInventorySoftRefreshing(false);
                        setSelectedInventoryItemId(null);
                        setSelectedInventoryStoreId(store.id);
                        setShowInventoryStoreSelector(false);
                        return;
                      }

                      setInventorySoftRefreshing(true);
                      setSelectedInventoryItemId(null);
                      setShowInventoryStoreSelector(false);
                      void loadInventory(store.id, { silent: true }).then(() => {
                        setTrustedInventoryStoreIds((current) => ({ ...current, [store.id]: true }));
                        setSelectedInventoryStoreId(store.id);
                      }).finally(() => {
                        setInventorySoftRefreshing(false);
                      });
                    }}
                  >
                    <VStack align="start" spacing={0} minW={0}>
                      <Text fontWeight="900" noOfLines={1}>
                        {store.name}
                      </Text>
                      <Text fontSize="sm" color="surface.500" fontWeight="700">
                        {getStoreAddressLabel(
                          stores.find((entry) => entry.id === store.id) ?? { name: store.name }
                        )}
                      </Text>
                    </VStack>
                    {isActive ? (
                      <Box
                        w="32px"
                        h="32px"
                        borderRadius="999px"
                        bg="brand.500"
                        color="white"
                        display="grid"
                        placeItems="center"
                        flexShrink={0}
                      >
                        <LuCheck size={18} />
                      </Box>
                    ) : null}
                  </Button>
                );
              })}
            </VStack>
          </VStack>
        </Box>
      </Box>
    ) : null;

  const getProductKeyboardValue = (field: ProductVirtualKeyboardField) =>
    field === "productName" ? newProduct.name : newProduct.defaultPrice;

  const setProductKeyboardValue = (field: ProductVirtualKeyboardField, value: string) => {
    if (field === "productName") {
      setNewProduct((current) => ({ ...current, name: value }));
      return;
    }

    const normalized = value.replace(/[^\d,.\s]/g, "");
    setNewProduct((current) => ({ ...current, defaultPrice: normalized }));
  };

  const pressProductKeyboardKey = (key: string) => {
    const value = getProductKeyboardValue(productKeyboardField);

    if (key === "delete") {
      setProductKeyboardValue(productKeyboardField, value.slice(0, -1));
      return;
    }

    if (key === "clear") {
      setProductKeyboardValue(productKeyboardField, "");
      return;
    }

    if (key === "space") {
      if (productKeyboardField === "productName" && value && !value.endsWith(" ")) {
        setProductKeyboardValue(productKeyboardField, `${value} `);
      }
      return;
    }

    if (key === "caps") {
      setProductKeyboardCapsLock((current) => !current);
      return;
    }

    if (productKeyboardField === "productPrice") {
      if (/^\d$/.test(key)) {
        setProductKeyboardValue(productKeyboardField, `${value}${key}`);
        return;
      }

      if ((key === "," || key === ".") && !value.includes(",") && !value.includes(".")) {
        setProductKeyboardValue(productKeyboardField, `${value}${key}`);
      }
      return;
    }

    const shouldUppercase = productKeyboardCapsLock || !value || value.endsWith(" ");
    const nextChar = key.length === 1 && /[a-z]/i.test(key)
      ? shouldUppercase
        ? key.toUpperCase()
        : key.toLowerCase()
      : key;

    if (value.length < 80) {
      setProductKeyboardValue(productKeyboardField, `${value}${nextChar}`);
      if (productKeyboardCapsLock && key.length === 1 && /[a-z]/i.test(key)) {
        setProductKeyboardCapsLock(false);
      }
    }
  };

  const renderProductVirtualField = (input: {
    field: ProductVirtualKeyboardField;
    label: string;
    value: string;
    placeholder: string;
  }) => {
    const isActive = productKeyboardField === input.field;

    return (
      <VStack align="stretch" spacing={2}>
        <Text fontSize="10px" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
          {input.label}
        </Text>
        <Button
          h="44px"
          justifyContent="flex-start"
          borderRadius="18px"
          bg="surface.50"
          border="1px solid"
          borderColor={isActive ? "brand.400" : "rgba(226,224,218,0.95)"}
          color={input.value ? "surface.900" : "surface.400"}
          fontWeight="800"
          boxShadow={isActive ? "0 0 0 3px rgba(74,132,244,0.12)" : "none"}
          _hover={{ bg: "surface.50" }}
          _active={{ transform: "scale(0.99)" }}
          onClick={() => setProductKeyboardField(input.field)}
        >
          <Text noOfLines={1}>{input.value || input.placeholder}</Text>
        </Button>
      </VStack>
    );
  };

  const renderProductVirtualKeyboard = () => {
    const isNumeric = productKeyboardField === "productPrice";
    const numericKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", ","];
    const alphaRows = [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
      ["z", "x", "c", "v", "b", "n", "m"],
    ];

    if (isNumeric) {
      return (
        <SimpleGrid columns={3} spacing={2} h="full" alignContent="stretch">
          {numericKeys.map((key) => (
            <Button
              key={key}
              h="50px"
              borderRadius="16px"
              bg={key === "clear" ? "surface.50" : "white"}
              color="surface.900"
              fontSize={key === "clear" ? "sm" : "xl"}
              fontWeight="800"
              border="1px solid"
              borderColor="surface.100"
              _hover={{ bg: "surface.50" }}
              _active={{ transform: "scale(0.92)", bg: "surface.100" }}
              onClick={() => pressProductKeyboardKey(key)}
            >
              {key === "clear" ? "Clear" : key}
            </Button>
          ))}
          <Button
            gridColumn="1 / -1"
            h="42px"
            borderRadius="16px"
            bg="surface.50"
            color="surface.800"
            fontWeight="800"
            border="1px solid"
            borderColor="surface.100"
            onClick={() => pressProductKeyboardKey("delete")}
          >
            Del
          </Button>
        </SimpleGrid>
      );
    }

    return (
      <VStack align="stretch" spacing={1.5} w="full" h="full">
        {alphaRows.map((row, index) => (
          <HStack key={index} spacing={1.5} justify="center" w="full">
            {row.map((key) => (
              <Button
                key={key}
                h="38px"
                flex="1"
                minW={0}
                px={0}
                borderRadius="11px"
                bg="white"
                color="surface.900"
                fontSize="sm"
                fontWeight="900"
                border="1px solid"
                borderColor="surface.100"
                _hover={{ bg: "surface.50" }}
                _active={{ transform: "scale(0.92)", bg: "surface.100" }}
                onClick={() => pressProductKeyboardKey(key)}
              >
                {key.toUpperCase()}
              </Button>
            ))}
          </HStack>
        ))}
        <HStack spacing={2}>
          <Button
            flex="1"
            h="42px"
            borderRadius="16px"
            bg={productKeyboardCapsLock ? "brand.500" : "surface.50"}
            color={productKeyboardCapsLock ? "white" : "surface.800"}
            fontWeight="800"
            border="1px solid"
            borderColor={productKeyboardCapsLock ? "brand.500" : "surface.100"}
            onClick={() => pressProductKeyboardKey("caps")}
          >
            Caps
          </Button>
          <Button
            flex="1"
            h="42px"
            borderRadius="16px"
            bg="surface.50"
            color="surface.800"
            fontWeight="800"
            border="1px solid"
            borderColor="surface.100"
            onClick={() => pressProductKeyboardKey("clear")}
          >
            Clear
          </Button>
          <Button
            flex="2"
            h="42px"
            borderRadius="16px"
            bg="white"
            color="surface.800"
            fontWeight="800"
            border="1px solid"
            borderColor="surface.100"
            onClick={() => pressProductKeyboardKey("space")}
          >
            Space
          </Button>
          <Button
            flex="1"
            h="42px"
            borderRadius="16px"
            bg="surface.50"
            color="surface.800"
            fontWeight="800"
            border="1px solid"
            borderColor="surface.100"
            onClick={() => pressProductKeyboardKey("delete")}
          >
            Del
          </Button>
        </HStack>
      </VStack>
    );
  };

  const renderTeam = () => {
    if (selectedStaffSeller) {
      return renderSellerDetail(selectedStaffSeller);
    }

    if (selectedTeamStore) {
      return renderStoreDetail(selectedTeamStore);
    }

    return (
      <>
        <VStack spacing={4} align="stretch">
          <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
            <HStack spacing={2}>
              {(["stores", "staff"] as TeamMode[]).map((mode) => {
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
        {renderTeamCreationModals()}
      </>
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
          <VStack align="stretch" spacing={showFullscreenHeaderContext ? 3 : 0} px={1} pt={showFullscreenHeaderContext ? 4 : 2} mb={2}>
            {showFullscreenHeaderContext ? (
              <HStack justify="space-between" align="center">
                <Text
                  fontSize="xs"
                  fontWeight="800"
                  letterSpacing="0.08em"
                  textTransform="uppercase"
                  color="surface.400"
                >
                  {headerContextLabel}
                </Text>
                <Text fontSize="xs" color="surface.400" fontWeight="700">
                  Today · {formatHeaderDate(new Date())}
                </Text>
              </HStack>
            ) : null}

            <HStack justify="space-between" align="center">
              <VStack align="start" spacing={adminPageSubtitle ? 1 : 0}>
                <Text
                  fontSize="3xl"
                  fontWeight="900"
                  letterSpacing="-0.04em"
                  color="surface.900"
                  lineHeight="1"
                >
                  {adminPageTitle}
                </Text>
                {adminPageSubtitle ? (
                  <Text fontSize="sm" color="surface.500" fontWeight="700" lineHeight="1.2">
                    {adminPageSubtitle}
                  </Text>
                ) : null}
              </VStack>

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
          </VStack>

          {loading || loadingStores || loadingStaff ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={5} boxShadow={panelShadow}>
              <Text fontWeight="800">
                {activeTab === "team" ? "Loading team data..." : "Loading admin data..."}
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
