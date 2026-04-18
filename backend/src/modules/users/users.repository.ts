import { supabaseAdmin } from "../../lib/supabase.js";
import { HttpError } from "../../lib/http-error.js";

export type AppUser = {
  id: string;
  telegram_id: number;
  role: "admin" | "seller";
  full_name: string;
  is_active: boolean;
};

export type CurrentAssignment = {
  id: string;
  store_id: string;
  store_name: string;
  started_at: string;
};

export async function findUserByTelegramId(telegramId: number) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, telegram_id, role, full_name, is_active")
    .eq("telegram_id", telegramId)
    .maybeSingle<AppUser>();

  if (error) {
    throw new HttpError(500, `Failed to load user by telegram id: ${error.message}`);
  }

  return data;
}

export async function updateUserName(userId: string, fullName: string) {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ full_name: fullName })
    .eq("id", userId);

  if (error) {
    throw new HttpError(500, `Failed to update user profile: ${error.message}`);
  }
}

export async function findUserById(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, telegram_id, role, full_name, is_active")
    .eq("id", userId)
    .maybeSingle<AppUser>();

  if (error) {
    throw new HttpError(500, `Failed to load user: ${error.message}`);
  }

  return data;
}

export async function findCurrentAssignment(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_store_assignments")
    .select("id, store_id, started_at, stores!inner(name)")
    .eq("user_id", userId)
    .eq("is_current", true)
    .maybeSingle<{ id: string; store_id: string; started_at: string; stores: { name: string } }>();

  if (error) {
    throw new HttpError(500, `Failed to load current assignment: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    store_id: data.store_id,
    store_name: data.stores.name,
    started_at: data.started_at,
  } satisfies CurrentAssignment;
}
