import { env } from "../config.js";

export type TelegramInlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

export async function telegramRequest<T>(method: string, body?: Record<string, unknown>) {
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

export async function sendTelegramMessage(input: {
  chatId: string | number;
  text: string;
  parseMode?: "HTML";
  disableNotification?: boolean;
  disableWebPagePreview?: boolean;
  replyMarkup?: TelegramInlineKeyboardMarkup;
}) {
  return telegramRequest("sendMessage", {
    chat_id: input.chatId,
    text: input.text,
    parse_mode: input.parseMode,
    disable_notification: input.disableNotification,
    disable_web_page_preview: input.disableWebPagePreview ?? true,
    reply_markup: input.replyMarkup,
  });
}

export async function editTelegramMessage(input: {
  chatId: string | number;
  messageId: number;
  text: string;
  parseMode?: "HTML";
  replyMarkup?: TelegramInlineKeyboardMarkup;
}) {
  return telegramRequest("editMessageText", {
    chat_id: input.chatId,
    message_id: input.messageId,
    text: input.text,
    parse_mode: input.parseMode,
    disable_web_page_preview: true,
    reply_markup: input.replyMarkup,
  });
}

export async function answerTelegramCallbackQuery(input: {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}) {
  return telegramRequest("answerCallbackQuery", {
    callback_query_id: input.callbackQueryId,
    text: input.text,
    show_alert: input.showAlert ?? false,
  });
}
