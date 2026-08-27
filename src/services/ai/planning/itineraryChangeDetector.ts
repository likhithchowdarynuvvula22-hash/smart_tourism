import { DetectedChange, ItinerarySnapshot, SnapshotItem } from "../../../types/adaptive";
import { NormalizedWeatherDto } from "../../../types/external";

/**
 * Phase 8D — deterministic ItineraryChangeDetector.
 * Severity comes exclusively from the documented rules in types/adaptive.ts.
 * External services that fail simply produce NO change record (the service is
 * reported unavailable by the caller) — triggers are never invented.
 */

const OUTDOOR_HINTS =
  /park|beach|waterfall|falls|viewpoint|view point|lake|garden|national park|wildlife|sanctuary|trek|peak|hill|island|backwater|shore|cave/i;

export const isOutdoorish = (item: SnapshotItem): boolean =>
  OUTDOOR_HINTS.test(`${item.placeName ?? ""} ${item.category ?? ""}`);

export interface CurrentConditionsInput {
  weatherByDestination: Record<string, NormalizedWeatherDto | null>;
  crowdByDestination: Record<
    string,
    { level?: string | null; confidence?: string | null; rushFreeHours?: string | null } | null
  >;
  safetyByDestination: Record<
    string,
    { activeAlerts?: number; seriousRecentIncidents?: number; dataQualityStatus?: string } | null
  >;
  routingChanges?: Array<{
    fromDestinationId: string;
    toDestinationId: string;
    status: string;
    durationMinutes: number | null;
    previousDurationMinutes?: number | null;
  }>;
  userConstraintTriggers?: Array<{
    type: "accessibility" | "budget" | "preference" | "removal";
    reason: string;
    severity: "high" | "medium" | "low";
  }>;
}

export class ItineraryChangeDetector {
  /**
   * Compares the snapshot against CURRENT verified conditions and returns all
   * deterministically detected changes. Unknown/unavailable conditions produce
   * no changes — never fabricated ones.
   */
  detectChanges(snapshot: ItinerarySnapshot, conditions: CurrentConditionsInput): DetectedChange[] {
    const changes: DetectedChange[] = [];

    this.detectWeather(snapshot, conditions, changes);
    this.detectCrowd(snapshot, conditions, changes);
    this.detectSafety(snapshot, conditions, changes);
    this.detectRouting(snapshot, conditions, changes);
    this.detectOpeningHoursConflicts(snapshot, changes);
    for (const t of conditions.userConstraintTriggers ?? []) {
      changes.push({
        type: "user_constraint",
        severity: t.severity,
        affectedDay: null,
        affectedDestinationId: null,
        affectedPlaceIds: [],
        reason: t.reason,
        source: "user"
      });
    }

    return changes;
  }

  private itemsForDestination(
    snapshot: ItinerarySnapshot,
    destinationId: string | null | undefined
  ): SnapshotItem[] {
    if (!destinationId) return [];
    return snapshot.items.filter((i) => i.destinationId === destinationId);
  }

  private detectWeather(
    snapshot: ItinerarySnapshot,
    conditions: CurrentConditionsInput,
    changes: DetectedChange[]
  ): void {
    for (const [destId, weather] of Object.entries(conditions.weatherByDestination)) {
      if (!weather?.current) continue;
      const current = weather.current;
      const precipProb = current.precipitationProbabilityPercent ?? 0;
      const precipMm = current.precipitationMm ?? 0;
      const temp = current.temperatureC ?? 0;

      let reason: string | null = null;
      let severity: DetectedChange["severity"] | null = null;
      if (precipProb > 60 || precipMm > 5) {
        severity = "high";
        reason = `High precipitation expected (${precipProb}% probability, ${precipMm}mm). Outdoor activity may be less suitable under the current weather.`;
      } else if (precipProb >= 40) {
        severity = "medium";
        reason = `Moderate precipitation probability (${precipProb}%). Outdoor activity may be less suitable under the current weather.`;
      } else if (temp > 38) {
        severity = "high";
        reason = `Extreme heat (${temp}°C). Midday outdoor activity may be less suitable under the current weather.`;
      } else if (temp >= 35) {
        severity = "medium";
        reason = `High temperature (${temp}°C). Afternoon outdoor activity may be less suitable.`;
      }
      if (!severity || !reason) continue;

      const affected = this.itemsForDestination(snapshot, destId).filter(isOutdoorish);
      if (affected.length === 0 && this.itemsForDestination(snapshot, destId).length > 0) {
        // No verified outdoor-hint evidence on any scheduled item — exposure
        // stays UNKNOWN (never assumed indoor), disclosed at medium severity.
        const all = this.itemsForDestination(snapshot, destId);
        changes.push({
          type: "weather",
          severity: severity === "high" ? "medium" : severity,
          affectedDay: all[0].day,
          affectedDestinationId: destId,
          affectedPlaceIds: all.map((i) => i.placeId),
          reason: `${reason} Weather exposure of these places is not classified in the database, so suitability cannot be confirmed either way.`,
          source: "weather"
        });
        continue;
      }
      // Indoor-unknown items are NOT assumed indoor — but only outdoor-hinted
      // places are flagged, per verified category/name evidence only.
      if (affected.length === 0) continue;
      changes.push({
        type: "weather",
        severity,
        affectedDay: affected[0].day,
        affectedDestinationId: destId,
        affectedPlaceIds: affected.map((i) => i.placeId),
        reason,
        source: "weather"
      });
    }
  }

