import { describe, it, expect } from "vitest";
import { OrchestratorService } from "../src/services/ai/orchestrator.service";
import { intentClassifier } from "../src/services/ai/classifier/intent.classifier";
import { DeterministicAIProvider } from "../src/services/ai/providers/deterministic.provider";
import { CrossGapValidator } from "../src/services/ai/validation/crossGapValidator";
import { ToolExecutor } from "../src/services/ai/tools/tool.executor";
import { TourismService } from "../src/services/tourism.service";

describe("Regression Suite: Destination-Child Association & AI Chatbot Grounding", () => {
  const ARAKU_UUID = "01e98249-049a-4017-a5fb-98b913e05ca5";
  const OTHER_DEST_UUID = "99999999-9999-9999-9999-999999999999";

  // Mock tourism service where Araku has 0 attractions and 0 experiences
  const mockTourismService = {
    getDestinations: async (opts?: { search?: string; state?: string; pageSize?: number }) => {
      if (opts?.search && /araku/i.test(opts.search)) {
        return {
          destinations: [
            {
              id: ARAKU_UUID,
              name: "Araku Valley",
              state: "Andhra Pradesh",
              district: "Alluri Sitharama Raju",
              category: "Hill Station",
              description: "Scenic valley famous for coffee plantations and tribal culture.",
              latitude: 18.33,
              longitude: 82.88
            }
          ],
          pagination: {
            page: 1,
            pageSize: 10,
            total: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false
          }
        };
      }
      return {
        destinations: [],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      };
    },
    getDestinationById: async (id: string) => {
      if (id === ARAKU_UUID) {
        return {
          id: ARAKU_UUID,
          name: "Araku Valley",
          state: "Andhra Pradesh",
          district: "Alluri Sitharama Raju",
          category: "Hill Station",
          description: "Scenic valley famous for coffee plantations and tribal culture.",
          latitude: 18.33,
          longitude: 82.88
        };
      }
      return null;
    },
    getAttractions: async (destId: string) => {
      // Araku Valley has 0 verified attractions in catalog
      if (destId === ARAKU_UUID) {
        return [];
      }
      // Other destination has Borra Caves
      if (destId === OTHER_DEST_UUID) {
        return [
          {
            id: "attr-borra",
            destination_id: OTHER_DEST_UUID,
            name: "Borra Caves",
            description: "Deep limestone caves with stalactites.",
            category: "Nature",
            latitude: 18.28,
            longitude: 83.04
          }
        ];
      }
      return [];
    },
    getExperiences: async (destId: string) => {
      // Araku Valley has 0 verified experiences in catalog
      if (destId === ARAKU_UUID) {
        return [];
      }
      return [];
    },
    getOpeningHours: async () => [],
    getEntryFees: async () => [],
    getAccessibility: async () => [],
    getElderlySupport: async () => [],
    getImages: async () => [],
    getLanguages: async () => []
  } as unknown as TourismService;

  // 1. "Tell me about Araku." -> destination_information
  it("Scenario 1: 'Tell me about Araku.' classifies as destination_information", () => {
    const classification = intentClassifier.classify("Tell me about Araku.");
    expect(classification.intent).toBe("destination_information");
    expect(classification.entities.destinationName).toBe("Araku");
  });

  // 2. Borra Caves MUST NOT appear unless destination_id matches
  it("Scenario 2: Borra Caves does not appear when querying Araku Valley", async () => {
    const executor = new ToolExecutor(mockTourismService);
    const context = await executor.executeTools(
      ["destination_search", "destination_details", "attractions"],
      { destinationName: "Araku", destinationId: ARAKU_UUID }
    );

    // Attractions must be empty (strict destination_id filtering)
    expect(context.attractions).toEqual([]);
    expect(context.attractions?.some((a) => a.name === "Borra Caves")).toBe(false);
  });

  // 3. Zero Araku attractions handled honestly
  it("Scenario 3: Zero Araku attractions produces an honest destination-level summary", async () => {
    const provider = new DeterministicAIProvider();
    const response = await provider.generateStructuredResponse<
      import("../src/types/ai").OrchestratorResponseDto
    >(
      JSON.stringify({
        intent: "destination_information",
        destination: {
          id: ARAKU_UUID,
          name: "Araku Valley",
          state: "Andhra Pradesh",
          description: "Scenic valley famous for coffee plantations and tribal culture."
        },
        attractions: [],
        experiences: []
      })
    );

    expect(response.summary).toContain(
      "Araku Valley is a verified tourism destination in Andhra Pradesh."
    );
    expect(response.summary).toContain(
      "The current verified database has limited attraction and experience records specifically linked to this destination."
    );
    expect(response.days).toEqual([]);
    expect(response.itinerary).toEqual([]);
  });

  // 4. Zero Araku experiences handled honestly
  it("Scenario 4: Zero Araku experiences does not fabricate cultural experiences", async () => {
    const provider = new DeterministicAIProvider();
    const response = await provider.generateStructuredResponse<
      import("../src/types/ai").OrchestratorResponseDto
    >(
      JSON.stringify({
        intent: "experience_query",
        destination: {
          id: ARAKU_UUID,
          name: "Araku Valley",
          state: "Andhra Pradesh"
        },
        attractions: [],
        experiences: []
      })
    );

    expect(response.summary).toContain(
      "No verified cultural or experience development records are currently indexed for Araku Valley."
    );
  });

  // 5. "What attractions are in Araku?" uses destination_id filtering
  it("Scenario 5: 'What attractions are in Araku?' uses destination_id filtering and returns empty array", async () => {
    const classification = intentClassifier.classify("What attractions are in Araku?");
    expect(classification.intent).toBe("destination_information");
    expect(classification.requiredTools).toContain("attractions");

    const executor = new ToolExecutor(mockTourismService);
    const context = await executor.executeTools(classification.requiredTools, {
      destinationName: "Araku",
      destinationId: ARAKU_UUID
    });

    expect(context.attractions).toEqual([]);
  });

  // 6. "Plan a trip to Araku" remains trip_planning
  it("Scenario 6: 'Plan a trip to Araku' remains trip_planning", () => {
    const classification = intentClassifier.classify("Plan a trip to Araku");
    expect(classification.intent).toBe("trip_planning");
  });

  // 7. Simple information query does not become itinerary (days: [])
  it("Scenario 7: Simple destination information query returns empty days and itinerary", async () => {
    const orchestrator = new OrchestratorService(
      new DeterministicAIProvider(),
      new DeterministicAIProvider(),
      intentClassifier,
      new ToolExecutor(mockTourismService)
    );

    const result = await orchestrator.chat("Tell me about Araku.");
    expect(result.intent).toBe("destination_information");
    expect(result.days).toEqual([]);
    expect(result.itinerary).toEqual([]);
    expect(result.summary).not.toContain("Day 1:");
    expect(result.summary).not.toContain("morning");
  });

  // 8. Partial destination name resolves correctly
  it("Scenario 8: Partial destination name 'Araku' resolves to 'Araku Valley'", async () => {
    const classification = intentClassifier.classify("Tell me about Araku");
    expect(classification.entities.destinationName).toBe("Araku");

    const searchRes = await mockTourismService.getDestinations({
      search: classification.entities.destinationName
    });
    expect(searchRes.destinations.length).toBeGreaterThan(0);
    expect(searchRes.destinations[0].name).toBe("Araku Valley");
    expect(searchRes.destinations[0].id).toBe(ARAKU_UUID);
  });

  // 9. Child records cannot cross destination boundaries
  it("Scenario 9: ToolExecutor never pulls attractions from other destination IDs", async () => {
    const executor = new ToolExecutor(mockTourismService);
    const context = await executor.executeTools(["attractions"], {
      destinationName: "Araku",
      destinationId: ARAKU_UUID
    });

    expect(context.attractions).toEqual([]);
    // Ensure no sibling attractions from OTHER_DEST_UUID are injected
    expect(context.attractions?.length).toBe(0);
  });

  // 10. CrossGapValidator removes mismatched attraction & sanitizes non-planning days
  it("Scenario 10: CrossGapValidator sanitizes days for destination_information", () => {
    const validator = new CrossGapValidator();
    const sanitized = validator.sanitizeResponse(
      {
        intent: "destination_information",
        summary: "Here is your verified, safe tourism guide for Araku Valley.",
        days: [
          {
            day: 1,
            theme: "Scenic Highlights",
            items: [
              {
                sequence: 1,
                timeBlock: "morning",
                placeId: "attr-borra",
                placeName: "Borra Caves",
                reason: "Scenic cave tour"
              }
            ]
          }
        ],
        itinerary: [],
        sources: [{ type: "database", provider: "Supabase", resource: "destinations" }],
        recommendations: [
          {
            title: "Borra Caves",
            description: "Unverified place",
            category: "Attraction"
          }
        ]
      },
      {
        travellerContext: {
          identity: { authenticated: false, userId: null },
          safetyContext: {
            womenSafetyRelevant: { value: false, source: "default", confidence: "high" },
            soloFemale: { value: false, source: "default", confidence: "high" }
          },
          preferences: { preferEco: { value: false, source: "default", confidence: "high" } },
          unknownUserData: []
        } as unknown as import("../src/types/travellerContext").TravellerContext,
        candidatePlaces: [] // Borra Caves is NOT in candidatePlaces
      }
    );

    expect(sanitized.days).toEqual([]);
    expect(sanitized.itinerary).toEqual([]);
    expect(sanitized.summary).toContain("verified tourism guide");
    expect(sanitized.summary).not.toContain("safe tourism guide");
    // Borra Caves should be removed from recommendations since it is not in candidates
    expect(sanitized.recommendations?.some((r) => r.title === "Borra Caves")).toBe(false);
  });

  // 11. No "safe tourism guide" wording for general destination query
  it("Scenario 11: Summary uses 'verified tourism guide' instead of 'safe tourism guide'", async () => {
    const provider = new DeterministicAIProvider();
    const response = await provider.generateStructuredResponse<
      import("../src/types/ai").OrchestratorResponseDto
    >(
      JSON.stringify({
        intent: "destination_information",
        destination: {
          id: ARAKU_UUID,
          name: "Araku Valley",
          state: "Andhra Pradesh"
        },
        attractions: []
      })
    );

    expect(response.summary).not.toContain("safe tourism guide");
  });

  // 12. Unknown child data remains unknown
  it("Scenario 12: Unknown child data is not fabricated", async () => {
    const provider = new DeterministicAIProvider();
    const response = await provider.generateStructuredResponse<
      import("../src/types/ai").OrchestratorResponseDto
    >(
      JSON.stringify({
        intent: "destination_information",
        destination: {
          id: ARAKU_UUID,
          name: "Araku Valley",
          state: "Andhra Pradesh"
        },
        attractions: [],
        safety: null
      })
    );

    expect(response.safety).toBeNull();
  });

  // 13. Provenance preserved
  it("Scenario 13: Provenance includes Supabase destinations without synthetic resources", async () => {
    const executor = new ToolExecutor(mockTourismService);
    const context = await executor.executeTools(["destination_search", "destination_details"], {
      destinationName: "Araku",
      destinationId: ARAKU_UUID
    });

    expect(
      context.sources.some((s) => s.provider === "Supabase" && s.resource === "destinations")
    ).toBe(true);
  });

  // 14. Supabase remains primary source
  it("Scenario 14: Supabase remains the primary database source in all tool executions", async () => {
    const executor = new ToolExecutor(mockTourismService);
    const context = await executor.executeTools(
      ["destination_search", "attractions", "experiences"],
      { destinationName: "Araku", destinationId: ARAKU_UUID }
    );

    const supabaseSources = context.sources.filter((s) => s.provider === "Supabase");
    expect(supabaseSources.length).toBeGreaterThan(0);
    expect(supabaseSources.every((s) => s.type === "database")).toBe(true);
  });
});
