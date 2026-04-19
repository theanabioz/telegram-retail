import { getTelegramWebApp, type TelegramWebAppNative } from "./telegramWebApp";

const TELEGRAM_FULLSCREEN_TOP_FALLBACK = 72;
const TELEGRAM_FULLSCREEN_TOP_EXTRA = 14;

function readTelegramCssInset(name: string) {
  if (typeof window === "undefined") {
    return 0;
  }

  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const numeric = Number.parseFloat(value);

  return Number.isFinite(numeric) ? numeric : 0;
}

function isMobileTelegram(webApp: TelegramWebAppNative) {
  const platform = String(webApp.platform ?? "").toLowerCase();

  return platform === "ios" || platform === "android" || platform === "android_x";
}

function isFullscreenLike(webApp: TelegramWebAppNative) {
  if (webApp.isFullscreen) {
    return true;
  }

  if (!isMobileTelegram(webApp)) {
    return false;
  }

  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const screenHeight = window.screen?.height ?? viewportHeight;

  if (!screenHeight) {
    return false;
  }

  return viewportHeight / screenHeight > 0.93;
}

function readTelegramTopInset(webApp: TelegramWebAppNative) {
  const cssContentTop = readTelegramCssInset("--tg-content-safe-area-inset-top");
  const cssSafeTop = readTelegramCssInset("--tg-safe-area-inset-top");
  const contentTop = Math.max(webApp.contentSafeAreaInset?.top ?? 0, cssContentTop);
  const safeTop = Math.max(webApp.safeAreaInset?.top ?? 0, cssSafeTop);
  const fullscreenLike = isFullscreenLike(webApp);
  const telegramTopInset = Math.max(
    contentTop,
    safeTop + (fullscreenLike ? TELEGRAM_FULLSCREEN_TOP_EXTRA : 0)
  );

  if (telegramTopInset > 0) {
    return telegramTopInset;
  }

  return fullscreenLike ? TELEGRAM_FULLSCREEN_TOP_FALLBACK : 0;
}

function applyTelegramViewportSafety() {
  const webApp = getTelegramWebApp();
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const isForcedPortrait = document.documentElement.classList.contains("app-force-portrait");
  const effectiveViewportHeight = isForcedPortrait
    ? Math.max(viewportWidth, viewportHeight)
    : viewportHeight;

  if (!webApp) {
    document.documentElement.style.setProperty("--telegram-safe-area-top", "0px");
    document.documentElement.style.setProperty("--app-viewport-height", `${effectiveViewportHeight}px`);
    return;
  }

  const topInset = readTelegramTopInset(webApp);
  const telegramViewportHeight = webApp.viewportHeight || viewportHeight;
  const resolvedViewportHeight = isForcedPortrait
    ? Math.max(viewportWidth, viewportHeight)
    : telegramViewportHeight;

  document.documentElement.style.setProperty("--telegram-safe-area-top", `${topInset}px`);
  document.documentElement.style.setProperty("--app-viewport-height", `${resolvedViewportHeight}px`);
}

export function attachTelegramViewportSafety() {
  const webApp = getTelegramWebApp();
  const update = () => applyTelegramViewportSafety();
  const eventNames = ["viewportChanged", "safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged"];

  update();
  window.visualViewport?.addEventListener("resize", update);
  window.addEventListener("resize", update);

  for (const eventName of eventNames) {
    try {
        webApp?.onEvent?.(eventName, update);
    } catch {
      // Older Telegram SDK builds do not know the newer safe-area events.
    }
  }

  return () => {
    window.visualViewport?.removeEventListener("resize", update);
    window.removeEventListener("resize", update);

    for (const eventName of eventNames) {
      try {
        webApp?.offEvent?.(eventName, update);
      } catch {
        // Older Telegram SDK builds do not know the newer safe-area events.
      }
    }
  };
}
