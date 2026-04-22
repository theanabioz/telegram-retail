import { env } from "../config.js";
import {
  answerTelegramCallbackQuery,
  editTelegramMessage,
  sendTelegramMessage,
  telegramRequest,
  type TelegramInlineKeyboardMarkup,
} from "./telegram-api.js";
import { HttpError } from "./http-error.js";
import { findCurrentAssignment, findUserByTelegramId, type AppUser } from "../modules/users/users.repository.js";
import { getShiftDetails, getShiftHistory, getShiftState } from "../modules/shifts/shifts.service.js";
import {
  archiveProduct,
  assignSellerToStore,
  createProduct,
  createSeller,
  createStore,
  deleteProduct,
  deleteSeller,
  deleteStore,
  getAdminDashboard,
  getAdminProducts,
  getAdminStaff,
  getAdminStores,
  restoreProduct,
  updateProduct,
  updateSeller,
  updateStore,
} from "../modules/admin/admin.service.js";

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  type?: string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  from?: TelegramUser;
  chat?: TelegramChat;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type BotConversationState =
  | { kind: "seller.create.telegram"; adminUserId: string }
  | { kind: "seller.create.name"; adminUserId: string; telegramId: number }
  | { kind: "seller.create.store"; adminUserId: string; telegramId: number; fullName: string }
  | { kind: "seller.rename"; sellerId: string }
  | { kind: "seller.assign.store"; adminUserId: string; sellerId: string }
  | { kind: "store.create.name" }
  | { kind: "store.create.address"; name: string }
  | { kind: "store.rename"; storeId: string }
  | { kind: "store.address"; storeId: string }
  | { kind: "product.create.name" }
  | { kind: "product.create.sku"; name: string }
  | { kind: "product.create.price"; name: string; sku: string }
  | { kind: "product.rename"; productId: string }
  | { kind: "product.sku"; productId: string }
  | { kind: "product.price"; productId: string };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatCurrency(amount: number) {
  return `${amount.toFixed(2)} EUR`;
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function parsePositiveInteger(text: string) {
  const normalized = text.replace(/[^\d]/g, "");
  if (!normalized) {
    return null;
  }
  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parsePrice(text: string) {
  const normalized = text.replace(",", ".").trim();
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(2)) : null;
}

function buildAppUrl() {
  return `https://${env.APP_DOMAIN}/`;
}

function buildOpenAppKeyboard(label = "Открыть Mini App"): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: label, url: buildAppUrl() }]],
  };
}

function combineKeyboards(
  ...rows: Array<TelegramInlineKeyboardMarkup | null | undefined>
): TelegramInlineKeyboardMarkup | undefined {
  const inline_keyboard = rows.flatMap((item) => item?.inline_keyboard ?? []);
  return inline_keyboard.length > 0 ? { inline_keyboard } : undefined;
}

async function sendOrEditMessage(input: {
  chatId: number | string;
  messageId?: number;
  text: string;
  replyMarkup?: TelegramInlineKeyboardMarkup;
}) {
  if (input.messageId) {
    try {
      await editTelegramMessage({
        chatId: input.chatId,
        messageId: input.messageId,
        text: input.text,
        parseMode: "HTML",
        replyMarkup: input.replyMarkup,
      });
      return;
    } catch {
      // Fall through to sending a fresh message if editing is no longer possible.
    }
  }

  await sendTelegramMessage({
    chatId: input.chatId,
    text: input.text,
    parseMode: "HTML",
    replyMarkup: input.replyMarkup,
  });
}

function buildAccessDeniedText() {
  return [
    `<b>Access denied</b>`,
    "",
    "Этот чат не подключен к разрешенному рабочему пространству.",
  ].join("\n");
}

async function renderSellerMenu(chatId: number, seller: AppUser, messageId?: number) {
  const [shiftState, assignment, shiftHistory] = await Promise.all([
    getShiftState(seller.id),
    findCurrentAssignment(seller.id),
    getShiftHistory(seller.id, 1, 0),
  ]);

  const activeShift = shiftState.activeShift;
  const lastShift = shiftHistory.items[0];
  const text = [
    `<b>${escapeHtml(seller.full_name)}</b>`,
    `<b>Роль:</b> продавец`,
    `<b>Магазин:</b> ${escapeHtml(assignment?.store_name ?? "Не назначен")}`,
    `<b>Смена:</b> ${
      activeShift
        ? `${activeShift.status === "paused" ? "на паузе" : "активна"} с ${escapeHtml(formatDateTime(activeShift.started_at))}`
        : "сейчас закрыта"
    }`,
    lastShift
      ? `<b>Последняя смена:</b> ${escapeHtml(formatDateTime(lastShift.shift.started_at))}`
      : `<b>Последняя смена:</b> пока нет данных`,
    "",
    "В этом чате доступны только твои данные по смене.",
  ].join("\n");

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: combineKeyboards(
      buildOpenAppKeyboard(),
      {
        inline_keyboard: [
          [{ text: "Статус смены", callback_data: "seller:shift" }],
          [{ text: "Отчет по последней смене", callback_data: "seller:last-shift" }],
          [{ text: "Обновить", callback_data: "home" }],
        ],
      }
    ),
  });
}

