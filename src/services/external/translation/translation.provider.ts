import { NormalizedTranslationDto } from "../../../types/external";

export interface TranslationProvider {
  readonly providerName: string;
  translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<NormalizedTranslationDto>;
}
