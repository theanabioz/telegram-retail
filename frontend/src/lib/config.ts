function resolveDefaultApiBaseUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:4000";
  }

  const { protocol, hostname } = window.location;
  const productionApiOrigin = "https://telegram-retail-api.vercel.app";

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:4000`;
  }

  if (
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.16.") ||
    hostname.startsWith("172.17.") ||
    hostname.startsWith("172.18.") ||
    hostname.startsWith("172.19.") ||
    hostname.startsWith("172.20.") ||
    hostname.startsWith("172.21.") ||
    hostname.startsWith("172.22.") ||
    hostname.startsWith("172.23.") ||
    hostname.startsWith("172.24.") ||
    hostname.startsWith("172.25.") ||
    hostname.startsWith("172.26.") ||
    hostname.startsWith("172.27.") ||
    hostname.startsWith("172.28.") ||
    hostname.startsWith("172.29.") ||
    hostname.startsWith("172.30.") ||
    hostname.startsWith("172.31.")
  ) {
    return `${protocol}//${hostname}:4000`;
  }

  if (hostname === "telegram-retail.vercel.app" || hostname.endsWith("-arsen-abdullaev.vercel.app")) {
    return productionApiOrigin;
  }

  return `${protocol}//${hostname}`;
}

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? resolveDefaultApiBaseUrl(),
  realtimeUrl: import.meta.env.VITE_REALTIME_URL,
  devTelegramId: Number(import.meta.env.VITE_DEV_TELEGRAM_ID ?? 100000101),
  devPanel: import.meta.env.VITE_DEV_PANEL ?? "seller",
  devSellerTelegramId: Number(import.meta.env.VITE_DEV_SELLER_TELEGRAM_ID ?? 100000101),
  devAdminTelegramId: Number(import.meta.env.VITE_DEV_ADMIN_TELEGRAM_ID ?? 100000001),
};
