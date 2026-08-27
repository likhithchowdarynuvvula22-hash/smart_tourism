import { SupabaseClient } from "@supabase/supabase-js";
import { Database, TripRow, ItineraryItemRow } from "../types/database.types";
import {
  CreateTripDto,
  UpdateTripDto,
  CreateItineraryItemDto,
  UpdateItineraryItemDto,
  TripWithItemsDto
} from "../types/trip";
import { tripRepository, TripRepository } from "../repositories/trip.repository";
import {
  destinationRepository,
  DestinationRepository
} from "../repositories/destination.repository";
import { isValidUuid } from "../utils/validators";
import { BadRequestError, NotFoundError, ForbiddenError } from "../utils/appError";
import { logger } from "../lib/logger";

export class TripService {
  constructor(
    private readonly tripRepo: TripRepository = tripRepository,
    private readonly destRepo: DestinationRepository = destinationRepository
  ) {}

  /**
   * Validates trip UUID format and verifies ownership.
   */
  private async ensureTripOwnership(
    tripId: string,
    userId: string,
    client?: SupabaseClient<Database>
  ): Promise<TripRow> {
    if (!isValidUuid(tripId)) {
      throw new BadRequestError(`Invalid trip ID: '${tripId}'. Must be a valid UUID.`);
    }

    const trip = await this.tripRepo.findTripById(tripId, client);
    if (!trip) {
      throw new NotFoundError(`Trip with ID '${tripId}' not found`);
    }

    if (trip.user_id !== userId) {
      logger.warn(
        { tripId, ownerId: trip.user_id, requesterId: userId },
        "Cross-user trip access rejected"
      );
      throw new ForbiddenError("You do not have permission to access this trip");
    }

    return trip;
  }

  /**
   * Creates a new trip for the authenticated tourist.
   */
  async createTrip(
    userId: string,
    dto: CreateTripDto,
    client?: SupabaseClient<Database>
  ): Promise<TripRow> {
    if (!dto.name || typeof dto.name !== "string" || dto.name.trim().length === 0) {
      throw new BadRequestError("Trip name is required");
    }

    return this.tripRepo.createTrip(
      {
        user_id: userId,
        name: dto.name.trim(),
        start_date: dto.startDate || null,
        end_date: dto.endDate || null,
        status: dto.status || "planned"
      },
      client
    );
  }

  /**
   * Retrieves all trips owned by the user.
   */
  async getTrips(userId: string, client?: SupabaseClient<Database>): Promise<TripRow[]> {
    return this.tripRepo.findTripsByUserId(userId, client);
  }

  /**
   * Retrieves a single trip with its associated itinerary items.
   */
  async getTripById(
    tripId: string,
    userId: string,
    client?: SupabaseClient<Database>
  ): Promise<TripWithItemsDto> {
    const trip = await this.ensureTripOwnership(tripId, userId, client);
    const items = await this.tripRepo.findItemsByTripId(tripId, client);

    return {
      ...trip,
      items
    };
  }

  /**
   * Updates an existing trip owned by the user.
   */
  async updateTrip(
    tripId: string,
    userId: string,
    dto: UpdateTripDto,
    client?: SupabaseClient<Database>
  ): Promise<TripRow> {
    await this.ensureTripOwnership(tripId, userId, client);

    const updatePayload: Record<string, unknown> = {};
    if (dto.name !== undefined) updatePayload.name = dto.name.trim();
    if (dto.startDate !== undefined) updatePayload.start_date = dto.startDate;
    if (dto.endDate !== undefined) updatePayload.end_date = dto.endDate;
    if (dto.status !== undefined) updatePayload.status = dto.status;

    const updated = await this.tripRepo.updateTrip(tripId, updatePayload, client);
    if (!updated) {
      throw new NotFoundError(`Trip with ID '${tripId}' not found`);
    }

    return updated;
  }

  /**
   * Deletes a trip owned by the user.
   */
  async deleteTrip(
    tripId: string,
    userId: string,
    client?: SupabaseClient<Database>
  ): Promise<boolean> {
    await this.ensureTripOwnership(tripId, userId, client);
    return this.tripRepo.deleteTrip(tripId, client);
  }

