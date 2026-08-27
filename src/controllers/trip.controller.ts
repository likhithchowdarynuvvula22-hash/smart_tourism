import { Request, Response, NextFunction } from "express";
import { tripService, TripService } from "../services/trip.service";
import { sendSuccess } from "../utils/apiResponse";
import { UnauthorizedError } from "../utils/appError";

export class TripController {
  constructor(private readonly service: TripService = tripService) {}

  /**
   * POST /api/v1/trips
   */
  createTrip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to create a trip");
      }

      const trip = await this.service.createTrip(req.user.id, req.body, req.scopedSupabase);
      sendSuccess(res, trip, 201, "Trip created successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/trips
   */
  getTrips = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to retrieve trips");
      }

      const trips = await this.service.getTrips(req.user.id, req.scopedSupabase);
      sendSuccess(res, trips, 200, "User trips retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/trips/:id
   */
  getTripById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to view trip details");
      }

      const id = req.params.id as string;
      const trip = await this.service.getTripById(id, req.user.id, req.scopedSupabase);
      sendSuccess(res, trip, 200, "Trip details retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * PUT /api/v1/trips/:id
   */
  updateTrip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to update trip");
      }

      const id = req.params.id as string;
      const updated = await this.service.updateTrip(id, req.user.id, req.body, req.scopedSupabase);
      sendSuccess(res, updated, 200, "Trip updated successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/v1/trips/:id
   */
  deleteTrip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to delete trip");
      }

      const id = req.params.id as string;
      await this.service.deleteTrip(id, req.user.id, req.scopedSupabase);
      sendSuccess(res, { deleted: true }, 200, "Trip deleted successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/trips/:id/items
   */
  addItineraryItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to add itinerary item");
      }

      const id = req.params.id as string;
      const item = await this.service.addItineraryItem(
        id,
        req.user.id,
        req.body,
        req.scopedSupabase
      );
      sendSuccess(res, item, 201, "Itinerary item added successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/trips/:id/items
   */
  getItineraryItems = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to retrieve itinerary items");
      }

      const id = req.params.id as string;
      const items = await this.service.getItineraryItems(id, req.user.id, req.scopedSupabase);
      sendSuccess(res, items, 200, "Itinerary items retrieved successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * PUT /api/v1/trips/:id/items/:itemId
   */
  updateItineraryItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to update itinerary item");
      }

      const id = req.params.id as string;
      const itemId = req.params.itemId as string;
      const item = await this.service.updateItineraryItem(
        id,
        itemId,
        req.user.id,
        req.body,
        req.scopedSupabase
      );
      sendSuccess(res, item, 200, "Itinerary item updated successfully");
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/v1/trips/:id/items/:itemId
   */
  deleteItineraryItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Authentication required to delete itinerary item");
      }

      const id = req.params.id as string;
      const itemId = req.params.itemId as string;
      await this.service.deleteItineraryItem(id, itemId, req.user.id, req.scopedSupabase);
      sendSuccess(res, { deleted: true }, 200, "Itinerary item deleted successfully");
    } catch (err) {
      next(err);
    }
  };
}

export const tripController = new TripController();
