import { Request, Response, NextFunction } from "express";
import { womenSafetyService } from "../services/safety/womenSafety.service";
import { sendSuccess } from "../utils/apiResponse";

export const getDestinationWomenSafety = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    const destinationId = Array.isArray(id) ? id[0] : id;
    const dateStr = typeof date === "string" ? date : undefined;

    const assessment = await womenSafetyService.getWomenSafetyAssessment(destinationId, dateStr);

    sendSuccess(
      res,
      assessment,
      200,
      "Women safety intelligence assessment retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
};
