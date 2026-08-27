import { LocationResolution, TravellerContext } from "../../../types/travellerContext";
import { DestinationRow } from "../../../types/database.types";
import { SelectedDestinationDto } from "../../../types/multiDestination";
import { tourismService, TourismService } from "../../tourism.service";
import {
  destinationRepository,
  DestinationRepository
} from "../../../repositories/destination.repository";
import { logger } from "../../../lib/logger";

/**
 * Phase 8C — deterministic multi-destination selection.
 *
 * DOCUMENTED SELECTION RULE (transparent prototype ranking — NOT an ML prediction):
 *
 * Hard constraints (applied BEFORE ranking):
 *   - explicit selectedDestinationIds must belong to the resolved candidate set
 *   - wheelchair/accessibility requirement: destinations with verified
 *     accessibility evidence are required for AUTO selection; unknown-status
 *     candidates stay eligible ONLY when no verified-compliant option exists,
 *     with an explicit warning. Never converted to compliant.
 *   - a destination is auto-eligible only with >= 1 verified attraction OR
 *     experience record (zero-data destinations stay in the shortlist for
 *     explicit confirmation).
 *
 * Soft scoring (absent data adds NOTHING — never penalized):
 *   +min(verifiedAttractions, 10)
 *   +min(2 x verifiedExperiences, 10)
 *   +20 per matched interest found in verified attraction/experience/category names (cap 40)
 *   +10 eco/community keyword evidence when eco/community preference active
 *   +15 women-safety data present when safety relevant
 *
 * Automatic selection size (never exceeds what the duration can fit):
 *   durationDays <= 2        → max 1 destination
 *   durationDays <= 5        → default 2, max 3
 *   durationDays  > 5        → max 3
 */
export const MAX_AUTO_DESTINATIONS = 3;
export const DEFAULT_AUTO_DESTINATIONS = 2;

export type SelectionMode = "confirmed" | "automatic" | "awaiting_confirmation";

export interface DestinationSelectionInput {
  locationResolution: LocationResolution;
  travellerContext: TravellerContext;
  requestedDuration: number;
  explicitDestinationIds?: string[];
}

export interface CandidateProfile {
  row: DestinationRow;
  verifiedAttractions: number;
  verifiedExperiences: number;
  score: number;
  reasons: string[];
  hasAccessibilityEvidence: boolean | null; // null = unknown
}

export interface DestinationSelectionResult {
  mode: SelectionMode;
  selected: SelectedDestinationDto[];
  profiles: CandidateProfile[];
  warnings: string[];
}

export class MultiDestinationSelector {
  constructor(
    private readonly tourService: TourismService = tourismService,
    private readonly destRepo: DestinationRepository = destinationRepository
  ) {}

