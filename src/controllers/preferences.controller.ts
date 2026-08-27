import { Request, Response, NextFunction } from "express";
import { preferencesService, PreferencesService } from "../services/preferences.service";
import { sendSuccess } from "../utils/apiResponse";
import { UnauthorizedError } from "../utils/appError";
import { validateUpdatePreferencesDto } from "../utils/preferences.validation";

export class PreferencesController {
  constructor(private readonly service: PreferencesService = preferencesService) {}

  /**
   * GET /api/v1/tourist/preferences
   */
  getPreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to view preferences");
      }

      const prefs = await this.service.getPreferences(req.user.id, req.scopedSupabase);
      sendSuccess(res, prefs, 200, "Travel preferences retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * PUT /api/v1/tourist/preferences
   */
  updatePreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to update preferences");
      }

      // Phase 8B — deterministic validation; invalid data is rejected (400), never coerced
      const dto = validateUpdatePreferencesDto(req.body);

      const updated = await this.service.updatePreferences(req.user.id, dto, req.scopedSupabase);
      sendSuccess(res, updated, 200, "Travel preferences updated successfully");
    } catch (err) {
      next(err);
    }
  };
}

export const preferencesController = new PreferencesController();
