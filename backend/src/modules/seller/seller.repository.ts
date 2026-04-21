import { HttpError } from "../../lib/http-error.js";
import { maybeOne, one, queryDb } from "../../lib/db.js";

export type SellerCatalogRow = {
  product_id: string;
  price: number;
  is_enabled: boolean;
  product: {
    id: string;
    name: string;
    sku: string;
    default_price: number;
    is_active: boolean;
  };
  stock_quantity: number;
};

export type DraftSaleRecord = {
  id: string;
  seller_id: string;
  store_id: string;
  shift_id: string;
  created_at: string;
  updated_at: string;
};

export type DraftSaleItemRecord = {
  id: string;
  draft_sale_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  base_price: number;
  final_price: number;
  discount_type: "amount" | "percent" | null;
  discount_value: number | null;
  quantity: number;
  line_total: number;
  created_at: string;
  updated_at: string;
};

export type SaleRecord = {
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
};

export type SaleItemRecord = {
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

export type ReturnedSaleItemAggregate = {
  sale_item_id: string;
  returned_quantity: number;
};

export type SaleWithItemsRecord = SaleRecord & {
  items: SaleItemRecord[];
};

type NumericKeys =
  | "price"
  | "stock_quantity"
  | "base_price"
  | "final_price"
  | "discount_value"
  | "quantity"
  | "line_total"
  | "subtotal_amount"
  | "discount_amount"
  | "total_amount";

function toNumber<T extends Record<string, unknown>>(row: T, keys: NumericKeys[]) {
  const clone = { ...row } as Record<string, unknown>;
  for (const key of keys) {
    if (clone[key] !== undefined && clone[key] !== null) {
      clone[key] = Number(clone[key]);
    }
  }
  return clone as T;
}

export async function getSellerCatalog(storeId: string) {
  try {
    const result = await queryDb<{
      product_id: string;
      price: number | string;
      is_enabled: boolean;
      product_id_join: string;
      product_name: string;
      product_sku: string;
      product_default_price: number | string;
      product_is_active: boolean;
      stock_quantity: number | string | null;
    }>(
      `select
         sp.product_id,
         sp.price,
         sp.is_enabled,
         p.id as product_id_join,
         p.name as product_name,
         p.sku as product_sku,
         p.default_price as product_default_price,
         p.is_active as product_is_active,
         coalesce(i.quantity, 0) as stock_quantity
       from public.store_products sp
       join public.products p on p.id = sp.product_id
       left join public.inventory i
         on i.store_id = sp.store_id
        and i.product_id = sp.product_id
       where sp.store_id = $1
         and sp.is_enabled = true
         and p.archived_at is null
       order by sp.product_id asc`,
      [storeId]
    );

    return result.rows.map((row) => ({
      product_id: row.product_id,
      price: Number(row.price),
      is_enabled: row.is_enabled,
      product: {
        id: row.product_id_join,
        name: row.product_name,
        sku: row.product_sku,
        default_price: Number(row.product_default_price),
        is_active: row.product_is_active,
      },
      stock_quantity: Number(row.stock_quantity ?? 0),
    }));
  } catch (error) {
    throw new HttpError(500, `Failed to load seller catalog: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function findDraftSaleForSeller(sellerId: string) {
  try {
    return await maybeOne<DraftSaleRecord>(
      `select id, seller_id, store_id, shift_id, created_at, updated_at
       from public.draft_sales
       where seller_id = $1
       order by updated_at desc
       limit 1`,
      [sellerId]
    );
  } catch (error) {
    throw new HttpError(500, `Failed to load draft sale: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function createDraftSale(input: { sellerId: string; storeId: string; shiftId: string }) {
  try {
    return await one<DraftSaleRecord>(
      `insert into public.draft_sales (seller_id, store_id, shift_id)
       values ($1, $2, $3)
       returning id, seller_id, store_id, shift_id, created_at, updated_at`,
      [input.sellerId, input.storeId, input.shiftId]
    );
  } catch (error) {
    throw new HttpError(500, `Failed to create draft sale: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listDraftSaleItems(draftSaleId: string) {
  try {
    const result = await queryDb<DraftSaleItemRecord>(
      `select id, draft_sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price,
              discount_type, discount_value, quantity, line_total, created_at, updated_at
       from public.draft_sale_items
       where draft_sale_id = $1
       order by created_at asc`,
      [draftSaleId]
    );

    return result.rows.map((row) =>
      toNumber(row, ["base_price", "final_price", "discount_value", "quantity", "line_total"])
    );
  } catch (error) {
    throw new HttpError(500, `Failed to list draft sale items: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function findDraftItemByProductId(draftSaleId: string, productId: string) {
  try {
    const row = await maybeOne<DraftSaleItemRecord>(
      `select id, draft_sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price,
              discount_type, discount_value, quantity, line_total, created_at, updated_at
       from public.draft_sale_items
       where draft_sale_id = $1
         and product_id = $2`,
      [draftSaleId, productId]
    );

    return row ? toNumber(row, ["base_price", "final_price", "discount_value", "quantity", "line_total"]) : null;
  } catch (error) {
    throw new HttpError(500, `Failed to load draft item: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function findDraftItemById(draftSaleId: string, itemId: string) {
  try {
    const row = await maybeOne<DraftSaleItemRecord>(
      `select id, draft_sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price,
              discount_type, discount_value, quantity, line_total, created_at, updated_at
       from public.draft_sale_items
       where draft_sale_id = $1
         and id = $2`,
      [draftSaleId, itemId]
    );

    return row ? toNumber(row, ["base_price", "final_price", "discount_value", "quantity", "line_total"]) : null;
  } catch (error) {
    throw new HttpError(500, `Failed to load draft item by id: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function insertDraftItem(input: Omit<DraftSaleItemRecord, "id" | "created_at" | "updated_at">) {
  try {
    const row = await one<DraftSaleItemRecord>(
      `insert into public.draft_sale_items (
         draft_sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price,
         discount_type, discount_value, quantity, line_total
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id, draft_sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price,
                 discount_type, discount_value, quantity, line_total, created_at, updated_at`,
      [
        input.draft_sale_id,
        input.product_id,
        input.product_name_snapshot,
        input.sku_snapshot,
        input.base_price,
        input.final_price,
        input.discount_type,
        input.discount_value,
        input.quantity,
        input.line_total,
      ]
    );

    return toNumber(row, ["base_price", "final_price", "discount_value", "quantity", "line_total"]);
  } catch (error) {
    throw new HttpError(500, `Failed to insert draft item: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function updateDraftItem(
  itemId: string,
  updates: Partial<Omit<DraftSaleItemRecord, "id" | "draft_sale_id" | "created_at" | "updated_at">>
) {
  try {
    const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      const row = await maybeOne<DraftSaleItemRecord>(
        `select id, draft_sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price,
                discount_type, discount_value, quantity, line_total, created_at, updated_at
         from public.draft_sale_items
         where id = $1`,
        [itemId]
      );
      if (!row) {
        throw new HttpError(404, "Draft item not found");
      }
      return toNumber(row, ["base_price", "final_price", "discount_value", "quantity", "line_total"]);
    }

    const columns = entries.map(([key], index) => `${key} = $${index + 2}`);
    const values = entries.map(([, value]) => value);
    const row = await one<DraftSaleItemRecord>(
      `update public.draft_sale_items
       set ${columns.join(", ")}
       where id = $1
       returning id, draft_sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price,
                 discount_type, discount_value, quantity, line_total, created_at, updated_at`,
      [itemId, ...values]
    );

    return toNumber(row, ["base_price", "final_price", "discount_value", "quantity", "line_total"]);
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to update draft item: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function deleteDraftItem(itemId: string) {
  try {
    await queryDb(`delete from public.draft_sale_items where id = $1`, [itemId]);
  } catch (error) {
    throw new HttpError(500, `Failed to delete draft item: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function deleteDraftSale(draftSaleId: string) {
  try {
    await queryDb(`delete from public.draft_sales where id = $1`, [draftSaleId]);
  } catch (error) {
    throw new HttpError(500, `Failed to delete draft sale: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function createSale(input: {
  sellerId: string;
  storeId: string;
  shiftId: string;
  paymentMethod: "cash" | "card";
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
}) {
  try {
    const row = await one<SaleRecord>(
      `insert into public.sales (
         seller_id, store_id, shift_id, payment_method, subtotal_amount, discount_amount, total_amount
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, seller_id, store_id, shift_id, payment_method, status, subtotal_amount, discount_amount, total_amount, created_at`,
      [
        input.sellerId,
        input.storeId,
        input.shiftId,
        input.paymentMethod,
        input.subtotalAmount,
        input.discountAmount,
        input.totalAmount,
      ]
    );

    return toNumber(row, ["subtotal_amount", "discount_amount", "total_amount"]);
  } catch (error) {
    throw new HttpError(500, `Failed to create sale: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function insertSaleItems(
  saleId: string,
  items: Array<{
    productId: string;
    productNameSnapshot: string;
    skuSnapshot: string;
    basePrice: number;
    finalPrice: number;
    discountType: "amount" | "percent" | null;
    discountValue: number | null;
    quantity: number;
    lineTotal: number;
  }>
) {
  if (items.length === 0) {
    return;
  }

  try {
    const values: unknown[] = [];
    const tuples = items.map((item, index) => {
      const offset = index * 10;
      values.push(
        saleId,
        item.productId,
        item.productNameSnapshot,
        item.skuSnapshot,
        item.basePrice,
        item.finalPrice,
        item.discountType,
        item.discountValue,
        item.quantity,
        item.lineTotal
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`;
    });

    await queryDb(
      `insert into public.sale_items (
         sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price,
         discount_type, discount_value, quantity, line_total
       )
       values ${tuples.join(", ")}`,
      values
    );
  } catch (error) {
    throw new HttpError(500, `Failed to insert sale items: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function findSaleById(saleId: string) {
  try {
    const row = await maybeOne<SaleRecord>(
      `select id, seller_id, store_id, shift_id, payment_method, status, subtotal_amount, discount_amount, total_amount, created_at
       from public.sales
       where id = $1`,
      [saleId]
    );

    return row ? toNumber(row, ["subtotal_amount", "discount_amount", "total_amount"]) : null;
  } catch (error) {
    throw new HttpError(500, `Failed to load sale: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listSaleItems(saleId: string) {
  try {
    const result = await queryDb<SaleItemRecord>(
      `select id, sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price,
              discount_type, discount_value, quantity, line_total
       from public.sale_items
       where sale_id = $1
       order by id asc`,
      [saleId]
    );

    return result.rows.map((row) => toNumber(row, ["base_price", "final_price", "discount_value", "quantity", "line_total"]));
  } catch (error) {
    throw new HttpError(500, `Failed to load sale items: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listReturnedQuantitiesBySaleItemIds(saleItemIds: string[]) {
  if (saleItemIds.length === 0) {
    return [] as ReturnedSaleItemAggregate[];
  }

  try {
    const result = await queryDb<{ sale_item_id: string | null; quantity: number | string }>(
      `select sale_item_id, quantity
       from public.return_items
       where sale_item_id = any($1::uuid[])`,
      [saleItemIds]
    );

    const totals = new Map<string, number>();

    for (const row of result.rows) {
      if (!row.sale_item_id) {
        continue;
      }
      totals.set(row.sale_item_id, Number(((totals.get(row.sale_item_id) ?? 0) + Number(row.quantity ?? 0)).toFixed(3)));
    }

    return Array.from(totals.entries()).map(([sale_item_id, returned_quantity]) => ({
      sale_item_id,
      returned_quantity,
    }));
  } catch (error) {
    throw new HttpError(500, `Failed to load existing return items: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listSalesByStore(storeId: string, limit: number) {
  try {
    const result = await queryDb<SaleRecord>(
      `select id, seller_id, store_id, shift_id, payment_method, status, subtotal_amount, discount_amount, total_amount, created_at
       from public.sales
       where store_id = $1
       order by created_at desc
       limit $2`,
      [storeId, limit]
    );

    return result.rows.map((row) => toNumber(row, ["subtotal_amount", "discount_amount", "total_amount"]));
  } catch (error) {
    throw new HttpError(500, `Failed to list sales: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function softDeleteSale(input: { saleId: string; deletedBy: string; reason: string }) {
  try {
    const row = await maybeOne<SaleRecord>(
      `update public.sales
       set status = 'deleted',
           deleted_at = now(),
           deleted_by = $2,
           deletion_reason = $3
       where id = $1
         and status = 'completed'
       returning id, seller_id, store_id, shift_id, payment_method, status, subtotal_amount, discount_amount, total_amount, created_at`,
      [input.saleId, input.deletedBy, input.reason]
    );

    if (!row) {
      throw new HttpError(409, "Sale is already deleted or unavailable");
    }

    return toNumber(row, ["subtotal_amount", "discount_amount", "total_amount"]);
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to delete sale: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function createReturn(input: {
  saleId: string;
  sellerId: string;
  storeId: string;
  shiftId: string;
  reason: string;
  totalAmount: number;
}) {
  try {
    const row = await one<{
      id: string;
      sale_id: string;
      seller_id: string;
      store_id: string;
      shift_id: string;
      reason: string;
      total_amount: number | string;
      created_at: string;
    }>(
      `insert into public.returns (sale_id, seller_id, store_id, shift_id, reason, total_amount)
       values ($1, $2, $3, $4, $5, $6)
       returning id, sale_id, seller_id, store_id, shift_id, reason, total_amount, created_at`,
      [input.saleId, input.sellerId, input.storeId, input.shiftId, input.reason, input.totalAmount]
    );
    return {
      ...row,
      total_amount: Number(row.total_amount),
    };
  } catch (error) {
    throw new HttpError(500, `Failed to create return: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function insertReturnItems(
  returnId: string,
  items: Array<{
    saleItemId: string;
    productId: string;
    productNameSnapshot: string;
    skuSnapshot: string;
    returnedPrice: number;
    quantity: number;
    lineTotal: number;
  }>
) {
  if (items.length === 0) {
    return;
  }

  try {
    const values: unknown[] = [];
    const tuples = items.map((item, index) => {
      const offset = index * 8;
      values.push(
        returnId,
        item.saleItemId,
        item.productId,
        item.productNameSnapshot,
        item.skuSnapshot,
        item.returnedPrice,
        item.quantity,
        item.lineTotal
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`;
    });

    await queryDb(
      `insert into public.return_items (
         return_id, sale_item_id, product_id, product_name_snapshot, sku_snapshot, returned_price, quantity, line_total
       )
       values ${tuples.join(", ")}`,
      values
    );
  } catch (error) {
    throw new HttpError(500, `Failed to insert return items: ${error instanceof Error ? error.message : String(error)}`);
  }
}
