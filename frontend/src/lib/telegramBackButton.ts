import { useEffect, useRef } from "react";
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
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!canUseTelegramBackButton()) {
      return;
    }

    const webApp = getTelegramWebApp();
    const handleBack = () => onBackRef.current();

    webApp.BackButton?.onClick(handleBack);

    if (visible) {
      webApp.BackButton?.show();
    } else {
      webApp.BackButton?.hide();
    }

    return () => {
      webApp.BackButton?.offClick(handleBack);
    };
  }, [visible]);
}
