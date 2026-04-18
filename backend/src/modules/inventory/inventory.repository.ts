import { supabaseAdmin } from "../../lib/supabase.js";
import { HttpError } from "../../lib/http-error.js";

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

export async function listInventoryHistory(storeId: string, limit: number) {
  const { data, error } = await supabaseAdmin
    .from("inventory_movements")
    .select(
      `
      id,
      store_id,
      product_id,
      movement_type,
      quantity_delta,
      balance_after,
      reason,
      actor_user_id,
      sale_id,
      return_id,
      shift_id,
      created_at,
      product:products(id, name, sku),
      actor:users(id, full_name, role)
    `
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new HttpError(500, `Failed to load inventory history: ${error.message}`);
  }

  return (data ?? []) as unknown as InventoryHistoryRow[];
}
