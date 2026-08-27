import { CandidatePlace, ExtractedEntities, EntryFeeInfo } from "../../../types/ai";
import { ConstraintResolution } from "../../../types/travellerContext";
import { ConstraintEngine } from "../context/constraint.engine";
import {
  DestinationRow,
  AttractionRow,
  ExperienceRow,
  AccessibilityRow,
  ElderlySupportRow,
  OpeningHoursRow,
  EntryFeesRow,
  LocalBusinessRow
} from "../../../types/database.types";

export interface CandidateRawData {
  destination?: DestinationRow | Record<string, unknown>;
  attractions?: Array<AttractionRow | Record<string, unknown>>;
  experiences?: Array<ExperienceRow | Record<string, unknown>>;
  accessibility?: Array<AccessibilityRow | Record<string, unknown>>;
  elderlySupport?: Array<ElderlySupportRow | Record<string, unknown>>;
  openingHours?: Array<OpeningHoursRow | Record<string, unknown>>;
  entryFees?: Array<EntryFeesRow | Record<string, unknown>>;
  localBusinesses?: Array<LocalBusinessRow | Record<string, unknown>>;
}

/**
 * Verified accessibility status per candidate.
 * "unknown" is NEVER coerced to accessible or inaccessible.
 */
export type AccessibilityStatus = "accessible" | "unknown" | "inaccessible";

export class CandidateFilter {
  private readonly MAX_CANDIDATES = 10;
  /** Warnings from hard-constraint enforcement of the most recent filter run. */
  lastHardConstraintWarnings: string[] = [];