async function renderSellerShift(chatId: number, seller: AppUser, messageId?: number) {
  const [shiftState, assignment] = await Promise.all([
    getShiftState(seller.id),
    findCurrentAssignment(seller.id),
  ]);

  const activeShift = shiftState.activeShift;
  const text = activeShift
    ? [
        `<b>Текущая смена</b>`,
        `<b>Магазин:</b> ${escapeHtml(assignment?.store_name ?? "Не назначен")}`,
        `<b>Статус:</b> ${escapeHtml(activeShift.status)}`,
        `<b>Старт:</b> ${escapeHtml(formatDateTime(activeShift.started_at))}`,
      ].join("\n")
    : [`<b>Текущая смена</b>`, "", "Сейчас активной смены нет."].join("\n");

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: {
      inline_keyboard: [[{ text: "Назад", callback_data: "home" }]],
    },
  });
}

async function renderSellerLastShift(chatId: number, seller: AppUser, messageId?: number) {
  const history = await getShiftHistory(seller.id, 1, 0);
  const lastShift = history.items[0];

  if (!lastShift) {
    await sendOrEditMessage({
      chatId,
      messageId,
      text: `<b>Отчет по последней смене</b>\n\nУ тебя пока нет завершенных смен.`,
      replyMarkup: {
        inline_keyboard: [[{ text: "Назад", callback_data: "home" }]],
      },
    });
    return;
  }

  const details = await getShiftDetails(seller.id, lastShift.shift.id);
  const text = [
    `<b>Последняя смена</b>`,
    `<b>Магазин:</b> ${escapeHtml(details.store?.name ?? "Неизвестно")}`,
    `<b>Начало:</b> ${escapeHtml(formatDateTime(details.shift.started_at))}`,
    `<b>Продаж:</b> ${details.salesSummary.count}`,
    `<b>Выручка:</b> ${escapeHtml(formatCurrency(details.salesSummary.totalRevenue))}`,
    `<b>Наличные:</b> ${details.salesSummary.cashSalesCount} шт.`,
    `<b>Карта:</b> ${details.salesSummary.cardSalesCount} шт.`,
  ].join("\n");

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: {
      inline_keyboard: [[{ text: "Назад", callback_data: "home" }]],
    },
  });
}

async function renderAdminMenu(chatId: number, admin: AppUser, messageId?: number) {
  const dashboard = await getAdminDashboard({
    recentSalesLimit: 5,
    lowStockLimit: 5,
  });

  const text = [
    `<b>${escapeHtml(admin.full_name)}</b>`,
    `<b>Роль:</b> администратор`,
    `<b>Выручка сегодня:</b> ${escapeHtml(formatCurrency(dashboard.summary.totalRevenueToday))}`,
    `<b>Продажи сегодня:</b> ${dashboard.summary.completedSalesToday}`,
    `<b>Активные смены:</b> ${dashboard.summary.activeShifts}`,
    `<b>Низкий остаток:</b> ${dashboard.summary.lowStockCount}`,
    "",
    "Выбери раздел управления.",
  ].join("\n");

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: combineKeyboards(
      buildOpenAppKeyboard(),
      {
        inline_keyboard: [
          [{ text: "Сводка", callback_data: "admin:dashboard" }],
          [{ text: "Продавцы", callback_data: "admin:sellers" }],
          [{ text: "Магазины", callback_data: "admin:stores" }],
          [{ text: "Товары", callback_data: "admin:products" }],
        ],
      }
    ),
  });
}

async function renderAdminDashboard(chatId: number, messageId?: number) {
  const dashboard = await getAdminDashboard({
    recentSalesLimit: 5,
    lowStockLimit: 5,
  });

  const lowStockLine =
    dashboard.lowStockItems[0] && dashboard.lowStockItems[0].product && dashboard.lowStockItems[0].store
      ? `${dashboard.lowStockItems[0].product.name} — ${dashboard.lowStockItems[0].quantity} (${dashboard.lowStockItems[0].store.name})`
      : "Нет критичных позиций";

  const text = [
    `<b>Сводка по бизнесу</b>`,
    `<b>Выручка сегодня:</b> ${escapeHtml(formatCurrency(dashboard.summary.totalRevenueToday))}`,
    `<b>Продажи сегодня:</b> ${dashboard.summary.completedSalesToday}`,
    `<b>Активные продавцы:</b> ${dashboard.summary.activeShifts}`,
    `<b>Магазины:</b> ${dashboard.summary.totalStores}`,
    `<b>Низкий остаток:</b> ${dashboard.summary.lowStockCount}`,
    "",
    `<b>Ближайший риск:</b> ${escapeHtml(lowStockLine)}`,
  ].join("\n");

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: {
      inline_keyboard: [[{ text: "Назад", callback_data: "home" }]],
    },
  });
}

