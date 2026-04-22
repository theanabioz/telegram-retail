import { HttpError } from "../../lib/http-error.js";
import { maybeOne, one } from "../../lib/db.js";

export async function createImpersonationLog(adminUserId: string, sellerUserId: string) {
  try {
    return await one<{ id: string; started_at: string }>(
      `insert into public.impersonation_logs (admin_user_id, seller_user_id)
       values ($1, $2)
       returning id, started_at`,
      [adminUserId, sellerUserId]
    );
  } catch (error) {
    throw new HttpError(500, `Failed to create impersonation log: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function closeImpersonationLog(logId: string, adminUserId: string) {
  try {
    const row = await maybeOne<{ id: string; ended_at: string }>(
      `update public.impersonation_logs
       set ended_at = now()
       where id = $1
         and admin_user_id = $2
         and ended_at is null
       returning id, ended_at`,
      [logId, adminUserId]
    );

    if (!row) {
      throw new HttpError(404, "Impersonation log not found or already closed");
    }

    return row;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to close impersonation log: ${error instanceof Error ? error.message : String(error)}`);
  }
}
