import {
  DestinationContentSummaryDto,
  DestinationGalleryDto,
  DualLanguageText,
  MultilingualContentDto
} from "../../types/content";
import {
  DestinationRepository,
  destinationRepository
} from "../../repositories/destination.repository";
import { TourismRepository, tourismRepository } from "../../repositories/tourism.repository";
import { GalleryAnalyzer, galleryAnalyzer } from "./analyzers/gallery.analyzer";
import {
  ContentSummaryAnalyzer,
  contentSummaryAnalyzer
} from "./analyzers/contentSummary.analyzer";
import {
  TranslationService,
  translationService
} from "../external/translation/translation.service";
import { isValidUuid } from "../../utils/validators";
import { BadRequestError, NotFoundError } from "../../utils/appError";
import { logger } from "../../lib/logger";
import { supabase } from "../../lib/supabase";
import { ProvenanceSource } from "../../types/ai";
import { EntryFeesRow } from "../../types/database.types";

export class ContentService {
  constructor(
    private readonly destRepo: DestinationRepository = destinationRepository,
    private readonly tourismRepo: TourismRepository = tourismRepository,
    private readonly galleryAnal: GalleryAnalyzer = galleryAnalyzer,
    private readonly summaryAnal: ContentSummaryAnalyzer = contentSummaryAnalyzer,
    private readonly transService: TranslationService = translationService
  ) {}

  /**
   * Retrieves verified gallery and photography metadata for a destination and its attractions.
   */
  async getDestinationGallery(destinationId: string): Promise<DestinationGalleryDto> {
    if (!isValidUuid(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID: '${destinationId}'. Must be a valid UUID.`
      );
    }

    const destination = await this.destRepo.findById(destinationId);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${destinationId}' not found.`);
    }

    const [images, attractions] = await Promise.all([
      this.tourismRepo.findImagesByDestinationId(destinationId),
      this.tourismRepo.findAttractionsByDestinationId(destinationId)
    ]);

    return this.galleryAnal.assessGallery(destination, images, attractions);
  }

  /**
   * Retrieves a comprehensive, verified content summary for a destination.
   */
  async getDestinationSummary(destinationId: string): Promise<DestinationContentSummaryDto> {
    if (!isValidUuid(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID: '${destinationId}'. Must be a valid UUID.`
      );
    }

    const destination = await this.destRepo.findById(destinationId);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${destinationId}' not found.`);
    }

    const [
      attractions,
      experiences,
      languageRow,
      accessibilityRows,
      elderlyRows,
      emergencyResources
    ] = await Promise.all([
      this.tourismRepo.findAttractionsByDestinationId(destinationId),
      this.tourismRepo.findExperiencesByDestinationId(destinationId),
      this.tourismRepo.findLanguagesByDestinationId(destinationId),
      this.tourismRepo.findAccessibilityByDestinationId(destinationId),
      this.tourismRepo.findElderlySupportByDestinationId(destinationId),
      this.tourismRepo.findEmergencyResourcesByDestinationId(destinationId)
    ]);

    let feeRows: EntryFeesRow[] = [];
    if (attractions.length > 0) {
      const attractionIds = attractions.map((a) => a.id);
      const { data: fees } = await supabase
        .from("entry_fees")
        .select("*")
        .in("attraction_id", attractionIds);
      feeRows = fees || [];
    }

    return this.summaryAnal.generateSummary(
      destination,
      attractions,
      experiences,
      languageRow,
      accessibilityRows,
      elderlyRows,
      feeRows,
      emergencyResources
    );
  }

