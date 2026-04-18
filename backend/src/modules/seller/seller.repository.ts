import { supabaseAdmin } from "../../lib/supabase.js";
import { HttpError } from "../../lib/http-error.js";

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

export type SaleWithItemsRecord = SaleRecord & {
  items: SaleItemRecord[];
};

export async function getSellerCatalog(storeId: string) {
  const { data, error } = await supabaseAdmin
    .from("store_products")
    .select(
      `
      product_id,
      price,
      is_enabled,
      product:products!inner(id, name, sku, default_price, is_active)
    `
    )
    .eq("store_id", storeId)
    .eq("is_enabled", true)
    .order("product_id", { ascending: true });

  if (error) {
    throw new HttpError(500, `Failed to load seller catalog: ${error.message}`);
  }

  const { data: inventoryRows, error: inventoryError } = await supabaseAdmin
    .from("inventory")
    .select("product_id, quantity")
    .eq("store_id", storeId);

  if (inventoryError) {
    throw new HttpError(500, `Failed to load inventory snapshot: ${inventoryError.message}`);
  }

  const inventoryMap = new Map(
    (inventoryRows ?? []).map((row) => [row.product_id as string, Number(row.quantity ?? 0)])
  );

  type ProductJoinRow = {
    id: string;
    name: string;
    sku: string;
    default_price: number;
    is_active: boolean;
  };

  return ((data ?? []) as Array<{
    product_id: string;
    price: number;
    is_enabled: boolean;
    product: ProductJoinRow | ProductJoinRow[] | null;
  }>)
    .map((row) => {
      const product = Array.isArray(row.product) ? row.product[0] : row.product;

      if (!product) {
        return null;
      }

      return {
        product_id: row.product_id,
        price: Number(row.price),
        is_enabled: row.is_enabled,
        product,
        stock_quantity: inventoryMap.get(row.product_id) ?? 0,
      };
    })
    .filter((row): row is SellerCatalogRow => row !== null);
}

