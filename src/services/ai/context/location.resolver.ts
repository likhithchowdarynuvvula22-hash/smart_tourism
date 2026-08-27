import {
  destinationRepository,
  DestinationRepository
} from "../../../repositories/destination.repository";
import { DestinationRow } from "../../../types/database.types";
import { LocationCandidate, LocationResolution } from "../../../types/travellerContext";
import { logger } from "../../../lib/logger";

const MAX_CANDIDATES = 8;

/**
 * Phase 8B — deterministic state / district / destination resolution.
 *
 * Precedence:
 *   1. Exact destination-name match        → "destination" (high confidence)
 *   2. Multiple exact name matches         → "ambiguous"
 *   3. District match                      → "district"
 *   4. State match                         → "state"
 *   5. Nothing                             → "unknown"
 *
 * A state/district NEVER silently becomes one arbitrary city. Bounded
 * candidate sets are returned and ambiguity is preserved.
 */
export class LocationResolver {
  constructor(private readonly destRepo: DestinationRepository = destinationRepository) {}

  async resolve(query: string | undefined): Promise<LocationResolution> {
    const empty = (warnings: string[] = []): LocationResolution => ({
      locationType: "unknown",
      query: query ?? "",
      resolvedState: null,
      resolvedDistrict: null,
      candidateDestinations: [],
      totalCandidates: 0,
      confidence: query ? "low" : "unknown",
      warnings
    });

    if (!query || query.trim().length === 0) return empty();

    const trimmed = query.trim();

    try {
      // 1. Exact destination-name match (search covers name/city/district)
      const searched = await this.destRepo.findMany({ search: trimmed, limit: 10 });
      const exactMatches = searched.filter((d) => d.name.toLowerCase() === trimmed.toLowerCase());

      if (exactMatches.length === 1) {
        return this.fromRows("destination", trimmed, exactMatches, exactMatches, "high");
      }
      if (exactMatches.length > 1) {
        return this.fromRows("ambiguous", trimmed, exactMatches, exactMatches, "medium", [
          `Multiple destinations named "${trimmed}" exist; disambiguation is required.`
        ]);
      }

      // 2. Partial name match that is still strongly specific (single hit)
      if (searched.length === 1) {
        return this.fromRows("destination", trimmed, [searched[0]], [searched[0]], "high", [
          `"${trimmed}" matched the verified destination "${searched[0].name}" by partial name similarity.`
        ]);
      }

      // 3. State match (checked BEFORE district: partial district values such as
      //    "East Sikkim" must not hijack a clean state-level query)
      const stateMatches = await this.destRepo.findMany({ state: trimmed, limit: MAX_CANDIDATES });
      if (stateMatches.length > 0) {
        return this.fromRows("state", trimmed, stateMatches, stateMatches, "high");
      }

      // 4. District match
      const districtMatches = await this.destRepo.findMany({
        district: trimmed,
        limit: MAX_CANDIDATES
      });
      if (districtMatches.length > 0) {
        return this.fromRows("district", trimmed, districtMatches, districtMatches, "high");
      }

      // 5. Multi-hit partial search — ambiguous, bounded
      if (searched.length > 1) {
        return this.fromRows("ambiguous", trimmed, searched, searched, "low", [
          `"${trimmed}" partially matches multiple destinations; no single destination was assumed.`
        ]);
      }

      return empty();
    } catch (err) {
      logger.warn({ err, query: trimmed }, "Location resolution failed gracefully");
      return empty([`Location resolution is temporarily unavailable for "${trimmed}".`]);
    }
  }

  private fromRows(
    locationType: LocationResolution["locationType"],
    query: string,
    resolvedRows: DestinationRow[],
    candidateRows: DestinationRow[],
    confidence: LocationResolution["confidence"],
    warnings: string[] = []
  ): LocationResolution {
    const candidates: LocationCandidate[] = candidateRows.slice(0, MAX_CANDIDATES).map((d) => ({
      id: d.id,
      name: d.name,
      district: d.district ?? null,
      state: d.state
    }));

    const warningsFinal = [...warnings];
    if (locationType === "state") {
      warningsFinal.push(
        `"${query}" is a STATE containing ${candidates.length}${candidateRows.length >= MAX_CANDIDATES ? "+" : ""} indexed destination(s). No single city was assumed and no state-wide itinerary was fabricated.`
      );
    }

    return {
      locationType,
      query,
      resolvedState:
        locationType === "state"
          ? (resolvedRows[0]?.state ?? null)
          : (resolvedRows[0]?.state ?? null),
      resolvedDistrict: locationType === "district" ? (resolvedRows[0]?.district ?? null) : null,
      candidateDestinations: candidates,
      totalCandidates: candidates.length,
      confidence,
      warnings: warningsFinal
    };
  }
}

export const locationResolver = new LocationResolver();
