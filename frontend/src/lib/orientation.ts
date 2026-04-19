type SupportedOrientationLock = "portrait" | "portrait-primary";

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: SupportedOrientationLock) => Promise<void>;
};

type TelegramWebAppNative = {
  requestFullscreen?: () => void;
  lockOrientation?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
};

function getTelegramWebApp(): TelegramWebAppNative | null {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    (window as typeof window & { Telegram?: { WebApp?: TelegramWebAppNative } }).Telegram?.WebApp ?? null
  );
}

async function lockBrowserPortrait() {
  if (typeof screen === "undefined") {
    return;
  }

  const orientation = screen.orientation as LockableScreenOrientation | undefined;

  if (!orientation?.lock) {
    return;
  }

  try {
    await orientation.lock("portrait-primary");
  } catch {
    try {
      await orientation.lock("portrait");
    } catch {
      // Some mobile browsers and webviews ignore the browser orientation API.
    }
  }
}

export function attachPortraitOrientationLock() {
  if (typeof window === "undefined") {
    return () => {};
  }

  const webApp = getTelegramWebApp();
  let retryTimeouts: number[] = [];

  const runLock = async () => {
    if (webApp?.isVersionAtLeast?.("8.0") && webApp.lockOrientation) {
      try {
        webApp.lockOrientation();
        return;
      } catch {
        // Fall through to browser API fallback.
      }
    }

    await lockBrowserPortrait();
  };

  const scheduleLockSequence = () => {
    void runLock();

    retryTimeouts = [80, 240, 700].map((delay) =>
      window.setTimeout(() => {
        void runLock();
      }, delay)
    );
  };

  const handleViewportChange = () => {
    scheduleLockSequence();
  };

  scheduleLockSequence();

  webApp?.onEvent?.("viewportChanged", handleViewportChange);
  webApp?.onEvent?.("fullscreenChanged", handleViewportChange);

  return () => {
    retryTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    webApp?.offEvent?.("viewportChanged", handleViewportChange);
    webApp?.offEvent?.("fullscreenChanged", handleViewportChange);
  };
}
