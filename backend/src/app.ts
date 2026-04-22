import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { adminRouter } from "./routes/admin.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { sellerRouter } from "./routes/seller.routes.js";
import { shiftsRouter } from "./routes/shifts.routes.js";

function isAllowedLocalOrigin(origin: string) {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    const allowedOrigins = new Set([
      ...env.FRONTEND_ORIGIN,
      "https://albufeirashop.xyz",
      "https://www.albufeirashop.xyz",
      "https://telegram-retail.vercel.app",
    ]);

    if (allowedOrigins.has(origin)) {
      return true;
    }

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return true;
    }

    if (env.DEV_AUTH_ENABLED && hostname === "telegram-retail-arsen-abdullaev.vercel.app") {
      return true;
    }

    return (
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
    );
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: env.DEV_AUTH_ENABLED ? 120 : 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  const mutationLimiter = rateLimit({
    windowMs: 60_000,
    limit: env.DEV_AUTH_ENABLED ? 600 : 240,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isAllowedLocalOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "telegram-retail-backend",
    });
  });

  app.use("/auth", authLimiter);
  app.use(["/admin", "/seller", "/shifts"], mutationLimiter);

  app.use("/admin", adminRouter);
  app.use("/auth", authRouter);
  app.use("/shifts", shiftsRouter);
  app.use("/seller", sellerRouter);

  app.use(errorMiddleware);

  return app;
}
