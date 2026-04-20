import { supabaseAdmin } from "../../lib/supabase.js";
import { HttpError } from "../../lib/http-error.js";

export type AdminSaleRow = {
  id: string;
  seller_id: string;
  store_id: string;
  payment_method: "cash" | "card";
  status: "completed" | "deleted";
  total_amount: number;
  subtotal_amount: number;
  discount_amount: number;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deletion_reason?: string | null;
};

export type AdminSaleItemRow = {
  id: string;
  sale_id: string;
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

export type AdminReturnRow = {
  id: string;
  sale_id: string;
  seller_id: string;
  store_id: string;
  shift_id: string;
  reason: string;
  total_amount: number;
  created_at: string;
};

export type AdminReturnItemRow = {
  id: string;
  return_id: string;
  sale_item_id: string | null;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  returned_price: number;
  quantity: number;
  line_total: number;
};

export type AdminShiftRow = {
  id: string;
  user_id: string;
  store_id: string;
  status: "active" | "paused" | "closed";
  started_at: string;
  paused_total_seconds: number;
};

export type AdminInventoryRow = {
  id: string;
  store_id: string;
  product_id: string;
  quantity: number;
};

export type AdminStoreRow = {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminUserRow = {
  id: string;
  telegram_id: number;
  full_name: string;
  role: "admin" | "seller";
  is_active: boolean;
};

export type AdminAssignmentRow = {
  id: string;
  user_id: string;
  store_id: string;
  assigned_by: string;
  started_at: string;
  is_current: boolean;
};

export type AdminProductRow = {
  id: string;
  name: string;
  sku: string;
  default_price: number;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminStoreProductRow = {
  id: string;
  store_id: string;
  product_id: string;
  price: number;
  is_enabled: boolean;
  updated_at: string;
};

export async function listAdminSales(limit: number) {
  const { data, error } = await supabaseAdmin
    .from("sales")
    .select(
      "id, seller_id, store_id, payment_method, status, subtotal_amount, discount_amount, total_amount, created_at, deleted_at, deleted_by, deletion_reason"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new HttpError(500, `Failed to load admin sales: ${error.message}`);
  }

  return (data ?? []) as AdminSaleRow[];
}

export async function listAdminSaleItems(saleIds: string[]) {
  if (saleIds.length === 0) {
    return [] as AdminSaleItemRow[];
  }

  const { data, error } = await supabaseAdmin
    .from("sale_items")
    .select(
      "id, sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price, discount_type, discount_value, quantity, line_total"
    )
    .in("sale_id", saleIds)
    .order("id", { ascending: true });

  if (error) {
    throw new HttpError(500, `Failed to load admin sale items: ${error.message}`);
  }

  return (data ?? []) as AdminSaleItemRow[];
}

export async function listAdminReturns(limit: number) {
  const { data, error } = await supabaseAdmin
    .from("returns")
    .select("id, sale_id, seller_id, store_id, shift_id, reason, total_amount, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new HttpError(500, `Failed to load admin returns: ${error.message}`);
  }

  return (data ?? []) as AdminReturnRow[];
}

export async function listAdminReturnItems(returnIds: string[]) {
  if (returnIds.length === 0) {
    return [] as AdminReturnItemRow[];
  }

  const { data, error } = await supabaseAdmin
    .from("return_items")
    .select(
      "id, return_id, sale_item_id, product_id, product_name_snapshot, sku_snapshot, returned_price, quantity, line_total"
    )
    .in("return_id", returnIds)
    .order("id", { ascending: true });

  if (error) {
    throw new HttpError(500, `Failed to load admin return items: ${error.message}`);
  }

  return (data ?? []) as AdminReturnItemRow[];
}

export async function listAdminStores() {
  const { data, error } = await supabaseAdmin
    .from("stores")
    .select("id, name, address, is_active, created_at, updated_at")
    .order("name", { ascending: true });

  if (error) {
    throw new HttpError(500, `Failed to load stores: ${error.message}`);
  }

  return (data ?? []) as AdminStoreRow[];
}

export async function listAdminUsers() {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, telegram_id, full_name, role, is_active")
    .order("full_name", { ascending: true });

  if (error) {
    throw new HttpError(500, `Failed to load users: ${error.message}`);
  }

  return (data ?? []) as AdminUserRow[];
}

export async function createAdminUser(input: {
  telegram_id: number;
  full_name: string;
  role: "admin" | "seller";
  is_active: boolean;
}) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .insert(input)
    .select("id, telegram_id, full_name, role, is_active")
    .single<AdminUserRow>();

  if (error) {
    throw new HttpError(500, `Failed to create user: ${error.message}`);
  }

  return data;
}

export async function listCurrentAssignments() {
  const { data, error } = await supabaseAdmin
    .from("user_store_assignments")
    .select("id, user_id, store_id, assigned_by, started_at, is_current")
    .eq("is_current", true);

  if (error) {
    throw new HttpError(500, `Failed to load assignments: ${error.message}`);
  }

  return (data ?? []) as AdminAssignmentRow[];
}

export async function listOpenShifts() {
  const { data, error } = await supabaseAdmin
    .from("shifts")
    .select("id, user_id, store_id, status, started_at, paused_total_seconds")
    .is("ended_at", null)
    .order("started_at", { ascending: false });

  if (error) {
    throw new HttpError(500, `Failed to load open shifts: ${error.message}`);
  }

  return (data ?? []) as AdminShiftRow[];
}

export async function listInventoryRows() {
  const { data, error } = await supabaseAdmin
    .from("inventory")
    .select("id, store_id, product_id, quantity");

  if (error) {
    throw new HttpError(500, `Failed to load inventory rows: ${error.message}`);
  }

  return (data ?? []) as AdminInventoryRow[];
}

export async function listProducts(options?: { archived?: boolean }) {
  let query = supabaseAdmin
    .from("products")
    .select("id, name, sku, default_price, is_active, archived_at, created_at, updated_at")
    .order("name", { ascending: true });

  query = options?.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

  const { data, error } = await query;

  if (error) {
    throw new HttpError(500, `Failed to load products: ${error.message}`);
  }

  return (data ?? []) as AdminProductRow[];
}

export async function findAdminProductById(productId: string) {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, sku, default_price, is_active, archived_at, created_at, updated_at")
    .eq("id", productId)
    .maybeSingle<AdminProductRow>();

  if (error) {
    throw new HttpError(500, `Failed to load product: ${error.message}`);
  }

  return data;
}

export async function createAdminProduct(input: {
  name: string;
  sku: string;
  default_price: number;
  is_active: boolean;
}) {
  const { data, error } = await supabaseAdmin
    .from("products")
    .insert(input)
    .select("id, name, sku, default_price, is_active, archived_at, created_at, updated_at")
    .single<AdminProductRow>();

  if (error) {
    throw new HttpError(500, `Failed to create product: ${error.message}`);
  }

  return data;
}

export async function updateAdminProduct(
  productId: string,
  updates: Partial<Pick<AdminProductRow, "name" | "sku" | "default_price" | "is_active" | "archived_at">>
) {
  const { data, error } = await supabaseAdmin
    .from("products")
    .update(updates)
    .eq("id", productId)
    .select("id, name, sku, default_price, is_active, archived_at, created_at, updated_at")
    .maybeSingle<AdminProductRow>();

  if (error) {
    throw new HttpError(500, `Failed to update product: ${error.message}`);
  }

  return data;
}

export async function getProductReferenceCounts(productId: string) {
  const [saleItems, returnItems, inventoryMovements] = await Promise.all([
    supabaseAdmin
      .from("sale_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
    supabaseAdmin
      .from("return_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
    supabaseAdmin
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
  ]);

  if (saleItems.error) {
    throw new HttpError(500, `Failed to check product sales: ${saleItems.error.message}`);
  }

  if (returnItems.error) {
    throw new HttpError(500, `Failed to check product returns: ${returnItems.error.message}`);
  }

  if (inventoryMovements.error) {
    throw new HttpError(500, `Failed to check product inventory history: ${inventoryMovements.error.message}`);
  }

  return {
    saleItems: saleItems.count ?? 0,
    returnItems: returnItems.count ?? 0,
    inventoryMovements: inventoryMovements.count ?? 0,
  };
}

export async function deleteAdminProduct(productId: string) {
  const { error: movementError } = await supabaseAdmin
    .from("inventory_movements")
    .delete()
    .eq("product_id", productId);

  if (movementError) {
    throw new HttpError(500, `Failed to delete product inventory history: ${movementError.message}`);
  }

  const { error: inventoryError } = await supabaseAdmin
    .from("inventory")
    .delete()
    .eq("product_id", productId);

  if (inventoryError) {
    throw new HttpError(500, `Failed to delete product inventory: ${inventoryError.message}`);
  }

  const { error: storeProductsError } = await supabaseAdmin
    .from("store_products")
    .delete()
    .eq("product_id", productId);

  if (storeProductsError) {
    throw new HttpError(500, `Failed to delete store products: ${storeProductsError.message}`);
  }

  const { error: productError } = await supabaseAdmin
    .from("products")
    .delete()
    .eq("id", productId);

  if (productError) {
    throw new HttpError(500, `Failed to delete product: ${productError.message}`);
  }
}

export async function archiveAdminProduct(productId: string) {
  const { data, error } = await supabaseAdmin
    .from("products")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", productId)
    .select("id, name, sku, default_price, is_active, archived_at, created_at, updated_at")
    .maybeSingle<AdminProductRow>();

  if (error) {
    throw new HttpError(500, `Failed to archive product: ${error.message}`);
  }

  return data;
}

export async function restoreAdminProduct(productId: string) {
  const { data, error } = await supabaseAdmin
    .from("products")
    .update({ archived_at: null })
    .eq("id", productId)
    .select("id, name, sku, default_price, is_active, archived_at, created_at, updated_at")
    .maybeSingle<AdminProductRow>();

  if (error) {
    throw new HttpError(500, `Failed to restore product: ${error.message}`);
  }

  return data;
}

export async function createStoreProductsForProduct(input: {
  productId: string;
  price: number;
  storeIds: string[];
}) {
  if (input.storeIds.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.from("store_products").upsert(
    input.storeIds.map((storeId) => ({
      store_id: storeId,
      product_id: input.productId,
      price: input.price,
      is_enabled: true,
    })),
    { onConflict: "store_id,product_id" }
  );

  if (error) {
    throw new HttpError(500, `Failed to propagate product to stores: ${error.message}`);
  }
}

export async function createInventoryRowsForProduct(input: {
  productId: string;
  storeIds: string[];
}) {
  if (input.storeIds.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.from("inventory").upsert(
    input.storeIds.map((storeId) => ({
      store_id: storeId,
      product_id: input.productId,
      quantity: 0,
    })),
    { onConflict: "store_id,product_id" }
  );

  if (error) {
    throw new HttpError(500, `Failed to create product inventory rows: ${error.message}`);
  }
}

export async function listAdminStoreProducts(storeId?: string) {
  let query = supabaseAdmin
    .from("store_products")
    .select("id, store_id, product_id, price, is_enabled, updated_at")
    .order("updated_at", { ascending: false });

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new HttpError(500, `Failed to load store products: ${error.message}`);
  }

  return (data ?? []) as AdminStoreProductRow[];
}

export async function findAdminStoreProductById(storeProductId: string) {
  const { data, error } = await supabaseAdmin
    .from("store_products")
    .select("id, store_id, product_id, price, is_enabled, updated_at")
    .eq("id", storeProductId)
    .maybeSingle<AdminStoreProductRow>();

  if (error) {
    throw new HttpError(500, `Failed to load store product: ${error.message}`);
  }

  return data;
}

export async function updateAdminStoreProduct(
  storeProductId: string,
  updates: Partial<Pick<AdminStoreProductRow, "price" | "is_enabled">>
) {
  const { data, error } = await supabaseAdmin
    .from("store_products")
    .update(updates)
    .eq("id", storeProductId)
    .select("id, store_id, product_id, price, is_enabled, updated_at")
    .maybeSingle<AdminStoreProductRow>();

  if (error) {
    throw new HttpError(500, `Failed to update store product: ${error.message}`);
  }

  return data;
}

export async function findAdminStoreById(storeId: string) {
  const { data, error } = await supabaseAdmin
    .from("stores")
    .select("id, name, address, is_active, created_at, updated_at")
    .eq("id", storeId)
    .maybeSingle<AdminStoreRow>();

  if (error) {
    throw new HttpError(500, `Failed to load store: ${error.message}`);
  }

  return data;
}

export async function createAdminStore(input: {
  name: string;
  address: string | null;
  is_active: boolean;
}) {
  const { data, error } = await supabaseAdmin
    .from("stores")
    .insert(input)
    .select("id, name, address, is_active, created_at, updated_at")
    .single<AdminStoreRow>();

  if (error) {
    throw new HttpError(500, `Failed to create store: ${error.message}`);
  }

  return data;
}

export async function updateAdminStore(
  storeId: string,
  updates: Partial<Pick<AdminStoreRow, "name" | "address" | "is_active">>
) {
  const { data, error } = await supabaseAdmin
    .from("stores")
    .update(updates)
    .eq("id", storeId)
    .select("id, name, address, is_active, created_at, updated_at")
    .maybeSingle<AdminStoreRow>();

  if (error) {
    throw new HttpError(500, `Failed to update store: ${error.message}`);
  }

  return data;
}

export async function closeCurrentAssignment(userId: string) {
  const { error } = await supabaseAdmin
    .from("user_store_assignments")
    .update({
      is_current: false,
      ended_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("is_current", true);

  if (error) {
    throw new HttpError(500, `Failed to close current assignment: ${error.message}`);
  }
}

export async function createUserStoreAssignment(input: {
  userId: string;
  storeId: string;
  assignedBy: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("user_store_assignments")
    .insert({
      user_id: input.userId,
      store_id: input.storeId,
      assigned_by: input.assignedBy,
      is_current: true,
    })
    .select("id, user_id, store_id, assigned_by, started_at, is_current")
    .single<AdminAssignmentRow>();

  if (error) {
    throw new HttpError(500, `Failed to create assignment: ${error.message}`);
  }

  return data;
}
