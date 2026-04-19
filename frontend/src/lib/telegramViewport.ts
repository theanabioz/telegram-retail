import WebApp from "@twa-dev/sdk";

type TelegramInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

type TelegramWebAppViewport = typeof WebApp & {
  isFullscreen?: boolean;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;
  onEvent?: (eventType: string, eventHandler: () => void) => void;
  offEvent?: (eventType: string, eventHandler: () => void) => void;
};

const TELEGRAM_FULLSCREEN_TOP_FALLBACK = 72;

function isMobileTelegram(webApp: TelegramWebAppViewport) {
  const platform = String(webApp.platform ?? "").toLowerCase();

  return platform === "ios" || platform === "android" || platform === "android_x";
}

function isFullscreenLike(webApp: TelegramWebAppViewport) {
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

function readTelegramTopInset(webApp: TelegramWebAppViewport) {
  const contentTop = webApp.contentSafeAreaInset?.top ?? 0;
  const safeTop = webApp.safeAreaInset?.top ?? 0;
  const telegramTopInset = Math.max(contentTop, safeTop);

  if (telegramTopInset > 0) {
    return telegramTopInset;
  }

  return isFullscreenLike(webApp) ? TELEGRAM_FULLSCREEN_TOP_FALLBACK : 0;
}

function applyTelegramViewportSafety() {
  const webApp = WebApp as TelegramWebAppViewport;
  const topInset = readTelegramTopInset(webApp);
  const viewportHeight = webApp.viewportHeight || window.visualViewport?.height || window.innerHeight;

  document.documentElement.style.setProperty("--telegram-safe-area-top", `${topInset}px`);
  document.documentElement.style.setProperty("--app-viewport-height", `${viewportHeight}px`);
}

export function attachTelegramViewportSafety() {
  const webApp = WebApp as TelegramWebAppViewport;
  const update = () => applyTelegramViewportSafety();
  const eventNames = ["viewportChanged", "safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged"];

  update();
  window.visualViewport?.addEventListener("resize", update);
  window.addEventListener("resize", update);

  for (const eventName of eventNames) {
    try {
      webApp.onEvent?.(eventName, update);
    } catch {
      // Older Telegram SDK builds do not know the newer safe-area events.
    }
  }

  return () => {
    window.visualViewport?.removeEventListener("resize", update);
    window.removeEventListener("resize", update);

    for (const eventName of eventNames) {
      try {
        webApp.offEvent?.(eventName, update);
      } catch {
        // Older Telegram SDK builds do not know the newer safe-area events.
      }
    }
  };
}
