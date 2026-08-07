import { validateCompleteLessonImport } from "@/lib/admin-complete-lesson-import";

type RecordValue = Record<string, unknown>;

export interface BulkLessonIssue {
  index: number;
  id: string;
  errors: string[];
}

export interface BulkLessonValidation {
  valid: boolean;
  count: number;
  validCount: number;
  issues: BulkLessonIssue[];
}

function record(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function lessonId(value: unknown): string {
  return record(value) && typeof value.id === "string" ? value.id.trim() : "";
}

/**
 * Accept one lesson object, a JSON array of lessons, or JSONL where every
 * non-empty line is one complete lesson object. Unlike the model-output JSONL
 * parser, bulk lesson records are never merged together.
 */
export function parseCompleteLessonBatch(source: string): unknown[] {
  const trimmed = source.trim();
  if (!trimmed) return [];
  const fenced = trimmed.match(/^```(?:jsonl|json)?\s*([\s\S]*?)\s*```$/iu);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    const parsed: unknown = JSON.parse(candidate);
    if (Array.isArray(parsed)) return parsed;
    if (record(parsed)) return [parsed];
    throw new Error("Lesson upload must contain JSON objects.");
  } catch (error) {
    if (error instanceof Error && error.message === "Lesson upload must contain JSON objects.") {
      throw error;
    }
  }

  let records: unknown[];
  try {
    records = candidate
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  } catch {
    throw new Error("Upload must be one lesson JSON object, a JSON array, or one complete lesson per JSONL line.");
  }
  if (!records.length || !records.every(record)) {
    throw new Error("Every JSONL line must be one complete lesson object.");
  }
  return records;
}

export function validateCompleteLessonBatch(values: unknown[]): BulkLessonValidation {
  const issues: BulkLessonIssue[] = [];
  if (values.length < 1) {
    return {
      valid: false,
      count: 0,
      validCount: 0,
      issues: [{ index: 0, id: "", errors: ["Add at least one lesson."] }],
    };
  }
  if (values.length > 100) {
    return {
      valid: false,
      count: values.length,
      validCount: 0,
      issues: [{ index: 0, id: "", errors: ["One bulk upload accepts at most 100 lessons."] }],
    };
  }

  const seen = new Map<string, number>();
  let validCount = 0;
  values.forEach((value, index) => {
    const validation = validateCompleteLessonImport(value);
    const id = lessonId(value);
    const errors = [...validation.errors];
    if (id) {
      const previous = seen.get(id);
      if (previous !== undefined) {
        errors.push(`Lesson id duplicates upload item ${previous + 1}.`);
      } else {
        seen.set(id, index);
      }
    }
    if (errors.length) {
      issues.push({ index, id, errors: [...new Set(errors)] });
    } else {
      validCount += 1;
    }
  });

  return {
    valid: issues.length === 0 && validCount === values.length,
    count: values.length,
    validCount,
    issues,
  };
}
