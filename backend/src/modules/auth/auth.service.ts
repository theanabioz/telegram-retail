import { env } from "../../config.js";
import { HttpError } from "../../lib/http-error.js";
import {
  buildTelegramDisplayName,
  validateTelegramInitData,
} from "./telegram.js";
import { signAppJwt, type JwtPayload } from "./jwt.js";
import {
  findCurrentAssignment,
  findUserById,
  findUserByTelegramId,
  updateUserName,
} from "../users/users.repository.js";

export async function authenticateTelegramUser(initData: string) {
  const telegram = validateTelegramInitData(initData, env.BOT_TOKEN);
  const appUser = await findUserByTelegramId(telegram.user.id);

  if (!appUser || !appUser.is_active) {
    throw new HttpError(403, "User is not provisioned or inactive");
  }

  const displayName = buildTelegramDisplayName(telegram.user);
  if (displayName && displayName !== appUser.full_name) {
    await updateUserName(appUser.id, displayName);
  }

  const assignment = appUser.role === "seller" ? await findCurrentAssignment(appUser.id) : null;

  if (appUser.role === "seller" && !assignment) {
    throw new HttpError(403, "Seller has no active store assignment");
  }

  const payload: JwtPayload = {
    app_user_id: appUser.id,
    app_role: appUser.role,
    telegram_id: appUser.telegram_id,
    full_name: displayName || appUser.full_name,
    store_id: assignment?.store_id ?? null,
    impersonated_by: null,
    impersonation_log_id: null,
  };

  return {
    token: signAppJwt(payload),
    user: payload,
    assignment,
  };
}

export async function authenticateDevUser(telegramId: number) {
  const appUser = await findUserByTelegramId(telegramId);

  if (!appUser || !appUser.is_active) {
    throw new HttpError(403, "User is not provisioned or inactive");
  }

  const assignment = appUser.role === "seller" ? await findCurrentAssignment(appUser.id) : null;

  if (appUser.role === "seller" && !assignment) {
    throw new HttpError(403, "Seller has no active store assignment");
  }

  const payload: JwtPayload = {
    app_user_id: appUser.id,
    app_role: appUser.role,
    telegram_id: appUser.telegram_id,
    full_name: appUser.full_name,
    store_id: assignment?.store_id ?? null,
    impersonated_by: null,
    impersonation_log_id: null,
  };

  return {
    token: signAppJwt(payload),
    user: payload,
    assignment,
  };
}

export async function getCurrentSessionUser(userId: string) {
  const user = await findUserById(userId);

  if (!user || !user.is_active) {
    throw new HttpError(404, "Authenticated user no longer exists");
  }

  const assignment = user.role === "seller" ? await findCurrentAssignment(user.id) : null;

  return {
    user,
    assignment,
  };
}

export async function refreshSessionPayload(payload: JwtPayload): Promise<JwtPayload> {
  const user = await findUserById(payload.app_user_id);

  if (!user || !user.is_active) {
    throw new HttpError(401, "Authenticated user no longer exists");
  }

  if (user.role !== payload.app_role) {
    throw new HttpError(403, "User role changed, please sign in again");
  }

  const assignment = user.role === "seller" ? await findCurrentAssignment(user.id) : null;

  if (user.role === "seller" && !assignment) {
    throw new HttpError(403, "Seller has no active store assignment");
  }

  return {
    ...payload,
    telegram_id: user.telegram_id,
    full_name: user.full_name,
    store_id: assignment?.store_id ?? null,
  };
}
