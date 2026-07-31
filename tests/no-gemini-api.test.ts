import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["app", "components", "lib", "store", "types", "docs"];
const EXTRA_FILES = [".env.example", "README.md"];
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".md"]);
const FORBIDDEN_RUNTIME_MARKERS = [
  "GEMINI_API_KEY",
  "GEMINI_LESSON_MODEL",
  "GEMINI_LESSON_FALLBACK_MODEL",
  "GEMINI_GENERATE_CONTENT_BASE",
  "generativelanguage.googleapis.com",
  "x-goog-api-key",
];

function extension(path: string): string {
  const name = path.split("/").at(-1) ?? path;
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function filesUnder(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => filesUnder(join(path, name)));
}

describe("text-generation provider boundary", () => {
  it("contains no Gemini API credentials, endpoints, or transport headers", () => {
    const files = [
      ...ROOTS.flatMap(filesUnder).filter((path) => TEXT_EXTENSIONS.has(extension(path))),
      ...EXTRA_FILES,
    ];
    const matches = files.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return FORBIDDEN_RUNTIME_MARKERS.flatMap((marker) =>
        source.includes(marker) ? [`${path}: ${marker}`] : [],
      );
    });

    expect(matches).toEqual([]);
  });
});
