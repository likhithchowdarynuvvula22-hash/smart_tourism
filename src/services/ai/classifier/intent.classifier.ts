import {
  TourismIntent,
  ExtractedEntities,
  IntentClassificationResult,
  ToolName
} from "../../../types/ai";

const KNOWN_DESTINATIONS = [
  "Araku",
  "Tirupati",
  "Varanasi",
  "Coorg",
  "Madikeri",
  "Ooty",
  "Jaipur",
  "Udaipur",
  "Goa",
  "Munnar",
  "Manali",
  "Shimla",
  "Rishikesh",
  "Hampi",
  "Agra",
  "Mysore",
  "Pondicherry",
  "Darjeeling",
  "Kolkata",
  "Delhi",
  "Mumbai",
  "Hyderabad",
  "Chennai",
  "Bangalore",
  "Kochi",
  "Fort Kochi",
  "Marari Beach",
  "Marari",
  "Hussain Sagar"
];

export class IntentClassifier {
  /**
   * Classifies user message into a structured TourismIntent and extracts relevant entities.
   */
  classify(message: string): IntentClassificationResult {
    const text = message.trim();
    const lower = text.toLowerCase();

    const entities: ExtractedEntities = this.extractEntities(text, lower);
    let intent: TourismIntent = "general_tourism_query";
    let confidence = 0.8;

    // Intent rule matching
    const isWomenSafetyMention =
      lower.includes("women safety") ||
      lower.includes("female safety") ||
      lower.includes("solo female") ||
      lower.includes("solo woman") ||
      lower.includes("for women") ||
      lower.includes("for woman") ||
      lower.includes("safe for women") ||
      lower.includes("safety for women") ||
      lower.includes("women traveller") ||
      lower.includes("women travellers") ||
      lower.includes("female traveller") ||
      lower.includes("female travelers") ||
      lower.includes("women's safety") ||
      lower.includes("women support") ||
      lower.includes("emergency support for women") ||
      lower.includes("emergency support is available for women") ||
      lower.includes("what should women know") ||
      lower.includes("women safety situation") ||
      ((lower.includes("woman") || lower.includes("women") || lower.includes("female")) &&
        (lower.includes("safe") ||
          lower.includes("safety") ||
          lower.includes("support") ||
          lower.includes("emergency") ||
          lower.includes("situation")));

    const isPlanningMention =
      lower.includes("plan") ||
      lower.includes("trip to") ||
      lower.includes("vacation") ||
      lower.includes("holiday") ||
      /\b\d+\s*day\b/i.test(lower);

    if (isWomenSafetyMention && isPlanningMention) {
      intent = "trip_planning";
      entities.isWomenTraveller = true;
      if (lower.includes("solo")) {
        entities.travellerGroup = "solo";
        entities.isSoloFemale = true;
      }
      confidence = 0.95;
    } else if (isWomenSafetyMention) {
      intent = "women_safety_query";
      entities.isWomenTraveller = true;
      if (lower.includes("solo")) {
        entities.travellerGroup = "solo";
        entities.isSoloFemale = true;
      }
      confidence = 0.95;
    } else if (
      lower.includes("elderly") ||
      lower.includes("parents") ||
      lower.includes("senior") ||
      lower.includes("seniors") ||
      lower.includes("grandparents")
    ) {
      if (lower.includes("plan") || lower.includes("trip") || lower.includes("itinerary")) {
        intent = "trip_planning";
        entities.travellerGroup = "parents";
        entities.isElderlyTraveller = true;
      } else {
        intent = "elderly_travel_query";
        entities.isElderlyTraveller = true;
      }
      confidence = 0.9;
    } else if (
      (lower.includes("crowd") ||
        lower.includes("rush hour") ||
        lower.includes("rush-free") ||
        lower.includes("busy") ||
        lower.includes("footfall") ||
        lower.includes("visiting window") ||
        lower.includes("best time to visit")) &&
      !lower.includes("plan") &&
      !lower.includes("trip to")
    ) {
      intent = "crowd_query";
      confidence = 0.92;
    } else if (
      (lower.includes("plan") ||
        lower.includes("trip to") ||
        lower.includes("vacation") ||
        lower.includes("holiday") ||
        /\b\d+\s*day\b/i.test(lower)) &&
      !lower.includes("how much") &&
      !lower.includes("what will it cost") &&
      !lower.includes("what will this trip cost") &&
      !lower.includes("entry fee") &&
      !lower.includes("ticket price") &&
      // Sustainability keywords take precedence over generic planning verbs (Phase 7H)
      !lower.includes("eco") &&
      !lower.includes("sustainab") &&
      !lower.includes("community tourism") &&
      !lower.includes("community travel") &&
      !lower.includes("responsible tourism") &&
      !lower.includes("green travel")
    ) {
      intent = "trip_planning";
      confidence = 0.92;
    } else if (
      lower.includes("itinerary") ||
      lower.includes("schedule") ||
      lower.includes("timetable")
    ) {
      intent = "itinerary_help";
      confidence = 0.9;
    } else if (
      lower.includes("weather") ||
      lower.includes("forecast") ||
      lower.includes("rain") ||
      lower.includes("temperature") ||
      lower.includes("climate")
    ) {
      intent = "weather_query";
      confidence = 0.95;
    } else if (
      lower.includes("safe") ||
      lower.includes("safety") ||
      lower.includes("crime") ||
      lower.includes("police") ||
      lower.includes("emergency")
    ) {
      intent = "safety_query";
      confidence = 0.92;
    } else if (
      lower.includes("route") ||
      lower.includes("distance") ||
      lower.includes("driving") ||
      lower.includes("reach") ||
      lower.includes("directions")
    ) {
      intent = "route_query";
      confidence = 0.9;
    } else if (
      lower.includes("budget") ||
      lower.includes("cost") ||
      lower.includes("entry fee") ||
      lower.includes("entry fees") ||
      lower.includes("ticket price") ||
      lower.includes("ticket prices") ||
      lower.includes("ticket cost") ||
      lower.includes("how much will") ||
      lower.includes("what will it cost") ||
      lower.includes("cheapest") ||
      lower.includes("cheaper") ||
      lower.includes("affordable") ||
      lower.includes("senior discount") ||
      lower.includes("senior citizen discount") ||
      lower.includes("student discount") ||
      lower.includes("stay within") ||
      /₹\s*\d+/i.test(text) ||
      /\b\d+\s*(?:rs|rupees|inr)\b/i.test(lower)
    ) {
      const isExplicitPlanning =
        (lower.includes("plan") ||
          lower.includes("itinerary") ||
          /\b\d+\s*day\b/i.test(lower) ||
          lower.includes("schedule") ||
          lower.includes("suggest a trip")) &&
        !lower.includes("how much") &&
        !lower.includes("what will");

      if (isExplicitPlanning) {
        intent = "trip_planning";
        entities.isBudgetConstrained = true;
      } else {
        intent = "budget_query";
        entities.isBudgetConstrained = true;
      }
      confidence = 0.93;
    } else if (
      (lower.includes("experience") ||
        lower.includes("experiences") ||
        lower.includes("what can i do") ||
        lower.includes("what to do") ||
        lower.includes("cultural experience") ||
        lower.includes("cultural activities") ||
        lower.includes("local culture") ||
        lower.includes("heritage and local") ||
        lower.includes("food and culture") ||
        lower.includes("peaceful experiences") ||
        (lower.includes("suggest") &&
          (lower.includes("experience") ||
            lower.includes("culture") ||
            lower.includes("heritage")))) &&
      // "community tourism/travel" is a sustainability signal — check before generic "experience" (Phase 7H)
      !lower.includes("community tourism") &&
      !lower.includes("community travel")
    ) {
      if (
        (lower.includes("plan") || /\b\d+\s*day\b/i.test(lower) || lower.includes("itinerary")) &&
        !lower.includes("what cultural") &&
        !lower.includes("what experiences")
      ) {
        intent = "trip_planning";
      } else {
        intent = "experience_query";
      }
      confidence = 0.94;
    } else if (
      lower.includes("wheelchair") ||
      lower.includes("accessibility") ||
      lower.includes("ramp") ||
      lower.includes("lift")
    ) {
      intent = "accessibility_query";
      confidence = 0.92;
    } else if (
      lower.includes("photo") ||
      lower.includes("photos") ||
      lower.includes("picture") ||
      lower.includes("pictures") ||
      lower.includes("gallery") ||
      lower.includes("image") ||
      lower.includes("images") ||
      lower.includes("in telugu") ||
      lower.includes("in hindi") ||
      lower.includes("in tamil") ||
      lower.includes("in kannada") ||
      lower.includes("in bengali") ||
      lower.includes("in marathi") ||
      lower.includes("in french") ||
      lower.includes("in spanish") ||
      lower.includes("in german") ||
      lower.includes("describe this destination in") ||
      lower.includes("summarize verified attractions") ||
      lower.includes("accessible descriptions for") ||
      lower.includes("what languages are supported") ||
      lower.includes("what languages are spoken") ||
      lower.includes("languages spoken in")
    ) {
      intent = "content_query";
      confidence = 0.94;
    } else if (
      lower.includes("translate") ||
      lower.includes("meaning in") ||
      lower.includes("translation") ||
      lower.includes("how to say")
    ) {
      intent = "translation_query";
      confidence = 0.95;
    } else if (
      lower.includes("hotel") ||
      lower.includes("hotels") ||
      lower.includes("homestay") ||
      lower.includes("homestays") ||
      lower.includes("resort") ||
      lower.includes("resorts") ||
      lower.includes("stay") ||
      lower.includes("lodging") ||
      lower.includes("restaurant") ||
      lower.includes("restaurants") ||
      lower.includes("cafe") ||
      lower.includes("cafes") ||
      lower.includes("dining") ||
      lower.includes("food") ||
      lower.includes("handicraft") ||
      lower.includes("handicrafts") ||
      lower.includes("artisan") ||
      lower.includes("market") ||
      lower.includes("shops") ||
      lower.includes("shopping") ||
      lower.includes("business") ||
      lower.includes("businesses")
    ) {
      intent = "local_business_query";
      confidence = 0.9;
    } else if (
      lower.includes("eco") ||
      lower.includes("eco-friendly") ||
      lower.includes("eco friendly") ||
      lower.includes("sustainable") ||
      lower.includes("sustainability") ||
      lower.includes("green travel") ||
      lower.includes("eco tourism") ||
      lower.includes("eco-tourism") ||
      lower.includes("ecological") ||
      lower.includes("community tourism") ||
      lower.includes("community travel") ||
      lower.includes("carbon") ||
      lower.includes("low impact") ||
      lower.includes("low-impact") ||
      lower.includes("responsible travel") ||
      lower.includes("responsible tourism") ||
      lower.includes("environment-friendly") ||
      lower.includes("nature travel") ||
      lower.includes("slow travel")
    ) {
      intent = "sustainability_query";
      if (lower.includes("community")) entities.communityPreference = true;
      if (lower.includes("eco") || lower.includes("ecological") || lower.includes("environment"))
        entities.ecoFriendlyPreference = true;
      if (
        lower.includes("minimize") ||
        lower.includes("low impact") ||
        lower.includes("low-impact")
      )
        entities.minimizeTravel = true;
      confidence = 0.93;
    } else if (entities.destinationName) {
      intent = "destination_information";
      confidence = 0.85;
    } else if (
      lower.includes("search") ||
      lower.includes("find destination") ||
      lower.includes("where to go") ||
      lower.includes("places in")
    ) {
      intent = "destination_search";
      confidence = 0.85;
    }

    const requiredTools = this.determineRequiredTools(intent, entities, lower);

    return {
      intent,
      confidence,
      entities,
      requiredTools
    };
  }

