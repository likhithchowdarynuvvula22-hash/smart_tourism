import {
  CandidatePlace,
  ExtractedEntities,
  ItineraryDayDto,
  ItineraryItemDto
} from "../../../types/ai";
import { CurrentWeatherDto } from "../../../types/external";
import { routingService, RoutingService } from "../../external/routing/routing.service";
import { logger } from "../../../lib/logger";

export class ItinerarySequencer {
  constructor(private readonly rtService: RoutingService = routingService) {}

  /**
   * Sequentially organizes unique candidates into structured days and time blocks without duplication.
   * Scales down the number of scheduled activities if candidates are fewer than total time slots.
   */
  async sequenceItinerary(
    candidates: CandidatePlace[],
    entities: ExtractedEntities,
    weather?: CurrentWeatherDto | null
  ): Promise<ItineraryDayDto[]> {
    const daysCount = Math.min(Math.max(entities.days || 2, 1), 14);
    const isSenior = entities.travellerGroup === "parents" || entities.travellerGroup === "elderly";
    const maxPerDay = isSenior ? 2 : 3;

    const days: ItineraryDayDto[] = [];
    let candidateIndex = 0;
    let routingCallsCount = 0;
    const MAX_ROUTING_CALLS = 3;

    // Weather rules
    const hasHighRain = weather && (weather.precipitationProbabilityPercent ?? 0) > 60;
    const hasHeat = weather && (weather.temperatureC ?? 0) > 34;

    for (let d = 1; d <= daysCount; d++) {
      const dayItems: ItineraryItemDto[] = [];
      const slots: Array<"morning" | "afternoon" | "evening"> = isSenior
        ? ["morning", "afternoon"]
        : ["morning", "afternoon", "evening"];

      let previousCandidate: CandidatePlace | null = null;

      for (let s = 0; s < slots.length && s < maxPerDay; s++) {
        // Global Uniqueness: strictly consume next candidate. If none left, do NOT duplicate.
        if (candidateIndex >= candidates.length) {
          break;
        }

        const candidate = candidates[candidateIndex];
        candidateIndex++;

        const timeBlock = slots[s];
        let weatherNote: string | null = null;
        if (hasHighRain) {
          weatherNote = "Rain expected; sheltered walkways and covered areas recommended";
        } else if (hasHeat && timeBlock === "afternoon") {
          weatherNote = "Afternoon peak temperature; seek shade or indoor exploration";
        }

        // Travel transition calculation between distinct locations
        let travelMinutes: number | null = null;
        let travelKm: number | null = null;

        if (
          previousCandidate &&
          previousCandidate.id !== candidate.id &&
          previousCandidate.latitude &&
          previousCandidate.longitude &&
          candidate.latitude &&
          candidate.longitude &&
          routingCallsCount < MAX_ROUTING_CALLS
        ) {
          try {
            routingCallsCount++;
            const route = await this.rtService.calculateRoute(
              previousCandidate.latitude,
              previousCandidate.longitude,
              candidate.latitude,
              candidate.longitude
            );
            travelMinutes = route.durationMinutes;
            travelKm = route.distanceKm;
          } catch (err) {
            logger.debug({ err }, "Route calculation failed; continuing with fallback time");
          }
        }

        const elderlyNotes = [...candidate.elderlyNotes];
        if (isSenior) {
          elderlyNotes.push(
            "Senior-friendly pacing with built-in rest stops and gentle walking (recommended)"
          );
        }
        if (entities.avoidCrowds) {
          elderlyNotes.push(
            "Scheduled during optimal rush-free window to avoid peak crowd density"
          );
        }

        const item: ItineraryItemDto = {
          sequence: s + 1,
          timeBlock,
          placeId: candidate.id,
          placeName: candidate.name,
          reason: candidate.description || `Verified ${candidate.category || "attraction"} visit`,
          estimatedVisitMinutes: isSenior ? 90 : 60,
          travelFromPreviousMinutes: travelMinutes,
          travelFromPreviousKm: travelKm,
          weatherConsideration: weatherNote,
          accessibilityNotes: candidate.accessibilityNotes,
          elderlyNotes,
          entryFee: candidate.entryFee,
          openingHours: candidate.openingHours
        };

        dayItems.push(item);
        previousCandidate = candidate;
      }

      days.push({
        day: d,
        theme:
          d === 1
            ? "Scenic & Heritage Highlights"
            : d === 2
              ? "Cultural Exploration & Leisure"
              : `Day ${d} Sightseeing`,
        items: dayItems
      });
    }

    return days;
  }
}

export const itinerarySequencer = new ItinerarySequencer();
