import { supabaseAdmin } from "../../lib/supabase.js";
import { HttpError } from "../../lib/http-error.js";

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

export async function findOpenShiftByUserId(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("shifts")
    .select(
      "id, user_id, store_id, status, started_at, ended_at, paused_total_seconds, current_pause_started_at, created_at, updated_at"
    )
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle<ShiftRecord>();

  if (error) {
    throw new HttpError(500, `Failed to load open shift: ${error.message}`);
  }

  return data;
}

export async function findShiftById(shiftId: string) {
  const { data, error } = await supabaseAdmin
    .from("shifts")
    .select(
      "id, user_id, store_id, status, started_at, ended_at, paused_total_seconds, current_pause_started_at, created_at, updated_at"
    )
    .eq("id", shiftId)
    .maybeSingle<ShiftRecord>();

  if (error) {
    throw new HttpError(500, `Failed to load shift: ${error.message}`);
  }

  return data;
}

export async function listShiftsByUserId(userId: string, limit: number, offset: number) {
  const { data, error } = await supabaseAdmin
    .from("shifts")
    .select(
      "id, user_id, store_id, status, started_at, ended_at, paused_total_seconds, current_pause_started_at, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new HttpError(500, `Failed to load shift history: ${error.message}`);
  }

  return (data ?? []) as ShiftRecord[];
}

export async function findStoreById(storeId: string) {
  const { data, error } = await supabaseAdmin
    .from("stores")
    .select("id, name")
    .eq("id", storeId)
    .maybeSingle<ShiftStoreRecord>();

  if (error) {
    throw new HttpError(500, `Failed to load shift store: ${error.message}`);
  }

  return data;
}

export async function listCompletedSalesByShift(shiftId: string) {
  const { data, error } = await supabaseAdmin
    .from("sales")
    .select("id, shift_id, payment_method, total_amount, created_at")
    .eq("shift_id", shiftId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(500, `Failed to load shift sales: ${error.message}`);
  }

  return (data ?? []) as ShiftSaleRecord[];
}

export async function createShift(input: {
  userId: string;
  storeId: string;
  startedAt: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("shifts")
    .insert({
      user_id: input.userId,
      store_id: input.storeId,
      status: "active",
      started_at: input.startedAt,
      paused_total_seconds: 0,
      current_pause_started_at: null,
    })
    .select(
      "id, user_id, store_id, status, started_at, ended_at, paused_total_seconds, current_pause_started_at, created_at, updated_at"
    )
    .single<ShiftRecord>();

  if (error) {
    throw new HttpError(500, `Failed to create shift: ${error.message}`);
  }

  return data;
}

export async function updateShift(shiftId: string, updates: Partial<ShiftRecord>) {
  const { data, error } = await supabaseAdmin
    .from("shifts")
    .update(updates)
    .eq("id", shiftId)
    .select(
      "id, user_id, store_id, status, started_at, ended_at, paused_total_seconds, current_pause_started_at, created_at, updated_at"
    )
    .single<ShiftRecord>();

  if (error) {
    throw new HttpError(500, `Failed to update shift: ${error.message}`);
  }

  return data;
}
