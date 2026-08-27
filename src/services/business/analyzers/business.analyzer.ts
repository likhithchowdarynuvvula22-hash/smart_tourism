import {
  BusinessCategory,
  BusinessDataQualityStatus,
  BusinessFilterOptions,
  DestinationBusinessesDto,
  LocalBusinessItemDto
} from "../../../types/business";
import { DestinationRow, LocalBusinessRow } from "../../../types/database.types";
import { ProvenanceSource } from "../../../types/ai";

export class BusinessAnalyzer {
  /**
   * Deterministically normalizes category string from raw database type and business name.
   */
  normalizeCategory(rawType: string | null, name: string = ""): BusinessCategory {
    const combined = `${rawType || ""} ${name}`.toLowerCase();

    if (combined.includes("homestay")) return "homestay";
    if (
      combined.includes("hotel") ||
      combined.includes("resort") ||
      combined.includes("lodge") ||
      combined.includes("stay") ||
      combined.includes("inn")
    ) {
      return "hotel";
    }
    if (
      combined.includes("restaurant") ||
      combined.includes("cafe") ||
      combined.includes("dining") ||
      combined.includes("food") ||
      combined.includes("dhaba") ||
      combined.includes("bhojanalaya")
    ) {
      return "restaurant";
    }
    if (
      combined.includes("handicraft") ||
      combined.includes("artisan") ||
      combined.includes("craft") ||
      combined.includes("weaving") ||
      combined.includes("pottery") ||
      combined.includes("textile") ||
      combined.includes("handloom")
    ) {
      return "handicraft";
    }
    if (
      combined.includes("tour_operator") ||
      combined.includes("tour operator") ||
      combined.includes("travels") ||
      combined.includes("safari") ||
      combined.includes("tour agency")
    ) {
      return "tour_operator";
    }
    if (combined.includes("guide") || combined.includes("tourist guide")) {
      return "guide";
    }
    if (
      combined.includes("transport") ||
      combined.includes("taxi") ||
      combined.includes("cab") ||
      combined.includes("rental")
    ) {
      return "transport";
    }
    if (
      combined.includes("shopping") ||
      combined.includes("store") ||
      combined.includes("market") ||
      combined.includes("bazaar") ||
      combined.includes("emporium")
    ) {
      return "shopping";
    }

    return "local_service";
  }

  /**
   * Normalizes a raw database row into an auditable, provenance-backed DTO.
   */
  normalizeBusiness(
    row: LocalBusinessRow,
    destination?: DestinationRow | null
  ): LocalBusinessItemDto {
    const normalizedCategory = this.normalizeCategory(row.type, row.name);
    const sourceName = row.source || "unknown";

    const languages: string[] = row.languages
      ? row.languages
          .split(/[;,]/)
          .map((l) => l.trim())
          .filter(Boolean)
      : [];

    return {
      id: row.id,
      businessCode: row.business_code || null,
      destinationId: row.destination_id || destination?.id || null,
      destinationName: destination?.name || null,
      name: row.name,
      type: row.type || "Local Business",
      normalizedCategory,
      address: row.address || null,
      phone: row.phone || null,
      email: row.email || null,
      languages,
      price: "unknown",
      openingHours: "unknown",
      rating: "unknown",
      accessibility: {
        wheelchairAccess: "unknown",
        notes: ["Business-level wheelchair ramp and physical accessibility are uncatalogued."]
      },
      elderlySuitability: {
        suitable: "unknown",
        notes: [
          "Senior citizen amenities and physical step barriers are unrecorded for this commercial venue."
        ]
      },
      verified: Boolean(row.verified || row.verification_status?.includes("approved")),
      verificationStatus: row.verification_status || (row.verified ? "verified" : "unverified"),
      matchScore: 50,
      matchReason: "Catalogued local commercial enterprise",
      source: {
        type: "database",
        provider: sourceName,
        resource: "local_businesses"
      },
      sourceUrl: row.source_url || null,
      createdAt: row.created_at || new Date().toISOString()
    };
  }

