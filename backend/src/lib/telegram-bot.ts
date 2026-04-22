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
  getAdminSalesPeriodSummaries,
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

type TelegramSentMessage = {
  message_id: number;
};

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

function combineKeyboards(
  ...rows: Array<TelegramInlineKeyboardMarkup | null | undefined>
): TelegramInlineKeyboardMarkup | undefined {
  const inline_keyboard = rows.flatMap((item) => item?.inline_keyboard ?? []);
  return inline_keyboard.length > 0 ? { inline_keyboard } : undefined;
}

function buildSingleColumnPicker(options: Array<{ text: string; callbackData: string }>, backCallback: string) {
  return {
    inline_keyboard: [
      ...options.map((option) => [{ text: option.text, callback_data: option.callbackData }]),
      [{ text: "Назад", callback_data: backCallback }],
    ],
  } satisfies TelegramInlineKeyboardMarkup;
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
      return input.messageId;
    } catch {
      // Fall through to sending a fresh message if editing is no longer possible.
    }
  }

  const message = (await sendTelegramMessage({
    chatId: input.chatId,
    text: input.text,
    parseMode: "HTML",
    replyMarkup: input.replyMarkup,
  })) as TelegramSentMessage;

  return message.message_id;
}

function buildAccessDeniedText() {
  return [
    `<b>Access denied</b>`,
    "",
    "Этот чат не подключен к разрешенному рабочему пространству.",
  ].join("\n");
}

function buildBotMenuRemovedText(user: AppUser) {
  if (user.role === "admin") {
    return [
      `<b>${escapeHtml(user.full_name)}</b>`,
      `<b>Роль:</b> администратор`,
      "",
      "Панель управления в боте временно снята с публикации.",
      "Мы заново проектируем этот сценарий, чтобы сделать его аккуратнее.",
      "",
      "Mini App по-прежнему доступен через кнопку открытия приложения в Telegram.",
    ].join("\n");
  }

  return [
    `<b>${escapeHtml(user.full_name)}</b>`,
    `<b>Роль:</b> продавец`,
    "",
    "Меню действий в боте временно снято с публикации.",
    "Мы заново проектируем этот сценарий, чтобы сделать его аккуратнее.",
    "",
    "Mini App по-прежнему доступен через кнопку открытия приложения в Telegram.",
  ].join("\n");
}

async function renderBotMenuRemoved(chatId: number, user: AppUser, messageId?: number) {
  return sendOrEditMessage({
    chatId,
    messageId,
    text: buildBotMenuRemovedText(user),
  });
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

  return sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Статус смены", callback_data: "seller:shift" }],
        [{ text: "Отчет по последней смене", callback_data: "seller:last-shift" }],
        [{ text: "Свернуть", callback_data: "home" }],
        [{ text: "Обновить", callback_data: "home" }],
      ],
    },
  });
}

async function renderCompactHome(chatId: number, user: AppUser, messageId?: number) {
  if (user.role === "admin") {
    const dashboard = await getAdminDashboard({
      recentSalesLimit: 1,
      lowStockLimit: 1,
    });

    return sendOrEditMessage({
      chatId,
      messageId,
      text: [
        `<b>${escapeHtml(user.full_name)}</b>`,
        `<b>Роль:</b> администратор`,
        `<b>Выручка сегодня:</b> ${escapeHtml(formatCurrency(dashboard.summary.totalRevenueToday))}`,
        `<b>Продажи сегодня:</b> ${dashboard.summary.completedSalesToday}`,
        "",
        "Панель управления свернута. Открой её одной кнопкой ниже.",
      ].join("\n"),
      replyMarkup: {
        inline_keyboard: [[{ text: "Открыть панель", callback_data: "admin:menu" }]],
      },
    });
  }

  const [shiftState, assignment] = await Promise.all([
    getShiftState(user.id),
    findCurrentAssignment(user.id),
  ]);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: [
      `<b>${escapeHtml(user.full_name)}</b>`,
      `<b>Роль:</b> продавец`,
      `<b>Магазин:</b> ${escapeHtml(assignment?.store_name ?? "Не назначен")}`,
      `<b>Смена:</b> ${shiftState.activeShift ? "открыта" : "закрыта"}`,
      "",
      "Меню действий свернуто. Открой его одной кнопкой ниже.",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [[{ text: "Открыть меню", callback_data: "seller:menu" }]],
    },
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

  return sendOrEditMessage({
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

  return sendOrEditMessage({
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

  return sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "Сводка", callback_data: "admin:dashboard" },
          { text: "Отчеты", callback_data: "admin:reports" },
        ],
        [
          { text: "Продавцы", callback_data: "admin:sellers" },
          { text: "Магазины", callback_data: "admin:stores" },
        ],
        [{ text: "Товары", callback_data: "admin:products" }],
        [{ text: "Свернуть", callback_data: "home" }],
      ],
    },
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

  return sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: {
      inline_keyboard: [[{ text: "Назад", callback_data: "home" }]],
    },
  });
}

