import type { CanonicalLesson } from "@/lib/repositories/lesson-repository";
import type { LessonPackage, LessonPhase } from "@/types/lesson";
import type { Json } from "@/types/database";
import { fallbackStoryWords } from "@/lib/story-support";

const defaultPhases: LessonPhase[] = [
  { id: "story", label: "Story", description: "Meet today’s language in context" },
  { id: "vocabulary", label: "Words & kanji", description: "Build fast recognition" },
  { id: "grammar", label: "Grammar", description: "Understand useful patterns" },
  { id: "reading", label: "Read aloud", description: "Practice rhythm and recognition" },
  { id: "listening", label: "Listening", description: "Listen for meaning" },
  { id: "speaking", label: "Speaking", description: "Produce natural Japanese" },
  { id: "review", label: "Final review", description: "Retrieve without hints" },
];

function phases(value: CanonicalLesson["version"]["phases"]): LessonPhase[] {
  if (!Array.isArray(value) || value.length !== 7) return defaultPhases;
  const parsed = value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const id = item.id;
    const label = item.label;
    const description = item.description;
    if (!defaultPhases.some((phase) => phase.id === id) || typeof label !== "string" || typeof description !== "string") return [];
    return [{ id, label, description } as LessonPhase];
  });
  return parsed.length === 7 ? parsed : defaultPhases;
}

function metadataText(metadata: Json, key: string): string | undefined {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    && typeof metadata[key] === "string" ? metadata[key] : undefined;
}

function metadataNumber(metadata: Json, key: string): number | undefined {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    && typeof metadata[key] === "number" ? metadata[key] : undefined;
}

function metadataTags(metadata: Json): string[] | undefined {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata) || !Array.isArray(metadata.tags)) return undefined;
  return metadata.tags.filter((tag): tag is string => typeof tag === "string");
}

export function mapCanonicalLesson(value: CanonicalLesson): LessonPackage {
  const lesson = value.lesson;
  const versionStatus = value.version.status;
  const sourceStatus = versionStatus === "draft" ? "draft" : lesson.status;
  const status = sourceStatus === "approved" || sourceStatus === "published" || sourceStatus === "rejected" || sourceStatus === "archived"
    ? sourceStatus
    : "draft";
  const vocabulary = value.vocabulary.map((item) => ({
    term: item.written_form,
    reading: item.reading,
    meaning: item.meaning,
    partOfSpeech: item.part_of_speech,
    exampleSentence: item.example_sentence ?? undefined,
  }));
  return {
    id: lesson.legacy_id ?? lesson.id,
    title: metadataText(value.version.metadata, "title") ?? lesson.title,
    japaneseTitle: metadataText(value.version.metadata, "japaneseTitle") ?? lesson.japanese_title,
    topic: metadataText(value.version.metadata, "topic") ?? lesson.topic,
    level: (metadataText(value.version.metadata, "level") as LessonPackage["level"] | undefined) ?? lesson.jlpt_level,
    durationMinutes: metadataNumber(value.version.metadata, "durationMinutes") ?? lesson.duration_minutes,
    status,
    source: lesson.source === "generated" ? "generated" : lesson.source === "user_generated" ? "user_generated" : lesson.source === "community" ? "community" : "curated_seed",
    tags: metadataTags(value.version.metadata) ?? lesson.tags,
    summary: metadataText(value.version.metadata, "summary") ?? lesson.summary,
    storyPreview: metadataText(value.version.metadata, "storyPreview") ?? value.story[0]?.japanese_text ?? lesson.summary,
    grammar: value.grammar.map((item) => ({
      id: item.id,
      pattern: item.pattern,
      meaning: item.meaning,
      structure: item.structure,
      usage: item.usage_notes,
      example: item.example,
      translation: item.translation,
      commonMistake: item.common_mistake,
    })),
    kanji: value.vocabulary.filter((item) => /[\p{Script=Han}]/u.test(item.written_form)).map((item) => ({
      character: item.written_form,
      reading: item.reading,
      meaning: item.meaning,
    })),
    vocabulary,
    reviewItems: value.version.review_items,
    story: value.story.map((item) => {
      const storedWords = value.storyWords
        .filter((word) => word.story_line_id === item.id)
        .sort((left, right) => left.position - right.position)
        .map((word) => ({
          id: word.id,
          libraryId: word.library_id ?? undefined,
          libraryType: word.library_type ?? undefined,
          position: word.position,
          surface: word.surface,
          reading: word.reading,
          meaning: word.meaning,
          scriptType: word.script_type,
          baseMeaningScore: word.meaning_score,
          baseRecognitionScore: word.recognition_score,
          basePronunciationScore: word.pronunciation_score,
        }));
      const words = storedWords.length
        ? storedWords
        : fallbackStoryWords(
            item.id,
            item.japanese_text,
            item.tappable_terms,
            vocabulary,
          );
      return {
        id: item.id,
        japanese: item.japanese_text,
        english: item.translation,
        tappableTerms: words.map((word) => word.surface),
        words,
        imageId: item.image_asset_id ?? undefined,
        audioAssetId: item.audio_asset_id ?? undefined,
      };
    }),
    images: [],
    readingConversation: value.reading.map((item) => ({
      speaker: item.speaker,
      japanese: item.japanese_text,
      english: item.translation,
    })),
    listeningExercises: value.listening.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      choices: item.choices,
      correctAnswer: item.correct_answer,
      explanation: item.explanation,
      transcript: item.transcript,
      audioAssetId: item.audio_asset_id ?? undefined,
      questionType: "multiple-choice",
    })),
    speakingExercises: value.speaking.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      modelAnswer: item.model_answer,
      mode: item.mode === "easy" || item.mode === "hard" ? item.mode : "medium",
      easyPrompt: item.easy_prompt ?? undefined,
      mediumPrompt: item.medium_prompt ?? undefined,
      hardPrompt: item.hard_prompt ?? undefined,
      expectedAnswer: item.expected_answer ?? undefined,
    })),
    reviewQuestions: value.review.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      choices: item.choices,
      correctAnswer: item.correct_answer,
      explanation: item.explanation,
      questionType: item.question_type === "ordering" || item.question_type === "fill-blank" || item.question_type === "true-false" ? item.question_type : "multiple-choice",
    })),
    answerKeys: value.version.answer_keys,
    phases: phases(value.version.phases),
  };
}
