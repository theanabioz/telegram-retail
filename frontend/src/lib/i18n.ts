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
