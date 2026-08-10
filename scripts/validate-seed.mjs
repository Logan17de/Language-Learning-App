import { readFile } from "node:fs/promises";
import { join } from "node:path";

const baseSeed = await readFile(
  join(process.cwd(), "supabase", "seed.sql"),
  "utf8",
);
const canonicalSeed = await readFile(
  join(process.cwd(), "supabase", "seed-canonical-lesson.sql"),
  "utf8",
);
const seed = `${baseSeed}\n${canonicalSeed}`;

const requiredMarkers = [
  "Going to Work",
  "lesson_n4_commute_001",
  "insert into public.lesson_versions",
  "insert into public.lesson_story_lines",
  "insert into public.lesson_vocabulary",
  "insert into public.lesson_grammar",
  "insert into public.lesson_practice_activities",
  "insert into public.lesson_reading_questions",
  "insert into public.lesson_listening_activities",
  "insert into public.lesson_speaking_activities",
  "insert into public.lesson_review_activities",
  "insert into public.image_assets",
  "insert into public.audio_assets",
  "insert into public.feature_flags",
  "insert into public.service_status",
];

const missing = requiredMarkers.filter((marker) => !seed.includes(marker));
if (missing.length) throw new Error(`Seed is incomplete: ${missing.join(", ")}`);
if (!seed.includes("10000000-0000-4000-8000-000000000101")) {
  throw new Error("Going to Work does not use a deterministic version ID.");
}
if (/insert\s+into\s+auth\./i.test(seed)) {
  throw new Error("Seed must not bypass Supabase Auth to create users.");
}
if (/\b(?:japanese|english)\s*=\s*excluded\.(?:japanese|english)\b/i.test(seed)) {
  throw new Error("Seed uses legacy lesson column names instead of normalized columns.");
}

const canonicalMarkers = [
  "generate_series(1, 13)",
  "generate_series(1, 10)",
  "'read_aloud'",
  "'kanji'",
  "'vocabulary'",
  "'grammar'",
  "'listening'",
  "'speaking'",
];
const missingCanonical = canonicalMarkers.filter(
  (marker) => !canonicalSeed.includes(marker),
);
if (missingCanonical.length) {
  throw new Error(
    `Canonical lesson seed is incomplete: ${missingCanonical.join(", ")}`,
  );
}

console.log(
  "Seed validated: deterministic curriculum plus a complete canonical Going to Work lesson are present.",
);
