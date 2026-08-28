import { describe, it, expect } from "vitest";
import { translationService } from "../src/services/external/translation/translation.service";

interface ServiceWithPrivateMethods {
  normalizeLanguage(lang: string, fieldName: string): string;
}

describe("Translation Service Language Aliases & Normalization Suite", () => {
  const service = translationService as unknown as ServiceWithPrivateMethods;

  it("should correctly resolve standard English language names to ISO codes", () => {
    const code = service.normalizeLanguage("Telugu", "Target");
    expect(code).toBe("te");
  });

  it("should correctly resolve native Indic script names to ISO codes", () => {
    const codeTel = service.normalizeLanguage("తెలుగు", "Target");
    const codeHin = service.normalizeLanguage("हिन्दी", "Target");
    const codeTam = service.normalizeLanguage("தமிழ்", "Target");

    expect(codeTel).toBe("te");
    expect(codeHin).toBe("hi");
    expect(codeTam).toBe("ta");
  });

  it("should correctly resolve common spelling variations to ISO codes", () => {
    const codeTel = service.normalizeLanguage("telgu", "Target");
    const codeTam = service.normalizeLanguage("tamizh", "Target");
    const codeBen = service.normalizeLanguage("bangla", "Target");

    expect(codeTel).toBe("te");
    expect(codeTam).toBe("ta");
    expect(codeBen).toBe("bn");
  });
});
