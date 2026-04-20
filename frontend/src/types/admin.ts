export type AdminDashboardResponse = {
  summary: {
    totalRevenueToday: number;
    totalRevenueAllTime: number;
    completedSalesToday: number;
    totalStores: number;
    totalSellers: number;
    activeShifts: number;
    lowStockCount: number;
  };
  hourlyRevenueToday: Array<{
    hour: number;
    total: number;
  }>;
  recentSales: Array<{
    id: string;
    totalAmount: number;
    paymentMethod: "cash" | "card";
    status: "completed" | "deleted";
    createdAt: string;
    store: { id: string; name: string } | null;
    seller: { id: string; fullName: string } | null;
  }>;
  activeShifts: Array<{
    id: string;
    status: "active" | "paused" | "closed";
    startedAt: string;
    pausedTotalSeconds: number;
    store: { id: string; name: string } | null;
    seller: { id: string; fullName: string } | null;
  }>;
  lowStockItems: Array<{
    inventoryId: string;
    quantity: number;
    store: { id: string; name: string } | null;
    product: { id: string; name: string; sku: string } | null;
  }>;
  storePerformance: Array<{
    id: string;
    name: string;
    address: string | null;
    active: boolean;
    sellerCount: number;
    stockUnits: number;
    salesCount: number;
    revenue: number;
  }>;
};

export type AdminStoresResponse = {
  stores: Array<{
    id: string;
    name: string;
    address: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    sellerCount: number;
    activeShiftCount: number;
    stockUnits: number;
    lowStockCount: number;
    salesCount: number;
    revenueAllTime: number;
    revenueToday: number;
  }>;
};

export type AdminStoreMutationResponse = {
  store: {
    id: string;
    name: string;
    address: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
};

export type AdminStaffResponse = {
  sellers: Array<{
    id: string;
    telegramId: number;
    fullName: string;
    isActive: boolean;
    currentAssignment: {
      id: string;
      storeId: string;
      storeName: string;
      startedAt: string;
    } | null;
    activeShift: {
      id: string;
      storeId: string;
      storeName: string;
      status: "active" | "paused" | "closed";
      startedAt: string;
      pausedTotalSeconds: number;
    } | null;
    salesCount: number;
    revenue: number;
    lastSaleAt: string | null;
  }>;
};

export type AdminAssignmentMutationResponse = {
  assignment: {
    id: string;
    sellerId: string;
    sellerName: string;
    storeId: string;
    storeName: string;
    startedAt: string;
  };
};

export type AdminSellerMutationResponse = {
  seller: AdminStaffResponse["sellers"][number];
};

export type AdminInventoryResponse = {
  stores: Array<{
    id: string;
    name: string;
    isActive: boolean;
  }>;
  products: AdminProductsResponse["products"];
  selectedStoreId: string | null;
  items: Array<{
    storeProductId: string;
    storeId: string;
    storeName: string;
    productId: string;
    productName: string;
    sku: string;
    defaultPrice: number;
    storePrice: number;
    isEnabled: boolean;
    isProductActive: boolean;
    stockQuantity: number;
    updatedAt: string;
  }>;
  history: Array<{
    id: string;
    movementType: string;
    quantityDelta: number;
    balanceAfter: number;
    reason: string | null;
    createdAt: string;
    product: {
      id: string;
      name: string;
      sku: string;
    } | null;
    actor: {
      id: string;
      full_name: string;
      role: "admin" | "seller";
    } | null;
    saleId: string | null;
    returnId: string | null;
    shiftId: string | null;
  }>;
  storeSnapshotsByStoreId?: Record<
    string,
    {
      items: AdminInventoryResponse["items"];
      history: AdminInventoryResponse["history"];
    }
  >;
};

export type AdminProductsResponse = {
  products: Array<{
    id: string;
    name: string;
    sku: string;
    defaultPrice: number;
    isActive: boolean;
    isArchived: boolean;
    archivedAt: string | null;
    enabledStoreCount: number;
    storeSettings: Array<{
      storeProductId: string;
      storeId: string;
      storeName: string;
      storeActive: boolean;
      storePrice: number;
      isEnabled: boolean;
      updatedAt: string;
    }>;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type AdminProductMutationResponse = {
  product: AdminProductsResponse["products"][number];
};

export type AdminStoreProductMutationResponse = {
  item: {
    storeProductId: string;
    storeId: string;
    productId: string;
    storePrice: number;
    isEnabled: boolean;
    updatedAt: string;
  };
};

export type AdminSalesOverviewResponse = {
  filters: {
    storeId: string | null;
    sellerId: string | null;
    saleStatus: "all" | "completed" | "deleted";
    dateFrom: string | null;
    dateTo: string | null;
  };
  stores: Array<{
    id: string;
    name: string;
    isActive: boolean;
  }>;
  sellers: Array<{
    id: string;
    fullName: string;
    isActive: boolean;
  }>;
  summary: {
    revenue: number;
    salesCount: number;
    cashTotal: number;
    cardTotal: number;
    returnsTotal: number;
    returnsCount: number;
    returnedUnits: number;
    averageReturn: number;
  };
  sales: Array<{
    id: string;
    status: "completed" | "deleted";
    paymentMethod: "cash" | "card";
    subtotalAmount: number;
    discountAmount: number;
    totalAmount: number;
    createdAt: string;
    deletedAt: string | null;
    deletionReason: string | null;
    store: { id: string; name: string } | null;
    seller: { id: string; fullName: string } | null;
    deletedBy: { id: string; fullName: string } | null;
    items: Array<{
      id: string;
      productId: string;
      productNameSnapshot: string;
      skuSnapshot: string;
      basePrice: number;
      finalPrice: number;
      discountType: "amount" | "percent" | null;
      discountValue: number | null;
      quantity: number;
      lineTotal: number;
    }>;
  }>;
  returns: Array<{
    id: string;
    saleId: string;
    reason: string;
    totalAmount: number;
    createdAt: string;
    store: { id: string; name: string } | null;
    seller: { id: string; fullName: string } | null;
    items: Array<{
      id: string;
      saleItemId: string | null;
      productId: string;
      productNameSnapshot: string;
      skuSnapshot: string;
      returnedPrice: number;
      quantity: number;
      lineTotal: number;
    }>;
  }>;
  periodSummaries?: {
    today: AdminSalesOverviewResponse["summary"];
    week: AdminSalesOverviewResponse["summary"];
    month: AdminSalesOverviewResponse["summary"];
  };
};

export type AdminStartupResponse = {
  me: {
    user: {
      id: string;
      full_name: string;
      role: "admin" | "seller";
    };
    assignment: null;
  };
  dashboard: AdminDashboardResponse;
  stores: AdminStoresResponse;
  staff: AdminStaffResponse;
  inventory: AdminInventoryResponse;
  sales: AdminSalesOverviewResponse;
};