  /**
   * Deterministically evaluates candidate score based on user criteria.
   */
  scoreBusiness(
    item: LocalBusinessItemDto,
    options: BusinessFilterOptions = {}
  ): { score: number; reason: string } {
    let score = 50;
    const reasons: string[] = [];

    // 1. Exact vs Related Category Matching
    if (options.category) {
      const requestedCat = options.category.toLowerCase().trim();
      if (item.normalizedCategory === requestedCat) {
        score += 35;
        reasons.push(`Exact category match for '${requestedCat}'`);
      } else if (
        (requestedCat === "hotel" && item.normalizedCategory === "homestay") ||
        (requestedCat === "homestay" && item.normalizedCategory === "hotel") ||
        (requestedCat === "shopping" && item.normalizedCategory === "handicraft") ||
        (requestedCat === "food" && item.normalizedCategory === "restaurant") ||
        (requestedCat === "dining" && item.normalizedCategory === "restaurant")
      ) {
        score += 20;
        reasons.push(`Related category match for '${requestedCat}'`);
      }
    }

    // 2. Verified Status Boost
    if (item.verified) {
      score += 10;
      reasons.push("Officially verified tourism enterprise");
    }

    // 3. Destination Locality Boost
    if (item.destinationId) {
      score += 10;
      reasons.push("Direct destination locality match");
    }

    // 4. User Interest Matching (Phase 7E Integration)
    if (options.interests && options.interests.length > 0) {
      const lowerInterests = options.interests.map((i) => i.toLowerCase());
      if (
        (lowerInterests.includes("food") || lowerInterests.includes("dining")) &&
        item.normalizedCategory === "restaurant"
      ) {
        score += 20;
        reasons.push("Matches dining preference");
      }
      if (
        (lowerInterests.includes("shopping") ||
          lowerInterests.includes("handicraft") ||
          lowerInterests.includes("artisan")) &&
        item.normalizedCategory === "handicraft"
      ) {
        score += 20;
        reasons.push("Matches artisan/handicraft shopping preference");
      }
      if (
        (lowerInterests.includes("culture") ||
          lowerInterests.includes("heritage") ||
          lowerInterests.includes("local")) &&
        (item.normalizedCategory === "homestay" || item.normalizedCategory === "handicraft")
      ) {
        score += 15;
        reasons.push("Matches cultural immersion interest");
      }
    }

    // 5. Budget Context (Phase 7D Integration)
    if (options.isBudgetConstrained && item.normalizedCategory === "homestay") {
      score += 10;
      reasons.push("Community homestay alternative for budget-conscious travellers");
    }

    // 6. Avoid-Interest Suppression
    if (options.avoidInterests && options.avoidInterests.length > 0) {
      const lowerAvoids = options.avoidInterests.map((a) => a.toLowerCase());
      if (
        (lowerAvoids.includes("shopping") &&
          (item.normalizedCategory === "shopping" || item.normalizedCategory === "handicraft")) ||
        (lowerAvoids.includes("hotel") && item.normalizedCategory === "hotel")
      ) {
        score -= 60;
        reasons.push("Suppressed due to user avoid-interest filter");
      }
    }

    const clampedScore = Math.max(0, Math.min(100, score));
    const combinedReason = reasons.length > 0 ? reasons.join("; ") : "Standard catalogued place";

    return {
      score: clampedScore,
      reason: combinedReason
    };
  }

  /**
   * Assesses data quality and builds the final aggregated response payload.
   */
  assessBusinesses(
    destination: DestinationRow,
    rawBusinesses: LocalBusinessRow[],
    options: BusinessFilterOptions = {}
  ): DestinationBusinessesDto {
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

    // 1. Normalize and score items
    const normalizedItems: LocalBusinessItemDto[] = rawBusinesses.map((b) => {
      const item = this.normalizeBusiness(b, destination);
      const { score, reason } = this.scoreBusiness(item, options);
      item.matchScore = score;
      item.matchReason = reason;

      if (b.source && !seenSources.has(`local_businesses:${b.source}`)) {
        sources.push({
          type: "database",
          provider: b.source,
          resource: "local_businesses"
        });
        seenSources.add(`local_businesses:${b.source}`);
      }

      return item;
    });

    // 2. Filter by Category / Search if requested
    let filteredItems = normalizedItems;

    if (options.category) {
      const requested = options.category.toLowerCase().trim();
      filteredItems = filteredItems.filter(
        (b) =>
          b.normalizedCategory === requested ||
          (b.type && b.type.toLowerCase().includes(requested)) ||
          b.name.toLowerCase().includes(requested)
      );
    }

    if (options.search) {
      const term = options.search.toLowerCase().trim();
      filteredItems = filteredItems.filter(
        (b) =>
          b.name.toLowerCase().includes(term) ||
          (b.address && b.address.toLowerCase().includes(term)) ||
          (b.type && b.type.toLowerCase().includes(term))
      );
    }

    if (options.verifiedOnly) {
      filteredItems = filteredItems.filter((b) => b.verified === true);
    }

    // 3. Deterministic Sort: MatchScore DESC -> Name ASC
    filteredItems.sort((a, b) => {
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      return a.name.localeCompare(b.name);
    });

    // 4. Data Quality Evaluation
    const totalCount = filteredItems.length;
    const verifiedCount = filteredItems.filter((b) => b.verified).length;

    let status: BusinessDataQualityStatus = "insufficient";
    let explanation = "No verified local businesses are currently indexed for this destination.";

    if (totalCount >= 2 && verifiedCount >= 1) {
      status = "sufficient";
      explanation = `Found ${totalCount} verified commercial enterprise(s) matching your criteria with official government registration.`;
    } else if (totalCount > 0) {
      status = "limited";
      explanation = `Found ${totalCount} catalogued business record(s); commercial pricing, menus, and operating hours require direct verification.`;
    }

    const availableCategories = Array.from(
      new Set(normalizedItems.map((b) => b.normalizedCategory))
    );

    const unknowns: string[] = [
      "unrecorded_commercial_pricing_and_menus",
      "uncatalogued_daily_opening_and_closing_hours",
      "unverified_customer_ratings_and_reviews",
      "venue_specific_wheelchair_and_elderly_accommodations"
    ];

    return {
      destinationId: destination.id,
      destinationName: destination.name,
      state: destination.state,
      dataQuality: {
        status,
        totalCount,
        verifiedCount,
        explanation
      },
      businesses: filteredItems,
      availableCategories,
      unknowns,
      disclaimer:
        "Local business records are sourced strictly from verified tourism department registries. Commercial pricing, ratings, and opening hours are not tracked; contact venue operators directly.",
      sources
    };
  }
}

export const businessAnalyzer = new BusinessAnalyzer();
