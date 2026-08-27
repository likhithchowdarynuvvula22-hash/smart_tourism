import { Request, Response, NextFunction } from "express";
import { contentService } from "../services/content/content.service";
import { sendSuccess } from "../utils/apiResponse";

/**
 * GET /api/v1/content/destinations/:id/images
 * Retrieves verified photography metadata and accessible alt text for a destination.
 */
export async function getDestinationGallery(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const gallery = await contentService.getDestinationGallery(id);
    sendSuccess(res, gallery, 200);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/content/destinations/:id/summary
 * Retrieves a structured, grounded content summary for a destination.
 */
export async function getDestinationSummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const summary = await contentService.getDestinationSummary(id);
    sendSuccess(res, summary, 200);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/content/destinations/:id/multilingual
 * Retrieves multilingual tourism content with dual-language provenance.
 * Query params: ?lang=te
 */
export async function getMultilingualContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const lang = (req.query.lang as string) || "en";
    const multilingual = await contentService.getMultilingualContent(id, lang);
    sendSuccess(res, multilingual, 200);
  } catch (error) {
    next(error);
  }
}
