function resolveDefaultApiBaseUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:4000";
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:4000`;
}

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? resolveDefaultApiBaseUrl(),
  devTelegramId: Number(import.meta.env.VITE_DEV_TELEGRAM_ID ?? 100000101),
  devPanel: import.meta.env.VITE_DEV_PANEL ?? "seller",
  devSellerTelegramId: Number(import.meta.env.VITE_DEV_SELLER_TELEGRAM_ID ?? 100000101),
  devAdminTelegramId: Number(import.meta.env.VITE_DEV_ADMIN_TELEGRAM_ID ?? 100000001),
};
