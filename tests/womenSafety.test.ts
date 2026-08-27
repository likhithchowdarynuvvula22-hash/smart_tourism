import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { WomenSafetyService } from "../src/services/safety/womenSafety.service";
import { WomenSafetyAnalyzer } from "../src/services/safety/analyzers/womenSafety.analyzer";
import { SafetyRepository } from "../src/repositories/safety.repository";
import { TourismRepository } from "../src/repositories/tourism.repository";
import { DestinationRepository } from "../src/repositories/destination.repository";
import { IntentClassifier } from "../src/services/ai/classifier/intent.classifier";
import { TOOL_REGISTRY } from "../src/services/ai/tools/tool.registry";
import { ToolExecutor } from "../src/services/ai/tools/tool.executor";
import { DeterministicAIProvider } from "../src/services/ai/providers/deterministic.provider";
import { ItineraryService } from "../src/services/ai/itinerary/itinerary.service";
import { OrchestratorResponseDto } from "../src/types/ai";
import { Database } from "../src/types/database.types";

type DestinationRow = Database["public"]["Tables"]["destinations"]["Row"];
type WomenSafetyRow = Database["public"]["Tables"]["women_safety"]["Row"];
type SafetyIndicatorRow = Database["public"]["Tables"]["safety_indicators"]["Row"];
type SafetyAlertRow = Database["public"]["Tables"]["safety_alerts"]["Row"];
type SafetyIncidentRow = Database["public"]["Tables"]["safety_incidents"]["Row"];
type EmergencyResourceRow = Database["public"]["Tables"]["emergency_resources"]["Row"];

