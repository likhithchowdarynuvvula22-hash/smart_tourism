import { supabase } from "../lib/supabase";
import {
  SafetyIndicatorRow,
  SafetyAlertRow,
  SafetyIncidentRow,
  WomenSafetyRow
} from "../types/database.types";
import { InternalServerError } from "../utils/appError";
import { logger } from "../lib/logger";

export class SafetyRepository {
  /**
   * Fetches safety indicators for a destination.
   */
  async findSafetyIndicatorsByDestinationId(destinationId: string): Promise<SafetyIndicatorRow[]> {
    const { data, error } = await supabase
      .from("safety_indicators")
      .select("*")
      .eq("destination_id", destinationId);

    if (error) {
      logger.error({ error, destinationId }, "Error querying safety indicators");
      throw new InternalServerError("Failed to query safety indicators");
    }

    return data || [];
  }

  /**
   * Fetches safety alerts for a destination.
   */
  async findSafetyAlertsByDestinationId(destinationId: string): Promise<SafetyAlertRow[]> {
    const { data, error } = await supabase
      .from("safety_alerts")
      .select("*")
      .eq("destination_id", destinationId)
      .order("starts_at", { ascending: false });

    if (error) {
      logger.error({ error, destinationId }, "Error querying safety alerts");
      throw new InternalServerError("Failed to query safety alerts");
    }

    return data || [];
  }

  /**
   * Fetches safety incidents for a destination.
   */
  async findSafetyIncidentsByDestinationId(destinationId: string): Promise<SafetyIncidentRow[]> {
    const { data, error } = await supabase
      .from("safety_incidents")
      .select("*")
      .eq("destination_id", destinationId)
      .order("incident_date", { ascending: false });

    if (error) {
      logger.error({ error, destinationId }, "Error querying safety incidents");
      throw new InternalServerError("Failed to query safety incidents");
    }

    return data || [];
  }

  /**
   * Fetches women safety metrics and helplines for a destination.
   */
  async findWomenSafetyByDestinationId(destinationId: string): Promise<WomenSafetyRow | null> {
    const { data, error } = await supabase
      .from("women_safety")
      .select("*")
      .eq("destination_id", destinationId)
      .maybeSingle();

    if (error) {
      logger.error({ error, destinationId }, "Error querying women safety metrics");
      throw new InternalServerError("Failed to query women safety metrics");
    }

    return data;
  }
}

export const safetyRepository = new SafetyRepository();
