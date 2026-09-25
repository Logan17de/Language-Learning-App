import { describe, expect, it } from "vitest";
import {
  dialogueSpeechKind,
  dialogueSsml,
  hasNamedSpeaker,
  normalizeSpeechText,
  parseDialogueLine,
} from "@/lib/audio/dialogue-speech";
import { listeningQuestionIssues } from "@/lib/gemini/listening-question-contract";

describe("named listening dialogue", () => {
  it("requires real speaker names instead of generic gender labels", () => {
    expect(hasNamedSpeaker("田中：おはようございます。")).toBe(true);
    expect(hasNamedSpeaker("ゆき：今日は駅へ行きます。")).toBe(true);
    expect(hasNamedSpeaker("男：おはよう。")).toBe(false);
    expect(hasNamedSpeaker("onna: こんにちは。")).toBe(false);
    expect(parseDialogueLine("田中：おはようございます。")).toEqual({
      speaker: "田中",
      speech: "おはようございます。",
    });
  });

  it("adds breathing space after each spoken name", () => {
    const transcript = "田中：おはようございます。\nゆき：今日はいい天気ですね。";
    expect(dialogueSpeechKind(transcript)).toBe("named-dialogue-v1");
    expect(dialogueSsml(transcript)).toContain('田中<break time="650ms"/>');
    expect(dialogueSsml(transcript)).toContain('ゆき<break time="650ms"/>');
  });

  it("preserves dialogue boundaries while normalizing stored speech", () => {
    const normalized = normalizeSpeechText(
      "  田中：こんにちは。  \r\n\t佐藤：元気です。  ",
    );
    expect(normalized).toBe("田中:こんにちは。\n佐藤:元気です。");
    expect(dialogueSpeechKind(normalized)).toBe("named-dialogue-v1");
  });

  it("rejects generated conversations without named speakers", () => {
    const questions = Array.from({ length: 5 }, (_, index) => ({
      difficulty: index < 2 ? "easy" : index < 4 ? "medium" : "hard",
      conversation: [
        "男：おはよう。",
        "女：おはよう。",
        "男：駅へ行きます。",
        "女：私も行きます。",
        "男：一緒に行きましょう。",
      ],
      question: "二人はどこへ行きますか。",
      choices: ["駅", "学校", "店", "家"],
      answer: "駅",
    }));
    expect(listeningQuestionIssues({ questions })).toContain(
      "Listening question 1 must name the speaker on every line.",
    );
  });
});
