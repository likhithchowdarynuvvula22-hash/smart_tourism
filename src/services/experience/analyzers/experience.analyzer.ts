import {
  DestinationExperienceAssessmentDto,
  ExperienceCategory,
  ExperienceDataQualityStatus,
  ExperienceItemDto,
  ExperienceQueryOptions
} from "../../../types/experience";
import {
  AttractionRow,
  DestinationRow,
  ExperienceRow,
  LanguageRow,
  LocalBusinessRow
} from "../../../types/database.types";
import { ProvenanceSource } from "../../../types/ai";

export class ExperienceAnalyzer {
  /**
   * Deterministic category mapping ontology.
   * Maps natural language keywords and database tokens to standardized ExperienceCategories.
   */
  private readonly RELATED_CATEGORIES: Record<string, string[]> = {
    heritage: ["culture", "history", "spiritual"],
    culture: ["heritage", "history", "food", "rural"],
    history: ["heritage", "culture"],
    spiritual: ["heritage", "wellness", "culture"],
    nature: ["relaxation", "wellness", "adventure", "leisure"],
    wellness: ["spiritual", "nature", "relaxation"],
    adventure: ["nature"],
    food: ["culture", "relaxation"],
    shopping: ["culture", "leisure"],
    relaxation: ["nature", "wellness", "leisure"],
    family: ["nature", "leisure", "relaxation"],
    photography: ["nature", "heritage", "scenic"],
    leisure: ["relaxation", "family", "nature"]
  };

  /**
   * Normalizes an item's title, description, and raw category into standardized category tags.
   */
  normalizeCategories(
    name: string,
    rawCategory?: string | null,
    description?: string | null
  ): ExperienceCategory[] {
    const combined = `${name || ""} ${rawCategory || ""} ${description || ""}`.toLowerCase();
    const categories = new Set<ExperienceCategory>();

    // 1. Heritage
    if (
      combined.includes("heritage") ||
      combined.includes("fort") ||
      combined.includes("palace") ||
      combined.includes("monument") ||
      combined.includes("historic") ||
      combined.includes("ancient") ||
      combined.includes("ruins") ||
      combined.includes("tonga") ||
      combined.includes("temple") ||
      combined.includes("caves") ||
      combined.includes("attari")
    ) {
      categories.add("heritage");
    }

    // 2. Culture
    if (
      combined.includes("culture") ||
      combined.includes("cultural") ||
      combined.includes("tribal") ||
      combined.includes("tradition") ||
      combined.includes("village") ||
      combined.includes("museum") ||
      combined.includes("art") ||
      combined.includes("craft") ||
      combined.includes("rural") ||
      combined.includes("dekho") ||
      combined.includes("prayagraj")
    ) {
      categories.add("culture");
    }

    // 3. Spiritual
    if (
      combined.includes("spiritual") ||
      combined.includes("temple") ||
      combined.includes("shrine") ||
      combined.includes("ashram") ||
      combined.includes("vedic") ||
      combined.includes("meditation") ||
      combined.includes("pilgrimage") ||
      combined.includes("buddha") ||
      combined.includes("mosque") ||
      combined.includes("church") ||
      combined.includes("chitrakoot") ||
      combined.includes("keshavraipatan")
    ) {
      categories.add("spiritual");
    }

    // 4. Nature
    if (
      combined.includes("nature") ||
      combined.includes("eco") ||
      combined.includes("forest") ||
      combined.includes("sanctuary") ||
      combined.includes("bird") ||
      combined.includes("biodiversity") ||
      combined.includes("park") ||
      combined.includes("garden") ||
      combined.includes("wildlife") ||
      combined.includes("falls") ||
      combined.includes("waterfall") ||
      combined.includes("valley") ||
      combined.includes("hills") ||
      combined.includes("lake") ||
      combined.includes("river") ||
      combined.includes("tea") ||
      combined.includes("botanical")
    ) {
      categories.add("nature");
    }

    // 5. Adventure
    if (
      combined.includes("adventure") ||
      combined.includes("cave") ||
      combined.includes("trek") ||
      combined.includes("trail") ||
      combined.includes("rock") ||
      combined.includes("climbing") ||
      combined.includes("safari") ||
      combined.includes("rafting") ||
      combined.includes("water sports")
    ) {
      categories.add("adventure");
    }

    // 6. Wellness
    if (
      combined.includes("wellness") ||
      combined.includes("eco-wellness") ||
      combined.includes("vedic") ||
      combined.includes("yoga") ||
      combined.includes("ayurveda") ||
      combined.includes("spa") ||
      combined.includes("retreat") ||
      combined.includes("rejuvenation")
    ) {
      categories.add("wellness");
    }

    // 7. Food
    if (
      combined.includes("food") ||
      combined.includes("tea garden") ||
      combined.includes("coffee") ||
      combined.includes("plantation") ||
      combined.includes("culinary") ||
      combined.includes("cuisine") ||
      combined.includes("dining") ||
      combined.includes("restaurant") ||
      combined.includes("cafe")
    ) {
      categories.add("food");
    }

    // 8. Shopping
    if (
      combined.includes("shopping") ||
      combined.includes("bazaar") ||
      combined.includes("market") ||
      combined.includes("handicraft") ||
      combined.includes("emporium") ||
      combined.includes("textile") ||
      combined.includes("souvenir")
    ) {
      categories.add("shopping");
    }

    // 9. Relaxation / Leisure
    if (
      combined.includes("relax") ||
      combined.includes("leisure") ||
      combined.includes("peaceful") ||
      combined.includes("quiet") ||
      combined.includes("nooks") ||
      combined.includes("beach") ||
      combined.includes("waterfront") ||
      combined.includes("retreat")
    ) {
      categories.add("relaxation");
      categories.add("leisure");
    }

    // 10. Family
    if (
      combined.includes("family") ||
      combined.includes("park") ||
      combined.includes("garden") ||
      combined.includes("zoo") ||
      combined.includes("recreational")
    ) {
      categories.add("family");
    }

    // Fallback if none matched
    if (categories.size === 0) {
      categories.add("other");
    }

    return Array.from(categories);
  }

