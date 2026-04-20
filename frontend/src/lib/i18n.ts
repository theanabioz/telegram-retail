import { useSyncExternalStore } from "react";

export type AppLocale = "en" | "ru" | "pt";

export const LOCALE_STORAGE_KEY = "telegram-retail-locale";

const DEFAULT_LOCALE: AppLocale = "en";

const translations = {
  en: {
    "nav.overview": "Overview",
    "nav.sales": "Sales",
    "nav.inventory": "Inventory",
    "nav.team": "Team",
    "nav.settings": "Settings",
    "nav.checkout": "Checkout",
    "nav.orders": "Orders",
    "nav.stock": "My Stock",
    "nav.shift": "Shift",
    "screen.shiftHistory": "Shift History",
    "screen.shiftReport": "Shift Report",
    "checkout.searchPlaceholder": "Search products...",
    "checkout.filters": "Filters",
    "checkout.stock": "Stock",
    "checkout.addToCart": "Add to cart",
    "draftCart.title": "Draft Cart",
    "draftCart.productsAdded": "products added",
    "draftCart.totalAmount": "Total Amount",
    "draftCart.cash": "Cash",
    "draftCart.card": "Card",
    "draftCart.addDiscount": "Add Discount",
    "draftCart.editDiscount": "Edit Discount",
    "draftCart.removeItem": "Remove item",
    "draftCart.increaseQuantity": "Increase quantity",
    "draftCart.decreaseQuantity": "Decrease quantity",
    "discount.adjustment": "Adjustment",
    "discount.fixedEur": "Fixed EUR",
    "discount.percent": "Percent %",
    "discount.value": "Discount Value",
    "discount.finalPrice": "Final Price",
    "discount.apply": "Apply Discount",
    "discount.clear": "Clear",
    "discount.remove": "Remove Discount",
    "discount.backspace": "Del",
    "orders.receipt": "Receipt",
    "orders.back": "Back",
    "orders.deletedSale": "Deleted Sale",
    "orders.completedSale": "Completed Sale",
    "orders.openReceipt": "Open receipt",
    "orders.noSales": "No sales yet",
    "orders.noSalesDescription": "Completed sales and returns will appear here.",
    "receipt.qty": "Qty",
    "receipt.discount": "Discount",
    "receipt.subtotal": "Subtotal",
    "receipt.total": "Total",
    "receipt.saleId": "Sale ID",
    "status.completed": "Completed",
    "status.deleted": "Deleted",
    "settings.language.title": "Language",
    "settings.language.description": "Choose the interface language. The app will remember it after restart.",
    "settings.session.title": "Session Info",
    "settings.session.operator": "Operator",
    "settings.session.store": "Store",
    "settings.session.mode": "Mode",
    "settings.session.device": "Device",
    "settings.session.liveMode": "Live mode",
    "settings.session.demoMode": "Demo mode",
    "settings.developerSwitch.title": "Developer Switch",
    "settings.developerSwitch.sellerDescription": "Switch between seller and admin without restarting the app.",
    "settings.developerSwitch.adminDescription": "Switch between admin and seller without restarting the app.",
    "settings.admin.title": "Admin Settings",
    "settings.admin.description":
      "Session controls and admin-side environment tools live here for now. Later we can add account preferences and support diagnostics.",
    "common.seller": "Seller",
    "common.admin": "Admin",
    "language.en": "English",
    "language.ru": "Russian",
    "language.pt": "Portuguese",
  },
  ru: {
    "nav.overview": "Обзор",
    "nav.sales": "Продажи",
    "nav.inventory": "Склад",
    "nav.team": "Команда",
    "nav.settings": "Настройки",
    "nav.checkout": "Касса",
    "nav.orders": "Заказы",
    "nav.stock": "Мой склад",
    "nav.shift": "Смена",
    "screen.shiftHistory": "История смен",
    "screen.shiftReport": "Отчет по смене",
    "checkout.searchPlaceholder": "Поиск товаров...",
    "checkout.filters": "Фильтры",
    "checkout.stock": "Остаток",
    "checkout.addToCart": "Добавить в корзину",
    "draftCart.title": "Черновая корзина",
    "draftCart.productsAdded": "товаров добавлено",
    "draftCart.totalAmount": "Итого",
    "draftCart.cash": "Наличные",
    "draftCart.card": "Карта",
    "draftCart.addDiscount": "Добавить скидку",
    "draftCart.editDiscount": "Изменить скидку",
    "draftCart.removeItem": "Удалить товар",
    "draftCart.increaseQuantity": "Увеличить количество",
    "draftCart.decreaseQuantity": "Уменьшить количество",
    "discount.adjustment": "Корректировка",
    "discount.fixedEur": "Фикс. EUR",
    "discount.percent": "Процент %",
    "discount.value": "Размер скидки",
    "discount.finalPrice": "Цена после",
    "discount.apply": "Применить скидку",
    "discount.clear": "Очистить",
    "discount.remove": "Убрать скидку",
    "discount.backspace": "Del",
    "orders.receipt": "Чек",
    "orders.back": "Назад",
    "orders.deletedSale": "Удаленная продажа",
    "orders.completedSale": "Завершенная продажа",
    "orders.openReceipt": "Открыть чек",
    "orders.noSales": "Пока нет продаж",
    "orders.noSalesDescription": "Завершенные продажи и возвраты появятся здесь.",
    "receipt.qty": "Кол-во",
    "receipt.discount": "Скидка",
    "receipt.subtotal": "Подытог",
    "receipt.total": "Итого",
    "receipt.saleId": "ID продажи",
    "status.completed": "Завершено",
    "status.deleted": "Удалено",
    "settings.language.title": "Язык",
    "settings.language.description": "Выберите язык интерфейса. Приложение запомнит его после перезапуска.",
    "settings.session.title": "Сессия",
    "settings.session.operator": "Продавец",
    "settings.session.store": "Магазин",
    "settings.session.mode": "Режим",
    "settings.session.device": "Устройство",
    "settings.session.liveMode": "Боевой режим",
    "settings.session.demoMode": "Демо режим",
    "settings.developerSwitch.title": "Переключение панели",
    "settings.developerSwitch.sellerDescription": "Переключайтесь между продавцом и админом без перезапуска приложения.",
    "settings.developerSwitch.adminDescription": "Переключайтесь между админом и продавцом без перезапуска приложения.",
    "settings.admin.title": "Настройки админа",
    "settings.admin.description":
      "Здесь пока находятся служебные инструменты и управление сессией. Позже добавим персональные настройки и диагностику.",
    "common.seller": "Продавец",
    "common.admin": "Админ",
    "language.en": "English",
    "language.ru": "Русский",
    "language.pt": "Português",
  },
  pt: {
    "nav.overview": "Visão geral",
    "nav.sales": "Vendas",
    "nav.inventory": "Inventário",
    "nav.team": "Equipa",
    "nav.settings": "Definições",
    "nav.checkout": "Checkout",
    "nav.orders": "Pedidos",
    "nav.stock": "Meu stock",
    "nav.shift": "Turno",
    "screen.shiftHistory": "Histórico de turnos",
    "screen.shiftReport": "Relatório do turno",
    "checkout.searchPlaceholder": "Pesquisar produtos...",
    "checkout.filters": "Filtros",
    "checkout.stock": "Stock",
    "checkout.addToCart": "Adicionar ao carrinho",
    "draftCart.title": "Carrinho rascunho",
    "draftCart.productsAdded": "produtos adicionados",
    "draftCart.totalAmount": "Total",
    "draftCart.cash": "Dinheiro",
    "draftCart.card": "Cartão",
    "draftCart.addDiscount": "Adicionar desconto",
    "draftCart.editDiscount": "Editar desconto",
    "draftCart.removeItem": "Remover produto",
    "draftCart.increaseQuantity": "Aumentar quantidade",
    "draftCart.decreaseQuantity": "Diminuir quantidade",
    "discount.adjustment": "Ajuste",
    "discount.fixedEur": "Fixo EUR",
    "discount.percent": "Percentagem %",
    "discount.value": "Valor do desconto",
    "discount.finalPrice": "Preço final",
    "discount.apply": "Aplicar desconto",
    "discount.clear": "Limpar",
    "discount.remove": "Remover desconto",
    "discount.backspace": "Apag",
    "orders.receipt": "Recibo",
    "orders.back": "Voltar",
    "orders.deletedSale": "Venda eliminada",
    "orders.completedSale": "Venda concluída",
    "orders.openReceipt": "Abrir recibo",
    "orders.noSales": "Ainda sem vendas",
    "orders.noSalesDescription": "As vendas concluídas e devoluções vão aparecer aqui.",
    "receipt.qty": "Qtd",
    "receipt.discount": "Desconto",
    "receipt.subtotal": "Subtotal",
    "receipt.total": "Total",
    "receipt.saleId": "ID da venda",
    "status.completed": "Concluída",
    "status.deleted": "Eliminada",
    "settings.language.title": "Idioma",
    "settings.language.description": "Escolha o idioma da interface. A aplicação vai lembrar-se dele após reiniciar.",
    "settings.session.title": "Sessão",
    "settings.session.operator": "Operador",
    "settings.session.store": "Loja",
    "settings.session.mode": "Modo",
    "settings.session.device": "Dispositivo",
    "settings.session.liveMode": "Modo real",
    "settings.session.demoMode": "Modo demo",
    "settings.developerSwitch.title": "Troca de painel",
    "settings.developerSwitch.sellerDescription": "Troque entre vendedor e admin sem reiniciar a aplicação.",
    "settings.developerSwitch.adminDescription": "Troque entre admin e vendedor sem reiniciar a aplicação.",
    "settings.admin.title": "Definições do admin",
    "settings.admin.description":
      "Por enquanto, os controlos de sessão e as ferramentas de ambiente do admin ficam aqui. Mais tarde podemos adicionar preferências e diagnóstico.",
    "common.seller": "Vendedor",
    "common.admin": "Admin",
    "language.en": "English",
    "language.ru": "Русский",
    "language.pt": "Português",
  },
} as const;

