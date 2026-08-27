import { supabase } from "../lib/supabase";
import {
  AttractionRow,
  ExperienceRow,
  OpeningHoursRow,
  EntryFeesRow,
  AccessibilityRow,
  ElderlySupportRow,
  ImageRow,
  LanguageRow,
  EmergencyResourceRow,
  LocalBusinessRow
} from "../types/database.types";
import { InternalServerError } from "../utils/appError";
import { logger } from "../lib/logger";

export class TourismRepository {
  /**
   * Fetches attractions for a destination.
   */
  async findAttractionsByDestinationId(destinationId: string): Promise<AttractionRow[]> {
    const { data, error } = await supabase
      .from("attractions")
      .select("*")
      .eq("destination_id", destinationId)
      .order("name", { ascending: true });

    if (error) {
      logger.error({ error, destinationId }, "Error querying attractions");
      throw new InternalServerError("Failed to query destination attractions");
    }

    return data || [];
  }

  /**
   * Fetches experiences for a destination.
   */
  async findExperiencesByDestinationId(destinationId: string): Promise<ExperienceRow[]> {
    const { data, error } = await supabase
      .from("experiences")
      .select("*")
      .eq("destination_id", destinationId)
      .order("name", { ascending: true });

    if (error) {
      logger.error({ error, destinationId }, "Error querying experiences");
      throw new InternalServerError("Failed to query destination experiences");
    }

    return data || [];
  }

  /**
   * Fetches opening hours for attractions belonging to a destination.
   */
  async findOpeningHoursByDestinationId(destinationId: string): Promise<OpeningHoursRow[]> {
    const attractions = await this.findAttractionsByDestinationId(destinationId);
    if (attractions.length === 0) {
      return [];
    }

    const attractionIds = attractions.map((a) => a.id);

    const { data, error } = await supabase
      .from("opening_hours")
      .select("*")
      .in("attraction_id", attractionIds);

    if (error) {
      logger.error({ error, destinationId }, "Error querying opening hours");
      throw new InternalServerError("Failed to query opening hours");
    }

    return data || [];
  }

  /**
   * Fetches entry fees for attractions belonging to a destination.
   */
  async findEntryFeesByDestinationId(destinationId: string): Promise<EntryFeesRow[]> {
    const attractions = await this.findAttractionsByDestinationId(destinationId);
    if (attractions.length === 0) {
      return [];
    }

    const attractionIds = attractions.map((a) => a.id);

    const { data, error } = await supabase
      .from("entry_fees")
      .select("*")
      .in("attraction_id", attractionIds);

    if (error) {
      logger.error({ error, destinationId }, "Error querying entry fees");
      throw new InternalServerError("Failed to query entry fees");
    }

    return data || [];
  }

  /**
   * Fetches accessibility features for attractions in a destination.
   */
  async findAccessibilityByDestinationId(destinationId: string): Promise<AccessibilityRow[]> {
    const attractions = await this.findAttractionsByDestinationId(destinationId);
    if (attractions.length === 0) {
      return [];
    }

    const attractionIds = attractions.map((a) => a.id);

    const { data, error } = await supabase
      .from("accessibility")
      .select("*")
      .in("attraction_id", attractionIds);

    if (error) {
      logger.error({ error, destinationId }, "Error querying accessibility features");
      throw new InternalServerError("Failed to query accessibility features");
    }

    return data || [];
  }

  /**
   * Fetches elderly support amenities for attractions in a destination.
   */
  async findElderlySupportByDestinationId(destinationId: string): Promise<ElderlySupportRow[]> {
    const attractions = await this.findAttractionsByDestinationId(destinationId);
    if (attractions.length === 0) {
      return [];
    }

    const attractionIds = attractions.map((a) => a.id);

    const { data, error } = await supabase
      .from("elderly_support")
      .select("*")
      .in("attraction_id", attractionIds);

    if (error) {
      logger.error({ error, destinationId }, "Error querying elderly support amenities");
      throw new InternalServerError("Failed to query elderly support amenities");
    }

    return data || [];
  }

  /**
   * Fetches images for a destination and its child attractions.
   */
  async findImagesByDestinationId(destinationId: string): Promise<ImageRow[]> {
    const attractions = await this.findAttractionsByDestinationId(destinationId);
    const attractionIds = attractions.map((a) => a.id).filter(Boolean);

    let query = supabase.from("images").select("*");
    if (attractionIds.length > 0) {
      query = query.or(
        `destination_id.eq.${destinationId},attraction_id.in.(${attractionIds.join(",")})`
      );
    } else {
      query = query.eq("destination_id", destinationId);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    if (error) {
      logger.error({ error, destinationId }, "Error querying destination images");
      throw new InternalServerError("Failed to query destination images");
    }

    return data || [];
  }

  /**
   * Fetches images specifically for a child attraction.
   */
  async findImagesByAttractionId(attractionId: string): Promise<ImageRow[]> {
    const { data, error } = await supabase
      .from("images")
      .select("*")
      .eq("attraction_id", attractionId)
      .order("created_at", { ascending: true });

    if (error) {
      logger.error({ error, attractionId }, "Error querying attraction images");
      throw new InternalServerError("Failed to query attraction images");
    }

    return data || [];
  }

  /**
   * Fetches languages spoken in a destination.
   */
  async findLanguagesByDestinationId(destinationId: string): Promise<LanguageRow | null> {
    const { data, error } = await supabase
      .from("languages")
      .select("*")
      .eq("destination_id", destinationId)
      .maybeSingle();

    if (error) {
      logger.error({ error, destinationId }, "Error querying destination languages");
      throw new InternalServerError("Failed to query destination language information");
    }

    return data;
  }

  /**
   * Fetches emergency resources for a destination.
   */
  async findEmergencyResourcesByDestinationId(
    destinationId: string
  ): Promise<EmergencyResourceRow[]> {
    const { data, error } = await supabase
      .from("emergency_resources")
      .select("*")
      .or(`destination_id.eq.${destinationId},destination_id.is.null`)
      .order("type", { ascending: true });

    if (error) {
      logger.error({ error, destinationId }, "Error querying emergency resources");
      throw new InternalServerError("Failed to query emergency resources");
    }

    return data || [];
  }

  /**
   * Fetches a local business by UUID.
   */
  async findBusinessById(id: string): Promise<LocalBusinessRow | null> {
    const { data, error } = await supabase
      .from("local_businesses")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      logger.error({ error, id }, "Error querying local business by id");
      throw new InternalServerError("Failed to query local business");
    }

    return data;
  }

