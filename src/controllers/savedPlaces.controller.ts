import { Request, Response, NextFunction } from "express";
import { savedPlacesService, SavedPlacesService } from "../services/savedPlaces.service";
import { sendSuccess } from "../utils/apiResponse";
import { UnauthorizedError } from "../utils/appError";

export class SavedPlacesController {
  constructor(private readonly service: SavedPlacesService = savedPlacesService) {}

  /**
   * POST /api/v1/saved-places
   */
  savePlace = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to bookmark places");
      }

      const saved = await this.service.savePlace(req.user.id, req.body, req.scopedSupabase);
      sendSuccess(res, saved, 201, "Place bookmarked successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/saved-places
   */
  getSavedPlaces = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to retrieve saved places");
      }

      const places = await this.service.getSavedPlaces(req.user.id, req.scopedSupabase);
      sendSuccess(res, places, 200, "Saved places retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/v1/saved-places/:id
   */
  removeSavedPlace = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to remove bookmarked place");
      }

      const id = req.params.id as string;
      await this.service.removeSavedPlace(id, req.user.id, req.scopedSupabase);
      sendSuccess(res, { removed: true }, 200, "Bookmark removed successfully");
    } catch (err) {
      next(err);
    }
  };
}

export const savedPlacesController = new SavedPlacesController();
