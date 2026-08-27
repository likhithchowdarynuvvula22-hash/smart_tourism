import { Request, Response, NextFunction } from "express";
import { crowdService } from "../services/crowd.service";
import { sendSuccess } from "../utils/apiResponse";

export const getDestinationCrowd = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    const destinationId = Array.isArray(id) ? id[0] : id;
    const dateStr = typeof date === "string" ? date : undefined;

    const assessment = await crowdService.getCrowdAssessment(destinationId, dateStr);

    sendSuccess(res, assessment, 200, "Crowd intelligence assessment retrieved successfully");
  } catch (error) {
    next(error);
  }
};
