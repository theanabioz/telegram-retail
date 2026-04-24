import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  Avatar,
  Box,
  Button,
  Container,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Text,
  VStack,
  Dialog,
  Portal,
} from "@chakra-ui/react";
import {
  LuActivity,
  LuCalendarDays,
  LuCheck,
  LuChevronDown,
  LuChevronRight,
  LuCircleCheck,
  LuClock3,
  LuInfo,
  LuMinus,
  LuPlus,
  LuReceiptText,
  LuSend,
  LuShieldCheck,
  LuStore,
  LuUserRound,
  LuUsersRound,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { AdminNav, type AdminTab } from "../components/AdminNav";
import { AdminFormScreen } from "../components/AdminFormScreen";
import { AdminTaskScreen } from "../components/AdminTaskScreen";
import { ConfirmActionModal, type ConfirmActionModalState } from "../components/ConfirmActionModal";
import { apiGet, apiPost } from "../lib/api";
import { formatEur } from "../lib/currency";
import { useScrollToInput } from "../hooks/useScrollToInput";
import { getLocaleTag, translate, useI18n } from "../lib/i18n";
import { addRealtimeEventListener, type RetailRealtimeEvent } from "../lib/realtime";
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
const APP_TIME_ZONE = "Europe/Lisbon";
const TOKEN_KEY = "telegram-retail-token";
const ADMIN_STARTUP_CACHE_KEY = "telegram-retail-admin-startup";
const STARTUP_CACHE_TTL_MS = 10 * 60 * 1000;

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function isStartupCacheFresh(cachedAt?: number) {
  return cachedAt == null || Date.now() - cachedAt <= STARTUP_CACHE_TTL_MS;
}

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

type OverviewChartSelection = {
  date: string;
  hour: number;
} | null;

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
type StoreCreateStep = "name" | "address";
type SellerCreateStep = "name" | "telegramId" | "store" | "status";
type ProductCreateStep = "name" | "price" | "sku" | "status";
type AdminReportType = "daily_summary" | "store" | "seller" | "schedule";
type AdminSettingsView = "root" | "reports-menu" | "report-detail";
type ReportQuickPreset = "today" | "week" | "month" | "custom";

const adminFormInputStyles = {
  h: "56px",
  borderRadius: "20px",
  bg: "rgba(255,255,255,0.94)",
  borderColor: "rgba(214,218,225,0.96)",
  fontWeight: "800",
  px: 4,
  boxShadow: "0 10px 22px rgba(18,18,18,0.04)",
  _hover: { borderColor: "rgba(201,206,214,0.98)" },
  _focusVisible: {
    borderColor: "brand.400",
    boxShadow: "0 0 0 3px rgba(74,132,244,0.12), 0 10px 22px rgba(74,132,244,0.08)",
  },
} as const;

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

    const cached = JSON.parse(raw) as { token: string; startup: AdminStartupResponse; cachedAt?: number };
    return isStartupCacheFresh(cached.cachedAt)
      ? cached.startup
      : null;
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
  return new Date(value).toLocaleTimeString(getLocaleTag(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
    window.localStorage.setItem(ADMIN_STARTUP_CACHE_KEY, JSON.stringify({ token, startup, cachedAt: Date.now() }));
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
    return translate("common.noActivityYet");
  }

  return new Date(value).toLocaleString(getLocaleTag(), {
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

function getStoreAddressLabel(store: { name: string; address?: string | null }, fallbackLabel: string) {
  const normalizedAddress = store.address?.trim();

  if (!normalizedAddress) {
    return demoStoreAddressOverrides[store.name] ?? fallbackLabel;
  }

  return demoStoreAddressOverrides[store.name] ?? normalizedAddress;
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString(getLocaleTag());
}

function formatHeaderDate(value: Date) {
  return value.toLocaleDateString(getLocaleTag(), {
    day: "numeric",
    month: "short",
  });
}

function formatReportRangeLabel(dateFrom: string, dateTo: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const formatOne = (value: string) =>
    formatter.format(new Date(`${value}T12:00:00`)).replace(/^(\d{2}) /, "$1. ");

  return dateFrom === dateTo ? formatOne(dateFrom) : `${formatOne(dateFrom)} - ${formatOne(dateTo)}`;
}

function getRussianPlural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}

function formatOverviewStoreCount(count: number, locale: "en" | "ru" | "pt") {
  if (locale === "ru") {
    return `${count} ${getRussianPlural(count, "магазин", "магазина", "магазинов")}`;
  }

  if (locale === "pt") {
    return `${count} ${count === 1 ? "loja" : "lojas"}`;
  }

  return `${count} ${count === 1 ? "store" : "stores"}`;
}

function formatOverviewSalesCount(count: number, locale: "en" | "ru" | "pt") {
  if (locale === "ru") {
    return `${count} ${getRussianPlural(count, "продажа", "продажи", "продаж")}`;
  }

  if (locale === "pt") {
    return `${count} ${count === 1 ? "venda" : "vendas"}`;
  }

  return `${count} ${count === 1 ? "sale" : "sales"}`;
}

function renderAdminSkeletonLine(width: string, height = "14px", borderRadius = "999px") {
  return (
    <Box
      width={width}
      height={height}
      borderRadius={borderRadius}
      bg="rgba(226,224,218,0.92)"
      animation="appSkeletonPulse 1.1s ease-in-out infinite"
    />
  );
}

function formatAdminPaymentMethod(method: "cash" | "card") {
  if (method === "cash") {
    return translate("payment.cash");
  }

  return translate("payment.cardBadge");
}

function getCurrentBusinessHour() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hourPart = parts.find((part) => part.type === "hour")?.value ?? "0";
  const parsedHour = Number(hourPart);

  return Number.isNaN(parsedHour) ? 0 : parsedHour;
}

function getBusinessDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${partMap.year}-${partMap.month}-${partMap.day}`;
}

function formatOverviewChartDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const label = new Intl.DateTimeFormat(getLocaleTag(), {
    day: "2-digit",
    month: "short",
  }).format(date);

  return label.replace(".", "");
}

function getOverviewRevenueHistory(dashboardData: AdminDashboardResponse) {
  if (dashboardData.hourlyRevenueHistory?.length) {
    return dashboardData.hourlyRevenueHistory;
  }

  return [
    {
      date: getBusinessDateKey(),
      total: dashboardData.summary.totalRevenueToday,
      hours: dashboardData.hourlyRevenueToday,
    },
  ];
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
      whiteSpace="nowrap"
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
  const { locale, localeOptions, setLocale, t } = useI18n();
  const { data, error, loading, load, hydrate: hydrateDashboard } = useAdminDashboardStore();
  const cachedAdminStartup = useMemo(() => getCachedAdminStartup(), []);
  const dashboardData = data ?? cachedAdminStartup?.dashboard ?? null;
  const overviewRevenueHistory = useMemo(
    () => (dashboardData ? getOverviewRevenueHistory(dashboardData) : []),
    [dashboardData]
  );
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
  const showAdminLoadingBanner =
    (loading && !data) ||
    (activeTab === "team" &&
      ((loadingStores && stores.length === 0) || (loadingStaff && staff.length === 0)));
  const [selectedOverviewHour, setSelectedOverviewHour] = useState<OverviewChartSelection>(null);
  const [visibleOverviewDate, setVisibleOverviewDate] = useState<string | null>(null);
  const [salesLedgerMode, setSalesLedgerMode] = useState<SalesLedgerMode>("sales");
  const [selectedAdminSaleId, setSelectedAdminSaleId] = useState<string | null>(null);
  const [selectedAdminReturnId, setSelectedAdminReturnId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionModalState | null>(null);
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
  const [settingsView, setSettingsView] = useState<AdminSettingsView>("root");
  const [reportType, setReportType] = useState<AdminReportType>("daily_summary");
  const [reportDate, setReportDate] = useState(getTodayInputValue);
  const [reportDateTo, setReportDateTo] = useState(getTodayInputValue);
  const [reportQuickPreset, setReportQuickPreset] = useState<ReportQuickPreset | null>("today");
  const [reportStoreId, setReportStoreId] = useState("");
  const [reportSellerId, setReportSellerId] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [storeCreateStep, setStoreCreateStep] = useState<StoreCreateStep>("name");
  const [newSeller, setNewSeller] = useState({
    fullName: "",
    telegramId: "",
    storeId: "",
    isActive: true,
  });
  const [sellerCreateStep, setSellerCreateStep] = useState<SellerCreateStep>("name");
  const [newProduct, setNewProduct] = useState({
    name: "",
    sku: "",
    defaultPrice: "",
  });
  const [newProductIsActive, setNewProductIsActive] = useState(true);
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [productCreateStep, setProductCreateStep] = useState<ProductCreateStep>("name");
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
  const overviewChartScrollRef = useRef<HTMLDivElement | null>(null);
  const overviewChartScrollReadyRef = useRef(false);
  const positionedOverviewChartDateRef = useRef<string | null>(null);
  const pointerHandledSegmentRef = useRef<string | null>(null);
  const activateSegmentOnPointerDown = useCallback(
    (key: string, action: () => void) => (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      pointerHandledSegmentRef.current = key;
      action();
    },
    []
  );
  const activateSegmentOnClick = useCallback(
    (key: string, action: () => void) => () => {
      if (pointerHandledSegmentRef.current === key) {
        pointerHandledSegmentRef.current = null;
        return;
      }

      action();
    },
    []
  );
  const handleOverviewChartScroll = useCallback(() => {
    const scrollElement = overviewChartScrollRef.current;

    if (
      !overviewChartScrollReadyRef.current ||
      !scrollElement ||
      overviewRevenueHistory.length === 0 ||
      scrollElement.clientWidth <= 0
    ) {
      return;
    }

    const children = Array.from(scrollElement.children) as HTMLElement[];
    const viewportCenter = scrollElement.scrollLeft + scrollElement.clientWidth / 2;
    const index = children.reduce((closestIndex, child, childIndex) => {
      const closestChild = children[closestIndex];
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const closestCenter = closestChild.offsetLeft + closestChild.offsetWidth / 2;

      return Math.abs(childCenter - viewportCenter) < Math.abs(closestCenter - viewportCenter)
        ? childIndex
        : closestIndex;
    }, 0);

    setVisibleOverviewDate(overviewRevenueHistory[index]?.date ?? null);
  }, [overviewRevenueHistory]);
  const selectedStaffSeller = selectedStaffSellerId
    ? staff.find((seller) => seller.id === selectedStaffSellerId) ?? null
    : null;
  const selectedTeamStore = selectedTeamStoreId
    ? stores.find((store) => store.id === selectedTeamStoreId) ?? null
    : null;
  const scrollFocusedInputIntoView = useScrollToInput();
  const storeNameInputRef = useRef<HTMLInputElement | null>(null);
  const storeAddressInputRef = useRef<HTMLInputElement | null>(null);
  const sellerNameInputRef = useRef<HTMLInputElement | null>(null);
  const sellerTelegramInputRef = useRef<HTMLInputElement | null>(null);
  const sellerStoreSelectRef = useRef<HTMLSelectElement | null>(null);
  const productNameInputRef = useRef<HTMLInputElement | null>(null);
  const productPriceInputRef = useRef<HTMLInputElement | null>(null);
  const productSkuInputRef = useRef<HTMLInputElement | null>(null);
  const headerContextLabel =
    activeTab === "overview"
      ? t("admin.context.liveDashboard")
      : activeTab === "sales"
        ? t("admin.context.revenueReturns")
        : activeTab === "inventory"
          ? t("admin.context.stockAcrossStores")
          : activeTab === "team"
            ? selectedStaffSeller
              ? t("admin.team.sellerManagement")
              : selectedTeamStore
                ? t("admin.team.storeManagement")
                : t("admin.team.storesAndStaff")
            : t("admin.context.workspaceSettings");
  const hasFullscreenAdminTask =
    showNewStoreModal || showNewSellerModal || showNewProductModal || showInventoryStoreSelector;
  const activeReportPageTitle =
    reportType === "daily_summary"
      ? "Сводный отчет"
      : reportType === "store"
        ? "Отчет по магазину"
        : reportType === "seller"
          ? "Отчет по продавцу"
          : "Рабочий график";
  const activeReportPageSubtitle =
    reportType === "daily_summary"
      ? "Итоги магазинов и команды"
      : reportType === "store"
        ? "Показатели одной точки"
        : reportType === "seller"
          ? "Личные показатели сотрудника"
          : "Смены и часы команды";
  const visibleOverviewDay =
    overviewRevenueHistory.find((day) => day.date === visibleOverviewDate) ??
    overviewRevenueHistory[overviewRevenueHistory.length - 1] ??
    null;

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
    if (tab !== "settings") {
      setSettingsView("root");
    }
    scrollToSectionTop();
  }, []);

  const adminPageTitle =
    activeTab === "inventory" && selectedInventoryItemId
      ? t("admin.inventory.productDetails")
      : activeTab === "inventory" && selectedProductId
        ? t("admin.inventory.productDetails")
      : activeTab === "team" && selectedStaffSeller
        ? t("admin.team.sellerDetails")
        : activeTab === "team" && selectedTeamStore
          ? t("admin.team.storeDetails")
        : activeTab === "settings" && settingsView === "report-detail"
          ? activeReportPageTitle
        : activeTab === "settings" && settingsView !== "root"
          ? "Отчеты"
      : ({
          overview: t("nav.overview"),
          sales: t("nav.sales"),
          inventory: t("nav.inventory"),
          team: t("nav.team"),
          settings: t("nav.settings"),
        } satisfies Record<AdminTab, string>)[activeTab];

  const selectedInventoryHeaderItem = selectedInventoryItemId
    ? inventoryView.items.find((item) => item.storeProductId === selectedInventoryItemId) ?? null
    : null;
  const adminPageSubtitle =
    activeTab === "inventory" && selectedInventoryHeaderItem
      ? inventoryStores.find((store) => store.id === selectedInventoryStoreId)?.name ??
        selectedInventoryHeaderItem.storeName
      : activeTab === "inventory" && selectedProductId
        ? productCatalogMode === "archive"
          ? t("admin.inventory.productArchiveLabel")
          : t("admin.inventory.productCatalogLabel")
      : activeTab === "settings" && settingsView === "reports-menu"
        ? "Выберите нужный сценарий"
      : activeTab === "settings" && settingsView === "report-detail"
        ? activeReportPageSubtitle
      : null;

  useTelegramBackButton(
    activeTab === "sales"
      ? Boolean(selectedAdminSaleId || selectedAdminReturnId)
      : activeTab === "settings"
        ? settingsView !== "root"
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

      if (activeTab === "settings" && settingsView === "report-detail") {
        setSettingsView("reports-menu");
        return;
      }

      if (activeTab === "settings" && settingsView === "reports-menu") {
        setSettingsView("root");
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

  useEffect(() => {
    if (typeof document === "undefined" || !hasFullscreenAdminTask) {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousHtmlOverscroll = documentElement.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      documentElement.style.overflow = previousHtmlOverflow;
      documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, [hasFullscreenAdminTask]);

  useEffect(() => {
    if (!showNewStoreModal) {
      return;
    }

    const target =
      storeCreateStep === "name" ? storeNameInputRef.current : storeAddressInputRef.current;

    window.setTimeout(() => target?.focus(), 60);
  }, [showNewStoreModal, storeCreateStep]);

  useEffect(() => {
    if (!showNewSellerModal) {
      return;
    }

    const target =
      sellerCreateStep === "name"
        ? sellerNameInputRef.current
        : sellerCreateStep === "telegramId"
          ? sellerTelegramInputRef.current
          : sellerCreateStep === "store"
            ? sellerStoreSelectRef.current
            : null;

    window.setTimeout(() => target?.focus(), 60);
  }, [showNewSellerModal, sellerCreateStep]);

  useEffect(() => {
    if (!showNewProductModal) {
      return;
    }

    const target =
      productCreateStep === "name"
        ? productNameInputRef.current
        : productCreateStep === "price"
          ? productPriceInputRef.current
          : productCreateStep === "sku"
            ? productSkuInputRef.current
            : null;

    window.setTimeout(() => target?.focus(), 60);
  }, [showNewProductModal, productCreateStep]);

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
    let refreshTimerId: number | null = null;

    const scheduleAdminRealtimeRefresh = (event: RetailRealtimeEvent) => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      if (event.type === "connected") {
        return;
      }

      if (refreshTimerId !== null) {
        window.clearTimeout(refreshTimerId);
      }

      refreshTimerId = window.setTimeout(() => {
        refreshTimerId = null;

        const affectsOverview =
          event.type === "sales.updated" ||
          event.type === "inventory.updated" ||
          event.type === "shift.updated" ||
          event.type === "staff.updated" ||
          event.type === "stores.updated" ||
          event.type === "products.updated";

        if (affectsOverview && activeTab !== "overview") {
          void load({ silent: true });
        }

        if (activeTab === "overview" || activeTab === "sales") {
          void refreshActiveAdminTab();
          return;
        }

        if (activeTab === "inventory") {
          if (
            inventoryMode === "stock" &&
            (event.type === "inventory.updated" || event.type === "sales.updated" || event.type === "products.updated")
          ) {
            if (selectedInventoryStoreId) {
              void loadInventory(selectedInventoryStoreId, { silent: true });
            } else {
              void loadInventory(undefined, { silent: true });
            }
            return;
          }

          if (inventoryMode === "products" && event.type === "products.updated") {
            void loadProducts({ archived: productCatalogMode === "archive" });
          }
          return;
        }

        if (
          activeTab === "team" &&
          (event.type === "staff.updated" ||
            event.type === "stores.updated" ||
            event.type === "shift.updated" ||
            event.type === "sales.updated" ||
            event.type === "inventory.updated")
        ) {
          void Promise.allSettled([loadStores({ silent: true }), loadStaff({ silent: true })]);
        }
      }, 180);
    };

    const cleanup = addRealtimeEventListener(scheduleAdminRealtimeRefresh);

    return () => {
      cleanup();
      if (refreshTimerId !== null) {
        window.clearTimeout(refreshTimerId);
      }
    };
  }, [
    activeTab,
    inventoryMode,
    load,
    loadInventory,
    loadProducts,
    loadStaff,
    loadStores,
    productCatalogMode,
    refreshActiveAdminTab,
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

  useEffect(() => {
    const latestDate = overviewRevenueHistory[overviewRevenueHistory.length - 1]?.date;

    if (activeTab !== "overview" || !latestDate) {
      return;
    }

    if (positionedOverviewChartDateRef.current === latestDate) {
      return;
    }

    positionedOverviewChartDateRef.current = latestDate;
    overviewChartScrollReadyRef.current = false;
    setVisibleOverviewDate(latestDate);

    let secondFrameId = 0;
    const frameId = window.requestAnimationFrame(() => {
      const scrollElement = overviewChartScrollRef.current;

      if (!scrollElement) {
        return;
      }

      secondFrameId = window.requestAnimationFrame(() => {
        const latestScrollElement = overviewChartScrollRef.current;

        if (!latestScrollElement) {
          return;
        }

        latestScrollElement.scrollLeft = Math.max(0, latestScrollElement.scrollWidth - latestScrollElement.clientWidth);
        overviewChartScrollReadyRef.current = true;
        setVisibleOverviewDate(latestDate);
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(secondFrameId);
    };
  }, [activeTab, overviewRevenueHistory]);

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
    const matchedPeriod = getMatchingPresetSalesPeriod(salesFilters);
    const key = buildSalesCacheKey({
      period: matchedPeriod ?? salesPeriod,
      storeId: salesFilters?.storeId ?? salesStoreFilter,
      sellerId: salesFilters?.sellerId ?? salesSellerFilter,
      saleStatus: salesFilters?.saleStatus ?? salesStatusFilter,
      dateFrom: salesFilters?.dateFrom ? toDateInputValue(new Date(salesFilters.dateFrom)) : salesDateFrom,
      dateTo: salesFilters?.dateTo ? toDateInputValue(new Date(salesFilters.dateTo)) : salesDateTo,
    });

    setSalesView(snapshot);
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

  const openNewStoreForm = () => {
    setNewStoreName("");
    setNewStoreAddress("");
    setStoreCreateStep("name");
    setShowNewStoreModal(true);
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

  const openNewSellerForm = () => {
    setNewSeller({
      fullName: "",
      telegramId: "",
      storeId: "",
      isActive: true,
    });
    setSellerCreateStep("name");
    setShowNewSellerModal(true);
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

  const formatInventoryProductsInStore = (count: number) => {
    if (locale === "ru") {
      return `${count} ${getRussianPlural(count, "товар", "товара", "товаров")} в этом магазине`;
    }

    if (locale === "pt") {
      return `${count} produtos nesta loja`;
    }

    return `${count} products in this store`;
  };

  const formatInventoryItemsCount = (count: number) => {
    if (locale === "ru") {
      return `${count} ${getRussianPlural(count, "позиция", "позиции", "позиций")}`;
    }

    if (locale === "pt") {
      return `${count} itens`;
    }

    return `${count} items`;
  };

  const formatInventoryStoresEnabled = (count: number) => {
    if (locale === "ru") {
      const storeLabel = getRussianPlural(count, "магазине", "магазинах", "магазинах");
      return `Товар продается в ${count} ${storeLabel}`;
    }

    if (locale === "pt") {
      return `Vendido em ${count} ${count === 1 ? "loja" : "lojas"}`;
    }

    return `Sold in ${count} ${count === 1 ? "store" : "stores"}`;
  };

  const formatInventoryLatestCount = (count: number) => {
    if (locale === "ru") {
      return `${count} последних`;
    }

    if (locale === "pt") {
      return `${count} mais recentes`;
    }

    return `${count} latest`;
  };

  const getRussianPlural = (count: number, one: string, few: string, many: string) => {
    const absCount = Math.abs(count);
    const lastTwo = absCount % 100;
    const lastOne = absCount % 10;

    if (lastTwo >= 11 && lastTwo <= 14) {
      return many;
    }

    if (lastOne === 1) {
      return one;
    }

    if (lastOne >= 2 && lastOne <= 4) {
      return few;
    }

    return many;
  };

  const formatTeamSellerCount = (count: number) => {
    if (locale === "ru") {
      return `${count} ${getRussianPlural(count, "продавец", "продавца", "продавцов")}`;
    }

    if (locale === "pt") {
      return `${count} ${count === 1 ? "vendedor" : "vendedores"}`;
    }

    return `${count} ${count === 1 ? "seller" : "sellers"}`;
  };

  const formatTeamActionCount = (count: number) => {
    if (locale === "ru") {
      return `${count} ${getRussianPlural(count, "действие", "действия", "действий")}`;
    }

    if (locale === "pt") {
      return `${count} ${count === 1 ? "ação" : "ações"}`;
    }

    return `${count} ${count === 1 ? "action" : "actions"}`;
  };

  const formatTeamEventCount = (count: number) => {
    if (locale === "ru") {
      return `${count} ${getRussianPlural(count, "событие", "события", "событий")}`;
    }

    if (locale === "pt") {
      return `${count} ${count === 1 ? "evento" : "eventos"}`;
    }

    return `${count} ${count === 1 ? "event" : "events"}`;
  };

  const formatSalesLedgerEntityCount = (count: number, mode: SalesLedgerMode) => {
    if (locale === "ru") {
      return mode === "sales"
        ? `${count} ${getRussianPlural(count, "продажа", "продажи", "продаж")}`
        : `${count} ${getRussianPlural(count, "возврат", "возврата", "возвратов")}`;
    }

    if (locale === "pt") {
      return mode === "sales"
        ? `${count} ${count === 1 ? "venda" : "vendas"}`
        : `${count} ${count === 1 ? "devolução" : "devoluções"}`;
    }

    return mode === "sales"
      ? `${count} ${count === 1 ? "sale" : "sales"}`
      : `${count} ${count === 1 ? "return" : "returns"}`;
  };

  const formatSaleItemsCount = (count: number) => {
    if (locale === "ru") {
      return `${count} ${getRussianPlural(count, "товар", "товара", "товаров")}`;
    }

    if (locale === "pt") {
      return `${count} ${count === 1 ? "item" : "itens"}`;
    }

    return `${count} ${count === 1 ? "item" : "items"}`;
  };

  const formatTeamLoadedCount = (count: number) => {
    if (locale === "ru") {
      return `${count} ${getRussianPlural(count, "продажа", "продажи", "продаж")}`;
    }

    if (locale === "pt") {
      return `${count} ${count === 1 ? "venda" : "vendas"}`;
    }

    return `${count} ${count === 1 ? "sale" : "sales"}`;
  };

  const handleSaveStoreProduct = async (storeProductId: string) => {
    const draft = inventoryEdits[storeProductId];

    if (!draft) {
      return;
    }

    const parsedPrice = parseDecimalInput(draft.price);

    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      window.alert(t("admin.inventory.invalidPrice"));
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
      window.alert(t("admin.inventory.invalidProduct"));
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

  const openNewProductForm = () => {
    setNewProduct({ name: "", sku: "", defaultPrice: "" });
    setNewProductIsActive(true);
    setProductCreateStep("name");
    setShowNewProductModal(true);
  };

  const handleStoreWizardPrimaryAction = () => {
    if (storeCreateStep === "name") {
      if (!newStoreName.trim()) {
        return;
      }

      setStoreCreateStep("address");
      return;
    }

    void handleCreateStore();
  };

  const handleStoreWizardSecondaryAction = () => {
    if (storeCreateStep === "address") {
      setStoreCreateStep("name");
    }
  };

  const handleSellerWizardPrimaryAction = () => {
    if (sellerCreateStep === "name") {
      if (!newSeller.fullName.trim()) {
        return;
      }

      setSellerCreateStep("telegramId");
      return;
    }

    if (sellerCreateStep === "telegramId") {
      if (!newSeller.telegramId.trim()) {
        return;
      }

      setSellerCreateStep("store");
      return;
    }

    if (sellerCreateStep === "store") {
      setSellerCreateStep("status");
      return;
    }

    void handleCreateSeller();
  };

  const handleSellerWizardSecondaryAction = () => {
    if (sellerCreateStep === "telegramId") {
      setSellerCreateStep("name");
      return;
    }

    if (sellerCreateStep === "store") {
      setSellerCreateStep("telegramId");
      return;
    }

    if (sellerCreateStep === "status") {
      setSellerCreateStep("store");
    }
  };

  const handleProductWizardPrimaryAction = () => {
    if (productCreateStep === "name") {
      if (!newProduct.name.trim()) {
        return;
      }

      setProductCreateStep("price");
      return;
    }

    if (productCreateStep === "price") {
      if (!newProduct.defaultPrice.trim()) {
        return;
      }

      setProductCreateStep("sku");
      return;
    }

    if (productCreateStep === "sku") {
      setProductCreateStep("status");
      return;
    }

    void handleCreateProduct();
  };

  const handleProductWizardSecondaryAction = () => {
    if (productCreateStep === "price") {
      setProductCreateStep("name");
      return;
    }

    if (productCreateStep === "sku") {
      setProductCreateStep("price");
      return;
    }

    if (productCreateStep === "status") {
      setProductCreateStep("sku");
    }
  };

  const handleSaveProduct = async (productId: string) => {
    const draft = productEdits[productId];
    const parsedPrice = parseDecimalInput(draft?.defaultPrice ?? "");

    if (!draft || !draft.name.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      window.alert(t("admin.inventory.invalidProduct"));
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
    setConfirmAction({
      title: t("admin.inventory.deleteProduct"),
      description: t("admin.inventory.confirmDelete", { name: productName }),
      confirmLabel: t("admin.inventory.deleteProduct"),
      icon: "delete",
      tone: "danger",
      onConfirm: async () => {
        try {
          await deleteProduct(productId);
        } catch (error) {
          const message = error instanceof Error ? error.message : t("admin.inventory.deleteFailed");
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
      },
    });
  };

  const handleArchiveProduct = async (productId: string, productName: string) => {
    setConfirmAction({
      title: t("admin.inventory.archiveProduct"),
      description: t("admin.inventory.confirmArchive", { name: productName }),
      confirmLabel: t("admin.inventory.archiveProduct"),
      icon: "archive",
      tone: "danger",
      onConfirm: async () => {
        try {
          await archiveProduct(productId);
        } catch (error) {
          const message = error instanceof Error ? error.message : t("admin.inventory.archiveFailed");
          window.alert(message);
          return;
        }

        setSelectedProductId(null);
        setProductDetailMode("overview");
        setProductCatalogMode("catalog");
      },
    });
  };

  const handleRestoreProduct = async (productId: string, productName: string) => {
    setConfirmAction({
      title: t("admin.inventory.restoreProduct"),
      description: t("admin.inventory.confirmRestore", { name: productName }),
      confirmLabel: t("admin.inventory.restoreProduct"),
      icon: "restore",
      tone: "primary",
      onConfirm: async () => {
        try {
          await restoreProduct(productId);
        } catch (error) {
          const message = error instanceof Error ? error.message : t("admin.inventory.restoreFailed");
          window.alert(message);
          return;
        }

        setSelectedProductId(null);
        setProductDetailMode("overview");
        setProductCatalogMode("catalog");
      },
    });
  };

  const handleSaveProductStoreSetting = async (storeProductId: string) => {
    const draft = productStoreEdits[storeProductId];

    if (!draft) {
      return;
    }

    const parsedPrice = parseDecimalInput(draft.price);

    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      window.alert(t("admin.inventory.invalidPrice"));
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
      window.alert(t("admin.inventory.detailsNotReady"));
      return;
    }

    const parsedQuantity = Number(draft.adjustQuantity);

    if (
      Number.isNaN(parsedQuantity) ||
      (movementType === "manual_adjustment" ? parsedQuantity < 0 : parsedQuantity <= 0)
    ) {
      window.alert(
        movementType === "manual_adjustment"
          ? t("admin.inventory.absoluteQuantityInvalid")
          : t("admin.inventory.quantityInvalid")
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
          ? t("admin.inventory.adminRestockReason")
          : movementType === "writeoff"
            ? t("admin.inventory.adminWriteoffReason")
            : t("admin.inventory.adminSetStockReason", { count: parsedQuantity })),
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
    period?: SalesPeriod;
    storeId?: string;
    sellerId?: string;
    saleStatus?: "all" | "completed" | "deleted";
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const nextPeriod = overrides?.period ?? salesPeriod;
    const nextStoreId = overrides?.storeId ?? salesStoreFilter;
    const nextSellerId = overrides?.sellerId ?? salesSellerFilter;
    const nextSaleStatus = overrides?.saleStatus ?? salesStatusFilter;
    const rawDateFrom = overrides?.dateFrom ?? salesDateFrom;
    const rawDateTo = overrides?.dateTo ?? salesDateTo;
    const nextDateFrom =
      rawDateFrom && rawDateTo && rawDateFrom > rawDateTo ? rawDateTo : rawDateFrom;
    const nextDateTo =
      rawDateFrom && rawDateTo && rawDateFrom > rawDateTo ? rawDateFrom : rawDateTo;
    const cachedSnapshot = salesCache[
      buildSalesCacheKey({
        period: nextPeriod,
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
    } catch {
      // The store keeps the previous ledger and exposes the error globally; no layout jump is needed here.
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
    await handleApplySalesFilters({ period, dateFrom: range.from, dateTo: range.to });
  };

  const renderDashboard = () => (
    <VStack gap={4} align="stretch">
      <SimpleGrid columns={2} gap={3}>
        {[
          {
            label: t("admin.overview.todayRevenue"),
            value: dashboardData ? formatEur(dashboardData.summary.totalRevenueToday) : null,
          },
          {
            label: t("admin.overview.salesToday"),
            value: dashboardData ? String(dashboardData.summary.completedSalesToday) : null,
          },
          {
            label: t("admin.overview.lowStock"),
            value: dashboardData ? String(dashboardData.summary.lowStockCount) : null,
          },
          {
            label: t("admin.overview.activeSellers"),
            value: dashboardData ? String(dashboardData.summary.activeShifts) : null,
          },
        ].map((card) => (
          <Box
            key={card.label}
            bg={panelSurface}
            borderRadius="22px"
            px={4}
            py={4}
            boxShadow={panelShadow}
            {...getLowStockCardProps(
              card.label === t("admin.overview.lowStock") && Boolean(dashboardData && dashboardData.summary.lowStockCount > 0)
            )}
          >
            <Text fontSize="xs" textTransform="uppercase" color="surface.500" letterSpacing="0.08em">
              {card.label}
            </Text>
            {card.value ? (
              <Text fontSize="2xl" fontWeight="900" mt={2}>
                {card.value}
              </Text>
            ) : (
              <Box mt={3}>{renderAdminSkeletonLine("72px", "32px", "14px")}</Box>
            )}
          </Box>
        ))}
      </SimpleGrid>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" gap={4}>
          <HStack justify="space-between" align="center">
            <VStack align="start" gap={0}>
              <Text fontWeight="900" fontSize="lg">
                {t("admin.overview.revenueFlow")}
              </Text>
              <Text color="surface.500" fontSize="sm">
                {t("admin.overview.revenueFlowDescription")}
              </Text>
            </VStack>
            {visibleOverviewDay ? (
              <VStack align="end" gap={0} flexShrink={0}>
                <Text fontSize={{ base: "lg", sm: "xl" }} fontWeight="900" color="surface.700" lineHeight="1">
                  {formatEur(visibleOverviewDay.total)}
                </Text>
                <Text color="surface.500" fontSize="xs" fontWeight="800" mt={1}>
                  {formatOverviewChartDateLabel(visibleOverviewDay.date)}
                </Text>
              </VStack>
            ) : null}
          </HStack>

          {dashboardData ? (
            <VStack align="stretch" gap={2}>
              {(() => {
                const chartDays = overviewRevenueHistory.length > 0 ? overviewRevenueHistory : getOverviewRevenueHistory(dashboardData);
                const todayKey = getBusinessDateKey();
                const currentBusinessHour = getCurrentBusinessHour();
                const maxHourTotal = Math.max(
                  ...chartDays.flatMap((day) =>
                    day.hours
                      .filter((entry) => day.date !== todayKey || entry.hour <= currentBusinessHour || entry.total > 0)
                      .map((entry) => entry.total)
                  ),
                  1
                );

                return (
                  <Box mx={-1}>
                    <HStack
                      ref={overviewChartScrollRef}
                      align="end"
                      gap={2.5}
                      overflowX="auto"
                      overscrollBehaviorX="contain"
                      scrollSnapType="x mandatory"
                      px={1}
                      pb={1}
                      onScroll={handleOverviewChartScroll}
                    >
                      {chartDays.map((day) => (
                        <VStack
                          key={day.date}
                          align="stretch"
                          gap={2}
                          flex="0 0 100%"
                          minW={0}
                          scrollSnapAlign="start"
                        >
                          <Box
                            display="grid"
                            gridTemplateColumns="repeat(24, minmax(0, 1fr))"
                            columnGap={{ base: 1, sm: 1.5 }}
                            h="164px"
                            px={1}
                            overflow="hidden"
                            onPointerLeave={() => setSelectedOverviewHour(null)}
                          >
                            {day.hours.map((entry) => {
                              const isFutureHour =
                                day.date === todayKey && entry.hour > currentBusinessHour && entry.total <= 0;
                              const height = isFutureHour ? 12 : Math.max(12, (entry.total / maxHourTotal) * 132);
                              const isActiveHour = !isFutureHour && entry.total > 0;
                              const isSelected =
                                selectedOverviewHour?.date === day.date && selectedOverviewHour.hour === entry.hour;

                              return (
                                <VStack key={`${day.date}-${entry.hour}`} minW={0} gap={2} align="center" justify="end" h="full">
                                  <Text
                                    fontSize="10px"
                                    fontWeight="900"
                                    color="surface.700"
                                    opacity={isSelected ? 1 : 0}
                                    lineClamp={1}
                                    h="12px"
                                    lineHeight="12px"
                                  >
                                    {isSelected ? entry.total.toFixed(0) : ""}
                                  </Text>
                                  <Box
                                    w="full"
                                    maxW={{ base: "9px", sm: "12px" }}
                                    h={`${height}px`}
                                    borderRadius="999px"
                                    cursor={isFutureHour ? "default" : "pointer"}
                                    transition="all 0.18s ease"
                                    bg={
                                      isFutureHour
                                        ? "rgba(226,224,218,0.55)"
                                        : isActiveHour
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
                                    asChild
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedOverviewHour(isFutureHour ? null : { date: day.date, hour: entry.hour })
                                      }
                                    />
                                  </Box>
                                </VStack>
                              );
                            })}
                          </Box>

                          <Box
                            display="grid"
                            gridTemplateColumns="repeat(24, minmax(0, 1fr))"
                            columnGap={{ base: 1, sm: 1.5 }}
                            h="12px"
                            px={1}
                          >
                            {[0, 3, 6, 9, 12, 15, 18, 21, 23].map((hour) => (
                              <Text
                                key={`${day.date}-${hour}`}
                                gridColumn={`${hour + 1}`}
                                fontSize="10px"
                                color="surface.500"
                                fontWeight="700"
                                lineHeight="12px"
                                textAlign="center"
                                whiteSpace="nowrap"
                              >
                                {String(hour).padStart(2, "0")}
                              </Text>
                            ))}
                          </Box>
                        </VStack>
                      ))}
                    </HStack>
                  </Box>
                );
              })()}
            </VStack>
          ) : null}
        </VStack>
      </Box>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" gap={3}>
          <HStack justify="space-between">
              <Text fontWeight="900" fontSize="lg">
              {t("admin.overview.recentSales")}
            </Text>
            <Text color="surface.500" fontWeight="700" fontSize="sm">
              {(dashboardData?.recentSales ?? []).slice(0, 5).length} {t("admin.overview.latest")}
            </Text>
          </HStack>
          {(dashboardData?.recentSales ?? []).slice(0, 5).map((sale) => (
            <HStack key={sale.id} justify="space-between" align="start">
              <VStack align="start" gap={0}>
                <Text fontWeight="800">{sale.store?.name ?? t("admin.sales.unknownStore")}</Text>
                <Text fontSize="sm" color="surface.500">
                  {sale.seller?.fullName ?? t("admin.sales.unknownSeller")} · {formatAdminPaymentMethod(sale.paymentMethod)}
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
        <VStack align="stretch" gap={3}>
          <HStack justify="space-between">
              <Text fontWeight="900" fontSize="lg">
              {t("admin.overview.storePerformance")}
            </Text>
            <Text color="surface.500" fontWeight="700" fontSize="sm">
              {formatOverviewStoreCount(dashboardData?.storePerformance.length ?? 0, locale)}
            </Text>
          </HStack>
          {(dashboardData?.storePerformance ?? []).map((store) => (
            <Box key={store.id} bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
              <HStack justify="space-between" align="start">
                <VStack align="start" gap={0}>
                  <Text fontWeight="800">{store.name}</Text>
                  <Text fontSize="sm" color="surface.500">
                    {store.address?.trim() || t("admin.overview.addressMissing")}
                  </Text>
                  <Text fontSize="xs" color="surface.500">
                    {store.stockUnits} {t("admin.overview.unitsInStock")}
                  </Text>
                </VStack>
                <VStack align="end" gap={0.5}>
                  <Text fontWeight="900">{formatEur(store.revenue)}</Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="700">
                    {formatOverviewSalesCount(store.salesCount, locale)}
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
    <VStack gap={4} align="stretch">
      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" gap={3}>
        <VStack align="start" gap={0}>
          <Text fontWeight="900" fontSize="lg">
            {t("admin.team.storeDirectory")}
          </Text>
          <Text color="surface.500" fontSize="sm" fontWeight="700">
            {t("admin.team.storeDirectoryDescription")}
          </Text>
        </VStack>

          {stores.map((store) => (
            <Box
              textAlign="left"
              bg={panelMutedSurface}
              borderRadius="18px"
              px={3}
              py={3}
              border={0}
              asChild><button
                key={store.id}
                type="button"
                onClick={() => {
                  setSelectedTeamStoreId(store.id);
                  setStoreDetailMode("overview");
                  setStoreActivityPage(0);
                  scrollToSectionTop();
                }}>
                <HStack justify="space-between" align="center" gap={3}>
                  <VStack align="start" gap={0} minW={0}>
                    <Text fontWeight="900" lineClamp={1}>
                      {store.name}
                    </Text>
                    <Text fontSize="sm" color="surface.500" fontWeight="700" lineClamp={1}>
                      {store.address || `${t("admin.team.created")} ${formatShortDate(store.createdAt)}`}
                    </Text>
                  </VStack>

                  <Box flexShrink={0}>
                    <StatusPill
                      label={store.isActive ? t("admin.team.active") : t("admin.team.inactive")}
                      tone={store.isActive ? "green" : "red"}
                    />
                  </Box>
                </HStack>
              </button></Box>
          ))}

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
        title: sale.status === "deleted" ? t("admin.team.saleDeleted") : t("admin.team.saleCompleted"),
        meta: `${sale.seller?.fullName ?? t("admin.team.unknownSeller")} · ${formatEur(sale.totalAmount)} · ${formatAdminPaymentMethod(sale.paymentMethod)}`,
        date: sale.createdAt,
        icon: LuReceiptText,
        iconLabel: sale.status === "deleted" ? t("admin.team.deleted") : t("admin.team.sale"),
        iconBg: sale.status === "deleted" ? "rgba(248,113,113,0.14)" : "rgba(34,197,94,0.12)",
        iconColor: sale.status === "deleted" ? "red.500" : "green.600",
      })),
      ...storeReturns.map((entry) => ({
        id: `return-${entry.id}`,
        title: t("admin.team.returnCreated"),
        meta: `${entry.seller?.fullName ?? t("admin.team.unknownSeller")} · ${formatEur(entry.totalAmount)}`,
        date: entry.createdAt,
        icon: LuActivity,
        iconLabel: t("admin.team.return"),
        iconBg: "rgba(251,191,36,0.18)",
        iconColor: "orange.500",
      })),
      ...activeStoreShifts.map((seller) => ({
        id: `shift-${seller.activeShift?.id ?? seller.id}`,
        title: seller.activeShift?.status === "paused" ? t("admin.team.shiftPausedEvent") : t("admin.team.shiftStartedEvent"),
        meta: seller.fullName,
        date: seller.activeShift?.startedAt ?? new Date().toISOString(),
        icon: LuClock3,
        iconLabel: t("admin.team.shift"),
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
        <VStack gap={4} align="stretch">
        <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
          <VStack align="stretch" gap={4}>
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
                  {t("admin.inventory.back")}
                </Button>
              </HStack>
            ) : null}

            <HStack justify="space-between" align="center">
              <VStack align="start" gap={0} minW={0}>
                <Text fontWeight="900" fontSize="xl" lineClamp={1}>
                  {store.name}
                </Text>
                <Text fontSize="sm" color="surface.500" fontWeight="700" lineClamp={1}>
                  {store.address || t("admin.overview.addressMissing")}
                </Text>
              </VStack>
              <StatusPill label={store.isActive ? t("admin.team.active") : t("admin.team.inactive")} tone={store.isActive ? "green" : "red"} />
            </HStack>
          </VStack>
        </Box>

        <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
          <HStack gap={2} overflowX="auto" pb={1}>
            {(["overview", "profile", "staff", "activity"] as StoreDetailMode[]).map((mode) => {
              const isActive = storeDetailMode === mode;

              return (
                <Button
                  key={mode}
                  size="sm"
                  flex="1"
                  minW={0}
                  borderRadius="999px"
                  px={2}
                  fontSize="sm"
                  bg={isActive ? "surface.900" : "transparent"}
                  color={isActive ? "white" : "surface.500"}
                  _hover={{ bg: isActive ? "surface.900" : panelMutedSurface }}
                  onPointerDown={activateSegmentOnPointerDown(`store-detail-${mode}`, () => setStoreDetailMode(mode))}
                  onClick={activateSegmentOnClick(`store-detail-${mode}`, () => setStoreDetailMode(mode))}
                >
                  {mode === "overview"
                    ? t("admin.team.overviewTab")
                    : mode === "profile"
                      ? t("admin.team.profileTab")
                      : mode === "staff"
                        ? t("admin.team.staffMembersTab")
                        : t("admin.team.activityTab")}
                </Button>
              );
            })}
          </HStack>
        </Box>

        {storeDetailMode === "overview" ? (
          <VStack gap={4} align="stretch">
            <SimpleGrid columns={2} gap={3}>
              {[
                { label: t("admin.overview.todayRevenue"), value: formatEur(store.revenueToday) },
                { label: t("admin.overview.salesToday"), value: String(store.salesCount) },
                { label: t("admin.sales.units"), value: String(store.stockUnits) },
                { label: t("admin.overview.lowStock"), value: String(store.lowStockCount) },
              ].map((card) => (
                <Box
                  key={card.label}
                  bg={panelSurface}
                  borderRadius="22px"
                  px={4}
                  py={4}
                  boxShadow={panelShadow}
                  {...getLowStockCardProps(card.label === t("admin.overview.lowStock") && store.lowStockCount > 0)}
                >
                  <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em">
                    {card.label}
                  </Text>
                  <Text mt={2} fontWeight="900" fontSize="2xl" lineClamp={1}>
                    {card.value}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>

            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" gap={3}>
                <HStack justify="space-between">
                  <Text fontWeight="900" fontSize="lg">
                    {t("admin.team.storeSnapshot")}
                  </Text>
                  <Text color="surface.500" fontSize="sm" fontWeight="800">
                    {formatTeamSellerCount(assignedStaff.length)}
                  </Text>
                </HStack>
                {[
                  { label: t("admin.team.address"), value: store.address || t("admin.overview.addressMissing") },
                  { label: t("admin.team.activeShifts"), value: String(store.activeShiftCount) },
                  { label: t("admin.team.allTimeRevenue"), value: formatEur(store.revenueAllTime) },
                  { label: t("admin.team.created"), value: formatShortDate(store.createdAt) },
                ].map((item) => (
                  <HStack key={item.label} justify="space-between" bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                    <Text color="surface.500" fontSize="sm" fontWeight="800">
                      {item.label}
                    </Text>
                    <Text fontWeight="900" textAlign="right" maxW="58%" lineClamp={2}>
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
            <VStack align="stretch" gap={4}>
              <VStack align="start" gap={0}>
                <Text fontWeight="900" fontSize="lg">
                  {t("admin.team.storeProfile")}
                </Text>
                <Text color="surface.500" fontSize="sm" fontWeight="700">
                  {t("admin.team.storeProfileDescription")}
                </Text>
              </VStack>

              <VStack align="stretch" gap={2}>
                <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                  {t("admin.team.storeName")}
                </Text>
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    setStoreEdits((current) => ({
                      ...current,
                      [store.id]: { ...draft, name: event.target.value },
                    }))
                  }
                  placeholder={t("admin.team.storeName")}
                  borderRadius="16px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />
              </VStack>

              <VStack align="stretch" gap={2}>
                <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                  {t("admin.team.address")}
                </Text>
                <Input
                  value={draft.address}
                  onChange={(event) =>
                    setStoreEdits((current) => ({
                      ...current,
                      [store.id]: { ...draft, address: event.target.value },
                    }))
                  }
                  placeholder={t("admin.team.addressPlaceholder")}
                  borderRadius="16px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />
              </VStack>

              <SimpleGrid columns={2} gap={2}>
                {[
                  { label: t("admin.team.enabled"), value: true },
                  { label: t("admin.team.disabled"), value: false },
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
                loading={Boolean(pendingStoreIds[store.id])}
                onClick={() => void handleSaveStore(store.id)}
              >
                {t("admin.team.saveStore")}
              </Button>
            </VStack>
          </Box>
        ) : null}

        {storeDetailMode === "staff" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" gap={3}>
              <HStack justify="space-between">
                <Text fontWeight="900" fontSize="lg">
                  {t("admin.team.assignedStaff")}
                </Text>
                <Text color="surface.500" fontSize="sm" fontWeight="800">
                  {formatTeamSellerCount(assignedStaff.length)}
                </Text>
              </HStack>

              {assignedStaff.length ? (
                assignedStaff.map((seller) => {
                  const status = getSellerStatus(seller);

                  return (
                    <Box
                      textAlign="left"
                      bg={panelMutedSurface}
                      borderRadius="18px"
                      px={3}
                      py={3}
                      border={0}
                      asChild><button
                          key={seller.id}
                          type="button"
                          onClick={() => {
                            setSelectedStaffSellerId(seller.id);
                            setStaffDetailMode("overview");
                            setStaffActivityPage(0);
                            scrollToSectionTop();
                          }}>
                          <HStack justify="space-between" align="center">
                            <HStack gap={3} minW={0}>
                              <Avatar.Root size="sm" bg="surface.200" color="surface.800"><Avatar.Fallback name={seller.fullName} /></Avatar.Root>
                              <VStack align="start" gap={0} minW={0}>
                                <Text fontWeight="900" lineClamp={1}>
                                  {seller.fullName}
                                </Text>
                                <Text fontSize="sm" color="surface.500" fontWeight="700" lineClamp={1}>
                                  {seller.salesCount} {t("admin.team.sales").toLowerCase()} · {formatEur(seller.revenue)}
                                </Text>
                              </VStack>
                            </HStack>
                            <StatusPill label={status.label} tone={status.tone} />
                          </HStack>
                        </button></Box>
                  );
                })
              ) : (
                <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={4}>
                  <Text fontWeight="900">{t("admin.team.noAssignedSellers")}</Text>
                  <Text color="surface.500" fontSize="sm" mt={1}>
                    {t("admin.team.noAssignedSellersHint")}
                  </Text>
                </Box>
              )}
            </VStack>
          </Box>
        ) : null}

        {storeDetailMode === "activity" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" gap={3}>
              <HStack justify="space-between">
                <Text fontWeight="900" fontSize="lg">
                  {t("admin.team.activityFeed")}
                </Text>
                <Text color="surface.500" fontSize="sm" fontWeight="800">
                  {formatTeamEventCount(activityItems.length)}
                </Text>
              </HStack>

              {visibleActivityItems.length ? (
                visibleActivityItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <HStack key={item.id} gap={3} align="center" bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
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
                      <VStack align="start" gap={0} minW={0} flex="1">
                        <Text fontWeight="900" lineClamp={1}>
                          {item.title}
                        </Text>
                        <Text fontSize="sm" color="surface.500" fontWeight="700" lineClamp={1}>
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
                  <Text fontWeight="900">{t("admin.team.noRecentActivity")}</Text>
                  <Text color="surface.500" fontSize="sm" mt={1}>
                    {t("admin.team.noRecentActivityHint")}
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
                    disabled={safeActivityPage === 0}
                    onClick={() => setStoreActivityPage((page) => Math.max(0, page - 1))}
                  >
                    {t("admin.team.previous")}
                  </Button>
                  <Text color="surface.500" fontSize="sm" fontWeight="800">
                    {t("admin.team.page")} {safeActivityPage + 1} {t("admin.team.of")} {activityTotalPages}
                  </Text>
                  <Button
                    size="sm"
                    borderRadius="14px"
                    bg={panelMutedSurface}
                    color="surface.700"
                    disabled={safeActivityPage >= activityTotalPages - 1}
                    onClick={() => setStoreActivityPage((page) => Math.min(activityTotalPages - 1, page + 1))}
                  >
                    {t("admin.team.next")}
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
      { label: t("admin.inventory.totalUnits"), value: String(totalUnits) },
      { label: t("admin.inventory.lowStock"), value: String(lowStockCount) },
    ];
    const itemMovementHistory = selectedItem
      ? visibleInventoryHistory.filter((entry) => entry.product?.id === selectedItem.productId).slice(0, 6)
      : [];
    const getInventoryMovementUi = (movementType: string, quantityDelta: number) => {
      if (movementType === "sale") {
        return {
          title: t("admin.inventory.sale"),
          icon: LuReceiptText,
          iconBg: "rgba(74,132,244,0.14)",
          iconColor: "brand.600",
        };
      }

      if (movementType === "return") {
        return {
          title: t("admin.inventory.return"),
          icon: LuReceiptText,
          iconBg: "rgba(34,197,94,0.12)",
          iconColor: "green.600",
        };
      }

      if (movementType === "restock") {
        return {
          title: t("admin.inventory.restock"),
          icon: LuPlus,
          iconBg: "rgba(74,132,244,0.14)",
          iconColor: "brand.600",
        };
      }

      if (movementType === "writeoff") {
        return {
          title: t("admin.inventory.writeoff"),
          icon: LuMinus,
          iconBg: "rgba(248,113,113,0.14)",
          iconColor: "red.500",
        };
      }

      if (movementType === "manual_adjustment") {
        return {
          title: t("admin.inventory.setStock"),
          icon: quantityDelta >= 0 ? LuPlus : LuMinus,
          iconBg: quantityDelta >= 0 ? "rgba(34,197,94,0.12)" : "rgba(248,113,113,0.14)",
          iconColor: quantityDelta >= 0 ? "green.600" : "red.500",
        };
      }

      if (movementType === "sale_deletion") {
        return {
          title: t("admin.inventory.saleDeleted"),
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
        <VStack gap={4} align="stretch">
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" gap={4}>
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
                    {t("admin.inventory.back")}
                  </Button>
                </HStack>
              ) : null}

              <HStack justify="space-between" align="center" gap={3}>
                <VStack align="start" gap={0} minW={0}>
                  <Text fontWeight="900" fontSize="xl" lineClamp={2}>
                    {selectedProduct.name}
                  </Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="700" lineClamp={1}>
                    {selectedProduct.isArchived
                      ? `${t("admin.inventory.archived")} ${selectedProduct.archivedAt ? formatShortDate(selectedProduct.archivedAt) : ""}`.trim()
                      : formatInventoryStoresEnabled(selectedProduct.enabledStoreCount)}
                  </Text>
                </VStack>
                <StatusPill
                  label={
                    selectedProduct.isArchived
                      ? t("admin.inventory.archived")
                      : selectedProduct.isActive
                        ? t("admin.inventory.active")
                        : t("admin.inventory.inactive")
                  }
                  tone={selectedProduct.isArchived ? "orange" : selectedProduct.isActive ? "green" : "red"}
                />
              </HStack>
            </VStack>
          </Box>
          <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
            <HStack gap={2}>
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
                  onPointerDown={activateSegmentOnPointerDown(`product-detail-${mode}`, () => setProductDetailMode(mode))}
                  onClick={activateSegmentOnClick(`product-detail-${mode}`, () => setProductDetailMode(mode))}
                >
                    {mode === "overview"
                      ? t("admin.inventory.overviewTab")
                      : mode === "settings"
                        ? t("admin.inventory.settingsTab")
                        : t("admin.inventory.storesTab")}
                  </Button>
                );
              })}
            </HStack>
          </Box>
          {productDetailMode === "overview" ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" gap={3}>
                <SimpleGrid columns={2} gap={3}>
                  {[
                    { label: t("admin.inventory.defaultPrice"), value: formatEur(selectedProduct.defaultPrice) },
                    {
                      label: t("admin.inventory.status"),
                      value: selectedProduct.isArchived
                        ? t("admin.inventory.archived")
                        : selectedProduct.isActive
                          ? t("admin.inventory.active")
                          : t("admin.inventory.inactive"),
                    },
                    { label: t("admin.inventory.storesEnabled"), value: `${selectedProduct.enabledStoreCount}` },
                    {
                      label: selectedProduct.isArchived ? t("admin.inventory.archived") : t("admin.inventory.updated"),
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
              <VStack align="stretch" gap={3}>
                <VStack align="stretch" gap={2}>
                  <Text fontSize="10px" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                    {t("admin.inventory.productName")}
                  </Text>
                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      setProductEdits((current) => ({
                        ...current,
                        [selectedProduct.id]: { ...draft, name: event.target.value },
                      }))
                    }
                    placeholder={t("admin.inventory.productName")}
                    borderRadius="18px"
                    bg="white"
                    borderColor="rgba(226,224,218,0.95)"
                  />
                </VStack>

                <VStack align="stretch" gap={2}>
                  <Text fontSize="10px" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                    {t("admin.inventory.defaultPrice")}
                  </Text>
                  <Input
                    value={draft.defaultPrice}
                    onChange={(event) =>
                      setProductEdits((current) => ({
                        ...current,
                        [selectedProduct.id]: { ...draft, defaultPrice: event.target.value },
                      }))
                    }
                    placeholder={t("admin.inventory.defaultPrice")}
                    inputMode="decimal"
                    borderRadius="18px"
                    bg="white"
                    borderColor="rgba(226,224,218,0.95)"
                  />
                </VStack>

                <SimpleGrid columns={2} gap={2}>
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
                    {t("admin.inventory.active")}
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
                    {t("admin.inventory.inactive")}
                  </Button>
                </SimpleGrid>

                <Button
                  h="52px"
                  borderRadius="18px"
                  bg="surface.900"
                  color="white"
                  _hover={{ bg: "surface.700" }}
                  loading={Boolean(pendingProductIds[selectedProduct.id])}
                  onClick={() => void handleSaveProduct(selectedProduct.id)}
                >
                  {t("admin.inventory.saveProduct")}
                </Button>

                {selectedProduct.isArchived ? (
                  <>
                    <Button
                      size="sm"
                      borderRadius="14px"
                      variant="ghost"
                      color="brand.600"
                      _hover={{ bg: "rgba(74,132,244,0.12)" }}
                      loading={Boolean(pendingProductIds[selectedProduct.id])}
                      onClick={() => void handleRestoreProduct(selectedProduct.id, selectedProduct.name)}
                    >
                      {t("admin.inventory.restoreProduct")}
                    </Button>
                    <Button
                      size="sm"
                      borderRadius="14px"
                      variant="ghost"
                      color="red.500"
                      _hover={{ bg: "rgba(248,113,113,0.12)" }}
                      loading={Boolean(pendingProductIds[selectedProduct.id])}
                      onClick={() => void handleDeleteProduct(selectedProduct.id, selectedProduct.name)}
                    >
                      {t("admin.inventory.deleteProduct")}
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
                      loading={Boolean(pendingProductIds[selectedProduct.id])}
                      onClick={() => void handleDeleteProduct(selectedProduct.id, selectedProduct.name)}
                    >
                      {t("admin.inventory.deleteProduct")}
                    </Button>
                    <Button
                      size="sm"
                      borderRadius="14px"
                      variant="ghost"
                      color="surface.700"
                      _hover={{ bg: "rgba(18,18,18,0.06)" }}
                      loading={Boolean(pendingProductIds[selectedProduct.id])}
                      onClick={() => void handleArchiveProduct(selectedProduct.id, selectedProduct.name)}
                    >
                      {t("admin.inventory.archiveProduct")}
                    </Button>
                  </>
                )}
              </VStack>
            </Box>
          ) : null}
          {productDetailMode === "stores" ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" gap={3}>
                <VStack align="start" gap={0}>
                  <Text fontWeight="900" fontSize="lg">
                    {t("admin.inventory.storeAvailability")}
                  </Text>
                  <Text color="surface.500" fontSize="sm" fontWeight="700">
                    {t("admin.inventory.storeAvailabilityDescription")}
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
                      <VStack align="stretch" gap={3}>
                        <HStack justify="space-between" align="center" gap={3}>
                          <VStack align="start" gap={0} minW={0}>
                            <Text fontWeight="900" lineClamp={1}>
                              {setting.storeName}
                            </Text>
                            <Text fontSize="sm" color="surface.500" fontWeight="700" lineClamp={1}>
                              {storeInfo?.address?.trim() || t("admin.inventory.storeLocationMissing")}
                            </Text>
                          </VStack>
                          <StatusPill
                            label={storeDraft.isEnabled ? t("admin.inventory.enabled") : t("admin.inventory.disabled")}
                            tone={storeDraft.isEnabled ? "green" : "red"}
                          />
                        </HStack>

                        <VStack align="stretch" gap={2}>
                          <Text fontSize="10px" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                            {t("admin.inventory.storePrice")}
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
                            placeholder={t("admin.inventory.storePrice")}
                            inputMode="decimal"
                            borderRadius="16px"
                            bg="white"
                            borderColor="rgba(226,224,218,0.95)"
                          />
                        </VStack>

                        <SimpleGrid columns={2} gap={2}>
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
                            {t("admin.inventory.enabled")}
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
                            {t("admin.inventory.disabled")}
                          </Button>
                        </SimpleGrid>

                        <Button
                          h="48px"
                          borderRadius="16px"
                          bg="surface.900"
                          color="white"
                          _hover={{ bg: "surface.700" }}
                          loading={Boolean(pendingStoreProductIds[setting.storeProductId])}
                          onClick={() => void handleSaveProductStoreSetting(setting.storeProductId)}
                        >
                          {t("admin.inventory.saveStoreSettings")}
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
        movementType === "restock"
          ? t("admin.inventory.restock")
          : movementType === "writeoff"
            ? t("admin.inventory.writeoff")
            : t("admin.inventory.setStock");
      const movementTone =
        movementType === "restock"
          ? { bg: "brand.500", hover: "brand.600", color: "white" }
          : movementType === "writeoff"
            ? { bg: "rgba(248,113,113,0.14)", hover: "rgba(248,113,113,0.22)", color: "red.500" }
            : { bg: "surface.900", hover: "surface.700", color: "white" };
      const isProductAvailable = draft.isEnabled && selectedItem.isProductActive;

      return (
        <VStack gap={4} align="stretch">
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" gap={4}>
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
                    {t("admin.inventory.back")}
                  </Button>
                </HStack>
              ) : null}

              <HStack justify="space-between" align="center" gap={3}>
                <VStack align="start" gap={0} minW={0}>
                  <Text fontWeight="900" fontSize="xl" lineClamp={2}>
                    {selectedItem.productName}
                  </Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="700" lineClamp={1}>
                    {selectedStore?.name ?? selectedItem.storeName}
                  </Text>
                </VStack>
                <VStack align="end" gap={1} flexShrink={0}>
                  <StatusPill
                    label={`${selectedItem.stockQuantity} ${t("admin.inventory.units")}`}
                    tone={selectedItem.stockQuantity <= 10 ? "orange" : "blue"}
                  />
                  <StatusPill
                    label={isProductAvailable ? t("admin.inventory.active") : t("admin.inventory.inactive")}
                    tone={isProductAvailable ? "green" : "red"}
                  />
                </VStack>
              </HStack>
            </VStack>
          </Box>
          <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
            <HStack gap={2}>
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
                  onPointerDown={activateSegmentOnPointerDown(`inventory-detail-${mode}`, () => setInventoryDetailMode(mode))}
                  onClick={activateSegmentOnClick(`inventory-detail-${mode}`, () => setInventoryDetailMode(mode))}
                >
                    {mode === "overview"
                      ? t("admin.inventory.overviewTab")
                      : mode === "settings"
                        ? t("admin.inventory.settingsTab")
                        : t("admin.inventory.stockTab")}
                  </Button>
                );
              })}
            </HStack>
          </Box>
          {inventoryDetailMode === "overview" ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" gap={3}>
                <HStack justify="space-between">
                  <Text fontWeight="900" fontSize="lg">
                    {t("admin.inventory.productOverview")}
                  </Text>
                  <Text color="surface.500" fontWeight="800" fontSize="sm">
                    {t("admin.inventory.updated")} {formatShortDate(selectedItem.updatedAt)}
                  </Text>
                </HStack>

                <SimpleGrid columns={2} gap={3}>
                  {[
                    { label: t("admin.inventory.storePrice"), value: formatEur(selectedItem.storePrice) },
                    { label: t("admin.inventory.defaultPrice"), value: formatEur(selectedItem.defaultPrice) },
                    { label: t("admin.inventory.currentStock"), value: `${selectedItem.stockQuantity}` },
                    { label: t("admin.inventory.status"), value: isProductAvailable ? t("admin.inventory.active") : t("admin.inventory.inactive") },
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

                <VStack align="stretch" gap={0}>
                  <HStack justify="space-between" pb={2}>
                    <Text fontWeight="900" fontSize="lg">
                      {t("admin.inventory.recentMovements")}
                    </Text>
                    <Text color="surface.500" fontWeight="800" fontSize="sm">
                      {formatInventoryLatestCount(itemMovementHistory.length)}
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
                          <VStack align="start" gap={0} minW={0} flex="1">
                            <Text fontWeight="900" lineClamp={1}>
                              {movementUi.title}
                            </Text>
                            {movementMeta ? (
                              <Text fontSize="sm" color="surface.500" fontWeight="700" lineClamp={1}>
                                {movementMeta}
                              </Text>
                            ) : null}
                            <Text fontSize="xs" color="surface.500" fontWeight="700" lineClamp={1}>
                              {formatDateTime(entry.createdAt)} · {entry.actor?.full_name ?? t("admin.inventory.unknownActor")}
                            </Text>
                          </VStack>
                          <VStack align="end" gap={0} flexShrink={0}>
                            <Text fontWeight="900" color={entry.quantityDelta >= 0 ? "green.500" : "red.400"}>
                              {entry.quantityDelta >= 0 ? "+" : ""}
                              {entry.quantityDelta}
                            </Text>
                            <Text fontSize="10px" color="surface.500" fontWeight="800" textTransform="uppercase">
                              {t("admin.inventory.units")}
                            </Text>
                          </VStack>
                        </HStack>
                      );
                    })
                  ) : (
                    <Text color="surface.500" fontSize="sm" py={2}>
                      {t("admin.inventory.noRecentMovements")}
                    </Text>
                  )}
                </VStack>
              </VStack>
            </Box>
          ) : null}
          {inventoryDetailMode === "settings" ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" gap={3}>
                <VStack align="start" gap={0}>
                  <Text fontWeight="900" fontSize="lg">
                    {t("admin.inventory.priceAvailability")}
                  </Text>
                  <Text color="surface.500" fontSize="sm" fontWeight="700">
                    {t("admin.inventory.priceAvailabilityDescription")}
                  </Text>
                </VStack>

                <VStack align="stretch" gap={2}>
                  <Text fontSize="10px" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                    {t("admin.inventory.storePrice")}
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
                    placeholder={t("admin.inventory.storePrice")}
                    inputMode="decimal"
                    borderRadius="18px"
                    bg="white"
                    borderColor="rgba(226,224,218,0.95)"
                  />
                </VStack>

                <SimpleGrid columns={2} gap={2}>
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
                    {t("admin.inventory.enabled")}
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
                    {t("admin.inventory.disabled")}
                  </Button>
                </SimpleGrid>

                <Button
                  h="52px"
                  borderRadius="18px"
                  bg="surface.900"
                  color="white"
                  _hover={{ bg: "surface.700" }}
                  loading={Boolean(pendingStoreProductIds[selectedItem.storeProductId])}
                  onClick={() => void handleSaveStoreProduct(selectedItem.storeProductId)}
                >
                  {t("admin.inventory.savePriceStatus")}
                </Button>
              </VStack>
            </Box>
          ) : null}
          {inventoryDetailMode === "stock" ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" gap={3}>
                <VStack align="start" gap={0}>
                  <Text fontWeight="900" fontSize="lg">
                    {t("admin.inventory.stockMovement")}
                  </Text>
                  <Text color="surface.500" fontSize="sm" fontWeight="700">
                    {t("admin.inventory.stockMovementDescription")}
                  </Text>
                </VStack>

                <SimpleGrid columns={2} gap={2}>
                  {([
                    ["restock", t("admin.inventory.restock")],
                    ["writeoff", t("admin.inventory.writeoff")],
                    ["manual_adjustment", t("admin.inventory.adjust")],
                  ] as Array<[InventoryMovementType, string]>).map(([type, label], index) => {
                    const isActive = movementType === type;

                    return (
                      <Button
                        key={type}
                        gridColumn={index === 2 ? "1 / -1" : undefined}
                        size="sm"
                        minH="44px"
                        borderRadius="14px"
                        bg={isActive ? "surface.900" : panelMutedSurface}
                        color={isActive ? "white" : type === "writeoff" ? "red.500" : "surface.700"}
                        _hover={{ bg: isActive ? "surface.900" : "rgba(232,231,226,0.96)" }}
                        whiteSpace="normal"
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

                <HStack justify="center" gap={6} bg={panelMutedSurface} py={3} px={5} borderRadius="20px">
                  <Button
                    aria-label={t("admin.inventory.decreaseQuantity")}
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
                  <VStack gap={0}>
                    <Text fontSize="2xl" fontWeight="900" color="surface.900" lineHeight="1">
                      {movementQuantity}
                    </Text>
                    <Text fontSize="10px" fontWeight="800" color="surface.400" textTransform="uppercase">
                      {t("admin.inventory.units")}
                    </Text>
                  </VStack>
                  <Button
                    aria-label={t("admin.inventory.increaseQuantity")}
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
                  placeholder={t("admin.inventory.reasonOptional")}
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
                  loading={Boolean(pendingStoreProductIds[selectedItem.storeProductId])}
                  onClick={() => void handleInventoryAdjustment(selectedItem.storeProductId, movementType)}
                >
                  {movementLabel} {movementQuantity} {t("admin.inventory.units")}
                </Button>
              </VStack>
            </Box>
          ) : null}
        </VStack>
      );
    }

    return (
      <>
        <VStack gap={4} align="stretch">
        <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
          <HStack gap={2}>
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
                  onPointerDown={activateSegmentOnPointerDown(`inventory-mode-${mode}`, () => setInventoryMode(mode))}
                  onClick={activateSegmentOnClick(`inventory-mode-${mode}`, () => setInventoryMode(mode))}
                >
                  {mode === "stock" ? t("admin.inventory.stockTab") : t("admin.inventory.productsTab")}
                </Button>
              );
            })}
          </HStack>
        </Box>

        {inventoryMode === "stock" ? (
          <SimpleGrid columns={2} gap={3}>
            {inventorySummaryCards.map((card) => (
              <Box
                key={card.label}
                bg={panelSurface}
                borderRadius="22px"
                px={4}
                py={4}
                boxShadow={panelShadow}
                {...getLowStockCardProps(card.label === t("admin.inventory.lowStock") && lowStockCount > 0)}
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
            <VStack align="stretch" gap={3}>
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
                <VStack align="start" gap={0} minW={0}>
                  <Text fontWeight="900" fontSize="lg" lineClamp={1}>
                    {selectedStore?.name ?? t("admin.inventory.selectStore")}
                  </Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="700">
                    {formatInventoryProductsInStore(visibleInventoryItems.length)}
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
            <VStack align="stretch" gap={3}>
              <HStack justify="space-between">
                  <Text fontWeight="900" fontSize="lg">
                  {t("admin.inventory.stockList")}
                </Text>
                <Text color="surface.500" fontWeight="700" fontSize="sm">
                  {formatInventoryItemsCount(visibleInventoryItems.length)}
                </Text>
              </HStack>

              {visibleInventoryItems.map((item) => (
                <Box
                  textAlign="left"
                  bg={panelMutedSurface}
                  borderRadius="18px"
                  px={3}
                  py={3}
                  asChild><button
                    key={item.storeProductId}
                    type="button"
                    onClick={() => {
                      setSelectedInventoryItemId(item.storeProductId);
                      setInventoryDetailMode("overview");
                      scrollToSectionTop();
                    }}>
                    <HStack justify="space-between" align="start">
                      <VStack align="start" gap={1} minW={0}>
                        <HStack gap={2}>
                          <Text fontWeight="900">{item.productName}</Text>
                          {!item.isProductActive ? <StatusPill label={t("admin.inventory.productOff")} tone="orange" /> : null}
                        </HStack>
                        <Text fontSize="sm" color="surface.600" fontWeight="700">
                          {formatEur(item.storePrice)}
                        </Text>
                        <Text fontSize="xs" color="surface.500">
                          {t("admin.inventory.defaultPrice")} {formatEur(item.defaultPrice)} · {t("admin.inventory.updated")} {formatShortDate(item.updatedAt)}
                        </Text>
                      </VStack>
                      <VStack align="center" justify="center" gap={0} minW="56px" flexShrink={0} alignSelf="stretch">
                        <Text fontWeight="900" fontSize="2xl" lineHeight="1">
                          {item.stockQuantity}
                        </Text>
                        <Text fontSize="10px" color="surface.500" fontWeight="800" textTransform="uppercase" letterSpacing="0.08em">
                          {t("admin.inventory.units")}
                        </Text>
                      </VStack>
                    </HStack>
                  </button></Box>
              ))}
            </VStack>
          </Box>
        ) : (
          <VStack gap={4} align="stretch">
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" gap={3}>
                <HStack justify="space-between">
                  <Text fontWeight="900" fontSize="lg">
                    {productCatalogMode === "archive" ? t("admin.inventory.productArchive") : t("admin.inventory.productCatalog")}
                  </Text>
                  <Text color="surface.500" fontWeight="700" fontSize="sm">
                    {formatInventoryItemsCount(visibleProductCatalog.length)}
                  </Text>
                </HStack>

                {(productCatalogMode === "archive" ? visibleProductCatalog : sortedProducts).map((product) => {
                  return (
                    <Box
                      textAlign="left"
                      bg={panelMutedSurface}
                      borderRadius="18px"
                      px={3}
                      py={3}
                      asChild><button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setProductDetailMode("overview");
                            scrollToSectionTop();
                          }}>
                          <HStack justify="space-between" align="center" gap={3}>
                            <VStack align="start" gap={0} minW={0}>
                              <Text fontWeight="900" lineClamp={1}>
                                {product.name}
                              </Text>
                              <Text fontSize="sm" color="surface.500" fontWeight="700" lineClamp={1}>
                                {t("admin.inventory.defaultPrice")} {formatEur(product.defaultPrice)}
                              </Text>
                              <Text fontSize="xs" color="surface.500" fontWeight="700" lineClamp={1}>
                                {productCatalogMode === "archive"
                                  ? `${t("admin.inventory.archived")} ${product.archivedAt ? formatShortDate(product.archivedAt) : ""}`.trim()
                                  : formatInventoryStoresEnabled(product.enabledStoreCount)}
                              </Text>
                            </VStack>
                            <StatusPill
                              label={
                                productCatalogMode === "archive"
                                  ? t("admin.inventory.archived")
                                  : product.isActive
                                    ? t("admin.inventory.active")
                                    : t("admin.inventory.inactive")
                              }
                              tone={productCatalogMode === "archive" ? "orange" : product.isActive ? "green" : "red"}
                            />
                          </HStack>
                        </button></Box>
                  );
                })}

                {visibleProductCatalog.length === 0 ? (
                  <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={4}>
                    <Text fontWeight="900">
                      {productCatalogMode === "archive" ? t("admin.inventory.archiveEmpty") : t("admin.inventory.noProductsYet")}
                    </Text>
                    <Text color="surface.500" fontSize="sm" mt={1}>
                      {productCatalogMode === "archive"
                        ? t("admin.inventory.archiveDescription")
                        : t("admin.inventory.createFirstProduct")}
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
                    {t("admin.inventory.backToProducts")}
                  </Button>
                ) : (
                  <>
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
                      {t("admin.inventory.productArchive")}
                    </Button>
                  </>
                )}
              </VStack>
            </Box>
          </VStack>
        )}
        </VStack>
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
          { label: t("admin.sales.revenue"), value: formatEur(activeSalesSummary.revenue) },
          { label: t("admin.sales.sales"), value: String(activeSalesSummary.salesCount) },
          { label: t("admin.sales.cash"), value: formatEur(activeSalesSummary.cashTotal) },
          { label: t("admin.sales.card"), value: formatEur(activeSalesSummary.cardTotal) },
        ]
      : [
          { label: t("admin.sales.returned"), value: formatEur(activeSalesSummary.returnsTotal) },
          { label: t("admin.sales.returns"), value: String(activeSalesSummary.returnsCount) },
          { label: t("admin.sales.units"), value: String(activeSalesSummary.returnedUnits) },
          { label: t("admin.sales.avgReturn"), value: formatEur(activeSalesSummary.averageReturn) },
        ];
    const ledgerSalesCount = activeSalesSummary.salesCount;
    const ledgerReturnsCount = activeSalesSummary.returnsCount;
    const visibleLedgerCount = salesLedgerMode === "sales" ? visibleSales.length : visibleReturns.length;
    const totalLedgerCount = salesLedgerMode === "sales" ? ledgerSalesCount : ledgerReturnsCount;
    const ledgerCountLabel =
      visibleLedgerCount < totalLedgerCount
        ? `${visibleLedgerCount} ${t("admin.sales.latestOf")} ${totalLedgerCount}`
        : formatSalesLedgerEntityCount(visibleLedgerCount, salesLedgerMode);

    if (selectedSale) {
      return (
        <VStack gap={4} align="stretch">
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" gap={4}>
              <HStack justify="space-between" align="start">
                <VStack align="start" gap={1}>
                  <Text fontWeight="900" fontSize="xl">
                    {t("admin.sales.saleReceipt")}
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    {selectedSale.store?.name ?? t("admin.sales.unknownStore")} · {selectedSale.seller?.fullName ?? t("admin.sales.unknownSeller")}
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    {formatDateTime(selectedSale.createdAt)}
                  </Text>
                </VStack>
                <Button
                  size="sm"
                  borderRadius="14px"
                  variant="outline"
                  borderColor="var(--app-border)"
                  onClick={() => setSelectedAdminSaleId(null)}
                >
                  {t("orders.back")}
                </Button>
              </HStack>

              <HStack justify="space-between">
                <StatusPill
                  label={selectedSale.status === "deleted" ? t("admin.sales.deletedSale") : t("admin.sales.completedSale")}
                  tone={selectedSale.status === "deleted" ? "red" : "green"}
                />
                <Text fontWeight="900">{formatAdminPaymentMethod(selectedSale.paymentMethod)}</Text>
              </HStack>

              <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

              {selectedSale.items.map((item) => (
                <HStack key={item.id} justify="space-between" align="start">
                  <VStack align="start" gap={0}>
                    <Text fontWeight="800">{item.productNameSnapshot}</Text>
                    <Text fontSize="sm" color="surface.500">
                      {t("admin.sales.qty")} {item.quantity} x {formatEur(item.finalPrice)}
                    </Text>
                    {item.discountType ? (
                      <Text fontSize="xs" color="surface.500">
                        {t("admin.sales.discount")} {item.discountType}: {item.discountValue}
                      </Text>
                    ) : null}
                  </VStack>
                  <Text fontWeight="900">{formatEur(item.lineTotal)}</Text>
                </HStack>
              ))}

              <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

              <VStack align="stretch" gap={2}>
                <HStack justify="space-between">
                  <Text color="surface.500" fontWeight="700">
                    {t("admin.sales.subtotal")}
                  </Text>
                  <Text fontWeight="800">{formatEur(selectedSale.subtotalAmount)}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text color="surface.500" fontWeight="700">
                    {t("admin.sales.discount")}
                  </Text>
                  <Text fontWeight="800">{formatEur(selectedSale.discountAmount)}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="lg" fontWeight="900">
                    {t("admin.sales.total")}
                  </Text>
                  <Text fontSize="lg" fontWeight="900">
                    {formatEur(selectedSale.totalAmount)}
                  </Text>
                </HStack>
              </VStack>

              {selectedSale.status === "deleted" ? (
                <Box bg="rgba(248,113,113,0.08)" borderRadius="16px" px={3} py={3}>
                  <Text fontSize="sm" fontWeight="800" color="red.500">
                    {t("admin.sales.deletedAt")} {selectedSale.deletedAt ? formatDateTime(selectedSale.deletedAt) : ""}
                  </Text>
                  <Text fontSize="xs" color="surface.500">
                    {selectedSale.deletedBy?.fullName ?? t("admin.sales.unknownUser")} · {selectedSale.deletionReason ?? t("admin.sales.noReason")}
                  </Text>
                </Box>
              ) : null}

              <Text fontSize="xs" color="surface.500">
                {t("admin.sales.saleId")}: {selectedSale.id}
              </Text>
            </VStack>
          </Box>
        </VStack>
      );
    }

    if (selectedReturn) {
      return (
        <VStack gap={4} align="stretch">
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" gap={4}>
              <HStack justify="space-between" align="start">
                <VStack align="start" gap={1}>
                  <Text fontWeight="900" fontSize="xl">
                    {t("admin.sales.returnReceipt")}
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    {selectedReturn.store?.name ?? t("admin.sales.unknownStore")} · {selectedReturn.seller?.fullName ?? t("admin.sales.unknownSeller")}
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    {formatDateTime(selectedReturn.createdAt)}
                  </Text>
                </VStack>
                <Button
                  size="sm"
                  borderRadius="14px"
                  variant="outline"
                  borderColor="var(--app-border)"
                  onClick={() => setSelectedAdminReturnId(null)}
                >
                  {t("orders.back")}
                </Button>
              </HStack>

              <Box bg="rgba(74,132,244,0.08)" borderRadius="16px" px={3} py={3}>
                <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="800">
                  {t("admin.sales.reason")}
                </Text>
                <Text fontWeight="800">{selectedReturn.reason}</Text>
              </Box>

              <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

              {selectedReturn.items.map((item) => (
                <HStack key={item.id} justify="space-between" align="start">
                  <VStack align="start" gap={0}>
                    <Text fontWeight="800">{item.productNameSnapshot}</Text>
                    <Text fontSize="sm" color="surface.500">
                      {t("admin.sales.qty")} {item.quantity} x {formatEur(item.returnedPrice)}
                    </Text>
                  </VStack>
                  <Text fontWeight="900">{formatEur(item.lineTotal)}</Text>
                </HStack>
              ))}

              <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

              <HStack justify="space-between">
                <Text fontSize="lg" fontWeight="900">
                  {t("admin.sales.totalReturned")}
                </Text>
                <Text fontSize="lg" fontWeight="900">
                  {formatEur(selectedReturn.totalAmount)}
                </Text>
              </HStack>

              <Text fontSize="xs" color="surface.500">
                {t("admin.sales.returnId")}: {selectedReturn.id} · {t("admin.sales.saleRef")} {selectedReturn.saleId.slice(0, 8)}
              </Text>
            </VStack>
          </Box>
        </VStack>
      );
    }

    return (
      <VStack gap={4} align="stretch">
        <SimpleGrid columns={2} gap={3}>
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
          <VStack align="stretch" gap={3}>
            <HStack gap={2}>
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
                    onPointerDown={activateSegmentOnPointerDown(`sales-period-${period}`, () => {
                      void handleSelectSalesPeriod(period);
                    })}
                    onClick={activateSegmentOnClick(`sales-period-${period}`, () => {
                      void handleSelectSalesPeriod(period);
                    })}
                  >
                    {period === "today" ? t("admin.sales.today") : period === "week" ? t("admin.sales.week") : period === "month" ? t("admin.sales.month") : t("admin.sales.custom")}
                  </Button>
                );
              })}
            </HStack>

            <VStack align="stretch" gap={2}>
              <SimpleGrid columns={2} gap={2}>
                <NativeSelect.Root>
                  <NativeSelect.Field
                    value={salesStoreFilter}
                    onChange={(event) => {
                      const storeId = event.target.value;
                      setSalesStoreFilter(storeId);
                      void handleApplySalesFilters({ storeId });
                    }}
                    borderRadius="18px"
                    bg="white"
                    borderColor="rgba(226,224,218,0.95)">
                    <option value="">{t("admin.sales.allStores")}</option>
                    {salesStores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
                <NativeSelect.Root>
                  <NativeSelect.Field
                    value={salesSellerFilter}
                    onChange={(event) => {
                      const sellerId = event.target.value;
                      setSalesSellerFilter(sellerId);
                      void handleApplySalesFilters({ sellerId });
                    }}
                    borderRadius="18px"
                    bg="white"
                    borderColor="rgba(226,224,218,0.95)">
                    <option value="">{t("admin.sales.allSellers")}</option>
                    {salesSellers.map((seller) => (
                      <option key={seller.id} value={seller.id}>
                        {seller.fullName}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </SimpleGrid>

              <NativeSelect.Root>
                <NativeSelect.Field
                  value={salesStatusFilter}
                  onChange={(event) => {
                    const saleStatus = event.target.value as "all" | "completed" | "deleted";
                    setSalesStatusFilter(saleStatus);
                    void handleApplySalesFilters({ saleStatus });
                  }}
                  borderRadius="18px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)">
                  <option value="all">{t("admin.sales.allSales")}</option>
                  <option value="completed">{t("admin.sales.completed")}</option>
                  <option value="deleted">{t("admin.sales.deleted")}</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </VStack>

            {salesPeriod === "custom" ? (
              <SimpleGrid columns={2} gap={2}>
                <Input
                  value={salesDateFrom}
                  onChange={(event) => {
                    const dateFrom = event.target.value;
                    setSalesDateFrom(dateFrom);
                    void handleApplySalesFilters({ dateFrom, dateTo: salesDateTo });
                  }}
                  type="date"
                  borderRadius="18px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />
                <Input
                  value={salesDateTo}
                  onChange={(event) => {
                    const dateTo = event.target.value;
                    setSalesDateTo(dateTo);
                    void handleApplySalesFilters({ dateFrom: salesDateFrom, dateTo });
                  }}
                  type="date"
                  borderRadius="18px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />
              </SimpleGrid>
            ) : null}
          </VStack>
        </Box>
        <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
          <HStack gap={2}>
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
                  onPointerDown={activateSegmentOnPointerDown(`sales-ledger-${mode}`, () => setSalesLedgerMode(mode))}
                  onClick={activateSegmentOnClick(`sales-ledger-${mode}`, () => setSalesLedgerMode(mode))}
                >
                  {mode === "sales" ? `${t("admin.sales.salesTab")} · ${ledgerSalesCount}` : `${t("admin.sales.returnsTab")} · ${ledgerReturnsCount}`}
                </Button>
              );
            })}
          </HStack>
        </Box>
        <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
          <VStack align="stretch" gap={3}>
            <HStack justify="space-between">
              <Text fontWeight="900" fontSize="lg">
                {salesLedgerMode === "sales" ? t("admin.sales.salesLedger") : t("admin.sales.returnsLedger")}
              </Text>
              <Text color="surface.500" fontWeight="700" fontSize="sm">
                {ledgerCountLabel}
              </Text>
            </HStack>

            {salesLedgerMode === "sales" && visibleSales.length === 0 ? (
              <Text color="surface.500" fontSize="sm">
                {t("admin.sales.noSalesMatch")}
              </Text>
            ) : null}

            {salesLedgerMode === "returns" && visibleReturns.length === 0 ? (
              <Text color="surface.500" fontSize="sm">
                {t("admin.sales.noReturnsMatch")}
              </Text>
            ) : null}

            {salesLedgerMode === "sales"
              ? visibleSales.map((sale) => (
                  <Box
                    textAlign="left"
                    bg={panelMutedSurface}
                    borderRadius="18px"
                    px={3}
                    py={3}
                    asChild><button
                      key={sale.id}
                      type="button"
                      onClick={() => setSelectedAdminSaleId(sale.id)}>
                      <HStack justify="space-between" align="start">
                        <VStack align="start" gap={1} minW={0}>
                          <HStack gap={2}>
                            <Text fontWeight="900" lineClamp={1}>
                              {t("admin.sales.saleRef")}
                            </Text>
                            <StatusPill
                              label={formatAdminPaymentMethod(sale.paymentMethod)}
                              tone={sale.paymentMethod === "cash" ? "green" : "blue"}
                            />
                          </HStack>
                          <Text fontSize="sm" color="surface.600" fontWeight="700">
                            {sale.store?.name ?? t("admin.sales.unknownStore")}
                          </Text>
                          <Text fontSize="xs" color="surface.500">
                            {formatShortDate(sale.createdAt)} · {formatSalesTime(sale.createdAt)} ·{" "}
                            {sale.seller?.fullName ?? t("admin.sales.unknownSeller")} · {formatSaleItemsCount(sale.items.length)}
                          </Text>
                        </VStack>
                        <VStack align="end" gap={1}>
                          <Text fontWeight="900">{formatEur(sale.totalAmount)}</Text>
                          {sale.status === "deleted" ? (
                            <StatusPill
                              label={t("status.deleted")}
                              tone="red"
                            />
                          ) : null}
                        </VStack>
                      </HStack>
                    </button></Box>
                ))
              : visibleReturns.map((entry) => (
                  <Box
                    textAlign="left"
                    bg={panelMutedSurface}
                    borderRadius="18px"
                    px={3}
                    py={3}
                    asChild><button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedAdminReturnId(entry.id)}>
                      <HStack justify="space-between" align="start">
                        <VStack align="start" gap={1} minW={0}>
                          <HStack gap={2}>
                            <Text fontWeight="900">{t("admin.sales.return")}</Text>
                            <StatusPill label={t("admin.sales.return")} tone="orange" />
                          </HStack>
                          <Text fontSize="sm" color="surface.600" fontWeight="700">
                            {entry.store?.name ?? t("admin.sales.unknownStore")}
                          </Text>
                          <Text fontSize="xs" color="surface.500">
                            {formatShortDate(entry.createdAt)} · {formatSalesTime(entry.createdAt)} ·{" "}
                            {entry.seller?.fullName ?? t("admin.sales.unknownSeller")} · {formatSaleItemsCount(entry.items.length)}
                          </Text>
                        </VStack>
                        <VStack align="end" gap={1}>
                          <Text fontWeight="900">{formatEur(entry.totalAmount)}</Text>
                          <Text fontSize="xs" color="surface.500" fontWeight="700">
                            Sale {entry.saleId.slice(0, 8)}
                          </Text>
                        </VStack>
                      </HStack>
                    </button></Box>
                ))}
          </VStack>
        </Box>
      </VStack>
    );
  };

  const getSellerStatus = (seller: StaffSeller) => {
    if (!seller.isActive) {
      return { label: t("admin.team.inactive"), tone: "red" as const };
    }

    if (seller.activeShift?.status === "paused") {
      return { label: t("admin.team.paused"), tone: "orange" as const };
    }

    if (seller.activeShift) {
      return { label: t("admin.team.online"), tone: "blue" as const };
    }

    return { label: t("admin.team.offline"), tone: "gray" as const };
  };

  const renderStaffSection = () => (
    <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
      <VStack align="stretch" gap={3}>
        <VStack align="start" gap={0}>
          <Text fontWeight="900" fontSize="lg">
            {t("admin.team.staffDirectory")}
          </Text>
          <Text color="surface.500" fontSize="sm" fontWeight="700">
            {t("admin.team.staffDirectoryDescription")}
          </Text>
        </VStack>

        {staff.map((seller) => {
          const status = getSellerStatus(seller);

          return (
            <Box
              textAlign="left"
              bg={panelMutedSurface}
              borderRadius="18px"
              px={3}
              py={3}
              border={0}
              asChild><button
                  key={seller.id}
                  type="button"
                  onClick={() => {
                    setSelectedStaffSellerId(seller.id);
                    setStaffDetailMode("overview");
                    setStaffActivityPage(0);
                    scrollToSectionTop();
                  }}>
                  <HStack justify="space-between" align="center" gap={3}>
                    <VStack align="start" gap={0} minW={0}>
                      <Text fontWeight="900" lineClamp={1}>
                        {seller.fullName}
                      </Text>
                      <Text fontSize="sm" color="surface.500" fontWeight="700" lineClamp={1}>
                        {seller.currentAssignment?.storeName ?? t("admin.team.unassigned")}
                      </Text>
                    </VStack>

                    <Box flexShrink={0}>
                      <StatusPill label={status.label} tone={status.tone} />
                    </Box>
                  </HStack>
                </button></Box>
          );
        })}

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
        title: sale.status === "deleted" ? t("admin.team.saleDeleted") : t("admin.team.saleCompleted"),
        meta: `${sale.store?.name ?? t("admin.team.unknownStore")} · ${formatEur(sale.totalAmount)} · ${formatAdminPaymentMethod(sale.paymentMethod)}`,
        date: sale.createdAt,
        icon: LuReceiptText,
        iconLabel: sale.status === "deleted" ? t("admin.team.deleted") : t("admin.team.sale"),
        iconBg: sale.status === "deleted" ? "rgba(248,113,113,0.14)" : "rgba(34,197,94,0.12)",
        iconColor: sale.status === "deleted" ? "red.500" : "green.600",
      })),
      ...sellerReturns.map((entry) => ({
        id: `return-${entry.id}`,
        title: t("admin.team.returnCreated"),
        meta: `${entry.store?.name ?? t("admin.team.unknownStore")} · ${formatEur(entry.totalAmount)}`,
        date: entry.createdAt,
        icon: LuActivity,
        iconLabel: t("admin.team.return"),
        iconBg: "rgba(251,191,36,0.18)",
        iconColor: "orange.500",
      })),
      ...sellerStockActivity.map((entry) => ({
        id: `stock-${entry.id}`,
        title:
          entry.movementType === "restock"
            ? t("admin.team.stockRestocked")
            : entry.movementType === "writeoff"
              ? t("admin.team.stockWrittenOff")
              : t("admin.team.stockAdjusted"),
        meta: `${entry.product?.name ?? t("admin.team.unknownProduct")} · ${entry.quantityDelta > 0 ? "+" : ""}${entry.quantityDelta} ${t("admin.inventory.units")}`,
        date: entry.createdAt,
        icon: entry.quantityDelta < 0 ? LuMinus : LuPlus,
        iconLabel: entry.quantityDelta < 0 ? t("admin.team.writeoffShort") : t("admin.team.restockShort"),
        iconBg: entry.quantityDelta < 0 ? "rgba(248,113,113,0.14)" : "rgba(74,132,244,0.14)",
        iconColor: entry.quantityDelta < 0 ? "red.500" : "brand.600",
      })),
      ...(seller.activeShift
        ? [
            {
              id: `shift-${seller.activeShift.id}`,
              title: seller.activeShift.status === "paused" ? t("admin.team.shiftPausedEvent") : t("admin.team.shiftStartedEvent"),
              meta: seller.activeShift.storeName,
              date: seller.activeShift.startedAt,
              icon: LuClock3,
              iconLabel: t("admin.team.shift"),
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
      <VStack gap={4} align="stretch">
        <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
          <VStack align="stretch" gap={4}>
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
                  {t("admin.inventory.back")}
                </Button>
              </HStack>
            ) : null}

            <HStack justify="space-between" align="center">
              <HStack gap={3} minW={0}>
                <Avatar.Root size="md" bg="surface.200" color="surface.800"><Avatar.Fallback name={seller.fullName} /></Avatar.Root>
                <VStack align="start" gap={0} minW={0}>
                  <Text fontWeight="900" fontSize="xl" lineClamp={1}>
                    {seller.fullName}
                  </Text>
                  <Text fontSize="sm" color="surface.500" fontWeight="700" lineClamp={1}>
                    {seller.currentAssignment?.storeName ?? t("admin.team.unassigned")}
                  </Text>
                </VStack>
              </HStack>
              <StatusPill label={status.label} tone={status.tone} />
            </HStack>

          </VStack>
        </Box>
        <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
          <HStack gap={2} overflowX="auto" pb={1}>
            {(["overview", "profile", "worklog", "activity"] as StaffDetailMode[]).map((mode) => {
              const isActive = staffDetailMode === mode;

              return (
                <Button
                  key={mode}
                  size="sm"
                  flex="1"
                  minW={0}
                  borderRadius="999px"
                  px={2}
                  fontSize="sm"
                  bg={isActive ? "surface.900" : "transparent"}
                  color={isActive ? "white" : "surface.500"}
                  _hover={{ bg: isActive ? "surface.900" : panelMutedSurface }}
                  onPointerDown={activateSegmentOnPointerDown(`staff-detail-${mode}`, () => setStaffDetailMode(mode))}
                  onClick={activateSegmentOnClick(`staff-detail-${mode}`, () => setStaffDetailMode(mode))}
                >
                  {mode === "overview"
                    ? t("admin.team.overviewTab")
                    : mode === "profile"
                      ? t("admin.team.profileTab")
                      : mode === "worklog"
                        ? t("admin.team.worklogTab")
                        : t("admin.team.activityTab")}
                </Button>
              );
            })}
          </HStack>
        </Box>
        {staffDetailMode === "overview" ? (
          <VStack gap={4} align="stretch">
            <SimpleGrid columns={2} gap={3}>
              {[
                { label: t("admin.team.revenue"), value: formatEur(seller.revenue) },
                { label: t("admin.team.sales"), value: String(seller.salesCount) },
                { label: t("admin.team.commission"), value: "0%" },
                { label: t("admin.team.lastSale"), value: seller.lastSaleAt ? formatDateTime(seller.lastSaleAt) : t("admin.team.noActivity") },
              ].map((card) => (
                <Box key={card.label} bg={panelSurface} borderRadius="22px" px={4} py={4} boxShadow={panelShadow}>
                  <Text fontSize="xs" color="surface.500" textTransform="uppercase" letterSpacing="0.08em">
                    {card.label}
                  </Text>
                  <Text mt={2} fontWeight="900" fontSize={card.label === t("admin.team.lastSale") ? "sm" : "2xl"} lineClamp={2}>
                    {card.value}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>

            {seller.activeShift ? (
              <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
                <VStack align="stretch" gap={3}>
                  <HStack justify="space-between">
                    <Text fontWeight="900" fontSize="lg">
                      {t("admin.team.currentShift")}
                    </Text>
                    <StatusPill label={seller.activeShift.status} tone={seller.activeShift.status === "paused" ? "orange" : "blue"} />
                  </HStack>
                  <Box bg="rgba(255,255,255,0.54)" borderRadius="20px" overflow="hidden">
                    <VStack align="stretch" gap={0}>
                      {[
                        { label: t("admin.team.started"), value: formatSalesTime(seller.activeShift.startedAt) },
                        { label: t("admin.team.timeOpen"), value: `${Math.floor(activeShiftMinutes / 60)}h ${activeShiftMinutes % 60}m` },
                        { label: t("admin.team.store"), value: seller.activeShift.storeName },
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
              <VStack align="stretch" gap={3}>
                <HStack justify="space-between">
                  <Text fontWeight="900" fontSize="lg">
                    {t("admin.team.recentSellerSales")}
                  </Text>
                  <Text color="surface.500" fontWeight="700" fontSize="sm">
                    {formatTeamLoadedCount(sellerSales.length)}
                  </Text>
                </HStack>
                {sellerSales.length > 0 ? (
                  <Box bg="rgba(255,255,255,0.54)" borderRadius="20px" overflow="hidden">
                    <VStack align="stretch" gap={0}>
                      {sellerSales.slice(0, 5).map((sale, index, rows) => (
                        <Box
                          textAlign="left"
                          border={0}
                          bg="transparent"
                          px={1}
                          py={3}
                          borderBottom={index === rows.length - 1 ? 0 : "1px solid"}
                          borderColor="rgba(226,224,218,0.82)"
                          asChild><button
                            key={sale.id}
                            type="button"
                            onClick={() => {
                              setSelectedAdminSaleId(sale.id);
                              setActiveTab("sales");
                              scrollToSectionTop();
                            }}>
                            <HStack justify="space-between" align="start">
                              <VStack align="start" gap={0}>
                                <Text fontWeight="900">{sale.store?.name ?? t("admin.team.unknownStore")}</Text>
                                <Text fontSize="xs" color="surface.500">
                                  {formatDateTime(sale.createdAt)} · {formatAdminPaymentMethod(sale.paymentMethod)}
                                </Text>
                              </VStack>
                              <VStack align="end" gap={0}>
                                <Text fontWeight="900">{formatEur(sale.totalAmount)}</Text>
                                <Text fontSize="xs" color="brand.500" fontWeight="800">
                                  {t("admin.team.openReceipt")}
                                </Text>
                              </VStack>
                            </HStack>
                          </button></Box>
                      ))}
                    </VStack>
                  </Box>
                ) : null}
                {sellerSales.length === 0 ? (
                  <Text color="surface.500" fontSize="sm">
                    {t("admin.team.noSellerSalesLoaded")}
                  </Text>
                ) : null}
              </VStack>
            </Box>
          </VStack>
        ) : null}
        {staffDetailMode === "profile" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" gap={3}>
              <HStack justify="space-between" align="center">
                <Text fontWeight="900" fontSize="lg">
                  {t("admin.team.profile")}
                </Text>
                <StatusPill label={seller.isActive ? t("admin.team.active") : t("admin.team.inactive")} tone={seller.isActive ? "green" : "red"} />
              </HStack>
              <Box bg="rgba(255,255,255,0.54)" borderRadius="20px" overflow="hidden">
                <VStack align="stretch" gap={0}>
                  <HStack justify="space-between" px={1} py={3} borderBottom="1px solid" borderColor="rgba(226,224,218,0.82)">
                    <Text color="surface.500" fontWeight="800" fontSize="sm">
                      {t("admin.team.telegramId")}
                    </Text>
                    <Text fontWeight="900">{seller.telegramId}</Text>
                  </HStack>
                  <HStack justify="space-between" px={1} py={3} borderBottom="1px solid" borderColor="rgba(226,224,218,0.82)">
                    <Text color="surface.500" fontWeight="800" fontSize="sm">
                      {t("admin.team.account")}
                    </Text>
                    <Text fontWeight="900">{seller.isActive ? t("admin.team.active") : t("admin.team.inactive")}</Text>
                  </HStack>
                  <HStack justify="space-between" align="center" px={1} py={3} borderBottom="1px solid" borderColor="rgba(226,224,218,0.82)">
                    <Text color="surface.500" fontWeight="800" fontSize="sm">
                      {t("admin.team.assignedStore")}
                    </Text>
                    <NativeSelect.Root>
                      <NativeSelect.Field
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
                        fontWeight="800">
                        <option value="" disabled>
                          {t("admin.team.selectStore")}
                        </option>
                        {stores
                          .filter((store) => store.isActive)
                          .map((store) => (
                            <option key={store.id} value={store.id}>
                              {store.name}
                            </option>
                          ))}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </HStack>
                  <HStack justify="space-between" align="center" px={1} py={3}>
                    <Text color="surface.500" fontWeight="800" fontSize="sm">
                      {t("admin.team.commission")} %
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
                {t("admin.team.commissionHint")}
              </Text>

              <Button
                borderRadius="18px"
                bg="brand.500"
                color="white"
                _hover={{ bg: "brand.600" }}
                loading={Boolean(pendingSellerIds[seller.id])}
                disabled={!seller.isActive || !staffAssignments[seller.id]}
                onClick={() => void handleAssignSeller(seller.id)}
              >
                {t("admin.team.saveAssignment")}
              </Button>
              <Button
                borderRadius="18px"
                variant="outline"
                borderColor="surface.200"
                color="surface.800"
                disabled={!seller.currentAssignment || !seller.isActive}
                onClick={() => void onViewAsSeller(seller.id)}
              >
                {t("admin.team.viewAsSeller")}
              </Button>
            </VStack>
          </Box>
        ) : null}
        {staffDetailMode === "worklog" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" gap={3}>
              <HStack justify="space-between">
                <Text fontWeight="900" fontSize="lg">
                  {t("admin.team.worklog")}
                </Text>
                <Text color="surface.500" fontSize="sm" fontWeight="700">
                  {t("admin.team.timesheet")}
                </Text>
              </HStack>
              <Box bg="rgba(255,255,255,0.54)" borderRadius="20px" overflow="hidden">
                <VStack align="stretch" gap={0}>
                  {seller.activeShift ? (
                    <HStack justify="space-between" align="start" px={1} py={3} borderBottom="1px solid" borderColor="rgba(226,224,218,0.82)">
                      <VStack align="start" gap={0}>
                        <Text fontWeight="900">{t("admin.team.currentShiftLower")}</Text>
                        <Text fontSize="sm" color="surface.500">
                          {seller.activeShift.storeName} · {t("admin.team.startedLower")} {formatSalesTime(seller.activeShift.startedAt)}
                        </Text>
                      </VStack>
                      <StatusPill label={seller.activeShift.status} tone={seller.activeShift.status === "paused" ? "orange" : "blue"} />
                    </HStack>
                  ) : null}
                  <Box px={1} py={3}>
                    <Text fontWeight="900">{t("admin.team.fullShiftHistoryPending")}</Text>
                    <Text mt={1} fontSize="sm" color="surface.500" lineHeight="1.45">
                      {t("admin.team.fullShiftHistoryHint")}
                    </Text>
                  </Box>
                </VStack>
              </Box>
            </VStack>
          </Box>
        ) : null}
        {staffDetailMode === "activity" ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" gap={3}>
              <HStack justify="space-between">
                <Text fontWeight="900" fontSize="lg">
                  {t("admin.team.activityFeed")}
                </Text>
                <Text color="surface.500" fontWeight="700" fontSize="sm">
                  {formatTeamActionCount(activityItems.length)}
                </Text>
              </HStack>
              {visibleActivityItems.length > 0 ? (
                <Box bg="rgba(255,255,255,0.54)" borderRadius="20px" overflow="hidden">
                  <VStack align="stretch" gap={0}>
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
                          <HStack gap={3} align="start" minW={0}>
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
                              <Box boxSize={6} strokeWidth={2.5} asChild><Icon /></Box>
                            </Box>
                            <VStack align="start" gap={0} minW={0}>
                              <Text fontWeight="900">{item.title}</Text>
                              <Text fontSize="sm" color="surface.500" lineClamp={2}>
                                {item.meta}
                              </Text>
                              <Text fontSize="xs" color="surface.400" fontWeight="700">
                                {formatDateTime(item.date)}
                              </Text>
                            </VStack>
                          </HStack>
                          <Text fontSize="xs" color="surface.400" fontWeight="900" pt={1}>
                            {formatSalesTime(item.date)}
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
                    disabled={safeActivityPage === 0}
                    onClick={() => setStaffActivityPage((current) => Math.max(0, current - 1))}
                  >
                    {t("admin.team.previous")}
                  </Button>
                  <Text color="surface.500" fontSize="sm" fontWeight="800">
                    {safeActivityPage + 1} / {activityTotalPages}
                  </Text>
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor="surface.200"
                    disabled={safeActivityPage >= activityTotalPages - 1}
                    onClick={() => setStaffActivityPage((current) => Math.min(activityTotalPages - 1, current + 1))}
                  >
                    {t("admin.team.next")}
                  </Button>
                </HStack>
              ) : null}
              {activityItems.length === 0 ? (
                <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                  <Text fontWeight="900">{t("admin.team.noLoadedActivity")}</Text>
                  <Text mt={1} fontSize="sm" color="surface.500" lineHeight="1.45">
                    {t("admin.team.noLoadedActivityHint")}
                  </Text>
                </Box>
              ) : null}
            </VStack>
          </Box>
        ) : null}
      </VStack>
    );
  };

  const getStoreWizardProgressLabel = () => (storeCreateStep === "name" ? "1 / 2" : "2 / 2");
  const getSellerWizardProgressLabel = () => (
    sellerCreateStep === "name"
      ? "1 / 4"
      : sellerCreateStep === "telegramId"
        ? "2 / 4"
        : sellerCreateStep === "store"
          ? "3 / 4"
          : "4 / 4"
  );
  const getProductWizardProgressLabel = () => (
    productCreateStep === "name"
      ? "1 / 4"
      : productCreateStep === "price"
        ? "2 / 4"
        : productCreateStep === "sku"
          ? "3 / 4"
          : "4 / 4"
  );

  const handleWizardInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    onContinue: () => void
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    onContinue();
  };

  const renderWizardPanel = (label: string, title: string, description?: string, content?: React.ReactNode) => (
    <Box bg={panelSurface} borderRadius="28px" px={5} py={5} boxShadow={panelShadow}>
      <VStack align="stretch" gap={4}>
        <VStack align="stretch" gap={1}>
          <Text fontSize="10px" color="surface.500" textTransform="uppercase" letterSpacing="0.08em" fontWeight="900">
            {label}
          </Text>
          <Text fontSize="2xl" fontWeight="900" letterSpacing="-0.04em" lineHeight="1.05" color="surface.900">
            {title}
          </Text>
          {description ? (
            <Text color="surface.500" fontSize="sm" fontWeight="700" lineHeight="1.45">
              {description}
            </Text>
          ) : null}
        </VStack>
        {content}
      </VStack>
    </Box>
  );

  const renderTeamCreationModals = () => (
    <>
      {showNewStoreModal ? (
        <AdminFormScreen
          title={t("admin.team.newStore")}
          description={t("admin.team.newStoreDescription")}
          topLabel={t("admin.team.storesTab")}
          progressLabel={getStoreWizardProgressLabel()}
          onClose={() => setShowNewStoreModal(false)}
          primaryActionLabel={storeCreateStep === "name" ? t("admin.team.next") : t("admin.team.createStore")}
          primaryActionLoading={creatingStore}
          primaryActionDisabled={storeCreateStep === "name" ? !newStoreName.trim() : !newStoreName.trim()}
          onPrimaryAction={handleStoreWizardPrimaryAction}
          secondaryActionLabel={storeCreateStep === "address" ? t("admin.team.previous") : undefined}
          onSecondaryAction={storeCreateStep === "address" ? handleStoreWizardSecondaryAction : undefined}
        >
          {storeCreateStep === "name"
            ? renderWizardPanel(
                t("admin.team.storeName"),
                t("admin.team.storeNamePlaceholder"),
                "Введите понятное название магазина. Оно будет видно в Mini App и отчетах.",
                <Input
                  ref={storeNameInputRef}
                  value={newStoreName}
                  onChange={(event) => setNewStoreName(event.target.value)}
                  onFocus={scrollFocusedInputIntoView}
                  onKeyDown={(event) => handleWizardInputKeyDown(event, handleStoreWizardPrimaryAction)}
                  placeholder={t("admin.team.storeNamePlaceholder")}
                  autoFocus
                  enterKeyHint="next"
                  {...adminFormInputStyles}
                />
              )
            : renderWizardPanel(
                t("admin.team.address"),
                newStoreName.trim() || t("admin.team.newStore"),
                "Добавьте адрес или короткую заметку. Этот шаг можно оставить пустым.",
                <Input
                  ref={storeAddressInputRef}
                  value={newStoreAddress}
                  onChange={(event) => setNewStoreAddress(event.target.value)}
                  onFocus={scrollFocusedInputIntoView}
                  onKeyDown={(event) => handleWizardInputKeyDown(event, handleStoreWizardPrimaryAction)}
                  placeholder={t("admin.team.addressPlaceholder")}
                  enterKeyHint="done"
                  {...adminFormInputStyles}
                />
              )}
        </AdminFormScreen>
      ) : null}

      {showNewSellerModal ? (
        <AdminFormScreen
          title={t("admin.team.newSeller")}
          description={t("admin.team.newSellerDescription")}
          topLabel={t("admin.team.staffTab")}
          progressLabel={getSellerWizardProgressLabel()}
          onClose={() => setShowNewSellerModal(false)}
          primaryActionLabel={sellerCreateStep === "status" ? t("admin.team.createSeller") : t("admin.team.next")}
          primaryActionLoading={creatingSeller}
          primaryActionDisabled={
            sellerCreateStep === "name"
              ? !newSeller.fullName.trim()
              : sellerCreateStep === "telegramId"
                ? !newSeller.telegramId.trim()
                : false
          }
          onPrimaryAction={handleSellerWizardPrimaryAction}
          secondaryActionLabel={sellerCreateStep !== "name" ? t("admin.team.previous") : undefined}
          onSecondaryAction={sellerCreateStep !== "name" ? handleSellerWizardSecondaryAction : undefined}
        >
          {sellerCreateStep === "name"
            ? renderWizardPanel(
                t("admin.team.fullName"),
                t("admin.team.fullNamePlaceholder"),
                "Укажите имя продавца так, как оно должно отображаться в системе.",
                <Input
                  ref={sellerNameInputRef}
                  value={newSeller.fullName}
                  onChange={(event) =>
                    setNewSeller((current) => ({ ...current, fullName: event.target.value }))
                  }
                  onFocus={scrollFocusedInputIntoView}
                  onKeyDown={(event) => handleWizardInputKeyDown(event, handleSellerWizardPrimaryAction)}
                  placeholder={t("admin.team.fullNamePlaceholder")}
                  autoFocus
                  enterKeyHint="next"
                  {...adminFormInputStyles}
                />
              )
            : sellerCreateStep === "telegramId"
              ? renderWizardPanel(
                  t("admin.team.telegramId"),
                  "Telegram ID",
                  "Введите цифровой Telegram ID продавца. Только цифры.",
                  <Input
                    ref={sellerTelegramInputRef}
                    value={newSeller.telegramId}
                    onChange={(event) =>
                      setNewSeller((current) => ({
                        ...current,
                        telegramId: event.target.value.replace(/\D/g, ""),
                      }))
                    }
                    onFocus={scrollFocusedInputIntoView}
                    onKeyDown={(event) => handleWizardInputKeyDown(event, handleSellerWizardPrimaryAction)}
                    placeholder="123456789"
                    inputMode="numeric"
                    enterKeyHint="next"
                    {...adminFormInputStyles}
                  />
                )
              : sellerCreateStep === "store"
                ? renderWizardPanel(
                    t("admin.team.assignedStore"),
                    stores.find((store) => store.id === newSeller.storeId)?.name ?? t("admin.team.noStoreYet"),
                    "Выберите магазин сейчас или оставьте продавца без привязки на этом шаге.",
                    <NativeSelect.Root>
                      <NativeSelect.Field
                        ref={sellerStoreSelectRef}
                        value={newSeller.storeId}
                        onChange={(event) =>
                          setNewSeller((current) => ({ ...current, storeId: event.target.value }))
                        }
                        onFocus={scrollFocusedInputIntoView}
                        {...adminFormInputStyles}>
                        <option value="">{t("admin.team.noStoreYet")}</option>
                        {stores
                          .filter((store) => store.isActive)
                          .map((store) => (
                            <option key={store.id} value={store.id}>
                              {store.name}
                            </option>
                          ))}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  )
                : renderWizardPanel(
                    t("admin.inventory.status"),
                    newSeller.isActive ? t("admin.team.active") : t("admin.team.inactive"),
                    "Определите, должен ли продавец сразу получить доступ к работе.",
                    <SimpleGrid columns={2} gap={3}>
                      {[
                        { label: t("admin.team.active"), value: true },
                        { label: t("admin.team.inactive"), value: false },
                      ].map((option) => {
                        const isActive = newSeller.isActive === option.value;

                        return (
                          <Button
                            key={option.label}
                            h="56px"
                            borderRadius="20px"
                            bg={isActive ? "surface.900" : "rgba(255,255,255,0.94)"}
                            color={isActive ? "white" : "surface.800"}
                            border="1px solid"
                            borderColor={isActive ? "surface.900" : "rgba(214,218,225,0.96)"}
                            boxShadow={isActive ? "0 12px 24px rgba(18,18,18,0.12)" : "0 10px 22px rgba(18,18,18,0.04)"}
                            _hover={{ bg: isActive ? "surface.800" : "rgba(255,255,255,1)" }}
                            onClick={() =>
                              setNewSeller((current) => ({ ...current, isActive: option.value }))
                            }
                          >
                            {option.label}
                          </Button>
                        );
                      })}
                    </SimpleGrid>
                  )}
        </AdminFormScreen>
      ) : null}
    </>
  );

  const renderProductCreationModal = () =>
    showNewProductModal ? (
      <AdminFormScreen
        title={t("admin.inventory.newProduct")}
        description={t("admin.inventory.newProductDescription")}
        topLabel={t("admin.inventory.productCatalogLabel")}
        progressLabel={getProductWizardProgressLabel()}
        onClose={() => setShowNewProductModal(false)}
        primaryActionLabel={productCreateStep === "status" ? t("admin.inventory.createProduct") : t("admin.team.next")}
        primaryActionLoading={creatingProduct}
        primaryActionDisabled={
          productCreateStep === "name"
            ? !newProduct.name.trim()
            : productCreateStep === "price"
              ? !newProduct.defaultPrice.trim()
              : false
        }
        onPrimaryAction={handleProductWizardPrimaryAction}
        secondaryActionLabel={productCreateStep !== "name" ? t("admin.team.previous") : undefined}
        onSecondaryAction={productCreateStep !== "name" ? handleProductWizardSecondaryAction : undefined}
      >
        {productCreateStep === "name"
          ? renderWizardPanel(
              t("admin.inventory.productName"),
              t("admin.inventory.productName"),
              "Сначала задайте понятное название товара, чтобы его легко было найти в каталоге.",
              <Input
                ref={productNameInputRef}
                value={newProduct.name}
                onChange={(event) => setNewProduct((current) => ({ ...current, name: event.target.value }))}
                onFocus={scrollFocusedInputIntoView}
                onKeyDown={(event) => handleWizardInputKeyDown(event, handleProductWizardPrimaryAction)}
                placeholder={t("admin.inventory.productName")}
                autoFocus
                enterKeyHint="next"
                {...adminFormInputStyles}
              />
            )
          : productCreateStep === "price"
            ? renderWizardPanel(
                t("admin.inventory.defaultPrice"),
                newProduct.name.trim() || t("admin.inventory.newProduct"),
                "Введите базовую цену. Поддерживаются форматы 12.50 и 12,50.",
                <Input
                  ref={productPriceInputRef}
                  value={newProduct.defaultPrice}
                  onChange={(event) =>
                    setNewProduct((current) => ({
                      ...current,
                      defaultPrice: event.target.value.replace(/[^\d,.\s]/g, ""),
                    }))
                  }
                  onFocus={scrollFocusedInputIntoView}
                  onKeyDown={(event) => handleWizardInputKeyDown(event, handleProductWizardPrimaryAction)}
                  placeholder="24,90"
                  inputMode="decimal"
                  enterKeyHint="next"
                  {...adminFormInputStyles}
                />
              )
            : productCreateStep === "sku"
              ? renderWizardPanel(
                  "SKU",
                  newProduct.sku.trim() || "AUTO",
                  "SKU можно задать вручную или оставить пустым, тогда мы сгенерируем его автоматически.",
                  <Input
                    ref={productSkuInputRef}
                    value={newProduct.sku}
                    onChange={(event) => setNewProduct((current) => ({ ...current, sku: event.target.value }))}
                    onFocus={scrollFocusedInputIntoView}
                    onKeyDown={(event) => handleWizardInputKeyDown(event, handleProductWizardPrimaryAction)}
                    placeholder="AUTO"
                    enterKeyHint="next"
                    {...adminFormInputStyles}
                  />
                )
              : renderWizardPanel(
                  t("admin.inventory.status"),
                  newProductIsActive ? t("admin.inventory.active") : t("admin.inventory.inactive"),
                  "Определите, должен ли товар сразу появиться в активном каталоге.",
                  <SimpleGrid columns={2} gap={3}>
                    <Button
                      h="56px"
                      borderRadius="20px"
                      bg={newProductIsActive ? "surface.900" : "rgba(255,255,255,0.94)"}
                      color={newProductIsActive ? "white" : "surface.800"}
                      border="1px solid"
                      borderColor={newProductIsActive ? "surface.900" : "rgba(214,218,225,0.96)"}
                      boxShadow={newProductIsActive ? "0 12px 24px rgba(18,18,18,0.12)" : "0 10px 22px rgba(18,18,18,0.04)"}
                      _hover={{ bg: newProductIsActive ? "surface.800" : "rgba(255,255,255,1)" }}
                      onClick={() => setNewProductIsActive(true)}
                    >
                      {t("admin.inventory.active")}
                    </Button>
                    <Button
                      h="56px"
                      borderRadius="20px"
                      bg={!newProductIsActive ? "surface.900" : "rgba(255,255,255,0.94)"}
                      color={!newProductIsActive ? "white" : "surface.800"}
                      border="1px solid"
                      borderColor={!newProductIsActive ? "surface.900" : "rgba(214,218,225,0.96)"}
                      boxShadow={!newProductIsActive ? "0 12px 24px rgba(18,18,18,0.12)" : "0 10px 22px rgba(18,18,18,0.04)"}
                      _hover={{ bg: !newProductIsActive ? "surface.800" : "rgba(255,255,255,1)" }}
                      onClick={() => setNewProductIsActive(false)}
                    >
                      {t("admin.inventory.inactive")}
                    </Button>
                  </SimpleGrid>
                )}
      </AdminFormScreen>
    ) : null;

  const renderInventoryStoreSelector = () =>
    showInventoryStoreSelector ? (
      <Dialog.Root open placement='center' motionPreset="slide-in-bottom" onOpenChange={e => {
        if (!e.open) {
          setShowInventoryStoreSelector(false);
        }
      }}>
        <Portal>

          <Dialog.Backdrop bg="rgba(14, 12, 10, 0.32)" backdropFilter="blur(10px)" />
          <Dialog.Positioner>
            <Dialog.Content
              mx={4}
              borderRadius="30px"
              bg="rgba(255,255,255,0.96)"
              boxShadow="0 24px 60px rgba(18, 18, 18, 0.18)"
              overflow="hidden">
              <Dialog.Body px={4} py={4}>
                <VStack align="stretch" gap={4}>
                  <Box
                    borderRadius="24px"
                    px={4}
                    py={4}
                    bg="linear-gradient(180deg, rgba(247,246,242,0.98) 0%, rgba(240,238,231,0.92) 100%)"
                    border="1px solid rgba(228,225,218,0.9)"
                  >
                    <HStack align="start" justify="space-between" gap={3}>
                      <VStack align="start" gap={1}>
                        <Text fontSize="xs" textTransform="uppercase" color="surface.500" letterSpacing="0.12em" fontWeight="900">
                          {t("nav.inventory")}
                        </Text>
                        <Text fontSize="2xl" fontWeight="900" lineHeight="1.05">
                          {t("admin.inventory.selectStoreTitle")}
                        </Text>
                        <Text color="surface.500" fontSize="sm" fontWeight="700">
                          {t("admin.inventory.selectStoreDescription")}
                        </Text>
                      </VStack>
                    </HStack>
                  </Box>

                  <VStack align="stretch" gap={3} maxH="52vh" overflowY="auto" pr={1}>
                    {inventoryStores.map((store) => {
                      const isActive = selectedInventoryStoreId === store.id;

                      return (
                        <Button
                          key={store.id}
                          justifyContent="space-between"
                          minH="80px"
                          h="auto"
                          px={4}
                          py={4}
                          borderRadius="24px"
                          bg={
                            isActive
                              ? "rgba(241,240,236,0.98)"
                              : "rgba(247,246,242,0.98)"
                          }
                          color="surface.900"
                          border="1px solid"
                          borderColor={isActive ? "rgba(214,210,201,0.96)" : "rgba(226,224,218,0.92)"}
                          boxShadow="none"
                          _hover={{
                            bg: isActive
                              ? "rgba(238,236,231,1)"
                              : "rgba(255,255,255,1)",
                          }}
                          _focus={{ boxShadow: "none" }}
                          _focusVisible={{
                            boxShadow: "none",
                            outline: "none",
                          }}
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
                            void loadInventory(store.id, { silent: true })
                              .then(() => {
                                setTrustedInventoryStoreIds((current) => ({ ...current, [store.id]: true }));
                                setSelectedInventoryStoreId(store.id);
                              })
                              .finally(() => {
                                setInventorySoftRefreshing(false);
                              });
                          }}
                        >
                          <HStack justify="space-between" align="center" w="full" gap={3}>
                            <VStack align="start" gap={1} minW={0}>
                              <Text fontWeight="900" lineClamp={1}>
                                {store.name}
                              </Text>
                              <Text fontSize="sm" color="surface.500" fontWeight="700" lineClamp={2}>
                                {getStoreAddressLabel(
                                  stores.find((entry) => entry.id === store.id) ?? { name: store.name },
                                  t("admin.overview.addressMissing")
                                )}
                              </Text>
                            </VStack>
                            {isActive ? (
                              <Box
                                w="34px"
                                h="34px"
                                borderRadius="999px"
                                bg="surface.900"
                                color="rgba(255,255,255,0.96)"
                                display="grid"
                                placeItems="center"
                                flexShrink={0}
                                boxShadow="0 8px 18px rgba(18, 18, 18, 0.14)"
                              >
                                <LuCheck size={18} />
                              </Box>
                            ) : (
                              <Box color="surface.400" flexShrink={0}>
                                <LuChevronDown size={18} />
                              </Box>
                            )}
                          </HStack>
                        </Button>
                      );
                    })}
                  </VStack>

                  <Button
                    w="full"
                    h="54px"
                    borderRadius="20px"
                    bg="surface.100"
                    color="surface.700"
                    fontWeight="900"
                    _hover={{ bg: "surface.200" }}
                    onClick={() => setShowInventoryStoreSelector(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                </VStack>
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>

        </Portal>
      </Dialog.Root>
    ) : null;

  const renderTeam = () => {
    if (selectedStaffSeller) {
      return renderSellerDetail(selectedStaffSeller);
    }

    if (selectedTeamStore) {
      return renderStoreDetail(selectedTeamStore);
    }

    return (
      <>
        <VStack gap={4} align="stretch">
          <Box bg={panelSurface} borderRadius={panelRadius} px={3} py={3} boxShadow={panelShadow}>
            <HStack gap={2}>
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
                    onPointerDown={activateSegmentOnPointerDown(`team-mode-${mode}`, () => setTeamMode(mode))}
                    onClick={activateSegmentOnClick(`team-mode-${mode}`, () => setTeamMode(mode))}
                  >
                    {mode === "staff"
                      ? `${t("admin.team.staffTab")} · ${staff.length}`
                      : `${t("admin.team.storesTab")} · ${stores.length}`}
                  </Button>
                );
              })}
            </HStack>
          </Box>

          {teamMode === "staff" ? renderStaffSection() : renderStoresSection()}
        </VStack>
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

  const handleRequestReport = async () => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setReportStatus("Нет активной Telegram-сессии.");
      return;
    }

    const normalizedReportDateFrom = reportDate <= reportDateTo ? reportDate : reportDateTo;
    const normalizedReportDateTo = reportDate <= reportDateTo ? reportDateTo : reportDate;
    const reportDatePayload =
      reportQuickPreset === "custom"
        ? {
            dateFrom: normalizedReportDateFrom,
            dateTo: normalizedReportDateTo,
            rangeMode: "full_days" as const,
          }
        : {
            dateFrom: normalizedReportDateFrom,
            dateTo: normalizedReportDateTo,
            rangeMode: "to_date" as const,
          };

    type AdminReportRequestBody =
      | ({ type: "daily_summary" } & typeof reportDatePayload)
      | ({ type: "store"; storeId?: string } & typeof reportDatePayload)
      | ({ type: "seller"; sellerId?: string } & typeof reportDatePayload)
      | ({ type: "schedule" } & typeof reportDatePayload);

    const body: AdminReportRequestBody =
      reportType === "daily_summary"
        ? { type: reportType, ...reportDatePayload }
        : reportType === "store"
        ? { type: reportType, ...reportDatePayload, storeId: reportStoreId || stores[0]?.id }
          : reportType === "seller"
            ? { type: reportType, ...reportDatePayload, sellerId: reportSellerId || staff[0]?.id }
            : { type: reportType, ...reportDatePayload };

    if (
      (reportType === "store" && !(reportStoreId || stores[0]?.id)) ||
      (reportType === "seller" && !(reportSellerId || staff[0]?.id))
    ) {
      setReportStatus("Выберите магазин или продавца для отчета.");
      return;
    }

    try {
      setReportSubmitting(true);
      setReportStatus(null);
      await apiPost<{ ok: boolean; message: string }>("/admin/reports", body, token);
      setReportStatus("Отчет отправлен в Telegram.");
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : "Не удалось сформировать отчет.");
    } finally {
      setReportSubmitting(false);
    }
  };

  const renderReportsSettings = () => {
    const selectedStoreId = reportStoreId || stores[0]?.id || "";
    const selectedSellerId = reportSellerId || staff[0]?.id || "";
    const todayInputValue = getTodayInputValue();
    const weekAnchorInputValue = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const monthAnchorInputValue = toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const presetRangeLabel = formatReportRangeLabel(reportDate, reportDateTo);
    const reportMenuItems: Array<{
      type: AdminReportType;
      title: string;
      description: string;
      icon: IconType;
    }> = [
      {
        type: "daily_summary",
        title: "Сводный отчет",
        description: "Итоги магазинов и команды.",
        icon: LuReceiptText,
      },
      {
        type: "store",
        title: "Отчет по магазину",
        description: "Аналитика выбранной точки за период.",
        icon: LuStore,
      },
      {
        type: "seller",
        title: "Отчет по продавцу",
        description: "Смены, продажи и личные показатели.",
        icon: LuUserRound,
      },
      {
        type: "schedule",
        title: "Рабочий график",
        description: "Смены и часы сотрудников.",
        icon: LuUsersRound,
      },
    ];

    const quickDateOptions: Array<{ label: string; value: ReportQuickPreset }> = [
      { label: "Сегодня", value: "today" },
      { label: "Неделя", value: "week" },
      { label: "Месяц", value: "month" },
      { label: "Свой", value: "custom" },
    ];

    const handleSelectReportQuickPreset = (preset: ReportQuickPreset) => {
      setReportQuickPreset(preset);

      if (preset === "today") {
        setReportDate(todayInputValue);
        setReportDateTo(todayInputValue);
        return;
      }

      if (preset === "week") {
        setReportDate(weekAnchorInputValue);
        setReportDateTo(todayInputValue);
        return;
      }

      if (preset === "month") {
        setReportDate(monthAnchorInputValue);
        setReportDateTo(todayInputValue);
        return;
      }

      if (preset === "custom") {
        if (!reportDateTo) {
          setReportDateTo(reportDate || todayInputValue);
        }
      }
    };

    if (settingsView === "reports-menu") {
      const primaryReport = reportMenuItems[0];
      const PrimaryReportIcon = primaryReport.icon;
      const secondaryReports = reportMenuItems.slice(1);
      const openReportDetail = (type: AdminReportType) => {
        setReportType(type);
        setReportStatus(null);
        setReportQuickPreset("today");
        setReportDate(todayInputValue);
        setReportDateTo(todayInputValue);
        setSettingsView("report-detail");
      };
      const metaPills: Array<{ label: string; icon: IconType }> = [
        { label: "Магазины", icon: LuStore },
        { label: "Один день", icon: LuCalendarDays },
        { label: "Отчет в Telegram", icon: LuSend },
      ];

      return (
        <VStack align="stretch" gap={5}>
          <Box
            key={primaryReport.type}
            textAlign="left"
            bg={panelSurface}
            borderRadius="30px"
            px={4}
            py={4}
            boxShadow={panelShadow}
            border="1px solid rgba(255,255,255,0.72)"
            transition="transform 0.16s ease, background 0.16s ease"
            _hover={{ bg: "rgba(255,255,255,0.96)" }}
            _active={{ transform: "scale(0.99)" }}
            _focusVisible={{ outline: "3px solid rgba(74,132,244,0.28)", outlineOffset: "3px" }}
            asChild><button type="button" onClick={() => openReportDetail(primaryReport.type)}>
            <VStack align="stretch" gap={4}>
              <HStack align="start" gap={3}>
                <Box
                  w={{ base: "56px", sm: "64px" }}
                  h={{ base: "56px", sm: "64px" }}
                  borderRadius="22px"
                  bg="rgba(74,132,244,0.1)"
                  color="brand.600"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  <PrimaryReportIcon size={26} />
                </Box>
                <VStack align="start" gap={1} minW={0} flex="1">
                  <HStack align="start" justify="space-between" gap={3} w="100%">
                    <Text fontWeight="900" fontSize={{ base: "xl", sm: "2xl" }} lineHeight="1.15">
                      {primaryReport.title}
                    </Text>
                    <Box
                      borderRadius="999px"
                      bg="brand.500"
                      color="white"
                      px={4}
                      py={2}
                      fontWeight="900"
                      fontSize="sm"
                      lineHeight="1"
                      flexShrink={0}
                      boxShadow="0 10px 22px rgba(74,132,244,0.18)"
                    >
                      PDF
                    </Box>
                  </HStack>
                  <Text color="surface.500" fontSize="sm" fontWeight="700" lineHeight="1.45">
                    {primaryReport.description}
                  </Text>
                </VStack>
              </HStack>

              <Box h="1px" bg="rgba(231,228,222,0.86)" />

              <HStack gap={2} flexWrap="nowrap" overflowX="auto" pb={0.5}>
                {metaPills.map((pill) => {
                  const PillIcon = pill.icon;

                  return (
                    <HStack
                      key={pill.label}
                      gap={1.5}
                      borderRadius="999px"
                      bg={panelMutedSurface}
                      color="surface.600"
                      px={2.5}
                      py={2}
                      fontWeight="800"
                      fontSize="11px"
                      lineHeight="1"
                      whiteSpace="nowrap"
                      flexShrink={0}
                    >
                      <PillIcon size={13} />
                      <Text>{pill.label}</Text>
                    </HStack>
                  );
                })}
              </HStack>
            </VStack>
          </button></Box>

          <VStack align="stretch" gap={3}>
            <Text px={1} color="surface.600" fontWeight="900" fontSize="md">
              Другие отчеты
            </Text>
            <Box
              bg={panelSurface}
              borderRadius={panelRadius}
              px={2}
              py={2}
              boxShadow={panelShadow}
              border="1px solid rgba(255,255,255,0.68)"
            >
              <VStack align="stretch" gap={1}>
                {secondaryReports.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Box
                      key={item.type}
                      textAlign="left"
                      bg="transparent"
                      borderRadius="20px"
                      px={3}
                      py={3}
                      minH="76px"
                      transition="background 0.16s ease, transform 0.16s ease"
                      _hover={{ bg: "rgba(241,240,236,0.76)" }}
                      _active={{ transform: "scale(0.99)", bg: "rgba(235,233,228,0.9)" }}
                      _focusVisible={{ outline: "3px solid rgba(74,132,244,0.24)", outlineOffset: "2px" }}
                      asChild><button type="button" onClick={() => openReportDetail(item.type)}>
                      <HStack justify="space-between" align="center" gap={3}>
                        <HStack align="center" gap={3} minW={0}>
                          <Box
                            w="46px"
                            h="46px"
                            borderRadius="16px"
                            bg="rgba(74,132,244,0.08)"
                            color="brand.600"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            flexShrink={0}
                          >
                            <Icon size={20} />
                          </Box>
                          <VStack align="start" gap={0.5} minW={0} justify="center" flex="1">
                            <Text fontWeight="900" color="surface.900" fontSize="md" lineHeight="1.2">
                              {item.title}
                            </Text>
                            <Text color="surface.500" fontSize="xs" fontWeight="700" lineHeight="1.35">
                              {item.description}
                            </Text>
                          </VStack>
                        </HStack>
                        <Box
                          w="34px"
                          h="34px"
                          borderRadius="14px"
                          bg="rgba(255,255,255,0.82)"
                          color="surface.500"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          flexShrink={0}
                        >
                          <LuChevronRight size={17} />
                        </Box>
                      </HStack>
                    </button></Box>
                  );
                })}
              </VStack>
            </Box>
          </VStack>

          <Box bg="rgba(238,244,255,0.92)" borderRadius="26px" px={4} py={4}>
            <HStack align="center" gap={3}>
              <Box
                w="48px"
                h="48px"
                borderRadius="17px"
                bg="rgba(255,255,255,0.72)"
                color="brand.600"
                display="flex"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
              >
                <LuShieldCheck size={22} />
              </Box>
              <VStack align="start" gap={0.5} minW={0} flex="1">
                <Text color="brand.600" fontSize="md" fontWeight="900">
                  Безопасность данных
                </Text>
                <Text color="surface.600" fontSize="sm" fontWeight="700" lineHeight="1.45">
                  Отчеты формируются автоматически и доступны только вам.
                </Text>
              </VStack>
            </HStack>
          </Box>
        </VStack>
      );
    }

    return (
      <Box
        bg={panelSurface}
        borderRadius="30px"
        px={3.5}
        py={3.5}
        boxShadow={panelShadow}
        border="1px solid rgba(255,255,255,0.72)"
      >
        <VStack align="stretch" gap={3}>
          <Box bg={panelMutedSurface} borderRadius="24px" px={3.5} py={2.5}>
            <VStack align="stretch" gap={2}>
              <VStack align="start" gap={1}>
                <Text fontWeight="800" color="surface.700" fontSize="md">
                  {reportQuickPreset === "custom" ? "Период отчета" : reportType === "schedule" ? "Опорная дата" : "Дата отчета"}
                </Text>
                <Text color="surface.500" fontSize="xs" fontWeight="700">
                  {reportQuickPreset === "custom"
                    ? "Выберите даты начала и окончания."
                    : reportType === "schedule"
                      ? "Выберите дату внутри нужного периода."
                      : "Выберите день, за который нужен PDF."}
                </Text>
              </VStack>
              {reportQuickPreset === "custom" ? (
                <HStack gap={2} w="100%">
                  <Input
                    type="date"
                    value={reportDate}
                    onChange={(event) => setReportDate(event.target.value)}
                    {...adminFormInputStyles}
                    bg="rgba(255,255,255,0.96)"
                    borderRadius="18px"
                    h="50px"
                    minW={0}
                    flex="1"
                  />
                  <Input
                    type="date"
                    value={reportDateTo}
                    onChange={(event) => setReportDateTo(event.target.value)}
                    {...adminFormInputStyles}
                    bg="rgba(255,255,255,0.96)"
                    borderRadius="18px"
                    h="50px"
                    minW={0}
                    flex="1"
                  />
                </HStack>
              ) : (
                <Box
                  h="50px"
                  borderRadius="18px"
                  bg="rgba(255,255,255,0.96)"
                  border="1px solid rgba(214,218,225,0.96)"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  px={4}
                >
                  <Text fontWeight="900" color="surface.900" fontSize="md" textAlign="center">
                    {presetRangeLabel}
                  </Text>
                </Box>
              )}
            </VStack>
          </Box>

          <VStack align="stretch" gap={2}>
            <Text fontWeight="800" color="surface.700" px={1} fontSize="md">
              Период
            </Text>
            <HStack gap={2} w="100%">
            {quickDateOptions.map((option) => (
              <Button
                key={option.value}
                size="sm"
                borderRadius="999px"
                h="38px"
                px={0}
                flex="1"
                minW={0}
                fontWeight="900"
                fontSize="sm"
                bg={reportQuickPreset === option.value ? "brand.500" : panelMutedSurface}
                color={reportQuickPreset === option.value ? "white" : "surface.700"}
                _hover={{
                  bg: reportQuickPreset === option.value ? "brand.600" : "rgba(225,223,218,0.95)",
                }}
                _active={{ transform: "scale(0.98)" }}
                onClick={() => handleSelectReportQuickPreset(option.value)}
              >
                {option.label}
              </Button>
            ))}
            </HStack>
          </VStack>

          {reportType === "store" ? (
            <Box bg={panelMutedSurface} borderRadius="24px" px={3.5} py={2.5}>
              <VStack align="stretch" gap={2}>
                <Text fontWeight="800" color="surface.700" fontSize="md">
                  Магазин
                </Text>
                <NativeSelect.Root>
                  <NativeSelect.Field
                    value={selectedStoreId}
                    onChange={(event) => setReportStoreId(event.target.value)}
                    {...adminFormInputStyles}
                    bg="rgba(255,255,255,0.96)"
                    h="50px"
                    borderRadius="18px">
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </VStack>
            </Box>
          ) : null}

          {reportType === "seller" ? (
            <Box bg={panelMutedSurface} borderRadius="24px" px={3.5} py={2.5}>
              <VStack align="stretch" gap={2}>
                <Text fontWeight="800" color="surface.700" fontSize="md">
                  Продавец
                </Text>
                <NativeSelect.Root>
                  <NativeSelect.Field
                    value={selectedSellerId}
                    onChange={(event) => setReportSellerId(event.target.value)}
                    {...adminFormInputStyles}
                    bg="rgba(255,255,255,0.96)"
                    h="50px"
                    borderRadius="18px">
                    {staff.map((seller) => (
                      <option key={seller.id} value={seller.id}>
                        {seller.fullName}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </VStack>
            </Box>
          ) : null}

          <Box bg={panelMutedSurface} borderRadius="24px" px={3.5} py={2.5}>
            <VStack align="stretch" gap={2}>
              <Text fontWeight="800" color="surface.700" fontSize="md">
                Формат
              </Text>
              <HStack
                gap={3}
                borderRadius="22px"
                border="1px solid rgba(214,218,225,0.96)"
                bg="rgba(255,255,255,0.96)"
                px={3}
                py={2.5}
              >
                <Box
                  w="40px"
                  h="40px"
                  borderRadius="15px"
                  bg="rgba(74,132,244,0.1)"
                  color="brand.600"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  <LuReceiptText size={18} />
                </Box>
                <VStack align="start" gap={0.5} minW={0} flex="1">
                  <Text fontWeight="900" color="surface.900">
                    PDF
                  </Text>
                  <Text color="surface.500" fontSize="xs" fontWeight="700" lineHeight="1.35">
                    Отчет в формате PDF.
                  </Text>
                </VStack>
                <Box color="brand.600" flexShrink={0}>
                  <LuCircleCheck size={24} />
                </Box>
              </HStack>
            </VStack>
          </Box>

          {reportType === "daily_summary" ? (
            <Box bg="rgba(238,244,255,0.92)" borderRadius="24px" px={3.5} py={3.5}>
              <HStack align="start" gap={3}>
                <Box
                  w="40px"
                  h="40px"
                  borderRadius="15px"
                  bg="rgba(255,255,255,0.72)"
                  color="brand.600"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  <LuInfo size={18} />
                </Box>
                <VStack align="start" gap={1} minW={0} flex="1">
                  <Text fontWeight="900" color="surface.900">
                    Что включено
                  </Text>
                  <Text color="surface.600" fontSize="sm" fontWeight="700" lineHeight="1.45">
                    Все магазины, все продавцы и все операции за выбранный период.
                  </Text>
                </VStack>
              </HStack>
            </Box>
          ) : null}

          <Button
            h="56px"
            borderRadius="22px"
            bg="surface.900"
            color="white"
            fontWeight="900"
            loading={reportSubmitting}
            _hover={{ bg: "surface.700" }}
            _active={{ transform: "scale(0.99)" }}
            onClick={handleRequestReport}
          >
            <LuCalendarDays />
            Заказать отчет
          </Button>

          {reportStatus ? (
            <Text color="surface.500" fontSize="sm" fontWeight="800" textAlign="center">
              {reportStatus}
            </Text>
          ) : null}
        </VStack>
      </Box>
    );
  };

  const renderTab = () => {
    switch (activeTab) {
      case "sales":
        return renderSales();
      case "inventory":
        return renderInventory();
      case "team":
        return renderTeam();
      case "settings":
        if (settingsView === "reports-menu" || settingsView === "report-detail") {
          return renderReportsSettings();
        }

        return (
          <VStack gap={4} align="stretch">
            {renderPlaceholder(
              t("settings.admin.title"),
              t("settings.admin.description")
            )}
            <Button
              h="72px"
              justifyContent="space-between"
              borderRadius="24px"
              bg={panelSurface}
              px={4}
              boxShadow={panelShadow}
              _hover={{ bg: "rgba(255,255,255,0.96)" }}
              onClick={() => {
                setSettingsView("reports-menu");
                setReportStatus(null);
              }}
            >
              <VStack align="start" gap={1}>
                <Text fontWeight="900" color="surface.900">
                  Отчеты
                </Text>
                <Text color="surface.500" fontSize="sm">
                  PDF-отчеты по магазину и команде.
                </Text>
              </VStack>
              <Text fontWeight="900" color="surface.400">
                Открыть
              </Text>
            </Button>
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" gap={3}>
                <Text fontWeight="900" fontSize="lg">
                  {t("settings.language.title")}
                </Text>
                <Text color="surface.500" fontSize="sm">
                  {t("settings.language.description")}
                </Text>
                <HStack gap={3}>
                  {localeOptions.map((option) => {
                    const isActive = locale === option.value;

                    return (
                      <Button
                        key={option.value}
                        flex="1"
                        borderRadius="16px"
                        bg={isActive ? "brand.500" : "rgba(241,240,236,0.95)"}
                        color={isActive ? "white" : "surface.800"}
                        _hover={{
                          bg: isActive ? "brand.600" : "rgba(225,223,218,0.95)",
                        }}
                        onClick={() => setLocale(option.value)}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
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

  const adminMotionKey = `${activeTab}:${adminPageTitle}:${adminPageSubtitle ?? ""}`;

  return (
    <Box minH="100vh" px={{ base: 2.5, sm: 3 }} pt="var(--app-screen-pt)" pb={bottomNavReservedSpace}>
      <Container maxW="container.sm" px={0}>
        <VStack key={adminMotionKey} gap={5} align="stretch" className="soft-screen-transition">
          <VStack align="stretch" gap={showFullscreenHeaderContext ? 3 : 0} px={1} pt={showFullscreenHeaderContext ? 4 : 2} mb={2}>
            {showFullscreenHeaderContext ? (
              <HStack justify="space-between" align="center" gap={3}>
                <Text
                  fontSize="xs"
                  fontWeight="800"
                  letterSpacing="0.08em"
                  textTransform="uppercase"
                  color="surface.400"
                  lineClamp={2}
                >
                  {headerContextLabel}
                </Text>
                <Text fontSize="xs" color="surface.400" fontWeight="700" flexShrink={0}>
                  {t("common.today")} · {formatHeaderDate(new Date())}
                </Text>
              </HStack>
            ) : null}

            <HStack justify="space-between" align="center" gap={3}>
              <VStack align="start" gap={adminPageSubtitle ? 1 : 0} minW={0}>
                <Text
                  fontSize={{ base: "2xl", sm: "3xl" }}
                  fontWeight="900"
                  letterSpacing="0"
                  color="surface.900"
                  lineHeight="1.08"
                  lineClamp={2}
                >
                  {adminPageTitle}
                </Text>
                {adminPageSubtitle ? (
                  <Text fontSize="sm" color="surface.500" fontWeight="700" lineHeight="1.2" lineClamp={2}>
                    {adminPageSubtitle}
                  </Text>
                ) : null}
              </VStack>

              <HStack
                gap={3}
                bg="rgba(255,255,255,0.9)"
                borderRadius="18px"
                px={3}
                py={2}
                boxShadow="0 12px 30px rgba(17, 17, 17, 0.06)"
                flexShrink={0}
                maxW="48%"
              >
                <Avatar.Root size="sm" bg="surface.200" color="surface.800"><Avatar.Fallback name={operatorName} /></Avatar.Root>
                <VStack align="start" gap={0} minW={0}>
                  <Text fontWeight="800" lineHeight="1" lineClamp={1}>
                    {operatorName}
                  </Text>
                  <Text fontSize="xs" color="surface.500" fontWeight="700" lineHeight="1.1">
                    {t("common.admin")}
                  </Text>
                </VStack>
              </HStack>
            </HStack>
          </VStack>

          {showAdminLoadingBanner ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={5} boxShadow={panelShadow}>
              <Text fontWeight="800">
                {activeTab === "team" ? t("admin.loadingTeamData") : t("admin.loadingAdminData")}
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
      <ConfirmActionModal
        action={confirmAction}
        cancelLabel={t("common.cancel")}
        onClose={() => setConfirmAction(null)}
      />
      {!hasFullscreenAdminTask ? (
        <Box position="fixed" left={0} right={0} bottom={0} zIndex={30}>
          <AdminNav activeTab={activeTab} onChange={handleAdminTabChange} onReselect={resetAdminSection} />
        </Box>
      ) : null}
    </Box>
  );
}
