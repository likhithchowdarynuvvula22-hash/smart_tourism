import { TranslationProvider } from "./translation.provider";
import { myMemoryTranslationProvider } from "./myMemory.provider";
import { NormalizedTranslationDto } from "../../../types/external";
import { BadRequestError } from "../../../utils/appError";

const LANGUAGE_ALIASES: Record<string, string> = {
  // English
  english: "en",
  
  // Hindi
  hindi: "hi",
  "हिन्दी": "hi",
  "हिंदी": "hi",
  
  // Tamil
  tamil: "ta",
  tamizh: "ta",
  "தமிழ்": "ta",
  
  // Telugu
  telugu: "te",
  telgu: "te",
  "తెలుగు": "te",
  
  // Bengali
  bengali: "bn",
  bangla: "bn",
  "বাংলা": "bn",
  
  // Marathi
  marathi: "mr",
  "मराठी": "mr",
  
  // Gujarati
  gujarati: "gu",
  gujrati: "gu",
  "ગુજરાતી": "gu",
  
  // Kannada
  kannada: "kn",
  kanada: "kn",
  "ಕನ್ನಡ": "kn",
  
  // Malayalam
  malayalam: "ml",
  malayali: "ml",
  "മലയാളം": "ml",
  
  // Punjabi
  punjabi: "pa",
  panjabi: "pa",
  "ਪੰਜਾਬੀ": "pa",
  
  // Odia
  odia: "or",
  oriya: "or",
  "ଓଡ଼ିଆ": "or",
  
  // Urdu
  urdu: "ur",
  "اردو": "ur",
  
  // Foreign
  french: "fr",
  spanish: "es",
  german: "de",
  japanese: "ja",
  chinese: "zh",
  russian: "ru",
  arabic: "ar"
};

import { requestCache, RequestCache } from "../../../utils/requestCache";

export class TranslationService {
  constructor(private readonly provider: TranslationProvider = myMemoryTranslationProvider) {}

  private normalizeLanguage(lang: string, fieldName: string): string {
    if (!lang || typeof lang !== "string" || lang.trim().length === 0) {
      throw new BadRequestError(`${fieldName} language is required`);
    }

    const clean = lang.trim().toLowerCase();
    return LANGUAGE_ALIASES[clean] || clean;
  }

  /**
   * Translates text between supported language pairs with request-scoped memoization.
   */
  async translate(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<NormalizedTranslationDto> {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      throw new BadRequestError("Text to translate cannot be empty");
    }

    if (text.length > 5000) {
      throw new BadRequestError("Text exceeds maximum allowed length of 5000 characters");
    }

    const source = this.normalizeLanguage(sourceLang, "Source");
    const target = this.normalizeLanguage(targetLang, "Target");

    if (source === target) {
      return {
        sourceLanguage: source,
        targetLanguage: target,
        originalText: text,
        translatedText: text,
        matchQuality: 1,
        provider: "Identity",
        retrievedAt: new Date().toISOString()
      };
    }

    if (this.provider !== myMemoryTranslationProvider) {
      return this.provider.translate(text.trim(), source, target);
    }

    const cacheKey = RequestCache.keys.translation(source, target, text.trim());
    return requestCache.getOrSet(
      cacheKey,
      () => this.provider.translate(text.trim(), source, target),
      60000
    );
  }
}

export const translationService = new TranslationService();
