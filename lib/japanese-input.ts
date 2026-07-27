const ROMAJI_TO_HIRAGANA: Record<string, string> = {
  kya: "きゃ", kyu: "きゅ", kyo: "きょ",
  gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
  sha: "しゃ", shu: "しゅ", sho: "しょ",
  sya: "しゃ", syu: "しゅ", syo: "しょ",
  ja: "じゃ", ju: "じゅ", jo: "じょ",
  jya: "じゃ", jyu: "じゅ", jyo: "じょ",
  cha: "ちゃ", chu: "ちゅ", cho: "ちょ",
  cya: "ちゃ", cyu: "ちゅ", cyo: "ちょ",
  nya: "にゃ", nyu: "にゅ", nyo: "にょ",
  hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ",
  bya: "びゃ", byu: "びゅ", byo: "びょ",
  pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ",
  mya: "みゃ", myu: "みゅ", myo: "みょ",
  rya: "りゃ", ryu: "りゅ", ryo: "りょ",
  fa: "ふぁ", fi: "ふぃ", fe: "ふぇ", fo: "ふぉ",
  tsa: "つぁ", tsi: "つぃ", tse: "つぇ", tso: "つぉ",
  she: "しぇ", che: "ちぇ", je: "じぇ",
  ti: "てぃ", tu: "とぅ", di: "でぃ", du: "どぅ",
  wi: "うぃ", we: "うぇ", wo: "を",
  shi: "し", chi: "ち", tsu: "つ",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  sa: "さ", si: "し", su: "す", se: "せ", so: "そ",
  za: "ざ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  ta: "た", te: "て", to: "と",
  da: "だ", de: "で", do: "ど",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", fu: "ふ", he: "へ", ho: "ほ",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ",
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  ji: "じ",
};

const ROMAJI_KEYS = Object.keys(ROMAJI_TO_HIRAGANA).sort(
  (left, right) => right.length - left.length,
);
const CONSONANT = /[bcdfghjklmpqrstvwxyz]/;

export function romajiToHiragana(value: string): string {
  const source = value.toLocaleLowerCase();
  let result = "";
  let index = 0;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (
      next &&
      current === next &&
      current !== "n" &&
      CONSONANT.test(current)
    ) {
      result += "っ";
      index += 1;
      continue;
    }

    if (current === "n") {
      if (next === "'") {
        result += "ん";
        index += 2;
        continue;
      }
      if (!next || (next !== "y" && CONSONANT.test(next))) {
        result += "ん";
        index += 1;
        continue;
      }
    }

    const key = ROMAJI_KEYS.find((candidate) =>
      source.startsWith(candidate, index),
    );
    if (key) {
      result += ROMAJI_TO_HIRAGANA[key];
      index += key.length;
      continue;
    }

    result += value[index] ?? current;
    index += 1;
  }

  return result;
}

export function japaneseInputPreview(value: string): string | null {
  const converted = romajiToHiragana(value.trim());
  if (!converted || converted === value.trim()) return null;
  if (!/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(converted)) {
    return null;
  }
  return converted;
}

export function safeProductionPrompt(prompt: string, cue: string): string {
  const withoutCue = cue ? prompt.replace(cue, "") : prompt;
  const japaneseStart = withoutCue.search(
    /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  );
  const safe =
    japaneseStart >= 0 ? withoutCue.slice(0, japaneseStart) : withoutCue;
  return safe
    .replace(/[_＿]{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
