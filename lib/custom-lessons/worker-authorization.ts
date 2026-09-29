import { timingSafeEqual } from "node:crypto";

interface WorkerSecretEnvironment {
  CUSTOM_LESSON_WORKER_SECRET?: string;
  CRON_SECRET?: string;
}

function bearerMatches(header: string, secret: string): boolean {
  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function customLessonWorkerAuthorized(
  authorizationHeader: string | null,
  environment: WorkerSecretEnvironment = {
    CUSTOM_LESSON_WORKER_SECRET: process.env.CUSTOM_LESSON_WORKER_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  },
): boolean {
  if (!authorizationHeader) return false;
  const secrets = [
    environment.CUSTOM_LESSON_WORKER_SECRET,
    environment.CRON_SECRET,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return secrets.some((secret) => bearerMatches(authorizationHeader, secret));
}
