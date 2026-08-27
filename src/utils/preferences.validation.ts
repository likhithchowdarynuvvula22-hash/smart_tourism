import { UpdatePreferencesDto } from "../types/trip";
import { BadRequestError } from "./appError";

/**
 * Phase 8B — deterministic preference payload validation.
 * Invalid user data is NEVER silently coerced into a valid preference.
 * Unknown fields are ignored (existing behavior); known fields are type-checked.
 */

const SUPPORTED_LANGUAGES = [
  "en",
  "english",
  "hi",
  "hindi",
  "te",
  "telugu",
  "ta",
  "tamil",
  "kn",
  "kannada",
  "bn",
  "bengali",
  "mr",
  "marathi",
  "ml",
  "malayalam",
  "gu",
  "gujarati",
  "pa",
  "punjabi",
  "od",
  "odia",
  "fr",
  "french",
  "es",
  "spanish",
  "de",
  "german"
];

const MAX_LIST_ITEMS = 20;
const MAX_ITEM_LENGTH = 60;

const validateStringArray = (value: unknown, field: string, errors: string[]): void => {
  if (!Array.isArray(value)) {
    errors.push(`'${field}' must be an array of strings`);
    return;
  }
  if (value.length > MAX_LIST_ITEMS) {
    errors.push(`'${field}' must contain at most ${MAX_LIST_ITEMS} items`);
  }
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0 || item.length > MAX_ITEM_LENGTH) {
      errors.push(
        `Each '${field}' entry must be a non-empty string of at most ${MAX_ITEM_LENGTH} characters`
      );
      return;
    }
  }
};

const validateNullableNumber = (
  value: unknown,
  field: string,
  errors: string[],
  opts: { min?: number; max?: number } = {}
): void => {
  if (value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`'${field}' must be a finite number or null`);
    return;
  }
  if (opts.min !== undefined && value < opts.min) {
    errors.push(`'${field}' must be >= ${opts.min}`);
  }
  if (opts.max !== undefined && value > opts.max) {
    errors.push(`'${field}' must be <= ${opts.max}`);
  }
};

const validateOptionalBoolean = (value: unknown, field: string, errors: string[]): void => {
  if (value === null) return;
  if (typeof value !== "boolean") {
    errors.push(`'${field}' must be a boolean or null`);
  }
};

/**
 * Validates the preference update payload. Throws BadRequestError on any
 * validation failure. Never coerces invalid values.
 */
export function validateUpdatePreferencesDto(body: unknown): UpdatePreferencesDto {
  const dto = (body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  // travel_preferences fields
  if (dto.interests !== undefined) validateStringArray(dto.interests, "interests", errors);
  if (dto.accessibilityNeeds !== undefined)
    validateStringArray(dto.accessibilityNeeds, "accessibilityNeeds", errors);
  if (dto.budgetMin !== undefined)
    validateNullableNumber(dto.budgetMin, "budgetMin", errors, { min: 0, max: 100_000_000 });
  if (dto.budgetMax !== undefined)
    validateNullableNumber(dto.budgetMax, "budgetMax", errors, { min: 0, max: 100_000_000 });
  if (
    dto.budgetMin !== undefined &&
    dto.budgetMax !== undefined &&
    typeof dto.budgetMin === "number" &&
    typeof dto.budgetMax === "number" &&
    dto.budgetMin > dto.budgetMax
  ) {
    errors.push("'budgetMin' cannot exceed 'budgetMax'");
  }
  if (dto.preferredTripDays !== undefined) {
    validateNullableNumber(dto.preferredTripDays, "preferredTripDays", errors, {
      min: 1,
      max: 365
    });
    if (dto.preferredTripDays !== null && !Number.isInteger(dto.preferredTripDays as number)) {
      errors.push("'preferredTripDays' must be an integer");
    }
  }
  if (dto.safetyPriority !== undefined) {
    validateOptionalBoolean(dto.safetyPriority, "safetyPriority", errors);
  }

  // tourist_profiles fields
  for (const textField of ["travelStyle", "budgetRange", "ageGroup"] as const) {
    if (dto[textField] !== undefined && dto[textField] !== null) {
      if (
        typeof dto[textField] !== "string" ||
        (dto[textField] as string).length > MAX_ITEM_LENGTH
      ) {
        errors.push(`'${textField}' must be a string of at most ${MAX_ITEM_LENGTH} characters`);
      }
    }
  }
  if (dto.mobilityNeeds !== undefined)
    validateStringArray(dto.mobilityNeeds, "mobilityNeeds", errors);
  if (dto.safetyPreferences !== undefined)
    validateStringArray(dto.safetyPreferences, "safetyPreferences", errors);
  for (const boolField of ["soloTraveller", "familyGroup", "elderlyTraveller"] as const) {
    if (dto[boolField] !== undefined) {
      validateOptionalBoolean(dto[boolField], boolField, errors);
    }
  }

  // users_profile field (Phase 8B)
  if (dto.preferredLanguage !== undefined && dto.preferredLanguage !== null) {
    if (typeof dto.preferredLanguage !== "string") {
      errors.push("'preferredLanguage' must be a supported language identifier string");
    } else if (!SUPPORTED_LANGUAGES.includes(dto.preferredLanguage.toLowerCase().trim())) {
      errors.push(
        `'${dto.preferredLanguage}' is not a supported language. Supported: ${SUPPORTED_LANGUAGES.filter((l) => l.length > 2).join(", ")}`
      );
    }
  }

  if (errors.length > 0) {
    throw new BadRequestError(`Invalid preference payload: ${errors.join("; ")}`);
  }

  return dto as unknown as UpdatePreferencesDto;
}

export const isSupportedLanguage = (language: string): boolean =>
  SUPPORTED_LANGUAGES.includes(language.toLowerCase().trim());
