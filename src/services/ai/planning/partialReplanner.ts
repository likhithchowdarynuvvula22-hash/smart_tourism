import {
  DetectedChange,
  ItinerarySnapshot,
  ProposedChange,
  SnapshotItem
} from "../../../types/adaptive";
import { CandidatePlace } from "../../../types/ai";
import { ConstraintResolution, TravellerContext } from "../../../types/travellerContext";
import { ConstraintEngine, constraintEngine } from "../context/constraint.engine";

/**
 * Phase 8D — PartialReplanner.
 *
 * CHANGE-MINIMIZATION OBJECTIVE (deterministic tier order):
 *   Tier 1: same attraction, different valid time (reschedule)
 *   Tier 2: same destination, different verified attraction/experience
 *   Tier 3: nearby destination alternative
 *   Tier 4: different destination (only when necessary)
 *
 * This phase implements Tiers 1–2 fully; Tier 3/4 are reported as warnings
 * requiring explicit user direction ("Minimal-change adjustment based on
 * evaluated verified alternatives" — no global-optimization claims).
 *
 * HARD-CONSTRAINT RECHECK: every proposed replacement passes the Phase 8A
 * constraint filter BEFORE soft preferences are applied.
 */
export class PartialReplanner {
  constructor(private readonly engine: ConstraintEngine = constraintEngine) {}

  replan(input: {
    snapshot: ItinerarySnapshot;
    changes: DetectedChange[];
    candidatesByDestination: Record<string, CandidatePlace[]>;
    travellerContext: TravellerContext;
    constraintResolution: ConstraintResolution;
    rushFreeWindowsByDestination?: Record<string, string | null>;
  }): {
    proposedChanges: ProposedChange[];
    preservedItems: Array<{ day: number; placeId: string; placeName: string }>;
    updatedItinerary: Array<{
      day: number;
      destinationName?: string;
      timeBlock?: string;
      placeId: string;
      placeName: string;
    }> | null;
    warnings: string[];
  } {
    const {
      snapshot,
      changes,
      candidatesByDestination,
      travellerContext: ctx,
      constraintResolution
    } = input;
    const warnings: string[] = [];

    // Routing changes carry no specific place IDs — disclose deterministically
    // that sequence re-evaluation requires explicit user direction.
    if (changes.some((c) => c.type === "routing")) {
      warnings.push(
        "Inter-destination sequence re-evaluation requires your explicit direction; no automatic destination switch was made."
      );
    }

    const affectedByPlace = new Map<string, DetectedChange[]>();
    for (const change of changes) {
      for (const placeId of change.affectedPlaceIds) {
        const list = affectedByPlace.get(placeId) ?? [];
        list.push(change);
        affectedByPlace.set(placeId, list);
      }
    }

    const scheduledIds = new Set(snapshot.items.map((i) => i.placeId));
    const preservedItems: Array<{ day: number; placeId: string; placeName: string }> = [];
    const proposedChanges: ProposedChange[] = [];

    const isAccessible = (c: CandidatePlace): boolean | null =>
      c.accessibilityStatus === "accessible"
        ? true
        : c.accessibilityStatus === "inaccessible"
          ? false
          : null;

    for (const item of snapshot.items) {
      const detections = affectedByPlace.get(item.placeId);
      if (!detections || detections.length === 0) {
        preservedItems.push({ day: item.day, placeId: item.placeId, placeName: item.placeName });
        continue;
      }
      // Highest-severity detection drives the explanation…
      const change = [...detections].sort(
        (a, b) => this.severityRank(b.severity) - this.severityRank(a.severity)
      )[0];
      // …but a time-shift opportunity is evaluated whenever ANY detection
      // supports it (crowd/schedule), regardless of which severity won.
      const wantsCrowdShift = detections.some((d) => d.type === "crowd" || d.type === "schedule");
      const pool = candidatesByDestination[item.destinationId ?? ""] ?? [];
      const replacementPool = pool.filter(
        (c) =>
          !scheduledIds.has(c.id) &&
          c.id !== item.placeId &&
          this.engine.filterCandidates([c], isAccessible, constraintResolution).fullyCompliant
            .length > 0
      );

      const wantsCrowdShiftFromChange = change.type === "crowd" || change.type === "schedule";
      void wantsCrowdShiftFromChange;

      // ---- TIER 1: reschedule within valid windows ----
      if (wantsCrowdShift) {
        const shifted = this.findRescheduleBlock(
          item,
          input.rushFreeWindowsByDestination?.[item.destinationId ?? ""]
        );
        if (shifted) {
          proposedChanges.push({
            action: "reschedule_item",
            day: item.day,
            affectedPlaceId: item.placeId,
            affectedPlaceName: item.placeName,
            newTimeBlock: shifted,
            reason: `Same attraction retained at a less congested/valid time block (${shifted}). Minimal-change adjustment based on evaluated verified alternatives.`,
            minimizationTier: 1,
            preservedConstraints: constraintResolution.hardConstraints.map((c) => c.id),
            sources: []
          });
          scheduledIds.add(item.placeId);
          continue;
        }
      }

      // ---- TIER 2: same-destination verified replacement ----
      if (replacementPool.length > 0) {
        const best = this.rankReplacements(replacementPool, ctx)[0];
        proposedChanges.push({
          action: "replace_item",
          day: item.day,
          affectedPlaceId: item.placeId,
          affectedPlaceName: item.placeName,
          replacementPlaceId: best.c.id,
          replacementPlaceName: best.c.name,
          reason:
            `Replace "${item.placeName}" with verified alternative "${best.c.name}" (${best.reason}). ` +
            (change.type === "weather"
              ? "Outdoor activity may be less suitable under the current weather."
              : change.reason),
          minimizationTier: 2,
          preservedConstraints: constraintResolution.hardConstraints.map((c) => c.id),
          sources: [
            {
              type: "database",
              provider: "Supabase",
              resource: `destinations/${item.destinationId}`
            }
          ]
        });
        scheduledIds.add(best.c.id);
        continue;
      }

      // ---- No verified alternative found — preserve honestly ----
      warnings.push(
        `No verified alternative is currently available for "${item.placeName}" (day ${item.day}); the original item has been preserved${change.type === "weather" ? " — outdoor activity may be less suitable under the current weather" : ""}.`
      );
      if (change.type === "routing") {
        warnings.push(
          "Inter-destination sequence re-evaluation requires your explicit direction; no automatic destination switch was made."
        );
      }
      preservedItems.push({ day: item.day, placeId: item.placeId, placeName: item.placeName });
    }

    // Updated itinerary view (proposals applied in-memory only)
    const proposalByPlace = new Map(proposedChanges.map((p) => [p.affectedPlaceId, p]));
    const removedPlaces = new Set(
      proposedChanges.filter((p) => p.action === "replace_item").map((p) => p.affectedPlaceId)
    );
    const updatedItinerary: NonNullable<
      ReturnType<PartialReplanner["replan"]>["updatedItinerary"]
    > = [];
    for (const item of [...snapshot.items].sort((a, b) => a.day - b.day)) {
      const proposal = proposalByPlace.get(item.placeId);
      if (proposal?.action === "reschedule_item") {
        updatedItinerary.push({
          day: item.day,
          destinationName: item.destinationName,
          timeBlock: proposal.newTimeBlock,
          placeId: item.placeId,
          placeName: item.placeName
        });
      } else if (!removedPlaces.has(item.placeId)) {
        updatedItinerary.push({
          day: item.day,
          destinationName: item.destinationName,
          timeBlock: item.timeBlock,
          placeId: item.placeId,
          placeName: item.placeName
        });
      }
      if (proposal?.action === "replace_item" && proposal.replacementPlaceId) {
        updatedItinerary.push({
          day: proposal.day,
          destinationName: item.destinationName,
          timeBlock: item.timeBlock,
          placeId: proposal.replacementPlaceId,
          placeName: proposal.replacementPlaceName ?? ""
        });
      }
    }

    return {
      proposedChanges,
      preservedItems,
      updatedItinerary: updatedItinerary.sort((a, b) => a.day - b.day),
      warnings
    };
  }

