import { HttpError } from "../../lib/http-error.js";
import { maybeOne, one, queryDb, withTransaction, type DbLike } from "../../lib/db.js";
import { notifyLowStockIfNeeded } from "../../lib/telegram-notifications.js";
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

async function applyInventoryMovementWithDb(input: ApplyInventoryMovementInput, db: DbLike) {
  const current = await maybeOne<{ id: string; quantity: number | string }>(
    `select id, quantity
     from public.inventory
     where store_id = $1
       and product_id = $2
     for update`,
    [input.storeId, input.productId],
    db
  );

  const currentQuantity = Number(current?.quantity ?? 0);
  const balanceAfter = currentQuantity + input.quantityDelta;

  if (balanceAfter < 0) {
    throw new HttpError(409, "Inventory cannot go below zero");
  }

  if (current) {
    await queryDb(
      `update public.inventory
       set quantity = $2,
           updated_at = now()
       where id = $1`,
      [current.id, balanceAfter],
      db
    );
  } else {
    await queryDb(
      `insert into public.inventory (store_id, product_id, quantity)
       values ($1, $2, $3)`,
      [input.storeId, input.productId, balanceAfter],
      db
    );
  }

  const inserted = await one<{ id: string; balance_after: number | string }>(
    `insert into public.inventory_movements (
       store_id,
       product_id,
       actor_user_id,
       movement_type,
       quantity_delta,
       balance_after,
       reason,
       sale_id,
       return_id,
       shift_id
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id, balance_after`,
    [
      input.storeId,
      input.productId,
      input.actorUserId,
      input.movementType,
      input.quantityDelta,
      balanceAfter,
      input.reason ?? null,
      input.saleId ?? null,
      input.returnId ?? null,
      input.shiftId ?? null,
    ],
    db
  );

  return {
    id: inserted.id,
    balance_after: Number(inserted.balance_after),
    previousQuantity: currentQuantity,
  };
}

export function notifyInventoryMovementIfNeeded(input: ApplyInventoryMovementInput, movement: { previousQuantity: number; balance_after: number }) {
  void notifyLowStockIfNeeded({
    storeId: input.storeId,
    productId: input.productId,
    previousQuantity: movement.previousQuantity,
    nextQuantity: movement.balance_after,
  });
}

export async function applyInventoryMovementInTransaction(input: ApplyInventoryMovementInput, db: DbLike) {
  return applyInventoryMovementWithDb(input, db);
}

export async function applyInventoryMovement(input: ApplyInventoryMovementInput) {
  const movement = await withTransaction((client) => applyInventoryMovementWithDb(input, client));

  notifyInventoryMovementIfNeeded(input, movement);

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
  const movementInput = await withTransaction(async (client) => {
    let quantityDelta = input.movementType === "writeoff" ? -input.quantity : input.quantity;

    if (input.movementType === "manual_adjustment") {
      const existing = await maybeOne<{ quantity: number | string }>(
        `select quantity
         from public.inventory
         where store_id = $1
           and product_id = $2
         for update`,
        [input.storeId, input.productId],
        client
      );

      quantityDelta = input.quantity - Number(existing?.quantity ?? 0);
    }

    const nextInput = {
      storeId: input.storeId,
      productId: input.productId,
      actorUserId: input.adminUserId,
      movementType: input.movementType,
      quantityDelta,
      reason: input.reason,
    };
    const movement = await applyInventoryMovementInTransaction(nextInput, client);

    return { nextInput, movement };
  });

  notifyInventoryMovementIfNeeded(movementInput.nextInput, movementInput.movement);

  return movementInput.movement;
}
