import type { JLPTLevel, LessonPackage } from "@/types/lesson";

export type LessonLibraryTab = "recommended" | "jlpt" | "topics" | "completed" | "saved" | "custom";
export type CompletionFilter = "all" | "not-started" | "active" | "completed";
export type DurationFilter = "all" | "short" | "medium" | "long";

export interface LessonLibraryFilter {
  tab: LessonLibraryTab;
  query: string;
  level: JLPTLevel | "all";
  topic: string;
  duration: DurationFilter;
  completion: CompletionFilter;
}

export interface LessonCardState {
  lesson: LessonPackage;
  saved: boolean;
  completed: boolean;
  hasResult: boolean;
  active: boolean;
  score?: number;
  malformed: boolean;
}
