import { commuteLesson } from "@/data/mock-lessons";
import type { CustomLessonRequest } from "@/types/app-preferences";
import type { LessonPackage } from "@/types/lesson";
import { normalize } from "@/lib/lesson-search-utils";

export function generateCustomLesson(
  request: Pick<CustomLessonRequest, "topic" | "level" | "durationMinutes" | "focus" | "speakingDifficulty">,
  sequence: number,
  sourceLesson?: LessonPackage,
): LessonPackage {
  const template = sourceLesson ?? commuteLesson;
  const slug = normalize(request.topic).replace(/\s+/g, "_").slice(0, 30) || "custom_topic";
  const scenario = selectScenario(request.topic);
  const id = `lesson_custom_${slug}_${String(sequence).padStart(3, "0")}`;
  return {
    ...template,
    id,
    title: scenario.title,
    japaneseTitle: scenario.japaneseTitle,
    topic: request.topic.trim(),
    level: request.level,
    durationMinutes: request.durationMinutes,
    summary: scenario.summary,
    storyPreview: scenario.storyPreview,
    source: "user_generated",
    status: "published",
    tags: [request.topic, request.focus, "custom", ...scenario.tags],
    speakingExercises: template.speakingExercises.map((exercise) => ({
      ...exercise,
      mode: request.speakingDifficulty,
      prompt: scenario.speakingPrompt,
    })),
  };
}

function selectScenario(topic: string): {
  title: string;
  japaneseTitle: string;
  summary: string;
  storyPreview: string;
  speakingPrompt: string;
  tags: string[];
} {
  const normalized = normalize(topic);
  if (normalized.includes("ai") || normalized.includes("research") || normalized.includes("technology")) {
    return {
      title: "Presenting a New AI Idea",
      japaneseTitle: "新しいAIのアイデア",
      summary: "Explain an AI research idea to a colleague and discuss how it could be used.",
      storyPreview: "資料を見せながら、新しいAIの研究について説明します。",
      speakingPrompt: "Briefly explain an AI idea to a colleague.",
      tags: ["AI", "research", "technology", "presentation"],
    };
  }
  if (normalized.includes("hospital") || normalized.includes("health")) {
    return {
      title: "Explaining Symptoms at a Clinic",
      japaneseTitle: "クリニックで症状を説明する",
      summary: "Navigate reception and describe a concern clearly at a Japanese clinic.",
      storyPreview: "受付で待ちながら、症状を説明する言葉を確認します。",
      speakingPrompt: "Explain a simple symptom at reception.",
      tags: ["hospital", "clinic", "health"],
    };
  }
  if (normalized.includes("interview") || normalized.includes("job")) {
    return {
      title: "A Fresh Interview Scenario",
      japaneseTitle: "新しい面接の場面",
      summary: "Practice a new interview scenario focused on your experience and goals.",
      storyPreview: "面接官の質問を聞きながら、自分の経験を整理します。",
      speakingPrompt: "Introduce one strength in a job interview.",
      tags: ["interview", "career", "workplace"],
    };
  }
  return {
    title: `Talking About ${titleCase(topic)}`,
    japaneseTitle: `${topic.trim()}について話す`,
    summary: `Use familiar grammar and vocabulary in a practical conversation about ${topic.trim()}.`,
    storyPreview: `${topic.trim()}について話しながら、新しい言葉を練習します。`,
    speakingPrompt: `Share one thought about ${topic.trim()}.`,
    tags: ["custom topic", "conversation", normalize(topic)],
  };
}

function titleCase(value: string): string {
  return value.trim().split(/\s+/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
