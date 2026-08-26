import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("app/globals.css", "utf8");
const tailwind = readFileSync("tailwind.config.ts", "utf8");
const choice = readFileSync("components/exercises/multiple-choice-card.tsx", "utf8");
const feedback = readFileSync("components/exercises/answer-feedback.tsx", "utf8");

type Rgb = [number, number, number];

function rgb(name: string, block: string): Rgb {
  const line = block
    .split(/\r?\n/)
    .find((row) => row.trim().startsWith(`--aiko-${name}:`));
  if (!line) throw new Error(`missing token --aiko-${name}`);
  const value = line.slice(line.indexOf(":") + 1).replace(";", "").trim();
  return value.split(/\s+/).map(Number) as Rgb;
}

function luminance([r, g, b]: Rgb) {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: Rgb, b: Rgb) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const light = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
const dark = css.slice(css.indexOf(".dark {"));

describe("right and wrong read as verdicts in both themes", () => {
  it("defines outcome colours per theme rather than using fixed palette hex", () => {
    // moss and persimmon are fixed hex. The dark shim patched .bg-moss-50 to a
    // neutral surface, which stripped the verdict of its colour entirely.
    for (const token of [
      "correct-surface",
      "correct-border",
      "correct-ink",
      "wrong-surface",
      "wrong-border",
      "wrong-ink",
    ]) {
      expect(light).toContain(`--aiko-${token}:`);
      expect(dark).toContain(`--aiko-${token}:`);
      expect(tailwind).toContain(`"${token}": "rgb(var(--aiko-${token})`);
    }
  });

  it("keeps verdict text legible in both themes", () => {
    // The dark shim rewrote .bg-moss-50 to the neutral muted surface but never
    // covered .text-moss-900, so the old "correct" chip put near-black green
    // text on a dark panel at 1.06:1 — unreadable.
    for (const block of [light, dark]) {
      expect(
        contrast(rgb("correct-ink", block), rgb("correct-surface", block)),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(rgb("wrong-ink", block), rgb("wrong-surface", block)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("never fades verdict body text below the contrast floor", () => {
    // opacity-75 put the light "not correct" detail at 3.4:1.
    expect(feedback).not.toContain("opacity-75");
  });

  it("uses the tokens rather than raw palette values on the answer surface", () => {
    expect(choice).toContain("bg-correct-surface");
    expect(choice).toContain("bg-wrong-surface");
    expect(choice).not.toContain("bg-white");
    expect(choice).not.toContain("border-stone-200");
    expect(feedback).toContain("bg-correct-surface");
    expect(feedback).toContain("bg-wrong-surface");
  });
});
