import { ToolName } from "../../../types/ai";

export interface ToolMetadata {
  name: ToolName;
  description: string;
  category: "tourism" | "realtime" | "user";
  requiresAuth: boolean;
}

export const TOOL_REGISTRY: Record<ToolName, ToolMetadata> = {
  destination_search: {
    name: "destination_search",
    description: "Searches Indian destinations by keyword, name, or state in Supabase database",
    category: "tourism",
    requiresAuth: false
  },
  destination_details: {
    name: "destination_details",
    description: "Retrieves complete verified profile for a destination by UUID",
    category: "tourism",
    requiresAuth: false
  },
  attractions: {
    name: "attractions",
    description: "Retrieves verified sightseeing spots and monuments under a destination",
    category: "tourism",
    requiresAuth: false
  },
  experiences: {
    name: "experiences",
    description: "Retrieves cultural, adventure, and culinary experiences",
    category: "tourism",
    requiresAuth: false
  },
  accessibility: {
    name: "accessibility",
    description: "Retrieves wheelchair, ramp, and elevator accessibility data",
    category: "tourism",
    requiresAuth: false
  },
  accessibility_intelligence: {
    name: "accessibility_intelligence",
    description:
      "Evaluates destination and attraction-level wheelchair accessibility, ramps, lifts, and data sufficiency",
    category: "tourism",
    requiresAuth: false
  },
  elderly_support: {
    name: "elderly_support",
    description: "Retrieves senior citizen facilities, resting benches, and gentle walking paths",
    category: "tourism",
    requiresAuth: false
  },
  elderly_travel_intelligence: {
    name: "elderly_travel_intelligence",
    description:
      "Evaluates senior citizen travel suitability, resting benches, stairs barriers, pacing guidance, and senior discounts",
    category: "tourism",
    requiresAuth: false
  },
  budget_intelligence: {
    name: "budget_intelligence",
    description:
      "Evaluates verified destination entry fees, senior/student concessions, known cost subtotals, and budget constraints",
    category: "tourism",
    requiresAuth: false
  },
  experience_intelligence: {
    name: "experience_intelligence",
    description:
      "Evaluates verified destination experiences, cultural/heritage/nature candidates, local businesses, regional languages, and user interest matching",
    category: "tourism",
    requiresAuth: false
  },
  content_intelligence: {
    name: "content_intelligence",
    description:
      "Retrieves verified destination photography, gallery metadata, accessible alt text, grounded content summaries, and dual-language multilingual content",
    category: "tourism",
    requiresAuth: false
  },
  crowd_intelligence: {
    name: "crowd_intelligence",
    description:
      "Evaluates historical crowd patterns, rush-free hours, and optimal visiting windows",
    category: "tourism",
    requiresAuth: false
  },
  safety: {
    name: "safety",
    description: "Retrieves verified safety scores, emergency contacts, and women safety helpline",
    category: "tourism",
    requiresAuth: false
  },
  women_safety_intelligence: {
    name: "women_safety_intelligence",
    description:
      "Evaluates destination-specific women safety helplines, emergency infrastructure, verified alerts, and data sufficiency",
    category: "tourism",
    requiresAuth: false
  },
  emergency_resources: {
    name: "emergency_resources",
    description: "Retrieves police stations, hospitals, and medical centers near a destination",
    category: "tourism",
    requiresAuth: false
  },
  local_businesses: {
    name: "local_businesses",
    description: "Retrieves verified local restaurants, hotels, and registered handicraft vendors",
    category: "tourism",
    requiresAuth: false
  },
  local_business_intelligence: {
    name: "local_business_intelligence",
    description:
      "Retrieves, categorizes, and ranks verified local homestays, hotels, restaurants, handicraft vendors, and tour services for a destination",
    category: "tourism",
    requiresAuth: false
  },
  weather: {
    name: "weather",
    description: "Retrieves 16-day live weather forecast and current conditions from Open-Meteo",
    category: "realtime",
    requiresAuth: false
  },
  geocoding: {
    name: "geocoding",
    description: "Converts place name to geographic coordinates via Open-Meteo Geocoding",
    category: "realtime",
    requiresAuth: false
  },
  routing: {
    name: "routing",
    description: "Calculates travel duration and distance via OSRM routing engine",
    category: "realtime",
    requiresAuth: false
  },
  translation: {
    name: "translation",
    description:
      "Translates tourism queries between English and Indian languages via Indic adapter",
    category: "realtime",
    requiresAuth: false
  },
  user_preferences: {
    name: "user_preferences",
    description: "Retrieves authenticated tourist's travel style, budget, and accessibility needs",
    category: "user",
    requiresAuth: true
  },
  user_trips: {
    name: "user_trips",
    description: "Retrieves authenticated tourist's existing personal trips",
    category: "user",
    requiresAuth: true
  },
  user_saved_places: {
    name: "user_saved_places",
    description: "Retrieves authenticated tourist's bookmarked destinations and attractions",
    category: "user",
    requiresAuth: true
  },
  sustainability_intelligence: {
    name: "sustainability_intelligence",
    description:
      "Evaluates destination sustainability signals: eco/community experiences, nature attractions, community accommodation, railway access, and low-impact travel options. All claims grounded in verified database records only. No carbon calculations or eco-certifications are generated.",
    category: "tourism",
    requiresAuth: false
  }
};