export type TranslationKey = keyof (typeof translations)["en"];

const listeners = new Set<() => void>();

function detectInitialLocale(): AppLocale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved === "en" || saved === "ru" || saved === "pt") {
    return saved;
  }

  const candidate = window.navigator.language.toLowerCase();
  if (candidate.startsWith("ru")) {
    return "ru";
  }
  if (candidate.startsWith("pt")) {
    return "pt";
  }

  return DEFAULT_LOCALE;
}

let currentLocale: AppLocale = detectInitialLocale();

function applyLocaleToDocument(locale: AppLocale) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = locale === "pt" ? "pt-PT" : locale;
}

export function initializeI18n() {
  applyLocaleToDocument(currentLocale);
}

export function setCurrentLocale(locale: AppLocale) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }

  if (locale === currentLocale) {
    applyLocaleToDocument(locale);
    return;
  }

  currentLocale = locale;
  applyLocaleToDocument(locale);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentLocale;
}

export function translate(key: TranslationKey, locale = currentLocale) {
  return translations[locale][key] ?? translations.en[key];
}

export function useI18n() {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    locale,
    setLocale: setCurrentLocale,
    t: (key: TranslationKey) => translate(key, locale),
    localeOptions: (["en", "ru", "pt"] as AppLocale[]).map((value) => ({
      value,
      label: translate(`language.${value}` as TranslationKey, locale),
    })),
  };
}
