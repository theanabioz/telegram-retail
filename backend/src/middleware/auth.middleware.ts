import type { NextFunction, Request, Response } from "express";
import { verifyAppJwt } from "../modules/auth/jwt.js";
import { HttpError } from "../lib/http-error.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return next(new HttpError(401, "Missing bearer token"));
  }

  const token = header.slice("Bearer ".length);

  try {
    req.auth = verifyAppJwt(token);
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
}

export function requireRole(role: "admin" | "seller") {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new HttpError(401, "Authentication required"));
    }

    if (req.auth.app_role !== role) {
      return next(new HttpError(403, "Insufficient permissions"));
    }

    next();
  };
}