  /**
   * Filters, prioritizes, and normalizes raw relational data into a bounded, enriched candidate set.
   * Priority order:
   * 1. Verified Child Attractions
   * 2. Verified Child Experiences
   * 3. Verified Local Businesses
   * 4. Destination-level fallback (at most 1, ONLY when no child attractions/experiences exist)
   *
   * Phase 8A: when a ConstraintResolution is supplied, HARD constraints are enforced
   * BEFORE ranking and SOFT preferences adjust ranking scores deterministically.
   */
  filterAndNormalize(
    rawData: CandidateRawData,
    entities: ExtractedEntities,
    constraints?: ConstraintResolution,
    engine?: ConstraintEngine
  ): CandidatePlace[] {
    const candidates: CandidatePlace[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    // Map accessibility by attraction_id
    const accessMap = new Map<string, AccessibilityRow>();
    if (rawData.accessibility) {
      for (const item of rawData.accessibility) {
        const acc = item as AccessibilityRow;
        if (acc.attraction_id) accessMap.set(acc.attraction_id, acc);
      }
    }

    // Map elderly support by attraction_id
    const elderlyMap = new Map<string, ElderlySupportRow>();
    if (rawData.elderlySupport) {
      for (const item of rawData.elderlySupport) {
        const eld = item as ElderlySupportRow;
        if (eld.attraction_id) elderlyMap.set(eld.attraction_id, eld);
      }
    }

    // Map opening hours by attraction_id
    const hoursMap = new Map<string, OpeningHoursRow>();
    if (rawData.openingHours) {
      for (const item of rawData.openingHours) {
        const oh = item as OpeningHoursRow;
        if (oh.attraction_id) hoursMap.set(oh.attraction_id, oh);
      }
    }

    // Map entry fees by attraction_id
    const feeMap = new Map<string, EntryFeesRow>();
    if (rawData.entryFees) {
      for (const item of rawData.entryFees) {
        const ef = item as EntryFeesRow;
        if (ef.attraction_id) feeMap.set(ef.attraction_id, ef);
      }
    }

    // 1. Process Child Attractions
    if (rawData.attractions && Array.isArray(rawData.attractions)) {
      for (const item of rawData.attractions) {
        const att = item as AttractionRow & { entry_fee?: number };
        if (!att.id || seenIds.has(att.id)) continue;
        const normName = String(att.name || "")
          .toLowerCase()
          .trim();
        if (normName && seenNames.has(normName)) continue;
        seenIds.add(att.id);
        if (normName) seenNames.add(normName);

        const acc = accessMap.get(att.id);
        const eld = elderlyMap.get(att.id);
        const oh = hoursMap.get(att.id);
        const fee = feeMap.get(att.id);

        const accessibilityNotes: string[] = [];
        let isWheelchairAccessible = false;
        let accessibilityStatus: AccessibilityStatus = "unknown";
        if (acc) {
          if (acc.wheelchair_access) {
            accessibilityNotes.push("Wheelchair accessible");
            isWheelchairAccessible = true;
            accessibilityStatus = "accessible";
          } else if (!acc.ramps && !acc.lifts) {
            // Verified record explicitly lacks wheelchair access, ramps, and lifts
            accessibilityStatus = "inaccessible";
          }
          if (acc.ramps) accessibilityNotes.push("Ramps available");
          if (acc.lifts) accessibilityNotes.push("Elevator / lift available");
          if (acc.accessible_toilet) accessibilityNotes.push("Accessible restrooms");
        }

        const elderlyNotes: string[] = [];
        let isElderlyFriendly = false;
        if (eld) {
          if (eld.benches) {
            elderlyNotes.push("Resting benches verified along pathways");
            isElderlyFriendly = true;
          }
          if (eld.ramps) elderlyNotes.push("Gentle ramp access verified for seniors");
          if (eld.stairs) elderlyNotes.push(`Staircase condition: ${eld.stairs}`);
        } else if (isWheelchairAccessible) {
          isElderlyFriendly = true;
          elderlyNotes.push("Level walkways suitable for senior walking");
        }

        let openingHoursText: string | null = null;
        if (oh) {
          const open = oh.opening_time || "";
          const close = oh.closing_time || "";
          openingHoursText = open && close ? `${open} - ${close}` : "Open during daytime";
          if (oh.closed_days) {
            openingHoursText += ` (Closed: ${oh.closed_days})`;
          }
        }

        let entryFeeInfo: EntryFeeInfo | null = null;
        if (fee) {
          entryFeeInfo = {
            amount: fee.fee_domestic ?? 0,
            currency: fee.currency || "INR",
            category: "General",
            note: fee.fee_senior ? `Senior citizen fee: ₹${fee.fee_senior}` : undefined
          };
        } else if (typeof att.entry_fee === "number") {
          entryFeeInfo = {
            amount: att.entry_fee,
            currency: "INR",
            category: "General"
          };
        }

        candidates.push({
          id: String(att.id),
          name: String(att.name || "Attraction"),
          type: "attraction",
          category: att.category || "Sightseeing",
          description: att.description || undefined,
          latitude: typeof att.latitude === "number" ? att.latitude : null,
          longitude: typeof att.longitude === "number" ? att.longitude : null,
          isElderlyFriendly,
          isWheelchairAccessible,
          accessibilityStatus,
          accessibilityNotes,
          elderlyNotes,
          openingHours: openingHoursText,
          entryFee: entryFeeInfo
        });
      }
    }

    // 2. Process Child Experiences
    if (rawData.experiences && Array.isArray(rawData.experiences)) {
      for (const item of rawData.experiences) {
        const exp = item as ExperienceRow;
        if (!exp.id || seenIds.has(exp.id)) continue;
        const normName = String(exp.name || "")
          .toLowerCase()
          .trim();
        if (normName && seenNames.has(normName)) continue;
        seenIds.add(exp.id);
        if (normName) seenNames.add(normName);

        candidates.push({
          id: String(exp.id),
          name: String(exp.name || "Cultural Experience"),
          type: "experience",
          category: exp.category || "Cultural",
          description: exp.duration ? `Duration: ${exp.duration}` : undefined,
          isElderlyFriendly: true,
          isWheelchairAccessible: Boolean(exp.accessibility?.toLowerCase().includes("wheelchair")),
          accessibilityStatus: exp.accessibility?.toLowerCase().includes("wheelchair")
            ? ("accessible" as AccessibilityStatus)
            : ("unknown" as AccessibilityStatus),
          accessibilityNotes: exp.accessibility ? [exp.accessibility] : [],
          elderlyNotes: ["Low physical effort activity"],
          entryFee: exp.price
            ? { amount: Number(exp.price), currency: exp.currency || "INR", category: "Standard" }
            : null
        });
      }
    }

    // 3. Process Local Businesses (only if requested)
    if (rawData.localBusinesses && Array.isArray(rawData.localBusinesses)) {
      for (const item of rawData.localBusinesses.slice(0, 3)) {
        const biz = item as LocalBusinessRow & {
          description?: string;
          latitude?: number;
          longitude?: number;
        };
        if (!biz.id || seenIds.has(biz.id)) continue;
        const normName = String(biz.name || "")
          .toLowerCase()
          .trim();
        if (normName && seenNames.has(normName)) continue;
        seenIds.add(biz.id);
        if (normName) seenNames.add(normName);

        candidates.push({
          id: String(biz.id),
          name: String(biz.name || "Local Establishment"),
          type: "business",
          category: biz.type || "Hospitality",
          description: biz.address || undefined,
          latitude: typeof biz.latitude === "number" ? biz.latitude : null,
          longitude: typeof biz.longitude === "number" ? biz.longitude : null,
          isElderlyFriendly: true,
          isWheelchairAccessible: false,
          accessibilityNotes: [],
          elderlyNotes: ["Verified local business establishment"]
        });
      }
    }

    // 4. Primary Destination Candidate: include primary destination site ONLY when no child attractions/experiences exist
    const hasChildRecords = candidates.some(
      (c) => c.type === "attraction" || c.type === "experience"
    );
    if (rawData.destination && !hasChildRecords) {
      const dest = rawData.destination as Record<string, unknown>;
      const destId = String(dest.id || "dest-fallback");
      const normName = String(dest.name || "")
        .toLowerCase()
        .trim();
      if (!seenIds.has(destId) && (!normName || !seenNames.has(normName))) {
        seenIds.add(destId);
        if (normName) seenNames.add(normName);
        candidates.push({
          id: destId,
          name: String(dest.name || "Scenic Highlights"),
          type: "destination_fallback",
          category: dest.category ? String(dest.category) : "Destination Overview",
          description:
            typeof dest.description === "string"
              ? dest.description
              : `Explore scenic landscapes, viewpoints, and local culture of ${dest.name || "the destination"}`,
          latitude: typeof dest.latitude === "number" ? dest.latitude : null,
          longitude: typeof dest.longitude === "number" ? dest.longitude : null,
          isElderlyFriendly: true,
          isWheelchairAccessible: false,
          accessibilityNotes: ["Main access roads and viewpoints"],
          elderlyNotes: ["Comfortable driving and leisure walking paths"]
        });
      }
    }

    // 5. Phase 8A HARD constraint enforcement — BEFORE ranking.
    //    Explicitly inaccessible candidates are removed when a wheelchair/
    //    accessibility hard constraint exists. Unknown-status candidates are
    //    kept ONLY if no verified-compliant option exists, with an honest warning.
    const hardExclusionWarnings: string[] = [];
    if (constraints && engine) {
      const hasAccessibilityHard =
        constraints.hardConstraints.some((c) => c.category === "accessibility") ||
        Boolean(entities.requiresWheelchair || entities.reducedMobility);
      const prohibition = constraints.hardConstraints.find(
        (c) => c.category === "explicit_prohibition"
      );

      // Explicit avoid-interest exclusion (hard)
      if (prohibition && entities.avoidInterests && entities.avoidInterests.length > 0) {
        const beforeCount = candidates.length;
        for (const candidate of candidates) {
          const text =
            `${candidate.name} ${candidate.category || ""} ${candidate.description || ""}`.toLowerCase();
          for (const avoid of entities.avoidInterests) {
            const avLow = avoid.toLowerCase();
            if (
              text.includes(avLow) &&
              avLow !== "crowd" // crowd-avoidance is a SOFT preference, not a prohibition
            ) {
              candidate.category = "__excluded__";
            }
          }
        }
        const excludedCount = candidates.filter((c) => c.category === "__excluded__").length;
        if (excludedCount > 0 && excludedCount === beforeCount && beforeCount > 0) {
          // Would exclude everything: keep candidates but flag the conflict honestly
          for (const candidate of candidates) {
            if (candidate.category === "__excluded__") {
              candidate.category = undefined;
            }
          }
          hardExclusionWarnings.push(
            `All verified candidates match the explicit exclusion "${entities.avoidInterests.join(", ")}". No fully compliant itinerary can be built from verified data.`
          );
        } else {
          for (let i = candidates.length - 1; i >= 0; i--) {
            if (candidates[i].category === "__excluded__") candidates.splice(i, 1);
          }
        }
      }

      if (hasAccessibilityHard) {
        const result = engine.filterCandidates(
          candidates,
          (c: CandidatePlace): boolean | null => {
            if (c.accessibilityStatus === "accessible") return true;
            if (c.accessibilityStatus === "inaccessible") return false;
            return null; // unknown stays unknown
          },
          constraints
        );
        candidates.length = 0;
        candidates.push(...result.fullyCompliant);
        hardExclusionWarnings.push(...result.exclusionWarnings);
      }
    }
    this.lastHardConstraintWarnings = hardExclusionWarnings;

    // 6. Rank Candidates based on Priority Tiers & Traveller Needs
    candidates.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Base tier scoring
      if (a.type === "attraction") scoreA += 100;
      else if (a.type === "experience") scoreA += 80;
      else if (a.type === "business") scoreA += 60;
      else if (a.type === "destination_fallback") scoreA += 10;

      if (b.type === "attraction") scoreB += 100;
      else if (b.type === "experience") scoreB += 80;
      else if (b.type === "business") scoreB += 60;
      else if (b.type === "destination_fallback") scoreB += 10;

      const isSenior =
        entities.travellerGroup === "parents" ||
        entities.travellerGroup === "elderly" ||
        entities.isElderlyTraveller;
      if (isSenior) {
        if (a.isElderlyFriendly) scoreA += 30;
        if (b.isElderlyFriendly) scoreB += 30;
        if (a.elderlyNotes.length > 0) scoreA += 15;
        if (b.elderlyNotes.length > 0) scoreB += 15;
      }

      const isWheelchair =
        entities.requiresWheelchair ||
        entities.reducedMobility ||
        (entities.accessibilityNeeds && entities.accessibilityNeeds.length > 0);
      if (isWheelchair) {
        if (a.isWheelchairAccessible) scoreA += 40;
        if (b.isWheelchairAccessible) scoreB += 40;
      }

      // Budget-aware candidate prioritization
      if (entities.isBudgetConstrained || entities.userBudget !== undefined) {
        // Prioritize free entry places
        if (a.entryFee && a.entryFee.amount === 0) scoreA += 25;
        if (b.entryFee && b.entryFee.amount === 0) scoreB += 25;

        // Prioritize lower entry fee when both fees are known
        if (a.entryFee && b.entryFee) {
          if (a.entryFee.amount < b.entryFee.amount) scoreA += 15;
          else if (b.entryFee.amount < a.entryFee.amount) scoreB += 15;
        }

        // Prioritize senior concessions if senior traveller
        if (isSenior) {
          if (a.entryFee?.note?.includes("Senior")) scoreA += 20;
          if (b.entryFee?.note?.includes("Senior")) scoreB += 20;
        }
      }

      // Interest-based prioritization (Phase 7E)
      if (entities.interests && entities.interests.length > 0) {
        const textA = `${a.name} ${a.category || ""} ${a.description || ""}`.toLowerCase();
        const textB = `${b.name} ${b.category || ""} ${b.description || ""}`.toLowerCase();

        for (const interest of entities.interests) {
          const intLow = interest.toLowerCase();
          if (textA.includes(intLow)) scoreA += 25;
          if (textB.includes(intLow)) scoreB += 25;
        }
      }

      // Avoid-interest suppression (Phase 7E)
      if (entities.avoidInterests && entities.avoidInterests.length > 0) {
        const textA = `${a.name} ${a.category || ""} ${a.description || ""}`.toLowerCase();
        const textB = `${b.name} ${b.category || ""} ${b.description || ""}`.toLowerCase();

        for (const avoid of entities.avoidInterests) {
          const avLow = avoid.toLowerCase();
          if (textA.includes(avLow)) scoreA -= 50;
          if (textB.includes(avLow)) scoreB -= 50;
        }
      }

      // Phase 8A SOFT preferences & OBJECTIVES — ranking only, never eligibility.
      // Sustainability / community orientation can NEVER override the hard
      // accessibility filtering already applied above.
      if (
        constraints?.softPreferences.some((c) => c.category === "sustainability") ||
        constraints?.objectives.some((c) => c.id === "objective.community_businesses")
      ) {
        const textA = `${a.name} ${a.category || ""}`.toLowerCase();
        const textB = `${b.name} ${b.category || ""}`.toLowerCase();
        const ecoPattern = /eco|community|tribal|village|nature|wildlife|green/;
        if (ecoPattern.test(textA)) scoreA += 20;
        if (ecoPattern.test(textB)) scoreB += 20;
      }
      if (constraints?.objectives.some((c) => c.id === "objective.community_businesses")) {
        if (a.type === "business") scoreA += 15;
        if (b.type === "business") scoreB += 15;
      }
      if (constraints?.objectives.some((c) => c.id === "objective.fee_minimization")) {
        if (a.entryFee && a.entryFee.amount === 0) scoreA += 10;
        if (b.entryFee && b.entryFee.amount === 0) scoreB += 10;
      }

      return scoreB - scoreA;
    });

    return candidates.slice(0, this.MAX_CANDIDATES);
  }
}

export const candidateFilter = new CandidateFilter();