async function renderAdminSellers(chatId: number, messageId?: number) {
  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Продавцы</b>\n\nСначала выбери действие, потом конкретного продавца.`,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "Добавить", callback_data: "admin:sellers:new" },
          { text: "Переименовать", callback_data: "admin:sellers:pick:rename" },
        ],
        [
          { text: "Назначить магазин", callback_data: "admin:sellers:pick:assign" },
          { text: "Вкл / выкл", callback_data: "admin:sellers:pick:toggle" },
        ],
        [{ text: "Удалить", callback_data: "admin:sellers:pick:delete" }],
        [{ text: "Назад", callback_data: "home" }],
      ],
    },
  });
}

async function renderAdminSellerActionPicker(
  chatId: number,
  action: "rename" | "assign" | "toggle" | "delete",
  messageId?: number
) {
  const staff = await getAdminStaff();
  const actionLabelMap = {
    rename: "Кого переименовать",
    assign: "Кому назначить магазин",
    toggle: "Кого включить или выключить",
    delete: "Кого удалить",
  } as const;
  const callbackPrefixMap = {
    rename: "admin:sellers:rename:",
    assign: "admin:sellers:assign:",
    toggle: "admin:sellers:toggle:",
    delete: "admin:sellers:delete:",
  } as const;

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Продавцы</b>\n\n${actionLabelMap[action]}?`,
    replyMarkup: buildSingleColumnPicker(
      staff.sellers.map((seller, index) => ({
        text: `${index + 1}. ${seller.fullName}${seller.isActive ? "" : " • off"}`,
        callbackData: `${callbackPrefixMap[action]}${seller.id}`,
      })),
      "admin:sellers"
    ),
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

  return sendOrEditMessage({
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

async function renderAdminSellerDeleteConfirm(
  chatId: number,
  sellerId: string,
  messageId?: number,
  options?: { confirmCallback?: string; backCallback?: string }
) {
  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Удалить продавца?</b>\n\nЭто действие необратимо, если у продавца нет операционной истории.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Да, удалить", callback_data: options?.confirmCallback ?? `admin:seller:delete:confirm:${sellerId}` }],
        [{ text: "Назад", callback_data: options?.backCallback ?? `admin:seller:${sellerId}` }],
      ],
    },
  });
}

async function renderAssignStorePicker(
  chatId: number,
  sellerId: string,
  messageId?: number,
  backCallback = `admin:seller:${sellerId}`
) {
  const stores = await getAdminStores();
  const storeRows = stores.stores
    .filter((store) => store.isActive)
    .map((store) => [{ text: store.name, callback_data: `pick:store:${store.id}` }]);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Выбери магазин для продавца</b>`,
    replyMarkup: {
      inline_keyboard: [...storeRows, [{ text: "Назад", callback_data: backCallback }]],
    },
  });
}

async function renderAdminStores(chatId: number, messageId?: number) {
  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Магазины</b>\n\nСначала выбери действие, потом конкретный магазин.`,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "Добавить", callback_data: "admin:stores:new" },
          { text: "Переименовать", callback_data: "admin:stores:pick:rename" },
        ],
        [
          { text: "Изменить адрес", callback_data: "admin:stores:pick:address" },
          { text: "Вкл / выкл", callback_data: "admin:stores:pick:toggle" },
        ],
        [{ text: "Удалить", callback_data: "admin:stores:pick:delete" }],
        [{ text: "Назад", callback_data: "home" }],
      ],
    },
  });
}

