import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(path) ? [path] : [];
  });
}

describe("copy does not leak HTML entities", () => {
  it("never puts an entity inside a quoted string", () => {
    // JSX decodes an entity written as text between tags, but not one inside a
    // string value. "Today&apos;s lesson is ready" was an object field, so the
    // learner read TODAY&APOS;S LESSON IS READY.
    const offenders: string[] = [];
    for (const file of [...sourceFiles("components"), ...sourceFiles("app")]) {
      const source = readFileSync(file, "utf8");
      source.split("\n").forEach((line, index) => {
        if (/[:=]\s*"[^"]*&(apos|quot|amp|lsquo|rsquo|nbsp|mdash|ndash);/u.test(line)) {
          offenders.push(`${file}:${index + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