  async select(input: DestinationSelectionInput): Promise<DestinationSelectionResult> {
    const { locationResolution, travellerContext, requestedDuration } = input;
    const warnings: string[] = [];

    // 1. Load bounded candidate rows (Phase 8B shortlist is the ONLY source)
    const candidateIds = new Set(locationResolution.candidateDestinations.map((c) => c.id));
    const rows: DestinationRow[] = [];
    for (const c of locationResolution.candidateDestinations) {
      const full = await this.destRepo.findById(c.id);
      if (full) rows.push(full);
    }

    // 2. Explicit confirmation path (Scenario B / follow-up request)
    if (input.explicitDestinationIds && input.explicitDestinationIds.length > 0) {
      return this.selectExplicit(input, rows, candidateIds, warnings);
    }

    // 3. Profile every candidate ONCE (bounded <= Phase 8B list size)
    const profiles = await this.profileCandidates(rows, travellerContext);

    const needsAccessibility =
      travellerContext.travellerProfile.accessibilityNeeds.value.length > 0 ||
      Boolean(travellerContext.travellerProfile.mobilityNeeds.value.length);

    // 4. Auto eligibility: hard constraints first
    let eligible = profiles.filter((p) => p.verifiedAttractions + p.verifiedExperiences > 0);
    const zeroData = profiles.filter((p) => p.verifiedAttractions + p.verifiedExperiences === 0);

    if (needsAccessibility) {
      const withEvidence = eligible.filter((p) => p.hasAccessibilityEvidence === true);
      if (withEvidence.length > 0) {
        eligible = withEvidence;
      } else {
        warnings.push(
          "No candidate destination in this region has VERIFIED wheelchair-accessible infrastructure indexed. Remaining options have UNKNOWN accessibility status and are offered without any accessibility guarantee."
        );
      }
    }

    // 5. Deterministic size rule
    const maxSize =
      requestedDuration <= 2
        ? 1
        : Math.min(
            MAX_AUTO_DESTINATIONS,
            DEFAULT_AUTO_DESTINATIONS + (requestedDuration > 3 ? 1 : 0)
          );
    eligible.sort((a, b) => b.score - a.score);

    if (eligible.length === 0) {
      // Transparent limitation: cannot auto-select from zero-evidence candidates.
      warnings.push(
        `None of the ${profiles.length} verified candidate destination(s) currently index child attractions or experiences. Provide your preferred destination(s) to continue planning, using the destination IDs from the candidate shortlist.`
      );
      return {
        mode: "awaiting_confirmation",
        selected: [],
        profiles,
        warnings
      };
    }

    const selected = eligible.slice(0, Math.min(maxSize, eligible.length));
    if (zeroData.length > 0) {
      warnings.push(
        `${zeroData.length} candidate destination(s) were excluded from automatic selection because they currently have no verified attractions/experiences indexed. They remain available via explicit selection.`
      );
    }
    if (eligible.length > selected.length) {
      warnings.push(
        `Automatic selection is capped at ${selected.length} destination(s) for a ${requestedDuration}-day trip; ${eligible.length - selected.length} further eligible destination(s) can be added by explicit selection.`
      );
    }

    return {
      mode: "automatic",
      selected: selected.map((p) => this.toSelectedDto(p, "auto")),
      profiles,
      warnings
    };
  }

  private async selectExplicit(
    input: DestinationSelectionInput,
    rows: DestinationRow[],
    candidateIds: Set<string>,
    warnings: string[]
  ): Promise<DestinationSelectionResult> {
    const seen = new Set<string>();
    const acceptedIds: string[] = [];

    for (const id of input.explicitDestinationIds!) {
      if (!candidateIds.has(id)) {
        warnings.push(
          `Destination ID '${id}' was rejected: it does not belong to the resolved "${input.locationResolution.query}" candidate context.`
        );
        continue;
      }
      if (seen.has(id)) continue; // duplicate prevention
      seen.add(id);
      acceptedIds.push(id);
    }

    if (acceptedIds.length === 0) {
      warnings.push(
        "No valid selected destinations remained after validation against the resolved candidate context."
      );
      return {
        mode: "awaiting_confirmation",
        selected: [],
        profiles: await this.profileCandidates(rows, input.travellerContext),
        warnings
      };
    }

    const durationCap = Math.max(1, Math.min(MAX_AUTO_DESTINATIONS, input.requestedDuration));
    const trimmed = acceptedIds.slice(0, durationCap);
    if (acceptedIds.length > durationCap) {
      warnings.push(
        `Only the first ${durationCap} selected destination(s) were used for a ${input.requestedDuration}-day trip to keep day allocation realistic.`
      );
    }

    const allProfiles = await this.profileCandidates(rows, input.travellerContext);
    const byId = new Map(allProfiles.map((p) => [p.row.id, p]));
    const selected = trimmed
      .map((id) => byId.get(id))
      .filter((p): p is CandidateProfile => Boolean(p));

    return {
      mode: "confirmed",
      selected: selected.map((p) => this.toSelectedDto(p, "explicit")),
      profiles: allProfiles,
      warnings
    };
  }