async function renderAdminSellers(chatId: number, messageId?: number) {
  const staff = await getAdminStaff();
  const rows = staff.sellers.map((seller) => [
    {
      text: `${seller.fullName}${seller.isActive ? "" : " • off"}`,
      callback_data: `admin:seller:${seller.id}`,
    },
  ]);

  await sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Продавцы</b>\n\nУправление сотрудниками и их магазинами.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Добавить продавца", callback_data: "admin:seller:new" }],
        ...rows,
        [{ text: "Назад", callback_data: "home" }],
      ],
    },
  });
}

async function renderAdminSellerDetails(chatId: number, sellerId: string, messageId?: number) {
  const staff = await getAdminStaff();
  const seller = staff.sellers.find((item) => item.id === sellerId);

  if (!seller) {
    throw new HttpError(404, "Seller not found");
  }

  const text = [
    `<b>${escapeHtml(seller.fullName)}</b>`,
    `<b>Telegram ID:</b> ${seller.telegramId}`,
    `<b>Статус:</b> ${seller.isActive ? "активен" : "выключен"}`,
    `<b>Магазин:</b> ${escapeHtml(seller.currentAssignment?.storeName ?? "Не назначен")}`,
    `<b>Продажи:</b> ${seller.salesCount}`,
    `<b>Выручка:</b> ${escapeHtml(formatCurrency(seller.revenue))}`,
  ].join("\n");

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Переименовать", callback_data: `admin:seller:rename:${seller.id}` }],
        [{ text: "Назначить магазин", callback_data: `admin:seller:assign:${seller.id}` }],
        [{ text: seller.isActive ? "Выключить" : "Включить", callback_data: `admin:seller:toggle:${seller.id}` }],
        [{ text: "Удалить", callback_data: `admin:seller:delete:${seller.id}` }],
        [{ text: "Назад", callback_data: "admin:sellers" }],
      ],
    },
  });
}

async function renderAdminSellerDeleteConfirm(chatId: number, sellerId: string, messageId?: number) {
  await sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Удалить продавца?</b>\n\nЭто действие необратимо, если у продавца нет операционной истории.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Да, удалить", callback_data: `admin:seller:delete:confirm:${sellerId}` }],
        [{ text: "Назад", callback_data: `admin:seller:${sellerId}` }],
      ],
    },
  });
}

