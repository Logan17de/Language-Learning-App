import type { CanonicalLesson } from "@/lib/repositories/lesson-repository";
import type {
  GrammarQuestion,
  KanjiItem,
  LessonPackage,
  StoryWord,
  VocabularyQuestion,
} from "@/types/lesson";
import type { Json } from "@/types/database";
import { normalizeLessonPhases } from "@/lib/lesson-contract";

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function metadataText(metadata: Json, key: string): string | undefined {
  return record(metadata) && typeof metadata[key] === "string"
    ? metadata[key]
    : undefined;
}

function metadataNumber(metadata: Json, key: string): number | undefined {
  return record(metadata) && typeof metadata[key] === "number"
    ? metadata[key]
    : undefined;
}

function metadataTags(metadata: Json): string[] | undefined {
  if (!record(metadata) || !Array.isArray(metadata.tags)) return undefined;
  return metadata.tags.filter(
    (tag): tag is string => typeof tag === "string",
  );
}

function metadataKanji(metadata: Json): KanjiItem[] {
  if (!record(metadata) || !Array.isArray(metadata.targetKanji)) return [];
  return metadata.targetKanji.flatMap((item) => {
    if (
      !record(item) ||
      typeof item.libraryId !== "string" ||
      typeof item.character !== "string" ||
      typeof item.reading !== "string" ||
      typeof item.meaning !== "string"
    ) {
      return [];
    }
    return [
      {
        libraryId: item.libraryId,
        character: item.character,
        reading: item.reading,
        meaning: item.meaning,
      },
    ];
  });
}

function inspectableTerms(value: Json | undefined): StoryWord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (
      !record(item) ||
      typeof item.libraryId !== "string" ||
      typeof item.surface !== "string" ||
      typeof item.reading !== "string" ||
      typeof item.meaning !== "string"
    ) {
      return [];
    }
    const scriptType =
      item.scriptType === "kanji" ||
      item.scriptType === "katakana" ||
      item.scriptType === "hiragana"
        ? item.scriptType
        : "hiragana";
    const libraryType =
      item.libraryType === "kanji" || item.libraryType === "vocabulary"
        ? item.libraryType
        : undefined;
    return [
      {
        id: `term:${item.libraryId}:${index}`,
        libraryId: item.libraryId,
        libraryType,
        position: index + 1,
        surface: item.surface,
        reading: item.reading,
        meaning: item.meaning,
        scriptType,
        baseMeaningScore: 100,
        baseRecognitionScore: 100,
        basePronunciationScore: 100,
      },
    ];
  });
}

function vocabularyMode(
  value: string,
): VocabularyQuestion["mode"] {
  return value === "kanji-reading" ||
    value === "reading-meaning" ||
    value === "meaning-japanese"
    ? value
    : "mixed";
}

function modeLabel(mode: VocabularyQuestion["mode"]): string {
  const labels: Record<VocabularyQuestion["mode"], string> = {
    "kanji-reading": "Word → Reading",
    "reading-meaning": "Reading → Meaning",
    "meaning-japanese": "Meaning → Japanese",
    mixed: "In context",
  };
  return labels[mode];
}

function practiceQuestions(
  value: CanonicalLesson["practice"],
): {
  vocabulary: VocabularyQuestion[];
  grammar: GrammarQuestion[];
} {
  const vocabulary = value
    .filter((item) => item.phase === "vocabulary")
    .map((item) => {
      const mode = vocabularyMode(item.mode);
      return {
        id: item.id,
        mode,
        modeLabel: modeLabel(mode),
        difficulty: item.difficulty,
        prompt: item.prompt,
        cue: item.cue,
        choices: item.choices,
        correctAnswer: item.correct_answer,
        acceptedAnswers: item.accepted_answers,
        explanation: item.explanation,
        targetItemIds: item.target_item_ids,
        inspectableTerms: inspectableTerms(item.inspectable_terms),
      };
    });
  const grammar = value
    .filter((item) => item.phase === "grammar")
    .map((item) => ({
      id: item.id,
      type:
        item.activity_type === "text_input"
          ? ("natural-sentence" as const)
          : item.activity_type === "word_order"
            ? ("sentence-order" as const)
            : ("multiple-choice" as const),
      skill: item.skill,
      difficulty: item.difficulty,
      answerMode:
        item.activity_type === "text_input"
          ? ("text" as const)
          : ("choice" as const),
      prompt: item.prompt,
      cue: item.cue,
      choices: item.choices,
      correctAnswer: item.correct_answer,
      acceptedAnswers: item.accepted_answers,
      explanation: item.explanation,
      hintFront: item.hint_front,
      hintBack: item.hint_back,
      targetItemIds: item.target_item_ids,
      inspectableTerms: inspectableTerms(item.inspectable_terms),
    }));
  return { vocabulary, grammar };
}

