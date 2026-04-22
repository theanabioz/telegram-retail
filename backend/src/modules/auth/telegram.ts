import crypto from "node:crypto";
import { env } from "../../config.js";
import { HttpError } from "../../lib/http-error.js";

export type TelegramInitUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramInitData = {
  authDate: number;
  chatType: string | null;
  chatInstance: string | null;
  hash: string;
  queryId: string | null;
  raw: string;
  user: TelegramInitUser;
};

function createDataCheckString(params: URLSearchParams) {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export function validateTelegramInitData(initData: string, botToken: string): TelegramInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const rawUser = params.get("user");

  if (!hash || !rawUser) {
    throw new HttpError(400, "Invalid Telegram initData payload");
  }

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const dataCheckString = createDataCheckString(params);
  const expectedHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  if (expectedHash !== hash) {
    throw new HttpError(401, "Telegram initData signature is invalid");
  }

  const user = JSON.parse(rawUser) as TelegramInitUser;
  const authDate = Number(params.get("auth_date"));
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new HttpError(400, "Telegram initData auth_date is invalid");
  }

  if (nowSeconds - authDate > env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS) {
    throw new HttpError(401, "Telegram initData has expired");
  }

  return {
    authDate,
    chatType: params.get("chat_type"),
    chatInstance: params.get("chat_instance"),
    hash,
    queryId: params.get("query_id"),
    raw: initData,
    user,
  };
}

export function buildTelegramDisplayName(user: TelegramInitUser) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || user.username || `Telegram User ${user.id}`;
}
