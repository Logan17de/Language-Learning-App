type JsonSchema = Record<string, unknown>;

const stringArray = (minItems = 0, maxItems = 100): JsonSchema => ({
  type: "array",
  minItems,
  maxItems,
  items: { type: "string" },
});

const inspectableTermSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["libraryId", "surface", "reading", "meaning", "scriptType"],
  properties: {
    libraryId: { type: "string" },
    surface: { type: "string" },
    reading: { type: "string" },
    meaning: { type: "string" },
    scriptType: { type: "string", enum: ["kanji", "hiragana", "katakana"] },
  },
};

const exerciseSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "difficulty", "format", "targetIds", "questionContent", "answerData"],
  properties: {
    id: { type: "string" },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
    format: {
      type: "string",
      enum: [
        "multiple_choice",
        "fill_blank",
        "sentence_order",
        "error_correction",
        "translation",
        "sentence_creation",
        "context_selection",
      ],
    },
    targetIds: stringArray(1, 5),
    questionContent: {
      type: "object",
      additionalProperties: false,
      required: [
        "instruction",
        "japanese",
        "englishPrompt",
        "choices",
        "hintFront",
        "hintBack",
        "inspectableTerms",
      ],
      properties: {
        instruction: { type: "string" },
        japanese: { type: "string" },
        englishPrompt: { type: "string" },
        choices: stringArray(0, 8),
        hintFront: { type: "string" },
        hintBack: { type: "string" },
        inspectableTerms: {
          type: "array",
          minItems: 0,
          maxItems: 12,
          items: inspectableTermSchema,
        },
      },
    },
    answerData: {
      type: "object",
      additionalProperties: false,
      required: ["correctAnswer", "acceptedAnswers", "explanation", "semanticCriteria"],
      properties: {
        correctAnswer: { type: "string" },
        acceptedAnswers: stringArray(1, 8),
        explanation: { type: "string" },
        semanticCriteria: stringArray(1, 8),
      },
    },
  },
};

export const blueprintSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "japaneseTitle",
    "summary",
    "setting",
    "characters",
    "storySummary",
    "learningObjectives",
    "coreVocabularyIds",
  ],
  properties: {
    title: { type: "string" },
    japaneseTitle: { type: "string" },
    summary: { type: "string" },
    setting: { type: "string" },
    characters: stringArray(2, 4),
    storySummary: { type: "string" },
    learningObjectives: stringArray(4, 7),
    coreVocabularyIds: stringArray(10, 18),
  },
};

export const storySchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["preview", "lines"],
  properties: {
    preview: { type: "string" },
    lines: {
      type: "array",
      minItems: 20,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "paragraph", "japanese", "english", "inspectableTerms"],
        properties: {
          id: { type: "string" },
          paragraph: { type: "integer", minimum: 1, maximum: 6 },
          japanese: { type: "string" },
          english: { type: "string" },
          inspectableTerms: {
            type: "array",
            minItems: 0,
            maxItems: 12,
            items: inspectableTermSchema,
          },
        },
      },
    },
  },
};

function exerciseSectionSchema(count: number): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["exercises"],
    properties: {
      exercises: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: exerciseSchema,
      },
    },
  };
}

export const vocabularySchema = exerciseSectionSchema(20);
export const grammarSchema = exerciseSectionSchema(20);

export const readingSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "speaker", "japanese", "english", "inspectableTerms"],
        properties: {
          id: { type: "string" },
          speaker: { type: "string" },
          japanese: { type: "string" },
          english: { type: "string" },
          inspectableTerms: {
            type: "array",
            minItems: 0,
            maxItems: 12,
            items: inspectableTermSchema,
          },
        },
      },
    },
  },
};

export const listeningSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sets"],
  properties: {
    sets: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "difficulty", "title", "transcript", "transcriptTerms", "questions"],
        properties: {
          id: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          title: { type: "string" },
          transcript: { type: "string" },
          transcriptTerms: {
            type: "array",
            minItems: 0,
            maxItems: 20,
            items: inspectableTermSchema,
          },
          questions: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: exerciseSchema,
          },
        },
      },
    },
  },
};

export const speakingSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: {
    tasks: {
      type: "array",
      minItems: 9,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "difficulty",
          "prompt",
          "promptTerms",
          "modelAnswer",
          "expectedConcepts",
          "semanticCriteria",
        ],
        properties: {
          id: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          prompt: { type: "string" },
          promptTerms: {
            type: "array",
            minItems: 0,
            maxItems: 12,
            items: inspectableTermSchema,
          },
          modelAnswer: { type: "string" },
          expectedConcepts: stringArray(1, 8),
          semanticCriteria: stringArray(1, 8),
        },
      },
    },
  },
};

export const interactiveSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["turns"],
  properties: {
    turns: {
      type: "array",
      minItems: 8,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "difficulty",
          "aiPrompt",
          "promptTerms",
          "expectedConcepts",
          "exampleAnswers",
          "semanticCriteria",
        ],
        properties: {
          id: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          aiPrompt: { type: "string" },
          promptTerms: {
            type: "array",
            minItems: 0,
            maxItems: 12,
            items: inspectableTermSchema,
          },
          expectedConcepts: stringArray(1, 8),
          exampleAnswers: stringArray(2, 4),
          semanticCriteria: stringArray(1, 8),
        },
      },
    },
  },
};
