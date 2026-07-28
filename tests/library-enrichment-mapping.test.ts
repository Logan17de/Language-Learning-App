import { describe, expect, it } from "vitest";
import {
  libraryEnrichmentIssues,
  linkedKanjiForWord,
  mapLibraryEnrichment,
  normalizeJapaneseLookup,
  type LibraryEnrichmentMappingRequest,
  type RawLibraryEnrichment,
} from "@/lib/gemini/library-enrichment-mapping";

function request(
  overrides: Partial<LibraryEnrichmentMappingRequest> = {},
): LibraryEnrichmentMappingRequest {
  return {
    level: "N4",
    topic: "A boy in an anime world",
    kanji: ["魔", "世"],
    allowedKanji: ["魔", "世", "界"],
    grammar: ["まだ～ていない", "～ながら"],
    vocabulary: [
      {
        writtenForm: "魔法",
        readingHint: "まほう",
        contextJapanese: "少年は魔法を使います。",
        contextEnglish: "The boy uses magic.",
      },
      {
        writtenForm: "世界",
        readingHint: "せかい",
        contextJapanese: "新しい世界です。",
        contextEnglish: "It is a new world.",
      },
    ],
    ...overrides,
  };
}

function output(): RawLibraryEnrichment {
  return {
    kanji: [
      {
        requestIndex: 0,
        meanings: ["magic"],
        readings: ["ま"],
        onyomi: ["マ"],
        kunyomi: [],
        exampleWords: ["魔法", "悪魔"],
        strokeCount: 21,
      },
      {
        requestIndex: 1,
        meanings: ["world", "generation"],
        readings: ["せ", "せい", "よ"],
        onyomi: ["セ", "セイ"],
        kunyomi: ["よ"],
        exampleWords: ["世界", "世代"],
        strokeCount: 5,
      },
    ],
    grammar: [
      {
        requestIndex: 0,
        meaning: "not yet",
        formation: "まだ + verb て-form + いない",
        usageNotes: "Describes an action not completed yet.",
        nuance: "The action may happen later.",
        exampleSentences: ["まだ食べていない。", "まだ見ていない。"],
      },
      {
        requestIndex: 1,
        meaning: "while doing",
        formation: "verb stem + ながら",
        usageNotes: "Two simultaneous actions by one subject.",
        nuance: "The second action is usually primary.",
        exampleSentences: ["歩きながら話す。", "音楽を聞きながら勉強する。"],
      },
    ],
    vocabulary: [
      {
        requestIndex: 0,
        reading: "wrong-model-reading",
        meaning: "magic",
        partOfSpeech: "noun",
        tags: ["fantasy"],
        exampleSentence: "魔法を使います。",
      },
      {
        requestIndex: 1,
        reading: "せかい",
        meaning: "world",
        partOfSpeech: "noun",
        tags: ["place"],
        exampleSentence: "世界は広いです。",
      },
    ],
  };
}

describe("deterministic library enrichment mapping", () => {
  it("maps kanji metadata to server-owned characters", () => {
    expect(mapLibraryEnrichment(output(), request()).kanji.map((item) => item.character)).toEqual(["魔", "世"]);
  });

  it("maps grammar metadata to exact server-owned patterns", () => {
    expect(mapLibraryEnrichment(output(), request()).grammar.map((item) => item.pattern)).toEqual(["まだ～ていない", "～ながら"]);
  });

  it("maps vocabulary metadata to exact server-owned words and readings", () => {
    const mapped = mapLibraryEnrichment(output(), request()).vocabulary;
    expect(mapped.map((item) => item.writtenForm)).toEqual(["魔法", "世界"]);
    expect(mapped.map((item) => item.reading)).toEqual(["まほう", "せかい"]);
  });

  it("supports reordered model output indexes", () => {
    const reordered = output();
    reordered.kanji.reverse();
    reordered.grammar.reverse();
    reordered.vocabulary.reverse();
    const mapped = mapLibraryEnrichment(reordered, request());
    expect(mapped.kanji[0].meanings).toEqual(["magic"]);
    expect(mapped.grammar[0].meaning).toBe("not yet");
    expect(mapped.vocabulary[0].meaning).toBe("magic");
  });

  it("rejects duplicate indexes", () => {
    const duplicate = output();
    duplicate.grammar[1].requestIndex = 0;
    expect(libraryEnrichmentIssues(duplicate, request()).join(" ")).toContain("duplicate indexes: 0");
  });

  it("rejects missing indexes", () => {
    const missing = output();
    missing.kanji = missing.kanji.slice(0, 1);
    expect(libraryEnrichmentIssues(missing, request()).join(" ")).toContain("missing indexes: 1");
  });

  it("rejects out-of-range indexes", () => {
    const invalid = output();
    invalid.vocabulary[1].requestIndex = 4;
    expect(libraryEnrichmentIssues(invalid, request()).join(" ")).toContain("out-of-range indexes: 4");
  });

  it("rejects extra entries", () => {
    const extra = output();
    extra.kanji.push({ ...extra.kanji[0], requestIndex: 2 });
    expect(libraryEnrichmentIssues(extra, request()).join(" ")).toContain("expected 2 entries but received 3");
  });

  it("normalizes wave-dash formatting without changing the stored grammar key", () => {
    expect(normalizeJapaneseLookup(" まだ〜ていない ")).toBe("まだ～ていない");
    const mapped = mapLibraryEnrichment(output(), request({ grammar: ["まだ〜ていない", "～ながら"] }));
    expect(mapped.grammar[0].pattern).toBe("まだ〜ていない");
  });

  it("does not allow a polite form to replace the catalog pattern", () => {
    const polite = output() as RawLibraryEnrichment & { grammar: Array<RawLibraryEnrichment["grammar"][number] & { pattern?: string }> };
    polite.grammar[0].pattern = "まだ～ていません";
    const mapped = mapLibraryEnrichment(polite, request());
    expect(mapped.grammar[0].pattern).toBe("まだ～ていない");
  });

  it("derives linked kanji only from allowed characters physically present in the word", () => {
    expect(linkedKanjiForWord("魔法世界", ["魔", "世", "界", "悪"])).toEqual(["魔", "世", "界"]);
  });

  it("handles empty request arrays", () => {
    const emptyRequest = request({ kanji: [], grammar: [], vocabulary: [] });
    const emptyOutput: RawLibraryEnrichment = { kanji: [], grammar: [], vocabulary: [] };
    expect(mapLibraryEnrichment(emptyOutput, emptyRequest)).toEqual({ kanji: [], grammar: [], vocabulary: [] });
  });

  it("maps mixed enrichment categories independently", () => {
    const mixedRequest = request({ grammar: [], vocabulary: [] });
    const mixedOutput = output();
    mixedOutput.grammar = [];
    mixedOutput.vocabulary = [];
    expect(mapLibraryEnrichment(mixedOutput, mixedRequest).kanji).toHaveLength(2);
  });
});
