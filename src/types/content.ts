import { ProvenanceSource } from "./ai";

export type ImageCoverageStatus = "sufficient" | "limited" | "insufficient";

export interface ImageItemDto {
  id: string;
  destinationId: string | null;
  attractionId: string | null;
  relatedEntityType: "destination" | "attraction" | "unknown";
  relatedEntityName: string | null;
  url: string | null;
  photographer: string | null;
  license: string;
  attribution: string | null;
  usage: string | null;
  source: string;
  sourceUrl: string | null;
  verificationStatus: string;
  altText: string;
  generatedFromMetadata: boolean;
  createdAt: string;
}

export interface DestinationGalleryDto {
  destinationId: string;
  destinationName: string;
  state: string;
  coverage: {
    status: ImageCoverageStatus;
    totalImages: number;
    withVerifiedLicense: number;
    explanation: string;
  };
  images: ImageItemDto[];
  disclaimer: string;
  sources: ProvenanceSource[];
}

export interface DualLanguageText {
  original: string;
  translated: string;
}

export interface MultilingualContentDto {
  destinationId: string;
  destinationName: DualLanguageText;
  state: DualLanguageText;
  sourceLanguage: string;
  requestedLanguage: string;
  isSupportedLocally: boolean;
  supportedLanguagesInDestination: {
    official: string | null;
    local: string | null;
    guide: string | null;
  };
  destinationDescription: DualLanguageText | null;
  attractions: Array<{
    id: string;
    name: DualLanguageText;
    category: DualLanguageText;
    description: DualLanguageText | null;
  }>;
  disclaimers: Array<{
    topic: string;
    original: string;
    translated: string;
  }>;
  translationProvider: string;
  matchQuality?: number;
  sources: ProvenanceSource[];
}

export interface DestinationContentSummaryDto {
  destinationId: string;
  destinationName: string;
  state: string;
  summary: string;
  sections: {
    overview: string;
    attractions: Array<{ name: string; category: string; description: string }>;
    experiences: Array<{ name: string; category: string }>;
    languages: { official: string | null; local: string | null; guide: string | null };
    accessibility: {
      wheelchairAccessibleCount: number;
      seniorFriendlyCount: number;
      notes: string[];
    };
    costs: {
      knownEntryFeeAttractionsCount: number;
      disclaimer: string;
    };
    safety: {
      nationalEmergency: string;
      womenHelpline: string;
      disclaimer: string;
    };
  };
  unknowns: string[];
  disclaimer: string;
  sources: ProvenanceSource[];
}