  private extractEntities(text: string, lower: string): ExtractedEntities {
    const entities: ExtractedEntities = {};

    // 1. Duration / Days
    const dayMatch = text.match(/(\d+)\s*(?:-| )?day/i);
    if (dayMatch && dayMatch[1]) {
      const days = parseInt(dayMatch[1], 10);
      if (!isNaN(days) && days > 0 && days <= 30) {
        entities.days = days;
      }
    }

    // 2. Crowd / Quiet Preference
    if (
      lower.includes("avoid crowd") ||
      lower.includes("avoid crowds") ||
      lower.includes("quiet") ||
      lower.includes("peaceful") ||
      lower.includes("less crowded")
    ) {
      entities.avoidCrowds = true;
    }

    // 3. Traveller Group & Women Traveller Detection
    if (
      lower.includes("solo female") ||
      lower.includes("solo woman") ||
      (lower.includes("solo") &&
        (lower.includes("woman") || lower.includes("women") || lower.includes("female")))
    ) {
      entities.travellerGroup = "solo";
      entities.isSoloFemale = true;
      entities.isWomenTraveller = true;
    } else if (
      lower.includes("women") ||
      lower.includes("woman") ||
      lower.includes("female") ||
      lower.includes("girl")
    ) {
      entities.isWomenTraveller = true;
    }

    // 3. Group / Demographics
    if (!entities.travellerGroup) {
      if (lower.includes("parents") || lower.includes("elderly parents")) {
        entities.travellerGroup = "parents";
        entities.isElderlyTraveller = true;
      } else if (
        lower.includes("elderly") ||
        lower.includes("senior") ||
        lower.includes("grandparents")
      ) {
        entities.travellerGroup = "elderly";
        entities.isElderlyTraveller = true;
      } else if (lower.includes("family") || lower.includes("kids") || lower.includes("children")) {
        entities.travellerGroup = "family";
      } else if (lower.includes("solo") || lower.includes("alone") || lower.includes("myself")) {
        entities.travellerGroup = "solo";
      } else if (
        lower.includes("couple") ||
        lower.includes("honeymoon") ||
        lower.includes("partner")
      ) {
        entities.travellerGroup = "couple";
      } else if (
        lower.includes("friends") ||
        lower.includes("group") ||
        lower.includes("colleagues")
      ) {
        entities.travellerGroup = "group";
      }
    }

    // 4. Accessibility Needs & Reduced Mobility
    const accNeeds: string[] = [];
    if (lower.includes("wheelchair")) {
      accNeeds.push("wheelchair");
      entities.requiresWheelchair = true;
    }
    if (lower.includes("ramp")) accNeeds.push("ramp");
    if (lower.includes("lift") || lower.includes("elevator")) accNeeds.push("elevator");
    if (
      lower.includes("less walking") ||
      lower.includes("cannot walk") ||
      lower.includes("difficulty walking") ||
      lower.includes("reduced mobility") ||
      lower.includes("resting facilities") ||
      lower.includes("resting benches")
    ) {
      entities.reducedMobility = true;
    }

    if (accNeeds.length > 0) {
      entities.accessibilityNeeds = accNeeds;
    }

    // 5. Budget, Concessions, & Demographic Counts
    if (
      lower.includes("budget") ||
      lower.includes("cheap") ||
      lower.includes("cheapest") ||
      lower.includes("affordable") ||
      lower.includes("low cost")
    ) {
      entities.isBudgetConstrained = true;
    }

    if (lower.includes("student") || lower.includes("college")) {
      entities.isStudentTraveller = true;
    }

    if (
      lower.includes("foreign") ||
      lower.includes("foreigner") ||
      lower.includes("international") ||
      lower.includes("nri")
    ) {
      entities.isForeignTraveller = true;
    }

    // Extract numeric budget amount if present
    const budgetMatch =
      text.match(/₹\s*([\d,]+)(?:\s*(k|thousand))?/i) ||
      text.match(/\b([\d,]+)\s*(?:rs|rupees|inr)\b/i) ||
      text.match(/(?:rs|rupees|inr)\s*([\d,]+)(?:\s*(k|thousand))?/i) ||
      text.match(
        /(?:budget|cost|under|within|have)\s*(?:of|is|:)?\s*₹?\s*([\d,]+)(?:\s*(k|thousand))?/i
      );

    if (budgetMatch && budgetMatch[1]) {
      let rawAmount = parseFloat(budgetMatch[1].replace(/,/g, ""));
      if (budgetMatch[2]?.toLowerCase() === "k" || budgetMatch[2]?.toLowerCase() === "thousand") {
        rawAmount *= 1000;
      }
      if (!isNaN(rawAmount) && rawAmount > 0) {
        entities.userBudget = rawAmount;
        entities.budget = `₹${rawAmount}`;
        entities.budgetCurrency = "INR";
        entities.isBudgetConstrained = true;
      }
    }

    // Demographic counts extraction
    const seniorCountMatch = text.match(/(\d+)\s*(?:seniors|senior|elderly)/i);
    if (seniorCountMatch && seniorCountMatch[1]) {
      const count = parseInt(seniorCountMatch[1], 10);
      if (!isNaN(count)) entities.seniorsCount = count;
    }

    const studentCountMatch = text.match(/(\d+)\s*(?:students|student)/i);
    if (studentCountMatch && studentCountMatch[1]) {
      const count = parseInt(studentCountMatch[1], 10);
      if (!isNaN(count)) entities.studentsCount = count;
    }

    const childCountMatch = text.match(/(\d+)\s*(?:children|child|kids|kid)/i);
    if (childCountMatch && childCountMatch[1]) {
      const count = parseInt(childCountMatch[1], 10);
      if (!isNaN(count)) entities.childrenCount = count;
    }

    // 6. Interest & Avoid-Interest Extraction (Phase 7E)
    const extractedInterests: string[] = [];
    const extractedAvoidInterests: string[] = [];

    // Avoid-interest patterns
    if (
      lower.includes("not adventure") ||
      lower.includes("no adventure") ||
      lower.includes("don't want adventure") ||
      lower.includes("dont want adventure") ||
      lower.includes("do not want adventure") ||
      lower.includes("avoid adventure") ||
      lower.includes("without adventure") ||
      lower.includes("no trekking") ||
      lower.includes("avoid trekking")
    ) {
      extractedAvoidInterests.push("adventure");
    }

    if (
      lower.includes("avoid crowd") ||
      lower.includes("avoid crowds") ||
      lower.includes("no crowd") ||
      lower.includes("not crowded")
    ) {
      extractedAvoidInterests.push("crowd");
      entities.avoidCrowds = true;
    }

    if (lower.includes("no shopping") || lower.includes("avoid shopping")) {
      extractedAvoidInterests.push("shopping");
    }

    // Positive interest patterns
    if (lower.includes("heritage") || lower.includes("monument") || lower.includes("fort")) {
      if (
        !extractedAvoidInterests.includes("heritage") &&
        !extractedInterests.includes("heritage")
      ) {
        extractedInterests.push("heritage");
      }
    }
    if (lower.includes("history") || lower.includes("historic") || lower.includes("ancient")) {
      if (!extractedAvoidInterests.includes("history") && !extractedInterests.includes("history")) {
        extractedInterests.push("history");
      }
    }
    if (
      lower.includes("culture") ||
      lower.includes("cultural") ||
      lower.includes("tradition") ||
      lower.includes("tribal") ||
      lower.includes("village")
    ) {
      if (!extractedAvoidInterests.includes("culture")) extractedInterests.push("culture");
    }
    if (
      lower.includes("spiritual") ||
      lower.includes("temple") ||
      lower.includes("shrine") ||
      lower.includes("ashram") ||
      lower.includes("pilgrimage")
    ) {
      if (!extractedAvoidInterests.includes("spiritual")) extractedInterests.push("spiritual");
    }
    if (
      lower.includes("food") ||
      lower.includes("cuisine") ||
      lower.includes("culinary") ||
      lower.includes("tea") ||
      lower.includes("dining")
    ) {
      if (!extractedAvoidInterests.includes("food")) extractedInterests.push("food");
    }
    if (
      lower.includes("nature") ||
      lower.includes("wildlife") ||
      lower.includes("sanctuary") ||
      lower.includes("forest") ||
      lower.includes("waterfall")
    ) {
      if (!extractedAvoidInterests.includes("nature")) extractedInterests.push("nature");
    }
    if (lower.includes("adventure") || lower.includes("trek") || lower.includes("safari")) {
      if (!extractedAvoidInterests.includes("adventure")) extractedInterests.push("adventure");
    }
    if (
      lower.includes("wellness") ||
      lower.includes("yoga") ||
      lower.includes("ayurveda") ||
      lower.includes("spa")
    ) {
      if (!extractedAvoidInterests.includes("wellness")) extractedInterests.push("wellness");
    }
    if (
      lower.includes("shopping") ||
      lower.includes("handicraft") ||
      lower.includes("bazaar") ||
      lower.includes("market")
    ) {
      if (!extractedAvoidInterests.includes("shopping")) extractedInterests.push("shopping");
    }
    if (
      lower.includes("relax") ||
      lower.includes("peaceful") ||
      lower.includes("quiet") ||
      lower.includes("leisure")
    ) {
      if (!extractedAvoidInterests.includes("relaxation")) extractedInterests.push("relaxation");
    }
    if (lower.includes("photography") || lower.includes("scenic") || lower.includes("photo")) {
      if (!extractedAvoidInterests.includes("photography")) extractedInterests.push("photography");
    }

    if (extractedInterests.length > 0) {
      entities.interests = extractedInterests;
    }
    if (extractedAvoidInterests.length > 0) {
      entities.avoidInterests = extractedAvoidInterests;
    }

    // 7. Target Language & Content Topic Extraction (Phase 7F)
    const langMatch =
      text.match(
        /\bin\s+(telugu|hindi|tamil|kannada|bengali|marathi|gujarati|malayalam|punjabi|odia|urdu|french|spanish|german|japanese|chinese|russian|arabic)\b/i
      ) ||
      text.match(/\b(?:to|in|into)\s+([a-zA-Z]+)\b/i) ||
      text.match(
        /\b(telugu|hindi|tamil|kannada|bengali|marathi|gujarati|malayalam|punjabi|odia|urdu|french|spanish|german)\b/i
      );

    if (langMatch && langMatch[1]) {
      const detectedLang = langMatch[1].toLowerCase();
      const knownLangs = [
        "telugu",
        "hindi",
        "tamil",
        "kannada",
        "bengali",
        "marathi",
        "gujarati",
        "malayalam",
        "punjabi",
        "odia",
        "urdu",
        "french",
        "spanish",
        "german",
        "english"
      ];
      if (knownLangs.includes(detectedLang)) {
        entities.targetLanguage = detectedLang;
      }
    }

    if (
      lower.includes("photo") ||
      lower.includes("picture") ||
      lower.includes("gallery") ||
      lower.includes("image")
    ) {
      entities.contentTopic = "gallery";
    } else if (entities.targetLanguage) {
      entities.contentTopic = "multilingual";
    } else if (
      lower.includes("summary") ||
      lower.includes("summarize") ||
      lower.includes("overview")
    ) {
      entities.contentTopic = "summary";
    }

    // 8. Business Category Extraction (Phase 7G)
    if (lower.includes("homestay")) {
      entities.businessCategory = "homestay";
    } else if (
      lower.includes("hotel") ||
      lower.includes("resort") ||
      lower.includes("stay") ||
      lower.includes("lodge")
    ) {
      entities.businessCategory = "hotel";
    } else if (
      lower.includes("restaurant") ||
      lower.includes("dining") ||
      lower.includes("cafe") ||
      lower.includes("food") ||
      lower.includes("dhaba")
    ) {
      entities.businessCategory = "restaurant";
    } else if (
      lower.includes("handicraft") ||
      lower.includes("artisan") ||
      lower.includes("craft") ||
      lower.includes("handloom")
    ) {
      entities.businessCategory = "handicraft";
    } else if (lower.includes("tour operator") || lower.includes("tour agency")) {
      entities.businessCategory = "tour_operator";
    } else if (lower.includes("guide") || lower.includes("tour guide")) {
      entities.businessCategory = "guide";
    } else if (lower.includes("shopping") || lower.includes("market") || lower.includes("bazaar")) {
      entities.businessCategory = "shopping";
    }

    // 9. Sustainability / Eco entity extraction (Phase 7H)
    if (
      lower.includes("eco") ||
      lower.includes("eco-friendly") ||
      lower.includes("sustainable") ||
      lower.includes("ecological") ||
      lower.includes("environment")
    ) {
      entities.ecoFriendlyPreference = true;
    }
    if (
      lower.includes("community tourism") ||
      lower.includes("community travel") ||
      lower.includes("community stay") ||
      lower.includes("community experience") ||
      lower.includes("community experiences") ||
      lower.includes("tribal") ||
      lower.includes("village")
    ) {
      entities.communityPreference = true;
    }
    if (
      lower.includes("low impact") ||
      lower.includes("low-impact") ||
      lower.includes("minimize travel")
    ) {
      entities.minimizeTravel = true;
    }

    // 10. Known Destination match
    for (const dest of KNOWN_DESTINATIONS) {
      if (new RegExp(`\\b${dest}\\b`, "i").test(text)) {
        entities.destinationName = dest;
        break;
      }
    }

    // If no known destination, extract "to [Destination]", "of [Destination]", or "in [Destination]"
    if (!entities.destinationName) {
      const toMatch = text.match(
        /(?:trip to|visit|explore|travel to|photos of|gallery of|pictures of|images of|of|in|at)\s+([A-Z][a-zA-Z\s]+?)(?:\s+for|\s+with|\s+next|\s+in|\s*\.|\s*$)/i
      );
      if (toMatch && toMatch[1]) {
        const candidate = toMatch[1].trim();
        if (
          candidate.length > 2 &&
          !["my", "the", "a", "an", "our"].includes(candidate.toLowerCase())
        ) {
          entities.destinationName = candidate;
        }
      }
    }

    return entities;
  }

