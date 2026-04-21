import { HttpError } from "../../lib/http-error.js";
import { maybeOne, one, queryDb } from "../../lib/db.js";

export type ShiftRecord = {
  id: string;
  user_id: string;
  store_id: string;
  status: "active" | "paused" | "closed";
  started_at: string;
  ended_at: string | null;
  paused_total_seconds: number;
  current_pause_started_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ShiftStoreRecord = {
  id: string;
  name: string;
};

export type ShiftSaleRecord = {
  id: string;
  shift_id: string;
  payment_method: "cash" | "card";
  total_amount: number;
  created_at: string;
};

const SHIFT_SELECT = `
  id,
  user_id,
  store_id,
  status,
  started_at,
  ended_at,
  paused_total_seconds,
  current_pause_started_at,
  created_at,
  updated_at
`;

function mapShift(row: ShiftRecord | null) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    paused_total_seconds: Number(row.paused_total_seconds),
  } satisfies ShiftRecord;
}

export async function findOpenShiftByUserId(userId: string) {
  try {
    const row = await maybeOne<ShiftRecord>(
      `select ${SHIFT_SELECT}
       from public.shifts
       where user_id = $1
         and ended_at is null`,
      [userId]
    );

    return mapShift(row);
  } catch (error) {
    throw new HttpError(500, `Failed to load open shift: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function findShiftById(shiftId: string) {
  try {
    const row = await maybeOne<ShiftRecord>(
      `select ${SHIFT_SELECT}
       from public.shifts
       where id = $1`,
      [shiftId]
    );

    return mapShift(row);
  } catch (error) {
    throw new HttpError(500, `Failed to load shift: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listShiftsByUserId(userId: string, limit: number, offset: number) {
  try {
    const result = await queryDb<ShiftRecord>(
      `select ${SHIFT_SELECT}
       from public.shifts
       where user_id = $1
       order by started_at desc
       limit $2
       offset $3`,
      [userId, limit, offset]
    );

    return result.rows.map((row) => ({
      ...row,
      paused_total_seconds: Number(row.paused_total_seconds),
    }));
  } catch (error) {
    throw new HttpError(500, `Failed to load shift history: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function findStoreById(storeId: string) {
  try {
    return await maybeOne<ShiftStoreRecord>(
      `select id, name
       from public.stores
       where id = $1`,
      [storeId]
    );
  } catch (error) {
    throw new HttpError(500, `Failed to load shift store: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listCompletedSalesByShift(shiftId: string) {
  try {
    const result = await queryDb<ShiftSaleRecord>(
      `select id, shift_id, payment_method, total_amount, created_at
       from public.sales
       where shift_id = $1
         and status = 'completed'
       order by created_at desc`,
      [shiftId]
    );

    return result.rows.map((row) => ({
      ...row,
      total_amount: Number(row.total_amount),
    }));
  } catch (error) {
    throw new HttpError(500, `Failed to load shift sales: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function createShift(input: { userId: string; storeId: string; startedAt: string }) {
  try {
    const row = await one<ShiftRecord>(
      `insert into public.shifts (
         user_id,
         store_id,
         status,
         started_at,
         paused_total_seconds,
         current_pause_started_at
       )
       values ($1, $2, 'active', $3, 0, null)
       returning ${SHIFT_SELECT}`,
      [input.userId, input.storeId, input.startedAt]
    );

    return mapShift(row)!;
  } catch (error) {
    throw new HttpError(500, `Failed to create shift: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function updateShift(shiftId: string, updates: Partial<ShiftRecord>) {
  try {
    const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      const existing = await findShiftById(shiftId);
      if (!existing) {
        throw new HttpError(404, "Shift not found");
      }
      return existing;
    }

    const columns = entries.map(([key], index) => `${key} = $${index + 2}`);
    const values = entries.map(([, value]) => value);
    const row = await one<ShiftRecord>(
      `update public.shifts
       set ${columns.join(", ")}
       where id = $1
       returning ${SHIFT_SELECT}`,
      [shiftId, ...values]
    );

    return mapShift(row)!;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to update shift: ${error instanceof Error ? error.message : String(error)}`);
  }
}

