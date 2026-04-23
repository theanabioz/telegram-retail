import { useCallback } from "react";

type FocusableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export function useScrollToInput(delayMs = 280) {
  return useCallback((event: React.FocusEvent<FocusableElement>) => {
    const target = event.target;

    window.setTimeout(() => {
      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }, delayMs);
  }, [delayMs]);
}
