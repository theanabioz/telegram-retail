import { env } from "../config.js";
import {
  answerTelegramCallbackQuery,
  editTelegramMessage,
  sendTelegramMessage,
  telegramRequest,
  type TelegramInlineKeyboardMarkup,
  type TelegramReplyMarkup,
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
  getAdminSalesOverview,
  getAdminStaff,
  getAdminStores,
  restoreProduct,
  updateProduct,
  updateSeller,
  updateStore,
} from "../modules/admin/admin.service.js";
import { getBusinessDayRange } from "./business-time.js";

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

type ReportPreset = "today" | "yesterday";

const LIST_PAGE_SIZE = 8;
const ADMIN_ENTRY_BUTTON = "⚙️ Админ";
const ADMIN_COMMAND_HELP_LINES = [
  "/addshop - добавить магазин",
  "/addseller - добавить продавца",
  "/addproduct - добавить товар",
  "/editshop - выбрать магазин для редактирования",
  "/editseller - выбрать продавца для редактирования",
  "/editproduct - выбрать товар для редактирования",
  "/deleteshop - выбрать магазин для удаления",
  "/deleteseller - выбрать продавца для удаления",
  "/deleteproduct - выбрать товар для удаления",
  "/reports - отчеты за рабочий день",
  "/cancel - отменить текущее действие",
] as const;

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
    timeZone: env.APP_TIME_ZONE,
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

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: env.APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function clampPage(page: number, totalItems: number) {
  const lastPage = Math.max(0, Math.ceil(totalItems / LIST_PAGE_SIZE) - 1);
  return Math.min(Math.max(page, 0), lastPage);
}

function paginateItems<T>(items: T[], page: number) {
  const safePage = clampPage(page, items.length);
  const start = safePage * LIST_PAGE_SIZE;

  return {
    page: safePage,
    totalPages: Math.max(1, Math.ceil(items.length / LIST_PAGE_SIZE)),
    items: items.slice(start, start + LIST_PAGE_SIZE),
  };
}

function buildPaginationRows(input: {
  currentPage: number;
  totalPages: number;
  previousCallback: string;
  nextCallback: string;
}) {
  if (input.totalPages <= 1) {
    return [] as TelegramInlineKeyboardMarkup["inline_keyboard"];
  }

  return [
    [
      { text: "←", callback_data: input.previousCallback },
      { text: `Стр. ${input.currentPage + 1}/${input.totalPages}`, callback_data: "noop" },
      { text: "→", callback_data: input.nextCallback },
    ],
  ] satisfies TelegramInlineKeyboardMarkup["inline_keyboard"];
}

function getReportRange(preset: ReportPreset) {
  if (preset === "today") {
    return {
      label: "Сегодня",
      ...getBusinessDayRange(),
    };
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    label: "Вчера",
    ...getBusinessDayRange(yesterday),
  };
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

function buildAdminEntryKeyboard(): TelegramReplyMarkup {
  return {
    keyboard: [[{ text: ADMIN_ENTRY_BUTTON }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

async function syncPersistentKeyboard(chatId: number, user: AppUser) {
  if (user.role === "admin") {
    await sendTelegramMessage({
      chatId,
      text: "Админ-клавиатура скрыта. Используй slash-команды, когда нужно.",
      replyMarkup: { remove_keyboard: true },
      disableNotification: true,
    });
    return;
  }

  await sendTelegramMessage({
    chatId,
    text: "Быстрая админ-кнопка отключена для этого чата.",
    replyMarkup: { remove_keyboard: true },
    disableNotification: true,
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
      "Панель скрыта. Используй /admin для списка команд или сразу запускай нужный сценарий slash-командой.",
    ].join("\n"),
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
    "<b>Скрытый админ-режим</b>",
    ...ADMIN_COMMAND_HELP_LINES.map((line) => escapeHtml(line)),
  ].join("\n");

  return sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Отчеты", callback_data: "admin:reports" }],
        [{ text: "Сводка", callback_data: "admin:dashboard" }],
        [{ text: "Скрыть", callback_data: "home" }],
      ],
    },
  });
}

async function renderCommandOnlyAdminHelp(chatId: number, user: AppUser, messageId?: number) {
  return renderAdminMenu(chatId, user, messageId);
}

async function renderStoreCommandEditPicker(chatId: number, page: number, messageId?: number) {
  const stores = await getAdminStores();
  const paginated = paginateItems(stores.stores, page);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>/editshop</b>\n\nВыбери магазин для редактирования.`,
    replyMarkup: {
      inline_keyboard: [
        ...paginated.items.map((store) => [
          {
            text: `${store.name}${store.isActive ? "" : " • off"}`,
            callback_data: `cmd:editshop:view:${store.id}:${paginated.page}`,
          },
        ]),
        ...buildPaginationRows({
          currentPage: paginated.page,
          totalPages: paginated.totalPages,
          previousCallback: `cmd:editshop:list:${Math.max(0, paginated.page - 1)}`,
          nextCallback: `cmd:editshop:list:${Math.min(paginated.totalPages - 1, paginated.page + 1)}`,
        }),
        [{ text: "Скрыть", callback_data: "home" }],
      ],
    },
  });
}

async function renderSellerCommandEditPicker(chatId: number, page: number, messageId?: number) {
  const staff = await getAdminStaff();
  const paginated = paginateItems(staff.sellers, page);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>/editseller</b>\n\nВыбери продавца для редактирования.`,
    replyMarkup: {
      inline_keyboard: [
        ...paginated.items.map((seller) => [
          {
            text: `${seller.fullName}${seller.isActive ? "" : " • off"}${
              seller.currentAssignment ? ` • ${seller.currentAssignment.storeName}` : ""
            }`,
            callback_data: `cmd:editseller:view:${seller.id}:${paginated.page}`,
          },
        ]),
        ...buildPaginationRows({
          currentPage: paginated.page,
          totalPages: paginated.totalPages,
          previousCallback: `cmd:editseller:list:${Math.max(0, paginated.page - 1)}`,
          nextCallback: `cmd:editseller:list:${Math.min(paginated.totalPages - 1, paginated.page + 1)}`,
        }),
        [{ text: "Скрыть", callback_data: "home" }],
      ],
    },
  });
}

async function renderProductCommandEditPicker(chatId: number, page: number, messageId?: number) {
  const products = await getAdminProducts({ archived: true });
  const paginated = paginateItems(products.products, page);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>/editproduct</b>\n\nВыбери товар для редактирования.`,
    replyMarkup: {
      inline_keyboard: [
        ...paginated.items.map((product) => [
          {
            text: `${product.name}${product.isActive ? "" : " • off"}${product.isArchived ? " • archived" : ""}`,
            callback_data: `cmd:editproduct:view:${product.id}:${paginated.page}`,
          },
        ]),
        ...buildPaginationRows({
          currentPage: paginated.page,
          totalPages: paginated.totalPages,
          previousCallback: `cmd:editproduct:list:${Math.max(0, paginated.page - 1)}`,
          nextCallback: `cmd:editproduct:list:${Math.min(paginated.totalPages - 1, paginated.page + 1)}`,
        }),
        [{ text: "Скрыть", callback_data: "home" }],
      ],
    },
  });
}

async function renderStoreCommandDeletePicker(chatId: number, page: number, messageId?: number) {
  const stores = await getAdminStores();
  const paginated = paginateItems(stores.stores, page);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>/deleteshop</b>\n\nВыбери магазин для удаления.`,
    replyMarkup: {
      inline_keyboard: [
        ...paginated.items.map((store) => [
          {
            text: `${store.name}${store.isActive ? "" : " • off"}`,
            callback_data: `cmd:deleteshop:confirm:${store.id}:${paginated.page}`,
          },
        ]),
        ...buildPaginationRows({
          currentPage: paginated.page,
          totalPages: paginated.totalPages,
          previousCallback: `cmd:deleteshop:list:${Math.max(0, paginated.page - 1)}`,
          nextCallback: `cmd:deleteshop:list:${Math.min(paginated.totalPages - 1, paginated.page + 1)}`,
        }),
        [{ text: "Скрыть", callback_data: "home" }],
      ],
    },
  });
}

