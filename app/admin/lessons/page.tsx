import { Suspense } from "react";
import { LessonManagementTable } from "@/components/admin/lessons/lesson-management-table";

export default function AdminLessonsPage() {
  return <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-slate-100" />}><LessonManagementTable /></Suspense>;
}