  /**
   * Retrieves multilingual destination content with dual-language provenance.
   */
  async getMultilingualContent(
    destinationId: string,
    targetLanguage: string
  ): Promise<MultilingualContentDto> {
    if (!isValidUuid(destinationId)) {
      throw new BadRequestError(
        `Invalid destination ID: '${destinationId}'. Must be a valid UUID.`
      );
    }

    if (
      !targetLanguage ||
      typeof targetLanguage !== "string" ||
      targetLanguage.trim().length === 0
    ) {
      throw new BadRequestError("Target language parameter 'lang' is required.");
    }

    const destination = await this.destRepo.findById(destinationId);
    if (!destination) {
      throw new NotFoundError(`Destination with ID '${destinationId}' not found.`);
    }

    const [attractions, languageRow] = await Promise.all([
      this.tourismRepo.findAttractionsByDestinationId(destinationId),
      this.tourismRepo.findLanguagesByDestinationId(destinationId)
    ]);

    const target = targetLanguage.trim().toLowerCase();
    const sourceLang = "en"; // Base catalog language

    // Check if target language is supported locally according to verified languages table
    const allLocalLanguages = [
      languageRow?.official_language || "",
      languageRow?.local_languages || "",
      languageRow?.guide_languages || ""
    ]
      .join(" ")
      .toLowerCase();

    const isSupportedLocally =
      allLocalLanguages.includes(target) ||
      target === "en" ||
      target === "english" ||
      target === "hi" ||
      target === "hindi";

    const sources: ProvenanceSource[] = [];
    if (destination.source) {
      sources.push({
        type: "database",
        provider: destination.source,
        resource: "destinations"
      });
    }
    if (languageRow?.source) {
      sources.push({
        type: "database",
        provider: languageRow.source,
        resource: "languages"
      });
    }

    // Helper to safely translate single string
    const safeTranslate = async (
      text: string | null | undefined
    ): Promise<DualLanguageText | null> => {
      if (!text || text.trim().length === 0) return null;
      try {
        const transRes = await this.transService.translate(text, sourceLang, target);
        return {
          original: text,
          translated: transRes.translatedText
        };
      } catch (err) {
        logger.warn(
          { err, text, target },
          "Translation call failed; providing original text as fallback"
        );
        return {
          original: text,
          translated: text
        };
      }
    };

    // Translate Destination Name and State
    const transName = (await safeTranslate(destination.name)) || {
      original: destination.name,
      translated: destination.name
    };
    const transState = (await safeTranslate(destination.state)) || {
      original: destination.state,
      translated: destination.state
    };
    const transDescription = destination.description
      ? await safeTranslate(destination.description)
      : null;

    // Translate Attractions (top 5 to preserve responsiveness)
    const translatedAttractions = await Promise.all(
      attractions.slice(0, 5).map(async (att) => {
        const nameText = (await safeTranslate(att.name)) || {
          original: att.name,
          translated: att.name
        };
        const catText = (await safeTranslate(att.category || "Sightseeing")) || {
          original: att.category || "Sightseeing",
          translated: att.category || "Sightseeing"
        };
        const descText = att.description ? await safeTranslate(att.description) : null;

        return {
          id: att.id,
          name: nameText,
          category: catText,
          description: descText
        };
      })
    );

    // Translate Disclaimers
    const standardDisclaimer =
      "Content is sourced strictly from verified government tourism and database records.";
    const transDisclaimer = (await safeTranslate(standardDisclaimer)) || {
      original: standardDisclaimer,
      translated: standardDisclaimer
    };

    return {
      destinationId: destination.id,
      destinationName: transName,
      state: transState,
      sourceLanguage: sourceLang,
      requestedLanguage: targetLanguage,
      isSupportedLocally,
      supportedLanguagesInDestination: {
        official: languageRow?.official_language || null,
        local: languageRow?.local_languages || null,
        guide: languageRow?.guide_languages || null
      },
      destinationDescription: transDescription,
      attractions: translatedAttractions,
      disclaimers: [
        {
          topic: "grounding",
          original: transDisclaimer.original,
          translated: transDisclaimer.translated
        }
      ],
      translationProvider: "MyMemory / Translation Service",
      sources
    };
  }
}

export const contentService = new ContentService();
