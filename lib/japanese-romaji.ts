import "server-only";

import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";

let enginePromise: Promise<Kuroshiro> | null = null;

async function engine(): Promise<Kuroshiro> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const instance = new Kuroshiro();
      await instance.init(new KuromojiAnalyzer());
      return instance;
    })();
  }
  try {
    return await enginePromise;
  } catch (error) {
    // A transient dictionary load failure must not poison this server process
    // for every later hint or transcription request.
    enginePromise = null;
    throw error;
  }
}

export async function japaneseToRomaji(value: string): Promise<string> {
  const source = value.normalize("NFKC").trim();
  if (!source) return "";
  return (await (await engine()).convert(source, {
    to: "romaji",
    // Normal mode is intentionally unspaced. Kuromoji may split the same word
    // differently when it is written in kanji versus kana (for example 水 and
    // みず), so token spaces cannot be part of pronunciation scoring.
    mode: "normal",
    romajiSystem: "hepburn",
  }))
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export async function japaneseToDisplayRomaji(value: string): Promise<string> {
  const source = value.normalize("NFKC").trim();
  if (!source) return "";
  return (await (await engine()).convert(source, {
    to: "romaji",
    mode: "spaced",
    romajiSystem: "hepburn",
  }))
    .normalize("NFKC")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizedReading(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function textSimilarity(leftValue: string, rightValue: string): number {
  const left = normalizedReading(leftValue);
  const right = normalizedReading(rightValue);
  if (!left || !right) return 0;
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
  for (let column = 1; column <= right.length; column += 1) {
    let diagonal = rows[0];
    rows[0] = column;
    for (let row = 1; row <= left.length; row += 1) {
      const previous = rows[row];
      rows[row] = Math.min(
        rows[row] + 1,
        rows[row - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return Math.max(
    0,
    Math.round(
      (1 - rows[left.length] / Math.max(left.length, right.length)) * 100,
    ),
  );
}
