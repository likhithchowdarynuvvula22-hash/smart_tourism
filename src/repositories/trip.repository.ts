import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  Database,
  TripRow,
  TripInsert,
  TripUpdate,
  ItineraryItemRow,
  ItineraryItemInsert,
  ItineraryItemUpdate
} from "../types/database.types";
import { InternalServerError } from "../utils/appError";
import { logger } from "../lib/logger";

export class TripRepository {
  /**
   * Fetches all trips belonging to a user.
   */
  async findTripsByUserId(
    userId: string,
    client: SupabaseClient<Database> = supabase
  ): Promise<TripRow[]> {
    const { data, error } = await client
      .from("trips")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error({ error, userId }, "Error finding user trips");
      throw new InternalServerError("Failed to retrieve user trips");
    }

    return data || [];
  }

  /**
   * Fetches a single trip by ID.
   */
  async findTripById(
    tripId: string,
    client: SupabaseClient<Database> = supabase
  ): Promise<TripRow | null> {
    const { data, error } = await client.from("trips").select("*").eq("id", tripId).maybeSingle();

    if (error) {
      logger.error({ error, tripId }, "Error finding trip by ID");
      throw new InternalServerError("Failed to retrieve trip");
    }

    return data;
  }

  /**
   * Creates a new trip.
   */
  async createTrip(
    data: TripInsert,
    client: SupabaseClient<Database> = supabase
  ): Promise<TripRow> {
    const { data: created, error } = await client.from("trips").insert(data).select().single();

    if (error || !created) {
      logger.error({ error, data }, "Error creating trip in database");
      throw new InternalServerError("Failed to create trip");
    }

    return created;
  }

  /**
   * Updates an existing trip.
   */
  async updateTrip(
    tripId: string,
    data: TripUpdate,
    client: SupabaseClient<Database> = supabase
  ): Promise<TripRow | null> {
    const { data: updated, error } = await client
      .from("trips")
      .update(data)
      .eq("id", tripId)
      .select()
      .maybeSingle();

    if (error) {
      logger.error({ error, tripId, data }, "Error updating trip");
      throw new InternalServerError("Failed to update trip");
    }

    return updated;
  }

  /**
   * Deletes a trip.
   */
  async deleteTrip(tripId: string, client: SupabaseClient<Database> = supabase): Promise<boolean> {
    const { error } = await client.from("trips").delete().eq("id", tripId);

    if (error) {
      logger.error({ error, tripId }, "Error deleting trip");
      throw new InternalServerError("Failed to delete trip");
    }

    return true;
  }

  /**
   * Fetches all itinerary items belonging to a trip, ordered by date and sort order.
   */
  async findItemsByTripId(
    tripId: string,
    client: SupabaseClient<Database> = supabase
  ): Promise<ItineraryItemRow[]> {
    const { data, error } = await client
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", tripId)
      .order("visit_date", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error) {
      logger.error({ error, tripId }, "Error finding itinerary items");
      throw new InternalServerError("Failed to retrieve itinerary items");
    }

    return data || [];
  }

  /**
   * Fetches a single itinerary item by ID.
   */
  async findItemById(
    itemId: string,
    client: SupabaseClient<Database> = supabase
  ): Promise<ItineraryItemRow | null> {
    const { data, error } = await client
      .from("itinerary_items")
      .select("*")
      .eq("id", itemId)
      .maybeSingle();

    if (error) {
      logger.error({ error, itemId }, "Error finding itinerary item by ID");
      throw new InternalServerError("Failed to retrieve itinerary item");
    }

    return data;
  }

  /**
   * Adds an itinerary item to a trip.
   */
  async createItem(
    data: ItineraryItemInsert,
    client: SupabaseClient<Database> = supabase
  ): Promise<ItineraryItemRow> {
    const { data: created, error } = await client
      .from("itinerary_items")
      .insert(data)
      .select()
      .single();

    if (error || !created) {
      logger.error({ error, data }, "Error creating itinerary item");
      throw new InternalServerError("Failed to create itinerary item");
    }

    return created;
  }

  /**
   * Updates an itinerary item.
   */
  async updateItem(
    itemId: string,
    data: ItineraryItemUpdate,
    client: SupabaseClient<Database> = supabase
  ): Promise<ItineraryItemRow | null> {
    const { data: updated, error } = await client
      .from("itinerary_items")
      .update(data)
      .eq("id", itemId)
      .select()
      .maybeSingle();

    if (error) {
      logger.error({ error, itemId, data }, "Error updating itinerary item");
      throw new InternalServerError("Failed to update itinerary item");
    }

    return updated;
  }

  /**
   * Deletes an itinerary item.
   */
  async deleteItem(itemId: string, client: SupabaseClient<Database> = supabase): Promise<boolean> {
    const { error } = await client.from("itinerary_items").delete().eq("id", itemId);

    if (error) {
      logger.error({ error, itemId }, "Error deleting itinerary item");
      throw new InternalServerError("Failed to delete itinerary item");
    }

    return true;
  }
}

export const tripRepository = new TripRepository();
