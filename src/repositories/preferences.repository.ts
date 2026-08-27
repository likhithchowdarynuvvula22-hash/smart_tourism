import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  Database,
  TravelPreferenceRow,
  TravelPreferenceInsert,
  TouristProfileRow,
  TouristProfileInsert
} from "../types/database.types";
import { InternalServerError } from "../utils/appError";
import { logger } from "../lib/logger";

export class PreferencesRepository {
  /**
   * Fetches travel preferences for a user.
   */
  async findTravelPreferences(
    userId: string,
    client: SupabaseClient<Database> = supabase
  ): Promise<TravelPreferenceRow | null> {
    const { data, error } = await client
      .from("travel_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.error({ error, userId }, "Error fetching travel preferences");
      throw new InternalServerError("Failed to retrieve travel preferences");
    }

    return data;
  }

  /**
   * Upserts travel preferences for a user.
   * NOTE: travel_preferences.user_id carries no UNIQUE constraint in the live
   * database, so PostgREST `onConflict: "user_id"` is not usable. Deterministic
   * existence-check + insert/update instead (no schema change required).
   */
  async upsertTravelPreferences(
    userId: string,
    data: Partial<TravelPreferenceInsert>,
    client: SupabaseClient<Database> = supabase
  ): Promise<TravelPreferenceRow> {
    const payload: TravelPreferenceInsert = {
      ...data,
      user_id: userId
    };

    const existing = await this.findTravelPreferences(userId, client);

    if (existing) {
      const { data: updated, error } = await client
        .from("travel_preferences")
        .update(payload)
        .eq("user_id", userId)
        .select()
        .single();

      if (error || !updated) {
        logger.error({ error, userId, data }, "Error updating travel preferences");
        throw new InternalServerError("Failed to update travel preferences");
      }
      return updated;
    }

    const { data: inserted, error } = await client
      .from("travel_preferences")
      .insert(payload)
      .select()
      .single();

    if (error || !inserted) {
      logger.error({ error, userId, data }, "Error inserting travel preferences");
      throw new InternalServerError("Failed to create travel preferences");
    }
    return inserted;
  }

  /**
   * Fetches tourist profile for a user.
   */
  async findTouristProfile(
    userId: string,
    client: SupabaseClient<Database> = supabase
  ): Promise<TouristProfileRow | null> {
    const { data, error } = await client
      .from("tourist_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.error({ error, userId }, "Error fetching tourist profile");
      throw new InternalServerError("Failed to retrieve tourist profile");
    }

    return data;
  }

  /**
   * Upserts tourist profile for a user.
   */
  async upsertTouristProfile(
    userId: string,
    data: Partial<TouristProfileInsert>,
    client: SupabaseClient<Database> = supabase
  ): Promise<TouristProfileRow> {
    const payload: TouristProfileInsert = {
      ...data,
      user_id: userId,
      updated_at: new Date().toISOString()
    };

    const { data: upserted, error } = await client
      .from("tourist_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single();

    if (error || !upserted) {
      logger.error({ error, userId, data }, "Error upserting tourist profile");
      throw new InternalServerError("Failed to update tourist profile");
    }

    return upserted;
  }
}

export const preferencesRepository = new PreferencesRepository();
