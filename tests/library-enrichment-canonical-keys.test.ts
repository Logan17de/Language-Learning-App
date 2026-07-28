import { describe, expect, it } from "vitest";
import {
  mapLibraryEnrichment,
  type LibraryEnrichmentMappingRequest,
  type RawLibraryEnrichment,
} from "@/lib/gemini/library-enrichment-mapping";

describe("server-owned enrichment keys", () => {
  it("ignores injected kanji, grammar, and vocabulary identifiers", () => {
    const request: LibraryEnrichmentMappingRequest = {
      level: "N4",
      topic: "Fantasy",
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

    const output = {
      kanji: [
        {
          requestIndex: 0,
          character: "悪",
          meanings: ["magic"],
          readings: ["ま"],
          onyomi: ["マ"],
          kunyomi: [],
          exampleWords: ["魔法", "悪魔"],
          strokeCount: 21,
        },
      ],
      grammar: [
        {
          requestIndex: 0,
          pattern: "まだ～ていません",
          meaning: "not yet",
          formation: "まだ + て-form + いない",
          usageNotes: "Not completed yet.",
          nuance: "May happen later.",
          exampleSentences: ["まだ見ていない。", "まだ食べていない。"],
        },
      ],
      vocabulary: [
        {
          requestIndex: 0,
          writtenForm: "悪魔",
          reading: "あくま",
          meaning: "magic",
          partOfSpeech: "noun",
          tags: ["fantasy"],
          exampleSentence: "魔法を使います。",
          linkedKanjiCharacters: ["悪"],
        },
      ],
    } as unknown as RawLibraryEnrichment;

    const mapped = mapLibraryEnrichment(output, request);
    expect(mapped.kanji[0].character).toBe("魔");
    expect(mapped.grammar[0].pattern).toBe("まだ～ていない");
    expect(mapped.vocabulary[0].writtenForm).toBe("魔法");
    expect(mapped.vocabulary[0].reading).toBe("まほう");
    expect(mapped.vocabulary[0].linkedKanjiCharacters).toEqual(["魔"]);
  });
});