async function renderAssignStorePicker(
  chatId: number,
  sellerId: string,
  messageId?: number
) {
  const stores = await getAdminStores();
  const storeRows = stores.stores
    .filter((store) => store.isActive)
    .map((store) => [{ text: store.name, callback_data: `pick:store:${store.id}` }]);

  await sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Выбери магазин для продавца</b>`,
    replyMarkup: {
      inline_keyboard: [...storeRows, [{ text: "Назад", callback_data: `admin:seller:${sellerId}` }]],
    },
  });
}

async function renderAdminStores(chatId: number, messageId?: number) {
  const stores = await getAdminStores();
  const rows = stores.stores.map((store) => [
    {
      text: `${store.name}${store.isActive ? "" : " • off"}`,
      callback_data: `admin:store:${store.id}`,
    },
  ]);

  await sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Магазины</b>\n\nСоздание, редактирование и контроль статуса.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Добавить магазин", callback_data: "admin:store:new" }],
        ...rows,
        [{ text: "Назад", callback_data: "home" }],
      ],
    },
  });
}

async function renderAdminStoreDetails(chatId: number, storeId: string, messageId?: number) {
  const stores = await getAdminStores();
  const store = stores.stores.find((item) => item.id === storeId);

  if (!store) {
    throw new HttpError(404, "Store not found");
  }

  const text = [
    `<b>${escapeHtml(store.name)}</b>`,
    `<b>Адрес:</b> ${escapeHtml(store.address ?? "Не указан")}`,
    `<b>Статус:</b> ${store.isActive ? "активен" : "выключен"}`,
    `<b>Продавцов:</b> ${store.sellerCount}`,
    `<b>Продаж сегодня:</b> ${store.revenueToday ? store.salesCount : 0}`,
    `<b>Выручка сегодня:</b> ${escapeHtml(formatCurrency(store.revenueToday))}`,
  ].join("\n");

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Переименовать", callback_data: `admin:store:rename:${store.id}` }],
        [{ text: "Изменить адрес", callback_data: `admin:store:address:${store.id}` }],
        [{ text: store.isActive ? "Выключить" : "Включить", callback_data: `admin:store:toggle:${store.id}` }],
        [{ text: "Удалить", callback_data: `admin:store:delete:${store.id}` }],
        [{ text: "Назад", callback_data: "admin:stores" }],
      ],
    },
  });
}

async function renderAdminStoreDeleteConfirm(chatId: number, storeId: string, messageId?: number) {
  await sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Удалить магазин?</b>\n\nУдаление возможно только если у магазина нет операционной истории.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Да, удалить", callback_data: `admin:store:delete:confirm:${storeId}` }],
        [{ text: "Назад", callback_data: `admin:store:${storeId}` }],
      ],
    },
  });
}

async function renderAdminProducts(chatId: number, messageId?: number) {
  const products = await getAdminProducts();
  const rows = products.products.map((product) => [
    {
      text: `${product.name}${product.isActive ? "" : " • off"}`,
      callback_data: `admin:product:${product.id}`,
    },
  ]);

  await sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Товары</b>\n\nУправление ассортиментом и ценами.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Добавить товар", callback_data: "admin:product:new" }],
        ...rows,
        [{ text: "Назад", callback_data: "home" }],
      ],
    },
  });
}

async function renderAdminProductDetails(chatId: number, productId: string, messageId?: number) {
  const products = await getAdminProducts({ archived: true });
  const product = products.products.find((item) => item.id === productId);

  if (!product) {
    throw new HttpError(404, "Product not found");
  }

  const text = [
    `<b>${escapeHtml(product.name)}</b>`,
    `<b>SKU:</b> ${escapeHtml(product.sku)}`,
    `<b>Цена:</b> ${escapeHtml(formatCurrency(product.defaultPrice))}`,
    `<b>Статус:</b> ${product.isActive ? "активен" : "выключен"}`,
    `<b>Архив:</b> ${product.isArchived ? "да" : "нет"}`,
    `<b>Магазинов активно:</b> ${product.enabledStoreCount}`,
  ].join("\n");

  const archiveLabel = product.isArchived ? "Восстановить" : "В архив";
  const archiveAction = product.isArchived ? `admin:product:restore:${product.id}` : `admin:product:archive:${product.id}`;

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Переименовать", callback_data: `admin:product:rename:${product.id}` }],
        [{ text: "Изменить SKU", callback_data: `admin:product:sku:${product.id}` }],
        [{ text: "Изменить цену", callback_data: `admin:product:price:${product.id}` }],
        [{ text: product.isActive ? "Выключить" : "Включить", callback_data: `admin:product:toggle:${product.id}` }],
        [{ text: archiveLabel, callback_data: archiveAction }],
        [{ text: "Удалить", callback_data: `admin:product:delete:${product.id}` }],
        [{ text: "Назад", callback_data: "admin:products" }],
      ],
    },
  });
}

async function renderAdminProductDeleteConfirm(chatId: number, productId: string, messageId?: number) {
  await sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Удалить товар?</b>\n\nУдаление возможно только пока у товара нет истории продаж и движения склада.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Да, удалить", callback_data: `admin:product:delete:confirm:${productId}` }],
        [{ text: "Назад", callback_data: `admin:product:${productId}` }],
      ],
    },
  });
}

async function showHome(chatId: number, user: AppUser, messageId?: number) {
  if (!user.is_active) {
    await sendOrEditMessage({
      chatId,
      messageId,
      text: buildAccessDeniedText(),
      replyMarkup: buildOpenAppKeyboard(),
    });
    return;
  }

  if (user.role === "admin") {
    await renderAdminMenu(chatId, user, messageId);
    return;
  }

  await renderSellerMenu(chatId, user, messageId);
}

export function startTelegramBot() {
  const conversationState = new Map<number, BotConversationState>();
  let stopped = false;
  let offset = 0;

  async function handleDenied(chatId: number, messageId?: number) {
    conversationState.delete(chatId);
    await sendOrEditMessage({
      chatId,
      messageId,
      text: buildAccessDeniedText(),
      replyMarkup: buildOpenAppKeyboard(),
    });
  }

  async function resolveUser(telegramId: number) {
    const user = await findUserByTelegramId(telegramId);
    return user && user.is_active ? user : user;
  }

  async function handleTextState(chatId: number, user: AppUser, text: string) {
    const state = conversationState.get(chatId);
    if (!state) {
      return false;
    }

    if (text === "/cancel") {
      conversationState.delete(chatId);
      await sendTelegramMessage({
        chatId,
        text: "Действие отменено.",
      });
      await showHome(chatId, user);
      return true;
    }

    switch (state.kind) {
      case "seller.create.telegram": {
        const telegramId = parsePositiveInteger(text);
        if (!telegramId) {
          await sendTelegramMessage({ chatId, text: "Введи корректный Telegram ID продавца." });
          return true;
        }
        conversationState.set(chatId, {
          kind: "seller.create.name",
          adminUserId: state.adminUserId,
          telegramId,
        });
        await sendTelegramMessage({ chatId, text: "Теперь отправь имя продавца." });
        return true;
      }

      case "seller.create.name": {
        const fullName = text.trim();
        if (fullName.length < 2) {
          await sendTelegramMessage({ chatId, text: "Имя слишком короткое. Попробуй еще раз." });
          return true;
        }

        conversationState.set(chatId, {
          kind: "seller.create.store",
          adminUserId: state.adminUserId,
          telegramId: state.telegramId,
          fullName,
        });

        const stores = await getAdminStores();
        await sendTelegramMessage({
          chatId,
          text: "Выбери магазин для продавца или оставь без назначения.",
          replyMarkup: {
            inline_keyboard: [
              ...stores.stores
                .filter((store) => store.isActive)
                .map((store) => [{ text: store.name, callback_data: `pick:store:${store.id}` }]),
              [{ text: "Без магазина", callback_data: "pick:store:none" }],
            ],
          },
        });
        return true;
      }

      case "seller.rename": {
        const fullName = text.trim();
        if (fullName.length < 2) {
          await sendTelegramMessage({ chatId, text: "Имя слишком короткое. Попробуй еще раз." });
          return true;
        }
        await updateSeller(state.sellerId, { fullName });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Имя продавца обновлено." });
        await renderAdminSellerDetails(chatId, state.sellerId);
        return true;
      }

      case "store.create.name": {
        const name = text.trim();
        if (name.length < 2) {
          await sendTelegramMessage({ chatId, text: "Название слишком короткое. Попробуй еще раз." });
          return true;
        }
        conversationState.set(chatId, { kind: "store.create.address", name });
        await sendTelegramMessage({ chatId, text: "Теперь отправь адрес магазина или '-' если без адреса." });
        return true;
      }

      case "store.create.address": {
        const address = text.trim() === "-" ? null : text.trim();
        await createStore({ name: state.name, address });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Магазин создан." });
        await renderAdminStores(chatId);
        return true;
      }

      case "store.rename": {
        const name = text.trim();
        if (name.length < 2) {
          await sendTelegramMessage({ chatId, text: "Название слишком короткое. Попробуй еще раз." });
          return true;
        }
        await updateStore(state.storeId, { name });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Название магазина обновлено." });
        await renderAdminStoreDetails(chatId, state.storeId);
        return true;
      }

      case "store.address": {
        const address = text.trim() === "-" ? null : text.trim();
        await updateStore(state.storeId, { address });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Адрес магазина обновлен." });
        await renderAdminStoreDetails(chatId, state.storeId);
        return true;
      }

      case "product.create.name": {
        const name = text.trim();
        if (name.length < 2) {
          await sendTelegramMessage({ chatId, text: "Название слишком короткое. Попробуй еще раз." });
          return true;
        }
        conversationState.set(chatId, { kind: "product.create.sku", name });
        await sendTelegramMessage({ chatId, text: "Теперь отправь SKU товара." });
        return true;
      }

      case "product.create.sku": {
        const sku = text.trim();
        if (sku.length < 2) {
          await sendTelegramMessage({ chatId, text: "SKU слишком короткий. Попробуй еще раз." });
          return true;
        }
        conversationState.set(chatId, { kind: "product.create.price", name: state.name, sku });
        await sendTelegramMessage({ chatId, text: "Теперь отправь цену, например 29.90" });
        return true;
      }

      case "product.create.price": {
        const defaultPrice = parsePrice(text);
        if (defaultPrice === null) {
          await sendTelegramMessage({ chatId, text: "Некорректная цена. Попробуй еще раз." });
          return true;
        }
        await createProduct({
          name: state.name,
          sku: state.sku,
          defaultPrice,
        });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Товар создан." });
        await renderAdminProducts(chatId);
        return true;
      }

      case "product.rename": {
        const name = text.trim();
        if (name.length < 2) {
          await sendTelegramMessage({ chatId, text: "Название слишком короткое. Попробуй еще раз." });
          return true;
        }
        await updateProduct(state.productId, { name });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Название товара обновлено." });
        await renderAdminProductDetails(chatId, state.productId);
        return true;
      }

      case "product.sku": {
        const sku = text.trim();
        if (sku.length < 2) {
          await sendTelegramMessage({ chatId, text: "SKU слишком короткий. Попробуй еще раз." });
          return true;
        }
        await updateProduct(state.productId, { sku });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "SKU обновлен." });
        await renderAdminProductDetails(chatId, state.productId);
        return true;
      }

      case "product.price": {
        const defaultPrice = parsePrice(text);
        if (defaultPrice === null) {
          await sendTelegramMessage({ chatId, text: "Некорректная цена. Попробуй еще раз." });
          return true;
        }
        await updateProduct(state.productId, { defaultPrice });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Цена обновлена." });
        await renderAdminProductDetails(chatId, state.productId);
        return true;
      }

      default:
        return false;
    }
  }

  async function handleCallback(callback: TelegramCallbackQuery) {
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;
    const data = callback.data;

    if (!chatId || !messageId || !data) {
      return;
    }

    const user = await resolveUser(callback.from.id);
    await answerTelegramCallbackQuery({ callbackQueryId: callback.id }).catch(() => undefined);

    if (!user || !user.is_active) {
      await handleDenied(chatId, messageId);
      return;
    }

    if (data === "home") {
      conversationState.delete(chatId);
      await showHome(chatId, user, messageId);
      return;
    }

    if (user.role === "seller") {
      if (data === "seller:shift") {
        await renderSellerShift(chatId, user, messageId);
        return;
      }
      if (data === "seller:last-shift") {
        await renderSellerLastShift(chatId, user, messageId);
        return;
      }
      await showHome(chatId, user, messageId);
      return;
    }

    if (data === "admin:dashboard") {
      conversationState.delete(chatId);
      await renderAdminDashboard(chatId, messageId);
      return;
    }
    if (data === "admin:sellers") {
      conversationState.delete(chatId);
      await renderAdminSellers(chatId, messageId);
      return;
    }
    if (data === "admin:seller:new") {
      conversationState.set(chatId, { kind: "seller.create.telegram", adminUserId: user.id });
      await sendOrEditMessage({
        chatId,
        messageId,
        text: `<b>Новый продавец</b>\n\nОтправь Telegram ID нового продавца.\nДля отмены напиши /cancel.`,
        replyMarkup: { inline_keyboard: [[{ text: "Назад", callback_data: "admin:sellers" }]] },
      });
      return;
    }
    if (data.startsWith("admin:seller:delete:confirm:")) {
      const sellerId = data.slice("admin:seller:delete:confirm:".length);
      await deleteSeller(sellerId);
      await sendTelegramMessage({ chatId, text: "Продавец удален." });
      await renderAdminSellers(chatId);
      return;
    }
    if (data.startsWith("admin:seller:delete:")) {
      await renderAdminSellerDeleteConfirm(chatId, data.slice("admin:seller:delete:".length), messageId);
      return;
    }
    if (data.startsWith("admin:seller:rename:")) {
      const sellerId = data.slice("admin:seller:rename:".length);
      conversationState.set(chatId, { kind: "seller.rename", sellerId });
      await sendOrEditMessage({
        chatId,
        messageId,
        text: `<b>Переименование продавца</b>\n\nОтправь новое имя.\nДля отмены напиши /cancel.`,
        replyMarkup: { inline_keyboard: [[{ text: "Назад", callback_data: `admin:seller:${sellerId}` }]] },
      });
      return;
    }
    if (data.startsWith("admin:seller:assign:")) {
      const sellerId = data.slice("admin:seller:assign:".length);
      conversationState.set(chatId, { kind: "seller.assign.store", adminUserId: user.id, sellerId });
      await renderAssignStorePicker(chatId, sellerId, messageId);
      return;
    }
    if (data.startsWith("admin:seller:toggle:")) {
      const sellerId = data.slice("admin:seller:toggle:".length);
      const staff = await getAdminStaff();
      const seller = staff.sellers.find((item) => item.id === sellerId);
      if (!seller) {
        throw new HttpError(404, "Seller not found");
      }
      await updateSeller(sellerId, { isActive: !seller.isActive });
      await renderAdminSellerDetails(chatId, sellerId, messageId);
      return;
    }
    if (data.startsWith("admin:seller:")) {
      await renderAdminSellerDetails(chatId, data.slice("admin:seller:".length), messageId);
      return;
    }

    if (data === "admin:stores") {
      conversationState.delete(chatId);
      await renderAdminStores(chatId, messageId);
      return;
    }
    if (data === "admin:store:new") {
      conversationState.set(chatId, { kind: "store.create.name" });
      await sendOrEditMessage({
        chatId,
        messageId,
        text: `<b>Новый магазин</b>\n\nОтправь название магазина.\nДля отмены напиши /cancel.`,
        replyMarkup: { inline_keyboard: [[{ text: "Назад", callback_data: "admin:stores" }]] },
      });
      return;
    }
    if (data.startsWith("admin:store:delete:confirm:")) {
      const storeId = data.slice("admin:store:delete:confirm:".length);
      await deleteStore(storeId);
      await sendTelegramMessage({ chatId, text: "Магазин удален." });
      await renderAdminStores(chatId);
      return;
    }
    if (data.startsWith("admin:store:delete:")) {
      await renderAdminStoreDeleteConfirm(chatId, data.slice("admin:store:delete:".length), messageId);
      return;
    }
    if (data.startsWith("admin:store:rename:")) {
      const storeId = data.slice("admin:store:rename:".length);
      conversationState.set(chatId, { kind: "store.rename", storeId });
      await sendOrEditMessage({
        chatId,
        messageId,
        text: `<b>Переименование магазина</b>\n\nОтправь новое название.\nДля отмены напиши /cancel.`,
        replyMarkup: { inline_keyboard: [[{ text: "Назад", callback_data: `admin:store:${storeId}` }]] },
      });
      return;
    }
    if (data.startsWith("admin:store:address:")) {
      const storeId = data.slice("admin:store:address:".length);
      conversationState.set(chatId, { kind: "store.address", storeId });
      await sendOrEditMessage({
        chatId,
        messageId,
        text: `<b>Адрес магазина</b>\n\nОтправь новый адрес или '-' чтобы очистить.\nДля отмены напиши /cancel.`,
        replyMarkup: { inline_keyboard: [[{ text: "Назад", callback_data: `admin:store:${storeId}` }]] },
      });
      return;
    }
    if (data.startsWith("admin:store:toggle:")) {
      const storeId = data.slice("admin:store:toggle:".length);
      const stores = await getAdminStores();
      const store = stores.stores.find((item) => item.id === storeId);
      if (!store) {
        throw new HttpError(404, "Store not found");
      }
      await updateStore(storeId, { isActive: !store.isActive });
      await renderAdminStoreDetails(chatId, storeId, messageId);
      return;
    }
    if (data.startsWith("admin:store:")) {
      await renderAdminStoreDetails(chatId, data.slice("admin:store:".length), messageId);
      return;
    }

    if (data === "admin:products") {
      conversationState.delete(chatId);
      await renderAdminProducts(chatId, messageId);
      return;
    }
    if (data === "admin:product:new") {
      conversationState.set(chatId, { kind: "product.create.name" });
      await sendOrEditMessage({
        chatId,
        messageId,
        text: `<b>Новый товар</b>\n\nОтправь название товара.\nДля отмены напиши /cancel.`,
        replyMarkup: { inline_keyboard: [[{ text: "Назад", callback_data: "admin:products" }]] },
      });
      return;
    }
    if (data.startsWith("admin:product:delete:confirm:")) {
      const productId = data.slice("admin:product:delete:confirm:".length);
      await deleteProduct(productId);
      await sendTelegramMessage({ chatId, text: "Товар удален." });
      await renderAdminProducts(chatId);
      return;
    }
    if (data.startsWith("admin:product:delete:")) {
      await renderAdminProductDeleteConfirm(chatId, data.slice("admin:product:delete:".length), messageId);
      return;
    }
    if (data.startsWith("admin:product:rename:")) {
      const productId = data.slice("admin:product:rename:".length);
      conversationState.set(chatId, { kind: "product.rename", productId });
      await sendOrEditMessage({
        chatId,
        messageId,
        text: `<b>Переименование товара</b>\n\nОтправь новое название.\nДля отмены напиши /cancel.`,
        replyMarkup: { inline_keyboard: [[{ text: "Назад", callback_data: `admin:product:${productId}` }]] },
      });
      return;
    }
    if (data.startsWith("admin:product:sku:")) {
      const productId = data.slice("admin:product:sku:".length);
      conversationState.set(chatId, { kind: "product.sku", productId });
      await sendOrEditMessage({
        chatId,
        messageId,
        text: `<b>Изменение SKU</b>\n\nОтправь новый SKU.\nДля отмены напиши /cancel.`,
        replyMarkup: { inline_keyboard: [[{ text: "Назад", callback_data: `admin:product:${productId}` }]] },
      });
      return;
    }
    if (data.startsWith("admin:product:price:")) {
      const productId = data.slice("admin:product:price:".length);
      conversationState.set(chatId, { kind: "product.price", productId });
      await sendOrEditMessage({
        chatId,
        messageId,
        text: `<b>Изменение цены</b>\n\nОтправь новую цену, например 29.90.\nДля отмены напиши /cancel.`,
        replyMarkup: { inline_keyboard: [[{ text: "Назад", callback_data: `admin:product:${productId}` }]] },
      });
      return;
    }
    if (data.startsWith("admin:product:toggle:")) {
      const productId = data.slice("admin:product:toggle:".length);
      const products = await getAdminProducts({ archived: true });
      const product = products.products.find((item) => item.id === productId);
      if (!product) {
        throw new HttpError(404, "Product not found");
      }
      await updateProduct(productId, { isActive: !product.isActive });
      await renderAdminProductDetails(chatId, productId, messageId);
      return;
    }
    if (data.startsWith("admin:product:archive:")) {
      const productId = data.slice("admin:product:archive:".length);
      const products = await getAdminProducts({ archived: true });
      const product = products.products.find((item) => item.id === productId);
      if (!product) {
        throw new HttpError(404, "Product not found");
      }
      if (product.isArchived) {
        await restoreProduct(productId);
      } else {
        await archiveProduct(productId);
      }
      await renderAdminProductDetails(chatId, productId, messageId);
      return;
    }
    if (data.startsWith("admin:product:restore:")) {
      const productId = data.slice("admin:product:restore:".length);
      await restoreProduct(productId);
      await renderAdminProductDetails(chatId, productId, messageId);
      return;
    }
    if (data.startsWith("admin:product:")) {
      await renderAdminProductDetails(chatId, data.slice("admin:product:".length), messageId);
      return;
    }

    if (data.startsWith("pick:store:")) {
      const selectedStoreId = data.slice("pick:store:".length);
      const state = conversationState.get(chatId);

      if (state?.kind === "seller.create.store") {
        const result = await createSeller({
          adminUserId: state.adminUserId,
          fullName: state.fullName,
          telegramId: state.telegramId,
          storeId: selectedStoreId === "none" ? undefined : selectedStoreId,
        });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: `Продавец ${result.seller.fullName} создан.` });
        await renderAdminSellerDetails(chatId, result.seller.id);
        return;
      }

      if (state?.kind === "seller.assign.store") {
        if (selectedStoreId !== "none") {
          await assignSellerToStore({
            adminUserId: state.adminUserId,
            sellerUserId: state.sellerId,
            storeId: selectedStoreId,
          });
          conversationState.delete(chatId);
          await sendTelegramMessage({ chatId, text: "Магазин для продавца обновлен." });
          await renderAdminSellerDetails(chatId, state.sellerId);
          return;
        }
      }
    }

    await showHome(chatId, user, messageId);
  }

  async function handleMessage(message: TelegramMessage) {
    const chatId = message.chat?.id;
    const telegramId = message.from?.id;
    const chatType = message.chat?.type;
    const text = message.text?.trim();

    if (!chatId || !telegramId || !text || (chatType && chatType !== "private")) {
      return;
    }

    const user = await resolveUser(telegramId);
    if (!user || !user.is_active) {
      await handleDenied(chatId);
      return;
    }

    const handledByState = await handleTextState(chatId, user, text);
    if (handledByState) {
      return;
    }

    if (text === "/start" || text === "/menu") {
      conversationState.delete(chatId);
      await showHome(chatId, user);
      return;
    }

    await sendTelegramMessage({
      chatId,
      text: "Напиши /menu чтобы открыть доступные действия.",
    });
  }

  async function processUpdate(update: TelegramUpdate) {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return;
    }

    if (update.message) {
      await handleMessage(update.message);
    }
  }

  async function pollLoop() {
    await telegramRequest("deleteWebhook", { drop_pending_updates: false }).catch(() => undefined);

    while (!stopped) {
      try {
        const updates = await telegramRequest<TelegramUpdate[]>("getUpdates", {
          offset,
          timeout: 25,
          allowed_updates: ["message", "callback_query"],
        });

        for (const update of updates) {
          if (stopped) {
            return;
          }

          offset = update.update_id + 1;

          try {
            await processUpdate(update);
          } catch (error) {
            console.error("Telegram bot update failed", error);
            const callbackId = update.callback_query?.id;
            if (callbackId) {
              await answerTelegramCallbackQuery({
                callbackQueryId: callbackId,
                text:
                  error instanceof HttpError
                    ? error.message
                    : "Не удалось выполнить действие. Попробуй еще раз.",
                showAlert: true,
              }).catch(() => undefined);
            }
          }
        }
      } catch (error) {
        console.error("Telegram bot polling failed", error);
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
    }
  }

  void pollLoop();

  return {
    dispose() {
      stopped = true;
    },
  };
}
