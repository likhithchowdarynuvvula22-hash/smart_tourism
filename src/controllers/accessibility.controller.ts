import { Request, Response, NextFunction } from "express";
import { accessibilityService } from "../services/accessibility/accessibility.service";
import { sendSuccess } from "../utils/apiResponse";
import { validateUUID, validateDate } from "../utils/validators";
import { BadRequestError } from "../utils/appError";

/**
 * Controller handling grounded Accessibility & Elderly Travel Intelligence endpoints.
 */
export async function getDestinationAccessibility(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { date } = req.query;

    const destinationId = Array.isArray(id) ? id[0] : id;

    if (!validateUUID(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID format: '${destinationId}'. Must be a valid UUID.`
      );
    }

    if (date && typeof date === "string" && !validateDate(date)) {
      throw new BadRequestError(`Invalid date parameter format: '${date}'. Expected YYYY-MM-DD.`);
    }

    const assessment = await accessibilityService.getDestinationAccessibility(
      destinationId,
      typeof date === "string" ? date : undefined
    );

    sendSuccess(
      res,
      assessment,
      200,
      "Destination accessibility intelligence assessment retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Controller handling attraction-level accessibility features for a destination.
 */
export async function getAttractionAccessibility(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const destinationId = Array.isArray(id) ? id[0] : id;

    if (!validateUUID(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID format: '${destinationId}'. Must be a valid UUID.`
      );
    }

    const attractions = await accessibilityService.getAttractionAccessibility(destinationId);

    sendSuccess(
      res,
      attractions,
      200,
      "Attraction-level accessibility records retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Controller handling destination-level elderly travel suitability.
 */
export async function getDestinationElderlySupport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { date } = req.query;
    const destinationId = Array.isArray(id) ? id[0] : id;

    if (!validateUUID(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID format: '${destinationId}'. Must be a valid UUID.`
      );
    }

    if (date && typeof date === "string" && !validateDate(date)) {
      throw new BadRequestError(`Invalid date parameter format: '${date}'. Expected YYYY-MM-DD.`);
    }

    const assessment = await accessibilityService.getDestinationElderlySuitability(
      destinationId,
      typeof date === "string" ? date : undefined
    );

    sendSuccess(
      res,
      assessment,
      200,
      "Destination elderly travel suitability assessment retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
}
