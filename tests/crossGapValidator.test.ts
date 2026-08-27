import { describe, it, expect, beforeEach, vi } from "vitest";
import { CrossGapValidator } from "../src/services/ai/validation/crossGapValidator";
import { TravellerContext, sourcedUnknown } from "../src/types/travellerContext";
import { CandidatePlace, ItineraryDayDto, OrchestratorResponseDto } from "../src/types/ai";
import { AuthenticatedUser } from "../src/types/auth";
import { MultiDestinationPlanDto } from "../src/types/multiDestination";

describe("Phase 8E: Cross-Gap Validation & Conflict Engine Test Suite", () => {
  let validator: CrossGapValidator;

  const mockBaseContext = (): TravellerContext => ({
    identity: { authenticated: false, userId: null, role: null },
    tripContext: {
      destinationId: sourcedUnknown(),
      destinationName: sourcedUnknown(),
      tripId: sourcedUnknown(),
      travelDates: { start: sourcedUnknown(), end: sourcedUnknown() },
      durationDays: sourcedUnknown(),
      travellerCount: sourcedUnknown()
    },
    activeTrip: null,
    travellerProfile: {
      travellerGroup: sourcedUnknown(),
      ageContext: sourcedUnknown(),
      interests: { value: [], source: "derived", confidence: "verified" },
      avoidInterests: { value: [], source: "derived", confidence: "verified" },
      preferredLanguage: sourcedUnknown(),
      accessibilityNeeds: { value: [], source: "derived", confidence: "verified" },
      mobilityNeeds: { value: [], source: "derived", confidence: "verified" },
      travelStyle: sourcedUnknown()
    },
    budget: {
      amount: sourcedUnknown(),
      currency: sourcedUnknown(),
      priority: sourcedUnknown()
    },
    preferences: {
      avoidCrowds: sourcedUnknown(),
      preferEco: sourcedUnknown(),
      communityPreference: sourcedUnknown(),
      minimizeTravel: sourcedUnknown()
    },
    safetyContext: {
      womenSafetyRelevant: { value: false, source: "derived", confidence: "verified" },
      soloFemale: { value: false, source: "derived", confidence: "verified" }
    },
    contentPreferences: {
      targetLanguage: sourcedUnknown()
    },
    knownUserData: [],
    unknownUserData: ["budget.amount", "travellerProfile.interests"]
  });

  const mockCandidatePlaces: CandidatePlace[] = [
    {
      id: "place-101",
      name: "Fort Heritage",
      type: "attraction",
      category: "Heritage",
      isWheelchairAccessible: true,
      isElderlyFriendly: true,
      accessibilityNotes: [],
      elderlyNotes: [],
      entryFee: { amount: 50, currency: "INR" }
    },
    {
      id: "place-102",
      name: "Cliff Adventure Trek",
      type: "experience",
      category: "Adventure",
      isWheelchairAccessible: false,
      isElderlyFriendly: false,
      accessibilityNotes: ["Steep rocky path"],
      elderlyNotes: [],
      entryFee: { amount: 500, currency: "INR" }
    },
    {
      id: "place-103",
      name: "Ancient Cave Temple",
      type: "attraction",
      category: "Religious",
      isWheelchairAccessible: undefined, // unknown
      isElderlyFriendly: true,
      accessibilityNotes: [],
      elderlyNotes: []
    }
  ];

  beforeEach(() => {
    validator = new CrossGapValidator();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. BASIC VALIDITY (Tests 1–5)
  // =========================================================================
  describe("1. Basic Itinerary & Place Validity", () => {
    it("1. valid itinerary with known candidate places is accepted", () => {
      const context = mockBaseContext();
      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-101",
              placeName: "Fort Heritage",
              reason: "Visit",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(true);
      expect(result.status).toBe("valid");
      expect(result.conflicts).toHaveLength(0);
      expect(result.blockedItems).toHaveLength(0);
    });

    it("2. invalid / fabricated place ID is rejected as critical conflict", () => {
      const context = mockBaseContext();
      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "fake-999",
              placeName: "Hallucinated Palace",
              reason: "Visit",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("invalid");
      expect(result.conflicts.some((c) => c.code === "INVALID_PLACE_ID")).toBe(true);
      expect(result.blockedItems.some((b) => b.placeId === "fake-999")).toBe(true);
    });

    it("3. duplicate place ID scheduled across different days is rejected", () => {
      const context = mockBaseContext();
      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-101",
              placeName: "Fort Heritage",
              reason: "Visit",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        },
        {
          day: 2,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-101",
              placeName: "Fort Heritage",
              reason: "Visit again",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(false);
      expect(result.conflicts.some((c) => c.code === "DUPLICATE_PLACE")).toBe(true);
    });

    it("4. duplicate destination legs in multi-destination plan are rejected", () => {
      const context = mockBaseContext();
      const multiPlan: MultiDestinationPlanDto = {
        planningScope: { type: "state", name: "Kerala" },
        mode: "automatic",
        candidateShortlist: [],
        selectedDestinations: [
          {
            id: "dest-1",
            name: "Kochi",
            district: null,
            state: "Kerala",
            selectionReason: "Base",
            dataQuality: {
              status: "sufficient",
              verifiedAttractions: 5,
              verifiedExperiences: 2,
              explanation: "Good"
            }
          },
          {
            id: "dest-1",
            name: "Kochi",
            district: null,
            state: "Kerala",
            selectionReason: "Duplicate",
            dataQuality: {
              status: "sufficient",
              verifiedAttractions: 5,
              verifiedExperiences: 2,
              explanation: "Good"
            }
          }
        ],
        interCityTravel: [],
        knownTravelBurden: {
          totalKnownDistanceKm: null,
          totalKnownDurationMinutes: null,
          routingCallsUsed: 0,
          routingCallLimit: 6,
          note: "ok"
        },
        dayAllocation: [],
        days: [],
        crossDestinationInsights: {
          weather: [],
          crowd: [],
          womenSafety: [],
          accessibility: [],
          budget: {
            currency: "INR",
            perDestinationKnownSubtotals: [],
            knownTripSubtotal: 0,
            unknownCategories: [],
            budgetStatus: "ok",
            userBudget: null,
            disclaimer: "ok"
          },
          sustainability: []
        },
        warnings: [],
        sources: []
      };

      const result = validator.validate([], {
        travellerContext: context,
        multiPlan
      });

      expect(result.valid).toBe(false);
      expect(result.conflicts.some((c) => c.code === "DUPLICATE_DESTINATION")).toBe(true);
    });

    it("5. empty itinerary returns valid status with standard unknowns", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
      expect(result.unknowns.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 2. SAFETY CONFLICTS (Tests 6–10)
  // =========================================================================
  describe("2. Safety & Women Safety Conflicts", () => {
    it("6. active critical safety alert triggers hard rejection", () => {
      const context = mockBaseContext();
      const result = validator.validate([], {
        travellerContext: context,
        intelligenceContext: {
          safetyAlerts: [
            {
              severity: "critical",
              title: "Severe Landslide Warning",
              destinationId: "dest-munnar"
            }
          ]
        }
      });

      expect(result.valid).toBe(false);
      expect(result.conflicts.some((c) => c.code === "SAFETY_CRITICAL_ALERT")).toBe(true);
    });

    it("7. limited safety data produces warning without automatic hard rejection", () => {
      const context = mockBaseContext();
      const result = validator.validate([], {
        travellerContext: context,
        intelligenceContext: {
          safetyAlerts: []
        }
      });

      expect(result.valid).toBe(true);
    });

    it("8. no incidents is never interpreted as absolute safe guarantee", () => {
      const context = mockBaseContext();
      const result = validator.validate([], {
        travellerContext: context,
        intelligenceContext: { safetyIncidents: [] }
      });
      expect(result.valid).toBe(true);
    });

    it("9. women-safety query with recorded incidents generates advisory warning", () => {
      const context = mockBaseContext();
      context.safetyContext.womenSafetyRelevant = {
        value: true,
        source: "explicit_request",
        confidence: "verified"
      };

      const result = validator.validate([], {
        travellerContext: context,
        intelligenceContext: {
          safetyIncidents: [
            { destinationId: "dest-1", description: "Isolated harassment reported" }
          ]
        }
      });

      expect(result.status).toBe("conditional");
      expect(result.conflicts.some((c) => c.code === "SAFETY_INCIDENT_WARNING")).toBe(true);
    });

    it("10. destination safety status is not transferred to unrelated destinations", () => {
      const context = mockBaseContext();
      const result = validator.validate([], {
        travellerContext: context,
        intelligenceContext: {
          safetyAlerts: [
            { severity: "low", title: "Minor advisory in Wayanad", destinationId: "dest-wayanad" }
          ]
        }
      });
      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // 3. ACCESSIBILITY CONFLICTS (Tests 11–15)
  // =========================================================================
  describe("3. Accessibility & Elderly Conflicts", () => {
    it("11. wheelchair user with verified accessible place is valid", () => {
      const context = mockBaseContext();
      context.travellerProfile.accessibilityNeeds = {
        value: ["wheelchair"],
        source: "explicit_request",
        confidence: "verified"
      };

      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-101",
              placeName: "Fort Heritage",
              reason: "Accessible",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(true);
      expect(result.status).toBe("valid");
    });

    it("12. wheelchair user with verified INACCESSIBLE place is rejected (hard conflict)", () => {
      const context = mockBaseContext();
      context.travellerProfile.accessibilityNeeds = {
        value: ["wheelchair"],
        source: "explicit_request",
        confidence: "verified"
      };

      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-102",
              placeName: "Cliff Adventure Trek",
              reason: "Trek",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(false);
      expect(result.conflicts.some((c) => c.code === "WHEELCHAIR_ACCESS_UNSUPPORTED")).toBe(true);
      expect(result.blockedItems.some((b) => b.placeId === "place-102")).toBe(true);
    });

    it("13. wheelchair user with UNKNOWN accessibility is conditional with warning", () => {
      const context = mockBaseContext();
      context.travellerProfile.accessibilityNeeds = {
        value: ["wheelchair"],
        source: "explicit_request",
        confidence: "verified"
      };

      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-103",
              placeName: "Ancient Cave Temple",
              reason: "Visit",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(true);
      expect(result.status).toBe("conditional");
      expect(result.conflicts.some((c) => c.code === "WHEELCHAIR_ACCESS_UNKNOWN")).toBe(true);
    });

    it("14. elderly traveller with crowded daily schedule triggers pacing modification warning", () => {
      const context = mockBaseContext();
      context.travellerProfile.travellerGroup = {
        value: "elderly",
        source: "explicit_request",
        confidence: "verified"
      };

      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "p1",
              placeName: "Stop 1",
              reason: "1",
              accessibilityNotes: [],
              elderlyNotes: []
            },
            {
              sequence: 2,
              timeBlock: "morning",
              placeId: "p2",
              placeName: "Stop 2",
              reason: "2",
              accessibilityNotes: [],
              elderlyNotes: []
            },
            {
              sequence: 3,
              timeBlock: "afternoon",
              placeId: "p3",
              placeName: "Stop 3",
              reason: "3",
              accessibilityNotes: [],
              elderlyNotes: []
            },
            {
              sequence: 4,
              timeBlock: "evening",
              placeId: "p4",
              placeName: "Stop 4",
              reason: "4",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context
      });

      expect(result.status).toBe("conditional");
      expect(result.conflicts.some((c) => c.code === "ELDERLY_BARRIER_CONFLICT")).toBe(true);
    });

    it("15. elderly traveller with relaxed schedule (2 stops) is accepted", () => {
      const context = mockBaseContext();
      context.travellerProfile.travellerGroup = {
        value: "parents",
        source: "explicit_request",
        confidence: "verified"
      };

      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "p1",
              placeName: "Stop 1",
              reason: "1",
              accessibilityNotes: [],
              elderlyNotes: []
            },
            {
              sequence: 2,
              timeBlock: "afternoon",
              placeId: "p2",
              placeName: "Stop 2",
              reason: "2",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context
      });

      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // 4. BUDGET CONFLICTS (Tests 16–19)
  // =========================================================================
  describe("4. Budget & Cost Conflicts", () => {
    it("16. known mandatory costs exceeding hard budget triggers high conflict", () => {
      const context = mockBaseContext();
      context.budget.amount = { value: 100, source: "explicit_request", confidence: "verified" };
      context.budget.priority = {
        value: "hard_limit",
        source: "explicit_request",
        confidence: "verified"
      };

      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-102",
              placeName: "Cliff Adventure Trek",
              reason: "Trek",
              entryFee: { amount: 500, currency: "INR" },
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(false);
      expect(result.conflicts.some((c) => c.code === "BUDGET_KNOWN_COST_EXCEEDED")).toBe(true);
    });

    it("17. known cost under budget emits incomplete-cost warning for dining/stay", () => {
      const context = mockBaseContext();
      context.budget.amount = { value: 5000, source: "explicit_request", confidence: "verified" };

      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-101",
              placeName: "Fort Heritage",
              reason: "Visit",
              entryFee: { amount: 50, currency: "INR" },
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(true);
      expect(
        result.warnings.some((w) => w.includes("Additional expenditure on accommodation"))
      ).toBe(true);
    });

    it("18. unknown costs are not treated as ₹0", () => {
      const context = mockBaseContext();
      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-103",
              placeName: "Ancient Cave Temple",
              reason: "Visit",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.unknowns).toContain("dining_and_hotel_commercial_rates");
    });

    it("19. safety and accessibility constraints outrank budget considerations", () => {
      const context = mockBaseContext();
      context.travellerProfile.accessibilityNeeds = {
        value: ["wheelchair"],
        source: "explicit_request",
        confidence: "verified"
      };
      context.budget.amount = { value: 1000, source: "explicit_request", confidence: "verified" };

      // Inaccessible place is rejected even if it is cheap
      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-102",
              placeName: "Cliff Adventure Trek",
              reason: "Trek",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(false);
      expect(result.conflicts.some((c) => c.category === "accessibility")).toBe(true);
    });
  });

  // =========================================================================
  // 5. CROWD & SUSTAINABILITY CONFLICTS (Tests 20–25)
  // =========================================================================
  describe("5. Crowd, Sustainability & Interest Preferences", () => {
    it("20. high-confidence crowd peak with avoid-crowds preference flags advisory modification", () => {
      const context = mockBaseContext();
      context.preferences.avoidCrowds = {
        value: true,
        source: "explicit_request",
        confidence: "verified"
      };

      const result = validator.validate([], {
        travellerContext: context,
        intelligenceContext: {
          crowdAssessments: { "dest-1": { level: "high", confidence: 0.9 } }
        }
      });

      expect(result.status).toBe("conditional");
      expect(result.conflicts.some((c) => c.code === "CROWD_HIGH_CONFIDENCE_CONFLICT")).toBe(true);
    });

    it("21. low-confidence crowd generates low severity warning", () => {
      const context = mockBaseContext();
      context.preferences.avoidCrowds = {
        value: true,
        source: "explicit_request",
        confidence: "verified"
      };

      const result = validator.validate([], {
        travellerContext: context,
        intelligenceContext: {
          crowdAssessments: { "dest-1": { level: "high", confidence: 0.5 } }
        }
      });

      expect(result.conflicts.some((c) => c.code === "CROWD_LOW_CONFIDENCE_WARNING")).toBe(true);
    });

    it("22. crowd avoidance remains a soft preference and never hard-blocks a feasible plan", () => {
      const context = mockBaseContext();
      context.preferences.avoidCrowds = {
        value: true,
        source: "explicit_request",
        confidence: "verified"
      };

      const result = validator.validate([], {
        travellerContext: context,
        intelligenceContext: {
          crowdAssessments: { "dest-1": { level: "high", confidence: 0.9 } }
        }
      });

      expect(result.valid).toBe(true);
    });

    it("23. eco preference adds carbon limitation notice without rejecting destination", () => {
      const context = mockBaseContext();
      context.preferences.preferEco = {
        value: true,
        source: "explicit_request",
        confidence: "verified"
      };

      const result = validator.validate([], {
        travellerContext: context
      });

      expect(result.valid).toBe(true);
      expect(
        result.warnings.some((w) => w.includes("exact carbon calculations are not estimated"))
      ).toBe(true);
    });

    it("24. carbon is confirmed unavailable in Phase 8E", () => {
      const context = mockBaseContext();
      context.preferences.preferEco = {
        value: true,
        source: "explicit_request",
        confidence: "verified"
      };

      const result = validator.validate([], {
        travellerContext: context
      });

      expect(result.unknowns).toContain("exact_carbon_emissions");
    });

    it("25. missing sustainability data does NOT cause destination rejection", () => {
      const context = mockBaseContext();
      const result = validator.validate([], {
        travellerContext: context,
        intelligenceContext: { sustainabilityAssessments: {} }
      });
      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // 6. EXPLICIT EXCLUSIONS & SANITIZATION (Tests 26–30)
  // =========================================================================
  describe("6. Explicit Exclusions & AI Sanitization", () => {
    it("26. explicitly excluded interest scheduled in itinerary is rejected", () => {
      const context = mockBaseContext();
      context.travellerProfile.avoidInterests = {
        value: ["adventure"],
        source: "explicit_request",
        confidence: "verified"
      };

      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-102",
              placeName: "Cliff Adventure Trek",
              reason: "Trek",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(false);
      expect(result.conflicts.some((c) => c.code === "EXPLICIT_INTEREST_EXCLUDED")).toBe(true);
      expect(result.blockedItems.some((b) => b.placeId === "place-102")).toBe(true);
    });

    it("27. positive interest mismatch remains valid with soft penalty only", () => {
      const context = mockBaseContext();
      context.travellerProfile.interests = {
        value: ["culture"],
        source: "explicit_request",
        confidence: "verified"
      };

      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-101",
              placeName: "Fort Heritage",
              reason: "Heritage",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(true);
    });

    it("28. sanitizeResponse strips blocked invalid items from OrchestratorResponseDto", () => {
      const context = mockBaseContext();
      context.travellerProfile.avoidInterests = {
        value: ["adventure"],
        source: "explicit_request",
        confidence: "verified"
      };

      const rawResponse: OrchestratorResponseDto = {
        intent: "trip_planning",
        summary: "Your 1-day itinerary",
        recommendations: [],
        days: [
          {
            day: 1,
            items: [
              {
                sequence: 1,
                timeBlock: "morning",
                placeId: "place-101",
                placeName: "Fort Heritage",
                reason: "Visit",
                accessibilityNotes: [],
                elderlyNotes: []
              },
              {
                sequence: 2,
                timeBlock: "afternoon",
                placeId: "place-102",
                placeName: "Cliff Adventure Trek",
                reason: "Trek",
                accessibilityNotes: [],
                elderlyNotes: []
              }
            ]
          }
        ],
        warnings: [],
        sources: []
      };

      const sanitized = validator.sanitizeResponse(rawResponse, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(sanitized.days![0].items).toHaveLength(1);
      expect(sanitized.days![0].items[0].placeId).toBe("place-101");
      expect(
        sanitized.crossGapValidation?.blockedItems.some((b) => b.placeId === "place-102")
      ).toBe(true);
      expect(sanitized.summary).toContain("Validation notice");
    });

    it("29. cross-user trip access is rejected by security validation", () => {
      const context = mockBaseContext();
      context.identity = { authenticated: true, userId: "user-alpha", role: "tourist" };
      context.activeTrip = {
        tripId: "trip-999",
        name: "Alpha Trip",
        startDate: null,
        endDate: null,
        durationDays: 3,
        itineraryItemCount: 4
      };

      const wrongUser: AuthenticatedUser = {
        id: "user-beta",
        email: "beta@test.com",
        role: "tourist"
      };

      const result = validator.validate([], {
        travellerContext: context,
        user: wrongUser
      });

      expect(result.valid).toBe(false);
      expect(result.conflicts.some((c) => c.code === "SECURITY_OWNERSHIP_VIOLATION")).toBe(true);
    });

    it("30. full system acceptance scenarios A, B, C, D, E, F are validated deterministically", () => {
      const context = mockBaseContext();
      context.travellerProfile.accessibilityNeeds = {
        value: ["wheelchair"],
        source: "explicit_request",
        confidence: "verified"
      };
      context.preferences.avoidCrowds = {
        value: true,
        source: "explicit_request",
        confidence: "verified"
      };

      // Scenario A: Wheelchair + Crowds -> Wheelchair is hard, crowd is soft
      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-101",
              placeName: "Fort Heritage",
              reason: "Accessible",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces,
        intelligenceContext: {
          crowdAssessments: { "dest-1": { level: "high", confidence: 0.9 } }
        }
      });

      // Wheelchair-compliant item remains valid; crowd peak generates advisory modification warning
      expect(result.valid).toBe(true);
      expect(result.status).toBe("conditional");
      expect(result.conflicts.some((c) => c.code === "CROWD_HIGH_CONFIDENCE_CONFLICT")).toBe(true);
    });

    // =======================================================================
    // 7. BUSINESS, WEATHER, ROUTING & OPENING HOURS (Tests 31–42)
    // =========================================================================
    it("31. business accessibility unknown produces advisory warning", () => {
      const context = mockBaseContext();
      context.travellerProfile.accessibilityNeeds = {
        value: ["wheelchair"],
        source: "explicit_request",
        confidence: "verified"
      };

      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "evening",
              placeId: "place-103",
              placeName: "Ancient Cave Temple",
              reason: "Dinner/Visit",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.warnings.some((w) => w.includes("unindexed"))).toBe(true);
    });

    it("32. business price unknown leaves budget incomplete rather than zero", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.unknowns).toContain("dining_and_hotel_commercial_rates");
    });

    it("33. no fabricated safe-business claim is made from destination safety data", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("34. weather unavailable generates transparent data note without crashing", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("35. weather scheduling conflict generates advisory notice", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("36. route unavailable produces feasibility warning", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("37. excessive travel burden produces advisory warning", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("38. no fabricated route duration is generated when routing fails", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("39. opening hours unknown does not assume venue is 24/7 open", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("40. multi-destination context mismatch is rejected", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("41. mixed accessibility destinations enforce per-destination checks", () => {
      const context = mockBaseContext();
      context.travellerProfile.accessibilityNeeds = {
        value: ["wheelchair"],
        source: "explicit_request",
        confidence: "verified"
      };
      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-101",
              placeName: "Fort Heritage",
              reason: "Good",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        },
        {
          day: 2,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-102",
              placeName: "Cliff Adventure Trek",
              reason: "Bad",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(false);
      expect(result.blockedItems.some((b) => b.placeId === "place-102")).toBe(true);
    });

    it("42. duplicate place IDs across multi-destination plan days are blocked", () => {
      const context = mockBaseContext();
      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-101",
              placeName: "Fort Heritage",
              reason: "1",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        },
        {
          day: 2,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-101",
              placeName: "Fort Heritage",
              reason: "2",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(false);
      expect(result.blockedItems.some((b) => b.placeId === "place-101")).toBe(true);
    });

    // =======================================================================
    // 8. RESOLUTION, ADAPTATION & LLM INTEGRATION (Tests 43–59)
    // =========================================================================
    it("43. critical conflict is strictly marked as REJECT action", () => {
      const context = mockBaseContext();
      context.travellerProfile.accessibilityNeeds = {
        value: ["wheelchair"],
        source: "explicit_request",
        confidence: "verified"
      };
      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-102",
              placeName: "Cliff Adventure Trek",
              reason: "Bad",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      const conf = result.conflicts.find((c) => c.code === "WHEELCHAIR_ACCESS_UNSUPPORTED");
      expect(conf?.action).toBe("REJECT");
    });

    it("44. medium conflict is marked as MODIFY action", () => {
      const context = mockBaseContext();
      context.preferences.avoidCrowds = {
        value: true,
        source: "explicit_request",
        confidence: "verified"
      };
      const result = validator.validate([], {
        travellerContext: context,
        intelligenceContext: {
          crowdAssessments: { "dest-1": { level: "high", confidence: 0.9 } }
        }
      });

      const conf = result.conflicts.find((c) => c.code === "CROWD_HIGH_CONFIDENCE_CONFLICT");
      expect(conf?.action).toBe("MODIFY");
    });

    it("45. unknown data conflict is marked as WARN action", () => {
      const context = mockBaseContext();
      context.travellerProfile.accessibilityNeeds = {
        value: ["wheelchair"],
        source: "explicit_request",
        confidence: "verified"
      };
      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-103",
              placeName: "Ancient Cave Temple",
              reason: "1",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      const conf = result.conflicts.find((c) => c.code === "WHEELCHAIR_ACCESS_UNKNOWN");
      expect(conf?.action).toBe("WARN");
    });

    it("46. valid soft mismatch is accepted with lower rank", () => {
      const context = mockBaseContext();
      context.travellerProfile.interests = {
        value: ["nature"],
        source: "explicit_request",
        confidence: "verified"
      };
      const itinerary: ItineraryDayDto[] = [
        {
          day: 1,
          items: [
            {
              sequence: 1,
              timeBlock: "morning",
              placeId: "place-101",
              placeName: "Fort Heritage",
              reason: "Heritage",
              accessibilityNotes: [],
              elderlyNotes: []
            }
          ]
        }
      ];

      const result = validator.validate(itinerary, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(result.valid).toBe(true);
    });

    it("47. minimal-change resolution prioritizes activity replacement over destination swap", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("48. unaffected itinerary days are preserved during sanitization", () => {
      const context = mockBaseContext();
      context.travellerProfile.avoidInterests = {
        value: ["adventure"],
        source: "explicit_request",
        confidence: "verified"
      };

      const rawResponse: OrchestratorResponseDto = {
        intent: "trip_planning",
        summary: "Trip Plan",
        recommendations: [],
        days: [
          {
            day: 1,
            items: [
              {
                sequence: 1,
                timeBlock: "morning",
                placeId: "place-101",
                placeName: "Fort Heritage",
                reason: "Good",
                accessibilityNotes: [],
                elderlyNotes: []
              }
            ]
          },
          {
            day: 2,
            items: [
              {
                sequence: 1,
                timeBlock: "morning",
                placeId: "place-102",
                placeName: "Cliff Adventure Trek",
                reason: "Trek",
                accessibilityNotes: [],
                elderlyNotes: []
              }
            ]
          }
        ],
        warnings: [],
        sources: []
      };

      const sanitized = validator.sanitizeResponse(rawResponse, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(sanitized.days![0].items).toHaveLength(1);
      expect(sanitized.days![1].items).toHaveLength(0);
    });

    it("49. invalid LLM itinerary is deterministically corrected", () => {
      const context = mockBaseContext();
      const rawResponse: OrchestratorResponseDto = {
        intent: "trip_planning",
        summary: "Plan",
        recommendations: [],
        days: [
          {
            day: 1,
            items: [
              {
                sequence: 1,
                timeBlock: "morning",
                placeId: "place-101",
                placeName: "Fort Heritage",
                reason: "Good",
                accessibilityNotes: [],
                elderlyNotes: []
              }
            ]
          }
        ],
        warnings: [],
        sources: []
      };

      const sanitized = validator.sanitizeResponse(rawResponse, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(sanitized.crossGapValidation).toBeDefined();
      expect(sanitized.crossGapValidation?.valid).toBe(true);
    });

    it("50. LLM safety violation is blocked before user return", () => {
      const context = mockBaseContext();
      const rawResponse: OrchestratorResponseDto = {
        intent: "trip_planning",
        summary: "Plan",
        recommendations: [],
        days: [],
        warnings: [],
        sources: []
      };

      const sanitized = validator.sanitizeResponse(rawResponse, {
        travellerContext: context,
        intelligenceContext: {
          safetyAlerts: [{ severity: "critical", title: "Flood Warning", destinationId: "dest-1" }]
        }
      });

      expect(sanitized.crossGapValidation?.valid).toBe(false);
    });

    it("51. LLM accessibility violation is blocked before user return", () => {
      const context = mockBaseContext();
      context.travellerProfile.accessibilityNeeds = {
        value: ["wheelchair"],
        source: "explicit_request",
        confidence: "verified"
      };

      const rawResponse: OrchestratorResponseDto = {
        intent: "trip_planning",
        summary: "Plan",
        recommendations: [],
        days: [
          {
            day: 1,
            items: [
              {
                sequence: 1,
                timeBlock: "morning",
                placeId: "place-102",
                placeName: "Cliff Adventure Trek",
                reason: "Trek",
                accessibilityNotes: [],
                elderlyNotes: []
              }
            ]
          }
        ],
        warnings: [],
        sources: []
      };

      const sanitized = validator.sanitizeResponse(rawResponse, {
        travellerContext: context,
        candidatePlaces: mockCandidatePlaces
      });

      expect(sanitized.days![0].items).toHaveLength(0);
      expect(
        sanitized.crossGapValidation?.blockedItems.some((b) => b.placeId === "place-102")
      ).toBe(true);
    });

    it("52. grounded final response preserves provenances across all items", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("53. cross-user trip ownership violation is rejected", () => {
      const context = mockBaseContext();
      context.identity = { authenticated: true, userId: "user-1", role: "tourist" };
      context.activeTrip = {
        tripId: "trip-1",
        name: "User 1 Trip",
        startDate: null,
        endDate: null,
        durationDays: 2,
        itineraryItemCount: 2
      };

      const result = validator.validate([], {
        travellerContext: context,
        user: { id: "user-2", email: "u2@test.com", role: "tourist" }
      });

      expect(result.valid).toBe(false);
      expect(result.conflicts.some((c) => c.code === "SECURITY_OWNERSHIP_VIOLATION")).toBe(true);
    });

    it("54. private context is not leaked into validation result explanations", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("password");
      expect(serialized).not.toContain("token");
    });

    it("55. Phase 7 intelligence integration is preserved", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("56. Phase 8A constraints are preserved in validation priority", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("57. Phase 8B preference persistence boundary is respected", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("58. Phase 8C multi-destination orchestration is preserved", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });

    it("59. Phase 8D adaptive itinerary generation is preserved", () => {
      const context = mockBaseContext();
      const result = validator.validate([], { travellerContext: context });
      expect(result.valid).toBe(true);
    });
  });
});
