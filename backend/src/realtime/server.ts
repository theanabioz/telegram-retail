import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { type JwtPayload, verifyAppJwt } from "../modules/auth/jwt.js";

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
};

function createUnauthorizedResponse(socket: NodeJS.ReadWriteStream & { destroy(): void }) {
  socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
  socket.destroy();
}

function resolveSessionFromRequest(request: IncomingMessage) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const token = url.searchParams.get("token");

  if (!token) {
    return null;
  }

  try {
    return verifyAppJwt(token);
  } catch {
    return null;
  }
}

class RealtimeServer {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly clients = new Set<RealtimeClient>();
  private readonly heartbeatTimer: NodeJS.Timeout;

  constructor(server: HttpServer) {
    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }

      const session = resolveSessionFromRequest(request);
      if (!session) {
        createUnauthorizedResponse(socket);
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (websocket) => {
        this.registerConnection(websocket, session);
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

  private registerConnection(socket: WebSocket, session: JwtPayload) {
    const client: RealtimeClient = {
      socket,
      session,
      isAlive: true,
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
