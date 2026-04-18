import type { JwtPayload } from "../modules/auth/jwt.js";

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

export {};