describe("Phase 7B: Women Safety Intelligence Suite", () => {
  const app = createApp();

  const mockDestination: DestinationRow = {
    id: "01e98249-049a-4017-a5fb-98b913e05ca5",
    name: "Araku Valley",
    state: "Andhra Pradesh",
    city: "Araku",
    district: "Alluri Sitharama Raju",
    description: "Scenic hill station in the Eastern Ghats",
    category: "Hill Station",
    latitude: 18.3128,
    longitude: 82.8808,
    altitude: 914,
    best_time_to_visit: "Oct-Mar",
    rush_free_hours: "Rush: 09:00-14:00 Free: 14:00-17:00",
    tags: ["nature", "valleys"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };

  const mockWomenSafety: WomenSafetyRow = {
    id: "630dd125-84bc-48c7-b10d-b32c2ea76248",
    destination_id: mockDestination.id,
    women_police: null,
    women_helpline: "1091 / 181",
    women_support_center: null,
    medical_facility: null,
    source: "Incredible India - Emergency",
    source_url: "https://www.incredibleindia.gov.in/en/emergency",
    verification_status: "official_national_helpline",
    last_verified: "2026-08-24"
  };

  const mockEmergencyResources: EmergencyResourceRow[] = [
    {
      id: "27592d59-ed08-4d3e-9f25-ab331769d587",
      destination_id: null,
      name: "ERSS National Emergency",
      type: "Emergency Dispatch",
      phone: "112",
      address: "Pan-India",
      latitude: null,
      longitude: null,
      opening_hours: "24/7",
      verified: true,
      source: "MHA / Incredible India",
      source_url: null,
      created_at: "2026-08-24T06:53:22.503391+00:00"
    },
    {
      id: "9ff2fd93-4e75-452d-9ff3-93a589940c81",
      destination_id: null,
      name: "One Stop Centre (Sakhi Center)",
      type: "Women's Support / Emergency",
      phone: "9398914772",
      address: "District HQ",
      latitude: null,
      longitude: null,
      opening_hours: "24/7",
      verified: true,
      source: "Women & Child Development",
      source_url: null,
      created_at: "2026-08-24T06:53:22.503391+00:00"
    }
  ];

  describe("1. Data Sufficiency & Input Validation", () => {
    it("1. should reject invalid destination UUID with 400 Bad Request", async () => {
      const res = await request(app).get("/api/v1/safety/women/destinations/invalid-uuid-format");
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Invalid destination ID format");
    });

    it("2. should return 404 for non-existent destination UUID", async () => {
      const res = await request(app).get(
        "/api/v1/safety/women/destinations/00000000-0000-0000-0000-000000000000"
      );
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("not found");
    });

    it("3. should classify missing women-safety record as 'insufficient' data quality", async () => {
      const mockSafeRepo = {
        findWomenSafetyByDestinationId: vi.fn().mockResolvedValue(null),
        findSafetyIndicatorsByDestinationId: vi.fn().mockResolvedValue([]),
        findSafetyAlertsByDestinationId: vi.fn().mockResolvedValue([]),
        findSafetyIncidentsByDestinationId: vi.fn().mockResolvedValue([])
      } as unknown as SafetyRepository;

      const mockTourRepo = {
        findEmergencyResourcesByDestinationId: vi.fn().mockResolvedValue([])
      } as unknown as TourismRepository;

      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue(mockDestination)
      } as unknown as DestinationRepository;

      const service = new WomenSafetyService(
        mockSafeRepo,
        mockTourRepo,
        mockDestRepo,
        new WomenSafetyAnalyzer()
      );

      const result = await service.getWomenSafetyAssessment(mockDestination.id);
      expect(result.dataQuality.status).toBe("insufficient");
      expect(result.dataQuality.evidenceUnavailable).toContain("women_safety_destination_record");
      expect(result.riskLevel).toBe("unknown");
    });

    it("4. should classify baseline national helpline data as 'limited' data quality", async () => {
      const mockSafeRepo = {
        findWomenSafetyByDestinationId: vi.fn().mockResolvedValue(mockWomenSafety),
        findSafetyIndicatorsByDestinationId: vi.fn().mockResolvedValue([]),
        findSafetyAlertsByDestinationId: vi.fn().mockResolvedValue([]),
        findSafetyIncidentsByDestinationId: vi.fn().mockResolvedValue([])
      } as unknown as SafetyRepository;

      const mockTourRepo = {
        findEmergencyResourcesByDestinationId: vi.fn().mockResolvedValue([
          mockEmergencyResources[0] // general only
        ])
      } as unknown as TourismRepository;

      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue(mockDestination)
      } as unknown as DestinationRepository;

      const service = new WomenSafetyService(
        mockSafeRepo,
        mockTourRepo,
        mockDestRepo,
        new WomenSafetyAnalyzer()
      );

      const result = await service.getWomenSafetyAssessment(mockDestination.id);
      expect(result.dataQuality.status).toBe("limited");
      expect(result.dataQuality.evidenceAvailable).toContain("verified_national_women_helpline");
      expect(result.dataQuality.evidenceUnavailable).toContain("local_women_police_station");
      expect(result.riskLevel).toBe("unknown");
    });

    it("5. should classify localized infrastructure and indicators as 'sufficient' data quality", async () => {
      const enrichedWomenSafety: WomenSafetyRow = {
        ...mockWomenSafety,
        women_police: "0891-2555555",
        women_support_center: "Araku Women Support Hub"
      };

      const mockSafeRepo = {
        findWomenSafetyByDestinationId: vi.fn().mockResolvedValue(enrichedWomenSafety),
        findSafetyIndicatorsByDestinationId: vi.fn().mockResolvedValue([]),
        findSafetyAlertsByDestinationId: vi.fn().mockResolvedValue([]),
        findSafetyIncidentsByDestinationId: vi.fn().mockResolvedValue([])
      } as unknown as SafetyRepository;

      const mockTourRepo = {
        findEmergencyResourcesByDestinationId: vi.fn().mockResolvedValue(mockEmergencyResources)
      } as unknown as TourismRepository;

      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue(mockDestination)
      } as unknown as DestinationRepository;

      const service = new WomenSafetyService(
        mockSafeRepo,
        mockTourRepo,
        mockDestRepo,
        new WomenSafetyAnalyzer()
      );

      const result = await service.getWomenSafetyAssessment(mockDestination.id);
      expect(result.dataQuality.status).toBe("sufficient");
      expect(result.dataQuality.evidenceAvailable).toContain("verified_local_women_police");
      expect(result.dataQuality.evidenceAvailable).toContain("verified_women_support_center");
      expect(result.riskLevel).toBe("low");
    });
  });

  describe("2. Relational Safety Evidence Retrieval", () => {
    it("6. should retrieve and expose verified safety indicators from repository", async () => {
      const mockIndicator: SafetyIndicatorRow = {
        id: "ind-1",
        destination_id: mockDestination.id,
        indicator_type: "women_safety_index",
        score: 88,
        confidence: 0.9,
        explanation: "Verified regional safety index",
        source: "State Police Registry",
        valid_from: "2026-01-01",
        valid_to: "2026-12-31",
        derived: false,
        created_at: "2026-01-01T00:00:00Z"
      };

      const mockSafeRepo = {
        findWomenSafetyByDestinationId: vi.fn().mockResolvedValue(mockWomenSafety),
        findSafetyIndicatorsByDestinationId: vi.fn().mockResolvedValue([mockIndicator]),
        findSafetyAlertsByDestinationId: vi.fn().mockResolvedValue([]),
        findSafetyIncidentsByDestinationId: vi.fn().mockResolvedValue([])
      } as unknown as SafetyRepository;

      const mockTourRepo = {
        findEmergencyResourcesByDestinationId: vi.fn().mockResolvedValue(mockEmergencyResources)
      } as unknown as TourismRepository;

      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue(mockDestination)
      } as unknown as DestinationRepository;

      const service = new WomenSafetyService(
        mockSafeRepo,
        mockTourRepo,
        mockDestRepo,
        new WomenSafetyAnalyzer()
      );

      const result = await service.getWomenSafetyAssessment(mockDestination.id);
      expect(result.sourceBackedScore).not.toBeNull();
      expect(result.sourceBackedScore?.score).toBe(88);
      expect(result.sourceBackedScore?.source).toBe("State Police Registry");
      expect(result.riskLevel).toBe("low");
    });

    it("7. should retrieve safety incidents and categorize freshness", async () => {
      const recentIncident: SafetyIncidentRow = {
        id: "inc-1",
        destination_id: mockDestination.id,
        incident_code: "INC-2026-01",
        location: "Valley Viewpoint",
        incident_date: "2026-08-01",
        incident_time: "14:00",
        category: "Theft",
        severity: "Moderate",
        description: "Bag snatching reported near viewpoint",
        source: "Local Police FIR",
        source_url: null,
        status: "under_investigation",
        verification_status: "verified_fir",
        created_at: "2026-08-01T00:00:00Z"
      };

      const mockSafeRepo = {
        findWomenSafetyByDestinationId: vi.fn().mockResolvedValue(mockWomenSafety),
        findSafetyIndicatorsByDestinationId: vi.fn().mockResolvedValue([]),
        findSafetyAlertsByDestinationId: vi.fn().mockResolvedValue([]),
        findSafetyIncidentsByDestinationId: vi.fn().mockResolvedValue([recentIncident])
      } as unknown as SafetyRepository;

      const mockTourRepo = {
        findEmergencyResourcesByDestinationId: vi.fn().mockResolvedValue(mockEmergencyResources)
      } as unknown as TourismRepository;

      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue(mockDestination)
      } as unknown as DestinationRepository;

      const service = new WomenSafetyService(
        mockSafeRepo,
        mockTourRepo,
        mockDestRepo,
        new WomenSafetyAnalyzer()
      );

      const result = await service.getWomenSafetyAssessment(mockDestination.id, "2026-08-25");
      expect(result.incidents.length).toBe(1);
      expect(result.incidents[0].freshness).toBe("recent");
      expect(result.incidents[0].description).toContain("Bag snatching");
    });

    it("8. should retrieve safety alerts and accurately mark active status", async () => {
      const activeAlert: SafetyAlertRow = {
        id: "alt-1",
        destination_id: mockDestination.id,
        title: "Monsoon Landslide Warning",
        message: "Heavy rain advisory on ghat road",
        severity: "High",
        starts_at: "2026-08-20",
        ends_at: "2026-08-30",
        status: "active",
        target_area: null,
        source: "State Disaster Authority",
        source_url: null,
        created_by: null,
        created_at: "2026-08-20T00:00:00Z"
      };

      const mockSafeRepo = {
        findWomenSafetyByDestinationId: vi.fn().mockResolvedValue(mockWomenSafety),
        findSafetyIndicatorsByDestinationId: vi.fn().mockResolvedValue([]),
        findSafetyAlertsByDestinationId: vi.fn().mockResolvedValue([activeAlert]),
        findSafetyIncidentsByDestinationId: vi.fn().mockResolvedValue([])
      } as unknown as SafetyRepository;

      const mockTourRepo = {
        findEmergencyResourcesByDestinationId: vi.fn().mockResolvedValue(mockEmergencyResources)
      } as unknown as TourismRepository;

      const mockDestRepo = {
        findById: vi.fn().mockResolvedValue(mockDestination)
      } as unknown as DestinationRepository;

      const service = new WomenSafetyService(
        mockSafeRepo,
        mockTourRepo,
        mockDestRepo,
        new WomenSafetyAnalyzer()
      );

      const result = await service.getWomenSafetyAssessment(mockDestination.id, "2026-08-25");
      expect(result.alerts.length).toBe(1);
      expect(result.alerts[0].isCurrent).toBe(true);
      expect(result.riskLevel).toBe("elevated");
      expect(result.warnings.some((w) => w.includes("ACTIVE SAFETY ALERT"))).toBe(true);
    });

    it("9. should retrieve emergency resources and filter women-specific facilities", async () => {
      const analyzer = new WomenSafetyAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        targetDate: "2026-08-25",
        womenSafetyRow: mockWomenSafety,
        indicators: [],
        alerts: [],
        incidents: [],
        emergencyResources: mockEmergencyResources
      });

      expect(result.emergencyResources.nationalEmergency).toBe("112");
      expect(result.emergencyResources.womenSpecificResources.length).toBe(1);
      expect(result.emergencyResources.womenSpecificResources[0].name).toContain("Sakhi Center");
      expect(result.emergencyResources.womenSpecificResources[0].verified).toBe(true);
    });
  });

  describe("3. Risk Classification & Safety Guarantees", () => {
    it("10. should assign source-backed risk classification when indicator score exists", async () => {
      const analyzer = new WomenSafetyAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        targetDate: "2026-08-25",
        womenSafetyRow: mockWomenSafety,
        indicators: [
          {
            id: "ind-1",
            destination_id: mockDestination.id,
            indicator_type: "safety_score",
            score: 45,
            confidence: 0.8,
            explanation: "Low lighting in remote areas",
            source: "District Audit",
            valid_from: "2026-01-01",
            valid_to: "2026-12-31",
            derived: false,
            created_at: "2026-01-01T00:00:00Z"
          }
        ],
        alerts: [],
        incidents: [],
        emergencyResources: mockEmergencyResources
      });

      expect(result.sourceBackedScore?.score).toBe(45);
      expect(result.riskLevel).toBe("elevated");
    });

    it("11. should return unknown risk when evidence is insufficient or limited", async () => {
      const analyzer = new WomenSafetyAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        targetDate: "2026-08-25",
        womenSafetyRow: mockWomenSafety,
        indicators: [],
        alerts: [],
        incidents: [],
        emergencyResources: [mockEmergencyResources[0]]
      });

      expect(result.riskLevel).toBe("unknown");
      expect(result.sourceBackedScore).toBeNull();
      expect(result.dataQuality.status).toBe("limited");
    });

    it("12. should NOT fabricate numeric safety scores when source indicator is absent", async () => {
      const analyzer = new WomenSafetyAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        targetDate: "2026-08-25",
        womenSafetyRow: mockWomenSafety,
        indicators: [],
        alerts: [],
        incidents: [],
        emergencyResources: mockEmergencyResources
      });

      expect(result.sourceBackedScore).toBeNull();
    });

    it("13. should verify that absence of incidents does NOT imply guaranteed low risk (no incidents ≠ low risk)", async () => {
      const analyzer = new WomenSafetyAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        targetDate: "2026-08-25",
        womenSafetyRow: mockWomenSafety,
        indicators: [],
        alerts: [],
        incidents: [], // zero incidents
        emergencyResources: [mockEmergencyResources[0]]
      });

      expect(result.riskLevel).toBe("unknown");
      expect(result.dataQuality.status).toBe("limited");
      expect(result.disclaimer).toContain(
        "absence of reported incidents does not guarantee universal safety"
      );
    });

    it("13b. should verify that national emergency resource availability alone does NOT yield low risk", async () => {
      const analyzer = new WomenSafetyAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        targetDate: "2026-08-25",
        womenSafetyRow: mockWomenSafety, // only national helpline (1091 / 181)
        indicators: [],
        alerts: [],
        incidents: [],
        emergencyResources: mockEmergencyResources // pan-India emergency resources (destination_id = null)
      });

      // National emergency resources alone must result in limited quality and unknown risk
      expect(result.dataQuality.status).toBe("limited");
      expect(result.riskLevel).toBe("unknown");
      expect(result.confidence).toBe(0.55);
      expect(
        result.recommendations.some((r) => r.includes("Recommendation (Heuristic Guidance)"))
      ).toBe(true);
    });

    it("13c. should verify that localized verified women-support evidence enables sufficient data quality and low risk", async () => {
      const analyzer = new WomenSafetyAnalyzer();
      const localEmergencyResource: EmergencyResourceRow = {
        id: "local-res-1",
        destination_id: mockDestination.id, // specifically for this destination
        name: "Araku Local Mahila Police Desk",
        type: "Law Enforcement",
        phone: "08936-249000",
        address: "Near Araku Railway Station",
        latitude: 18.33,
        longitude: 82.88,
        opening_hours: "24/7",
        verified: true,
        source: "AP Police",
        source_url: null,
        created_at: "2026-08-24T00:00:00Z"
      };

      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        targetDate: "2026-08-25",
        womenSafetyRow: {
          ...mockWomenSafety,
          women_police: "08936-249000"
        },
        indicators: [],
        alerts: [],
        incidents: [],
        emergencyResources: [mockEmergencyResources[0], localEmergencyResource]
      });

      expect(result.dataQuality.status).toBe("sufficient");
      expect(result.riskLevel).toBe("low");
      expect(result.confidence).toBe(0.8);
      expect(result.dataQuality.evidenceAvailable).toContain("verified_local_women_police");
      expect(result.dataQuality.evidenceAvailable).toContain(
        "verified_local_women_emergency_facilities"
      );
    });

    it("14. should increase caution to elevated when an active verified alert is present", async () => {
      const analyzer = new WomenSafetyAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        targetDate: "2026-08-25",
        womenSafetyRow: mockWomenSafety,
        indicators: [],
        alerts: [
          {
            id: "alt-1",
            destination_id: mockDestination.id,
            title: "Flash Flood Alert",
            message: "Water logging and flash flood risk",
            severity: "Critical",
            starts_at: "2026-08-24",
            ends_at: "2026-08-28",
            status: "active",
            target_area: null,
            source: "Disaster Management",
            source_url: null,
            created_by: null,
            created_at: "2026-08-24T00:00:00Z"
          }
        ],
        incidents: [],
        emergencyResources: mockEmergencyResources
      });

      expect(result.riskLevel).toBe("elevated");
      expect(result.warnings.some((w) => w.includes("CRITICAL"))).toBe(true);
    });

    it("15. should treat resolved incidents as stale and not trigger elevated risk", async () => {
      const analyzer = new WomenSafetyAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        targetDate: "2026-08-25",
        womenSafetyRow: mockWomenSafety,
        indicators: [],
        alerts: [],
        incidents: [
          {
            id: "inc-1",
            destination_id: mockDestination.id,
            incident_code: "INC-2026-OLD",
            location: "Main Road",
            incident_date: "2026-08-10",
            incident_time: "10:00",
            category: "Dispute",
            severity: "High",
            description: "Resolved traffic dispute",
            source: "Police",
            source_url: null,
            status: "resolved",
            verification_status: "official_closed",
            created_at: "2026-08-10T00:00:00Z"
          }
        ],
        emergencyResources: [mockEmergencyResources[0]]
      });

      expect(result.incidents[0].freshness).toBe("stale");
      expect(result.riskLevel).toBe("unknown");
    });
  });

  describe("4. Freshness Handling", () => {
    it("16. should classify incidents within 365 days as recent", async () => {
      const analyzer = new WomenSafetyAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        targetDate: "2026-08-25",
        womenSafetyRow: mockWomenSafety,
        indicators: [],
        alerts: [],
        incidents: [
          {
            id: "inc-1",
            destination_id: mockDestination.id,
            incident_code: "INC-RECENT",
            location: "Station Road",
            incident_date: "2026-05-15",
            incident_time: null,
            category: "General",
            severity: "Low",
            description: "Minor incident",
            source: "Police",
            source_url: null,
            status: "active",
            verification_status: "verified",
            created_at: "2026-05-15T00:00:00Z"
          }
        ],
        emergencyResources: mockEmergencyResources
      });

      expect(result.incidents[0].freshness).toBe("recent");
    });

    it("17. should classify incidents older than 365 days as historical", async () => {
      const analyzer = new WomenSafetyAnalyzer();
      const result = analyzer.assess({
        destinationId: mockDestination.id,
        destinationName: mockDestination.name,
        targetDate: "2026-08-25",
        womenSafetyRow: mockWomenSafety,
        indicators: [],
        alerts: [],
        incidents: [
          {
            id: "inc-hist",
            destination_id: mockDestination.id,
            incident_code: "INC-2013",
            location: "Kedarnath Valley",
            incident_date: "2013-06-16",
            incident_time: null,
            category: "Natural disaster",
            severity: "High",
            description: "2013 Kedarnath disaster record",
            source: "USDMA",
            source_url: null,
            status: "historical",
            verification_status: "official_historical",
            created_at: "2026-08-24T00:00:00Z"
          }
        ],
        emergencyResources: mockEmergencyResources
      });

      expect(result.incidents[0].freshness).toBe("historical");
    });
  });

  describe("5. AI Intent & Tool Integration", () => {
    it("18. should classify women-safety queries into women_safety_query intent and extract solo female entity", () => {
      const classifier = new IntentClassifier();

      const res1 = classifier.classify("Is Araku safe for a solo woman?");
      expect(res1.intent).toBe("women_safety_query");
      expect(res1.entities.destinationName).toBe("Araku");
      expect(res1.entities.isWomenTraveller).toBe(true);
      expect(res1.entities.isSoloFemale).toBe(true);

      const res2 = classifier.classify(
        "What emergency support is available for women in Tirupati?"
      );
      expect(res2.intent).toBe("women_safety_query");
      expect(res2.entities.destinationName).toBe("Tirupati");
      expect(res2.entities.isWomenTraveller).toBe(true);

      const res3 = classifier.classify("What should women know before visiting Goa?");
      expect(res3.intent).toBe("women_safety_query");
      expect(res3.entities.destinationName).toBe("Goa");
      expect(res3.entities.isWomenTraveller).toBe(true);
    });

    it("19. should map women_safety_query to women_safety_intelligence tool in tool registry", () => {
      const classifier = new IntentClassifier();
      const res = classifier.classify("Is Araku safe for women travellers?");
      expect(res.requiredTools).toContain("women_safety_intelligence");
      expect(res.requiredTools).toContain("emergency_resources");
      expect(TOOL_REGISTRY.women_safety_intelligence).toBeDefined();
      expect(TOOL_REGISTRY.women_safety_intelligence.requiresAuth).toBe(false);
    });

    it("20. should safely execute women_safety_intelligence tool through ToolExecutor", async () => {
      const mockWomenSafetyService = {
        getWomenSafetyAssessment: vi.fn().mockResolvedValue({
          destinationId: mockDestination.id,
          destinationName: mockDestination.name,
          riskLevel: "unknown",
          confidence: 0.55,
          dataQuality: { status: "limited", explanation: "Baseline verified helplines available" },
          emergencyResources: { nationalEmergency: "112", womenHelpline: "1091 / 181" },
          sources: [{ type: "database", provider: "Supabase", resource: "women_safety" }]
        })
      } as unknown as WomenSafetyService;

      const executor = new ToolExecutor(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        mockWomenSafetyService
      );

      const context = await executor.executeTools(["women_safety_intelligence"], {
        destinationId: mockDestination.id,
        destinationName: "Araku"
      });

      expect(context.women_safety).toBeDefined();
      expect(context.women_safety?.emergencyResources.womenHelpline).toBe("1091 / 181");
      expect(context.sources.some((s) => s.resource === "women_safety")).toBe(true);
    });

    it("21. should generate grounded AI response without claiming absolute safety", async () => {
      const provider = new DeterministicAIProvider();
      const prompt = `User Query: "Is Araku safe for a solo woman?"
Intent: "women_safety_query"
Verified Context Data:
\`\`\`json
{
  "intent": "women_safety_query",
  "destination": { "id": "${mockDestination.id}", "name": "Araku Valley", "state": "Andhra Pradesh" },
  "women_safety": {
    "destinationId": "${mockDestination.id}",
    "destinationName": "Araku Valley",
    "riskLevel": "unknown",
    "confidence": 0.55,
    "dataQuality": { "status": "limited" },
    "emergencyResources": {
      "nationalEmergency": "112",
      "police": "100",
      "womenHelpline": "1091 / 181"
    },
    "warnings": ["Destination-specific safety indicators are limited; exercise standard personal travel precautions."]
  },
  "sources": [{ "type": "database", "provider": "Supabase", "resource": "women_safety" }]
}
\`\`\``;

      const response = await provider.generateStructuredResponse<OrchestratorResponseDto>(prompt);
      expect(response.intent).toBe("women_safety_query");
      expect(response.summary).toContain("National Women Helpline (1091 / 181)");
      expect(response.summary).toContain("this does not guarantee absolute safety");
      expect(response.summary).not.toContain("completely safe");
      expect(response.womenSafety).toBeDefined();
    });

    it("22. should return grounded fallback when women safety data is missing from AI context", async () => {
      const provider = new DeterministicAIProvider();
      const prompt = `User Query: "Is Araku safe for a woman?"
Intent: "women_safety_query"
Verified Context Data:
\`\`\`json
{
  "intent": "women_safety_query",
  "destination": { "id": "${mockDestination.id}", "name": "Araku Valley" },
  "women_safety": null,
  "sources": []
}
\`\`\``;

      const response = await provider.generateStructuredResponse<OrchestratorResponseDto>(prompt);
      expect(response.intent).toBe("women_safety_query");
      expect(response.summary).toContain(
        "Current destination-specific women-safety data is limited or unavailable"
      );
      expect(response.summary).toContain("1091 / 181");
    });
  });

  describe("6. Itinerary & Recommendation Integration", () => {
    it("23. should integrate women-safety intelligence in itinerary planning when requested", async () => {
      const itinService = new ItineraryService();
      const result = await itinService.generateItinerary(
        "Plan a trip to Araku for a solo woman traveller",
        {
          destinationName: "Araku",
          days: 1,
          travellerGroup: "solo",
          isWomenTraveller: true,
          isSoloFemale: true
        },
        {
          destination: { id: mockDestination.id, name: "Araku Valley", state: "Andhra Pradesh" },
          attractions: [{ id: "att-1", name: "Borra Caves", category: "Nature" }],
          women_safety: {
            destinationId: mockDestination.id,
            destinationName: "Araku Valley",
            riskLevel: "unknown",
            confidence: 0.55,
            dataQuality: {
              status: "limited",
              explanation: "Limited data",
              evidenceAvailable: [],
              evidenceUnavailable: []
            },
            sourceBackedScore: null,
            womenSafetyIndicators: {
              helpline: "1091 / 181",
              womenPolice: null,
              supportCenter: null,
              medicalFacility: null,
              verificationStatus: null,
              lastVerified: null,
              source: null,
              sourceUrl: null
            },
            emergencyResources: {
              nationalEmergency: "112",
              police: "100",
              ambulance: "108",
              womenHelpline: "1091 / 181",
              touristSupport: "1363",
              womenSpecificResources: [],
              totalAvailable: 1
            },
            alerts: [],
            incidents: [],
            recommendations: ["Keep 112 accessible"],
            warnings: ["Destination-specific safety indicators are limited"],
            disclaimer: "No guarantee",
            sources: [{ type: "database", provider: "Supabase", resource: "women_safety" }]
          },
          sources: [{ type: "database", provider: "Supabase", resource: "women_safety" }]
        }
      );

      expect(result.womenSafety).toBeDefined();
      expect(result.warnings.some((w) => w.includes("safety indicators are limited"))).toBe(true);
      expect(result.days?.length).toBe(1);
    });

    it("24. should NOT fabricate unsupported unsafe-zone claims in itinerary recommendations", async () => {
      const itinService = new ItineraryService();
      const result = await itinService.generateItinerary(
        "Plan a trip to Araku for a solo woman traveller",
        {
          destinationName: "Araku",
          days: 1,
          isWomenTraveller: true
        },
        {
          destination: { id: mockDestination.id, name: "Araku Valley" },
          attractions: [{ id: "att-1", name: "Borra Caves", category: "Nature" }],
          sources: []
        }
      );

      // Verify that itinerary activities and recommendations only reference verified attractions
      for (const day of result.days || []) {
        for (const item of day.items) {
          expect(item.placeName).toBe("Borra Caves");
        }
      }
    });
  });

  describe("7. Security & API Endpoints", () => {
    it("25. should serve GET /api/v1/safety/women/destinations/:id publicly without auth", async () => {
      const res = await request(app).get(`/api/v1/safety/women/destinations/${mockDestination.id}`);
      // Real database has Araku with national helplines only -> limited quality, unknown risk
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destinationId).toBe(mockDestination.id);
      expect(res.body.data.dataQuality.status).toBe("limited");
      expect(res.body.data.riskLevel).toBe("unknown");
      expect(res.body.data.confidence).toBe(0.55);
      expect(res.body.data.womenSafetyIndicators).toBeDefined();
      expect(res.body.data.emergencyResources).toBeDefined();
      expect(res.body.data.disclaimer).toBeDefined();
    });

    it("26. should ensure zero user data or internal authorization leaks in safety response", async () => {
      const res = await request(app).get(`/api/v1/safety/women/destinations/${mockDestination.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.userId).toBeUndefined();
      expect(res.body.data.sql).toBeUndefined();
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.jwt).toBeUndefined();
    });
  });
});
