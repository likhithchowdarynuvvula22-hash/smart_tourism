import { Request, Response, NextFunction } from "express";
import { sustainabilityService } from "../services/sustainability/sustainability.service";
import { SustainabilityFilterOptions } from "../types/sustainability";
import { isValidUuid } from "../utils/validators";
import { BadRequestError } from "../utils/appError";

/**
 * GET /api/v1/sustainability/destinations/:id
 * Returns a grounded sustainability assessment for a destination.
 * All claims are based strictly on verified database records.
 */
export async function getDestinationSustainability(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params["id"] as string;
    if (!isValidUuid(id)) {
      throw new BadRequestError(`Invalid destination ID format: '${id}'. Must be a valid UUID.`);
    }

    const options: SustainabilityFilterOptions = {
      preferCommunity: String(req.query.preferCommunity ?? "") === "true",
      preferEcoExperiences: String(req.query.preferEco ?? "") === "true",
      minimizeTravel: String(req.query.minimizeTravel ?? "") === "true"
    };

    const result = await sustainabilityService.getDestinationSustainability(id, options);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}