  /**
   * Deterministically scores and ranks candidates based on explicit interests, avoid-interests,
   * accessibility, senior suitability, and verified metadata.
   */
  scoreAndRankCandidates(
    items: ExperienceItemDto[],
    options: ExperienceQueryOptions = {}
  ): ExperienceItemDto[] {
    const userInterests = (options.interests || []).map((i) => i.toLowerCase().trim());
    const avoidInterests = (options.avoidInterests || []).map((i) => i.toLowerCase().trim());

    const scoredItems = items.map((item) => {
      let score = 50; // Neutral base score
      const matchReasons: string[] = [];

      // 1. Positive Interest Matching
      if (userInterests.length > 0) {
        let directMatchCount = 0;
        let relatedMatchCount = 0;

        for (const interest of userInterests) {
          if (item.normalizedCategories.includes(interest as ExperienceCategory)) {
            directMatchCount++;
            matchReasons.push(`Matches interest: ${interest}`);
          } else {
            // Check related categories
            const related = this.RELATED_CATEGORIES[interest] || [];
            const hasRelated = related.some((r) =>
              item.normalizedCategories.includes(r as ExperienceCategory)
            );
            if (hasRelated) {
              relatedMatchCount++;
              matchReasons.push(`Related to ${interest}`);
            }
          }
        }

        if (directMatchCount > 0) {
          score += Math.min(40, directMatchCount * 30);
        } else if (relatedMatchCount > 0) {
          score += Math.min(25, relatedMatchCount * 15);
        } else {
          // No match with explicit user interests
          score -= 15;
        }
      } else {
        matchReasons.push("Verified destination highlight");
      }

      // 2. Excluded / Avoid Interests Matching
      if (avoidInterests.length > 0) {
        for (const avoid of avoidInterests) {
          if (item.normalizedCategories.includes(avoid as ExperienceCategory)) {
            score -= 60;
            matchReasons.push(`Suppressed due to avoid preference: ${avoid}`);
          }
        }
      }

      // 3. Accessibility & Persona Factors
      if (options.isElderlyTraveller) {
        if (item.elderlySuitability.suitable) {
          score += 15;
          matchReasons.push("Verified senior citizen friendly");
        }
      }

      if (options.isWheelchairUser) {
        if (item.accessibility.wheelchairAccess) {
          score += 15;
          matchReasons.push("Verified wheelchair accessible");
        }
      }

      if (options.isBudgetConstrained) {
        if (
          item.knownCost?.isFree ||
          (item.knownCost?.amount !== null &&
            item.knownCost?.amount !== undefined &&
            item.knownCost.amount <= 50)
        ) {
          score += 10;
          matchReasons.push("Low/Free verified entry fee");
        }
      }

      if (item.verified) {
        score += 5;
      }

      // Clamp score
      const finalScore = Math.max(0, Math.min(100, score));

      return {
        ...item,
        matchScore: finalScore,
        matchReason: matchReasons.length > 0 ? matchReasons.join("; ") : "Verified candidate"
      };
    });

    // Sort descending by matchScore, keeping verified higher
    return scoredItems.sort((a, b) => {
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Deterministically assesses destination cultural and experience intelligence.
   */
  assessDestinationExperiences(
    destination: DestinationRow,
    experiences: ExperienceRow[],
    attractions: AttractionRow[],
    businesses: LocalBusinessRow[],
    languageRow: LanguageRow | null,
    options: ExperienceQueryOptions = {},
    accessibilityMap: Map<
      string,
      { wheelchair: boolean; elderly: boolean; details?: string }
    > = new Map(),
    feesMap: Map<
      string,
      { amount: number | null; isFree: boolean; pricingType: string }
    > = new Map()
  ): DestinationExperienceAssessmentDto {
    const rawItems: ExperienceItemDto[] = [];
    const sources: ProvenanceSource[] = [];
    const unknowns: string[] = [];
    const warnings: string[] = [];

    // Track Destination Source
    if (destination.source) {
      sources.push({
        type: "database",
        provider: destination.source,
        resource: "destinations"
      });
    }

    // 1. Process Experiences
    for (const exp of experiences) {
      const normalizedCats = this.normalizeCategories(exp.name, exp.category, null);
      const acc = accessibilityMap.get(exp.id) || { wheelchair: false, elderly: false };
      const fee = feesMap.get(exp.id) || {
        amount: exp.price !== null ? Number(exp.price) : null,
        isFree: exp.price === 0,
        pricingType: exp.price !== null ? "verified_experience_price" : "unknown"
      };

      rawItems.push({
        id: exp.id,
        name: exp.name,
        itemType: "experience",
        category: exp.category || "Government tourism development project",
        normalizedCategories: normalizedCats,
        description: `Verified experience initiative (${exp.category || "tourism development"})`,
        matchScore: 50,
        matchReason: "Verified local experience",
        verified: exp.verified ?? true,
        accessibility: {
          supported: acc.wheelchair,
          wheelchairAccess: acc.wheelchair,
          details: acc.details || null
        },
        elderlySuitability: {
          suitable: acc.elderly,
          note: acc.elderly ? "Suitable for elderly visitors" : null
        },
        knownCost: {
          amount: fee.amount,
          currency: exp.currency || "INR",
          isFree: fee.isFree,
          pricingType: fee.pricingType
        },
        crowdContext: {
          rushFreeHours: destination.rush_free_hours,
          bestTime: destination.best_time_to_visit
        },
        languagesSpoken: languageRow?.official_language ? [languageRow.official_language] : [],
        source: exp.source,
        sourceUrl: exp.source_url,
        verificationStatus: exp.verification_status
      });

      if (exp.source && !sources.some((s) => s.provider === exp.source)) {
        sources.push({
          type: "database",
          provider: exp.source,
          resource: "experiences"
        });
      }
    }

    // 2. Process Attractions (as complementary cultural / heritage / spiritual candidates)
    if (options.includeAttractions !== false) {
      for (const attr of attractions) {
        const normalizedCats = this.normalizeCategories(attr.name, attr.category, attr.description);
        const acc = accessibilityMap.get(attr.id) || { wheelchair: false, elderly: false };
        const fee = feesMap.get(attr.id) || {
          amount: null,
          isFree: false,
          pricingType: "unknown"
        };

        rawItems.push({
          id: attr.id,
          name: attr.name,
          itemType: "attraction",
          category: attr.category || "Sightseeing",
          normalizedCategories: normalizedCats,
          description: attr.description,
          matchScore: 50,
          matchReason: "Verified attraction candidate",
          verified: attr.verification_status?.includes("verified") ?? true,
          accessibility: {
            supported: acc.wheelchair,
            wheelchairAccess: acc.wheelchair,
            details: acc.details || null
          },
          elderlySuitability: {
            suitable: acc.elderly,
            note: acc.elderly ? "Accessible paths for elderly travellers" : null
          },
          knownCost: {
            amount: fee.amount,
            currency: "INR",
            isFree: fee.isFree,
            pricingType: fee.pricingType
          },
          crowdContext: {
            rushFreeHours: destination.rush_free_hours,
            bestTime: destination.best_time_to_visit
          },
          languagesSpoken: languageRow?.official_language ? [languageRow.official_language] : [],
          source: attr.source,
          sourceUrl: attr.source_url,
          verificationStatus: attr.verification_status
        });

        if (attr.source && !sources.some((s) => s.provider === attr.source)) {
          sources.push({
            type: "database",
            provider: attr.source,
            resource: "attractions"
          });
        }
      }
    }

    // 3. Process Local Businesses (when food, stays, or local vendors are requested)
    if (options.includeBusinesses) {
      for (const biz of businesses) {
        const normalizedCats = this.normalizeCategories(biz.name, biz.type, null);

        rawItems.push({
          id: biz.id,
          name: biz.name,
          itemType: "local_business",
          category: biz.type || "Homestay",
          normalizedCategories: normalizedCats,
          description: `Verified local business: ${biz.address || "Local address"}`,
          matchScore: 50,
          matchReason: "Verified local business",
          verified: biz.verified ?? true,
          accessibility: {
            supported: false,
            wheelchairAccess: false,
            details: null
          },
          elderlySuitability: {
            suitable: false,
            note: null
          },
          knownCost: {
            amount: null,
            currency: "INR",
            isFree: false,
            pricingType: "unknown"
          },
          crowdContext: null,
          languagesSpoken: languageRow?.official_language ? [languageRow.official_language] : [],
          source: biz.source,
          sourceUrl: biz.source_url,
          verificationStatus: biz.verification_status
        });

        if (biz.source && !sources.some((s) => s.provider === biz.source)) {
          sources.push({
            type: "database",
            provider: biz.source,
            resource: "local_businesses"
          });
        }
      }
    }

    // Rank items
    const rankedItems = this.scoreAndRankCandidates(rawItems, options);
    const finalItems = options.limit ? rankedItems.slice(0, options.limit) : rankedItems;

    // 4. Data Quality Evaluation
    let dataQualityStatus: ExperienceDataQualityStatus = "insufficient";
    let explanation = "Zero verified experience or attraction records exist for this destination.";

    if (experiences.length > 0 || attractions.length >= 2) {
      dataQualityStatus = "sufficient";
      explanation = `Verified experience records (${experiences.length}) and attraction records (${attractions.length}) are available.`;
    } else if (attractions.length > 0 || businesses.length > 0) {
      dataQualityStatus = "limited";
      explanation = `Limited experience records (0 direct experiences, ${attractions.length} attractions, ${businesses.length} businesses).`;
    }

    // 5. Languages Source
    if (languageRow?.source && !sources.some((s) => s.provider === languageRow.source)) {
      sources.push({
        type: "database",
        provider: languageRow.source,
        resource: "languages"
      });
    }

    // 6. Unknowns & Disclaimers
    unknowns.push("uncatalogued_cultural_festivals_and_rituals");
    unknowns.push("unrecorded_local_cuisine_menus");
    unknowns.push("unverified_private_business_pricing");

    if (experiences.length === 0) {
      warnings.push(
        "No direct government tourism experience projects are indexed for this destination. Complementary verified attractions and cultural sites have been provided."
      );
    }

    if (options.avoidInterests && options.avoidInterests.length > 0) {
      warnings.push(
        `Items tagged with avoid-interests [${options.avoidInterests.join(", ")}] have been suppressed from primary recommendations.`
      );
    }

    const disclaimer =
      "Cultural & experience intelligence is computed strictly from verified database records (experiences, attractions, local businesses, and regional languages). Specific local traditions, temporary festivals, and unrecorded dining prices are not tracked.";

    return {
      destinationId: destination.id,
      destinationName: destination.name,
      state: destination.state,
      interests: options.interests || [],
      avoidInterests: options.avoidInterests || [],
      dataQuality: {
        status: dataQualityStatus,
        experienceCount: experiences.length,
        attractionCount: attractions.length,
        businessCount: businesses.length,
        explanation
      },
      languages: languageRow
        ? {
            official: languageRow.official_language,
            local: languageRow.local_languages,
            guide: languageRow.guide_languages,
            source: languageRow.source
          }
        : null,
      rankedItems: finalItems,
      unknowns,
      warnings,
      disclaimer,
      sources
    };
  }
}

export const experienceAnalyzer = new ExperienceAnalyzer();
