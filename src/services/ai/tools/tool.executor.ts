import { ToolName, ExtractedEntities, ProvenanceSource } from "../../../types/ai";
import { DestinationCrowdDto } from "../../../types/crowd";
import { DestinationWomenSafetyDto } from "../../../types/safety";
import {
  DestinationAccessibilityAssessmentDto,
  DestinationElderlyAssessmentDto
} from "../../../types/accessibility";
import { DestinationBudgetAssessmentDto } from "../../../types/budget";
import { DestinationExperienceAssessmentDto } from "../../../types/experience";
import {
  DestinationGalleryDto,
  MultilingualContentDto,
  DestinationContentSummaryDto
} from "../../../types/content";
import { DestinationBusinessesDto } from "../../../types/business";
import { TOOL_REGISTRY } from "./tool.registry";
import { tourismService, TourismService } from "../../tourism.service";
import { weatherService, WeatherService } from "../../external/weather/weather.service";
import { routingService, RoutingService } from "../../external/routing/routing.service";
import { geocodingService, GeocodingService } from "../../external/geocoding/geocoding.service";
import {
  translationService,
  TranslationService
} from "../../external/translation/translation.service";
import { preferencesService, PreferencesService } from "../../preferences.service";
import { tripService, TripService } from "../../trip.service";
import { savedPlacesService, SavedPlacesService } from "../../savedPlaces.service";
import { crowdService, CrowdService } from "../../crowd.service";
import { womenSafetyService, WomenSafetyService } from "../../safety/womenSafety.service";
import {
  accessibilityService,
  AccessibilityService
} from "../../accessibility/accessibility.service";
import { budgetService, BudgetService } from "../../budget/budget.service";
import { experienceService, ExperienceService } from "../../experience/experience.service";
import { contentService, ContentService } from "../../content/content.service";
import { businessService, BusinessService } from "../../business/business.service";
import {
  sustainabilityService,
  SustainabilityService
} from "../../sustainability/sustainability.service";
import { AuthenticatedUser } from "../../../types/auth";
import { DestinationRow } from "../../../types/database.types";
import { logger } from "../../../lib/logger";

export interface ToolExecutionContext {
  destination?: Record<string, unknown>;
  attractions?: Array<Record<string, unknown>>;
  experiences?: Array<Record<string, unknown>>;
  accessibility?: Array<Record<string, unknown>>;
  accessibility_assessment?: DestinationAccessibilityAssessmentDto;
  elderly_support?: Array<Record<string, unknown>>;
  elderly_assessment?: DestinationElderlyAssessmentDto;
  budget_assessment?: DestinationBudgetAssessmentDto;
  experience_assessment?: DestinationExperienceAssessmentDto;
  gallery?: DestinationGalleryDto;
  multilingual_content?: MultilingualContentDto;
  content_summary?: DestinationContentSummaryDto;
  businesses?: DestinationBusinessesDto;
  crowd?: DestinationCrowdDto;
  safety?: Record<string, unknown>;
  women_safety?: DestinationWomenSafetyDto;
  emergency_resources?: Array<Record<string, unknown>>;
  local_businesses?: Array<Record<string, unknown>>;
  weather?: Record<string, unknown>;
  routing?: Record<string, unknown>;
  geocoding?: Array<Record<string, unknown>>;
  translation?: Record<string, unknown>;
  user_preferences?: Record<string, unknown>;
  user_trips?: Array<Record<string, unknown>>;
  user_saved_places?: Array<Record<string, unknown>>;
  sustainability?: import("../../../types/sustainability").DestinationSustainabilityDto;
  sources: ProvenanceSource[];
}

export class ToolExecutor {
  private readonly MAX_TOOL_CALLS = 6;

  constructor(
    private readonly tourService: TourismService = tourismService,
    private readonly wthrService: WeatherService = weatherService,
    private readonly rtService: RoutingService = routingService,
    private readonly gcService: GeocodingService = geocodingService,
    private readonly trService: TranslationService = translationService,
    private readonly prefService: PreferencesService = preferencesService,
    private readonly tpService: TripService = tripService,
    private readonly spService: SavedPlacesService = savedPlacesService,
    private readonly crwdService: CrowdService = crowdService,
    private readonly wsService: WomenSafetyService = womenSafetyService,
    private readonly accService: AccessibilityService = accessibilityService,
    private readonly bgtService: BudgetService = budgetService,
    private readonly expService: ExperienceService = experienceService,
    private readonly cntService: ContentService = contentService,
    private readonly bizService: BusinessService = businessService,
    private readonly sustService: SustainabilityService = sustainabilityService
  ) {}