async function renderAdminStoreActionPicker(
  chatId: number,
  action: "rename" | "address" | "toggle" | "delete",
  messageId?: number
) {
  const stores = await getAdminStores();
  const actionLabelMap = {
    rename: "Какой магазин переименовать",
    address: "У какого магазина изменить адрес",
    toggle: "Какой магазин включить или выключить",
    delete: "Какой магазин удалить",
  } as const;
  const callbackPrefixMap = {
    rename: "admin:stores:rename:",
    address: "admin:stores:address:",
    toggle: "admin:stores:toggle:",
    delete: "admin:stores:delete:",
  } as const;

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Магазины</b>\n\n${actionLabelMap[action]}?`,
    replyMarkup: buildSingleColumnPicker(
      stores.stores.map((store, index) => ({
        text: `${index + 1}. ${store.name}${store.isActive ? "" : " • off"}`,
        callbackData: `${callbackPrefixMap[action]}${store.id}`,
      })),
      "admin:stores"
    ),
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

  return sendOrEditMessage({
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

async function renderAdminStoreDeleteConfirm(
  chatId: number,
  storeId: string,
  messageId?: number,
  options?: { confirmCallback?: string; backCallback?: string }
) {
  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Удалить магазин?</b>\n\nУдаление возможно только если у магазина нет операционной истории.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Да, удалить", callback_data: options?.confirmCallback ?? `admin:store:delete:confirm:${storeId}` }],
        [{ text: "Назад", callback_data: options?.backCallback ?? `admin:store:${storeId}` }],
      ],
    },
  });
}

async function renderAdminProducts(chatId: number, messageId?: number) {
  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Товары</b>\n\nСначала выбери действие, потом конкретный товар.`,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "Добавить", callback_data: "admin:products:new" },
          { text: "Переименовать", callback_data: "admin:products:pick:rename" },
        ],
        [
          { text: "Изменить SKU", callback_data: "admin:products:pick:sku" },
          { text: "Изменить цену", callback_data: "admin:products:pick:price" },
        ],
        [
          { text: "Вкл / выкл", callback_data: "admin:products:pick:toggle" },
          { text: "Архив", callback_data: "admin:products:pick:archive" },
        ],
        [{ text: "Удалить", callback_data: "admin:products:pick:delete" }],
        [{ text: "Назад", callback_data: "home" }],
      ],
    },
  });
}

async function renderAdminProductActionPicker(
  chatId: number,
  action: "rename" | "sku" | "price" | "toggle" | "archive" | "delete",
  messageId?: number
) {
  const products = await getAdminProducts({ archived: true });
  const actionLabelMap = {
    rename: "Какой товар переименовать",
    sku: "У какого товара изменить SKU",
    price: "У какого товара изменить цену",
    toggle: "Какой товар включить или выключить",
    archive: "Какой товар архивировать или восстановить",
    delete: "Какой товар удалить",
  } as const;
  const callbackPrefixMap = {
    rename: "admin:products:rename:",
    sku: "admin:products:sku:",
    price: "admin:products:price:",
    toggle: "admin:products:toggle:",
    archive: "admin:products:archive:",
    delete: "admin:products:delete:",
  } as const;

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Товары</b>\n\n${actionLabelMap[action]}?`,
    replyMarkup: buildSingleColumnPicker(
      products.products.map((product, index) => ({
        text: `${index + 1}. ${product.name}${product.isActive ? "" : " • off"}${product.isArchived ? " • archived" : ""}`,
        callbackData: `${callbackPrefixMap[action]}${product.id}`,
      })),
      "admin:products"
    ),
  });
}

async function renderAdminToggleConfirm(
  chatId: number,
  input: {
    title: string;
    itemName: string;
    enabled: boolean;
    confirmCallback: string;
    backCallback: string;
  },
  messageId?: number
) {
  const nextLabel = input.enabled ? "выключить" : "включить";

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>${escapeHtml(input.title)}</b>\n\n${escapeHtml(input.itemName)}: ${nextLabel}?`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: `Да, ${nextLabel}`, callback_data: input.confirmCallback }],
        [{ text: "Назад", callback_data: input.backCallback }],
      ],
    },
  });
}