export function mapCanonicalLesson(value: CanonicalLesson): LessonPackage {
  const lesson = value.lesson;
  const versionStatus = value.version.status;
  const sourceStatus = versionStatus === "draft" ? "draft" : lesson.status;
  const status =
    sourceStatus === "approved" ||
    sourceStatus === "published" ||
    sourceStatus === "rejected" ||
    sourceStatus === "archived"
      ? sourceStatus
      : "draft";
  const vocabulary = value.vocabulary.map((item) => ({
    libraryId: item.vocabulary_id ?? undefined,
    term: item.written_form,
    reading: item.reading,
    meaning: item.meaning,
    partOfSpeech: item.part_of_speech,
    exampleSentence: item.example_sentence ?? undefined,
  }));
  const grammar = value.grammar.map((item) => ({
    id: item.id,
    libraryId: item.grammar_id ?? undefined,
    pattern: item.pattern,
    meaning: item.meaning,
    structure: item.structure,
    usage: item.usage_notes,
    example: item.example,
    translation: item.translation,
    commonMistake: item.common_mistake,
  }));
  const practice = practiceQuestions(value.practice);
  const kanji = metadataKanji(value.version.metadata);

  const result: LessonPackage = {
    id: lesson.legacy_id ?? lesson.id,
    title: metadataText(value.version.metadata, "title") ?? lesson.title,
    japaneseTitle:
      metadataText(value.version.metadata, "japaneseTitle") ??
      lesson.japanese_title,
    topic: metadataText(value.version.metadata, "topic") ?? lesson.topic,
    level:
      (metadataText(
        value.version.metadata,
        "level",
      ) as LessonPackage["level"] | undefined) ?? lesson.jlpt_level,
    durationMinutes:
      metadataNumber(value.version.metadata, "durationMinutes") ??
      lesson.duration_minutes,
    status,
    source:
      lesson.source === "generated"
        ? "generated"
        : lesson.source === "user_generated"
          ? "user_generated"
          : lesson.source === "community"
            ? "community"
            : "curated_seed",
    tags: metadataTags(value.version.metadata) ?? lesson.tags,
    summary:
      metadataText(value.version.metadata, "summary") ?? lesson.summary,
    storyPreview:
      metadataText(value.version.metadata, "storyPreview") ??
      value.story[0]?.japanese_text ??
      lesson.summary,
    grammar,
    kanji,
    vocabulary,
    // A missing practice region is malformed lesson data. Do not manufacture
    // learner-facing questions or distractors in the mapper.
    vocabularyQuestions: practice.vocabulary,
    grammarQuestions: practice.grammar,
    reviewItems: value.version.review_items,
    story: value.story.map((item) => {
      const words = value.storyWords
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
    readingTitle: metadataText(value.version.metadata, "readingTitle") || undefined,
    readingJapaneseTitle:
      metadataText(value.version.metadata, "readingJapaneseTitle") || undefined,
    readingConversation: value.reading.map((item) => ({
      speaker: item.speaker,
      japanese: item.japanese_text,
      english: item.translation,
      inspectableTerms: inspectableTerms(item.inspectable_terms),
      audioAssetId:
        "audio_asset_id" in item && typeof item.audio_asset_id === "string"
          ? item.audio_asset_id
          : undefined,
    })),
    readingQuestions: value.readingQuestions.map((item) => ({
      id: item.id,
      difficulty: item.difficulty,
      question: item.question,
      answer: item.answer,
    })),
    listeningExercises: value.listening.map((item, index) => {
      const conversationLines = Array.isArray(item.conversation_lines)
        ? item.conversation_lines
        : [];
      return {
        id: item.id,
        prompt: item.prompt,
        choices: item.choices,
        correctAnswer: item.correct_answer,
        explanation: item.explanation,
        transcript: item.transcript,
        conversationLines,
        audioAssetId: item.audio_asset_id ?? undefined,
        questionType: "multiple-choice" as const,
        targetItemIds: item.target_item_ids,
        inspectableTerms: inspectableTerms(item.inspectable_terms),
        difficulty:
          conversationLines.length > 0
            ? item.difficulty === "hard"
              ? ("Hard" as const)
              : item.difficulty === "easy"
                ? ("Easy" as const)
                : ("Medium" as const)
            : index === value.listening.length - 1
              ? ("Hard" as const)
              : index === 0
                ? ("Easy" as const)
                : ("Medium" as const),
      };
    }),
    speakingExercises: value.speaking.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      modelAnswer: item.model_answer,
      mode:
        item.mode === "easy" || item.mode === "hard" ? item.mode : "medium",
      questionType: item.question_type,
      expectedConcepts: Array.isArray(item.expected_concepts)
        ? item.expected_concepts
        : [],
      semanticCriteria: Array.isArray(item.semantic_criteria)
        ? item.semantic_criteria
        : [],
      easyPrompt: item.easy_prompt ?? undefined,
      mediumPrompt: item.medium_prompt ?? undefined,
      hardPrompt: item.hard_prompt ?? undefined,
      expectedAnswer: item.expected_answer ?? undefined,
      audioAssetId:
        "audio_asset_id" in item && typeof item.audio_asset_id === "string"
          ? item.audio_asset_id
          : undefined,
      targetItemIds: item.target_item_ids,
      inspectableTerms: inspectableTerms(item.inspectable_terms),
    })),
    reviewQuestions: value.review.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      choices: item.choices,
      correctAnswer: item.correct_answer,
      explanation: item.explanation,
      questionType:
        item.question_type === "ordering" ||
        item.question_type === "fill-blank" ||
        item.question_type === "true-false"
          ? item.question_type
          : "multiple-choice",
      category:
        item.category === "kanji" ||
        item.category === "vocabulary" ||
        item.category === "grammar" ||
        item.category === "listening" ||
        item.category === "speaking"
          ? item.category
          : "vocabulary",
      targetItemIds: item.target_item_ids,
    })),
    answerKeys: value.version.answer_keys,
    phases: normalizeLessonPhases(value.version.phases),
    runtimeAudio:
      metadataText(value.version.metadata, "runtimeAudio") === "browser_tts"
        ? "browser_tts"
        : "stored_or_api",
  };
  return result;
}
