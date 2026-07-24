import type { LessonPackage } from "@/types/lesson";
import type { LessonCardState, LessonLibraryFilter } from "@/types/library";
import type { LessonSession } from "@/types/lesson-session";
import type { RecentLesson } from "@/types/progress";
import type { CustomLessonMatch } from "@/types/app-preferences";

export function buildLessonCardStates(
  lessons: LessonPackage[],
  savedIds: string[],
  completedIds: string[],
  sessions: Record<string, LessonSession>,
  recentLessons: RecentLesson[],
): LessonCardState[] {
  return lessons.map((lesson) => ({
    lesson,
    saved: savedIds.includes(lesson.id),
    completed: completedIds.includes(lesson.id),
    hasResult: Boolean(sessions[lesson.id]?.completionResult),
    active: Boolean(sessions[lesson.id] && !sessions[lesson.id].completed),
    score: recentLessons.find((item) => item.lessonId === lesson.id)?.score,
    malformed: !isPlayableLesson(lesson),
  }));
}

export function filterLessonCards(cards: LessonCardState[], filter: LessonLibraryFilter): LessonCardState[] {
  const query = normalize(filter.query);
  return cards.filter((card) => {
    const lesson = card.lesson;
    const searchable = normalize([
      lesson.title,
      lesson.japaneseTitle,
      lesson.topic,
      lesson.summary,
      ...(lesson.tags ?? []),
      ...lesson.grammar.map((item) => item.pattern),
      ...lesson.kanji.map((item) => item.character),
    ].join(" "));
    if (query && !searchable.includes(query)) return false;
    if (filter.level !== "all" && lesson.level !== filter.level) return false;
    if (filter.topic !== "all" && lesson.topic !== filter.topic) return false;
    if (!durationMatches(lesson.durationMinutes, filter.duration)) return false;
    if (filter.completion === "not-started" && (card.active || card.completed)) return false;
    if (filter.completion === "active" && !card.active) return false;
    if (filter.completion === "completed" && !card.completed) return false;
    if (filter.tab === "completed" && !card.completed) return false;
    if (filter.tab === "saved" && !card.saved) return false;
    if (filter.tab === "custom" && lesson.source !== "user_generated") return false;
    if (filter.tab === "jlpt" && !lesson.level) return false;
    return true;
  });
}

export function matchCustomTopic(
  topic: string,
  level: string,
  durationMinutes: number,
  focus: string,
  lessons: LessonPackage[],
  completedIds: string[],
): CustomLessonMatch {
  const terms = tokens(`${topic} ${focus}`);
  const ranked = lessons
    .map((lesson) => {
      const haystack = normalize([
        lesson.title,
        lesson.topic,
        lesson.summary,
        ...(lesson.tags ?? []),
      ].join(" "));
      const keywordScore = terms.reduce((score, term) => score + (haystack.includes(term) ? 22 : 0), 0);
      const levelScore = lesson.level === level ? 20 : 0;
      const durationScore = Math.abs(lesson.durationMinutes - durationMinutes) <= 15 ? 12 : 0;
      return { lesson, score: Math.min(100, keywordScore + levelScore + durationScore) };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 42) return { outcome: "new", score: best?.score ?? 0 };
  if (completedIds.includes(best.lesson.id)) return { outcome: "variation", lesson: best.lesson, score: best.score };
  return { outcome: "existing", lesson: best.lesson, score: best.score };
}

export function isPlayableLesson(lesson: LessonPackage): boolean {
  return Boolean(
    lesson.id &&
    lesson.title &&
    lesson.phases.length === 7 &&
    lesson.story.length > 0 &&
    lesson.vocabulary.length > 0 &&
    lesson.grammar.length > 0 &&
    lesson.reviewQuestions.length > 0,
  );
}

export function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string): string[] {
  return normalize(value).split(" ").filter((term) => term.length > 1);
}

function durationMatches(minutes: number, duration: LessonLibraryFilter["duration"]): boolean {
  if (duration === "all") return true;
  if (duration === "short") return minutes <= 20;
  if (duration === "medium") return minutes > 20 && minutes <= 35;
  return minutes > 35;
}
