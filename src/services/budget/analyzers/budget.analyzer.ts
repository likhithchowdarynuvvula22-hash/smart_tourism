import {
  AttractionFeeBreakdownDto,
  BudgetDataQuality,
  BudgetQueryOptions,
  BudgetStatus,
  BudgetSummaryDto,
  CostCategorySummaryDto,
  DestinationBudgetAssessmentDto,
  TravellerCountDto,
  VerifiedSavingDto
} from "../../../types/budget";
import { AttractionRow, DestinationRow, EntryFeesRow } from "../../../types/database.types";

export class BudgetAnalyzer {
  /**
   * Deterministically assesses destination budget, entry fee breakdowns,
   * senior/student concessions, and cost categories.
   */
  assessDestinationBudget(
    destination: DestinationRow,
    attractions: AttractionRow[],
    entryFees: EntryFeesRow[],
    options: BudgetQueryOptions = {}
  ): DestinationBudgetAssessmentDto {
    const currency = options.currency || "INR";
    const hasExplicitCounts =
      options.adults !== undefined ||
      options.seniors !== undefined ||
      options.children !== undefined ||
      options.students !== undefined ||
      options.foreignAdults !== undefined;

    const adults =
      options.adults !== undefined ? Math.max(0, options.adults) : hasExplicitCounts ? 0 : 1;
    const seniors = Math.max(0, options.seniors ?? 0);
    const children = Math.max(0, options.children ?? 0);
    const students = Math.max(0, options.students ?? 0);
    const foreignAdults = Math.max(0, options.foreignAdults ?? 0);
    const durationDays = Math.max(1, options.durationDays ?? 1);
    const userBudget = options.userBudget ?? null;

    const travellerBreakdown: TravellerCountDto = {
      adults,
      seniors: seniors > 0 ? seniors : undefined,
      children: children > 0 ? children : undefined,
      students: students > 0 ? students : undefined,
      foreignAdults: foreignAdults > 0 ? foreignAdults : undefined
    };

    const totalTravellers = adults + seniors + children + students + foreignAdults;

    // Map entry fees by attraction_id
    const feeMap = new Map<string, EntryFeesRow>();
    for (const fee of entryFees) {
      feeMap.set(fee.attraction_id, fee);
    }

    const attractionBreakdowns: AttractionFeeBreakdownDto[] = [];
    const savings: VerifiedSavingDto[] = [];
    let knownAttractionsSubtotal = 0;
    let verifiedAttractionsCount = 0;

    for (const attraction of attractions) {
      const feeRow = feeMap.get(attraction.id);

      if (!feeRow) {
        attractionBreakdowns.push({
          attractionId: attraction.id,
          attractionName: attraction.name,
          category: attraction.category || undefined,
          perPersonFee: null,
          totalFee: null,
          feeTypeApplied: "unknown",
          isFree: false,
          onlineBookingAvailable: false,
          ticketUrl: null,
          verified: false,
          source: null,
          sourceUrl: null,
          verificationStatus: "unindexed",
          feeDetails: {
            domestic: null,
            foreign: null,
            child: null,
            student: null,
            senior: null,
            currency
          }
        });
        continue;
      }

      verifiedAttractionsCount++;

      const domesticFee = feeRow.fee_domestic;
      const foreignFee = feeRow.fee_foreign;
      const childFee = feeRow.fee_child;
      const studentFee = feeRow.fee_student;
      const seniorFee = feeRow.fee_senior;

      const isFree =
        domesticFee === 0 &&
        (foreignFee === null || foreignFee === 0) &&
        (childFee === null || childFee === 0);

      // Determine per-person standard fee for domestic adult
      const baseDomestic = domesticFee ?? null;

      // Calculate total fee for this attraction across all travellers
      let attractionTotal = 0;
      let hasCalculatedTotal = false;

      // Only calculate total if we have at least domestic fee or free
      if (isFree) {
        attractionTotal = 0;
        hasCalculatedTotal = true;
      } else if (baseDomestic !== null) {
        hasCalculatedTotal = true;
        // Adults
        attractionTotal += adults * baseDomestic;

        // Seniors
        if (seniors > 0) {
          const appliedSenior = seniorFee !== null ? seniorFee : baseDomestic;
          attractionTotal += seniors * appliedSenior;
          if (seniorFee !== null && seniorFee < baseDomestic) {
            const savingPerPerson = baseDomestic - seniorFee;
            savings.push({
              attractionId: attraction.id,
              attractionName: attraction.name,
              description: `Senior citizen concession for ${attraction.name} (₹${seniorFee} vs ₹${baseDomestic})`,
              concessionType: "senior",
              standardFee: baseDomestic,
              concessionFee: seniorFee,
              savingPerPerson,
              totalSavings: savingPerPerson * seniors,
              currency
            });
          }
        }

        // Students
        if (students > 0) {
          const appliedStudent = studentFee !== null ? studentFee : baseDomestic;
          attractionTotal += students * appliedStudent;
          if (studentFee !== null && studentFee < baseDomestic) {
            const savingPerPerson = baseDomestic - studentFee;
            savings.push({
              attractionId: attraction.id,
              attractionName: attraction.name,
              description: `Student concession for ${attraction.name} (₹${studentFee} vs ₹${baseDomestic})`,
              concessionType: "student",
              standardFee: baseDomestic,
              concessionFee: studentFee,
              savingPerPerson,
              totalSavings: savingPerPerson * students,
              currency
            });
          }
        }

        // Children
        if (children > 0) {
          const appliedChild = childFee !== null ? childFee : 0;
          attractionTotal += children * appliedChild;
          if (childFee !== null && childFee < baseDomestic) {
            const savingPerPerson = baseDomestic - childFee;
            savings.push({
              attractionId: attraction.id,
              attractionName: attraction.name,
              description: `Child ticket concession for ${attraction.name} (₹${childFee} vs ₹${baseDomestic})`,
              concessionType: "child",
              standardFee: baseDomestic,
              concessionFee: childFee,
              savingPerPerson,
              totalSavings: savingPerPerson * children,
              currency
            });
          }
        }

        // Foreign Visitors
        if (foreignAdults > 0) {
          const appliedForeign = foreignFee !== null ? foreignFee : baseDomestic;
          attractionTotal += foreignAdults * appliedForeign;
        }
      }

      if (hasCalculatedTotal) {
        knownAttractionsSubtotal += attractionTotal;
      }

      let feeTypeApplied: AttractionFeeBreakdownDto["feeTypeApplied"] = "unknown";
      if (isFree) {
        feeTypeApplied = "free";
      } else if (foreignAdults > 0 && totalTravellers === foreignAdults) {
        feeTypeApplied = "foreign";
      } else if (seniors > 0 && totalTravellers === seniors && seniorFee !== null) {
        feeTypeApplied = "senior";
      } else if (students > 0 && totalTravellers === students && studentFee !== null) {
        feeTypeApplied = "student";
      } else if (baseDomestic !== null) {
        feeTypeApplied = "domestic";
      }

      attractionBreakdowns.push({
        attractionId: attraction.id,
        attractionName: attraction.name,
        category: attraction.category || undefined,
        perPersonFee: baseDomestic,
        totalFee: hasCalculatedTotal ? attractionTotal : null,
        feeTypeApplied,
        isFree,
        onlineBookingAvailable: Boolean(feeRow.online_ticket),
        ticketUrl: feeRow.ticket_url,
        verified: true,
        source: feeRow.source,
        sourceUrl: feeRow.source_url,
        verificationStatus: feeRow.verification_status,
        feeDetails: {
          domestic: domesticFee,
          foreign: foreignFee,
          child: childFee,
          student: studentFee,
          senior: seniorFee,
          currency: feeRow.currency || currency
        }
      });
    }

    // Data Quality evaluation
    let dataQualityStatus: BudgetDataQuality["status"] = "insufficient";
    let dataQualityExplanation =
      "No verified entry fee records are available for this destination.";
    const evidenceAvailable: string[] = [];
    const evidenceUnavailable: string[] = [
      "hotel_nightly_rates",
      "restaurant_meal_prices",
      "taxi_and_transit_fares"
    ];

    if (attractions.length > 0 && verifiedAttractionsCount === attractions.length) {
      dataQualityStatus = "sufficient";
      dataQualityExplanation =
        "Verified entry fees are available for all catalogued attractions in this destination.";
      evidenceAvailable.push("attraction_entry_fees");
    } else if (verifiedAttractionsCount > 0) {
      dataQualityStatus = "limited";
      dataQualityExplanation = `Verified entry fees are available for ${verifiedAttractionsCount} of ${attractions.length} attractions.`;
      evidenceAvailable.push("partial_attraction_entry_fees");
      evidenceUnavailable.push("unindexed_attraction_fees");
    } else {
      dataQualityStatus = "insufficient";
      dataQualityExplanation =
        "Zero verified entry fee records exist for attractions in this destination.";
      evidenceUnavailable.push("attraction_entry_fees");
    }

    const dataQuality: BudgetDataQuality = {
      status: dataQualityStatus,
      explanation: dataQualityExplanation,
      verifiedAttractionsCount,
      totalAttractionsCount: attractions.length,
      evidenceAvailable,
      evidenceUnavailable
    };

    const unknownCategories: BudgetSummaryDto["unknownCategories"] = [
      "accommodation",
      "food",
      "transport"
    ];

    // Budget Status
    let budgetStatus: BudgetStatus = "unknown";
    if (userBudget !== null) {
      if (knownAttractionsSubtotal > userBudget) {
        budgetStatus = "over_budget";
      } else {
        // Unknown categories prevent confirming under_budget for whole trip
        budgetStatus = "unknown";
      }
    }

    const remainingBudget = userBudget !== null ? userBudget - knownAttractionsSubtotal : null;

    const budgetSummary: BudgetSummaryDto = {
      userBudget,
      currency,
      knownSubtotal: knownAttractionsSubtotal,
      remainingBudget,
      status: budgetStatus,
      dataQuality,
      unknownCategories,
      travellerCount: totalTravellers,
      travellerBreakdown,
      durationDays
    };

    const breakdown = {
      attractionFees: attractionBreakdowns,
      accommodation: {
        category: "accommodation" as const,
        amount: null,
        status: "unknown" as const,
        notes:
          "Accommodation room rates are not tracked in the database. Excluded from known costs."
      },
      food: {
        category: "food" as const,
        amount: null,
        status: "unknown" as const,
        notes:
          "Dining and restaurant menu prices are not tracked in the database. Excluded from known costs."
      },
      transport: {
        category: "transport" as const,
        amount: null,
        status: "unknown" as const,
        notes:
          "Taxi fares, bus tickets, and transit rates are not tracked in the database. Road transit distance is not converted into monetary cost."
      },
      otherKnownCosts: [] as CostCategorySummaryDto[]
    };

    // Warnings and Recommendations
    const warnings: string[] = [];
    const recommendations: string[] = [];

    warnings.push(
      "Incomplete Cost Disclosure: Accommodation, dining, and local transit costs are unrecorded and excluded from the known subtotal."
    );

    if (userBudget !== null && knownAttractionsSubtotal > userBudget) {
      warnings.push(
        `Over Budget Alert: Verified attraction entry fees (₹${knownAttractionsSubtotal}) alone exceed your allocated budget (₹${userBudget}).`
      );
    }

    if (savings.length > 0) {
      const totalSavingsAmt = savings.reduce((acc, s) => acc + s.totalSavings, 0);
      recommendations.push(
        `Verified concessions available: You can save up to ₹${totalSavingsAmt} across ${savings.length} attraction(s) using senior/student/child discounts.`
      );
    }

    const freeAttractions = attractionBreakdowns.filter((a) => a.isFree);
    if (freeAttractions.length > 0) {
      recommendations.push(
        `${freeAttractions.length} attraction(s) have verified free public access: ${freeAttractions.map((a) => a.attractionName).join(", ")}.`
      );
    }

    const sources = [
      {
        type: "database" as const,
        provider: "Supabase Relational Database",
        resource: "entry_fees"
      },
      {
        type: "database" as const,
        provider: "Supabase Relational Database",
        resource: "attractions"
      }
    ];

    const disclaimer =
      "Budget and cost intelligence is computed strictly from verified entry fee records in the database. Final travel expenditure will be higher as accommodation, food, and transit rates are not catalogued.";

    return {
      destinationId: destination.id,
      destinationName: destination.name,
      state: destination.state,
      currency,
      budget: budgetSummary,
      breakdown,
      savings,
      recommendations,
      warnings,
      disclaimer,
      sources
    };
  }
}

export const budgetAnalyzer = new BudgetAnalyzer();
