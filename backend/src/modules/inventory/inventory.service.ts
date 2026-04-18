import { supabaseAdmin } from "../../lib/supabase.js";
import { HttpError } from "../../lib/http-error.js";
import { findCurrentAssignment } from "../users/users.repository.js";
import { findOpenShiftByUserId } from "../shifts/shifts.repository.js";
import { listInventoryHistory } from "./inventory.repository.js";

type ApplyInventoryMovementInput = {
  storeId: string;
  productId: string;
  actorUserId: string;
  movementType:
    | "sale"
    | "return"
    | "manual_adjustment"
    | "restock"
    | "writeoff"
    | "transfer_in"
    | "transfer_out"
    | "sale_deletion";
  quantityDelta: number;
  reason?: string | null;
  saleId?: string | null;
  returnId?: string | null;
  shiftId?: string | null;
};

export async function applyInventoryMovement(input: ApplyInventoryMovementInput) {
  const { data: current, error: inventoryError } = await supabaseAdmin
    .from("inventory")
    .select("id, quantity")
    .eq("store_id", input.storeId)
    .eq("product_id", input.productId)
    .maybeSingle<{ id: string; quantity: number }>();

  if (inventoryError) {
    throw new HttpError(500, `Failed to read inventory: ${inventoryError.message}`);
  }

  const currentQuantity = current?.quantity ?? 0;
  const balanceAfter = currentQuantity + input.quantityDelta;

  if (balanceAfter < 0) {
    throw new HttpError(409, "Inventory cannot go below zero");
  }

  if (current) {
    const { error } = await supabaseAdmin
      .from("inventory")
      .update({ quantity: balanceAfter, updated_at: new Date().toISOString() })
      .eq("id", current.id);

    if (error) {
      throw new HttpError(500, `Failed to update inventory: ${error.message}`);
    }
  } else {
    const { error } = await supabaseAdmin.from("inventory").insert({
      store_id: input.storeId,
      product_id: input.productId,
      quantity: balanceAfter,
    });

    if (error) {
      throw new HttpError(500, `Failed to create inventory record: ${error.message}`);
    }
  }

  const { data: movement, error: movementError } = await supabaseAdmin
    .from("inventory_movements")
    .insert({
      store_id: input.storeId,
      product_id: input.productId,
      actor_user_id: input.actorUserId,
      movement_type: input.movementType,
      quantity_delta: input.quantityDelta,
      balance_after: balanceAfter,
      reason: input.reason ?? null,
      sale_id: input.saleId ?? null,
      return_id: input.returnId ?? null,
      shift_id: input.shiftId ?? null,
    })
    .select("id, balance_after")
    .single<{ id: string; balance_after: number }>();

  if (movementError) {
    throw new HttpError(500, `Failed to log inventory movement: ${movementError.message}`);
  }

  return movement;
}

async function getInventoryActorContext(userId: string) {
  const assignment = await findCurrentAssignment(userId);
  if (!assignment) {
    throw new HttpError(403, "Seller has no active store assignment");
  }

  const shift = await findOpenShiftByUserId(userId);
  if (!shift || shift.status === "closed") {
    throw new HttpError(409, "Active shift is required for inventory operations");
  }

  if (shift.store_id !== assignment.store_id) {
    throw new HttpError(409, "Open shift store does not match current assignment");
  }

  if (shift.status === "paused") {
    throw new HttpError(409, "Resume the shift before editing inventory");
  }

  return {
    assignment,
    shift,
  };
}

export async function runManualInventoryAdjustment(input: {
  userId: string;
  productId: string;
  quantity: number;
  reason: string;
}) {
  const { assignment, shift } = await getInventoryActorContext(input.userId);

  return applyInventoryMovement({
    storeId: assignment.store_id,
    productId: input.productId,
    actorUserId: input.userId,
    movementType: "manual_adjustment",
    quantityDelta: input.quantity,
    shiftId: shift.id,
    reason: input.reason,
  });
}

export async function runRestock(input: {
  userId: string;
  productId: string;
  quantity: number;
  reason: string;
}) {
  const { assignment, shift } = await getInventoryActorContext(input.userId);

  return applyInventoryMovement({
    storeId: assignment.store_id,
    productId: input.productId,
    actorUserId: input.userId,
    movementType: "restock",
    quantityDelta: input.quantity,
    shiftId: shift.id,
    reason: input.reason,
  });
}

export async function runWriteoff(input: {
  userId: string;
  productId: string;
  quantity: number;
  reason: string;
}) {
  const { assignment, shift } = await getInventoryActorContext(input.userId);

  return applyInventoryMovement({
    storeId: assignment.store_id,
    productId: input.productId,
    actorUserId: input.userId,
    movementType: "writeoff",
    quantityDelta: -input.quantity,
    shiftId: shift.id,
    reason: input.reason,
  });
}

export async function getSellerInventoryHistory(userId: string, limit: number) {
  const { assignment } = await getInventoryActorContext(userId);
  const history = await listInventoryHistory(assignment.store_id, limit);

  return {
    storeId: assignment.store_id,
    storeName: assignment.store_name,
    items: history.map((entry) => ({
      id: entry.id,
      movementType: entry.movement_type,
      quantityDelta: entry.quantity_delta,
      balanceAfter: entry.balance_after,
      reason: entry.reason,
      createdAt: entry.created_at,
      product: entry.product,
      actor: entry.actor,
      saleId: entry.sale_id,
      returnId: entry.return_id,
      shiftId: entry.shift_id,
    })),
  };
}

export async function runAdminInventoryAdjustment(input: {
  adminUserId: string;
  storeId: string;
  productId: string;
  movementType: "manual_adjustment" | "restock" | "writeoff";
  quantity: number;
  reason: string;
}) {
  const quantityDelta =
    input.movementType === "writeoff" ? -input.quantity : input.quantity;

  return applyInventoryMovement({
    storeId: input.storeId,
    productId: input.productId,
    actorUserId: input.adminUserId,
    movementType: input.movementType,
    quantityDelta,
    reason: input.reason,
  });
}
