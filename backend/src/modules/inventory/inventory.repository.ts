import { HttpError } from "../../lib/http-error.js";
import { queryDb } from "../../lib/db.js";

export type InventoryHistoryRow = {
  id: string;
  store_id: string;
  product_id: string;
  movement_type:
    | "sale"
    | "return"
    | "manual_adjustment"
    | "restock"
    | "writeoff"
    | "transfer_in"
    | "transfer_out"
    | "sale_deletion";
  quantity_delta: number;
  balance_after: number;
  reason: string | null;
  actor_user_id: string;
  sale_id: string | null;
  return_id: string | null;
  shift_id: string | null;
  created_at: string;
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
};

type InventoryHistoryDbRow = Omit<InventoryHistoryRow, "product" | "actor" | "quantity_delta" | "balance_after"> & {
  quantity_delta: number | string;
  balance_after: number | string;
  product_join_id: string | null;
  product_join_name: string | null;
  product_join_sku: string | null;
  actor_join_id: string | null;
  actor_join_full_name: string | null;
  actor_join_role: "admin" | "seller" | null;
};

export async function listInventoryHistory(storeId: string, limit: number) {
  try {
    const result = await queryDb<InventoryHistoryDbRow>(
      `select
         im.id,
         im.store_id,
         im.product_id,
         im.movement_type,
         im.quantity_delta,
         im.balance_after,
         im.reason,
         im.actor_user_id,
         im.sale_id,
         im.return_id,
         im.shift_id,
         im.created_at,
         p.id as product_join_id,
         p.name as product_join_name,
         p.sku as product_join_sku,
         u.id as actor_join_id,
         u.full_name as actor_join_full_name,
         u.role as actor_join_role
       from public.inventory_movements im
       left join public.products p on p.id = im.product_id
       left join public.users u on u.id = im.actor_user_id
       where im.store_id = $1
       order by im.created_at desc
       limit $2`,
      [storeId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      store_id: row.store_id,
      product_id: row.product_id,
      movement_type: row.movement_type,
      quantity_delta: Number(row.quantity_delta),
      balance_after: Number(row.balance_after),
      reason: row.reason,
      actor_user_id: row.actor_user_id,
      sale_id: row.sale_id,
      return_id: row.return_id,
      shift_id: row.shift_id,
      created_at: row.created_at,
      product: row.product_join_id
        ? {
            id: row.product_join_id,
            name: row.product_join_name ?? "",
            sku: row.product_join_sku ?? "",
          }
        : null,
      actor: row.actor_join_id
        ? {
            id: row.actor_join_id,
            full_name: row.actor_join_full_name ?? "",
            role: row.actor_join_role ?? "seller",
          }
        : null,
    }));
  } catch (error) {
    throw new HttpError(500, `Failed to load inventory history: ${error instanceof Error ? error.message : String(error)}`);
  }
}

