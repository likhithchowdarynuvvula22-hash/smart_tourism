import { supabase } from "../lib/supabase";
import { DestinationRow } from "../types/database.types";
import { DestinationFilterOptions } from "../types/tourism";
import { InternalServerError } from "../utils/appError";
import { logger } from "../lib/logger";

export type DestinationQueryOptions = DestinationFilterOptions & {
  offset?: number;
  limit?: number;
};

export class DestinationRepository {
  /**
   * Fetches a filtered and paginated list of destinations from Supabase.
   */
  async findMany(
    options: DestinationFilterOptions & { offset?: number; limit?: number } = {}
  ): Promise<DestinationRow[]> {
    const {
      offset = 0,
      limit = 10,
      search,
      state,
      district,
      sortBy = "name",
      sortOrder = "asc"
    } = options;

    let query = supabase.from("destinations").select("*");

    if (search && search.trim().length > 0) {
      const sanitized = search
        .trim()
        .replace(/[%_;'"`\\()]/g, "")
        .replace(/--/g, "")
        .trim();
      if (sanitized.length > 0) {
        query = query.or(
          `name.ilike.%${sanitized}%,city.ilike.%${sanitized}%,district.ilike.%${sanitized}%`
        );
      }
    }

    if (state && state.trim().length > 0) {
      query = query.ilike("state", `%${state.trim()}%`);
    }

    if (district && district.trim().length > 0) {
      query = query.ilike("district", `%${district.trim()}%`);
    }

    const allowedSortFields = ["name", "state", "district", "city", "created_at", "popularity"];
    const safeSortBy = allowedSortFields.includes(String(sortBy)) ? String(sortBy) : "name";
    const safeSortOrder = String(sortOrder).toLowerCase() === "desc" ? "desc" : "asc";

    query = query
      .order(safeSortBy, { ascending: safeSortOrder === "asc" })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      logger.error({ error, options }, "Error querying destinations from repository");
      throw new InternalServerError("Failed to query destinations from database");
    }

    return data || [];
  }

  /**
   * Counts the total number of destinations matching the specified filters.
   */
  async count(options: DestinationFilterOptions = {}): Promise<number> {
    const { search, state, district } = options;

    let query = supabase.from("destinations").select("*", { count: "exact", head: true });

    if (search && search.trim().length > 0) {
      const sanitized = search
        .trim()
        .replace(/[%_;'"`\\()]/g, "")
        .replace(/--/g, "")
        .trim();
      if (sanitized.length > 0) {
        query = query.or(
          `name.ilike.%${sanitized}%,city.ilike.%${sanitized}%,district.ilike.%${sanitized}%`
        );
      }
    }

    if (state && state.trim().length > 0) {
      query = query.ilike("state", `%${state.trim()}%`);
    }

    if (district && district.trim().length > 0) {
      query = query.ilike("district", `%${district.trim()}%`);
    }

    const { count, error } = await query;

    if (error) {
      logger.error({ error, options }, "Error counting destinations from repository");
      throw new InternalServerError("Failed to count destinations in database");
    }

    return count ?? 0;
  }

  private readonly idCache: Map<string, { row: DestinationRow | null; expiresAt: number }> =
    new Map();

  /**
   * Fetches a single destination by its primary UUID with a safe short-lived memory micro-cache.
   */
  async findById(id: string): Promise<DestinationRow | null> {
    const cached = this.idCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.row;
    }

    const { data, error } = await supabase
      .from("destinations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      logger.error({ error, id }, "Error fetching destination by ID from repository");
      throw new InternalServerError("Failed to retrieve destination from database");
    }

    this.idCache.set(id, { row: data, expiresAt: Date.now() + 30000 });
    return data;
  }

  /**
   * Fetches all unique states and the count of destinations in each state.
   */
  async getStates(): Promise<{ state: string; count: number }[]> {
    const { data, error } = await supabase.from("destinations").select("state");

    if (error) {
      logger.error({ error }, "Error querying states from repository");
      throw new InternalServerError("Failed to query states from database");
    }

    const stateCountMap: Record<string, number> = {};
    (data || []).forEach((row) => {
      if (row.state && row.state.trim().length > 0) {
        const s = row.state.trim();
        stateCountMap[s] = (stateCountMap[s] || 0) + 1;
      }
    });

    return Object.entries(stateCountMap)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => a.state.localeCompare(b.state));
  }
}

export const destinationRepository = new DestinationRepository();