async function renderSellerCommandDeletePicker(chatId: number, page: number, messageId?: number) {
  const staff = await getAdminStaff();
  const paginated = paginateItems(staff.sellers, page);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>/deleteseller</b>\n\nВыбери продавца для удаления.`,
    replyMarkup: {
      inline_keyboard: [
        ...paginated.items.map((seller) => [
          {
            text: `${seller.fullName}${seller.isActive ? "" : " • off"}`,
            callback_data: `cmd:deleteseller:confirm:${seller.id}:${paginated.page}`,
          },
        ]),
        ...buildPaginationRows({
          currentPage: paginated.page,
          totalPages: paginated.totalPages,
          previousCallback: `cmd:deleteseller:list:${Math.max(0, paginated.page - 1)}`,
          nextCallback: `cmd:deleteseller:list:${Math.min(paginated.totalPages - 1, paginated.page + 1)}`,
        }),
        [{ text: "Скрыть", callback_data: "home" }],
      ],
    },
  });
}

async function renderProductCommandDeletePicker(chatId: number, page: number, messageId?: number) {
  const products = await getAdminProducts({ archived: true });
  const paginated = paginateItems(products.products, page);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>/deleteproduct</b>\n\nВыбери товар для удаления.`,
    replyMarkup: {
      inline_keyboard: [
        ...paginated.items.map((product) => [
          {
            text: `${product.name}${product.isActive ? "" : " • off"}${product.isArchived ? " • archived" : ""}`,
            callback_data: `cmd:deleteproduct:confirm:${product.id}:${paginated.page}`,
          },
        ]),
        ...buildPaginationRows({
          currentPage: paginated.page,
          totalPages: paginated.totalPages,
          previousCallback: `cmd:deleteproduct:list:${Math.max(0, paginated.page - 1)}`,
          nextCallback: `cmd:deleteproduct:list:${Math.min(paginated.totalPages - 1, paginated.page + 1)}`,
        }),
        [{ text: "Скрыть", callback_data: "home" }],
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
    text: `<b>Продавцы</b>\n\nРедкие операции лучше держать в одном скрываемом разделе. Выбери, что нужно сделать.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Добавить продавца", callback_data: "admin:sellers:new" }],
        [{ text: "Список продавцов", callback_data: "admin:sellers:list:0" }],
        [{ text: "Назад", callback_data: "admin:menu" }],
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

async function renderAdminSellerDetails(
  chatId: number,
  sellerId: string,
  messageId?: number,
  options?: { backCallback?: string }
) {
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
        [{ text: "Назад", callback_data: options?.backCallback ?? "admin:sellers" }],
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
    text: `<b>Магазины</b>\n\nУправление магазинами вынесено в отдельный раздел, чтобы меню не мешало в повседневной работе.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Создать магазин", callback_data: "admin:stores:new" }],
        [{ text: "Список магазинов", callback_data: "admin:stores:list:0" }],
        [{ text: "Назад", callback_data: "admin:menu" }],
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

async function renderAdminStoreDetails(
  chatId: number,
  storeId: string,
  messageId?: number,
  options?: { backCallback?: string }
) {
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
        [{ text: "Назад", callback_data: options?.backCallback ?? "admin:stores" }],
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
    text: `<b>Товары</b>\n\nЗдесь собраны создание, редактирование, активация и архивирование товаров.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Создать товар", callback_data: "admin:products:new" }],
        [{ text: "Список товаров", callback_data: "admin:products:list:0" }],
        [{ text: "Назад", callback_data: "admin:menu" }],
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
    text: `<b>Отчеты</b>\n\nВыбери, какой отчет за рабочий день нужен.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "По магазину", callback_data: "admin:reports:workday:store" }],
        [{ text: "По сотруднику", callback_data: "admin:reports:workday:seller" }],
        [{ text: "Сводный PDF", callback_data: "admin:reports:workday:summary" }],
        [{ text: "Назад", callback_data: "admin:menu" }],
      ],
    },
  });
}

async function renderAdminWorkdayDatePicker(
  chatId: number,
  target: "store" | "seller" | "summary",
  messageId?: number
) {
  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Отчеты за рабочий день</b>\n\nВыбери дату для сценария "${target === "store" ? "по магазину" : target === "seller" ? "по сотруднику" : "сводный PDF"}".`,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "Сегодня", callback_data: `admin:reports:workday:${target}:today` },
          { text: "Вчера", callback_data: `admin:reports:workday:${target}:yesterday` },
        ],
        [{ text: "Назад", callback_data: "admin:reports" }],
      ],
    },
  });
}

async function renderAdminProductDetails(
  chatId: number,
  productId: string,
  messageId?: number,
  options?: { backCallback?: string }
) {
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
        [{ text: "Назад", callback_data: options?.backCallback ?? "admin:products" }],
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

async function renderAdminStoresList(chatId: number, page: number, messageId?: number) {
  const stores = await getAdminStores();
  const paginated = paginateItems(stores.stores, page);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Список магазинов</b>\n\nВыбери магазин для просмотра карточки и действий.`,
    replyMarkup: {
      inline_keyboard: [
        ...paginated.items.map((store) => [
          {
            text: `${store.name}${store.isActive ? "" : " • off"}`,
            callback_data: `admin:store:view:${store.id}:${paginated.page}`,
          },
        ]),
        ...buildPaginationRows({
          currentPage: paginated.page,
          totalPages: paginated.totalPages,
          previousCallback: `admin:stores:list:${Math.max(0, paginated.page - 1)}`,
          nextCallback: `admin:stores:list:${Math.min(paginated.totalPages - 1, paginated.page + 1)}`,
        }),
        [{ text: "Назад", callback_data: "admin:stores" }],
      ],
    },
  });
}

