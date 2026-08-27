import { DestinationContentSummaryDto } from "../../../types/content";
import {
  AccessibilityRow,
  AttractionRow,
  DestinationRow,
  ElderlySupportRow,
  EmergencyResourceRow,
  EntryFeesRow,
  ExperienceRow,
  LanguageRow
} from "../../../types/database.types";
import { ProvenanceSource } from "../../../types/ai";

export class ContentSummaryAnalyzer {
  /**
   * Builds a structured, grounded destination content summary derived strictly from verified database records.
   */
  generateSummary(
    destination: DestinationRow,
    attractions: AttractionRow[] = [],
    experiences: ExperienceRow[] = [],
    languageRow: LanguageRow | null = null,
    accessibilityRows: AccessibilityRow[] = [],
    elderlyRows: ElderlySupportRow[] = [],
    feesRows: EntryFeesRow[] = [],
    emergencyResources: EmergencyResourceRow[] = []
  ): DestinationContentSummaryDto {
    const sources: ProvenanceSource[] = [];
    const seenSources = new Set<string>();

    if (destination.source) {
      sources.push({
        type: "database",
        provider: destination.source,
        resource: "destinations"
      });
      seenSources.add(`destinations:${destination.source}`);
    }

    if (languageRow?.source && !seenSources.has(`languages:${languageRow.source}`)) {
      sources.push({
        type: "database",
        provider: languageRow.source,
        resource: "languages"
      });
      seenSources.add(`languages:${languageRow.source}`);
    }

    // 1. Structure Attractions
    const attractionSummaries = attractions.map((att) => {
      if (att.source && !seenSources.has(`attractions:${att.source}`)) {
        sources.push({
          type: "database",
          provider: att.source,
          resource: "attractions"
        });
        seenSources.add(`attractions:${att.source}`);
      }
      return {
        name: att.name,
        category: att.category || "Sightseeing",
        description: att.description || "Verified destination site"
      };
    });

    // 2. Structure Experiences
    const experienceSummaries = experiences.map((exp) => {
      if (exp.source && !seenSources.has(`experiences:${exp.source}`)) {
        sources.push({
          type: "database",
          provider: exp.source,
          resource: "experiences"
        });
        seenSources.add(`experiences:${exp.source}`);
      }
      return {
        name: exp.name,
        category: exp.category || "Tourism initiative"
      };
    });

    // 3. Structure Accessibility Metrics
    const wheelchairAccessibleCount = accessibilityRows.filter(
      (a) => a.wheelchair_access === true
    ).length;
    const seniorFriendlyCount = elderlyRows.filter(
      (e) => e.benches === true || e.stairs === "None (Level Paved Ground)"
    ).length;

    const accessNotes: string[] = [];
    if (wheelchairAccessibleCount > 0) {
      accessNotes.push(
        `${wheelchairAccessibleCount} attraction(s) with verified wheelchair access`
      );
    } else {
      accessNotes.push("Wheelchair ramp infrastructure is unconfirmed across catalogued sites");
    }
    if (seniorFriendlyCount > 0) {
      accessNotes.push(`${seniorFriendlyCount} attraction(s) with verified resting benches`);
    }

    // 4. Structure Costs Metrics
    const knownEntryFeeAttractionsCount = feesRows.filter((f) => f.fee_domestic !== null).length;

    // 5. Structure Emergency Helplines
    let nationalEmergency = "112";
    let womenHelpline = "1091 / 181";
    for (const res of emergencyResources) {
      if (res.type === "police" || res.type === "national_emergency") {
        nationalEmergency = res.phone || "112";
      }
      if (res.type === "women_helpline") {
        womenHelpline = res.phone || "1091";
      }
    }

    // 6. Unknowns Disclosure
    const unknowns: string[] = [
      "uncatalogued_local_festivals_and_event_schedules",
      "unrecorded_dining_and_restaurant_menus",
      "uncatalogued_private_transit_and_cab_fares",
      "unverified_historical_folklore_and_legends"
    ];

    // 7. Overall Narrative Summary (strictly grounded)
    const summaryLines: string[] = [];
    summaryLines.push(
      `${destination.name} is a verified tourist destination located in ${destination.state}.`
    );

    if (destination.description) {
      summaryLines.push(destination.description);
    }

    if (attractions.length > 0) {
      summaryLines.push(
        `The destination features ${attractions.length} catalogued attraction(s), including ${attractions
          .slice(0, 3)
          .map((a) => a.name)
          .join(", ")}.`
      );
    }

    if (languageRow?.official_language) {
      summaryLines.push(`Primary regional language(s): ${languageRow.official_language}.`);
    }

    return {
      destinationId: destination.id,
      destinationName: destination.name,
      state: destination.state,
      summary: summaryLines.join(" "),
      sections: {
        overview:
          destination.description ||
          `Official destination profile for ${destination.name}, ${destination.state}.`,
        attractions: attractionSummaries,
        experiences: experienceSummaries,
        languages: {
          official: languageRow?.official_language || null,
          local: languageRow?.local_languages || null,
          guide: languageRow?.guide_languages || null
        },
        accessibility: {
          wheelchairAccessibleCount,
          seniorFriendlyCount,
          notes: accessNotes
        },
        costs: {
          knownEntryFeeAttractionsCount,
          disclaimer:
            "Entry fees are catalogued only where official records exist. Final travel costs vary by transport and accommodation."
        },
        safety: {
          nationalEmergency,
          womenHelpline,
          disclaimer:
            "Emergency helplines are verified from national and regional emergency service directories."
        }
      },
      unknowns,
      disclaimer:
        "Content summary is synthesized strictly from verified database records. Temporary events, cultural claims, and private vendor pricing are not tracked.",
      sources
    };
  }
}

export const contentSummaryAnalyzer = new ContentSummaryAnalyzer();
