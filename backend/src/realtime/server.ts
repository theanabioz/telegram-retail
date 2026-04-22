import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { type JwtPayload, verifyAppJwt } from "../modules/auth/jwt.js";
import { refreshSessionPayload } from "../modules/auth/auth.service.js";

const MAX_WS_CONNECTIONS_PER_IP = 20;
const MAX_WS_CONNECTIONS_PER_USER = 5;

export type RealtimeEventType =
  | "connected"
  | "sales.updated"
  | "inventory.updated"
  | "shift.updated"
  | "staff.updated"
  | "stores.updated"
  | "products.updated";

export type RealtimeEvent = {
  type: RealtimeEventType;
  at: string;
  scope?: {
    storeId?: string | null;
    sellerId?: string | null;
    productId?: string | null;
  };
  meta?: {
    sourceUserId?: string;
    sourceRole?: JwtPayload["app_role"];
  };
};

type BroadcastOptions = {
  roles?: JwtPayload["app_role"][];
  storeIds?: Array<string | null>;
  userIds?: string[];
};

type RealtimeClient = {
  socket: WebSocket;
  session: JwtPayload;
  isAlive: boolean;
  ip: string;
};

type PendingRealtimeClient = {
  socket: WebSocket;
  authTimer: NodeJS.Timeout;
  ip: string;
};

function getClientIp(request: IncomingMessage) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const firstForwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0];
  return firstForwardedIp?.trim() || request.socket.remoteAddress || "unknown";
}

class RealtimeServer {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  private readonly clients = new Set<RealtimeClient>();
  private readonly pendingClients = new Set<PendingRealtimeClient>();
  private readonly heartbeatTimer: NodeJS.Timeout;

  constructor(server: HttpServer) {
    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }

      const ip = getClientIp(request);
      if (this.countConnectionsByIp(ip) >= MAX_WS_CONNECTIONS_PER_IP) {
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (websocket) => {
        this.registerPendingConnection(websocket, ip);
      });
    });

    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.socket.terminate();
          this.clients.delete(client);
          continue;
        }

        client.isAlive = false;
        client.socket.ping();
      }
    }, 30_000);
  }

  private countConnectionsByIp(ip: string) {
    let count = 0;

    for (const pending of this.pendingClients) {
      if (pending.ip === ip) {
        count += 1;
      }
    }

    for (const client of this.clients) {
      if (client.ip === ip) {
        count += 1;
      }
    }

    return count;
  }

  private countConnectionsByUser(userId: string) {
    let count = 0;

    for (const client of this.clients) {
      if (client.session.app_user_id === userId) {
        count += 1;
      }
    }

    return count;
  }

  private registerPendingConnection(socket: WebSocket, ip: string) {
    const pending: PendingRealtimeClient = {
      socket,
      ip,
      authTimer: setTimeout(() => {
        socket.close(4001, "Authentication timeout");
      }, 5_000),
    };

    this.pendingClients.add(pending);

    const cleanup = () => {
      clearTimeout(pending.authTimer);
      this.pendingClients.delete(pending);
    };

    socket.once("close", cleanup);
    socket.once("error", cleanup);
    socket.once("message", async (data) => {
      try {
        const payload = JSON.parse(data.toString()) as { type?: string; token?: string };

        if (payload.type !== "auth" || !payload.token) {
          socket.close(4001, "Authentication required");
          return;
        }

        const session = await refreshSessionPayload(verifyAppJwt(payload.token));
        if (this.countConnectionsByUser(session.app_user_id) >= MAX_WS_CONNECTIONS_PER_USER) {
          socket.close(4008, "Too many connections");
          return;
        }

        cleanup();
        this.registerConnection(socket, session, ip);
      } catch {
        socket.close(4001, "Authentication failed");
      }
    });
  }

  private registerConnection(socket: WebSocket, session: JwtPayload, ip: string) {
    const client: RealtimeClient = {
      socket,
      session,
      isAlive: true,
      ip,
    };

    this.clients.add(client);

    socket.on("pong", () => {
      client.isAlive = true;
    });

    socket.on("close", () => {
      this.clients.delete(client);
    });

    socket.on("error", () => {
      this.clients.delete(client);
    });

    this.send(socket, {
      type: "connected",
      at: new Date().toISOString(),
    });
  }

  private matches(client: RealtimeClient, options?: BroadcastOptions) {
    if (!options) {
      return true;
    }

    if (options.userIds?.includes(client.session.app_user_id)) {
      return true;
    }

    if (options.roles && !options.roles.includes(client.session.app_role)) {
      return false;
    }

    if (!options.storeIds || options.storeIds.length === 0) {
      return true;
    }

    if (client.session.app_role === "admin") {
      return true;
    }

    return options.storeIds.includes(client.session.store_id);
  }

  private send(socket: WebSocket, event: RealtimeEvent) {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(event));
  }

  broadcast(event: RealtimeEvent, options?: BroadcastOptions) {
    for (const client of this.clients) {
      if (!this.matches(client, options)) {
        continue;
      }

      this.send(client.socket, event);
    }
  }

  dispose() {
    clearInterval(this.heartbeatTimer);
    for (const pending of this.pendingClients) {
      clearTimeout(pending.authTimer);
      pending.socket.terminate();
    }
    this.pendingClients.clear();
    for (const client of this.clients) {
      client.socket.terminate();
    }
    this.clients.clear();
    this.wss.close();
  }
}

let realtimeServer: RealtimeServer | null = null;

export function attachRealtimeServer(server: HttpServer) {
  realtimeServer = new RealtimeServer(server);
  return realtimeServer;
}

export function emitRealtimeEvent(event: Omit<RealtimeEvent, "at">, options?: BroadcastOptions) {
  realtimeServer?.broadcast(
    {
      ...event,
      at: new Date().toISOString(),
    },
    options
  );
}
