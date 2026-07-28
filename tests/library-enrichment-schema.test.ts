import { describe, expect, it } from "vitest";
import {
  libraryEnrichmentSchema,
  type LibraryEnrichmentMappingRequest,
} from "@/lib/gemini/library-enrichment-mapping";

const request: LibraryEnrichmentMappingRequest = {
  level: "N4",
  topic: "A boy in an anime world",
  kanji: ["魔"],
  allowedKanji: ["魔"],
  grammar: ["まだ～ていない"],
  vocabulary: [
    {
      writtenForm: "魔法",
      readingHint: "まほう",
      contextJapanese: "魔法を使います。",
      contextEnglish: "He uses magic.",
    },
  ],
};

describe("library enrichment structured-output schema", () => {
  it("allows only request indexes and descriptive metadata", () => {
    const schema = libraryEnrichmentSchema(request) as {
      properties: Record<
        string,
        { items: { properties: Record<string, unknown> } }
      >;
    };

    const kanji = schema.properties.kanji.items.properties;
    const grammar = schema.properties.grammar.items.properties;
    const vocabulary = schema.properties.vocabulary.items.properties;

    expect(kanji).toHaveProperty("requestIndex");
    expect(kanji).not.toHaveProperty("character");
    expect(grammar).toHaveProperty("requestIndex");
    expect(grammar).not.toHaveProperty("pattern");
    expect(vocabulary).toHaveProperty("requestIndex");
    expect(vocabulary).not.toHaveProperty("writtenForm");
    expect(vocabulary).not.toHaveProperty("linkedKanjiCharacters");
  });
});
