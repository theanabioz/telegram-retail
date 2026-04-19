import { env } from "../config.js";
import { supabaseAdmin } from "./supabase.js";

type TelegramUpdate = {
  message?: {
    chat?: {
      id?: number;
      type?: string;
    };
  };
};

const LOW_STOCK_THRESHOLD = 10;
const TARGET_CACHE_TTL_MS = 60_000;

let cachedChatIds: string[] = [];
let cachedAt = 0;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function telegramRequest<T>(method: string, body?: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; result?: T; description?: string }
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description ?? `Telegram API ${method} failed with ${response.status}`);
  }

  return payload.result as T;
}

async function resolveTelegramAlertChatIds() {
  if (env.TELEGRAM_ALERT_CHAT_IDS.length > 0) {
    return env.TELEGRAM_ALERT_CHAT_IDS;
  }

  const now = Date.now();
  if (cachedChatIds.length > 0 && now - cachedAt < TARGET_CACHE_TTL_MS) {
    return cachedChatIds;
  }

  const updates = await telegramRequest<TelegramUpdate[]>("getUpdates");
  const discoveredChatIds = Array.from(
    new Set(
      updates
        .map((update) => update.message?.chat)
        .filter((chat): chat is { id: number; type?: string } => Boolean(chat?.id))
        .filter((chat) => chat.type === "private" || !chat.type)
        .map((chat) => String(chat.id))
    )
  );

  cachedChatIds = discoveredChatIds;
  cachedAt = now;

  if (discoveredChatIds.length > 0) {
    return discoveredChatIds;
  }

  const { data: users, error } = await supabaseAdmin
    .from("users")
    .select("telegram_id")
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to load fallback Telegram ids: ${error.message}`);
  }

  const fallbackChatIds = Array.from(
    new Set(
      (users ?? [])
        .map((user) => user.telegram_id)
        .filter((telegramId): telegramId is number => Number.isFinite(telegramId))
        .map((telegramId) => String(telegramId))
    )
  );

  cachedChatIds = fallbackChatIds;
  cachedAt = now;

  return fallbackChatIds;
}

async function getUserName(userId: string) {
  const { data } = await supabaseAdmin
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle<{ full_name: string }>();

  return data?.full_name ?? "Unknown seller";
}

async function getStoreName(storeId: string) {
  const { data } = await supabaseAdmin
    .from("stores")
    .select("name")
    .eq("id", storeId)
    .maybeSingle<{ name: string }>();

  return data?.name ?? "Unknown store";
}

async function getProductName(productId: string) {
  const { data } = await supabaseAdmin
    .from("products")
    .select("name")
    .eq("id", productId)
    .maybeSingle<{ name: string }>();

  return data?.name ?? "Unknown product";
}

async function sendTelegramAlert(title: string, lines: string[]) {
  try {
    const chatIds = await resolveTelegramAlertChatIds();

    if (chatIds.length === 0) {
      console.warn(`[telegram-alert] skipped "${title}" because no target chats were found`);
      return;
    }

    const text = [`<b>${escapeHtml(title)}</b>`, ...lines.map((line) => escapeHtml(line))].join("\n");

    await Promise.allSettled(
      chatIds.map((chatId) =>
        telegramRequest("sendMessage", {
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        })
      )
    );
  } catch (error) {
    console.warn(
      `[telegram-alert] failed to send "${title}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function notifyShiftStarted(input: { sellerUserId: string; storeId: string }) {
  const [sellerName, storeName] = await Promise.all([getUserName(input.sellerUserId), getStoreName(input.storeId)]);

  await sendTelegramAlert("Shift started", [`Seller: ${sellerName}`, `Store: ${storeName}`]);
}

export async function notifyShiftEnded(input: {
  sellerUserId: string;
  storeId: string;
  workedSeconds: number;
  pausedSeconds: number;
}) {
  const [sellerName, storeName] = await Promise.all([getUserName(input.sellerUserId), getStoreName(input.storeId)]);

  const workedMinutes = Math.max(0, Math.floor(input.workedSeconds / 60));
  const pausedMinutes = Math.max(0, Math.floor(input.pausedSeconds / 60));

  await sendTelegramAlert("Shift ended", [
    `Seller: ${sellerName}`,
    `Store: ${storeName}`,
    `Worked: ${workedMinutes} min`,
    `Paused: ${pausedMinutes} min`,
  ]);
}

export async function notifyLowStockIfNeeded(input: {
  storeId: string;
  productId: string;
  previousQuantity: number;
  nextQuantity: number;
}) {
  if (!(input.previousQuantity > LOW_STOCK_THRESHOLD && input.nextQuantity <= LOW_STOCK_THRESHOLD)) {
    return;
  }

  const [storeName, productName] = await Promise.all([getStoreName(input.storeId), getProductName(input.productId)]);

  await sendTelegramAlert("Low stock alert", [
    `Store: ${storeName}`,
    `Product: ${productName}`,
    `Remaining stock: ${input.nextQuantity}`,
  ]);
}
