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

const panelSurface = "rgba(255,255,255,0.88)";
const panelMutedSurface = "rgba(241,240,236,0.82)";
const panelShadow = "0 18px 36px rgba(18, 18, 18, 0.06)";
const panelRadius = "24px";
const bottomNavOffset = "max(8px, env(safe-area-inset-bottom, 0px))";
const bottomNavReservedSpace = "calc(82px + env(safe-area-inset-bottom, 0px))";

type AdminDashboardScreenProps = {
  operatorName: string;
  currentPanel: "admin" | "seller";
  onSwitchPanel: (panel: "admin" | "seller") => Promise<void>;
  onViewAsSeller: (sellerId: string) => Promise<void>;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "No activity yet";
  }

  return new Date(value).toLocaleString();
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString();
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
    adjustInventory,
  } = useAdminManagementStore();
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
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
  const [salesDateFrom, setSalesDateFrom] = useState("");
  const [salesDateTo, setSalesDateTo] = useState("");
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
    void loadSalesOverview({ saleStatus: "all", limit: 20 });
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

    if (!newProduct.name.trim() || !newProduct.sku.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return;
    }

    await createProduct({
      name: newProduct.name,
      sku: newProduct.sku,
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

    if (!draft || !draft.name.trim() || !draft.sku.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return;
    }

    await updateProduct(productId, {
      name: draft.name,
      sku: draft.sku,
      defaultPrice: parsedPrice,
      isActive: draft.isActive,
    });

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

  const handleApplySalesFilters = async () => {
    const dateFrom = salesDateFrom ? new Date(`${salesDateFrom}T00:00:00`).toISOString() : undefined;
    const dateTo = salesDateTo ? new Date(`${salesDateTo}T23:59:59`).toISOString() : undefined;

    await loadSalesOverview({
      storeId: salesStoreFilter || undefined,
      sellerId: salesSellerFilter || undefined,
      saleStatus: salesStatusFilter,
      dateFrom,
      dateTo,
      limit: 20,
    });
  };

  const renderDashboard = () => (
    <VStack spacing={4} align="stretch">
      <SimpleGrid columns={2} spacing={3}>
        {[
          { label: "Today Revenue", value: data ? `EUR ${data.summary.totalRevenueToday.toFixed(2)}` : "..." },
          { label: "All-time Revenue", value: data ? `EUR ${data.summary.totalRevenueAllTime.toFixed(2)}` : "..." },
          { label: "Sales Today", value: data ? String(data.summary.completedSalesToday) : "..." },
          { label: "Active Shifts", value: data ? String(data.summary.activeShifts) : "..." },
          { label: "Stores", value: data ? String(data.summary.totalStores) : "..." },
          { label: "Low Stock", value: data ? String(data.summary.lowStockCount) : "..." },
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
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Text fontWeight="900" fontSize="lg">
              Recent Sales
            </Text>
            <Text color="surface.500" fontWeight="700" fontSize="sm">
              {data?.recentSales.length ?? 0} items
            </Text>
          </HStack>
          {(data?.recentSales ?? []).map((sale) => (
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

  const renderStores = () => (
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

  const renderInventory = () => (
    <VStack spacing={4} align="stretch">
      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={3}>
          <Text fontWeight="900" fontSize="lg">
            Global Products
          </Text>
          <Text color="surface.500" fontSize="sm">
            New products are automatically added to every store with zero stock and default pricing.
          </Text>
          <Input
            value={newProduct.name}
            onChange={(event) => setNewProduct((current) => ({ ...current, name: event.target.value }))}
            placeholder="Product name"
            borderRadius="18px"
            bg="white"
            borderColor="rgba(226,224,218,0.95)"
          />
          <SimpleGrid columns={2} spacing={2}>
            <Input
              value={newProduct.sku}
              onChange={(event) => setNewProduct((current) => ({ ...current, sku: event.target.value }))}
              placeholder="SKU"
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
          </SimpleGrid>
          <Button
            alignSelf="flex-start"
            borderRadius="16px"
            bg="brand.500"
            color="white"
            _hover={{ bg: "brand.600" }}
            isLoading={mutating}
            onClick={() => void handleCreateProduct()}
          >
            Add Product
          </Button>

          {products.slice(0, 8).map((product) => {
            const draft = productEdits[product.id] ?? {
              name: product.name,
              sku: product.sku,
              defaultPrice: product.defaultPrice.toFixed(2),
              isActive: product.isActive,
            };

            return (
              <Box key={product.id} bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                <VStack align="stretch" spacing={2}>
                  <HStack justify="space-between">
                    <Text fontWeight="900">{product.name}</Text>
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
                  <SimpleGrid columns={2} spacing={2}>
                    <Input
                      value={draft.sku}
                      onChange={(event) =>
                        setProductEdits((current) => ({
                          ...current,
                          [product.id]: { ...draft, sku: event.target.value },
                        }))
                      }
                      placeholder="SKU"
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
                  </SimpleGrid>
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
                </VStack>
              </Box>
            );
          })}
        </VStack>
      </Box>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={3}>
          <Text fontWeight="900" fontSize="lg">
            Inventory Scope
          </Text>
          <Select
            value={selectedInventoryStoreId}
            onChange={(event) => setSelectedInventoryStoreId(event.target.value)}
            borderRadius="18px"
            bg="white"
            borderColor="rgba(226,224,218,0.95)"
          >
            {inventoryStores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
        </VStack>
      </Box>

      <VStack spacing={3} align="stretch">
        {inventoryItems.map((item) => {
          const draft = inventoryEdits[item.storeProductId] ?? {
            price: item.storePrice.toFixed(2),
            isEnabled: item.isEnabled,
            adjustQuantity: "1",
            adjustReason: "",
          };

          return (
            <Box key={item.storeProductId} bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
              <VStack align="stretch" spacing={3}>
                <HStack justify="space-between" align="start">
                  <VStack align="start" spacing={1}>
                    <HStack spacing={2}>
                      <Text fontWeight="900" fontSize="lg">
                        {item.productName}
                      </Text>
                      <StatusPill label={draft.isEnabled ? "Enabled" : "Disabled"} tone={draft.isEnabled ? "green" : "red"} />
                      {!item.isProductActive ? <StatusPill label="Product Off" tone="orange" /> : null}
                    </HStack>
                    <Text fontSize="sm" color="surface.500">
                      {item.sku} · Default EUR {item.defaultPrice.toFixed(2)}
                    </Text>
                  </VStack>
                  <StatusPill
                    label={`Stock ${item.stockQuantity}`}
                    tone={item.stockQuantity <= 10 ? "orange" : "blue"}
                  />
                </HStack>

                <SimpleGrid columns={2} spacing={3}>
                  <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                    <Text fontSize="xs" color="surface.500" textTransform="uppercase">
                      Store Price
                    </Text>
                    <Text fontWeight="900" fontSize="xl">
                      EUR {item.storePrice.toFixed(2)}
                    </Text>
                  </Box>
                  <Box bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
                    <Text fontSize="xs" color="surface.500" textTransform="uppercase">
                      Last Update
                    </Text>
                    <Text fontWeight="900" fontSize="sm">
                      {formatDateTime(item.updatedAt)}
                    </Text>
                  </Box>
                </SimpleGrid>

                <Input
                  value={draft.price}
                  onChange={(event) =>
                    setInventoryEdits((current) => ({
                      ...current,
                      [item.storeProductId]: {
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

                <HStack spacing={3}>
                  <Button
                    flex="1"
                    borderRadius="16px"
                    bg={draft.isEnabled ? "brand.500" : "rgba(241,240,236,0.95)"}
                    color={draft.isEnabled ? "white" : "surface.800"}
                    _hover={{
                      bg: draft.isEnabled ? "brand.600" : "rgba(225,223,218,0.95)",
                    }}
                    onClick={() =>
                      setInventoryEdits((current) => ({
                        ...current,
                        [item.storeProductId]: {
                          ...draft,
                          isEnabled: true,
                        },
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
                    _hover={{
                      bg: !draft.isEnabled ? "rgba(248,113,113,0.2)" : "rgba(225,223,218,0.95)",
                    }}
                    onClick={() =>
                      setInventoryEdits((current) => ({
                        ...current,
                        [item.storeProductId]: {
                          ...draft,
                          isEnabled: false,
                        },
                      }))
                    }
                  >
                    Disabled
                  </Button>
                </HStack>

                <Button
                  alignSelf="flex-start"
                  borderRadius="16px"
                  bg="surface.900"
                  color="white"
                  _hover={{ bg: "surface.700" }}
                  isLoading={mutating}
                  onClick={() => void handleSaveStoreProduct(item.storeProductId)}
                >
                  Save Price & Status
                </Button>

                <Input
                  value={draft.adjustQuantity}
                  onChange={(event) =>
                    setInventoryEdits((current) => ({
                      ...current,
                      [item.storeProductId]: {
                        ...draft,
                        adjustQuantity: event.target.value,
                      },
                    }))
                  }
                  placeholder="Adjustment quantity"
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
                      [item.storeProductId]: {
                        ...draft,
                        adjustReason: event.target.value,
                      },
                    }))
                  }
                  placeholder="Reason for stock change"
                  borderRadius="18px"
                  bg="white"
                  borderColor="rgba(226,224,218,0.95)"
                />

                <SimpleGrid columns={3} spacing={2}>
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor="var(--app-border)"
                    isLoading={mutating}
                    onClick={() => void handleInventoryAdjustment(item.storeProductId, "manual_adjustment")}
                  >
                    Adjust
                  </Button>
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor="var(--app-border)"
                    isLoading={mutating}
                    onClick={() => void handleInventoryAdjustment(item.storeProductId, "restock")}
                  >
                    Restock
                  </Button>
                  <Button
                    size="sm"
                    borderRadius="14px"
                    variant="outline"
                    borderColor="rgba(248,113,113,0.35)"
                    color="red.500"
                    isLoading={mutating}
                    onClick={() => void handleInventoryAdjustment(item.storeProductId, "writeoff")}
                  >
                    Writeoff
                  </Button>
                </SimpleGrid>
              </VStack>
            </Box>
          );
        })}
      </VStack>

      {inventoryHistory.length > 0 ? (
        <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between">
              <Text fontWeight="900" fontSize="lg">
                Inventory History
              </Text>
              <Text color="surface.500" fontWeight="700" fontSize="sm">
                {inventoryHistory.length} entries
              </Text>
            </HStack>

            {inventoryHistory.map((entry) => (
              <HStack key={entry.id} justify="space-between" align="start">
                <VStack align="start" spacing={0}>
                  <Text fontWeight="700">{entry.product?.name ?? "Unknown product"}</Text>
                  <Text fontSize="sm" color="surface.500">
                    {entry.movementType} · balance {entry.balanceAfter}
                  </Text>
                  <Text fontSize="xs" color="surface.500">
                    {formatDateTime(entry.createdAt)} · {entry.actor?.full_name ?? "Unknown actor"}
                  </Text>
                  {entry.reason ? (
                    <Text fontSize="xs" color="surface.500">
                      {entry.reason}
                    </Text>
                  ) : null}
                </VStack>
                <Text
                  fontWeight="800"
                  color={entry.quantityDelta >= 0 ? "green.500" : "red.400"}
                >
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

  const renderSales = () => (
    <VStack spacing={4} align="stretch">
      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={3}>
          <Text fontWeight="900" fontSize="lg">
            Sales Filters
          </Text>
          <Select
            value={salesStoreFilter}
            onChange={(event) => setSalesStoreFilter(event.target.value)}
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
            onChange={(event) => setSalesSellerFilter(event.target.value)}
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
            onChange={(event) => setSalesStatusFilter(event.target.value as "all" | "completed" | "deleted")}
            borderRadius="18px"
            bg="white"
            borderColor="rgba(226,224,218,0.95)"
          >
            <option value="all">All sales</option>
            <option value="completed">Completed only</option>
            <option value="deleted">Deleted only</option>
          </Select>
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
          </SimpleGrid>
          <Button
            alignSelf="flex-start"
            borderRadius="16px"
            bg="brand.500"
            color="white"
            _hover={{ bg: "brand.600" }}
            isLoading={loadingSales}
            onClick={() => void handleApplySalesFilters()}
          >
            Apply Filters
          </Button>
        </VStack>
      </Box>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Text fontWeight="900" fontSize="lg">
              Sales
            </Text>
            <Text color="surface.500" fontWeight="700" fontSize="sm">
              {salesOverview.length} items
            </Text>
          </HStack>
          {salesOverview.length === 0 ? (
            <Text color="surface.500" fontSize="sm">
              No sales match the current filters.
            </Text>
          ) : null}
          {salesOverview.map((sale) => (
            <Box key={sale.id} bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
              <VStack align="stretch" spacing={2}>
                <HStack justify="space-between" align="start">
                  <VStack align="start" spacing={0}>
                    <HStack spacing={2}>
                      <Text fontWeight="900">{sale.store?.name ?? "Unknown store"}</Text>
                      <StatusPill
                        label={sale.status === "deleted" ? "Deleted" : "Completed"}
                        tone={sale.status === "deleted" ? "red" : "green"}
                      />
                    </HStack>
                    <Text fontSize="sm" color="surface.500">
                      {sale.seller?.fullName ?? "Unknown seller"} · {sale.paymentMethod.toUpperCase()}
                    </Text>
                    <Text fontSize="xs" color="surface.500">
                      {formatDateTime(sale.createdAt)}
                    </Text>
                  </VStack>
                  <Text fontWeight="900">EUR {sale.totalAmount.toFixed(2)}</Text>
                </HStack>

                {sale.items.map((item) => (
                  <HStack key={item.id} justify="space-between" align="start">
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="700">
                        {item.productNameSnapshot}
                      </Text>
                      <Text fontSize="xs" color="surface.500">
                        Qty {item.quantity} · EUR {item.finalPrice.toFixed(2)} · {item.skuSnapshot}
                      </Text>
                    </VStack>
                    <Text fontSize="sm" fontWeight="800">
                      EUR {item.lineTotal.toFixed(2)}
                    </Text>
                  </HStack>
                ))}

                {sale.status === "deleted" ? (
                  <Box bg="rgba(248,113,113,0.08)" borderRadius="14px" px={3} py={2}>
                    <Text fontSize="sm" fontWeight="700" color="red.500">
                      Deleted {sale.deletedAt ? formatDateTime(sale.deletedAt) : ""}
                    </Text>
                    <Text fontSize="xs" color="surface.500">
                      {sale.deletedBy?.fullName ?? "Unknown user"} · {sale.deletionReason ?? "No reason"}
                    </Text>
                  </Box>
                ) : null}
              </VStack>
            </Box>
          ))}
        </VStack>
      </Box>

      <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={4} boxShadow={panelShadow}>
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Text fontWeight="900" fontSize="lg">
              Returns
            </Text>
            <Text color="surface.500" fontWeight="700" fontSize="sm">
              {returnsOverview.length} items
            </Text>
          </HStack>
          {returnsOverview.length === 0 ? (
            <Text color="surface.500" fontSize="sm">
              No returns match the current filters.
            </Text>
          ) : null}
          {returnsOverview.map((entry) => (
            <Box key={entry.id} bg={panelMutedSurface} borderRadius="18px" px={3} py={3}>
              <VStack align="stretch" spacing={2}>
                <HStack justify="space-between" align="start">
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="900">{entry.store?.name ?? "Unknown store"}</Text>
                    <Text fontSize="sm" color="surface.500">
                      {entry.seller?.fullName ?? "Unknown seller"} · Sale {entry.saleId.slice(0, 8)}
                    </Text>
                    <Text fontSize="xs" color="surface.500">
                      {formatDateTime(entry.createdAt)}
                    </Text>
                  </VStack>
                  <Text fontWeight="900">EUR {entry.totalAmount.toFixed(2)}</Text>
                </HStack>

                {entry.items.map((item) => (
                  <HStack key={item.id} justify="space-between" align="start">
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="700">
                        {item.productNameSnapshot}
                      </Text>
                      <Text fontSize="xs" color="surface.500">
                        Qty {item.quantity} · EUR {item.returnedPrice.toFixed(2)} · {item.skuSnapshot}
                      </Text>
                    </VStack>
                    <Text fontSize="sm" fontWeight="800">
                      EUR {item.lineTotal.toFixed(2)}
                    </Text>
                  </HStack>
                ))}

                <Box bg="rgba(74,132,244,0.08)" borderRadius="14px" px={3} py={2}>
                  <Text fontSize="xs" color="surface.500">
                    {entry.reason}
                  </Text>
                </Box>
              </VStack>
            </Box>
          ))}
        </VStack>
      </Box>
    </VStack>
  );

  const renderStaff = () => (
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
      case "stores":
        return renderStores();
      case "staff":
        return renderStaff();
      case "options":
        return (
          <VStack spacing={4} align="stretch">
            {renderPlaceholder(
              "Admin Options",
              "Developer tools live here for now. Later we can add admin preferences and support diagnostics."
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
      case "dashboard":
      default:
        return renderDashboard();
    }
  };

  return (
    <Box minH="100vh" px={3} pt={4} pb={bottomNavReservedSpace}>
      <Container maxW="container.sm" px={0}>
        <VStack spacing={5} align="stretch">
          <Box
            bg="rgba(255, 255, 255, 0.68)"
            border="1px solid rgba(255, 255, 255, 0.78)"
            borderRadius="30px"
            px={4}
            py={4}
            boxShadow="0 18px 50px rgba(41, 36, 26, 0.06)"
            backdropFilter="blur(12px)"
          >
            <HStack justify="space-between" align="start">
              <VStack align="start" spacing={1}>
                <Text fontSize="3xl" lineHeight="1.05" fontWeight="900" letterSpacing="-0.03em">
                  Retail Control Room
                </Text>
                <Text color="surface.500" fontWeight="700" fontSize="sm">
                  Stores, staffing and operations in one place
                </Text>
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
                <Text fontWeight="800">{operatorName}</Text>
              </HStack>
            </HStack>
          </Box>

          {loading || loadingStores || loadingStaff || loadingInventory || loadingSales ? (
            <Box bg={panelSurface} borderRadius={panelRadius} px={4} py={5} boxShadow={panelShadow}>
              <Text fontWeight="800">
                {activeTab === "stores"
                  ? "Loading stores..."
                  : activeTab === "staff"
                    ? "Loading staff..."
                    : activeTab === "sales"
                      ? "Loading sales..."
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

      <Box position="fixed" left={0} right={0} bottom={bottomNavOffset} zIndex={30} px={3}>
        <Container maxW="container.sm" px={0}>
          <AdminNav activeTab={activeTab} onChange={setActiveTab} />
        </Container>
      </Box>
    </Box>
  );
}
