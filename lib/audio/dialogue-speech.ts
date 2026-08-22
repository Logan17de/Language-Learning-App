const GENERIC_SPEAKERS = new Set([
  "a",
  "b",
  "speaker",
  "speaker1",
  "speaker2",
  "male",
  "female",
  "man",
  "woman",
  "otoko",
  "onna",
  "おとこ",
  "おんな",
  "男",
  "女",
  "男性",
  "女性",
]);

export interface DialogueLine {
  speaker: string;
  speech: string;
}

/** Normalize generated speech without erasing dialogue line boundaries. */
export function normalizeSpeechText(value: string): string {
  return value
    .normalize("NFKC")
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function parseDialogueLine(value: string): DialogueLine | null {
  const match = value.normalize("NFKC").trim().match(/^([^：:\n]{1,24})[：:]\s*(.+)$/u);
  if (!match) return null;
  const speaker = match[1].trim();
  const speech = match[2].trim();
  if (!speaker || !speech) return null;
  return { speaker, speech };
}

export function hasNamedSpeaker(value: string): boolean {
  const line = parseDialogueLine(value);
  if (!line) return false;
  return !GENERIC_SPEAKERS.has(line.speaker.toLocaleLowerCase().replace(/\s+/g, ""));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function dialogueSsml(value: string): string | null {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines.every(hasNamedSpeaker)) return null;
  const parsed = lines.map(parseDialogueLine) as DialogueLine[];
  if (new Set(parsed.map((line) => line.speaker)).size < 2) return null;
  return `<speak>${parsed
    .map(
      (line) =>
        `<s>${escapeXml(line.speaker)}<break time="650ms"/>${escapeXml(line.speech)}</s><break time="300ms"/>`,
    )
    .join("")}</speak>`;
}

export function dialogueSpeechKind(value: string): "named-dialogue-v1" | "plain-v1" {
  return dialogueSsml(value) ? "named-dialogue-v1" : "plain-v1";
}