  private findRescheduleBlock(
    item: SnapshotItem,
    rushFreeHours: string | null | undefined
  ): SnapshotItem["timeBlock"] | null {
    const blocks: SnapshotItem["timeBlock"][] = ["morning", "afternoon", "evening"];
    if (rushFreeHours) {
      const freeMatch = rushFreeHours.match(/Free:\s*([^]+)/i);
      if (freeMatch) {
        // Prefer the block whose representative hour falls inside a FREE window
        const windows = freeMatch[1].match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g) ?? [];
        const freeRanges = windows.map((w) => this.parseWindow(w));
        for (const block of blocks) {
          if (block === item.timeBlock) continue;
          const hour = block === "morning" ? 8.5 : block === "afternoon" ? 14 : 18;
          if (freeRanges.some(([s, e]) => hour >= s && hour <= e)) return block;
        }
        return null;
      }
    }
    // Without verified window data, propose any other block deterministically
    return blocks.find((b) => b !== item.timeBlock) ?? null;
  }

  /** Parses "HH:MM-HH:MM" into fractional hours, preserving minute precision. */
  private parseWindow(window: string): [number, number] {
    const m = window.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)!;
    return [
      parseInt(m[1], 10) + parseInt(m[2], 10) / 60,
      parseInt(m[3], 10) + parseInt(m[4], 10) / 60
    ];
  }

  /** Soft-preference ranking applied ONLY after hard-constraint filtering. */
  private rankReplacements(
    pool: CandidatePlace[],
    ctx: TravellerContext
  ): Array<{ c: CandidatePlace; reason: string; score: number }> {
    const interests = (ctx.travellerProfile.interests.value ?? []).map((i) => i.toLowerCase());
    return pool
      .map((c) => {
        let score = 0;
        let reason = "verified database record";
        const text = `${c.name} ${c.category ?? ""} ${c.description ?? ""}`.toLowerCase();
        for (const interest of interests) {
          if (interest && text.includes(interest)) {
            score += 20;
            reason = `matches interest "${interest}"`;
          }
        }
        if (
          ctx.preferences.preferEco.value === true &&
          /eco|community|nature|wildlife/.test(text)
        ) {
          score += 10;
          reason = "eco/community-oriented verified record";
        }
        if (c.entryFee && c.entryFee.amount === 0) {
          score += 5;
          if (score <= 5) reason = "free verified entry";
        }
        if (c.isElderlyFriendly) score += 3;
        return { c, reason, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  private severityRank(s: DetectedChange["severity"]): number {
    return { low: 1, medium: 2, high: 3, critical: 4 }[s];
  }
}

export const partialReplanner = new PartialReplanner();
