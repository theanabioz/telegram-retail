export type SellerCatalogProduct = {
  id: string;
  name: string;
  sku: string;
  defaultPrice: number;
  storePrice: number;
  stock: number;
  isEnabled: boolean;
  isActive: boolean;
};

export type SellerCatalogResponse = {
  store: {
    id: string;
    store_id: string;
    store_name: string;
  };
  shift: {
    id: string;
    status: "active" | "paused" | "closed";
    store_id: string;
  };
  products: SellerCatalogProduct[];
};

export type AuthSessionResponse = {
  token: string;
  user: {
    app_user_id: string;
    app_role: "admin" | "seller";
    telegram_id: number;
    full_name: string;
    store_id: string | null;
  };
  assignment: {
    id: string;
    store_id: string;
    store_name: string;
  } | null;
};

export type ShiftStateResponse = {
  activeShift: {
    id: string;
    user_id: string;
    store_id: string;
    status: "active" | "paused" | "closed";
    started_at: string;
    ended_at: string | null;
    paused_total_seconds: number;
    current_pause_started_at: string | null;
  } | null;
  summary: {
    totalSeconds: number;
    pausedSeconds: number;
    workedSeconds: number;
  } | null;
};

export type ShiftSummary = NonNullable<ShiftStateResponse["summary"]>;

export type ShiftHistoryResponse = {
  items: Array<{
    shift: NonNullable<ShiftStateResponse["activeShift"]>;
    summary: ShiftSummary;
  }>;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type ShiftHistoryItem = ShiftHistoryResponse["items"][number];

export type ShiftDetailsResponse = {
  shift: NonNullable<ShiftStateResponse["activeShift"]>;
  summary: ShiftSummary;
  store: {
    id: string;
    name: string;
  } | null;
  salesSummary: {
    count: number;
    totalRevenue: number;
    cashSalesCount: number;
    cardSalesCount: number;
    cashRevenue: number;
    cardRevenue: number;
    lastSaleAt: string | null;
  };
  commission: {
    ratePercent: number;
    amount: number;
  };
};

export type DraftItem = {
  id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  base_price: number;
  final_price: number;
  discount_type: "amount" | "percent" | null;
  discount_value: number | null;
  quantity: number;
  line_total: number;
};

export type DraftResponse = {
  draft: {
    id: string;
    seller_id: string;
    store_id: string;
    shift_id: string;
  };
  items: DraftItem[];
  summary: {
    subtotalAmount: number;
    discountAmount: number;
    totalAmount: number;
    itemsCount: number;
  };
};

export type InventoryHistoryResponse = {
  storeId: string;
  storeName: string;
  items: Array<{
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
};

export type SellerSale = {
  id: string;
  seller_id: string;
  store_id: string;
  shift_id: string;
  payment_method: "cash" | "card";
  status: "completed" | "deleted";
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  created_at: string;
  items: DraftItem[];
};

export type SellerSalesResponse = {
  storeId: string;
  storeName: string;
  sales: SellerSale[];
};

export type CheckoutResponse = {
  sale: Omit<SellerSale, "items">;
  items: DraftItem[];
  summary: DraftResponse["summary"];
};
