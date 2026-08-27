import { Request, Response, NextFunction } from "express";
import { ExperienceService, experienceService } from "../services/experience/experience.service";
import { ExperienceQueryOptions } from "../types/experience";

export class ExperienceController {
  constructor(private readonly service: ExperienceService = experienceService) {}

  /**
   * GET /api/v1/experiences/destinations/:id
   * Public endpoint to retrieve verified experiences and cultural intelligence for a destination.
   */
  getDestinationExperiences = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = String(req.params.id);
      const {
        interests,
        avoid,
        avoidInterests,
        includeAttractions,
        includeBusinesses,
        isElderlyTraveller,
        isWheelchairUser,
        isBudgetConstrained,
        isSoloFemale,
        limit
      } = req.query;

      const parsedInterests = interests
        ? Array.isArray(interests)
          ? interests.map(String)
          : String(interests)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
        : undefined;

      const rawAvoid = avoid || avoidInterests;
      const parsedAvoid = rawAvoid
        ? Array.isArray(rawAvoid)
          ? rawAvoid.map(String)
          : String(rawAvoid)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
        : undefined;

      const options: ExperienceQueryOptions = {
        interests: parsedInterests,
        avoidInterests: parsedAvoid,
        includeAttractions: includeAttractions !== undefined ? includeAttractions === "true" : true,
        includeBusinesses: includeBusinesses === "true",
        isElderlyTraveller: isElderlyTraveller === "true",
        isWheelchairUser: isWheelchairUser === "true",
        isBudgetConstrained: isBudgetConstrained === "true",
        isSoloFemale: isSoloFemale === "true",
        limit: limit ? Number(limit) : undefined
      };

      const userId = (req as { user?: { id?: string } }).user?.id;
      const result = await this.service.getDestinationExperiences(id, options, userId);

      res.status(200).json({
        status: "success",
        data: result
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/experiences/categories
   * Public endpoint to retrieve supported experience categories.
   */
  getCategories = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = this.service.getCategories();
      res.status(200).json({
        status: "success",
        data
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/experiences/rank
   * Public endpoint to rank custom experience items.
   */
  rankCandidates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { items, options } = req.body;
      const ranked = this.service.rankCustomCandidates(items || [], options || {});
      res.status(200).json({
        status: "success",
        data: ranked
      });
    } catch (err) {
      next(err);
    }
  };
}

export const experienceController = new ExperienceController();
