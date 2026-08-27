import { supabase } from "../lib/supabase";
import { Database } from "../types/database.types";
import { InternalServerError } from "../utils/appError";
import { logger } from "../lib/logger";

type CrowdDataRow = Database["public"]["Tables"]["crowd_data"]["Row"];
type DemandDataRow = Database["public"]["Tables"]["demand_data"]["Row"];
type VisitorCountsRow = Database["public"]["Tables"]["visitor_counts"]["Row"];
type DemandForecastsRow = Database["public"]["Tables"]["demand_forecasts"]["Row"];
type AIPredictionsRow = Database["public"]["Tables"]["ai_predictions"]["Row"];

export class CrowdRepository {
  /**
   * Retrieves crowd data records for a specific destination.
   */
  async getCrowdData(destinationId: string): Promise<CrowdDataRow[]> {
    const { data, error } = await supabase
      .from("crowd_data")
      .select("*")
      .eq("destination_id", destinationId)
      .order("observed_at", { ascending: false });

    if (error) {
      logger.error({ error, destinationId }, "Failed to fetch crowd_data from Supabase");
      throw new InternalServerError("Failed to retrieve crowd observations from database");
    }

    return data || [];
  }

  /**
   * Retrieves demand data for a destination or its enclosing state.
   */
  async getDemandData(destinationId?: string, state?: string): Promise<DemandDataRow[]> {
    let query = supabase.from("demand_data").select("*");

    if (destinationId) {
      query = query.eq("destination_id", destinationId);
    } else if (state) {
      query = query.eq("state", state);
    }

    const { data, error } = await query.order("year", { ascending: false });

    if (error) {
      logger.error({ error, destinationId, state }, "Failed to fetch demand_data from Supabase");
      throw new InternalServerError("Failed to retrieve tourism demand data from database");
    }

    return data || [];
  }

  /**
   * Retrieves visitor count records for a destination or its state.
   */
  async getVisitorCounts(destinationId?: string, state?: string): Promise<VisitorCountsRow[]> {
    let query = supabase.from("visitor_counts").select("*");

    if (destinationId) {
      query = query.eq("destination_id", destinationId);
    } else if (state) {
      query = query.eq("state", state);
    }

    const { data, error } = await query.order("year", { ascending: false });

    if (error) {
      logger.error({ error, destinationId, state }, "Failed to fetch visitor_counts from Supabase");
      throw new InternalServerError("Failed to retrieve visitor counts from database");
    }

    return data || [];
  }

  /**
   * Retrieves stored demand forecasts for a destination or state.
   */
  async getDemandForecasts(destinationId?: string, state?: string): Promise<DemandForecastsRow[]> {
    let query = supabase.from("demand_forecasts").select("*");

    if (destinationId) {
      query = query.eq("destination_id", destinationId);
    } else if (state) {
      query = query.eq("state", state);
    }

    const { data, error } = await query.order("forecast_time", { ascending: false });

    if (error) {
      logger.error(
        { error, destinationId, state },
        "Failed to fetch demand_forecasts from Supabase"
      );
      throw new InternalServerError("Failed to retrieve demand forecasts from database");
    }

    return data || [];
  }

  /**
   * Retrieves AI predictions stored in the database for a destination.
   */
  async getAIPredictions(
    destinationId: string,
    predictionType?: string
  ): Promise<AIPredictionsRow[]> {
    let query = supabase.from("ai_predictions").select("*").eq("destination_id", destinationId);

    if (predictionType) {
      query = query.eq("prediction_type", predictionType);
    }

    const { data, error } = await query.order("generated_at", { ascending: false });

    if (error) {
      logger.error({ error, destinationId }, "Failed to fetch ai_predictions from Supabase");
      throw new InternalServerError("Failed to retrieve AI predictions from database");
    }

    return data || [];
  }
}

export const crowdRepository = new CrowdRepository();
