import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Database, UserProfileRow, TouristProfileRow } from "../types/database.types";
import { AppRole } from "../types/auth";
import { InternalServerError } from "../utils/appError";
import { logger } from "../lib/logger";

export class UserRepository {
  /**
   * Finds a user profile by the user's Auth UUID.
   */
  async findProfileById(
    userId: string,
    client: SupabaseClient<Database> = supabase
  ): Promise<UserProfileRow | null> {
    const { data, error } = await client
      .from("users_profile")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      logger.error({ error, userId }, "Error fetching user profile from repository");
      throw new InternalServerError("Failed to retrieve user profile");
    }

    return data;
  }

  /**
   * Resolves application roles assigned to a user from the user_roles table.
   */
  async findRolesByUserId(
    userId: string,
    client: SupabaseClient<Database> = supabase
  ): Promise<AppRole[]> {
    const { data, error } = await client.from("user_roles").select("role").eq("user_id", userId);

    if (error) {
      logger.error({ error, userId }, "Error fetching user roles from repository");
      throw new InternalServerError("Failed to resolve user roles");
    }

    if (!data || data.length === 0) {
      return [];
    }

    const validRoles: AppRole[] = ["tourist", "business", "admin"];
    const roles: AppRole[] = [];

    for (const item of data) {
      const lower = item.role?.toLowerCase() as AppRole;
      if (validRoles.includes(lower) && !roles.includes(lower)) {
        roles.push(lower);
      }
    }

    return roles;
  }

  /**
   * Finds tourist specific profile preferences if the user is a tourist.
   */
  async findTouristProfileByUserId(
    userId: string,
    client: SupabaseClient<Database> = supabase
  ): Promise<TouristProfileRow | null> {
    const { data, error } = await client
      .from("tourist_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.error({ error, userId }, "Error fetching tourist profile from repository");
      throw new InternalServerError("Failed to retrieve tourist profile");
    }

    return data;
  }

  /**
   * Phase 8B — updates the user's preferred language in users_profile.
   */
  async updatePreferredLanguage(
    userId: string,
    preferredLanguage: string | null,
    client: SupabaseClient<Database> = supabase
  ): Promise<UserProfileRow | null> {
    const { data, error } = await client
      .from("users_profile")
      .update({ preferred_language: preferredLanguage, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .maybeSingle();

    if (error) {
      logger.error({ error, userId }, "Error updating preferred language");
      throw new InternalServerError("Failed to update preferred language");
    }

    return data;
  }
}

export const userRepository = new UserRepository();