async function renderAdminReportsMenu(chatId: number, messageId?: number) {
  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Отчеты</b>\n\nВыбери период для быстрой сводки. PDF добавим следующим шагом, когда утвердим структуру.`,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "Сегодня", callback_data: "admin:reports:today" },
          { text: "Неделя", callback_data: "admin:reports:week" },
        ],
        [{ text: "Месяц", callback_data: "admin:reports:month" }],
        [{ text: "Назад", callback_data: "admin:menu" }],
      ],
    },
  });
}

async function renderAdminReportPeriod(chatId: number, period: "today" | "week" | "month", messageId?: number) {
  const summaries = await getAdminSalesPeriodSummaries();
  const summary = summaries[period];
  const labelMap = {
    today: "Сегодня",
    week: "За неделю",
    month: "За месяц",
  } as const;

  return sendOrEditMessage({
    chatId,
    messageId,
    text: [
      `<b>Отчет: ${labelMap[period]}</b>`,
      `<b>Выручка:</b> ${escapeHtml(formatCurrency(summary.revenue))}`,
      `<b>Продажи:</b> ${summary.salesCount}`,
      `<b>Наличные:</b> ${escapeHtml(formatCurrency(summary.cashTotal))}`,
      `<b>Карта:</b> ${escapeHtml(formatCurrency(summary.cardTotal))}`,
      `<b>Возвраты:</b> ${summary.returnsCount}`,
      `<b>Сумма возвратов:</b> ${escapeHtml(formatCurrency(summary.returnsTotal))}`,
      `<b>Возвращено единиц:</b> ${summary.returnedUnits}`,
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [[{ text: "Назад", callback_data: "admin:reports" }]],
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

  return sendOrEditMessage({
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

async function renderAdminProductDeleteConfirm(
  chatId: number,
  productId: string,
  messageId?: number,
  options?: { confirmCallback?: string; backCallback?: string }
) {
  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Удалить товар?</b>\n\nУдаление возможно только пока у товара нет истории продаж и движения склада.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Да, удалить", callback_data: options?.confirmCallback ?? `admin:product:delete:confirm:${productId}` }],
        [{ text: "Назад", callback_data: options?.backCallback ?? `admin:product:${productId}` }],
      ],
    },
  });
}

async function showHome(chatId: number, user: AppUser, messageId?: number) {
  if (!user.is_active) {
    return sendOrEditMessage({
      chatId,
      messageId,
      text: buildAccessDeniedText(),
    });
  }

  return renderBotMenuRemoved(chatId, user, messageId);
}

export function startTelegramBot() {
  const conversationState = new Map<number, BotConversationState>();
  const lastUiMessageByChat = new Map<number, number>();
  let stopped = false;
  let offset = 0;

  async function handleDenied(chatId: number, messageId?: number) {
    conversationState.delete(chatId);
    const renderedMessageId = await sendOrEditMessage({
      chatId,
      messageId,
      text: buildAccessDeniedText(),
    });
    if (renderedMessageId) {
      lastUiMessageByChat.set(chatId, renderedMessageId);
    }
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
      const renderedMessageId = await showHome(chatId, user, lastUiMessageByChat.get(chatId));
      if (renderedMessageId) {
        lastUiMessageByChat.set(chatId, renderedMessageId);
      }
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
        await renderAdminSellers(chatId);
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
        await renderAdminStores(chatId);
        return true;
      }

      case "store.address": {
        const address = text.trim() === "-" ? null : text.trim();
        await updateStore(state.storeId, { address });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Адрес магазина обновлен." });
        await renderAdminStores(chatId);
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
        await renderAdminProducts(chatId);
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
        await renderAdminProducts(chatId);
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
        await renderAdminProducts(chatId);
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
    conversationState.delete(chatId);
    await renderBotMenuRemoved(chatId, user, messageId);
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
      const renderedMessageId = await renderBotMenuRemoved(chatId, user, lastUiMessageByChat.get(chatId));
      if (renderedMessageId) {
        lastUiMessageByChat.set(chatId, renderedMessageId);
      }
      return;
    }

    await sendTelegramMessage({
      chatId,
      text: "Напиши /menu, чтобы открыть текущее состояние бота.",
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
