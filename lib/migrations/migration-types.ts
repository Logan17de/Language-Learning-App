import type { Json } from "@/types/database";

export interface LegacyImportSummary {
  completedLessons: number;
  masteryItems: number;
  reviewItems: number;
  achievements: number;
  customLessons: number;
  skippedRecords: number;
}

export interface LegacyImportPreview {
  payload: Json;
  summary: LegacyImportSummary;
}

export interface LegacyImportReport {
  alreadyImported: boolean;
  lessons: number;
  mastery: number;
  queue: number;
  achievements: number;
  skipped: number;
}

export type LegacyMigrationStatus = "checking" | "available" | "importing" | "complete" | "partial" | "failed" | "dismissed";
