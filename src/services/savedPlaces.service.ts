import { SupabaseClient } from "@supabase/supabase-js";
import { Database, SavedPlaceRow } from "../types/database.types";
import { SavePlaceDto, SavedPlacePopulatedDto } from "../types/trip";
import {
  savedPlacesRepository,
  SavedPlacesRepository
} from "../repositories/savedPlaces.repository";
import {
  destinationRepository,
  DestinationRepository
} from "../repositories/destination.repository";
import { isValidUuid } from "../utils/validators";
import { BadRequestError, NotFoundError } from "../utils/appError";

export class SavedPlacesService {
  constructor(
    private readonly savedRepo: SavedPlacesRepository = savedPlacesRepository,
    private readonly destRepo: DestinationRepository = destinationRepository
  ) {}

  /**
   * Bookmarks a destination or attraction for the user.
   */
  async savePlace(
    userId: string,
    dto: SavePlaceDto,
    client?: SupabaseClient<Database>
  ): Promise<SavedPlaceRow> {
    if (!dto.destinationId && !dto.attractionId) {
      throw new BadRequestError("Either destinationId or attractionId must be provided");
    }

    if (dto.destinationId) {
      if (!isValidUuid(dto.destinationId)) {
        throw new BadRequestError(`Invalid destination ID format: '${dto.destinationId}'`);
      }
      const destination = await this.destRepo.findById(dto.destinationId);
      if (!destination) {
        throw new NotFoundError(`Destination with ID '${dto.destinationId}' not found`);
      }
    }

    if (dto.attractionId && !isValidUuid(dto.attractionId)) {
      throw new BadRequestError(`Invalid attraction ID format: '${dto.attractionId}'`);
    }

    // Duplicate check
    const existing = await this.savedRepo.findSavedPlace(
      userId,
      dto.destinationId,
      dto.attractionId,
      client
    );
    if (existing) {
      return existing;
    }

    return this.savedRepo.createSavedPlace(
      {
        user_id: userId,
        destination_id: dto.destinationId || null,
        attraction_id: dto.attractionId || null
      },
      client
    );
  }

  /**
   * Retrieves all saved places for the user with populated details.
   */
  async getSavedPlaces(
    userId: string,
    client?: SupabaseClient<Database>
  ): Promise<SavedPlacePopulatedDto[]> {
    return this.savedRepo.findSavedPlacesByUserId(userId, client);
  }

  /**
   * Removes a bookmark by bookmark ID or destination ID.
   */
  async removeSavedPlace(
    identifier: string,
    userId: string,
    client?: SupabaseClient<Database>
  ): Promise<boolean> {
    if (!isValidUuid(identifier)) {
      throw new BadRequestError(`Invalid ID format: '${identifier}'`);
    }

    // Try deleting by bookmark ID first, then by destination ID
    await this.savedRepo.deleteById(identifier, userId, client);
    await this.savedRepo.deleteByDestination(identifier, userId, client);
    return true;
  }
}

export const savedPlacesService = new SavedPlacesService();