  private determineRequiredTools(
    intent: TourismIntent,
    entities: ExtractedEntities,
    lower: string
  ): ToolName[] {
    const tools: ToolName[] = [];

    switch (intent) {
      case "trip_planning":
        // Core trip planning tools: destination identity, attractions, live weather, safety
        tools.push("destination_search", "attractions", "weather");

        if (entities.isWomenTraveller || entities.isSoloFemale) {
          tools.push("women_safety_intelligence");
        } else {
          tools.push("safety");
        }

        // Context-aware dynamic tool enrichment (capped by executor limit of 6)
        if (entities.isBudgetConstrained || entities.userBudget !== undefined) {
          tools.push("budget_intelligence");
        } else if (entities.avoidCrowds) {
          tools.push("crowd_intelligence");
        } else if (
          entities.travellerGroup === "parents" ||
          entities.travellerGroup === "elderly" ||
          entities.isElderlyTraveller
        ) {
          tools.push("elderly_support", "elderly_travel_intelligence");
        } else if (
          entities.requiresWheelchair ||
          entities.reducedMobility ||
          (entities.accessibilityNeeds && entities.accessibilityNeeds.length > 0)
        ) {
          tools.push("accessibility", "accessibility_intelligence");
        } else if (
          lower.includes("hotel") ||
          lower.includes("stay") ||
          lower.includes("restaurant") ||
          lower.includes("resort")
        ) {
          tools.push("local_businesses", "local_business_intelligence");
        } else if (entities.interests && entities.interests.length > 0) {
          tools.push("experience_intelligence");
        } else if (
          lower.includes("experience") ||
          lower.includes("culture") ||
          lower.includes("adventure")
        ) {
          tools.push("experiences");
        } else if (lower.includes("food")) {
          tools.push("local_businesses", "local_business_intelligence");
        } else {
          // Default rich exploration
          tools.push("experiences");
        }
        break;
      case "content_query":
        tools.push(
          "destination_search",
          "content_intelligence",
          "destination_details",
          "translation"
        );
        break;
      case "experience_query":
        tools.push("destination_search", "experience_intelligence", "experiences", "attractions");
        break;
      case "budget_query":
        tools.push("destination_search", "budget_intelligence", "attractions");
        break;
      case "crowd_query":
        tools.push("destination_search", "crowd_intelligence", "weather");
        break;
      case "itinerary_help":
        tools.push("destination_search", "attractions", "experiences");
        break;
      case "weather_query":
        tools.push("destination_search", "weather");
        break;
      case "women_safety_query":
        tools.push(
          "destination_search",
          "women_safety_intelligence",
          "safety",
          "emergency_resources"
        );
        break;
      case "safety_query":
        tools.push("destination_search", "safety", "emergency_resources");
        break;
      case "route_query":
        tools.push("destination_search", "routing");
        break;
      case "accessibility_query":
        tools.push(
          "destination_search",
          "accessibility_intelligence",
          "accessibility",
          "attractions"
        );
        break;
      case "elderly_travel_query":
        tools.push(
          "destination_search",
          "elderly_travel_intelligence",
          "elderly_support",
          "attractions"
        );
        break;
      case "translation_query":
        tools.push("translation");
        break;
      case "local_business_query":
        tools.push("destination_search", "local_business_intelligence", "destination_details");
        break;
      case "sustainability_query":
        tools.push("destination_search", "sustainability_intelligence", "destination_details");
        break;
      case "destination_search":
        tools.push("destination_search");
        break;
      case "destination_information":
      default:
        tools.push("destination_search", "destination_details", "attractions");
        break;
    }

    return tools;
  }
}

export const intentClassifier = new IntentClassifier();
