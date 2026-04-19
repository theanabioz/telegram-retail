import WebApp from "@twa-dev/sdk";

type SupportedOrientationLock = "portrait" | "portrait-primary";

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: SupportedOrientationLock) => Promise<void>;
  unlock?: () => void;
};

type TelegramWebAppOrientation = typeof WebApp & {
  requestFullscreen?: () => void;
  lockOrientation?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
};

export async function lockPortraitOrientation() {
  if (typeof window === "undefined") {
    return;
  }

  const webApp = WebApp as TelegramWebAppOrientation;

  if (webApp.isVersionAtLeast?.("8.0") && webApp.lockOrientation) {
    try {
      webApp.requestFullscreen?.();
      webApp.lockOrientation();
      return;
    } catch {
      // Fall through to the browser API fallback.
    }
  }

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
      // Some mobile webviews, especially on iOS, may ignore orientation locking.
    }
  }
}
