import { Request, Response, NextFunction } from "express";
import { businessService } from "../services/business/business.service";
import { sendSuccess } from "../utils/apiResponse";

/**
 * GET /api/v1/businesses/destinations/:id
 * Retrieves verified local businesses for a destination with filtering and ranking.
 */
export async function getDestinationBusinesses(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;
    const verified = req.query.verified === "true";
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const userId = req.user?.id;

    const result = await businessService.getDestinationBusinesses(
      id,
      {
        category,
        search,
        verifiedOnly: verified,
        limit
      },
      userId
    );

    sendSuccess(res, result, 200);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/businesses/:id
 * Retrieves verified details for a single local commercial enterprise.
 */
export async function getBusinessById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const business = await businessService.getBusinessById(id);
    sendSuccess(res, business, 200);
  } catch (error) {
    next(error);
  }
}
