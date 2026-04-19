import {
  expandViewport,
  init,
  isBackButtonMounted,
  isMiniAppMounted,
  isViewportMounted,
  miniAppReady,
  mountBackButton,
  mountMiniAppSync,
  mountViewport,
  onBackButtonClick,
  showBackButton,
  hideBackButton,
} from "@telegram-apps/sdk";
import { getTelegramWebApp } from "./telegramWebApp";

let sdkInitialized = false;
let sdkCleanup: VoidFunction | null = null;
let viewportMountPromise: Promise<void> | null = null;

function canUseTelegramRuntime() {
  return typeof window !== "undefined" && Boolean(getTelegramWebApp());
}

function ensureSdkInitialized() {
  if (!canUseTelegramRuntime() || sdkInitialized) {
    return;
  }

  sdkCleanup = init();
  sdkInitialized = true;
}

function mountMiniAppIfNeeded() {
  if (!mountMiniAppSync.isAvailable() || isMiniAppMounted()) {
    return;
  }

  mountMiniAppSync();
}

function mountBackButtonIfNeeded() {
  if (!mountBackButton.isAvailable() || isBackButtonMounted()) {
    return;
  }

  mountBackButton();
}

async function mountViewportIfNeeded() {
  if (!mountViewport.isAvailable() || isViewportMounted()) {
    return;
  }

  if (!viewportMountPromise) {
    viewportMountPromise = Promise.resolve(mountViewport()).finally(() => {
      viewportMountPromise = null;
    });
  }

  await viewportMountPromise;
}

export function bootstrapTelegramSdk() {
  if (!canUseTelegramRuntime()) {
    return () => {};
  }

  ensureSdkInitialized();
  mountMiniAppIfNeeded();
  mountBackButtonIfNeeded();
  void mountViewportIfNeeded();

  return () => {
    sdkCleanup?.();
    sdkCleanup = null;
    sdkInitialized = false;
  };
}

export function notifyTelegramAppReady() {
  ensureSdkInitialized();

  try {
    if (miniAppReady.isAvailable()) {
      miniAppReady();
      return;
    }
  } catch {
    // Fall through to the native object fallback below.
  }

  getTelegramWebApp()?.ready?.();
}

export function expandTelegramApp() {
  ensureSdkInitialized();

  try {
    if (expandViewport.isAvailable()) {
      expandViewport();
      return;
    }
  } catch {
    // Fall through to the native object fallback below.
  }

  getTelegramWebApp()?.expand?.();
}

export function canUseTelegramBackButton() {
  if (!canUseTelegramRuntime()) {
    return false;
  }

  ensureSdkInitialized();
  return mountBackButton.isAvailable() || Boolean(getTelegramWebApp()?.BackButton);
}

export function showTelegramBackButton() {
  ensureSdkInitialized();
  mountBackButtonIfNeeded();

  try {
    if (showBackButton.isAvailable()) {
      showBackButton();
      return;
    }
  } catch {
    // Fall through to the native object fallback below.
  }

  getTelegramWebApp()?.BackButton?.show();
}

export function hideTelegramBackButton() {
  ensureSdkInitialized();
  mountBackButtonIfNeeded();

  try {
    if (hideBackButton.isAvailable()) {
      hideBackButton();
      return;
    }
  } catch {
    // Fall through to the native object fallback below.
  }

  getTelegramWebApp()?.BackButton?.hide();
}

export function onTelegramBackButtonClick(callback: () => void) {
  ensureSdkInitialized();
  mountBackButtonIfNeeded();

  try {
    if (onBackButtonClick.isAvailable()) {
      return onBackButtonClick(callback);
    }
  } catch {
    // Fall through to the native object fallback below.
  }

  const nativeBackButton = getTelegramWebApp()?.BackButton;
  nativeBackButton?.onClick(callback);

  return () => {
    nativeBackButton?.offClick(callback);
  };
}

export function triggerTelegramImpact(style: "light" | "medium" | "heavy" | "rigid" | "soft") {
  try {
    getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
    return true;
  } catch {
    return false;
  }
}

export function triggerTelegramNotification(type: "error" | "success" | "warning") {
  try {
    getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type);
    return true;
  } catch {
    return false;
  }
}

export function triggerTelegramSelection() {
  try {
    getTelegramWebApp()?.HapticFeedback?.selectionChanged();
    return true;
  } catch {
    return false;
  }
}