  /**
   * Adds an itinerary item to a user's trip.
   */
  async addItineraryItem(
    tripId: string,
    userId: string,
    dto: CreateItineraryItemDto,
    client?: SupabaseClient<Database>
  ): Promise<ItineraryItemRow> {
    await this.ensureTripOwnership(tripId, userId, client);

    if (dto.destinationId) {
      if (!isValidUuid(dto.destinationId)) {
        throw new BadRequestError(`Invalid destination ID: '${dto.destinationId}'`);
      }
      const destination = await this.destRepo.findById(dto.destinationId);
      if (!destination) {
        throw new NotFoundError(`Destination '${dto.destinationId}' not found`);
      }
    }

    if (dto.attractionId && !isValidUuid(dto.attractionId)) {
      throw new BadRequestError(`Invalid attraction ID: '${dto.attractionId}'`);
    }

    return this.tripRepo.createItem(
      {
        trip_id: tripId,
        destination_id: dto.destinationId || null,
        attraction_id: dto.attractionId || null,
        visit_date: dto.visitDate || null,
        start_time: dto.startTime || null,
        end_time: dto.endTime || null,
        notes: dto.notes || null,
        sort_order: typeof dto.sortOrder === "number" ? dto.sortOrder : 0
      },
      client
    );
  }

  /**
   * Retrieves itinerary items for a user's trip.
   */
  async getItineraryItems(
    tripId: string,
    userId: string,
    client?: SupabaseClient<Database>
  ): Promise<ItineraryItemRow[]> {
    await this.ensureTripOwnership(tripId, userId, client);
    return this.tripRepo.findItemsByTripId(tripId, client);
  }

  /**
   * Updates an itinerary item in a user's trip.
   */
  async updateItineraryItem(
    tripId: string,
    itemId: string,
    userId: string,
    dto: UpdateItineraryItemDto,
    client?: SupabaseClient<Database>
  ): Promise<ItineraryItemRow> {
    await this.ensureTripOwnership(tripId, userId, client);

    if (!isValidUuid(itemId)) {
      throw new BadRequestError(`Invalid itinerary item ID: '${itemId}'`);
    }

    const item = await this.tripRepo.findItemById(itemId, client);
    if (!item || item.trip_id !== tripId) {
      throw new NotFoundError(`Itinerary item '${itemId}' not found in trip '${tripId}'`);
    }

    const payload: Record<string, unknown> = {};
    if (dto.destinationId !== undefined) payload.destination_id = dto.destinationId;
    if (dto.attractionId !== undefined) payload.attraction_id = dto.attractionId;
    if (dto.visitDate !== undefined) payload.visit_date = dto.visitDate;
    if (dto.startTime !== undefined) payload.start_time = dto.startTime;
    if (dto.endTime !== undefined) payload.end_time = dto.endTime;
    if (dto.notes !== undefined) payload.notes = dto.notes;
    if (dto.sortOrder !== undefined) payload.sort_order = dto.sortOrder;

    const updated = await this.tripRepo.updateItem(itemId, payload, client);
    if (!updated) {
      throw new NotFoundError(`Itinerary item '${itemId}' not found`);
    }

    return updated;
  }

  /**
   * Deletes an itinerary item from a user's trip.
   */
  async deleteItineraryItem(
    tripId: string,
    itemId: string,
    userId: string,
    client?: SupabaseClient<Database>
  ): Promise<boolean> {
    await this.ensureTripOwnership(tripId, userId, client);

    if (!isValidUuid(itemId)) {
      throw new BadRequestError(`Invalid itinerary item ID: '${itemId}'`);
    }

    const item = await this.tripRepo.findItemById(itemId, client);
    if (!item || item.trip_id !== tripId) {
      throw new NotFoundError(`Itinerary item '${itemId}' not found in trip '${tripId}'`);
    }

    return this.tripRepo.deleteItem(itemId, client);
  }
}

export const tripService = new TripService();
