import { config } from "./config";

export type RetailRealtimeEvent = {
  type:
    | "connected"
    | "sales.updated"
    | "inventory.updated"
    | "shift.updated"
    | "staff.updated"
    | "stores.updated"
    | "products.updated";
  at: string;
  scope?: {
    storeId?: string | null;
    sellerId?: string | null;
    productId?: string | null;
  };
  meta?: {
    sourceUserId?: string;
    sourceRole?: "admin" | "seller";
  };
};

const REALTIME_EVENT_NAME = "retail-realtime";

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let activeToken: string | null = null;
let stoppedManually = false;

function buildRealtimeUrl() {
  const url = new URL(config.realtimeUrl ?? config.apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  return url.toString();
}

function dispatchRealtimeEvent(event: RetailRealtimeEvent) {
  window.dispatchEvent(new CustomEvent<RetailRealtimeEvent>(REALTIME_EVENT_NAME, { detail: event }));
}

function scheduleReconnect() {
  if (stoppedManually || !activeToken || reconnectTimer !== null) {
    return;
  }

  const reconnectToken = activeToken;
  const delayMs = Math.min(10_000, 1_000 * 2 ** reconnectAttempts);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempts += 1;
    ensureRealtimeConnection(reconnectToken);
  }, delayMs);
}

export function ensureRealtimeConnection(token: string) {
  if (typeof window === "undefined" || !token) {
    return;
  }

  if (socket && activeToken === token && socket.readyState <= WebSocket.OPEN) {
    return;
  }

  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  stoppedManually = false;
  activeToken = token;
  socket?.close();

  const nextSocket = new WebSocket(buildRealtimeUrl());
  socket = nextSocket;

  nextSocket.addEventListener("open", () => {
    reconnectAttempts = 0;
    nextSocket.send(JSON.stringify({ type: "auth", token }));
  });

  nextSocket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data) as RetailRealtimeEvent;
      dispatchRealtimeEvent(payload);
    } catch {
      // Ignore malformed payloads; realtime should never break the app shell.
    }
  });

  nextSocket.addEventListener("close", () => {
    if (socket === nextSocket) {
      socket = null;
    }
    scheduleReconnect();
  });

  nextSocket.addEventListener("error", () => {
    nextSocket.close();
  });
}

export function disconnectRealtimeConnection() {
  stoppedManually = true;
  activeToken = null;
  reconnectAttempts = 0;

  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  socket?.close();
  socket = null;
}

export function addRealtimeEventListener(listener: (event: RetailRealtimeEvent) => void) {
  const handler = (event: Event) => {
    listener((event as CustomEvent<RetailRealtimeEvent>).detail);
  };

  window.addEventListener(REALTIME_EVENT_NAME, handler);

  return () => {
    window.removeEventListener(REALTIME_EVENT_NAME, handler);
  };
}