  private detectCrowd(
    snapshot: ItinerarySnapshot,
    conditions: CurrentConditionsInput,
    changes: DetectedChange[]
  ): void {
    for (const [destId, crowd] of Object.entries(conditions.crowdByDestination)) {
      if (!crowd) continue;
      const affected = this.itemsForDestination(snapshot, destId);
      if (affected.length === 0) continue;

      if (crowd.level === "very_high" || crowd.level === "high") {
        changes.push({
          type: "crowd",
          severity: crowd.level === "very_high" ? "high" : "medium",
          affectedDay: affected[0].day,
          affectedDestinationId: destId,
          affectedPlaceIds: affected.map((i) => i.placeId),
          reason:
            `Baseline crowd assessment for this destination is "${crowd.level}"` +
            (crowd.confidence
              ? ` (confidence: ${crowd.confidence} — baseline heuristic, not a measured fact).`
              : "."),
          source: "crowd"
        });
      }

      // Verified rush-window overlap with scheduled time blocks
      if (crowd.rushFreeHours) {
        const rushWindows = this.parseRushWindows(crowd.rushFreeHours);
        for (const item of affected) {
          const blockHour =
            item.timeBlock === "morning" ? 9 : item.timeBlock === "afternoon" ? 14 : 19;
          const inRush = rushWindows.some(([start, end]) => blockHour >= start && blockHour < end);
          if (inRush) {
            changes.push({
              type: "crowd",
              severity: "low",
              affectedDay: item.day,
              affectedDestinationId: destId,
              affectedPlaceIds: [item.placeId],
              reason: `"${item.placeName}" is scheduled inside a verified RUSH window (${crowd.rushFreeHours}). A shift to a rush-free window may reduce congestion.`,
              source: "crowd"
            });
            break; // one disclosure per destination suffices
          }
        }
      }
    }
  }

  /** Parses "Rush: 09:00-14:00 Free: 14:00-17:00" into numeric hour ranges. */
  private parseRushWindows(rushFreeHours: string): Array<[number, number]> {
    const windows: Array<[number, number]> = [];
    const match = rushFreeHours.match(/Rush:\s*([^]+?)(?:Free:|$)/i);
    if (!match) return windows;
    const pairs = match[1].match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g) ?? [];
    for (const pair of pairs) {
      const m = pair.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)!;
      const start = parseInt(m[1], 10);
      const end = parseInt(m[3], 10);
      if (!isNaN(start) && !isNaN(end)) windows.push([start, end]);
    }
    return windows;
  }

  private detectSafety(
    snapshot: ItinerarySnapshot,
    conditions: CurrentConditionsInput,
    changes: DetectedChange[]
  ): void {
    for (const [destId, safety] of Object.entries(conditions.safetyByDestination)) {
      if (!safety) continue;
      const activeAlerts = safety.activeAlerts ?? 0;
      const incidents = safety.seriousRecentIncidents ?? 0;
      if (activeAlerts <= 0 && incidents <= 0) continue;

      const affected = this.itemsForDestination(snapshot, destId);
      changes.push({
        type: "safety",
        severity: "high",
        affectedDay: affected[0]?.day ?? null,
        affectedDestinationId: destId,
        affectedPlaceIds: affected.map((i) => i.placeId),
        reason:
          `${activeAlerts} active verified safety alert(s)` +
          (incidents > 0 ? ` and ${incidents} verified recent serious incident(s)` : "") +
          ` recorded for this destination. Review official advisories; emergency helplines remain 112 / 1091.`,
        source: "safety"
      });
    }
  }

  private detectRouting(
    _snapshot: ItinerarySnapshot,
    conditions: CurrentConditionsInput,
    changes: DetectedChange[]
  ): void {
    for (const leg of conditions.routingChanges ?? []) {
      if (leg.status !== "available") {
        changes.push({
          type: "routing",
          severity: "medium",
          affectedDay: null,
          affectedDestinationId: leg.toDestinationId,
          affectedPlaceIds: [],
          reason: `The verified route from ${leg.fromDestinationId} to ${leg.toDestinationId} is currently UNAVAILABLE through the routing provider. No replacement travel time was estimated.`,
          source: "routing"
        });
        continue;
      }
      if (
        leg.previousDurationMinutes != null &&
        leg.durationMinutes != null &&
        leg.previousDurationMinutes > 0 &&
        leg.durationMinutes > leg.previousDurationMinutes * 1.33
      ) {
        changes.push({
          type: "routing",
          severity: "medium",
          affectedDay: null,
          affectedDestinationId: leg.toDestinationId,
          affectedPlaceIds: [],
          reason: `Verified route duration increased from ~${leg.previousDurationMinutes} to ${leg.durationMinutes} minutes (>33%). The sequence may need re-evaluation.`,
          source: "routing"
        });
      }
    }
  }

  /**
   * Flags scheduled items that conflict with VERIFIED opening hours present in
   * the snapshot. Hours are never invented.
   */
  private detectOpeningHoursConflicts(
    snapshot: ItinerarySnapshot,
    changes: DetectedChange[]
  ): void {
    void snapshot;
    for (const item of snapshot.items) {
      if (!item.openingHours) continue;
      const m = item.openingHours.match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);
      if (!m) continue;
      const open = parseInt(m[1], 10);
      const close = parseInt(m[3], 10);
      if (isNaN(open) || isNaN(close)) continue;
      const blockStart =
        item.timeBlock === "morning" ? 8 : item.timeBlock === "afternoon" ? 13 : 18;
      const blockEnd = blockStart + 4;
      if (blockStart >= close || blockEnd <= open) {
        changes.push({
          type: "schedule",
          severity: "low",
          affectedDay: item.day,
          affectedDestinationId: item.destinationId ?? null,
          affectedPlaceIds: [item.placeId],
          reason: `"${item.placeName}" has verified opening hours ${open}:00-${close}:00 which conflict with its scheduled ${item.timeBlock} time block.`,
          source: "schedule"
        });
      }
    }
  }
}

export const itineraryChangeDetector = new ItineraryChangeDetector();
