import { getTelegramWebApp, type TelegramWebAppNative } from "./telegramWebApp";

const TELEGRAM_FULLSCREEN_TOP_FALLBACK = 72;

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
  const contentTop = webApp.contentSafeAreaInset?.top ?? 0;
  const safeTop = webApp.safeAreaInset?.top ?? 0;
  const telegramTopInset = Math.max(contentTop, safeTop);

  if (telegramTopInset > 0) {
    return telegramTopInset;
  }

  return isFullscreenLike(webApp) ? TELEGRAM_FULLSCREEN_TOP_FALLBACK : 0;
}

function applyTelegramViewportSafety() {
  const webApp = getTelegramWebApp();

  if (!webApp) {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty("--telegram-safe-area-top", "0px");
    document.documentElement.style.setProperty("--app-viewport-height", `${viewportHeight}px`);
    return;
  }

  const topInset = readTelegramTopInset(webApp);
  const viewportHeight = webApp.viewportHeight || window.visualViewport?.height || window.innerHeight;

  document.documentElement.style.setProperty("--telegram-safe-area-top", `${topInset}px`);
  document.documentElement.style.setProperty("--app-viewport-height", `${viewportHeight}px`);
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
