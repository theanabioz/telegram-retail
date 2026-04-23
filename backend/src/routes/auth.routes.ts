import { Router } from "express";
import { env } from "../config.js";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import {
  devLoginBodySchema,
  telegramAuthBodySchema,
  impersonationParamsSchema,
} from "../modules/auth/auth.schemas.js";
import {
  authenticateDevUser,
  authenticateTelegramUser,
  getCurrentSessionUser,
} from "../modules/auth/auth.service.js";
import {
  startSellerImpersonation,
  stopSellerImpersonation,
} from "../modules/impersonation/impersonation.service.js";
import { z } from "zod";

const stopImpersonationBodySchema = z.object({
  logId: z.string().uuid(),
});

export const authRouter = Router();

authRouter.post(
  "/dev-login",
  asyncHandler(async (req, res) => {
    if (!env.DEV_AUTH_ENABLED) {
      res.status(404).json({ error: "Dev auth is disabled" });
      return;
    }

    const body = devLoginBodySchema.parse(req.body);
    const session = await authenticateDevUser(body);
    res.json(session);
  })
);

authRouter.post(
  "/telegram",
  asyncHandler(async (req, res) => {
    const body = telegramAuthBodySchema.parse(req.body);
    const session = await authenticateTelegramUser(body.initData);

    res.json(session);
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const session = await getCurrentSessionUser(req.auth!.app_user_id);

    res.json({
      auth: req.auth,
      ...session,
    });
  })
);

authRouter.post(
  "/impersonate/stop",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const body = stopImpersonationBodySchema.parse(req.body);
    const result = await stopSellerImpersonation(req.auth!.app_user_id, body.logId);

    res.json(result);
  })
);

authRouter.post(
  "/impersonate/:sellerId",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const params = impersonationParamsSchema.parse(req.params);
    const session = await startSellerImpersonation(req.auth!.app_user_id, params.sellerId);

    res.json(session);
  })
);
