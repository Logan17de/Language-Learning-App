import type { LessonPackage } from "@/types/lesson";
import type {
  LessonPhaseId,
  LessonSession,
} from "@/types/lesson-session";
import type { Json } from "@/types/database";

type MasteryItemType = "kanji" | "vocabulary" | "grammar";
type MasteryDimension = "meaning" | "recognition" | "pronunciation";
type MasterySignal =
  | "exposure"
  | "revealed_reading"
  | "revealed_meaning"
  | "correct"
  | "incorrect"
  | "pronunciation_correct"
  | "pronunciation_incorrect";

function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function masteryItemType(
  lesson: LessonPackage,
  itemKey: string,
): MasteryItemType | null {
  if (lesson.kanji.some((item) => item.libraryId === itemKey)) return "kanji";
  if (lesson.vocabulary.some((item) => item.libraryId === itemKey)) {
    return "vocabulary";
  }
  if (lesson.grammar.some((item) => item.libraryId === itemKey)) return "grammar";
  return null;
}

function activityPhase(
  lesson: LessonPackage,
  activityId: string,
): LessonPhaseId | null {
  if (lesson.story.some((item) => item.id === activityId)) return "story";
  if (lesson.vocabularyQuestions.some((item) => item.id === activityId)) {
    return "vocabulary";
  }
  if (lesson.grammarQuestions.some((item) => item.id === activityId)) {
    return "grammar";
  }
  if (
    activityId.startsWith("reading-passage:") ||
    (lesson.readingQuestions ?? []).some((item) => item.id === activityId)
  ) {
    return "reading";
  }
  if (lesson.listeningExercises.some((item) => item.id === activityId)) {
    return "listening";
  }
  if (lesson.speakingExercises.some((item) => item.id === activityId)) {
    return "speaking";
  }
  return null;
}

/**
 * Temporary rollout-only compatibility for a frontend promoted before the
 * phase-atomic DB migration exists. Once commit_lesson_phase() is present this
 * builder is never used; canonical DB evidence remains authoritative.
 */
