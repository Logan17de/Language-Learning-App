import type { JsonSchema } from "@/lib/openai/structured-output";
import { storyGenerationSchema } from "@/lib/gemini/story-generation-contract";

export interface RawReadingPassage {
  selected_interest: string;
  japanese_title: string;
  english_title: string;
  japanese_story: string;
  english_translation: string;
}

export interface RawReadingQuestion {
  difficulty: "easy" | "medium" | "hard";
  question: string;
  answer: string;
}

export interface RawReadingQuestions {
  questions: RawReadingQuestion[];
}

export const readingPassageSchema = storyGenerationSchema;

export const readingQuestionsSchema: JsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard"],
          },
          question: { type: "string" },
          answer: { type: "string" },
        },
        required: ["difficulty", "question", "answer"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

export function readingPassagePrompt(input: {
  languageLevel: string;
  topic: string;
  naturalInterests: string[];
  targetGrammar: string[];
  targetKanji: string[];
}): string {
  const interestText = input.naturalInterests.length > 0
    ? input.naturalInterests.join(", ")
    : "No learner interests were provided.";
  const grammarText = input.targetGrammar.length > 0
    ? input.targetGrammar.join(", ")
    : "No target grammar was provided.";
  const kanjiText = input.targetKanji.length > 0
    ? input.targetKanji.join(", ")
    : "No target kanji was provided.";

  return `
Generate a Japanese language-learning story for reading.

Learner requirements:
- Language level: ${input.languageLevel}
- Story topic: ${input.topic}
- Available learner interests: ${interestText}
- Target grammar: ${grammarText}
- Target kanji: ${kanjiText}

Story requirements:
- The story must primarily focus on the given topic.
- Write one coherent story containing 10–15 natural Japanese sentences.
- Return the Japanese story as one continuous string, not an array.
- Select exactly one learner interest that fits the story naturally.
- When no provided interest fits naturally, choose a suitable interest
  yourself.
- When no learner interests are provided, choose a suitable interest
  yourself.
- Do not force an interest into the story.
- Naturally use every provided target grammar pattern at least once.
- Naturally use every provided target kanji at least once.
- Keep all other vocabulary and grammar appropriate for ${input.languageLevel}.
- Make the story engaging, educational, and easy to follow.
- Keep romantic interactions respectful and age-appropriate.
- Use Japanese quotation marks 「」 only for direct speech.
- Do not place narration inside Japanese quotation marks.
- Provide an accurate English translation of the complete story.
- Return the English translation as one continuous string, not an array.
`;
}

export function readingQuestionsPrompt(input: {
  languageLevel: string;
  japaneseStory: string;
}): string {
  return `
Create reading-comprehension questions from the following Japanese story.

Language level: ${input.languageLevel}

Story:
${input.japaneseStory}

Requirements:
- Create exactly 5 questions: 2 easy, 2 medium, and 1 hard.
- Base every question only on the story.
- Write essay-style questions in Japanese.
- Require answers in short, complete Japanese sentences.
- Include direct-detail, sequence, reason, and simple inference questions.
- Keep the questions appropriate for ${input.languageLevel}.
- Do not create questions that cannot be answered from the story.
- Do not copy full sentences from the story as answers unless necessary.
- Easy questions must have answers stated directly in the story.
- Medium questions must combine information from two or more story sentences.
- Hard questions must require a simple inference supported by the story.
- Return only the required JSON.
`;
}
