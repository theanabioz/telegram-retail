import { HttpError } from "../../lib/http-error.js";
import { maybeOne, one, queryDb } from "../../lib/db.js";

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

type NumericRow = Record<string, unknown>;

function mapNumbers<T extends NumericRow>(row: T, keys: string[]) {
  const clone = { ...row } as Record<string, unknown>;
  for (const key of keys) {
    if (clone[key] !== undefined && clone[key] !== null) {
      clone[key] = Number(clone[key]);
    }
  }
  return clone as T;
}

function isPostgresError(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === code;
}

function mapTimestamps<T extends NumericRow>(row: T, keys: string[]) {
  const clone = { ...row } as Record<string, unknown>;
  for (const key of keys) {
    const value = clone[key];
    if (value instanceof Date) {
      clone[key] = value.toISOString();
    }
  }
  return clone as T;
}

export async function listAdminSales(limit: number) {
  try {
    const result = await queryDb<AdminSaleRow>(
      `select id, seller_id, store_id, payment_method, status, subtotal_amount, discount_amount, total_amount,
              created_at, deleted_at, deleted_by, deletion_reason
       from public.sales
       order by created_at desc
       limit $1`,
      [limit]
    );

    return result.rows.map((row) =>
      mapTimestamps(mapNumbers(row, ["subtotal_amount", "discount_amount", "total_amount"]), [
        "created_at",
        "deleted_at",
      ])
    );
  } catch (error) {
    throw new HttpError(500, `Failed to load admin sales: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listAdminSaleItems(saleIds: string[]) {
  if (saleIds.length === 0) {
    return [] as AdminSaleItemRow[];
  }

  try {
    const result = await queryDb<AdminSaleItemRow>(
      `select id, sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price,
              discount_type, discount_value, quantity, line_total
       from public.sale_items
       where sale_id = any($1::uuid[])
       order by id asc`,
      [saleIds]
    );

    return result.rows.map((row) => mapNumbers(row, ["base_price", "final_price", "discount_value", "quantity", "line_total"]));
  } catch (error) {
    throw new HttpError(500, `Failed to load admin sale items: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listAdminReturns(limit: number) {
  try {
    const result = await queryDb<AdminReturnRow>(
      `select id, sale_id, seller_id, store_id, shift_id, reason, total_amount, created_at
       from public.returns
       order by created_at desc
       limit $1`,
      [limit]
    );

    return result.rows.map((row) => mapTimestamps(mapNumbers(row, ["total_amount"]), ["created_at"]));
  } catch (error) {
    throw new HttpError(500, `Failed to load admin returns: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listAdminReturnItems(returnIds: string[]) {
  if (returnIds.length === 0) {
    return [] as AdminReturnItemRow[];
  }

  try {
    const result = await queryDb<AdminReturnItemRow>(
      `select id, return_id, sale_item_id, product_id, product_name_snapshot, sku_snapshot, returned_price, quantity, line_total
       from public.return_items
       where return_id = any($1::uuid[])
       order by id asc`,
      [returnIds]
    );

    return result.rows.map((row) => mapNumbers(row, ["returned_price", "quantity", "line_total"]));
  } catch (error) {
    throw new HttpError(500, `Failed to load admin return items: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listAdminStores() {
  try {
    const result = await queryDb<AdminStoreRow>(
      `select id, name, address, is_active, created_at, updated_at
       from public.stores
       order by name asc`
    );
    return result.rows.map((row) => mapTimestamps(row, ["created_at", "updated_at"]));
  } catch (error) {
    throw new HttpError(500, `Failed to load stores: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listAdminUsers() {
  try {
    const result = await queryDb<AdminUserRow>(
      `select id, telegram_id, full_name, role, is_active
       from public.users
       order by full_name asc`
    );
    return result.rows.map((row) => mapTimestamps(row, ["started_at"]));
  } catch (error) {
    throw new HttpError(500, `Failed to load users: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function createAdminUser(input: {
  telegram_id: number;
  full_name: string;
  role: "admin" | "seller";
  is_active: boolean;
}) {
  try {
    return await one<AdminUserRow>(
      `insert into public.users (telegram_id, full_name, role, is_active)
       values ($1, $2, $3, $4)
       returning id, telegram_id, full_name, role, is_active`,
      [input.telegram_id, input.full_name, input.role, input.is_active]
    );
  } catch (error) {
    if (isPostgresError(error, "23505")) {
      throw new HttpError(409, "User with this Telegram ID already exists");
    }

    throw new HttpError(500, `Failed to create user: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listCurrentAssignments() {
  try {
    const result = await queryDb<AdminAssignmentRow>(
      `select id, user_id, store_id, assigned_by, started_at, is_current
       from public.user_store_assignments
       where is_current = true`
    );
    return result.rows;
  } catch (error) {
    throw new HttpError(500, `Failed to load assignments: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listOpenShifts() {
  try {
    const result = await queryDb<AdminShiftRow>(
      `select id, user_id, store_id, status, started_at, paused_total_seconds
       from public.shifts
       where ended_at is null
       order by started_at desc`
    );

    return result.rows.map((row) =>
      mapTimestamps(mapNumbers(row, ["paused_total_seconds"]), ["started_at"])
    );
  } catch (error) {
    throw new HttpError(500, `Failed to load open shifts: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listInventoryRows() {
  try {
    const result = await queryDb<AdminInventoryRow>(
      `select id, store_id, product_id, quantity
       from public.inventory`
    );

    return result.rows.map((row) => mapNumbers(row, ["quantity"]));
  } catch (error) {
    throw new HttpError(500, `Failed to load inventory rows: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listProducts(options?: { archived?: boolean }) {
  try {
    const result = await queryDb<AdminProductRow>(
      `select id, name, sku, default_price, is_active, archived_at, created_at, updated_at
       from public.products
       where ${options?.archived ? "archived_at is not null" : "archived_at is null"}
       order by name asc`
    );

    return result.rows.map((row) =>
      mapTimestamps(mapNumbers(row, ["default_price"]), ["archived_at", "created_at", "updated_at"])
    );
  } catch (error) {
    throw new HttpError(500, `Failed to load products: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function findAdminProductById(productId: string) {
  try {
    const row = await maybeOne<AdminProductRow>(
      `select id, name, sku, default_price, is_active, archived_at, created_at, updated_at
       from public.products
       where id = $1`,
      [productId]
    );

    return row
      ? mapTimestamps(mapNumbers(row, ["default_price"]), ["archived_at", "created_at", "updated_at"])
      : null;
  } catch (error) {
    throw new HttpError(500, `Failed to load product: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function createAdminProduct(input: {
  name: string;
  sku: string;
  default_price: number;
  is_active: boolean;
}) {
  try {
    const row = await one<AdminProductRow>(
      `insert into public.products (name, sku, default_price, is_active)
       values ($1, $2, $3, $4)
       returning id, name, sku, default_price, is_active, archived_at, created_at, updated_at`,
      [input.name, input.sku, input.default_price, input.is_active]
    );

    return mapTimestamps(mapNumbers(row, ["default_price"]), ["archived_at", "created_at", "updated_at"]);
  } catch (error) {
    throw new HttpError(500, `Failed to create product: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function updateAdminProduct(
  productId: string,
  updates: Partial<Pick<AdminProductRow, "name" | "sku" | "default_price" | "is_active" | "archived_at">>
) {
  try {
    const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return await findAdminProductById(productId);
    }

    const columns = entries.map(([key], index) => `${key} = $${index + 2}`);
    const values = entries.map(([, value]) => value);
    const row = await maybeOne<AdminProductRow>(
      `update public.products
       set ${columns.join(", ")}
       where id = $1
       returning id, name, sku, default_price, is_active, archived_at, created_at, updated_at`,
      [productId, ...values]
    );

    return row
      ? mapTimestamps(mapNumbers(row, ["default_price"]), ["archived_at", "created_at", "updated_at"])
      : null;
  } catch (error) {
    throw new HttpError(500, `Failed to update product: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getProductReferenceCounts(productId: string) {
  try {
    const [saleItems, returnItems, inventoryMovements] = await Promise.all([
      maybeOne<{ count: string }>(`select count(*)::text as count from public.sale_items where product_id = $1`, [productId]),
      maybeOne<{ count: string }>(`select count(*)::text as count from public.return_items where product_id = $1`, [productId]),
      maybeOne<{ count: string }>(`select count(*)::text as count from public.inventory_movements where product_id = $1`, [productId]),
    ]);

    return {
      saleItems: Number(saleItems?.count ?? 0),
      returnItems: Number(returnItems?.count ?? 0),
      inventoryMovements: Number(inventoryMovements?.count ?? 0),
    };
  } catch (error) {
    throw new HttpError(500, `Failed to check product references: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function deleteAdminProduct(productId: string) {
  try {
    await queryDb(`delete from public.inventory_movements where product_id = $1`, [productId]);
    await queryDb(`delete from public.inventory where product_id = $1`, [productId]);
    await queryDb(`delete from public.store_products where product_id = $1`, [productId]);
    await queryDb(`delete from public.products where id = $1`, [productId]);
  } catch (error) {
    throw new HttpError(500, `Failed to delete product: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function archiveAdminProduct(productId: string) {
  try {
    const row = await maybeOne<AdminProductRow>(
      `update public.products
       set archived_at = now()
       where id = $1
       returning id, name, sku, default_price, is_active, archived_at, created_at, updated_at`,
      [productId]
    );
    return row
      ? mapTimestamps(mapNumbers(row, ["default_price"]), ["archived_at", "created_at", "updated_at"])
      : null;
  } catch (error) {
    throw new HttpError(500, `Failed to archive product: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function restoreAdminProduct(productId: string) {
  try {
    const row = await maybeOne<AdminProductRow>(
      `update public.products
       set archived_at = null
       where id = $1
       returning id, name, sku, default_price, is_active, archived_at, created_at, updated_at`,
      [productId]
    );
    return row
      ? mapTimestamps(mapNumbers(row, ["default_price"]), ["archived_at", "created_at", "updated_at"])
      : null;
  } catch (error) {
    throw new HttpError(500, `Failed to restore product: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function createStoreProductsForProduct(input: { productId: string; price: number; storeIds: string[] }) {
  if (input.storeIds.length === 0) {
    return;
  }

  try {
    const values: unknown[] = [];
    const tuples = input.storeIds.map((storeId, index) => {
      const offset = index * 4;
      values.push(storeId, input.productId, input.price, true);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
    });

    await queryDb(
      `insert into public.store_products (store_id, product_id, price, is_enabled)
       values ${tuples.join(", ")}
       on conflict (store_id, product_id)
       do update set price = excluded.price, is_enabled = excluded.is_enabled`,
      values
    );
  } catch (error) {
    throw new HttpError(500, `Failed to propagate product to stores: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function createInventoryRowsForProduct(input: { productId: string; storeIds: string[] }) {
  if (input.storeIds.length === 0) {
    return;
  }

  try {
    const values: unknown[] = [];
    const tuples = input.storeIds.map((storeId, index) => {
      const offset = index * 3;
      values.push(storeId, input.productId, 0);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
    });

    await queryDb(
      `insert into public.inventory (store_id, product_id, quantity)
       values ${tuples.join(", ")}
       on conflict (store_id, product_id)
       do update set quantity = public.inventory.quantity`,
      values
    );
  } catch (error) {
    throw new HttpError(500, `Failed to create product inventory rows: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listAdminStoreProducts(storeId?: string) {
  try {
    const result = await queryDb<AdminStoreProductRow>(
      `select id, store_id, product_id, price, is_enabled, updated_at
       from public.store_products
       ${storeId ? "where store_id = $1" : ""}
       order by updated_at desc`,
      storeId ? [storeId] : []
    );

    return result.rows.map((row) => mapTimestamps(mapNumbers(row, ["price"]), ["updated_at"]));
  } catch (error) {
    throw new HttpError(500, `Failed to load store products: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function findAdminStoreProductById(storeProductId: string) {
  try {
    const row = await maybeOne<AdminStoreProductRow>(
      `select id, store_id, product_id, price, is_enabled, updated_at
       from public.store_products
       where id = $1`,
      [storeProductId]
    );
    return row ? mapTimestamps(mapNumbers(row, ["price"]), ["updated_at"]) : null;
  } catch (error) {
    throw new HttpError(500, `Failed to load store product: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function updateAdminStoreProduct(
  storeProductId: string,
  updates: Partial<Pick<AdminStoreProductRow, "price" | "is_enabled">>
) {
  try {
    const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return await findAdminStoreProductById(storeProductId);
    }

    const columns = entries.map(([key], index) => `${key} = $${index + 2}`);
    const values = entries.map(([, value]) => value);
    const row = await maybeOne<AdminStoreProductRow>(
      `update public.store_products
       set ${columns.join(", ")}
       where id = $1
       returning id, store_id, product_id, price, is_enabled, updated_at`,
      [storeProductId, ...values]
    );

    return row ? mapTimestamps(mapNumbers(row, ["price"]), ["updated_at"]) : null;
  } catch (error) {
    throw new HttpError(500, `Failed to update store product: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function findAdminStoreById(storeId: string) {
  try {
    const row = await maybeOne<AdminStoreRow>(
      `select id, name, address, is_active, created_at, updated_at
       from public.stores
       where id = $1`,
      [storeId]
    );
    return row ? mapTimestamps(row, ["created_at", "updated_at"]) : null;
  } catch (error) {
    throw new HttpError(500, `Failed to load store: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function createAdminStore(input: { name: string; address: string | null; is_active: boolean }) {
  try {
    const row = await one<AdminStoreRow>(
      `insert into public.stores (name, address, is_active)
       values ($1, $2, $3)
       returning id, name, address, is_active, created_at, updated_at`,
      [input.name, input.address, input.is_active]
    );
    return mapTimestamps(row, ["created_at", "updated_at"]);
  } catch (error) {
    throw new HttpError(500, `Failed to create store: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function updateAdminStore(
  storeId: string,
  updates: Partial<Pick<AdminStoreRow, "name" | "address" | "is_active">>
) {
  try {
    const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return await findAdminStoreById(storeId);
    }

    const columns = entries.map(([key], index) => `${key} = $${index + 2}`);
    const values = entries.map(([, value]) => value);
    const row = await maybeOne<AdminStoreRow>(
      `update public.stores
       set ${columns.join(", ")}
       where id = $1
       returning id, name, address, is_active, created_at, updated_at`,
      [storeId, ...values]
    );
    return row ? mapTimestamps(row, ["created_at", "updated_at"]) : null;
  } catch (error) {
    throw new HttpError(500, `Failed to update store: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function closeCurrentAssignment(userId: string) {
  try {
    await queryDb(
      `update public.user_store_assignments
       set is_current = false,
           ended_at = now()
       where user_id = $1
         and is_current = true`,
      [userId]
    );
  } catch (error) {
    throw new HttpError(500, `Failed to close current assignment: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function createUserStoreAssignment(input: { userId: string; storeId: string; assignedBy: string }) {
  try {
    const row = await one<AdminAssignmentRow>(
      `insert into public.user_store_assignments (user_id, store_id, assigned_by, is_current)
       values ($1, $2, $3, true)
       returning id, user_id, store_id, assigned_by, started_at, is_current`,
      [input.userId, input.storeId, input.assignedBy]
    );
    return mapTimestamps(row, ["started_at"]);
  } catch (error) {
    throw new HttpError(500, `Failed to create assignment: ${error instanceof Error ? error.message : String(error)}`);
  }
}
