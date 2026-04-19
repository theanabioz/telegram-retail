import { getTelegramWebApp } from "./telegramWebApp";

type SupportedOrientationLock = "portrait" | "portrait-primary";

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: SupportedOrientationLock) => Promise<void>;
};

function isMobileTelegramPlatform() {
  const platform = String(getTelegramWebApp()?.platform ?? "").toLowerCase();

  return platform === "ios" || platform === "android" || platform === "android_x";
}

function isTouchDevice() {
  return typeof window !== "undefined" && (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    ((window.matchMedia?.("(pointer: coarse)").matches) ?? false)
  );
}

function shouldUseForcedPortraitFallback() {
  return isMobileTelegramPlatform() || isTouchDevice();
}

function applyForcedPortraitFallback() {
  if (typeof document === "undefined" || !shouldUseForcedPortraitFallback()) {
    return;
  }

  const root = document.documentElement;
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const isLandscape = viewportWidth > viewportHeight;

  if (!isLandscape) {
    root.classList.remove("app-force-portrait");
    root.style.removeProperty("--app-force-portrait-width");
    root.style.removeProperty("--app-force-portrait-height");
    return;
  }

  root.classList.add("app-force-portrait");
  root.style.setProperty("--app-force-portrait-width", `${viewportHeight}px`);
  root.style.setProperty("--app-force-portrait-height", `${viewportWidth}px`);
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
  const landscapeMediaQuery = window.matchMedia?.("(orientation: landscape)");

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
    applyForcedPortraitFallback();
  };

  scheduleLockSequence();
  applyForcedPortraitFallback();

  webApp?.onEvent?.("viewportChanged", handleViewportChange);
  webApp?.onEvent?.("fullscreenChanged", handleViewportChange);
  window.addEventListener("orientationchange", handleViewportChange);
  window.addEventListener("resize", applyForcedPortraitFallback);
  window.visualViewport?.addEventListener("resize", applyForcedPortraitFallback);
  landscapeMediaQuery?.addEventListener?.("change", handleViewportChange);

  return () => {
    retryTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    webApp?.offEvent?.("viewportChanged", handleViewportChange);
    webApp?.offEvent?.("fullscreenChanged", handleViewportChange);
    window.removeEventListener("orientationchange", handleViewportChange);
    window.removeEventListener("resize", applyForcedPortraitFallback);
    window.visualViewport?.removeEventListener("resize", applyForcedPortraitFallback);
    landscapeMediaQuery?.removeEventListener?.("change", handleViewportChange);
    document.documentElement.classList.remove("app-force-portrait");
    document.documentElement.style.removeProperty("--app-force-portrait-width");
    document.documentElement.style.removeProperty("--app-force-portrait-height");
  };
}
