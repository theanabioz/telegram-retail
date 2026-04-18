import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config.js";

export type JwtPayload = {
  app_user_id: string;
  app_role: "admin" | "seller";
  telegram_id: number;
  full_name: string;
  store_id: string | null;
  impersonated_by: string | null;
  impersonation_log_id: string | null;
};

export function signAppJwt(payload: JwtPayload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

export function verifyAppJwt(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