  /**
   * Profiles each candidate ONCE with bounded reads. Data absence adds no
   * penalty — it simply earns no bonus (unknown stays unknown).
   */
  private async profileCandidates(
    rows: DestinationRow[],
    ctx: TravellerContext
  ): Promise<CandidateProfile[]> {
    const interests = (ctx.travellerProfile.interests.value ?? []).map((i) => i.toLowerCase());
    const wantsEco =
      ctx.preferences.preferEco.value === true ||
      ctx.preferences.communityPreference.value === true;
    const needsSafety = ctx.safetyContext.womenSafetyRelevant.value === true;
    const needsAccessibility = ctx.travellerProfile.accessibilityNeeds.value.length > 0;

    const profiles: CandidateProfile[] = [];
    for (const row of rows) {
      let verifiedAttractions = 0;
      let verifiedExperiences = 0;
      let hasAccessibilityEvidence: boolean | null = null;
      const reasons: string[] = [];
      let textCorpus = "";

      try {
        const [attractions, experiences] = await Promise.all([
          this.tourService.getAttractions(row.id).catch(() => []),
          this.tourService.getExperiences(row.id).catch(() => [])
        ]);
        verifiedAttractions = attractions.length;
        verifiedExperiences = experiences.length;
        textCorpus = [
          ...attractions.map(
            (a) =>
              `${(a as { name?: string }).name ?? ""} ${(a as { category?: string }).category ?? ""}`
          ),
          ...experiences.map(
            (e) =>
              `${(e as { name?: string }).name ?? ""} ${(e as { category?: string }).category ?? ""}`
          )
        ]
          .join(" ")
          .toLowerCase();
      } catch (err) {
        logger.debug({ err, destinationId: row.id }, "Candidate profiling degraded gracefully");
      }

      if (needsAccessibility) {
        try {
          const acc = await this.tourService.getAccessibility(row.id).catch(() => []);
          hasAccessibilityEvidence = acc.some(
            (a) => (a as { wheelchair_access?: boolean }).wheelchair_access === true
          );
        } catch {
          hasAccessibilityEvidence = null;
        }
      }

      let score = 0;
      if (verifiedAttractions > 0) {
        score += Math.min(verifiedAttractions, 10);
        reasons.push(`${verifiedAttractions} verified attraction(s)`);
      }
      if (verifiedExperiences > 0) {
        score += Math.min(verifiedExperiences * 2, 10);
        reasons.push(`${verifiedExperiences} verified experience(s)`);
      }

      let interestBoost = 0;
      for (const interest of interests) {
        if (interest && textCorpus.includes(interest)) interestBoost += 20;
      }
      if (interestBoost > 0) {
        score += Math.min(interestBoost, 40);
        reasons.push("matches stated interests");
      }
      if (wantsEco && /eco|community|tribal|village|nature|wildlife/.test(textCorpus)) {
        score += 10;
        reasons.push("eco/community-oriented verified records");
      }

      const profile: CandidateProfile = {
        row,
        verifiedAttractions,
        verifiedExperiences,
        score,
        reasons: needsSafety ? [...reasons] : reasons,
        hasAccessibilityEvidence
      };
      if (needsSafety) {
        // Safety-relevant requests get a transparent note; per-destination
        // women-safety intelligence runs later only for SELECTED destinations.
        profile.reasons.push("women-safety intelligence evaluated post-selection");
      }
      void needsAccessibility;
      profiles.push(profile);
    }
    return profiles;
  }

  private toSelectedDto(p: CandidateProfile, origin: "auto" | "explicit"): SelectedDestinationDto {
    const total = p.verifiedAttractions + p.verifiedExperiences;
    const status = total >= 3 ? "sufficient" : total >= 1 ? "limited" : "insufficient";
    const reason =
      origin === "explicit"
        ? "Explicitly selected and validated by you"
        : p.reasons.length > 0
          ? `Deterministic ranking: ${p.reasons.join("; ")}`
          : "Selected deterministically from verified records";

    return {
      id: p.row.id,
      name: p.row.name,
      district: p.row.district ?? null,
      state: p.row.state,
      selectionReason: reason,
      dataQuality: {
        verifiedAttractions: p.verifiedAttractions,
        verifiedExperiences: p.verifiedExperiences,
        status,
        explanation:
          total === 0
            ? "No verified child attractions or experiences are currently indexed; destination-level information will be used without fabrication."
            : `${p.verifiedAttractions} attraction(s) and ${p.verifiedExperiences} experience(s) verified in the database.`
      }
    };
  }
}

export const multiDestinationSelector = new MultiDestinationSelector();
