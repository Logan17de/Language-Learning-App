import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { LessonLibrary } from "@/components/learn/lesson-library";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return <AppShell><LessonLibrary /></AppShell>;
}
