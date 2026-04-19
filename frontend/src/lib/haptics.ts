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

function canUseHaptics() {
  return typeof window !== "undefined" && typeof getTelegramWebApp()?.HapticFeedback !== "undefined";
}

export function triggerImpact(style: ImpactStyle = "light") {
  if (!canUseHaptics()) {
    return;
  }

  try {
    getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
  } catch {
    // Ignore unsupported clients and non-Telegram browsers.
  }
}

export function triggerNotification(type: NotificationType) {
  if (!canUseHaptics()) {
    return;
  }

  try {
    getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type);
  } catch {
    // Ignore unsupported clients and non-Telegram browsers.
  }
}

export function triggerSelection() {
  if (!canUseHaptics()) {
    return;
  }

  try {
    getTelegramWebApp()?.HapticFeedback?.selectionChanged();
  } catch {
    // Ignore unsupported clients and non-Telegram browsers.
  }
}

export function attachGlobalHaptics() {
  if (!canUseHaptics()) {
    return () => undefined;
  }

  let lastScrollTop = window.scrollY;
  let lastScrollFeedbackAt = 0;
  let accumulatedScrollDistance = 0;

  const handleClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (!target.closest(CLICKABLE_SELECTOR)) {
      return;
    }

    triggerImpact("light");
  };

  const handleScroll = () => {
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

  document.addEventListener("click", handleClick, true);
  window.addEventListener("scroll", handleScroll, { passive: true });

  return () => {
    document.removeEventListener("click", handleClick, true);
    window.removeEventListener("scroll", handleScroll);
  };
}