  /**
   * Executes a controlled list of tools, enforces limits, authorization, and isolates failures.
   */
  async executeTools(
    tools: ToolName[],
    entities: ExtractedEntities,
    user?: AuthenticatedUser
  ): Promise<ToolExecutionContext> {
    const context: ToolExecutionContext = {
      sources: []
    };

    // Filter tools to unique registered list and cap at MAX_TOOL_CALLS
    const validTools = Array.from(new Set(tools))
      .filter((t) => Boolean(TOOL_REGISTRY[t]))
      .slice(0, this.MAX_TOOL_CALLS);

    let destinationId = entities.destinationId;

    // 1. Resolve destinationId if missing but destinationName is provided
    if (!destinationId && entities.destinationName) {
      try {
        const searchResults = await this.tourService.getDestinations({
          search: entities.destinationName,
          pageSize: 1
        });
        if (searchResults.destinations.length > 0) {
          const dest = searchResults.destinations[0] as DestinationRow;
          destinationId = dest.id;
          context.destination = dest as unknown as Record<string, unknown>;
          context.sources.push({
            type: "database",
            provider: "Supabase",
            resource: "destinations"
          });
        }
      } catch (err) {
        logger.debug(
          { err, name: entities.destinationName },
          "Failed to resolve destination by name"
        );
      }
    }

    // 2. Execute remaining tools
    for (const toolName of validTools) {
      const tool = TOOL_REGISTRY[toolName];

      // Auth Check
      if (tool.requiresAuth && !user) {
        logger.debug({ tool: toolName }, "Skipping user tool: unauthenticated context");
        continue;
      }

      try {
        switch (toolName) {
          case "destination_search":
            if (entities.destinationName && !context.destination) {
              const res = await this.tourService.getDestinations({
                search: entities.destinationName,
                pageSize: 3
              });
              if (res.destinations.length > 0) {
                context.destination = res.destinations[0] as unknown as Record<string, unknown>;
                destinationId = res.destinations[0].id;
                context.sources.push({
                  type: "database",
                  provider: "Supabase",
                  resource: "destinations"
                });
              }
            }
            break;

          case "destination_details":
            if (destinationId && !context.destination) {
              const dest = await this.tourService.getDestinationById(destinationId);
              context.destination = dest as unknown as Record<string, unknown>;
              context.sources.push({
                type: "database",
                provider: "Supabase",
                resource: "destinations"
              });
            }
            break;

          case "attractions":
            if (destinationId) {
              const atts = await this.tourService.getAttractions(destinationId);
              // Strict destination-child association: only verified attractions for this destinationId
              context.attractions = (atts && atts.length > 0 ? atts : []) as unknown as Array<
                Record<string, unknown>
              >;
              context.sources.push({
                type: "database",
                provider: "Supabase",
                resource: "attractions"
              });
            }
            break;

          case "experiences":
            if (destinationId) {
              const exps = await this.tourService.getExperiences(destinationId);
              context.experiences = exps as unknown as Array<Record<string, unknown>>;
              context.sources.push({
                type: "database",
                provider: "Supabase",
                resource: "experiences"
              });
            }
            break;

          case "accessibility":
            if (destinationId) {
              const acc = await this.tourService.getAccessibility(destinationId);
              context.accessibility = acc as unknown as Array<Record<string, unknown>>;
              context.sources.push({
                type: "database",
                provider: "Supabase",
                resource: "destination_accessibility"
              });
            }
            break;

          case "accessibility_intelligence":
            if (destinationId) {
              const accAssessment = await this.accService.getDestinationAccessibility(
                destinationId,
                entities.startDate
              );
              context.accessibility_assessment = accAssessment;
              for (const s of accAssessment.sources) {
                if (
                  !context.sources.some(
                    (cs) => cs.provider === s.provider && cs.resource === s.resource
                  )
                ) {
                  context.sources.push(s as ProvenanceSource);
                }
              }
            }
            break;

          case "elderly_support":
            if (destinationId) {
              const eld = await this.tourService.getElderlySupport(destinationId);
              context.elderly_support = eld as unknown as Array<Record<string, unknown>>;
              context.sources.push({
                type: "database",
                provider: "Supabase",
                resource: "elderly_support_amenities"
              });
            }
            break;

          case "elderly_travel_intelligence":
            if (destinationId) {
              const eldAssessment = await this.accService.getDestinationElderlySuitability(
                destinationId,
                entities.startDate
              );
              context.elderly_assessment = eldAssessment;
              for (const s of eldAssessment.sources) {
                if (
                  !context.sources.some(
                    (cs) => cs.provider === s.provider && cs.resource === s.resource
                  )
                ) {
                  context.sources.push(s as ProvenanceSource);
                }
              }
            }
            break;

          case "budget_intelligence":
            if (destinationId) {
              const budgetAssessment = await this.bgtService.getDestinationBudget(
                destinationId,
                {
                  userBudget: entities.userBudget,
                  currency: entities.budgetCurrency,
                  adults: entities.adultsCount,
                  seniors: entities.seniorsCount,
                  children: entities.childrenCount,
                  students: entities.studentsCount,
                  foreignAdults: entities.foreignAdultsCount,
                  durationDays: entities.days
                },
                user?.id
              );
              context.budget_assessment = budgetAssessment;
              for (const s of budgetAssessment.sources) {
                if (
                  !context.sources.some(
                    (cs) => cs.provider === s.provider && cs.resource === s.resource
                  )
                ) {
                  context.sources.push(s as ProvenanceSource);
                }
              }
            }
            break;

          case "experience_intelligence":
            if (destinationId) {
              const expAssessment = await this.expService.getDestinationExperiences(
                destinationId,
                {
                  interests: entities.interests,
                  avoidInterests: entities.avoidInterests,
                  includeAttractions: true,
                  includeBusinesses: true,
                  isElderlyTraveller:
                    entities.isElderlyTraveller ||
                    entities.travellerGroup === "parents" ||
                    entities.travellerGroup === "elderly",
                  isWheelchairUser: entities.requiresWheelchair,
                  isBudgetConstrained: entities.isBudgetConstrained,
                  isSoloFemale: entities.isSoloFemale
                },
                user?.id
              );
              context.experience_assessment = expAssessment;
              for (const s of expAssessment.sources) {
                if (
                  !context.sources.some(
                    (cs) => cs.provider === s.provider && cs.resource === s.resource
                  )
                ) {
                  context.sources.push(s as ProvenanceSource);
                }
              }
            }
            break;

          case "content_intelligence":
            if (destinationId) {
              if (
                entities.targetLanguage &&
                entities.targetLanguage !== "en" &&
                entities.targetLanguage !== "english"
              ) {
                const multi = await this.cntService.getMultilingualContent(
                  destinationId,
                  entities.targetLanguage
                );
                context.multilingual_content = multi;
                for (const s of multi.sources) {
                  if (
                    !context.sources.some(
                      (cs) => cs.provider === s.provider && cs.resource === s.resource
                    )
                  ) {
                    context.sources.push(s as ProvenanceSource);
                  }
                }
              } else {
                const gallery = await this.cntService.getDestinationGallery(destinationId);
                context.gallery = gallery;
                for (const s of gallery.sources) {
                  if (
                    !context.sources.some(
                      (cs) => cs.provider === s.provider && cs.resource === s.resource
                    )
                  ) {
                    context.sources.push(s as ProvenanceSource);
                  }
                }
                const summary = await this.cntService.getDestinationSummary(destinationId);
                context.content_summary = summary;
                for (const s of summary.sources) {
                  if (
                    !context.sources.some(
                      (cs) => cs.provider === s.provider && cs.resource === s.resource
                    )
                  ) {
                    context.sources.push(s as ProvenanceSource);
                  }
                }
              }
            }
            break;

          case "crowd_intelligence":
            if (destinationId) {
              const crowdAssessment = await this.crwdService.getCrowdAssessment(
                destinationId,
                entities.startDate
              );
              context.crowd = crowdAssessment;
              for (const s of crowdAssessment.sources) {
                if (
                  !context.sources.some(
                    (cs) => cs.provider === s.provider && cs.resource === s.resource
                  )
                ) {
                  context.sources.push(s);
                }
              }
            }
            break;

          case "safety":
            if (destinationId) {
              const safe = await this.tourService.getSafety(destinationId);
              context.safety = safe as unknown as Record<string, unknown>;
              context.sources.push({
                type: "database",
                provider: "Supabase",
                resource: "safety_overview"
              });
            }
            break;

          case "women_safety_intelligence":
            if (destinationId) {
              const wsAssessment = await this.wsService.getWomenSafetyAssessment(
                destinationId,
                entities.startDate
              );
              context.women_safety = wsAssessment;
              for (const s of wsAssessment.sources) {
                if (
                  !context.sources.some(
                    (cs) => cs.provider === s.provider && cs.resource === s.resource
                  )
                ) {
                  context.sources.push(s);
                }
              }
            }
            break;

          case "emergency_resources":
            if (destinationId) {
              const emg = await this.tourService.getEmergencyResources(destinationId);
              context.emergency_resources = emg as unknown as Array<Record<string, unknown>>;
              context.sources.push({
                type: "database",
                provider: "Supabase",
                resource: "emergency_resources"
              });
            }
            break;

          case "local_businesses":
            if (destinationId) {
              const biz = await this.tourService.getLocalBusinesses(destinationId);
              context.local_businesses = biz as unknown as Array<Record<string, unknown>>;
              context.sources.push({
                type: "database",
                provider: "Supabase",
                resource: "local_businesses"
              });
            }
            break;

          case "local_business_intelligence":
            if (destinationId) {
              const bizAssessment = await this.bizService.getDestinationBusinesses(
                destinationId,
                {
                  category: entities.businessCategory,
                  search: entities.businessSearchTerm,
                  interests: entities.interests,
                  avoidInterests: entities.avoidInterests,
                  isElderlyTraveller:
                    entities.isElderlyTraveller ||
                    entities.travellerGroup === "parents" ||
                    entities.travellerGroup === "elderly",
                  isWheelchairUser: entities.requiresWheelchair,
                  isBudgetConstrained: entities.isBudgetConstrained
                },
                user?.id
              );
              context.businesses = bizAssessment;
              for (const s of bizAssessment.sources) {
                if (
                  !context.sources.some(
                    (cs) => cs.provider === s.provider && cs.resource === s.resource
                  )
                ) {
                  context.sources.push(s);
                }
              }
            }
            break;

          case "weather":
            if (destinationId) {
              const wthr = await this.wthrService.getDestinationWeather(destinationId);
              context.weather = wthr as unknown as Record<string, unknown>;
              context.sources.push({
                type: "external",
                provider: "Open-Meteo",
                resource: "weather_forecast"
              });
            }
            break;

          case "geocoding":
            if (entities.destinationName) {
              const gc = await this.gcService.search(entities.destinationName, 3);
              context.geocoding = gc as unknown as Array<Record<string, unknown>>;
              context.sources.push({
                type: "external",
                provider: "Open-Meteo",
                resource: "geocoding_search"
              });
            }
            break;

          case "routing":
            if (entities.originCoords && entities.destinationCoords) {
              const route = await this.rtService.calculateRoute(
                entities.originCoords.latitude,
                entities.originCoords.longitude,
                entities.destinationCoords.latitude,
                entities.destinationCoords.longitude
              );
              context.routing = route as unknown as Record<string, unknown>;
              context.sources.push({
                type: "external",
                provider: "OSRM",
                resource: "driving_route"
              });
            }
            break;

          case "translation":
            if (entities.targetLanguage) {
              try {
                const tr = await this.trService.translate(
                  "Welcome to India Tourism",
                  "en",
                  entities.targetLanguage
                );
                context.translation = tr as unknown as Record<string, unknown>;
              } catch {
                context.translation = {
                  targetLanguage: entities.targetLanguage,
                  provider: "Indic Adapter / MyMemory"
                };
              }
              context.sources.push({
                type: "external",
                provider: "MyMemory / Indic Adapter",
                resource: "translation_dictionary"
              });
            }
            break;

          case "user_preferences":
            if (user?.id) {
              const pref = await this.prefService.getPreferences(user.id);
              context.user_preferences = pref as unknown as Record<string, unknown>;
              context.sources.push({
                type: "database",
                provider: "Supabase",
                resource: "travel_preferences"
              });
            }
            break;

          case "user_trips":
            if (user?.id) {
              const trips = await this.tpService.getTrips(user.id);
              context.user_trips = trips as unknown as Array<Record<string, unknown>>;
              context.sources.push({
                type: "database",
                provider: "Supabase",
                resource: "user_trips"
              });
            }
            break;

          case "user_saved_places":
            if (user?.id) {
              const saved = await this.spService.getSavedPlaces(user.id);
              context.user_saved_places = saved as unknown as Array<Record<string, unknown>>;
              context.sources.push({
                type: "database",
                provider: "Supabase",
                resource: "user_saved_places"
              });
            }
            break;

          case "sustainability_intelligence":
            if (destinationId) {
              context.sustainability = await this.sustService.getDestinationSustainability(
                destinationId,
                {
                  preferCommunity: Boolean(entities.communityPreference),
                  preferEcoExperiences: Boolean(entities.ecoFriendlyPreference),
                  minimizeTravel: Boolean(entities.minimizeTravel)
                }
              );
              context.sources.push(...context.sustainability.sources);
            }
            break;

          default:
            logger.warn({ tool: toolName }, "Unhandled tool in executor registry");
        }
      } catch (toolError) {
        // Safe tool isolation: Individual tool failures must not crash the entire orchestration
        logger.warn({ tool: toolName, toolError }, "Individual tool execution failed gracefully");
      }
    }

    return context;
  }
}

export const toolExecutor = new ToolExecutor();
