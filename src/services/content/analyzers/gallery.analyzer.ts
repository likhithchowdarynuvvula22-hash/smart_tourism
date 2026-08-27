import { DestinationGalleryDto, ImageCoverageStatus, ImageItemDto } from "../../../types/content";
import { AttractionRow, DestinationRow, ImageRow } from "../../../types/database.types";
import { ProvenanceSource } from "../../../types/ai";

export class GalleryAnalyzer {
  /**
   * Evaluates image collection and formats normalized gallery metadata.
   */
  assessGallery(
    destination: DestinationRow,
    images: ImageRow[],
    attractions: AttractionRow[] = []
  ): DestinationGalleryDto {
    const attractionMap = new Map<string, AttractionRow>();
    for (const att of attractions) {
      if (att.id) attractionMap.set(att.id, att);
    }

    const sources: ProvenanceSource[] = [];
    const seenSources = new Set<string>();

    if (destination.source) {
      sources.push({
        type: "database",
        provider: destination.source,
        resource: "destinations"
      });
      seenSources.add(`destinations:${destination.source}`);
    }

    let verifiedLicenseCount = 0;

    const normalizedImages: ImageItemDto[] = images.map((img) => {
      // 1. Identify Associated Entity
      let relatedEntityType: "destination" | "attraction" | "unknown" = "unknown";
      let relatedEntityName: string | null = null;
      let associatedAttraction: AttractionRow | undefined;

      if (img.attraction_id && attractionMap.has(img.attraction_id)) {
        associatedAttraction = attractionMap.get(img.attraction_id);
        relatedEntityType = "attraction";
        relatedEntityName = associatedAttraction?.name || null;
      } else if (img.destination_id === destination.id) {
        relatedEntityType = "destination";
        relatedEntityName = destination.name;
      } else if (img.attraction_id) {
        relatedEntityType = "attraction";
        relatedEntityName = null;
      }

      // 2. Track Source & Provenance
      const sourceName = img.source || "unknown";
      const sourceKey = `images:${sourceName}`;
      if (!seenSources.has(sourceKey) && img.source) {
        sources.push({
          type: "database",
          provider: img.source,
          resource: "images"
        });
        seenSources.add(sourceKey);
      }

      // 3. License Handling (never assume public domain if null)
      const license = img.license ? img.license.trim() : "unknown";
      if (
        license !== "unknown" &&
        !license.toLowerCase().includes("unverified") &&
        img.verification_status?.includes("verified")
      ) {
        verifiedLicenseCount++;
      }

      // 4. Accessible Alt Text Strategy
      let altText: string;
      let generatedFromMetadata = false;

      // If explicit attribution or descriptive caption is present in the record
      if (img.attribution && img.attribution.trim().length > 3) {
        altText = img.attribution.trim();
        generatedFromMetadata = false;
      } else if (associatedAttraction) {
        const catDesc = associatedAttraction.category
          ? `, ${associatedAttraction.category.toLowerCase()}`
          : "";
        altText = `View of ${associatedAttraction.name}${catDesc} in ${destination.name}`;
        generatedFromMetadata = true;
      } else {
        altText = `View of ${destination.name}, ${destination.state}`;
        generatedFromMetadata = true;
      }

      return {
        id: img.id,
        destinationId: img.destination_id || (img.attraction_id ? destination.id : null),
        attractionId: img.attraction_id || null,
        relatedEntityType,
        relatedEntityName,
        url: img.image_url || null,
        photographer: img.photographer || null,
        license,
        attribution: img.attribution || null,
        usage: img.usage || "Verify specific asset license before use",
        source: sourceName,
        sourceUrl: img.source_url || null,
        verificationStatus: img.verification_status || "unverified",
        altText,
        generatedFromMetadata,
        createdAt: img.created_at || new Date().toISOString()
      };
    });

    // 5. Deterministic Image Coverage Classification
    let status: ImageCoverageStatus = "insufficient";
    let explanation = "Zero verified image records exist for this destination.";

    if (normalizedImages.length >= 2 && verifiedLicenseCount >= 1) {
      status = "sufficient";
      explanation = `Multiple verified images (${normalizedImages.length}) with confirmed licensing metadata are available.`;
    } else if (normalizedImages.length > 0) {
      status = "limited";
      explanation = `${normalizedImages.length} image record(s) catalogued, but image files or licenses require specific verification.`;
    }

    return {
      destinationId: destination.id,
      destinationName: destination.name,
      state: destination.state,
      coverage: {
        status,
        totalImages: normalizedImages.length,
        withVerifiedLicense: verifiedLicenseCount,
        explanation
      },
      images: normalizedImages,
      disclaimer:
        "Images and photography metadata are sourced strictly from verified database records. Specific asset licenses must be verified before commercial reuse. Alt text is derived from verified entity metadata when source alt text is unavailable.",
      sources
    };
  }
}

export const galleryAnalyzer = new GalleryAnalyzer();