export async function findDraftSaleForSeller(sellerId: string) {
  const { data, error } = await supabaseAdmin
    .from("draft_sales")
    .select("id, seller_id, store_id, shift_id, created_at, updated_at")
    .eq("seller_id", sellerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<DraftSaleRecord>();

  if (error) {
    throw new HttpError(500, `Failed to load draft sale: ${error.message}`);
  }

  return data;
}

export async function createDraftSale(input: {
  sellerId: string;
  storeId: string;
  shiftId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("draft_sales")
    .insert({
      seller_id: input.sellerId,
      store_id: input.storeId,
      shift_id: input.shiftId,
    })
    .select("id, seller_id, store_id, shift_id, created_at, updated_at")
    .single<DraftSaleRecord>();

  if (error) {
    throw new HttpError(500, `Failed to create draft sale: ${error.message}`);
  }

  return data;
}

export async function listDraftSaleItems(draftSaleId: string) {
  const { data, error } = await supabaseAdmin
    .from("draft_sale_items")
    .select(
      "id, draft_sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price, discount_type, discount_value, quantity, line_total, created_at, updated_at"
    )
    .eq("draft_sale_id", draftSaleId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new HttpError(500, `Failed to list draft sale items: ${error.message}`);
  }

  return (data ?? []) as DraftSaleItemRecord[];
}

export async function findDraftItemByProductId(draftSaleId: string, productId: string) {
  const { data, error } = await supabaseAdmin
    .from("draft_sale_items")
    .select(
      "id, draft_sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price, discount_type, discount_value, quantity, line_total, created_at, updated_at"
    )
    .eq("draft_sale_id", draftSaleId)
    .eq("product_id", productId)
    .maybeSingle<DraftSaleItemRecord>();

  if (error) {
    throw new HttpError(500, `Failed to load draft item: ${error.message}`);
  }

  return data;
}

export async function findDraftItemById(draftSaleId: string, itemId: string) {
  const { data, error } = await supabaseAdmin
    .from("draft_sale_items")
    .select(
      "id, draft_sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price, discount_type, discount_value, quantity, line_total, created_at, updated_at"
    )
    .eq("draft_sale_id", draftSaleId)
    .eq("id", itemId)
    .maybeSingle<DraftSaleItemRecord>();

  if (error) {
    throw new HttpError(500, `Failed to load draft item by id: ${error.message}`);
  }

  return data;
}

export async function insertDraftItem(input: Omit<DraftSaleItemRecord, "id" | "created_at" | "updated_at">) {
  const { data, error } = await supabaseAdmin
    .from("draft_sale_items")
    .insert(input)
    .select(
      "id, draft_sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price, discount_type, discount_value, quantity, line_total, created_at, updated_at"
    )
    .single<DraftSaleItemRecord>();

  if (error) {
    throw new HttpError(500, `Failed to insert draft item: ${error.message}`);
  }

  return data;
}

export async function updateDraftItem(
  itemId: string,
  updates: Partial<Omit<DraftSaleItemRecord, "id" | "draft_sale_id" | "created_at" | "updated_at">>
) {
  const { data, error } = await supabaseAdmin
    .from("draft_sale_items")
    .update(updates)
    .eq("id", itemId)
    .select(
      "id, draft_sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price, discount_type, discount_value, quantity, line_total, created_at, updated_at"
    )
    .single<DraftSaleItemRecord>();

  if (error) {
    throw new HttpError(500, `Failed to update draft item: ${error.message}`);
  }

  return data;
}

export async function deleteDraftItem(itemId: string) {
  const { error } = await supabaseAdmin.from("draft_sale_items").delete().eq("id", itemId);

  if (error) {
    throw new HttpError(500, `Failed to delete draft item: ${error.message}`);
  }
}

export async function deleteDraftSale(draftSaleId: string) {
  const { error } = await supabaseAdmin.from("draft_sales").delete().eq("id", draftSaleId);

  if (error) {
    throw new HttpError(500, `Failed to delete draft sale: ${error.message}`);
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
  const { data, error } = await supabaseAdmin
    .from("sales")
    .insert({
      seller_id: input.sellerId,
      store_id: input.storeId,
      shift_id: input.shiftId,
      payment_method: input.paymentMethod,
      subtotal_amount: input.subtotalAmount,
      discount_amount: input.discountAmount,
      total_amount: input.totalAmount,
    })
    .select(
      "id, seller_id, store_id, shift_id, payment_method, status, subtotal_amount, discount_amount, total_amount, created_at"
    )
    .single<SaleRecord>();

  if (error) {
    throw new HttpError(500, `Failed to create sale: ${error.message}`);
  }

  return data;
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
  const { error } = await supabaseAdmin.from("sale_items").insert(
    items.map((item) => ({
      sale_id: saleId,
      product_id: item.productId,
      product_name_snapshot: item.productNameSnapshot,
      sku_snapshot: item.skuSnapshot,
      base_price: item.basePrice,
      final_price: item.finalPrice,
      discount_type: item.discountType,
      discount_value: item.discountValue,
      quantity: item.quantity,
      line_total: item.lineTotal,
    }))
  );

  if (error) {
    throw new HttpError(500, `Failed to insert sale items: ${error.message}`);
  }
}

export async function findSaleById(saleId: string) {
  const { data, error } = await supabaseAdmin
    .from("sales")
    .select(
      "id, seller_id, store_id, shift_id, payment_method, status, subtotal_amount, discount_amount, total_amount, created_at"
    )
    .eq("id", saleId)
    .maybeSingle<SaleRecord>();

  if (error) {
    throw new HttpError(500, `Failed to load sale: ${error.message}`);
  }

  return data;
}

export async function listSaleItems(saleId: string) {
  const { data, error } = await supabaseAdmin
    .from("sale_items")
    .select(
      "id, sale_id, product_id, product_name_snapshot, sku_snapshot, base_price, final_price, discount_type, discount_value, quantity, line_total"
    )
    .eq("sale_id", saleId)
    .order("id", { ascending: true });

  if (error) {
    throw new HttpError(500, `Failed to load sale items: ${error.message}`);
  }

  return (data ?? []) as SaleItemRecord[];
}

export async function listSalesByStore(storeId: string, limit: number) {
  const { data, error } = await supabaseAdmin
    .from("sales")
    .select(
      "id, seller_id, store_id, shift_id, payment_method, status, subtotal_amount, discount_amount, total_amount, created_at"
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new HttpError(500, `Failed to list sales: ${error.message}`);
  }

  return (data ?? []) as SaleRecord[];
}

export async function softDeleteSale(input: {
  saleId: string;
  deletedBy: string;
  reason: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("sales")
    .update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
      deleted_by: input.deletedBy,
      deletion_reason: input.reason,
    })
    .eq("id", input.saleId)
    .eq("status", "completed")
    .select(
      "id, seller_id, store_id, shift_id, payment_method, status, subtotal_amount, discount_amount, total_amount, created_at"
    )
    .maybeSingle<SaleRecord>();

  if (error) {
    throw new HttpError(500, `Failed to delete sale: ${error.message}`);
  }

  if (!data) {
    throw new HttpError(409, "Sale is already deleted or unavailable");
  }

  return data;
}

export async function createReturn(input: {
  saleId: string;
  sellerId: string;
  storeId: string;
  shiftId: string;
  reason: string;
  totalAmount: number;
}) {
  const { data, error } = await supabaseAdmin
    .from("returns")
    .insert({
      sale_id: input.saleId,
      seller_id: input.sellerId,
      store_id: input.storeId,
      shift_id: input.shiftId,
      reason: input.reason,
      total_amount: input.totalAmount,
    })
    .select("id, sale_id, seller_id, store_id, shift_id, reason, total_amount, created_at")
    .single<{
      id: string;
      sale_id: string;
      seller_id: string;
      store_id: string;
      shift_id: string;
      reason: string;
      total_amount: number;
      created_at: string;
    }>();

  if (error) {
    throw new HttpError(500, `Failed to create return: ${error.message}`);
  }

  return data;
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
  const { error } = await supabaseAdmin.from("return_items").insert(
    items.map((item) => ({
      return_id: returnId,
      sale_item_id: item.saleItemId,
      product_id: item.productId,
      product_name_snapshot: item.productNameSnapshot,
      sku_snapshot: item.skuSnapshot,
      returned_price: item.returnedPrice,
      quantity: item.quantity,
      line_total: item.lineTotal,
    }))
  );

  if (error) {
    throw new HttpError(500, `Failed to insert return items: ${error.message}`);
  }
}
