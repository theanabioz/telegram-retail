import { supabaseAdmin } from "../../lib/supabase.js";
import { HttpError } from "../../lib/http-error.js";

export async function createImpersonationLog(adminUserId: string, sellerUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("impersonation_logs")
    .insert({
      admin_user_id: adminUserId,
      seller_user_id: sellerUserId,
    })
    .select("id, started_at")
    .single<{ id: string; started_at: string }>();

  if (error) {
    throw new HttpError(500, `Failed to create impersonation log: ${error.message}`);
  }

  return data;
}

export async function closeImpersonationLog(logId: string) {
  const { data, error } = await supabaseAdmin
    .from("impersonation_logs")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", logId)
    .is("ended_at", null)
    .select("id, ended_at")
    .maybeSingle<{ id: string; ended_at: string }>();

  if (error) {
    throw new HttpError(500, `Failed to close impersonation log: ${error.message}`);
  }

  if (!data) {
    throw new HttpError(404, "Impersonation log not found or already closed");
  }

  return data;
}
