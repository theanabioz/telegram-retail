import { HttpError } from "../../lib/http-error.js";
import { maybeOne, queryDb } from "../../lib/db.js";

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
  try {
    return await maybeOne<AppUser>(
      `select id, telegram_id, role, full_name, is_active
       from public.users
       where telegram_id = $1`,
      [telegramId]
    );
  } catch (error) {
    throw new HttpError(500, `Failed to load user by telegram id: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function updateUserName(userId: string, fullName: string) {
  try {
    await queryDb(
      `update public.users
       set full_name = $2
       where id = $1`,
      [userId, fullName]
    );
  } catch (error) {
    throw new HttpError(500, `Failed to update user profile: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function findUserById(userId: string) {
  try {
    return await maybeOne<AppUser>(
      `select id, telegram_id, role, full_name, is_active
       from public.users
       where id = $1`,
      [userId]
    );
  } catch (error) {
    throw new HttpError(500, `Failed to load user: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function findCurrentAssignment(userId: string) {
  try {
    const row = await maybeOne<CurrentAssignment>(
      `select usa.id, usa.store_id, s.name as store_name, usa.started_at
       from public.user_store_assignments usa
       join public.stores s on s.id = usa.store_id
       where usa.user_id = $1
         and usa.is_current = true`,
      [userId]
    );

    return row;
  } catch (error) {
    throw new HttpError(500, `Failed to load current assignment: ${error instanceof Error ? error.message : String(error)}`);
  }
}

