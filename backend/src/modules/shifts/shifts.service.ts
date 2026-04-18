import { HttpError } from "../../lib/http-error.js";
import { findCurrentAssignment, findUserById } from "../users/users.repository.js";
import {
  createShift,
  findOpenShiftByUserId,
  listShiftsByUserId,
  updateShift,
  type ShiftRecord,
} from "./shifts.repository.js";

function secondsBetween(startIso: string, endIso: string) {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

function buildShiftSummary(shift: ShiftRecord) {
  const endedAt = shift.ended_at ?? new Date().toISOString();
  const pausedSeconds =
    shift.status === "paused" && shift.current_pause_started_at
      ? shift.paused_total_seconds + secondsBetween(shift.current_pause_started_at, endedAt)
      : shift.paused_total_seconds;

  const totalSeconds = secondsBetween(shift.started_at, endedAt);
  const workedSeconds = Math.max(0, totalSeconds - pausedSeconds);

  return {
    totalSeconds,
    pausedSeconds,
    workedSeconds,
  };
}

async function assertSellerCanUseStore(userId: string, storeId: string) {
  const assignment = await findCurrentAssignment(userId);

  if (!assignment) {
    throw new HttpError(403, "Seller has no active store assignment");
  }

  if (assignment.store_id !== storeId) {
    throw new HttpError(403, "Seller can only operate in the assigned store");
  }

  return assignment;
}

export async function getShiftState(userId: string) {
  const shift = await findOpenShiftByUserId(userId);

  return {
    activeShift: shift,
    summary: shift ? buildShiftSummary(shift) : null,
  };
}

export async function getShiftHistory(userId: string, limit: number, offset: number) {
  const shifts = await listShiftsByUserId(userId, limit, offset);

  return {
    items: shifts.map((shift) => ({
      shift,
      summary: buildShiftSummary(shift),
    })),
    pagination: {
      limit,
      offset,
      hasMore: shifts.length === limit,
    },
  };
}

export async function startShift(userId: string, storeId: string) {
  const user = await findUserById(userId);
  if (!user || user.role !== "seller" || !user.is_active) {
    throw new HttpError(403, "Only active sellers can start shifts");
  }

  await assertSellerCanUseStore(userId, storeId);

  const existing = await findOpenShiftByUserId(userId);
  if (existing) {
    throw new HttpError(409, "Seller already has an open shift");
  }

  const shift = await createShift({
    userId,
    storeId,
    startedAt: new Date().toISOString(),
  });

  return {
    shift,
    summary: buildShiftSummary(shift),
  };
}

export async function pauseShift(userId: string) {
  const shift = await findOpenShiftByUserId(userId);

  if (!shift) {
    throw new HttpError(404, "No open shift found");
  }

  if (shift.status === "paused") {
    throw new HttpError(409, "Shift is already paused");
  }

  if (shift.status !== "active") {
    throw new HttpError(409, "Only active shifts can be paused");
  }

  const pausedAt = new Date().toISOString();
  const updated = await updateShift(shift.id, {
    status: "paused",
    current_pause_started_at: pausedAt,
  });

  return {
    shift: updated,
    summary: buildShiftSummary(updated),
  };
}

export async function resumeShift(userId: string) {
  const shift = await findOpenShiftByUserId(userId);

  if (!shift) {
    throw new HttpError(404, "No open shift found");
  }

  if (shift.status !== "paused" || !shift.current_pause_started_at) {
    throw new HttpError(409, "Only paused shifts can be resumed");
  }

  const resumedAt = new Date().toISOString();
  const pauseDelta = secondsBetween(shift.current_pause_started_at, resumedAt);
  const updated = await updateShift(shift.id, {
    status: "active",
    paused_total_seconds: shift.paused_total_seconds + pauseDelta,
    current_pause_started_at: null,
  });

  return {
    shift: updated,
    summary: buildShiftSummary(updated),
  };
}

export async function stopShift(userId: string) {
  const shift = await findOpenShiftByUserId(userId);

  if (!shift) {
    throw new HttpError(404, "No open shift found");
  }

  const endedAt = new Date().toISOString();
  const finalPausedSeconds =
    shift.status === "paused" && shift.current_pause_started_at
      ? shift.paused_total_seconds + secondsBetween(shift.current_pause_started_at, endedAt)
      : shift.paused_total_seconds;

  const updated = await updateShift(shift.id, {
    status: "closed",
    ended_at: endedAt,
    paused_total_seconds: finalPausedSeconds,
    current_pause_started_at: null,
  });

  return {
    shift: updated,
    summary: buildShiftSummary(updated),
  };
}
