import { env } from "../config.js";
import { maybeOne, queryDb } from "./db.js";

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
const ALERT_TIME_ZONE = "Europe/Lisbon";
const QUIET_HOURS_START = 22;
const QUIET_HOURS_END = 8;

let cachedChatIds: string[] = [];
let cachedAt = 0;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: ALERT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: ALERT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatCurrency(amount: number) {
  return `${amount.toFixed(2)} EUR`;
}

function formatDuration(seconds: number) {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}ч ${minutes}м`;
}

function getCurrentAlertHour() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ALERT_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hourPart = parts.find((part) => part.type === "hour")?.value ?? "00";
  return Number.parseInt(hourPart, 10);
}

function shouldSendSilently() {
  const hour = getCurrentAlertHour();
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

function buildLine(label: string, value: string) {
  return `<b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`;
}

function buildText(title: string, lines: string[]) {
  return [`<b>${escapeHtml(title)}</b>`, ...lines].join("\n");
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

  const usersResult = await queryDb<{ telegram_id: number }>(
    `select telegram_id
     from public.users
     where is_active = true`
  );

  const fallbackChatIds = Array.from(
    new Set(
      usersResult.rows
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
  const data = await maybeOne<{ full_name: string }>(
    `select full_name from public.users where id = $1`,
    [userId]
  );
  return data?.full_name ?? "Unknown seller";
}

async function getStoreName(storeId: string) {
  const data = await maybeOne<{ name: string }>(
    `select name from public.stores where id = $1`,
    [storeId]
  );
  return data?.name ?? "Unknown store";
}

async function getProductName(productId: string) {
  const data = await maybeOne<{ name: string }>(
    `select name from public.products where id = $1`,
    [productId]
  );
  return data?.name ?? "Unknown product";
}

async function sendTelegramAlert(title: string, lines: string[]) {
  try {
    const chatIds = await resolveTelegramAlertChatIds();

    if (chatIds.length === 0) {
      console.warn(`[telegram-alert] skipped "${title}" because no target chats were found`);
      return;
    }

    const text = buildText(title, lines);
    const disableNotification = shouldSendSilently();

    await Promise.allSettled(
      chatIds.map((chatId) =>
        telegramRequest("sendMessage", {
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          disable_notification: disableNotification,
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
  const nowIso = new Date().toISOString();

  await sendTelegramAlert("Открыта смена", [
    buildLine("Продавец", sellerName),
    buildLine("Магазин", storeName),
    buildLine("Дата", formatDate(nowIso)),
    buildLine("Время открытия", formatTime(nowIso)),
    "",
    "Смена успешно начата и готова к продажам.",
  ]);
}

export async function notifyShiftEnded(input: {
  sellerUserId: string;
  storeId: string;
  startedAt: string;
  endedAt: string;
  workedSeconds: number;
  pausedSeconds: number;
  salesCount: number;
  totalRevenue: number;
  cashSalesCount: number;
  cardSalesCount: number;
  cashRevenue: number;
  cardRevenue: number;
}) {
  const [sellerName, storeName] = await Promise.all([getUserName(input.sellerUserId), getStoreName(input.storeId)]);

  await sendTelegramAlert("Отчет по смене", [
    buildLine("Продавец", sellerName),
    buildLine("Магазин", storeName),
    buildLine("Дата", formatDate(input.endedAt)),
    "",
    buildLine("Начало", formatTime(input.startedAt)),
    buildLine("Завершение", formatTime(input.endedAt)),
    buildLine("Отработано", formatDuration(input.workedSeconds)),
    buildLine("Пауза", formatDuration(input.pausedSeconds)),
    "",
    buildLine("Продаж за смену", String(input.salesCount)),
    buildLine("Выручка за смену", formatCurrency(input.totalRevenue)),
    buildLine("Наличные", `${input.cashSalesCount} шт. • ${formatCurrency(input.cashRevenue)}`),
    buildLine("Карта", `${input.cardSalesCount} шт. • ${formatCurrency(input.cardRevenue)}`),
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

  await sendTelegramAlert("Низкий остаток", [
    buildLine("Магазин", storeName),
    buildLine("Товар", productName),
    buildLine("Остаток", String(input.nextQuantity)),
    "",
    "Остаток опустился до порогового значения. Проверь пополнение.",
  ]);
}
