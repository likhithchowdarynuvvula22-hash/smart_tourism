import { Request, Response, NextFunction } from "express";
import { tourismService, TourismService } from "../services/tourism.service";
import { sendSuccess, sendPaginatedSuccess } from "../utils/apiResponse";

export class DestinationController {
  constructor(private readonly service: TourismService = tourismService) {}

  /**
   * GET /api/v1/destinations
   * Paginated list of destinations with search and state filtering.
   */
  getDestinations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawSearch = req.query.search || req.query.q;
      const search = Array.isArray(rawSearch)
        ? String(rawSearch[0])
        : typeof rawSearch === "string"
          ? rawSearch
          : undefined;

      const rawState = req.query.state;
      const state = Array.isArray(rawState)
        ? String(rawState[0])
        : typeof rawState === "string"
          ? rawState
          : undefined;

      const rawDistrict = req.query.district;
      const district = Array.isArray(rawDistrict)
        ? String(rawDistrict[0])
        : typeof rawDistrict === "string"
          ? rawDistrict
          : undefined;

      const rawSortBy = req.query.sortBy;
      const sortBy = (
        Array.isArray(rawSortBy)
          ? String(rawSortBy[0])
          : typeof rawSortBy === "string"
            ? rawSortBy
            : undefined
      ) as "name" | "state" | "created_at" | undefined;

      const rawSortOrder = req.query.sortOrder;
      const sortOrder = (
        Array.isArray(rawSortOrder)
          ? String(rawSortOrder[0])
          : typeof rawSortOrder === "string"
            ? rawSortOrder
            : undefined
      ) as "asc" | "desc" | undefined;

      const result = await this.service.getDestinations({
        ...req.query,
        search,
        state,
        district,
        sortBy,
        sortOrder
      });

      sendPaginatedSuccess(
        res,
        result.destinations,
        result.pagination,
        200,
        "Destinations retrieved successfully"
      );
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/states
   * List all unique states with their destination counts.
   */
  getStates = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const states = await this.service.getStates();
      sendSuccess(res, states, 200, "States retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id
   * Destination detail lookup by UUID.
   */
  getDestinationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const destination = await this.service.getDestinationById(id);
      sendSuccess(res, destination, 200, "Destination details retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id/attractions
   */
  getAttractions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const attractions = await this.service.getAttractions(id);
      sendSuccess(res, attractions, 200, "Destination attractions retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id/experiences
   */
  getExperiences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const experiences = await this.service.getExperiences(id);
      sendSuccess(res, experiences, 200, "Destination experiences retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id/opening-hours
   */
  getOpeningHours = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const hours = await this.service.getOpeningHours(id);
      sendSuccess(res, hours, 200, "Destination opening hours retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id/entry-fees
   */
  getEntryFees = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const fees = await this.service.getEntryFees(id);
      sendSuccess(res, fees, 200, "Destination entry fees retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id/accessibility
   */
  getAccessibility = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const accessibility = await this.service.getAccessibility(id);
      sendSuccess(
        res,
        accessibility,
        200,
        "Destination accessibility features retrieved successfully"
      );
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id/elderly-support
   */
  getElderlySupport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const elderlySupport = await this.service.getElderlySupport(id);
      sendSuccess(
        res,
        elderlySupport,
        200,
        "Destination elderly support features retrieved successfully"
      );
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id/images
   */
  getImages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const images = await this.service.getImages(id);
      sendSuccess(res, images, 200, "Destination images retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id/languages
   */
  getLanguages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const languages = await this.service.getLanguages(id);
      sendSuccess(res, languages, 200, "Destination language information retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id/safety
   */
  getSafety = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const safety = await this.service.getSafety(id);
      sendSuccess(res, safety, 200, "Destination safety information retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id/emergency-resources
   */
  getEmergencyResources = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = req.params.id as string;
      const resources = await this.service.getEmergencyResources(id);
      sendSuccess(res, resources, 200, "Emergency resources retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id/businesses
   */
  getLocalBusinesses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const businesses = await this.service.getLocalBusinesses(id, limit);
      sendSuccess(res, businesses, 200, "Local businesses retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/destinations/:id/reviews
   */
  getReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const reviews = await this.service.getReviews(id);
      sendSuccess(res, reviews, 200, "Reviews retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/destinations/:id/reviews
   */
  createReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { userName, rating, comment } = req.body;
      const review = await this.service.createReview(id, userName, Number(rating), comment);
      sendSuccess(res, review, 201, "Review submitted successfully");
    } catch (err) {
      next(err);
    }
  };
}

export const destinationController = new DestinationController();