  /**
   * Fetches local businesses registered in a destination.
   */
  async findLocalBusinessesByDestinationId(
    destinationId: string,
    limit: number = 50
  ): Promise<LocalBusinessRow[]> {
    const { data, error } = await supabase
      .from("local_businesses")
      .select("*")
      .eq("destination_id", destinationId)
      .order("name", { ascending: true })
      .limit(limit);

    if (error) {
      logger.error({ error, destinationId }, "Error querying local businesses");
      throw new InternalServerError("Failed to query local businesses");
    }

    return data || [];
  }

  /**
   * Fetches transport connectivity record for a destination (for sustainability context).
   * Returns null if no transport record exists.
   */
  async findTransportConnectivityByDestinationId(destinationId: string): Promise<{
    id: string;
    destination_id: string;
    nearest_airport: string | null;
    airport_distance_km: number | null;
    nearest_railway: string | null;
    railway_distance_km: number | null;
    nearest_bus: string | null;
    bus_distance_km: number | null;
    highway_access: string | null;
    estimated_travel_time: string | null;
    source: string | null;
    source_url: string | null;
    verification_status: string | null;
  } | null> {
    const { data, error } = await supabase
      .from("transport_connectivity")
      .select("*")
      .eq("destination_id", destinationId)
      .maybeSingle();

    if (error) {
      logger.error({ error, destinationId }, "Error querying transport connectivity");
      throw new InternalServerError("Failed to query transport connectivity");
    }

    return data;
  }

  /**
   * Fetches accessibility records for attractions under a destination.
   * Used by sustainability service to detect walkable/accessible nature attractions.
   */
  async findAccessibilityByAttractionIds(attractionIds: string[]): Promise<AccessibilityRow[]> {
    if (attractionIds.length === 0) return [];

    const { data, error } = await supabase
      .from("accessibility")
      .select("*")
      .in("attraction_id", attractionIds);

    if (error) {
      logger.error({ error, attractionIds }, "Error querying accessibility for attractions");
      throw new InternalServerError("Failed to query accessibility records");
    }

    return data || [];
  }

  /**
   * Fetches a batched destination context bundle with selective inclusion.
   * Executes requested sections concurrently in parallel.
   */
  async getDestinationContextBundle(
    destinationId: string,
    options: {
      include?: Array<
        | "attractions"
        | "experiences"
        | "openingHours"
        | "entryFees"
        | "accessibility"
        | "elderlySupport"
        | "images"
        | "languages"
        | "emergencyResources"
        | "localBusinesses"
      >;
    } = {}
  ): Promise<{
    attractions?: AttractionRow[];
    experiences?: ExperienceRow[];
    openingHours?: OpeningHoursRow[];
    entryFees?: EntryFeesRow[];
    accessibility?: AccessibilityRow[];
    elderlySupport?: ElderlySupportRow[];
    images?: ImageRow[];
    languages?: LanguageRow[];
    emergencyResources?: EmergencyResourceRow[];
    localBusinesses?: LocalBusinessRow[];
  }> {
    const include = options.include || [
      "attractions",
      "experiences",
      "openingHours",
      "entryFees",
      "accessibility",
      "elderlySupport",
      "images",
      "languages",
      "emergencyResources",
      "localBusinesses"
    ];

    const tasks: Record<string, Promise<unknown>> = {};

    if (include.includes("attractions")) {
      tasks.attractions = this.findAttractionsByDestinationId(destinationId);
    }
    if (include.includes("experiences")) {
      tasks.experiences = this.findExperiencesByDestinationId(destinationId);
    }
    if (include.includes("openingHours")) {
      tasks.openingHours = this.findOpeningHoursByDestinationId(destinationId);
    }
    if (include.includes("entryFees")) {
      tasks.entryFees = this.findEntryFeesByDestinationId(destinationId);
    }
    if (include.includes("accessibility")) {
      tasks.accessibility = this.findAccessibilityByDestinationId(destinationId);
    }
    if (include.includes("elderlySupport")) {
      tasks.elderlySupport = this.findElderlySupportByDestinationId(destinationId);
    }
    if (include.includes("images")) {
      tasks.images = this.findImagesByDestinationId(destinationId);
    }
    if (include.includes("languages")) {
      tasks.languages = this.findLanguagesByDestinationId(destinationId);
    }
    if (include.includes("emergencyResources")) {
      tasks.emergencyResources = this.findEmergencyResourcesByDestinationId(destinationId);
    }
    if (include.includes("localBusinesses")) {
      tasks.localBusinesses = this.findLocalBusinessesByDestinationId(destinationId);
    }

    const entries = await Promise.all(
      Object.entries(tasks).map(async ([key, promise]) => [key, await promise])
    );

    return Object.fromEntries(entries);
  }
}

export const tourismRepository = new TourismRepository();
