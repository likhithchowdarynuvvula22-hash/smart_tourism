import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Database, SavedPlaceRow, SavedPlaceInsert } from "../types/database.types";
import { SavedPlacePopulatedDto } from "../types/trip";
import { InternalServerError } from "../utils/appError";
import { logger } from "../lib/logger";

export class SavedPlacesRepository {
  /**
   * Fetches all saved places for a user, populated with destination and attraction details.
   */
  async findSavedPlacesByUserId(
    userId: string,
    client: SupabaseClient<Database> = supabase
  ): Promise<SavedPlacePopulatedDto[]> {
    const { data, error } = await client
      .from("saved_places")
      .select("*, destination:destinations(*), attraction:attractions(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error({ error, userId }, "Error fetching user saved places");
      throw new InternalServerError("Failed to retrieve saved places");
    }

    return (data as unknown as SavedPlacePopulatedDto[]) || [];
  }

  /**
   * Finds an existing saved place for duplicate prevention.
   */
  async findSavedPlace(
    userId: string,
    destinationId?: string | null,
    attractionId?: string | null,
    client: SupabaseClient<Database> = supabase
  ): Promise<SavedPlaceRow | null> {
    let query = client.from("saved_places").select("*").eq("user_id", userId);

    if (destinationId) {
      query = query.eq("destination_id", destinationId);
    }
    if (attractionId) {
      query = query.eq("attraction_id", attractionId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      logger.error(
        { error, userId, destinationId, attractionId },
        "Error checking existing saved place"
      );
      throw new InternalServerError("Failed to check saved place");
    }

    return data;
  }

  /**
   * Bookmarks a destination or attraction.
   */
  async createSavedPlace(
    data: SavedPlaceInsert,
    client: SupabaseClient<Database> = supabase
  ): Promise<SavedPlaceRow> {
    const { data: created, error } = await client
      .from("saved_places")
      .insert(data)
      .select()
      .single();

    if (error || !created) {
      logger.error({ error, data }, "Error creating saved place");
      throw new InternalServerError("Failed to bookmark place");
    }

    return created;
  }

  /**
   * Deletes a saved place bookmark by bookmark ID and user ID.
   */
  async deleteById(
    id: string,
    userId: string,
    client: SupabaseClient<Database> = supabase
  ): Promise<boolean> {
    const { error } = await client.from("saved_places").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      logger.error({ error, id, userId }, "Error deleting saved place by ID");
      throw new InternalServerError("Failed to delete bookmark");
    }

    return true;
  }

  /**
   * Deletes a saved place bookmark by destination ID and user ID.
   */
  async deleteByDestination(
    destinationId: string,
    userId: string,
    client: SupabaseClient<Database> = supabase
  ): Promise<boolean> {
    const { error } = await client
      .from("saved_places")
      .delete()
      .eq("destination_id", destinationId)
      .eq("user_id", userId);

    if (error) {
      logger.error({ error, destinationId, userId }, "Error deleting saved place by destination");
      throw new InternalServerError("Failed to delete bookmark");
    }

    return true;
  }
}

export const savedPlacesRepository = new SavedPlacesRepository();
