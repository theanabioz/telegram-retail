import { useEffect } from "react";
import WebApp from "@twa-dev/sdk";

type TelegramWebAppBackButton = typeof WebApp & {
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  platform?: string;
};

function getTelegramWebApp() {
  return WebApp as TelegramWebAppBackButton;
}

export function canUseTelegramBackButton() {
  if (typeof window === "undefined") {
    return false;
  }

  const webApp = getTelegramWebApp();
  return Boolean(webApp.platform && webApp.BackButton);
}

export function useTelegramBackButton(visible: boolean, onBack: () => void) {
  useEffect(() => {
    if (!visible || !canUseTelegramBackButton()) {
      return;
    }

    const webApp = getTelegramWebApp();
    webApp.BackButton?.show();
    webApp.BackButton?.onClick(onBack);

    return () => {
      webApp.BackButton?.offClick(onBack);
      webApp.BackButton?.hide();
    };
  }, [visible, onBack]);
}
