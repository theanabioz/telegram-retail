import { useEffect, useRef } from "react";
import {
  canUseTelegramBackButton,
  hideTelegramBackButton,
  onTelegramBackButtonClick,
  showTelegramBackButton,
} from "./telegramSdk";

export { canUseTelegramBackButton } from "./telegramSdk";

export function useTelegramBackButton(visible: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!canUseTelegramBackButton()) {
      return;
    }

    const handleBack = () => onBackRef.current();
    const offBack = onTelegramBackButtonClick(handleBack);

    if (visible) {
      showTelegramBackButton();
    } else {
      hideTelegramBackButton();
    }

    return () => {
      offBack();
    };
  }, [visible]);
}
