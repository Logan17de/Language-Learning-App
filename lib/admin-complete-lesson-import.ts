import { parseJsonOrJsonl } from "@/lib/openai/structured-text";

type JsonRecord = Record<string, unknown>;

export interface CompleteLessonCounts {
  storyPassages: number;
  storyWords: number;
  kanji: number;
  vocabulary: number;
  grammar: number;
  vocabularyQuestions: number;
  grammarQuestions: number;
  speakingSentences: number;
  readingPassages: number;
  readingQuestions: number;
  listeningQuestions: number;
  reviewQuestions: number;
}

export interface CompleteLessonValidation {
  valid: boolean;
  errors: string[];
  counts: CompleteLessonCounts;
}

function record(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function items(value: unknown, key: string): unknown[] {
  return record(value) && Array.isArray(value[key]) ? value[key] : [];
}

function text(value: unknown, key: string): string {
  return record(value) && typeof value[key] === "string"
    ? value[key].trim()
    : "";
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function difficultyCounts(values: unknown[], lowercase = false) {
  const result = { easy: 0, medium: 0, hard: 0 };
  for (const value of values) {
    const raw = text(value, "difficulty");
    const key = lowercase ? raw : raw.toLocaleLowerCase();
    if (key === "easy" || key === "medium" || key === "hard") result[key] += 1;
  }
  return result;
}

function japaneseSentenceCount(values: unknown[], key: string): number {
  return values.reduce<number>((total, value) => {
    const matches = text(value, key).match(/[。！？]/gu);
    return total + (matches?.length ?? 0);
  }, 0);
}

function validateChoiceQuestion(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (!record(value)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  const choices = uniqueStrings(value.choices);
  const answer = text(value, "correctAnswer");
  if (!text(value, "prompt")) errors.push(`${label} needs a prompt.`);
  if (choices.length !== 4 || new Set(choices.map(normalized)).size !== 4) {
    errors.push(`${label} needs four unique choices.`);
  }
  if (choices.filter((choice) => normalized(choice) === normalized(answer)).length !== 1) {
    errors.push(`${label} needs exactly one correct answer contained in its choices.`);
  }
  if (!text(value, "explanation")) errors.push(`${label} needs an explanation.`);
}

export function parseCompleteLessonImport(source: string): unknown {
  return parseJsonOrJsonl(source);
}

export function validateCompleteLessonImport(value: unknown): CompleteLessonValidation {
  const errors: string[] = [];
  const story = items(value, "story");
  const kanji = items(value, "kanji");
  const vocabulary = items(value, "vocabulary");
  const grammar = items(value, "grammar");
  const vocabularyQuestions = items(value, "vocabularyQuestions");
  const grammarQuestions = items(value, "grammarQuestions");
  const speaking = items(value, "speakingExercises");
  const reading = items(value, "readingConversation");
  const readingQuestions = items(value, "readingQuestions");
  const listening = items(value, "listeningExercises");
  const review = items(value, "reviewQuestions");
  const counts: CompleteLessonCounts = {
    storyPassages: story.length,
    storyWords: story.reduce<number>((total, line) => total + items(line, "words").length, 0),
    kanji: kanji.length,
    vocabulary: vocabulary.length,
    grammar: grammar.length,
    vocabularyQuestions: vocabularyQuestions.length,
    grammarQuestions: grammarQuestions.length,
    speakingSentences: speaking.length,
    readingPassages: reading.length,
    readingQuestions: readingQuestions.length,
    listeningQuestions: listening.length,
    reviewQuestions: review.length,
  };

  if (!record(value)) return { valid: false, errors: ["The import must be one JSON object."], counts };
  if (value.schemaVersion !== 1) errors.push("schemaVersion must be 1.");
  if (!/^[a-z0-9][a-z0-9_-]{5,79}$/u.test(text(value, "id"))) {
    errors.push("id must be a 6–80 character lowercase lesson key using letters, numbers, underscores, or hyphens.");
  }
  for (const key of ["title", "japaneseTitle", "topic", "summary", "storyPreview"] as const) {
    if (!text(value, key)) errors.push(`${key} is required.`);
  }
  if (!["N5", "N4", "N3", "N2", "N1"].includes(text(value, "level"))) {
    errors.push("level must be N5, N4, N3, N2, or N1.");
  }
  const duration = typeof value.durationMinutes === "number" ? value.durationMinutes : 0;
  if (!Number.isInteger(duration) || duration < 5 || duration > 120) {
    errors.push("durationMinutes must be an integer from 5 to 120.");
  }
  if (kanji.length !== 5) errors.push("The lesson needs exactly 5 target kanji entries.");
  if (grammar.length !== 3) errors.push("The lesson needs exactly 3 target grammar entries.");
  if (vocabulary.length < 8 || vocabulary.length > 80) {
    errors.push("The reusable vocabulary list needs 8–80 entries.");
  }
  kanji.forEach((item, index) => {
    if (!text(item, "character") || !text(item, "reading") || !text(item, "meaning")) {
      errors.push(`Kanji ${index + 1} needs character, reading, and meaning.`);
    }
  });
  grammar.forEach((item, index) => {
    for (const key of ["pattern", "meaning", "structure", "usage", "example", "translation"] as const) {
      if (!text(item, key)) errors.push(`Grammar ${index + 1} needs ${key}.`);
    }
  });
  const vocabularyTerms = new Set<string>();
  vocabulary.forEach((item, index) => {
    const term = text(item, "term");
    if (!term || !text(item, "reading") || !text(item, "meaning") || !text(item, "partOfSpeech")) {
      errors.push(`Vocabulary ${index + 1} needs term, reading, meaning, and partOfSpeech.`);
    }
    if (term) vocabularyTerms.add(term);
  });
  const allowedTargetRefs = new Set([
    ...kanji.map((item) => `kanji:${text(item, "character")}`),
    ...vocabulary.map((item) => `vocabulary:${text(item, "term")}`),
    ...grammar.map((item) => `grammar:${text(item, "pattern")}`),
  ]);
  function validateTargetRefs(item: unknown, label: string, requiredPrefix?: string) {
    const refs = record(item) ? uniqueStrings(item.targetRefs) : [];
    if (!refs.length) errors.push(`${label} needs at least one targetRef.`);
    if (refs.some((ref) => !allowedTargetRefs.has(ref))) {
      errors.push(`${label} contains a targetRef that does not match the lesson library.`);
    }
    if (requiredPrefix && !refs.some((ref) => ref.startsWith(`${requiredPrefix}:`))) {
      errors.push(`${label} needs a ${requiredPrefix} targetRef.`);
    }
  }

  if (story.length < 1 || story.length > 6) errors.push("Story needs 1–6 passage blocks.");
  const storySentenceCount = japaneseSentenceCount(story, "japanese");
  if (storySentenceCount < 10 || storySentenceCount > 15) {
    errors.push("Story needs 10–15 Japanese sentences across its passage blocks.");
  }
  story.forEach((line, lineIndex) => {
    const japanese = text(line, "japanese");
    if (!japanese || !text(line, "english")) {
      errors.push(`Story passage ${lineIndex + 1} needs Japanese and English.`);
    }
    const words = items(line, "words");
    if (!words.length) errors.push(`Story passage ${lineIndex + 1} needs inspectable words.`);
    words.forEach((word, wordIndex) => {
      const surface = text(word, "surface");
      const script = text(word, "scriptType");
      if (!surface || !text(word, "reading") || !text(word, "meaning")) {
        errors.push(`Story word ${lineIndex + 1}.${wordIndex + 1} needs surface, reading, and meaning.`);
      }
      if (!japanese.includes(surface)) errors.push(`Story word ${lineIndex + 1}.${wordIndex + 1} is not present in its passage.`);
      if (!["kanji", "hiragana", "katakana"].includes(script)) {
        errors.push(`Story word ${lineIndex + 1}.${wordIndex + 1} has an invalid scriptType.`);
      }
      if (surface && !vocabularyTerms.has(surface)) {
        errors.push(`Story word “${surface}” is missing from the reusable vocabulary list.`);
      }
    });
  });

  if (vocabularyQuestions.length !== 13) errors.push("Vocabulary practice needs exactly 13 questions.");
  const vocabularySplit = difficultyCounts(vocabularyQuestions);
  if (vocabularySplit.easy !== 6 || vocabularySplit.medium !== 4 || vocabularySplit.hard !== 3) {
    errors.push("Vocabulary practice needs 6 Easy, 4 Medium, and 3 Hard questions.");
  }
  vocabularyQuestions.forEach((question, index) => {
    validateChoiceQuestion(question, `Vocabulary question ${index + 1}`, errors);
    validateTargetRefs(question, `Vocabulary question ${index + 1}`);
  });
  vocabularyQuestions.forEach((question, index) => {
    const mode = text(question, "mode");
    if (!["kanji-reading", "reading-meaning", "meaning-japanese", "mixed"].includes(mode)) {
      errors.push(`Vocabulary question ${index + 1} has an invalid mode.`);
    }
  });

  if (grammarQuestions.length !== 10) errors.push("Grammar practice needs exactly 10 questions.");
  const grammarSplit = difficultyCounts(grammarQuestions);
  if (grammarSplit.easy !== 3 || grammarSplit.medium !== 4 || grammarSplit.hard !== 3) {
    errors.push("Grammar practice needs 3 Easy, 4 Medium, and 3 Hard questions.");
  }
  grammarQuestions.forEach((question, index) => {
    if (!record(question)) return errors.push(`Grammar question ${index + 1} must be an object.`);
    if (!["multiple-choice", "fill-blank", "sentence-order", "natural-sentence"].includes(text(question, "type"))) {
      errors.push(`Grammar question ${index + 1} has an invalid type.`);
    }
    if (!["understanding", "production"].includes(text(question, "skill"))) {
      errors.push(`Grammar question ${index + 1} has an invalid skill.`);
    }
    const answerMode = text(question, "answerMode");
    if (!text(question, "prompt") || !text(question, "correctAnswer")) {
      errors.push(`Grammar question ${index + 1} needs a prompt and correct answer.`);
    }
    validateTargetRefs(question, `Grammar question ${index + 1}`, "grammar");
    if (answerMode === "choice") validateChoiceQuestion(question, `Grammar question ${index + 1}`, errors);
    else if (answerMode !== "text") errors.push(`Grammar question ${index + 1} answerMode must be choice or text.`);
  });

  if (speaking.length !== 5) errors.push("Speaking needs exactly 5 read-aloud sentences.");
  const speakingSplit = { easy: 0, medium: 0, hard: 0 };
  speaking.forEach((sentence, index) => {
    const mode = text(sentence, "mode");
    if (text(sentence, "questionType") !== "read_aloud") {
      errors.push(`Speaking sentence ${index + 1} must use questionType read_aloud.`);
    }
    if (mode === "easy" || mode === "medium" || mode === "hard") speakingSplit[mode] += 1;
    const prompt = text(sentence, "prompt");
    const target = text(sentence, "modelAnswer");
    if (!prompt || !target) {
      errors.push(`Speaking sentence ${index + 1} needs prompt and modelAnswer.`);
    }
    if (prompt && target && normalized(prompt) !== normalized(target)) {
      errors.push(`Speaking sentence ${index + 1} must use the same text for prompt and modelAnswer.`);
    }
    validateTargetRefs(sentence, `Speaking sentence ${index + 1}`);
  });
  if (speakingSplit.easy !== 2 || speakingSplit.medium !== 2 || speakingSplit.hard !== 1) {
    errors.push("Speaking needs a 2 Easy, 2 Medium, 1 Hard read-aloud split.");
  }

  if (reading.length < 1 || reading.length > 6) errors.push("Reading needs 1–6 passage blocks.");
  const readingSentenceCount = japaneseSentenceCount(reading, "japanese");
  if (readingSentenceCount < 10 || readingSentenceCount > 15) {
    errors.push("Reading needs 10–15 Japanese sentences across its passage blocks.");
  }
  reading.forEach((line, index) => {
    if (!text(line, "japanese") || !text(line, "english")) errors.push(`Reading passage ${index + 1} needs Japanese and English.`);
  });
  if (readingQuestions.length !== 5) errors.push("Reading needs exactly 5 questions.");
  const readingSplit = difficultyCounts(readingQuestions, true);
  if (readingSplit.easy !== 2 || readingSplit.medium !== 2 || readingSplit.hard !== 1) {
    errors.push("Reading needs 2 easy, 2 medium, and 1 hard question.");
  }
  readingQuestions.forEach((question, index) => {
    if (!text(question, "question") || !text(question, "answer")) errors.push(`Reading question ${index + 1} needs a question and answer.`);
  });

  if (listening.length !== 5) errors.push("Listening needs exactly 5 questions.");
  listening.forEach((question, index) => {
    validateChoiceQuestion(question, `Listening question ${index + 1}`, errors);
    validateTargetRefs(question, `Listening question ${index + 1}`);
    const lines = items(question, "conversationLines").filter((line) => typeof line === "string" && line.trim());
    if (lines.length < 5 || lines.length > 10) errors.push(`Listening question ${index + 1} needs 5–10 conversation lines.`);
  });

  if (review.length !== 5) errors.push("Final review needs exactly 5 questions.");
  review.forEach((question, index) => {
    validateChoiceQuestion(question, `Review question ${index + 1}`, errors);
    const category = text(question, "category");
    validateTargetRefs(
      question,
      `Review question ${index + 1}`,
      category === "kanji" || category === "vocabulary" || category === "grammar"
        ? category
        : undefined,
    );
  });
  const reviewCategories = new Set(review.map((question) => text(question, "category")));
  if (!["kanji", "vocabulary", "grammar", "listening", "speaking"].every((category) => reviewCategories.has(category))) {
    errors.push("Final review must cover kanji, vocabulary, grammar, listening, and speaking once each.");
  }

  const activityIds = [
    ...vocabularyQuestions,
    ...grammarQuestions,
    ...speaking,
    ...readingQuestions,
    ...listening,
    ...review,
  ].map((item) => text(item, "id"));
  if (activityIds.some((id) => !id)) errors.push("Every question and exercise needs an id.");
  if (new Set(activityIds).size !== activityIds.length) errors.push("Question and exercise IDs must be unique across the lesson.");

  return { valid: errors.length === 0, errors: [...new Set(errors)], counts };
}
