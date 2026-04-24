import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config.js";
import { closeDbPool } from "./lib/db.js";
import { startTelegramBot } from "./lib/telegram-bot.js";
import { attachRealtimeServer } from "./realtime/server.js";

const app = createApp();
const server = createServer(app);
const realtimeServer = attachRealtimeServer(server);
const telegramBot = env.TELEGRAM_BOT_POLLING_ENABLED ? startTelegramBot() : null;
let isShuttingDown = false;

async function closeHttpServer() {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function shutdown(reason: string, exitCode: number) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Shutting down Telegram Retail backend: ${reason}`);

  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  try {
    telegramBot?.dispose();
    realtimeServer.dispose();
    await closeHttpServer();
    await closeDbPool();
    clearTimeout(forceExitTimer);
    process.exit(exitCode);
  } catch (error) {
    clearTimeout(forceExitTimer);
    console.error("Graceful shutdown failed", error);
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM", 0);
});

process.on("SIGINT", () => {
  void shutdown("SIGINT", 0);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
  void shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", error);
  void shutdown("uncaughtException", 1);
});

server.listen(env.PORT, () => {
  console.log(`Telegram Retail backend listening on port ${env.PORT}`);
  if (!env.TELEGRAM_BOT_POLLING_ENABLED) {
    console.log("Telegram bot polling is disabled");
  }
});
