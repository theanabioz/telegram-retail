import { useEffect, useState } from "react";
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
import { useAdminDashboardStore } from "../store/useAdminDashboardStore";
import { useAdminManagementStore } from "../store/useAdminManagementStore";
import type { AdminDashboardResponse, AdminSalesOverviewResponse } from "../types/admin";

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
  const { data, error, loading, load } = useAdminDashboardStore();
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
  const [salesView, setSalesView] = useState<SalesLedgerSnapshot>({ sales: [], returns: [] });
  const [salesCache, setSalesCache] = useState<Record<string, SalesLedgerSnapshot>>({});
  const [salesSoftRefreshing, setSalesSoftRefreshing] = useState(false);
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("stock");
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string | null>(null);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreAddress, setNewStoreAddress] = useState("");
  const [newProduct, setNewProduct] = useState({
    name: "",
    sku: "",
    defaultPrice: "",
  });
  const [selectedInventoryStoreId, setSelectedInventoryStoreId] = useState("");
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

  useEffect(() => {
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
  }, [load, loadStaff, loadStores, loadInventory, loadProducts, loadSalesOverview]);

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
      void loadInventory(selectedInventoryStoreId);
      setSelectedInventoryItemId(null);
    }
  }, [loadInventory, selectedInventoryStoreId]);

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
          { label: "Today Revenue", value: data ? `EUR ${data.summary.totalRevenueToday.toFixed(2)}` : "..." },
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
              EUR {data?.summary.totalRevenueToday.toFixed(2) ?? "0.00"}
            </Text>
          </HStack>

          {data ? (
            <VStack align="stretch" spacing={2}>
              <HStack align="end" spacing={1.5} h="164px" px={1} overflow="hidden">
                {(() => {
                  const chartSeries = withOverviewChartMockLayer(data.hourlyRevenueToday);
                  const maxHourTotal = Math.max(...chartSeries.map((entry) => entry.total), 1);

                  return chartSeries.map((entry) => {
                    const height = Math.max(12, (entry.total / maxHourTotal) * 132);
                    const isActiveHour = entry.total > 0;
                    const isSelected = selectedOverviewHour === entry.hour;

                    return (
                      <VStack key={entry.hour} flex="1" minW={0} spacing={2} align="center" justify="end" h="full">
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
                          onClick={() =>
                            setSelectedOverviewHour((current) => (current === entry.hour ? null : entry.hour))
                          }
                        />
                      </VStack>
                    );
                  });
                })()}
              </HStack>

              <HStack justify="space-between" px={1}>
                {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => (
                  <Text key={hour} fontSize="10px" color="surface.500" fontWeight="700">
                    {hour === 24 ? "00" : String(hour).padStart(2, "0")}
                  </Text>
                ))}
              </HStack>
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
              <Text fontWeight="900">EUR {sale.totalAmount.toFixed(2)}</Text>
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
                <Text fontWeight="900">EUR {store.revenue.toFixed(2)}</Text>
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
          <Text fontWeight="900" fontSize="lg">
            Create Store
          </Text>
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
            alignSelf="flex-start"
            borderRadius="16px"
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

      <VStack spacing={3} align="stretch">
        {stores.map((store) => {
          const draft = storeEdits[store.id] ?? {
            name: store.name,
            address: store.address ?? "",
            isActive: store.isActive,
          };

          return (
            <Box key={store.id} bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <HStack justify="space-between" align="start">
                  <VStack align="start" spacing={1}>
                    <HStack spacing={2}>
                      <Text fontWeight="900" fontSize="lg">
                        {store.name}
                      </Text>
                      <StatusPill label={store.isActive ? "Active" : "Inactive"} tone={store.isActive ? "green" : "red"} />
                    </HStack>
                    <Text fontSize="sm" color="surface.500">
                      Created {formatShortDate(store.createdAt)}
                    </Text>
                  </VStack>
                  <StatusPill
                    label={`${store.activeShiftCount} shifts live`}
                    tone={store.activeShiftCount > 0 ? "blue" : "gray"}
                  />
                </HStack>

                <SimpleGrid columns={2} spacing={3}>
                  <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                    <Text fontSize="xs" color="surface.500" textTransform="uppercase">
                      Sellers
                    </Text>
                    <Text fontWeight="900" fontSize="xl">
                      {store.sellerCount}
                    </Text>
                  </Box>
                  <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                    <Text fontSize="xs" color="surface.500" textTransform="uppercase">
                      Stock Units
                    </Text>
                    <Text fontWeight="900" fontSize="xl">
                      {store.stockUnits}
                    </Text>
                  </Box>
                  <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                    <Text fontSize="xs" color="surface.500" textTransform="uppercase">
                      Revenue Today
                    </Text>
                    <Text fontWeight="900" fontSize="xl">
                      EUR {store.revenueToday.toFixed(2)}
                    </Text>
                  </Box>
                  <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                    <Text fontSize="xs" color="surface.500" textTransform="uppercase">
                      Low Stock
                    </Text>
                    <Text fontWeight="900" fontSize="xl">
                      {store.lowStockCount}
                    </Text>
                  </Box>
                </SimpleGrid>

                <Input
                  value={draft.name}
                  onChange={(event) =>
                    setStoreEdits((current) => ({
                      ...current,
                      [store.id]: {
                        ...draft,
                        name: event.target.value,
                      },
                    }))
                  }
                  placeholder="Store name"
                  borderRadius="18px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />
                <Input
                  value={draft.address}
                  onChange={(event) =>
                    setStoreEdits((current) => ({
                      ...current,
                      [store.id]: {
                        ...draft,
                        address: event.target.value,
                      },
                    }))
                  }
                  placeholder="Store address"
                  borderRadius="18px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />

                <HStack spacing={3}>
                  <Button
                    flex="1"
                    borderRadius="16px"
                    bg={draft.isActive ? "brand.500" : "rgba(241,240,236,0.95)"}
                    color={draft.isActive ? "white" : "surface.800"}
                    _hover={{
                      bg: draft.isActive ? "brand.600" : "rgba(225,223,218,0.95)",
                    }}
                    onClick={() =>
                      setStoreEdits((current) => ({
                        ...current,
                        [store.id]: {
                          ...draft,
                          isActive: true,
                        },
                      }))
                    }
                  >
                    Active
                  </Button>
                  <Button
                    flex="1"
                    borderRadius="16px"
                    bg={!draft.isActive ? "rgba(248,113,113,0.14)" : "rgba(241,240,236,0.95)"}
                    color={!draft.isActive ? "red.500" : "surface.800"}
                    _hover={{
                      bg: !draft.isActive ? "rgba(248,113,113,0.2)" : "rgba(225,223,218,0.95)",
                    }}
                    onClick={() =>
                      setStoreEdits((current) => ({
                        ...current,
                        [store.id]: {
                          ...draft,
                          isActive: false,
                        },
                      }))
                    }
                  >
                    Inactive
                  </Button>
                </HStack>

                <Button
                  alignSelf="flex-start"
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
    </VStack>
  );

  const renderInventory = () => {
    const selectedStore = inventoryStores.find((store) => store.id === selectedInventoryStoreId) ?? null;
    const selectedItem = selectedInventoryItemId
      ? inventoryItems.find((item) => item.storeProductId === selectedInventoryItemId) ?? null
      : null;
    const totalUnits = inventoryItems.reduce((total, item) => total + item.stockQuantity, 0);
    const lowStockCount = inventoryItems.filter((item) => item.stockQuantity <= 10).length;
    const disabledCount = inventoryItems.filter((item) => !item.isEnabled || !item.isProductActive).length;
    const inventorySummaryCards = [
      { label: "Total Units", value: String(totalUnits) },
      { label: "Low Stock", value: String(lowStockCount) },
      { label: "Disabled", value: String(disabledCount) },
      { label: "Products", value: String(inventoryItems.length) },
    ];

    if (selectedItem) {
      const draft = inventoryEdits[selectedItem.storeProductId] ?? {
        price: selectedItem.storePrice.toFixed(2),
        isEnabled: selectedItem.isEnabled,
        adjustQuantity: "1",
        adjustReason: "",
      };

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
                <Button
                  size="sm"
                  borderRadius="14px"
                  variant="outline"
                  borderColor="var(--app-border)"
                  onClick={() => setSelectedInventoryItemId(null)}
                >
                  Back
                </Button>
              </HStack>

              <HStack justify="space-between" align="start">
                <VStack align="start" spacing={1}>
                  <Text fontWeight="900" fontSize="2xl">
                    {selectedItem.productName}
                  </Text>
                  <Text fontSize="sm" color="surface.500">
                    Default EUR {selectedItem.defaultPrice.toFixed(2)}
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
                    EUR {selectedItem.storePrice.toFixed(2)}
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
                <SimpleGrid columns={2} spacing={2}>
                  <Input
                    value={draft.adjustQuantity}
                    onChange={(event) =>
                      setInventoryEdits((current) => ({
                        ...current,
                        [selectedItem.storeProductId]: {
                          ...draft,
                          adjustQuantity: event.target.value,
                        },
                      }))
                    }
                    placeholder="Quantity"
                    inputMode="decimal"
                    borderRadius="18px"
                    bg="white"
                    borderColor="rgba(226,224,218,0.95)"
                  />
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
                    placeholder="Reason"
                    borderRadius="18px"
                    bg="white"
                    borderColor="rgba(226,224,218,0.95)"
                  />
                </SimpleGrid>
                <SimpleGrid columns={3} spacing={2}>
                  <Button
                    borderRadius="16px"
                    variant="outline"
                    borderColor="var(--app-border)"
                    isLoading={mutating}
                    onClick={() => void handleInventoryAdjustment(selectedItem.storeProductId, "manual_adjustment")}
                  >
                    Adjust
                  </Button>
                  <Button
                    borderRadius="16px"
                    bg="brand.500"
                    color="white"
                    _hover={{ bg: "brand.600" }}
                    isLoading={mutating}
                    onClick={() => void handleInventoryAdjustment(selectedItem.storeProductId, "restock")}
                  >
                    Restock
                  </Button>
                  <Button
                    borderRadius="16px"
                    bg="rgba(248,113,113,0.14)"
                    color="red.500"
                    _hover={{ bg: "rgba(248,113,113,0.2)" }}
                    isLoading={mutating}
                    onClick={() => void handleInventoryAdjustment(selectedItem.storeProductId, "writeoff")}
                  >
                    Writeoff
                  </Button>
                </SimpleGrid>
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
              {loadingInventory ? <StatusPill label="Updating" tone="blue" /> : null}
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
                  {mode === "stock" ? `Stock · ${inventoryItems.length}` : `Products · ${products.length}`}
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
                  {inventoryItems.length} items
                </Text>
              </HStack>

              {inventoryItems.map((item) => (
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
                        EUR {item.storePrice.toFixed(2)}
                      </Text>
                      <Text fontSize="xs" color="surface.500">
                        Default EUR {item.defaultPrice.toFixed(2)} · Updated {formatShortDate(item.updatedAt)}
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
                              Default EUR {product.defaultPrice.toFixed(2)}
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
                        <HStack spacing={2}>
                          <Button
                            flex="1"
                            size="sm"
                            borderRadius="14px"
                            bg={draft.isActive ? "brand.500" : "rgba(241,240,236,0.95)"}
                            color={draft.isActive ? "white" : "surface.800"}
                            onClick={() =>
                              setProductEdits((current) => ({
                                ...current,
                                [product.id]: { ...draft, isActive: true },
                              }))
                            }
                          >
                            Active
                          </Button>
                          <Button
                            flex="1"
                            size="sm"
                            borderRadius="14px"
                            bg={!draft.isActive ? "rgba(248,113,113,0.14)" : "rgba(241,240,236,0.95)"}
                            color={!draft.isActive ? "red.500" : "surface.800"}
                            onClick={() =>
                              setProductEdits((current) => ({
                                ...current,
                                [product.id]: { ...draft, isActive: false },
                              }))
                            }
                          >
                            Inactive
                          </Button>
                          <Button
                            size="sm"
                            borderRadius="14px"
                            bg="surface.900"
                            color="white"
                            isLoading={mutating}
                            onClick={() => void handleSaveProduct(product.id)}
                          >
                            Save
                          </Button>
                        </HStack>
                        <Button
                          size="sm"
                          borderRadius="14px"
                          bg="rgba(248,113,113,0.14)"
                          color="red.500"
                          _hover={{ bg: "rgba(248,113,113,0.22)" }}
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

        {inventoryMode === "stock" && inventoryHistory.length > 0 ? (
          <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between">
                <Text fontWeight="900" fontSize="lg">
                  Recent Movements
                </Text>
                <Text color="surface.500" fontWeight="700" fontSize="sm">
                  {inventoryHistory.length} entries
                </Text>
              </HStack>

              {inventoryHistory.slice(0, 6).map((entry) => (
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
          { label: "Revenue", value: `EUR ${salesTotal.toFixed(2)}` },
          { label: "Sales", value: String(visibleSales.length) },
          { label: "Cash", value: `EUR ${cashTotal.toFixed(2)}` },
          { label: "Card", value: `EUR ${cardTotal.toFixed(2)}` },
        ]
      : [
          { label: "Returned", value: `EUR ${returnsTotal.toFixed(2)}` },
          { label: "Returns", value: String(visibleReturns.length) },
          { label: "Units", value: String(returnedUnits) },
          { label: "Avg Return", value: `EUR ${(returnsTotal / Math.max(visibleReturns.length, 1)).toFixed(2)}` },
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
                <Button
                  size="sm"
                  borderRadius="14px"
                  variant="outline"
                  borderColor="var(--app-border)"
                  onClick={() => setSelectedAdminSaleId(null)}
                >
                  Back
                </Button>
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
                      Qty {item.quantity} x EUR {item.finalPrice.toFixed(2)}
                    </Text>
                    {item.discountType ? (
                      <Text fontSize="xs" color="surface.500">
                        Discount {item.discountType}: {item.discountValue}
                      </Text>
                    ) : null}
                  </VStack>
                  <Text fontWeight="900">EUR {item.lineTotal.toFixed(2)}</Text>
                </HStack>
              ))}

              <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

              <VStack align="stretch" spacing={2}>
                <HStack justify="space-between">
                  <Text color="surface.500" fontWeight="700">
                    Subtotal
                  </Text>
                  <Text fontWeight="800">EUR {selectedSale.subtotalAmount.toFixed(2)}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text color="surface.500" fontWeight="700">
                    Discount
                  </Text>
                  <Text fontWeight="800">EUR {selectedSale.discountAmount.toFixed(2)}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="lg" fontWeight="900">
                    Total
                  </Text>
                  <Text fontSize="lg" fontWeight="900">
                    EUR {selectedSale.totalAmount.toFixed(2)}
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
                <Button
                  size="sm"
                  borderRadius="14px"
                  variant="outline"
                  borderColor="var(--app-border)"
                  onClick={() => setSelectedAdminReturnId(null)}
                >
                  Back
                </Button>
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
                      Qty {item.quantity} x EUR {item.returnedPrice.toFixed(2)}
                    </Text>
                  </VStack>
                  <Text fontWeight="900">EUR {item.lineTotal.toFixed(2)}</Text>
                </HStack>
              ))}

              <Box borderTop="1px dashed rgba(170,167,158,0.7)" />

              <HStack justify="space-between">
                <Text fontSize="lg" fontWeight="900">
                  Total Returned
                </Text>
                <Text fontSize="lg" fontWeight="900">
                  EUR {selectedReturn.totalAmount.toFixed(2)}
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
                        <Text fontWeight="900">EUR {sale.totalAmount.toFixed(2)}</Text>
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
                        <Text fontWeight="900">EUR {entry.totalAmount.toFixed(2)}</Text>
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
    <VStack spacing={3} align="stretch">
      {staff.map((seller) => (
        <Box key={seller.id} bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between" align="start">
              <VStack align="start" spacing={1}>
                <HStack spacing={2}>
                  <Text fontWeight="900" fontSize="lg">
                    {seller.fullName}
                  </Text>
                  <StatusPill label={seller.isActive ? "Active" : "Inactive"} tone={seller.isActive ? "green" : "red"} />
                </HStack>
                <Text fontSize="sm" color="surface.500">
                  Telegram ID {seller.telegramId}
                </Text>
              </VStack>
              {seller.activeShift ? (
                <StatusPill
                  label={`${seller.activeShift.storeName} · ${seller.activeShift.status}`}
                  tone={seller.activeShift.status === "paused" ? "orange" : "blue"}
                />
              ) : (
                <StatusPill label="No open shift" tone="gray" />
              )}
            </HStack>

            <SimpleGrid columns={2} spacing={3}>
              <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                <Text fontSize="xs" color="surface.500" textTransform="uppercase">
                  Current Store
                </Text>
                <Text fontWeight="900">{seller.currentAssignment?.storeName ?? "Unassigned"}</Text>
                <Text fontSize="xs" color="surface.500" mt={1}>
                  Since {seller.currentAssignment ? formatDateTime(seller.currentAssignment.startedAt) : "Not assigned"}
                </Text>
              </Box>
              <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                <Text fontSize="xs" color="surface.500" textTransform="uppercase">
                  Sales Performance
                </Text>
                <Text fontWeight="900">{seller.salesCount} sales</Text>
                <Text fontSize="xs" color="surface.500" mt={1}>
                  EUR {seller.revenue.toFixed(2)} · Last {formatDateTime(seller.lastSaleAt)}
                </Text>
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
              borderRadius="18px"
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

            <HStack spacing={3}>
              <Button
                flex="1"
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
                flex="1"
                borderRadius="16px"
                bg="rgba(241,240,236,0.95)"
                color="surface.800"
                _hover={{ bg: "rgba(225,223,218,0.95)" }}
                isDisabled={!seller.currentAssignment || !seller.isActive}
                onClick={() => void onViewAsSeller(seller.id)}
              >
                View as Seller
              </Button>
            </HStack>
          </VStack>
        </Box>
      ))}
    </VStack>
  );

  const renderTeam = () => (
    <VStack spacing={4} align="stretch">
      <SimpleGrid columns={2} spacing={3}>
        <Box bg={panelSurface} borderRadius="22px" px={4} py={4} boxShadow={panelShadow}>
          <Text fontSize="xs" textTransform="uppercase" color="surface.500" letterSpacing="0.08em">
            Active Stores
          </Text>
          <Text fontSize="2xl" fontWeight="900" mt={2}>
            {stores.filter((store) => store.isActive).length}
          </Text>
        </Box>
        <Box bg={panelSurface} borderRadius="22px" px={4} py={4} boxShadow={panelShadow}>
          <Text fontSize="xs" textTransform="uppercase" color="surface.500" letterSpacing="0.08em">
            Sellers
          </Text>
          <Text fontSize="2xl" fontWeight="900" mt={2}>
            {staff.length}
          </Text>
        </Box>
      </SimpleGrid>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={4}>
          <HStack justify="space-between" align="center">
            <Text fontWeight="900" fontSize="lg">
              Stores
            </Text>
            <Text color="surface.500" fontWeight="700" fontSize="sm">
              {stores.length} locations
            </Text>
          </HStack>
          {renderStoresSection()}
        </VStack>
      </Box>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={4}>
          <HStack justify="space-between" align="center">
            <Text fontWeight="900" fontSize="lg">
              Staff
            </Text>
            <Text color="surface.500" fontWeight="700" fontSize="sm">
              {staff.length} sellers
            </Text>
          </HStack>
          {renderStaffSection()}
        </VStack>
      </Box>
    </VStack>
  );

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
    <Box minH="100vh" px={3} pt={4} pb={bottomNavReservedSpace}>
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

          {loading || loadingStores || loadingStaff || loadingInventory ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={5} boxShadow={panelShadow}>
              <Text fontWeight="800">
                {activeTab === "team"
                  ? "Loading team data..."
                  : activeTab === "inventory"
                    ? "Loading inventory..."
                    : "Loading admin data..."}
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
        <AdminNav activeTab={activeTab} onChange={setActiveTab} />
      </Box>
    </Box>
  );
}