async function renderAdminSellersList(chatId: number, page: number, messageId?: number) {
  const staff = await getAdminStaff();
  const paginated = paginateItems(staff.sellers, page);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Список продавцов</b>\n\nВыбери сотрудника, чтобы открыть карточку.`,
    replyMarkup: {
      inline_keyboard: [
        ...paginated.items.map((seller) => [
          {
            text: `${seller.fullName}${seller.isActive ? "" : " • off"}${
              seller.currentAssignment ? ` • ${seller.currentAssignment.storeName}` : ""
            }`,
            callback_data: `admin:seller:view:${seller.id}:${paginated.page}`,
          },
        ]),
        ...buildPaginationRows({
          currentPage: paginated.page,
          totalPages: paginated.totalPages,
          previousCallback: `admin:sellers:list:${Math.max(0, paginated.page - 1)}`,
          nextCallback: `admin:sellers:list:${Math.min(paginated.totalPages - 1, paginated.page + 1)}`,
        }),
        [{ text: "Назад", callback_data: "admin:sellers" }],
      ],
    },
  });
}

async function renderAdminProductsList(chatId: number, page: number, messageId?: number) {
  const products = await getAdminProducts({ archived: true });
  const paginated = paginateItems(products.products, page);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Список товаров</b>\n\nВыбери товар, чтобы открыть карточку.`,
    replyMarkup: {
      inline_keyboard: [
        ...paginated.items.map((product) => [
          {
            text: `${product.name}${product.isActive ? "" : " • off"}${product.isArchived ? " • archived" : ""}`,
            callback_data: `admin:product:view:${product.id}:${paginated.page}`,
          },
        ]),
        ...buildPaginationRows({
          currentPage: paginated.page,
          totalPages: paginated.totalPages,
          previousCallback: `admin:products:list:${Math.max(0, paginated.page - 1)}`,
          nextCallback: `admin:products:list:${Math.min(paginated.totalPages - 1, paginated.page + 1)}`,
        }),
        [{ text: "Назад", callback_data: "admin:products" }],
      ],
    },
  });
}

