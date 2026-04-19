export type TelegramWebAppNative = {
  platform?: string;
  version?: string;
  viewportHeight?: number;
  isFullscreen?: boolean;
  isOrientationLocked?: boolean;
  safeAreaInset?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  contentSafeAreaInset?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  lockOrientation?: () => void;
  unlockOrientation?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  onEvent?: (eventType: string, eventHandler: () => void) => void;
  offEvent?: (eventType: string, eventHandler: () => void) => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
};

export function getTelegramWebApp(): TelegramWebAppNative | null {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    (window as typeof window & { Telegram?: { WebApp?: TelegramWebAppNative } }).Telegram?.WebApp ?? null
  );
}
