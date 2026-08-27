import { CandidatePlace, ItineraryDayDto, OrchestratorResponseDto } from "../../../types/ai";
import { BadRequestError } from "../../../utils/appError";
import { logger } from "../../../lib/logger";

export class ItineraryValidator {
  /**
   * Validates and sanitizes LLM output against verified candidate places with strict global uniqueness.
   * Every placeId may appear at most ONCE across the ENTIRE itinerary (all days).
   */
  validateAndSanitize(
    rawResponse: unknown,
    candidatePlaces: CandidatePlace[],
    expectedDays: number
  ): OrchestratorResponseDto {
    if (!rawResponse || typeof rawResponse !== "object") {
      throw new BadRequestError("Invalid AI response: output must be a structured JSON object");
    }

    const res = rawResponse as Partial<OrchestratorResponseDto> & {
      days?: ItineraryDayDto[];
      itinerary?: ItineraryDayDto[];
    };

    const daysList = res.days || res.itinerary;
    if (!daysList || !Array.isArray(daysList) || daysList.length === 0) {
      throw new BadRequestError("Invalid AI response: 'days' array is missing or empty");
    }

    const validPlaceMap = new Map<string, CandidatePlace>();
    for (const c of candidatePlaces) {
      validPlaceMap.set(c.id, c);
    }

    const sanitizedDays: ItineraryDayDto[] = [];
    const globallySeenPlaceIds = new Set<string>();
    const warnings: string[] = Array.isArray(res.warnings) ? [...res.warnings] : [];

    let destinationFallbackCount = 0;

    for (let i = 0; i < Math.min(daysList.length, expectedDays); i++) {
      const rawDay = daysList[i];
      if (!rawDay || !Array.isArray(rawDay.items)) {
        sanitizedDays.push({
          day: i + 1,
          date: rawDay?.date,
          theme: rawDay?.theme || `Day ${i + 1} Itinerary`,
          items: []
        });
        continue;
      }

      const sanitizedItems = [];

      for (let j = 0; j < rawDay.items.length; j++) {
        const item = rawDay.items[j];
        if (!item) continue;

        // Grounding verification: check place ID or name against candidate pool
        let matchedCandidate: CandidatePlace | undefined;
        if (item.placeId && validPlaceMap.has(item.placeId)) {
          matchedCandidate = validPlaceMap.get(item.placeId);
        } else if (item.placeName) {
          matchedCandidate = candidatePlaces.find(
            (c) => c.name.toLowerCase() === item.placeName.toLowerCase()
          );
        }

        if (!matchedCandidate) {
          logger.warn(
            { placeId: item.placeId, placeName: item.placeName },
            "LLM generated unverified or fabricated place; discarding item"
          );
          continue;
        }

        // Global Uniqueness: discard if already used in ANY previous day or slot
        if (globallySeenPlaceIds.has(matchedCandidate.id)) {
          logger.debug(
            { placeId: matchedCandidate.id, day: i + 1 },
            "Discarding duplicate place already scheduled in itinerary"
          );
          continue;
        }

        // Destination-level fallback limit: max 1 across entire trip
        if (matchedCandidate.type === "destination_fallback") {
          if (destinationFallbackCount >= 1) {
            logger.debug("Discarding second destination fallback item");
            continue;
          }
          destinationFallbackCount++;
        }

        globallySeenPlaceIds.add(matchedCandidate.id);

        sanitizedItems.push({
          sequence: sanitizedItems.length + 1,
          timeBlock: item.timeBlock || (sanitizedItems.length === 0 ? "morning" : "afternoon"),
          placeId: matchedCandidate.id,
          placeName: matchedCandidate.name,
          reason: item.reason || matchedCandidate.description || "Verified sightseeing visit",
          estimatedVisitMinutes: item.estimatedVisitMinutes ?? 90,
          travelFromPreviousMinutes: item.travelFromPreviousMinutes ?? null,
          travelFromPreviousKm: item.travelFromPreviousKm ?? null,
          weatherConsideration: item.weatherConsideration ?? null,
          accessibilityNotes: matchedCandidate.accessibilityNotes,
          elderlyNotes: matchedCandidate.elderlyNotes,
          entryFee: matchedCandidate.entryFee,
          openingHours: matchedCandidate.openingHours
        });
      }

      sanitizedDays.push({
        day: i + 1,
        date: rawDay.date,
        theme: rawDay.theme || `Day ${i + 1} Itinerary`,
        items: sanitizedItems
      });
    }

    const totalScheduledItems = sanitizedDays.reduce((acc, d) => acc + d.items.length, 0);

    if (totalScheduledItems === 0) {
      if (candidatePlaces.length === 0) {
        warnings.push(
          "No verified attractions or destinations found in the catalog for this location."
        );
      } else {
        throw new BadRequestError("All LLM generated places failed grounding validation");
      }
    } else if (totalScheduledItems < candidatePlaces.length && candidatePlaces.length < 4) {
      warnings.push(
        `Itinerary includes all ${totalScheduledItems} verified place(s) available in the catalog. Missing slots were left empty to avoid duplication or fabrication.`
      );
    }

    return {
      intent: res.intent || "trip_planning",
      summary: res.summary || "Here is your verified, customized tourism itinerary.",
      trip: res.trip,
      destination: res.destination,
      recommendations: res.recommendations || [],
      itinerary: sanitizedDays,
      days: sanitizedDays,
      weather: res.weather || null,
      safety: res.safety || null,
      accessibility: res.accessibility || null,
      warnings,
      sources: res.sources || []
    };
  }
}

export const itineraryValidator = new ItineraryValidator();