async function renderAdminStoreReportPicker(
  chatId: number,
  preset: ReportPreset,
  page: number,
  messageId?: number
) {
  const stores = await getAdminStores();
  const paginated = paginateItems(stores.stores.filter((store) => store.isActive), page);
  const range = getReportRange(preset);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Отчет по магазину</b>\n\nДата: ${range.label}. Выбери магазин.`,
    replyMarkup: {
      inline_keyboard: [
        ...paginated.items.map((store) => [
          {
            text: store.name,
            callback_data: `admin:reports:store:run:${preset}:${store.id}`,
          },
        ]),
        ...buildPaginationRows({
          currentPage: paginated.page,
          totalPages: paginated.totalPages,
          previousCallback: `admin:reports:workday:store:${preset}:${Math.max(0, paginated.page - 1)}`,
          nextCallback: `admin:reports:workday:store:${preset}:${Math.min(paginated.totalPages - 1, paginated.page + 1)}`,
        }),
        [{ text: "Назад", callback_data: "admin:reports:workday:store" }],
      ],
    },
  });
}

async function renderAdminSellerReportPicker(
  chatId: number,
  preset: ReportPreset,
  page: number,
  messageId?: number
) {
  const staff = await getAdminStaff();
  const paginated = paginateItems(staff.sellers.filter((seller) => seller.isActive), page);
  const range = getReportRange(preset);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: `<b>Отчет по сотруднику</b>\n\nДата: ${range.label}. Выбери продавца.`,
    replyMarkup: {
      inline_keyboard: [
        ...paginated.items.map((seller) => [
          {
            text: `${seller.fullName}${seller.currentAssignment ? ` • ${seller.currentAssignment.storeName}` : ""}`,
            callback_data: `admin:reports:seller:run:${preset}:${seller.id}`,
          },
        ]),
        ...buildPaginationRows({
          currentPage: paginated.page,
          totalPages: paginated.totalPages,
          previousCallback: `admin:reports:workday:seller:${preset}:${Math.max(0, paginated.page - 1)}`,
          nextCallback: `admin:reports:workday:seller:${preset}:${Math.min(paginated.totalPages - 1, paginated.page + 1)}`,
        }),
        [{ text: "Назад", callback_data: "admin:reports:workday:seller" }],
      ],
    },
  });
}

async function renderAdminStoreWorkdayReport(
  chatId: number,
  preset: ReportPreset,
  storeId: string,
  messageId?: number
) {
  const range = getReportRange(preset);
  const [stores, overview] = await Promise.all([
    getAdminStores(),
    getAdminSalesOverview({
      storeId,
      saleStatus: "all",
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      limit: 200,
    }),
  ]);
  const store = stores.stores.find((item) => item.id === storeId);

  if (!store) {
    throw new HttpError(404, "Store not found");
  }

  return sendOrEditMessage({
    chatId,
    messageId,
    text: [
      `<b>Отчет по магазину</b>`,
      `<b>Магазин:</b> ${escapeHtml(store.name)}`,
      `<b>Дата:</b> ${range.label} (${escapeHtml(formatDate(range.dateFrom))})`,
      "",
      `<b>Выручка:</b> ${escapeHtml(formatCurrency(overview.summary.revenue))}`,
      `<b>Продажи:</b> ${overview.summary.salesCount}`,
      `<b>Наличные:</b> ${escapeHtml(formatCurrency(overview.summary.cashTotal))}`,
      `<b>Карта:</b> ${escapeHtml(formatCurrency(overview.summary.cardTotal))}`,
      `<b>Возвраты:</b> ${overview.summary.returnsCount}`,
      `<b>Сумма возвратов:</b> ${escapeHtml(formatCurrency(overview.summary.returnsTotal))}`,
      `<b>Возвращено единиц:</b> ${overview.summary.returnedUnits}`,
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Заказать еще", callback_data: "admin:reports:workday:store" }],
        [{ text: "Назад к отчетам", callback_data: "admin:reports" }],
      ],
    },
  });
}

async function renderAdminSellerWorkdayReport(
  chatId: number,
  preset: ReportPreset,
  sellerId: string,
  messageId?: number
) {
  const range = getReportRange(preset);
  const [staff, overview] = await Promise.all([
    getAdminStaff(),
    getAdminSalesOverview({
      sellerId,
      saleStatus: "all",
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      limit: 200,
    }),
  ]);
  const seller = staff.sellers.find((item) => item.id === sellerId);

  if (!seller) {
    throw new HttpError(404, "Seller not found");
  }

  return sendOrEditMessage({
    chatId,
    messageId,
    text: [
      `<b>Отчет по сотруднику</b>`,
      `<b>Сотрудник:</b> ${escapeHtml(seller.fullName)}`,
      `<b>Магазин:</b> ${escapeHtml(seller.currentAssignment?.storeName ?? "Не назначен")}`,
      `<b>Дата:</b> ${range.label} (${escapeHtml(formatDate(range.dateFrom))})`,
      "",
      `<b>Выручка:</b> ${escapeHtml(formatCurrency(overview.summary.revenue))}`,
      `<b>Продажи:</b> ${overview.summary.salesCount}`,
      `<b>Наличные:</b> ${escapeHtml(formatCurrency(overview.summary.cashTotal))}`,
      `<b>Карта:</b> ${escapeHtml(formatCurrency(overview.summary.cardTotal))}`,
      `<b>Возвраты:</b> ${overview.summary.returnsCount}`,
      `<b>Сумма возвратов:</b> ${escapeHtml(formatCurrency(overview.summary.returnsTotal))}`,
      `<b>Возвращено единиц:</b> ${overview.summary.returnedUnits}`,
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Заказать еще", callback_data: "admin:reports:workday:seller" }],
        [{ text: "Назад к отчетам", callback_data: "admin:reports" }],
      ],
    },
  });
}

async function renderAdminSummaryReport(chatId: number, preset: ReportPreset, messageId?: number) {
  const range = getReportRange(preset);
  const [overview, dashboard] = await Promise.all([
    getAdminSalesOverview({
      saleStatus: "all",
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      limit: 400,
    }),
    getAdminDashboard({
      recentSalesLimit: 5,
      lowStockLimit: 5,
    }),
  ]);

  return sendOrEditMessage({
    chatId,
    messageId,
    text: [
      `<b>Сводный отчет</b>`,
      `<b>Дата:</b> ${range.label} (${escapeHtml(formatDate(range.dateFrom))})`,
      "",
      `<b>Выручка:</b> ${escapeHtml(formatCurrency(overview.summary.revenue))}`,
      `<b>Продажи:</b> ${overview.summary.salesCount}`,
      `<b>Наличные:</b> ${escapeHtml(formatCurrency(overview.summary.cashTotal))}`,
      `<b>Карта:</b> ${escapeHtml(formatCurrency(overview.summary.cardTotal))}`,
      `<b>Возвраты:</b> ${overview.summary.returnsCount}`,
      `<b>Сумма возвратов:</b> ${escapeHtml(formatCurrency(overview.summary.returnsTotal))}`,
      `<b>Активные смены сейчас:</b> ${dashboard.summary.activeShifts}`,
      `<b>Низкий остаток сейчас:</b> ${dashboard.summary.lowStockCount}`,
      "",
      `PDF-экспорт будет следующим шагом. Пока даем администратору быструю текстовую сводку прямо в боте.`,
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [{ text: "Сегодня", callback_data: "admin:reports:workday:summary:today" }, { text: "Вчера", callback_data: "admin:reports:workday:summary:yesterday" }],
        [{ text: "Назад к отчетам", callback_data: "admin:reports" }],
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

  return renderCompactHome(chatId, user, messageId);
}

export function startTelegramBot() {
  const conversationState = new Map<number, BotConversationState>();
  const lastUiMessageByChat = new Map<number, number>();
  let stopped = false;
  let offset = 0;

  async function handleDenied(chatId: number, messageId?: number) {
    conversationState.delete(chatId);
    await sendTelegramMessage({
      chatId,
      text: "Клавиатура скрыта.",
      replyMarkup: { remove_keyboard: true },
      disableNotification: true,
    }).catch(() => undefined);
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
        await renderAdminSellerDetails(chatId, state.sellerId, lastUiMessageByChat.get(chatId), {
          backCallback: "admin:menu",
        });
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
        const created = await createStore({ name: state.name, address });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Магазин создан." });
        await renderAdminStoreDetails(chatId, created.store.id, lastUiMessageByChat.get(chatId), {
          backCallback: "admin:menu",
        });
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
        await renderAdminStoreDetails(chatId, state.storeId, lastUiMessageByChat.get(chatId), {
          backCallback: "admin:menu",
        });
        return true;
      }

      case "store.address": {
        const address = text.trim() === "-" ? null : text.trim();
        await updateStore(state.storeId, { address });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Адрес магазина обновлен." });
        await renderAdminStoreDetails(chatId, state.storeId, lastUiMessageByChat.get(chatId), {
          backCallback: "admin:menu",
        });
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
        const created = await createProduct({
          name: state.name,
          sku: state.sku,
          defaultPrice,
        });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Товар создан." });
        await renderAdminProductDetails(chatId, created.product.id, lastUiMessageByChat.get(chatId), {
          backCallback: "admin:menu",
        });
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
        await renderAdminProductDetails(chatId, state.productId, lastUiMessageByChat.get(chatId), {
          backCallback: "admin:menu",
        });
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
        await renderAdminProductDetails(chatId, state.productId, lastUiMessageByChat.get(chatId), {
          backCallback: "admin:menu",
        });
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
        await renderAdminProductDetails(chatId, state.productId, lastUiMessageByChat.get(chatId), {
          backCallback: "admin:menu",
        });
        return true;
      }

      default:
        return false;
    }
  }

  async function startAdminCommand(chatId: number, user: AppUser, command: string) {
    const messageId = lastUiMessageByChat.get(chatId);

    switch (command) {
      case "/admin":
      case "/menu":
        return renderCommandOnlyAdminHelp(chatId, user, messageId);
      case "/reports":
        return renderAdminReportsMenu(chatId, messageId);
      case "/addshop":
        conversationState.set(chatId, { kind: "store.create.name" });
        return sendOrEditMessage({
          chatId,
          messageId,
          text: `<b>/addshop</b>\n\nОтправь название нового магазина следующим сообщением.\n\nДля отмены используй /cancel.`,
        });
      case "/addseller":
        conversationState.set(chatId, { kind: "seller.create.telegram", adminUserId: user.id });
        return sendOrEditMessage({
          chatId,
          messageId,
          text: `<b>/addseller</b>\n\nСначала отправь Telegram ID сотрудника.\n\nДля отмены используй /cancel.`,
        });
      case "/addproduct":
        conversationState.set(chatId, { kind: "product.create.name" });
        return sendOrEditMessage({
          chatId,
          messageId,
          text: `<b>/addproduct</b>\n\nОтправь название товара следующим сообщением.\n\nДля отмены используй /cancel.`,
        });
      case "/editshop":
        return renderStoreCommandEditPicker(chatId, 0, messageId);
      case "/editseller":
        return renderSellerCommandEditPicker(chatId, 0, messageId);
      case "/editproduct":
        return renderProductCommandEditPicker(chatId, 0, messageId);
      case "/deleteshop":
        return renderStoreCommandDeletePicker(chatId, 0, messageId);
      case "/deleteseller":
        return renderSellerCommandDeletePicker(chatId, 0, messageId);
      case "/deleteproduct":
        return renderProductCommandDeletePicker(chatId, 0, messageId);
      default:
        return undefined;
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

    if (data === "noop") {
      return;
    }

    const state = conversationState.get(chatId);
    const renderAndRemember = async (renderedMessageIdPromise: Promise<number | undefined>) => {
      const renderedMessageId = await renderedMessageIdPromise;
      if (renderedMessageId) {
        lastUiMessageByChat.set(chatId, renderedMessageId);
      }
    };

    if (data.startsWith("pick:store:")) {
      if (state?.kind === "seller.create.store") {
        const storeId = data === "pick:store:none" ? undefined : data.slice("pick:store:".length);
        const created = await createSeller({
          adminUserId: state.adminUserId,
          fullName: state.fullName,
          telegramId: state.telegramId,
          storeId,
        });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Продавец создан." });
        await renderAndRemember(
          renderAdminSellerDetails(chatId, created.seller.id, messageId, {
            backCallback: "admin:menu",
          })
        );
        return;
      }

      if (state?.kind === "seller.assign.store") {
        if (data === "pick:store:none") {
          throw new HttpError(409, "Для переназначения нужно выбрать конкретный магазин");
        }
        await assignSellerToStore({
          adminUserId: state.adminUserId,
          sellerUserId: state.sellerId,
          storeId: data.slice("pick:store:".length),
        });
        conversationState.delete(chatId);
        await sendTelegramMessage({ chatId, text: "Магазин для продавца обновлен." });
        await renderAndRemember(renderAdminSellerDetails(chatId, state.sellerId, messageId));
        return;
      }
    }

    conversationState.delete(chatId);

    if (data === "home") {
      await renderAndRemember(showHome(chatId, user, messageId));
      return;
    }

    if (data === "seller:menu") {
      await renderAndRemember(renderSellerMenu(chatId, user, messageId));
      return;
    }

    if (data === "seller:shift") {
      await renderAndRemember(renderSellerShift(chatId, user, messageId));
      return;
    }

    if (data === "seller:last-shift") {
      await renderAndRemember(renderSellerLastShift(chatId, user, messageId));
      return;
    }

    if (user.role !== "admin") {
      await renderAndRemember(showHome(chatId, user, messageId));
      return;
    }

    if (data === "admin:menu") {
      await renderAndRemember(renderAdminMenu(chatId, user, messageId));
      return;
    }

    let match = data.match(/^cmd:editshop:list:(\d+)$/);
    if (match) {
      await renderAndRemember(renderStoreCommandEditPicker(chatId, Number.parseInt(match[1] ?? "0", 10), messageId));
      return;
    }

    match = data.match(/^cmd:editshop:view:([^:]+):(\d+)$/);
    if (match) {
      await renderAndRemember(
        renderAdminStoreDetails(chatId, match[1], messageId, {
          backCallback: `cmd:editshop:list:${match[2]}`,
        })
      );
      return;
    }

    match = data.match(/^cmd:editseller:list:(\d+)$/);
    if (match) {
      await renderAndRemember(renderSellerCommandEditPicker(chatId, Number.parseInt(match[1] ?? "0", 10), messageId));
      return;
    }

    match = data.match(/^cmd:editseller:view:([^:]+):(\d+)$/);
    if (match) {
      await renderAndRemember(
        renderAdminSellerDetails(chatId, match[1], messageId, {
          backCallback: `cmd:editseller:list:${match[2]}`,
        })
      );
      return;
    }

    match = data.match(/^cmd:editproduct:list:(\d+)$/);
    if (match) {
      await renderAndRemember(renderProductCommandEditPicker(chatId, Number.parseInt(match[1] ?? "0", 10), messageId));
      return;
    }

    match = data.match(/^cmd:editproduct:view:([^:]+):(\d+)$/);
    if (match) {
      await renderAndRemember(
        renderAdminProductDetails(chatId, match[1], messageId, {
          backCallback: `cmd:editproduct:list:${match[2]}`,
        })
      );
      return;
    }

    match = data.match(/^cmd:deleteshop:list:(\d+)$/);
    if (match) {
      await renderAndRemember(renderStoreCommandDeletePicker(chatId, Number.parseInt(match[1] ?? "0", 10), messageId));
      return;
    }

    match = data.match(/^cmd:deleteshop:confirm:([^:]+):(\d+)$/);
    if (match) {
      const storeId = match[1];
      const page = match[2];
      await renderAndRemember(
        renderAdminStoreDeleteConfirm(chatId, storeId, messageId, {
          confirmCallback: `cmd:deleteshop:run:${storeId}:${page}`,
          backCallback: `cmd:deleteshop:list:${page}`,
        })
      );
      return;
    }

    match = data.match(/^cmd:deleteshop:run:([^:]+):(\d+)$/);
    if (match) {
      await deleteStore(match[1]);
      await sendTelegramMessage({ chatId, text: "Магазин удален." });
      await renderAndRemember(renderStoreCommandDeletePicker(chatId, Number.parseInt(match[2] ?? "0", 10), messageId));
      return;
    }

    match = data.match(/^cmd:deleteseller:list:(\d+)$/);
    if (match) {
      await renderAndRemember(renderSellerCommandDeletePicker(chatId, Number.parseInt(match[1] ?? "0", 10), messageId));
      return;
    }

    match = data.match(/^cmd:deleteseller:confirm:([^:]+):(\d+)$/);
    if (match) {
      const sellerId = match[1];
      const page = match[2];
      await renderAndRemember(
        renderAdminSellerDeleteConfirm(chatId, sellerId, messageId, {
          confirmCallback: `cmd:deleteseller:run:${sellerId}:${page}`,
          backCallback: `cmd:deleteseller:list:${page}`,
        })
      );
      return;
    }

    match = data.match(/^cmd:deleteseller:run:([^:]+):(\d+)$/);
    if (match) {
      await deleteSeller(match[1]);
      await sendTelegramMessage({ chatId, text: "Продавец удален." });
      await renderAndRemember(renderSellerCommandDeletePicker(chatId, Number.parseInt(match[2] ?? "0", 10), messageId));
      return;
    }

    match = data.match(/^cmd:deleteproduct:list:(\d+)$/);
    if (match) {
      await renderAndRemember(renderProductCommandDeletePicker(chatId, Number.parseInt(match[1] ?? "0", 10), messageId));
      return;
    }

    match = data.match(/^cmd:deleteproduct:confirm:([^:]+):(\d+)$/);
    if (match) {
      const productId = match[1];
      const page = match[2];
      await renderAndRemember(
        renderAdminProductDeleteConfirm(chatId, productId, messageId, {
          confirmCallback: `cmd:deleteproduct:run:${productId}:${page}`,
          backCallback: `cmd:deleteproduct:list:${page}`,
        })
      );
      return;
    }

    match = data.match(/^cmd:deleteproduct:run:([^:]+):(\d+)$/);
    if (match) {
      await deleteProduct(match[1]);
      await sendTelegramMessage({ chatId, text: "Товар удален." });
      await renderAndRemember(renderProductCommandDeletePicker(chatId, Number.parseInt(match[2] ?? "0", 10), messageId));
      return;
    }

    if (data === "admin:dashboard") {
      await renderAndRemember(renderAdminDashboard(chatId, messageId));
      return;
    }

    if (data === "admin:stores") {
      await renderAndRemember(renderAdminStores(chatId, messageId));
      return;
    }

    if (data === "admin:sellers") {
      await renderAndRemember(renderAdminSellers(chatId, messageId));
      return;
    }

    if (data === "admin:products") {
      await renderAndRemember(renderAdminProducts(chatId, messageId));
      return;
    }

    if (data === "admin:reports") {
      await renderAndRemember(renderAdminReportsMenu(chatId, messageId));
      return;
    }

    if (data === "admin:stores:new") {
      conversationState.set(chatId, { kind: "store.create.name" });
      await renderAndRemember(
        sendOrEditMessage({
          chatId,
          messageId,
          text: `<b>Создание магазина</b>\n\nОтправь название магазина следующим сообщением.\n\nДля отмены используй /cancel.`,
        })
      );
      return;
    }

    if (data === "admin:sellers:new") {
      conversationState.set(chatId, { kind: "seller.create.telegram", adminUserId: user.id });
      await renderAndRemember(
        sendOrEditMessage({
          chatId,
          messageId,
          text: `<b>Добавление продавца</b>\n\nСначала отправь Telegram ID сотрудника.\n\nДля отмены используй /cancel.`,
        })
      );
      return;
    }

    if (data === "admin:products:new") {
      conversationState.set(chatId, { kind: "product.create.name" });
      await renderAndRemember(
        sendOrEditMessage({
          chatId,
          messageId,
          text: `<b>Создание товара</b>\n\nОтправь название товара следующим сообщением.\n\nДля отмены используй /cancel.`,
        })
      );
      return;
    }

    match = data.match(/^admin:stores:list:(\d+)$/);
    if (match) {
      await renderAndRemember(renderAdminStoresList(chatId, Number.parseInt(match[1] ?? "0", 10), messageId));
      return;
    }

    match = data.match(/^admin:sellers:list:(\d+)$/);
    if (match) {
      await renderAndRemember(renderAdminSellersList(chatId, Number.parseInt(match[1] ?? "0", 10), messageId));
      return;
    }

    match = data.match(/^admin:products:list:(\d+)$/);
    if (match) {
      await renderAndRemember(renderAdminProductsList(chatId, Number.parseInt(match[1] ?? "0", 10), messageId));
      return;
    }

    match = data.match(/^admin:store:view:([^:]+):(\d+)$/);
    if (match) {
      await renderAndRemember(
        renderAdminStoreDetails(chatId, match[1], messageId, {
          backCallback: `admin:stores:list:${match[2]}`,
        })
      );
      return;
    }

    match = data.match(/^admin:seller:view:([^:]+):(\d+)$/);
    if (match) {
      await renderAndRemember(
        renderAdminSellerDetails(chatId, match[1], messageId, {
          backCallback: `admin:sellers:list:${match[2]}`,
        })
      );
      return;
    }

    match = data.match(/^admin:product:view:([^:]+):(\d+)$/);
    if (match) {
      await renderAndRemember(
        renderAdminProductDetails(chatId, match[1], messageId, {
          backCallback: `admin:products:list:${match[2]}`,
        })
      );
      return;
    }

    if (data === "admin:reports:workday:store") {
      await renderAndRemember(renderAdminWorkdayDatePicker(chatId, "store", messageId));
      return;
    }

    if (data === "admin:reports:workday:seller") {
      await renderAndRemember(renderAdminWorkdayDatePicker(chatId, "seller", messageId));
      return;
    }

    if (data === "admin:reports:workday:summary") {
      await renderAndRemember(renderAdminWorkdayDatePicker(chatId, "summary", messageId));
      return;
    }

    match = data.match(/^admin:reports:workday:store:(today|yesterday)(?::(\d+))?$/);
    if (match) {
      await renderAndRemember(
        renderAdminStoreReportPicker(chatId, match[1] as ReportPreset, Number.parseInt(match[2] ?? "0", 10), messageId)
      );
      return;
    }

    match = data.match(/^admin:reports:workday:seller:(today|yesterday)(?::(\d+))?$/);
    if (match) {
      await renderAndRemember(
        renderAdminSellerReportPicker(chatId, match[1] as ReportPreset, Number.parseInt(match[2] ?? "0", 10), messageId)
      );
      return;
    }

    match = data.match(/^admin:reports:workday:summary:(today|yesterday)$/);
    if (match) {
      await renderAndRemember(renderAdminSummaryReport(chatId, match[1] as ReportPreset, messageId));
      return;
    }

    match = data.match(/^admin:reports:store:run:(today|yesterday):([^:]+)$/);
    if (match) {
      await renderAndRemember(renderAdminStoreWorkdayReport(chatId, match[1] as ReportPreset, match[2], messageId));
      return;
    }

    match = data.match(/^admin:reports:seller:run:(today|yesterday):([^:]+)$/);
    if (match) {
      await renderAndRemember(renderAdminSellerWorkdayReport(chatId, match[1] as ReportPreset, match[2], messageId));
      return;
    }

    if (data === "admin:sellers:pick:rename") {
      await renderAndRemember(renderAdminSellerActionPicker(chatId, "rename", messageId));
      return;
    }

    if (data === "admin:sellers:pick:assign") {
      await renderAndRemember(renderAdminSellerActionPicker(chatId, "assign", messageId));
      return;
    }

    if (data === "admin:sellers:pick:toggle") {
      await renderAndRemember(renderAdminSellerActionPicker(chatId, "toggle", messageId));
      return;
    }

    if (data === "admin:sellers:pick:delete") {
      await renderAndRemember(renderAdminSellerActionPicker(chatId, "delete", messageId));
      return;
    }

    if (data === "admin:stores:pick:rename") {
      await renderAndRemember(renderAdminStoreActionPicker(chatId, "rename", messageId));
      return;
    }

    if (data === "admin:stores:pick:address") {
      await renderAndRemember(renderAdminStoreActionPicker(chatId, "address", messageId));
      return;
    }

    if (data === "admin:stores:pick:toggle") {
      await renderAndRemember(renderAdminStoreActionPicker(chatId, "toggle", messageId));
      return;
    }

    if (data === "admin:stores:pick:delete") {
      await renderAndRemember(renderAdminStoreActionPicker(chatId, "delete", messageId));
      return;
    }

    if (data === "admin:products:pick:rename") {
      await renderAndRemember(renderAdminProductActionPicker(chatId, "rename", messageId));
      return;
    }

    if (data === "admin:products:pick:sku") {
      await renderAndRemember(renderAdminProductActionPicker(chatId, "sku", messageId));
      return;
    }

    if (data === "admin:products:pick:price") {
      await renderAndRemember(renderAdminProductActionPicker(chatId, "price", messageId));
      return;
    }

    if (data === "admin:products:pick:toggle") {
      await renderAndRemember(renderAdminProductActionPicker(chatId, "toggle", messageId));
      return;
    }

    if (data === "admin:products:pick:archive") {
      await renderAndRemember(renderAdminProductActionPicker(chatId, "archive", messageId));
      return;
    }

    if (data === "admin:products:pick:delete") {
      await renderAndRemember(renderAdminProductActionPicker(chatId, "delete", messageId));
      return;
    }

    match = data.match(/^admin:sellers:(rename|assign|toggle|delete):([^:]+)$/);
    if (match) {
      const action = match[1];
      const sellerId = match[2];

      if (action === "rename") {
        conversationState.set(chatId, { kind: "seller.rename", sellerId });
        await renderAndRemember(
          sendOrEditMessage({
            chatId,
            messageId,
            text: `<b>Переименование продавца</b>\n\nОтправь новое имя следующим сообщением.\n\nДля отмены используй /cancel.`,
          })
        );
        return;
      }

      if (action === "assign") {
        conversationState.set(chatId, { kind: "seller.assign.store", adminUserId: user.id, sellerId });
        await renderAndRemember(renderAssignStorePicker(chatId, sellerId, messageId, "admin:sellers"));
        return;
      }

      if (action === "toggle") {
        const staff = await getAdminStaff();
        const seller = staff.sellers.find((item) => item.id === sellerId);
        if (!seller) {
          throw new HttpError(404, "Seller not found");
        }
        await renderAndRemember(
          renderAdminToggleConfirm(
            chatId,
            {
              title: "Изменение статуса продавца",
              itemName: seller.fullName,
              enabled: seller.isActive,
              confirmCallback: `admin:seller:toggle:confirm:${seller.id}`,
              backCallback: `admin:seller:${seller.id}`,
            },
            messageId
          )
        );
        return;
      }

      await renderAndRemember(
        renderAdminSellerDeleteConfirm(chatId, sellerId, messageId, {
          backCallback: "admin:sellers",
        })
      );
      return;
    }

    match = data.match(/^admin:stores:(rename|address|toggle|delete):([^:]+)$/);
    if (match) {
      const action = match[1];
      const storeId = match[2];

      if (action === "rename") {
        conversationState.set(chatId, { kind: "store.rename", storeId });
        await renderAndRemember(
          sendOrEditMessage({
            chatId,
            messageId,
            text: `<b>Переименование магазина</b>\n\nОтправь новое название следующим сообщением.\n\nДля отмены используй /cancel.`,
          })
        );
        return;
      }

      if (action === "address") {
        conversationState.set(chatId, { kind: "store.address", storeId });
        await renderAndRemember(
          sendOrEditMessage({
            chatId,
            messageId,
            text: `<b>Изменение адреса магазина</b>\n\nОтправь новый адрес или "-" чтобы очистить поле.\n\nДля отмены используй /cancel.`,
          })
        );
        return;
      }

      if (action === "toggle") {
        const stores = await getAdminStores();
        const store = stores.stores.find((item) => item.id === storeId);
        if (!store) {
          throw new HttpError(404, "Store not found");
        }
        await renderAndRemember(
          renderAdminToggleConfirm(
            chatId,
            {
              title: "Изменение статуса магазина",
              itemName: store.name,
              enabled: store.isActive,
              confirmCallback: `admin:store:toggle:confirm:${store.id}`,
              backCallback: `admin:store:${store.id}`,
            },
            messageId
          )
        );
        return;
      }

      await renderAndRemember(
        renderAdminStoreDeleteConfirm(chatId, storeId, messageId, {
          backCallback: "admin:stores",
        })
      );
      return;
    }

    match = data.match(/^admin:products:(rename|sku|price|toggle|archive|delete):([^:]+)$/);
    if (match) {
      const action = match[1];
      const productId = match[2];

      if (action === "rename") {
        conversationState.set(chatId, { kind: "product.rename", productId });
        await renderAndRemember(
          sendOrEditMessage({
            chatId,
            messageId,
            text: `<b>Переименование товара</b>\n\nОтправь новое название следующим сообщением.\n\nДля отмены используй /cancel.`,
          })
        );
        return;
      }

      if (action === "sku") {
        conversationState.set(chatId, { kind: "product.sku", productId });
        await renderAndRemember(
          sendOrEditMessage({
            chatId,
            messageId,
            text: `<b>Изменение SKU</b>\n\nОтправь новый SKU следующим сообщением.\n\nДля отмены используй /cancel.`,
          })
        );
        return;
      }

      if (action === "price") {
        conversationState.set(chatId, { kind: "product.price", productId });
        await renderAndRemember(
          sendOrEditMessage({
            chatId,
            messageId,
            text: `<b>Изменение цены</b>\n\nОтправь новую цену следующим сообщением, например 12.50.\n\nДля отмены используй /cancel.`,
          })
        );
        return;
      }

      if (action === "toggle") {
        const products = await getAdminProducts({ archived: true });
        const product = products.products.find((item) => item.id === productId);
        if (!product) {
          throw new HttpError(404, "Product not found");
        }
        await renderAndRemember(
          renderAdminToggleConfirm(
            chatId,
            {
              title: "Изменение статуса товара",
              itemName: product.name,
              enabled: product.isActive,
              confirmCallback: `admin:product:toggle:confirm:${product.id}`,
              backCallback: `admin:product:${product.id}`,
            },
            messageId
          )
        );
        return;
      }

      if (action === "archive") {
        const products = await getAdminProducts({ archived: true });
        const product = products.products.find((item) => item.id === productId);
        if (!product) {
          throw new HttpError(404, "Product not found");
        }
        if (product.isArchived) {
          await restoreProduct(productId);
          await sendTelegramMessage({ chatId, text: "Товар восстановлен из архива." });
        } else {
          await archiveProduct(productId);
          await sendTelegramMessage({ chatId, text: "Товар перенесен в архив." });
        }
        await renderAndRemember(renderAdminProductDetails(chatId, productId, messageId));
        return;
      }

      await renderAndRemember(
        renderAdminProductDeleteConfirm(chatId, productId, messageId, {
          backCallback: "admin:products",
        })
      );
      return;
    }

    match = data.match(/^admin:seller:view:([^:]+)$/);
    if (match) {
      await renderAndRemember(renderAdminSellerDetails(chatId, match[1], messageId));
      return;
    }

    match = data.match(/^admin:store:view:([^:]+)$/);
    if (match) {
      await renderAndRemember(renderAdminStoreDetails(chatId, match[1], messageId));
      return;
    }

    match = data.match(/^admin:product:view:([^:]+)$/);
    if (match) {
      await renderAndRemember(renderAdminProductDetails(chatId, match[1], messageId));
      return;
    }

    match = data.match(/^admin:seller:rename:([^:]+)$/);
    if (match) {
      conversationState.set(chatId, { kind: "seller.rename", sellerId: match[1] });
      await renderAndRemember(
        sendOrEditMessage({
          chatId,
          messageId,
          text: `<b>Переименование продавца</b>\n\nОтправь новое имя следующим сообщением.\n\nДля отмены используй /cancel.`,
        })
      );
      return;
    }

    match = data.match(/^admin:seller:assign:([^:]+)$/);
    if (match) {
      conversationState.set(chatId, { kind: "seller.assign.store", adminUserId: user.id, sellerId: match[1] });
      await renderAndRemember(renderAssignStorePicker(chatId, match[1], messageId));
      return;
    }

    match = data.match(/^admin:seller:toggle:([^:]+)$/);
    if (match) {
      const sellerId = match[1];
      const staff = await getAdminStaff();
      const seller = staff.sellers.find((item) => item.id === sellerId);
      if (!seller) {
        throw new HttpError(404, "Seller not found");
      }
      await renderAndRemember(
        renderAdminToggleConfirm(
          chatId,
          {
            title: "Изменение статуса продавца",
            itemName: seller.fullName,
            enabled: seller.isActive,
            confirmCallback: `admin:seller:toggle:confirm:${seller.id}`,
            backCallback: `admin:seller:${seller.id}`,
          },
          messageId
        )
      );
      return;
    }

    match = data.match(/^admin:seller:toggle:confirm:([^:]+)$/);
    if (match) {
      const sellerId = match[1];
      const staff = await getAdminStaff();
      const seller = staff.sellers.find((item) => item.id === sellerId);
      if (!seller) {
        throw new HttpError(404, "Seller not found");
      }
      await updateSeller(seller.id, { isActive: !seller.isActive });
      await sendTelegramMessage({ chatId, text: seller.isActive ? "Продавец выключен." : "Продавец включен." });
      await renderAndRemember(renderAdminSellerDetails(chatId, seller.id, messageId));
      return;
    }

    match = data.match(/^admin:seller:delete:confirm:([^:]+)$/);
    if (match) {
      await deleteSeller(match[1]);
      await sendTelegramMessage({ chatId, text: "Продавец удален." });
      await renderAndRemember(renderAdminSellersList(chatId, 0, messageId));
      return;
    }

    match = data.match(/^admin:seller:delete:([^:]+)$/);
    if (match) {
      await renderAndRemember(renderAdminSellerDeleteConfirm(chatId, match[1], messageId));
      return;
    }

    match = data.match(/^admin:store:rename:([^:]+)$/);
    if (match) {
      conversationState.set(chatId, { kind: "store.rename", storeId: match[1] });
      await renderAndRemember(
        sendOrEditMessage({
          chatId,
          messageId,
          text: `<b>Переименование магазина</b>\n\nОтправь новое название следующим сообщением.\n\nДля отмены используй /cancel.`,
        })
      );
      return;
    }

    match = data.match(/^admin:store:address:([^:]+)$/);
    if (match) {
      conversationState.set(chatId, { kind: "store.address", storeId: match[1] });
      await renderAndRemember(
        sendOrEditMessage({
          chatId,
          messageId,
          text: `<b>Изменение адреса магазина</b>\n\nОтправь новый адрес или "-" чтобы очистить поле.\n\nДля отмены используй /cancel.`,
        })
      );
      return;
    }

    match = data.match(/^admin:store:toggle:([^:]+)$/);
    if (match) {
      const storeId = match[1];
      const stores = await getAdminStores();
      const store = stores.stores.find((item) => item.id === storeId);
      if (!store) {
        throw new HttpError(404, "Store not found");
      }
      await renderAndRemember(
        renderAdminToggleConfirm(
          chatId,
          {
            title: "Изменение статуса магазина",
            itemName: store.name,
            enabled: store.isActive,
            confirmCallback: `admin:store:toggle:confirm:${store.id}`,
            backCallback: `admin:store:${store.id}`,
          },
          messageId
        )
      );
      return;
    }

    match = data.match(/^admin:store:toggle:confirm:([^:]+)$/);
    if (match) {
      const storeId = match[1];
      const stores = await getAdminStores();
      const store = stores.stores.find((item) => item.id === storeId);
      if (!store) {
        throw new HttpError(404, "Store not found");
      }
      await updateStore(store.id, { isActive: !store.isActive });
      await sendTelegramMessage({ chatId, text: store.isActive ? "Магазин выключен." : "Магазин включен." });
      await renderAndRemember(renderAdminStoreDetails(chatId, store.id, messageId));
      return;
    }

    match = data.match(/^admin:store:delete:confirm:([^:]+)$/);
    if (match) {
      await deleteStore(match[1]);
      await sendTelegramMessage({ chatId, text: "Магазин удален." });
      await renderAndRemember(renderAdminStoresList(chatId, 0, messageId));
      return;
    }

    match = data.match(/^admin:store:delete:([^:]+)$/);
    if (match) {
      await renderAndRemember(renderAdminStoreDeleteConfirm(chatId, match[1], messageId));
      return;
    }

    match = data.match(/^admin:product:rename:([^:]+)$/);
    if (match) {
      conversationState.set(chatId, { kind: "product.rename", productId: match[1] });
      await renderAndRemember(
        sendOrEditMessage({
          chatId,
          messageId,
          text: `<b>Переименование товара</b>\n\nОтправь новое название следующим сообщением.\n\nДля отмены используй /cancel.`,
        })
      );
      return;
    }

    match = data.match(/^admin:product:sku:([^:]+)$/);
    if (match) {
      conversationState.set(chatId, { kind: "product.sku", productId: match[1] });
      await renderAndRemember(
        sendOrEditMessage({
          chatId,
          messageId,
          text: `<b>Изменение SKU</b>\n\nОтправь новый SKU следующим сообщением.\n\nДля отмены используй /cancel.`,
        })
      );
      return;
    }

    match = data.match(/^admin:product:price:([^:]+)$/);
    if (match) {
      conversationState.set(chatId, { kind: "product.price", productId: match[1] });
      await renderAndRemember(
        sendOrEditMessage({
          chatId,
          messageId,
          text: `<b>Изменение цены</b>\n\nОтправь новую цену следующим сообщением, например 12.50.\n\nДля отмены используй /cancel.`,
        })
      );
      return;
    }

    match = data.match(/^admin:product:toggle:([^:]+)$/);
    if (match) {
      const productId = match[1];
      const products = await getAdminProducts({ archived: true });
      const product = products.products.find((item) => item.id === productId);
      if (!product) {
        throw new HttpError(404, "Product not found");
      }
      await renderAndRemember(
        renderAdminToggleConfirm(
          chatId,
          {
            title: "Изменение статуса товара",
            itemName: product.name,
            enabled: product.isActive,
            confirmCallback: `admin:product:toggle:confirm:${product.id}`,
            backCallback: `admin:product:${product.id}`,
          },
          messageId
        )
      );
      return;
    }

    match = data.match(/^admin:product:toggle:confirm:([^:]+)$/);
    if (match) {
      const productId = match[1];
      const products = await getAdminProducts({ archived: true });
      const product = products.products.find((item) => item.id === productId);
      if (!product) {
        throw new HttpError(404, "Product not found");
      }
      await updateProduct(product.id, { isActive: !product.isActive });
      await sendTelegramMessage({ chatId, text: product.isActive ? "Товар выключен." : "Товар включен." });
      await renderAndRemember(renderAdminProductDetails(chatId, product.id, messageId));
      return;
    }

    match = data.match(/^admin:product:(archive|restore):([^:]+)$/);
    if (match) {
      if (match[1] === "archive") {
        await archiveProduct(match[2]);
        await sendTelegramMessage({ chatId, text: "Товар перенесен в архив." });
      } else {
        await restoreProduct(match[2]);
        await sendTelegramMessage({ chatId, text: "Товар восстановлен из архива." });
      }
      await renderAndRemember(renderAdminProductDetails(chatId, match[2], messageId));
      return;
    }

    match = data.match(/^admin:product:delete:confirm:([^:]+)$/);
    if (match) {
      await deleteProduct(match[1]);
      await sendTelegramMessage({ chatId, text: "Товар удален." });
      await renderAndRemember(renderAdminProductsList(chatId, 0, messageId));
      return;
    }

    match = data.match(/^admin:product:delete:([^:]+)$/);
    if (match) {
      await renderAndRemember(renderAdminProductDeleteConfirm(chatId, match[1], messageId));
      return;
    }

    match = data.match(/^admin:seller:([^:]+)$/);
    if (match) {
      await renderAndRemember(renderAdminSellerDetails(chatId, match[1], messageId));
      return;
    }

    match = data.match(/^admin:store:([^:]+)$/);
    if (match) {
      await renderAndRemember(renderAdminStoreDetails(chatId, match[1], messageId));
      return;
    }

    match = data.match(/^admin:product:([^:]+)$/);
    if (match) {
      await renderAndRemember(renderAdminProductDetails(chatId, match[1], messageId));
      return;
    }

    const renderedMessageId = await showHome(chatId, user, messageId);
    if (renderedMessageId) {
      lastUiMessageByChat.set(chatId, renderedMessageId);
    }
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
    conversationState.delete(chatId);
    await sendTelegramMessage({
      chatId,
      text:
        text === "/start"
          ? "Этот бот используется только для уведомлений."
          : "Управление в боте отключено. Здесь приходят только уведомления.",
      replyMarkup: { remove_keyboard: true },
      disableNotification: true,
    });
  }

  async function processUpdate(update: TelegramUpdate) {
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
          allowed_updates: ["message"],
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
