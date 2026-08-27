import {
  SafetyAnalysisInput,
  DestinationWomenSafetyDto,
  WomenSafetyRiskLevel,
  DataQualityStatus,
  WomenSafetyDataQuality,
  SourceBackedSafetyScore,
  NormalizedSafetyAlert,
  NormalizedSafetyIncident,
  IncidentFreshness,
  WomenSpecificEmergencyResource
} from "../../../types/safety";
import { ProvenanceSource } from "../../../types/ai";

export class WomenSafetyAnalyzer {
  /**
   * Performs deterministic, evidence-grounded women safety analysis.
   */
  assess(input: SafetyAnalysisInput): DestinationWomenSafetyDto {
    const {
      destinationId,
      destinationName,
      state,
      targetDate,
      womenSafetyRow,
      indicators,
      alerts,
      incidents,
      emergencyResources
    } = input;

    const sources: ProvenanceSource[] = [];
    const evidenceAvailable: string[] = [];
    const evidenceUnavailable: string[] = [];

    // 1. Process Women Safety Record & Indicators
    let helpline = "1091 / 181";
    let womenPolice: string | null = null;
    let supportCenter: string | null = null;
    let medicalFacility: string | null = null;
    let verificationStatus: string | null = null;
    let lastVerified: string | null = null;
    let source: string | null = null;
    let sourceUrl: string | null = null;

    if (womenSafetyRow) {
      sources.push({
        type: "database",
        provider: "Supabase",
        resource: "women_safety"
      });

      if (womenSafetyRow.women_helpline) {
        helpline = womenSafetyRow.women_helpline;
        evidenceAvailable.push("verified_national_women_helpline");
      }
      if (womenSafetyRow.women_police) {
        womenPolice = womenSafetyRow.women_police;
        evidenceAvailable.push("verified_local_women_police");
      } else {
        evidenceUnavailable.push("local_women_police_station");
      }
      if (womenSafetyRow.women_support_center) {
        supportCenter = womenSafetyRow.women_support_center;
        evidenceAvailable.push("verified_women_support_center");
      } else {
        evidenceUnavailable.push("local_women_support_center");
      }
      if (womenSafetyRow.medical_facility) {
        medicalFacility = womenSafetyRow.medical_facility;
        evidenceAvailable.push("verified_medical_facility");
      } else {
        evidenceUnavailable.push("destination_medical_facility");
      }

      verificationStatus = womenSafetyRow.verification_status;
      lastVerified = womenSafetyRow.last_verified;
      source = womenSafetyRow.source;
      sourceUrl = womenSafetyRow.source_url;
    } else {
      evidenceUnavailable.push("women_safety_destination_record");
    }

    // 2. Process Source-Backed Safety Score from Indicators
    let sourceBackedScore: SourceBackedSafetyScore | null = null;
    if (indicators && indicators.length > 0) {
      sources.push({
        type: "database",
        provider: "Supabase",
        resource: "safety_indicators"
      });

      const validIndicator = indicators.find((ind) => {
        if (ind.valid_from && ind.valid_from > targetDate) return false;
        if (ind.valid_to && ind.valid_to < targetDate) return false;
        return ind.score !== null && ind.score !== undefined;
      });

      if (validIndicator && validIndicator.score !== null) {
        sourceBackedScore = {
          score: validIndicator.score,
          confidence: validIndicator.confidence ?? 0.85,
          explanation: validIndicator.explanation,
          indicatorType: validIndicator.indicator_type,
          source: validIndicator.source || "Official Safety Indicator",
          validFrom: validIndicator.valid_from,
          validTo: validIndicator.valid_to
        };
        evidenceAvailable.push("source_backed_safety_indicator");
      }
    }

    if (!sourceBackedScore) {
      evidenceUnavailable.push("source_backed_safety_indicator");
    }

    // 3. Process Safety Alerts & Freshness
    const normalizedAlerts: NormalizedSafetyAlert[] = [];
    let hasActiveElevatedAlert = false;
    let hasActiveAdvisoryAlert = false;

    if (alerts && alerts.length > 0) {
      sources.push({
        type: "database",
        provider: "Supabase",
        resource: "safety_alerts"
      });

      for (const alert of alerts) {
        const isCurrent =
          (!alert.starts_at || alert.starts_at <= targetDate) &&
          (!alert.ends_at || alert.ends_at >= targetDate) &&
          alert.status !== "cancelled" &&
          alert.status !== "resolved";

        normalizedAlerts.push({
          id: alert.id,
          title: alert.title,
          severity: alert.severity,
          message: alert.message,
          startsAt: alert.starts_at,
          endsAt: alert.ends_at,
          status: alert.status,
          isCurrent
        });

        if (isCurrent) {
          evidenceAvailable.push(`active_safety_alert_${alert.severity.toLowerCase()}`);
          if (["high", "critical", "severe", "extreme"].includes(alert.severity.toLowerCase())) {
            hasActiveElevatedAlert = true;
          } else {
            hasActiveAdvisoryAlert = true;
          }
        }
      }
    } else {
      evidenceUnavailable.push("active_safety_alerts");
    }

    // 4. Process Safety Incidents & Freshness
    const normalizedIncidents: NormalizedSafetyIncident[] = [];
    let hasRecentSeriousIncident = false;

    const targetTimeMs = Date.parse(targetDate) || Date.now();
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;

    if (incidents && incidents.length > 0) {
      sources.push({
        type: "database",
        provider: "Supabase",
        resource: "safety_incidents"
      });

      for (const inc of incidents) {
        let freshness: IncidentFreshness = "historical";
        if (inc.incident_date) {
          const incTimeMs = Date.parse(inc.incident_date);
          if (!isNaN(incTimeMs)) {
            const ageMs = targetTimeMs - incTimeMs;
            if (ageMs >= 0 && ageMs <= oneYearMs) {
              freshness = "recent";
            } else if (ageMs < 0) {
              freshness = "recent"; // future/advisory
            } else {
              freshness = "historical";
            }
          }
        }

        if (inc.status === "resolved" || inc.status === "closed") {
          freshness = "stale";
        }

        normalizedIncidents.push({
          id: inc.id,
          category: inc.category,
          severity: inc.severity,
          description: inc.description,
          incidentDate: inc.incident_date,
          status: inc.status,
          verificationStatus: inc.verification_status,
          freshness
        });

        if (
          freshness === "recent" &&
          inc.severity &&
          ["high", "critical", "severe"].includes(inc.severity.toLowerCase())
        ) {
          hasRecentSeriousIncident = true;
          evidenceAvailable.push("recent_verified_safety_incident");
        } else if (freshness === "historical") {
          evidenceAvailable.push("historical_incident_record");
        }
      }
    } else {
      evidenceUnavailable.push("safety_incidents_recorded");
    }

    // 5. Process Emergency Resources
    const localWomenSpecific: WomenSpecificEmergencyResource[] = [];
    const nationalWomenSpecific: WomenSpecificEmergencyResource[] = [];
    let nationalEmergency = "112";
    let police = "100";
    let ambulance = "108 / 102";
    let touristSupport = "1363";

    if (emergencyResources && emergencyResources.length > 0) {
      sources.push({
        type: "database",
        provider: "Supabase",
        resource: "emergency_resources"
      });

      for (const res of emergencyResources) {
        const typeLower = (res.type || "").toLowerCase();
        const nameLower = (res.name || "").toLowerCase();

        // Check for general helplines
        if (typeLower.includes("dispatch") || nameLower.includes("erss") || res.phone === "112") {
          if (res.phone) nationalEmergency = res.phone;
        } else if (typeLower.includes("law enforcement") && res.phone === "100") {
          if (res.phone) police = res.phone;
        } else if (typeLower.includes("medical") && (res.phone === "102" || res.phone === "108")) {
          if (res.phone) ambulance = res.phone;
        } else if (typeLower.includes("tourist") || res.phone?.includes("1363")) {
          if (res.phone) touristSupport = res.phone;
        }

        // Check for women-specific resources
        const isWomenResource =
          typeLower.includes("women") ||
          typeLower.includes("mahila") ||
          typeLower.includes("shelter") ||
          typeLower.includes("domestic violence") ||
          nameLower.includes("women") ||
          nameLower.includes("mahila") ||
          nameLower.includes("sakhi") ||
          nameLower.includes("disha");

        if (isWomenResource) {
          const item: WomenSpecificEmergencyResource = {
            name: res.name,
            type: res.type,
            phone: res.phone,
            address: res.address,
            openingHours: res.opening_hours,
            verified: Boolean(res.verified)
          };

          if (res.destination_id === destinationId) {
            localWomenSpecific.push(item);
          } else {
            nationalWomenSpecific.push(item);
          }
        }
      }

      if (localWomenSpecific.length > 0) {
        evidenceAvailable.push("verified_local_women_emergency_facilities");
      } else {
        evidenceUnavailable.push("local_women_emergency_facilities");
      }

      if (nationalWomenSpecific.length > 0) {
        evidenceAvailable.push("verified_national_women_support_directory");
      }
      evidenceAvailable.push("verified_general_emergency_infrastructure");
    } else {
      evidenceUnavailable.push("emergency_resources_directory");
    }

    const allWomenSpecific = [...localWomenSpecific, ...nationalWomenSpecific];

    // 6. Data Quality Classification
    let dataQualityStatus: DataQualityStatus = "limited";
    let dataQualityExplanation = "";

    const hasDestinationRecord = Boolean(womenSafetyRow);
    const hasLocalWomenSupport = Boolean(
      womenPolice || supportCenter || localWomenSpecific.length > 0
    );
    const hasActiveOrRecentIncidents = normalizedIncidents.some(
      (inc) => inc.freshness === "recent"
    );
    const hasActiveAlerts = normalizedAlerts.some((a) => a.isCurrent);
    const hasLocalIndicatorsOrAlerts = Boolean(
      sourceBackedScore || hasActiveAlerts || hasActiveOrRecentIncidents
    );

    if (hasDestinationRecord && (hasLocalWomenSupport || hasLocalIndicatorsOrAlerts)) {
      dataQualityStatus = "sufficient";
      dataQualityExplanation =
        "Verified destination-level safety records, localized emergency facilities, or official safety indicators are available.";
    } else if (hasDestinationRecord && emergencyResources.length > 0) {
      dataQualityStatus = "limited";
      dataQualityExplanation =
        "Official national women helplines (1091 / 181) and general emergency infrastructure are verified. Destination-specific local safety indicators and localized women police stations are not currently indexed in the verified dataset.";
    } else {
      dataQualityStatus = "insufficient";
      dataQualityExplanation =
        "Insufficient destination-specific women safety records and emergency data.";
    }

    // 7. Qualitative Risk Classification
    let riskLevel: WomenSafetyRiskLevel = "unknown";
    let confidence = 0.5;

    if (sourceBackedScore) {
      // If official numeric indicator exists, reflect it deterministically
      confidence = sourceBackedScore.confidence;
      if (sourceBackedScore.score >= 80) {
        riskLevel = "low";
      } else if (sourceBackedScore.score >= 55) {
        riskLevel = "moderate";
      } else {
        riskLevel = "elevated";
      }
    } else if (hasActiveElevatedAlert || hasRecentSeriousIncident) {
      riskLevel = "elevated";
      confidence = 0.85;
    } else if (hasActiveAdvisoryAlert) {
      riskLevel = "moderate";
      confidence = 0.75;
    } else if (
      dataQualityStatus === "sufficient" &&
      !hasActiveElevatedAlert &&
      !hasRecentSeriousIncident
    ) {
      riskLevel = "low";
      confidence = 0.8;
    } else {
      // When data quality is limited or insufficient, transparently report "unknown"
      // Crucial principle: Absence of incident records or presence of national helplines does NOT equal low risk.
      riskLevel = "unknown";
      confidence = dataQualityStatus === "limited" ? 0.55 : 0.25;
    }

    // 8. Generate Evidence-Grounded Recommendations & Warnings
    const recommendations: string[] = [];
    const warnings: string[] = [];

    recommendations.push(
      `Keep verified emergency helplines accessible: National Emergency (${nationalEmergency}) and Women Helpline (${helpline}).`
    );

    if (localWomenSpecific.length > 0) {
      recommendations.push(
        `Verified local women support available: ${localWomenSpecific[0].name} (${localWomenSpecific[0].phone || "Emergency Support"}).`
      );
    }

    recommendations.push(
      "Recommendation (Heuristic Guidance): Scheduling visits during well-lit daylight hours is recommended as a general travel heuristic for optimal visibility and authorized transit in scenic areas."
    );

    if (hasActiveElevatedAlert) {
      const activeAlert = normalizedAlerts.find((a) => a.isCurrent);
      if (activeAlert) {
        warnings.push(
          `ACTIVE SAFETY ALERT (${activeAlert.severity.toUpperCase()}): ${activeAlert.title} - ${activeAlert.message}`
        );
      }
    }

    if (hasActiveAdvisoryAlert) {
      const advisory = normalizedAlerts.find((a) => a.isCurrent && !hasActiveElevatedAlert);
      if (advisory) {
        warnings.push(`TRAVEL ADVISORY: ${advisory.title} - ${advisory.message}`);
      }
    }

    if (dataQualityStatus === "limited") {
      warnings.push(
        "Destination-specific safety indicators are limited. Official national helplines are available, but exercise standard personal travel precautions."
      );
    }

    const disclaimer =
      "Disclaimer: Safety intelligence is synthesized strictly from official emergency infrastructure, public registries, and active advisories. The absence of reported incidents does not guarantee universal safety. Travellers are advised to remain vigilant and keep emergency contacts accessible.";

    const dataQuality: WomenSafetyDataQuality = {
      status: dataQualityStatus,
      explanation: dataQualityExplanation,
      evidenceAvailable,
      evidenceUnavailable
    };

    return {
      destinationId,
      destinationName,
      state: state || undefined,
      date: targetDate,
      riskLevel,
      confidence,
      dataQuality,
      sourceBackedScore,
      womenSafetyIndicators: {
        helpline,
        womenPolice,
        supportCenter,
        medicalFacility,
        verificationStatus,
        lastVerified,
        source,
        sourceUrl
      },
      emergencyResources: {
        nationalEmergency,
        police,
        ambulance,
        womenHelpline: helpline,
        touristSupport,
        womenSpecificResources: allWomenSpecific,
        totalAvailable: emergencyResources.length
      },
      alerts: normalizedAlerts,
      incidents: normalizedIncidents,
      recommendations,
      warnings,
      disclaimer,
      sources
    };
  }
}

export const womenSafetyAnalyzer = new WomenSafetyAnalyzer();
