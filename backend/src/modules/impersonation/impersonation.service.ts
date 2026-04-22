import { HttpError } from "../../lib/http-error.js";
import { signAppJwt, type JwtPayload } from "../auth/jwt.js";
import { findCurrentAssignment, findUserById } from "../users/users.repository.js";
import {
  closeImpersonationLog,
  createImpersonationLog,
} from "./impersonation.repository.js";

export async function startSellerImpersonation(adminUserId: string, sellerUserId: string) {
  const seller = await findUserById(sellerUserId);

  if (!seller || !seller.is_active) {
    throw new HttpError(404, "Seller not found or inactive");
  }

  if (seller.role !== "seller") {
    throw new HttpError(400, "Only sellers can be impersonated");
  }

  const assignment = await findCurrentAssignment(seller.id);
  if (!assignment) {
    throw new HttpError(403, "Seller has no active store assignment");
  }

  const log = await createImpersonationLog(adminUserId, seller.id);

  const payload: JwtPayload = {
    app_user_id: seller.id,
    app_role: "seller",
    telegram_id: seller.telegram_id,
    full_name: seller.full_name,
    store_id: assignment.store_id,
    impersonated_by: adminUserId,
    impersonation_log_id: log.id,
  };

  return {
    token: signAppJwt(payload),
    user: payload,
    assignment,
    impersonation: log,
  };
}

export async function stopSellerImpersonation(adminUserId: string, logId: string) {
  return closeImpersonationLog(logId, adminUserId);
}
