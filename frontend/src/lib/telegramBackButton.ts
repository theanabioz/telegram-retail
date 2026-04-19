import { useEffect, useRef } from "react";
import { getTelegramWebApp } from "./telegramWebApp";

export function canUseTelegramBackButton() {
  if (typeof window === "undefined") {
    return false;
  }

  const webApp = getTelegramWebApp();
  return Boolean(webApp?.platform && webApp.BackButton);
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
    if (!webApp) {
      return;
    }
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
