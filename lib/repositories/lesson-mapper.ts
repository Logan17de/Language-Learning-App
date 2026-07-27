import type { CanonicalLesson } from "@/lib/repositories/lesson-repository";
import type {
  GrammarQuestion,
  KanjiItem,
  LessonPackage,
  LessonPhase,
  StoryWord,
  VocabularyQuestion,
} from "@/types/lesson";
import type { Json } from "@/types/database";
import { fallbackStoryWords } from "@/lib/story-support";

const defaultPhases: LessonPhase[] = [
  {
    id: "story",
    label: "Story",
    description: "Meet today’s language in context",
  },
  {
    id: "vocabulary",
    label: "Words & kanji",
    description: "Build fast recognition",
  },
  {
    id: "grammar",
    label: "Grammar",
    description: "Understand useful patterns",
  },
  {
    id: "reading",
    label: "Read aloud",
    description: "Practice rhythm and recognition",
  },
  {
    id: "listening",
    label: "Listening",
    description: "Listen for meaning",
  },
  {
    id: "speaking",
    label: "Speaking",
    description: "Produce natural Japanese",
  },
  {
    id: "review",
    label: "Final review",
    description: "Retrieve without hints",
  },
];

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function phases(value: CanonicalLesson["version"]["phases"]): LessonPhase[] {
  if (!Array.isArray(value) || value.length !== 7) return defaultPhases;
  const parsed = value.flatMap((item) => {
    if (!record(item)) return [];
    const id = item.id;
    const label = item.label;
    const description = item.description;
    if (
      !defaultPhases.some((phase) => phase.id === id) ||
      typeof label !== "string" ||
      typeof description !== "string"
    ) {
      return [];
    }
    return [{ id, label, description } as LessonPhase];
  });
  return parsed.length === 7 ? parsed : defaultPhases;
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

function choices(correct: string, pool: string[]): string[] {
  const result = [
    correct,
    ...pool.filter((item) => item && item !== correct),
  ].filter((item, index, all) => all.indexOf(item) === index);
  while (result.length < 4) result.push(`Other answer ${result.length}`);
  return result.slice(0, 4);
}

function fallbackVocabularyQuestions(
  vocabulary: LessonPackage["vocabulary"],
): VocabularyQuestion[] {
  if (!vocabulary.length) return [];
  const readings = vocabulary.map((item) => item.reading);
  const meanings = vocabulary.map((item) => item.meaning);
  return Array.from({ length: 10 }, (_, index) => {
    const item = vocabulary[index % vocabulary.length];
    const reading = index % 2 === 0;
    return {
      id: `fallback-vocabulary-${index}-${item.term}`,
      mode: reading ? "kanji-reading" : "reading-meaning",
      modeLabel: reading ? "Word → Reading" : "Reading → Meaning",
      difficulty: index < 3 ? "Easy" : index < 7 ? "Medium" : "Hard",
      prompt: reading
        ? "Choose the correct reading."
        : "Choose the closest meaning.",
      cue: reading ? item.term : item.reading,
      choices: choices(
        reading ? item.reading : item.meaning,
        reading ? readings : meanings,
      ),
      correctAnswer: reading ? item.reading : item.meaning,
      acceptedAnswers: [reading ? item.reading : item.meaning],
      explanation: `${item.term}（${item.reading}）means ${item.meaning}.`,
      targetItemIds: item.libraryId ? [item.libraryId] : [],
      inspectableTerms: [],
    };
  });
}

function fallbackGrammarQuestions(
  grammar: LessonPackage["grammar"],
): GrammarQuestion[] {
  if (!grammar.length) return [];
  const meanings = grammar.map((item) => item.meaning);
  return Array.from({ length: 10 }, (_, index) => {
    const item = grammar[index % grammar.length];
    return {
      id: `fallback-grammar-${index}-${item.id}`,
      type: "multiple-choice",
      skill: "understanding",
      difficulty: index < 3 ? "Easy" : index < 7 ? "Medium" : "Hard",
      answerMode: "choice",
      prompt: "Choose the meaning of this grammar pattern.",
      cue: item.pattern,
      choices: choices(item.meaning, meanings),
      correctAnswer: item.meaning,
      acceptedAnswers: [item.meaning],
      explanation: `${item.pattern} means ${item.meaning}.`,
      hintFront: item.structure,
      hintBack: item.example,
      targetItemIds: item.libraryId ? [item.libraryId] : [],
      inspectableTerms: [],
    };
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
  const storedKanji = metadataKanji(value.version.metadata);
  const kanji =
    storedKanji.length > 0
      ? storedKanji
      : value.vocabulary
          .filter((item) => /\p{Script=Han}/u.test(item.written_form))
          .slice(0, 5)
          .map((item) => ({
            character: item.written_form,
            reading: item.reading,
            meaning: item.meaning,
          }));

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
    vocabularyQuestions:
      practice.vocabulary.length > 0
        ? practice.vocabulary
        : fallbackVocabularyQuestions(vocabulary),
    grammarQuestions:
      practice.grammar.length > 0
        ? practice.grammar
        : fallbackGrammarQuestions(grammar),
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
      const words =
        storedWords.length > 0
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
      targetItemIds: item.target_item_ids,
      inspectableTerms: inspectableTerms(item.inspectable_terms),
    })),
    speakingExercises: value.speaking.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      modelAnswer: item.model_answer,
      mode:
        item.mode === "easy" || item.mode === "hard" ? item.mode : "medium",
      easyPrompt: item.easy_prompt ?? undefined,
      mediumPrompt: item.medium_prompt ?? undefined,
      hardPrompt: item.hard_prompt ?? undefined,
      expectedAnswer: item.expected_answer ?? undefined,
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
    phases: phases(value.version.phases),
  };
  return result;
}
