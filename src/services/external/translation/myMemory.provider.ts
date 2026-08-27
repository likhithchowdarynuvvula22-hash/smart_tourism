import { TranslationProvider } from "./translation.provider";
import { NormalizedTranslationDto } from "../../../types/external";
import { httpGet } from "../../../utils/httpClient";
import { BadGatewayError } from "../../../utils/appError";

interface MyMemoryResponse {
  responseData: {
    translatedText: string;
    match: number;
  };
  responseStatus: number | string;
  responseDetails?: string;
}

/**
 * MyMemory Indic Translation Provider (Demo / Free-Tier Adapter)
 *
 * STATUS & QUOTAS:
 * - Free / Demo Tier: ~5,000 characters/day per IP (100% keyless).
 * - Extended Free Tier: ~50,000 characters/day with free email registration.
 * - Architecture: Sits strictly behind the `TranslationProvider` interface for seamless
 *   drop-in replacement with enterprise or official government APIs (e.g. Bhashini / IndicTrans)
 *   without requiring any redesign of controllers or application logic.
 */
export class MyMemoryTranslationProvider implements TranslationProvider {
  readonly providerName = "MyMemory Indic Translation (Free/Demo Tier)";
  private readonly baseUrl = "https://api.mymemory.translated.net/get";

  async translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<NormalizedTranslationDto> {
    const langpair = `${sourceLanguage}|${targetLanguage}`;

    const raw = await httpGet<MyMemoryResponse>(this.baseUrl, {
      params: {
        q: text,
        langpair
      },
      timeoutMs: 6000
    });

    if (
      !raw.responseData ||
      typeof raw.responseData.translatedText !== "string" ||
      Number(raw.responseStatus) === 400 ||
      Number(raw.responseStatus) === 403
    ) {
      throw new BadGatewayError(
        `Translation failed: ${raw.responseDetails || "Provider rejected translation request (quota or language pair error)"}`
      );
    }

    return {
      sourceLanguage,
      targetLanguage,
      originalText: text,
      translatedText: raw.responseData.translatedText,
      matchQuality: raw.responseData.match,
      provider: this.providerName,
      retrievedAt: new Date().toISOString()
    };
  }
}

export const myMemoryTranslationProvider = new MyMemoryTranslationProvider();
