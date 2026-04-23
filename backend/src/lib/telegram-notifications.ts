import { maybeOne, queryDb } from "./db.js";
import { env } from "../config.js";
import { sendTelegramMessage } from "./telegram-api.js";

const LOW_STOCK_THRESHOLD = 10;
const ALERT_TIME_ZONE = "Europe/Lisbon";
const QUIET_HOURS_START = 22;
const QUIET_HOURS_END = 8;

type TelegramAlertTarget = {
  roles?: Array<"admin" | "seller">;
  userIds?: string[];
  telegramIds?: Array<number | string>;
};

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

async function resolveTelegramChatIds(input: {
  roles?: Array<"admin" | "seller">;
  userIds?: string[];
  telegramIds?: Array<number | string>;
}) {
  const normalizedTelegramIds = (input.telegramIds ?? [])
    .map((value) => String(value).trim())
    .filter(Boolean);

  const roleClauses: string[] = [];
  const params: unknown[] = [];
  let index = 1;

  if ((input.roles ?? []).length > 0) {
    roleClauses.push(`role = any($${index++}::public.user_role[])`);
    params.push(input.roles);
  }

  if ((input.userIds ?? []).length > 0) {
    roleClauses.push(`id = any($${index++}::uuid[])`);
    params.push(input.userIds);
  }

  if (normalizedTelegramIds.length > 0) {
    roleClauses.push(`telegram_id::text = any($${index++}::text[])`);
    params.push(normalizedTelegramIds);
  }

  if (roleClauses.length === 0) {
    return Array.from(new Set(normalizedTelegramIds));
  }

  const result = await queryDb<{ telegram_id: number }>(
    `select telegram_id
     from public.users
     where is_active = true
       and (${roleClauses.join(" or ")})`,
    params
  );

  return Array.from(
    new Set(
      [
        ...normalizedTelegramIds,
        ...result.rows
        .map((row) => row.telegram_id)
        .filter((telegramId): telegramId is number => Number.isFinite(telegramId))
        .map((telegramId) => String(telegramId)),
      ]
    )
  );
}

function adminAlertTarget(): TelegramAlertTarget {
  return {
    roles: ["admin"],
    telegramIds: env.TELEGRAM_ALERT_CHAT_IDS,
  };
}

function sellerReportTarget(sellerUserId: string): TelegramAlertTarget {
  return {
    userIds: [sellerUserId],
  };
}

function maskChatId(chatId: string) {
  return chatId.length > 4 ? `...${chatId.slice(-4)}` : "****";
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

async function sendTelegramAlert(
  title: string,
  lines: string[],
  target: TelegramAlertTarget
) {
  try {
    const chatIds = await resolveTelegramChatIds(target);

    if (chatIds.length === 0) {
      console.warn(`[telegram-alert] skipped "${title}" because no target chats were found`);
      return;
    }

    const text = buildText(title, lines);
    const disableNotification = shouldSendSilently();

    const results = await Promise.allSettled(
      chatIds.map((chatId) =>
        sendTelegramMessage({
          chatId,
          text,
          parseMode: "HTML",
          disableWebPagePreview: true,
          disableNotification,
        })
      )
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.warn(`[telegram-alert] failed "${title}" for chat ${maskChatId(chatIds[index])}: ${reason}`);
      }
    });
  } catch (error) {
    console.warn(
      `[telegram-alert] failed to send "${title}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function notifyShiftStarted(input: { sellerUserId: string; storeId: string }) {
  const [sellerName, storeName] = await Promise.all([getUserName(input.sellerUserId), getStoreName(input.storeId)]);
  const nowIso = new Date().toISOString();

  await sendTelegramAlert(
    "Открыта смена",
    [
      buildLine("Продавец", sellerName),
      buildLine("Магазин", storeName),
      buildLine("Дата", formatDate(nowIso)),
      buildLine("Время открытия", formatTime(nowIso)),
      "",
      "Смена успешно начата и готова к продажам.",
    ],
    adminAlertTarget()
  );
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

  const reportLines = [
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
  ];

  await Promise.all([
    sendTelegramAlert("Закрыта смена", reportLines, adminAlertTarget()),
    sendTelegramAlert("Смена завершена", reportLines, sellerReportTarget(input.sellerUserId)),
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

  await sendTelegramAlert(
    "Низкий остаток",
    [
      buildLine("Магазин", storeName),
      buildLine("Товар", productName),
      buildLine("Остаток", String(input.nextQuantity)),
      "",
      "Остаток опустился до порогового значения. Проверь пополнение.",
    ],
    adminAlertTarget()
  );
}
