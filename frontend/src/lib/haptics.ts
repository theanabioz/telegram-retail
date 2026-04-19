import {
  triggerTelegramImpact,
  triggerTelegramNotification,
  triggerTelegramSelection,
} from "./telegramSdk";
import { getTelegramWebApp } from "./telegramWebApp";

type ImpactStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type NotificationType = "error" | "success" | "warning";

const CLICKABLE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "[role='button']",
  "[role='tab']",
  "[aria-pressed]",
  "[data-haptic]",
].join(", ");

const SCROLL_STEP_PX = 72;
const SCROLL_FEEDBACK_INTERVAL_MS = 140;
const POINTER_FEEDBACK_INTERVAL_MS = 100;

function canUseHaptics() {
  return typeof getTelegramWebApp()?.HapticFeedback !== "undefined";
}

export function triggerImpact(style: ImpactStyle = "light") {
  if (!canUseHaptics()) {
    return;
  }

  triggerTelegramImpact(style);
}

export function triggerNotification(type: NotificationType) {
  if (!canUseHaptics()) {
    return;
  }

  triggerTelegramNotification(type);
}

export function triggerSelection() {
  if (!canUseHaptics()) {
    return;
  }

  triggerTelegramSelection();
}

export function attachGlobalHaptics() {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const supportsPointerEvents = typeof window.PointerEvent !== "undefined";

  let lastScrollTop = window.scrollY;
  let lastScrollFeedbackAt = 0;
  let accumulatedScrollDistance = 0;
  let lastPointerFeedbackAt = 0;

  const handlePointer = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (!target.closest(CLICKABLE_SELECTOR)) {
      return;
    }

    if (!canUseHaptics()) {
      return;
    }

    const now = window.performance.now();
    if (now - lastPointerFeedbackAt < POINTER_FEEDBACK_INTERVAL_MS) {
      return;
    }

    lastPointerFeedbackAt = now;
    triggerImpact("light");
  };

  const handleScroll = () => {
    if (!canUseHaptics()) {
      return;
    }

    const currentScrollTop = window.scrollY;
    accumulatedScrollDistance += Math.abs(currentScrollTop - lastScrollTop);
    lastScrollTop = currentScrollTop;

    const now = window.performance.now();
    if (
      accumulatedScrollDistance < SCROLL_STEP_PX ||
      now - lastScrollFeedbackAt < SCROLL_FEEDBACK_INTERVAL_MS
    ) {
      return;
    }

    accumulatedScrollDistance = 0;
    lastScrollFeedbackAt = now;
    triggerSelection();
  };

  if (supportsPointerEvents) {
    document.addEventListener("pointerdown", handlePointer, true);
  } else {
    document.addEventListener("touchstart", handlePointer, true);
    document.addEventListener("click", handlePointer, true);
  }
  window.addEventListener("scroll", handleScroll, { passive: true });

  return () => {
    if (supportsPointerEvents) {
      document.removeEventListener("pointerdown", handlePointer, true);
    } else {
      document.removeEventListener("touchstart", handlePointer, true);
      document.removeEventListener("click", handlePointer, true);
    }
    window.removeEventListener("scroll", handleScroll);
  };
}