export function buildLegacyMasteryEvidence(
  lesson: LessonPackage,
  session: LessonSession,
  phaseId: LessonPhaseId,
): Json[] {
  const result: Json[] = [];
  const add = (input: {
    clientEventId: string;
    itemKey: string;
    dimension: MasteryDimension;
    signal: MasterySignal;
    data?: Record<string, unknown>;
  }) => {
    const itemType = masteryItemType(lesson, input.itemKey);
    if (!itemType) return;
    result.push(
      json({
        clientEventId: input.clientEventId,
        itemType,
        itemKey: input.itemKey,
        dimension: input.dimension,
        signal: input.signal,
        data: input.data ?? {},
      }),
    );
  };

  const inspectableWords = [
    ...lesson.vocabularyQuestions.flatMap((item) => item.inspectableTerms),
    ...lesson.grammarQuestions.flatMap((item) => item.inspectableTerms),
    ...lesson.readingConversation.flatMap(
      (item) => item.inspectableTerms ?? [],
    ),
    ...lesson.listeningExercises.flatMap(
      (item) => item.inspectableTerms ?? [],
    ),
    ...lesson.speakingExercises.flatMap(
      (item) => item.inspectableTerms ?? [],
    ),
  ];

  for (const interaction of session.storyInteractions) {
    if (
      interaction.type !== "reading-revealed" &&
      interaction.type !== "meaning-revealed"
    ) {
      continue;
    }
    if (activityPhase(lesson, interaction.lineId) !== phaseId) continue;
    const line = lesson.story.find((item) => item.id === interaction.lineId);
    const word =
      line?.words.find((item) => item.id === interaction.wordId) ??
      line?.words.find((item) => item.surface === interaction.term) ??
      inspectableWords.find(
        (item) =>
          item.id === interaction.wordId ||
          item.libraryId === interaction.wordId ||
          item.surface === interaction.term,
      );
    if (!word?.libraryId) continue;

    if (interaction.type === "reading-revealed") {
      add({
        clientEventId: `story:${interaction.id}:recognition`,
        itemKey: word.libraryId,
        dimension: "recognition",
        signal: "revealed_reading",
        data: { surface: word.surface },
      });
    } else {
      add({
        clientEventId: `story:${interaction.id}:meaning`,
        itemKey: word.libraryId,
        dimension: "meaning",
        signal: "revealed_meaning",
        data: { surface: word.surface },
      });
      if (word.scriptType !== "kanji") {
        add({
          clientEventId: `story:${interaction.id}:recognition`,
          itemKey: word.libraryId,
          dimension: "recognition",
          signal: "revealed_meaning",
          data: { surface: word.surface },
        });
      }
    }
  }

  const usedHelpForKanji = (activityId: string, character: string) =>
    session.storyInteractions.some(
      (interaction) =>
        interaction.lineId === activityId &&
        (interaction.type === "reading-revealed" ||
          interaction.type === "meaning-revealed") &&
        interaction.term?.includes(character) === true,
    );

  const addUnassistedKanji = (
    activityId: string,
    visibleText: string,
    data: Record<string, unknown>,
  ) => {
    for (const item of lesson.kanji) {
      if (
        !item.libraryId ||
        !visibleText.includes(item.character) ||
        usedHelpForKanji(activityId, item.character)
      ) {
        continue;
      }
      add({
        clientEventId: `${phaseId}:${activityId}:${item.libraryId}:unassisted`,
        itemKey: item.libraryId,
        dimension: "recognition",
        signal: "exposure",
        data: {
          ...data,
          character: item.character,
          answeredWithoutHelp: true,
        },
      });
    }
  };

  for (const answer of
    phaseId === "vocabulary" ? session.vocabularyAnswers : []) {
    const question = lesson.vocabularyQuestions.find(
      (item) => item.id === answer.questionId,
    );
    if (!question) continue;
    const dimension: MasteryDimension =
      question.mode === "reading-meaning" ? "meaning" : "recognition";
    for (const itemKey of question.targetItemIds) {
      add({
        clientEventId: `vocabulary:${answer.questionId}:${itemKey}`,
        itemKey,
        dimension,
        signal: answer.correct ? "correct" : "incorrect",
        data: { selectedAnswer: answer.selectedAnswer, mode: question.mode },
      });
    }
    addUnassistedKanji(
      question.id,
      [question.prompt, question.cue, ...question.choices].join("\n"),
      { answeredCorrectly: answer.correct, source: "vocabulary" },
    );
  }

  for (const answer of phaseId === "grammar" ? session.grammarAnswers : []) {
    const question = lesson.grammarQuestions.find(
      (item) => item.id === answer.questionId,
    );
    if (!question) continue;
    for (const itemKey of question.targetItemIds) {
      add({
        clientEventId: `grammar:${answer.questionId}:${itemKey}`,
        itemKey,
        dimension: "meaning",
        signal: answer.correct ? "correct" : "incorrect",
        data: { selectedAnswer: answer.selectedAnswer, skill: answer.skill },
      });
    }
    addUnassistedKanji(
      question.id,
      [
        question.prompt,
        question.cue,
        question.hintFront,
        ...question.choices,
      ].join("\n"),
      { answeredCorrectly: answer.correct, source: "grammar" },
    );
  }

  for (const answer of phaseId === "reading" ? session.readingAnswers : []) {
    const question = (lesson.readingQuestions ?? []).find(
      (item) => item.id === answer.questionId,
    );
    if (!question) continue;
    addUnassistedKanji(question.id, question.question, { source: "reading" });
  }

  for (const event of
    phaseId === "listening" ? session.listeningEvents : []) {
    if (event.type !== "answer" || !event.questionId) continue;
    const exercise = lesson.listeningExercises.find(
      (item) => item.id === event.questionId,
    );
    if (!exercise) continue;
    addUnassistedKanji(
      exercise.id,
      [exercise.prompt, ...exercise.choices].join("\n"),
      { answeredCorrectly: event.correct === true, source: "listening" },
    );
  }

  for (const event of phaseId === "speaking" ? session.speakingEvents : []) {
    if (!event.evaluationAvailable) continue;
    const exercise = lesson.speakingExercises.find(
      (item) => item.id === event.exerciseId,
    );
    if (!exercise) continue;
    const score = Math.max(
      event.pronunciationConfidence,
      event.grammarAccuracy,
    );
    for (const itemKey of exercise.targetItemIds ?? []) {
      add({
        clientEventId: `speaking:${event.id}:${itemKey}`,
        itemKey,
        dimension: "pronunciation",
        signal:
          score >= 70 ? "pronunciation_correct" : "pronunciation_incorrect",
        data: {
          transcript: event.transcript ?? "",
          speechMatch: event.pronunciationConfidence,
          answerMatch: event.grammarAccuracy,
        },
      });
    }
    addUnassistedKanji(exercise.id, exercise.modelAnswer, {
      evaluationAvailable: event.evaluationAvailable === true,
      source: "speaking",
    });
  }

  return result;
}
