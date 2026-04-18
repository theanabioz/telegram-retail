import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { shiftHistoryQuerySchema, startShiftBodySchema } from "../modules/shifts/shift.schemas.js";
import {
  getShiftHistory,
  getShiftState,
  pauseShift,
  resumeShift,
  startShift,
  stopShift,
} from "../modules/shifts/shifts.service.js";

export const shiftsRouter = Router();

shiftsRouter.use(requireAuth, requireRole("seller"));

shiftsRouter.get(
  "/current",
  asyncHandler(async (req, res) => {
    const result = await getShiftState(req.auth!.app_user_id);
    res.json(result);
  })
);

shiftsRouter.get(
  "/history",
  asyncHandler(async (req, res) => {
    const query = shiftHistoryQuerySchema.parse(req.query);
    const result = await getShiftHistory(req.auth!.app_user_id, query.limit, query.offset);
    res.json(result);
  })
);

shiftsRouter.post(
  "/start",
  asyncHandler(async (req, res) => {
    const body = startShiftBodySchema.parse(req.body);
    const result = await startShift(req.auth!.app_user_id, body.storeId);
    res.status(201).json(result);
  })
);

shiftsRouter.post(
  "/pause",
  asyncHandler(async (req, res) => {
    const result = await pauseShift(req.auth!.app_user_id);
    res.json(result);
  })
);

shiftsRouter.post(
  "/resume",
  asyncHandler(async (req, res) => {
    const result = await resumeShift(req.auth!.app_user_id);
    res.json(result);
  })
);

shiftsRouter.post(
  "/stop",
  asyncHandler(async (req, res) => {
    const result = await stopShift(req.auth!.app_user_id);
    res.json(result);
  })
);
