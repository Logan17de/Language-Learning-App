"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, RotateCcw, Save, Send, ShieldCheck } from "lucide-react";
import { validateAdminLesson } from "@/lib/admin-lesson-validation";
import type { LessonPackage } from "@/types/lesson";
import {
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { MetadataEditor } from "@/components/admin/lessons/metadata-editor";
import { StoryEditor } from "@/components/admin/lessons/story-editor";
import { CurriculumContentEditor } from "@/components/admin/lessons/curriculum-content-editor";
import { ExerciseEditor } from "@/components/admin/lessons/exercise-editor";
import { Button } from "@/components/ui/button";
import { useBackendAdminLessonStore } from "@/store/backend-admin-lesson-store";
import { adminLessonRepository } from "@/lib/repositories/admin-lesson-repository";

export function LessonEditor({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const backendLessons = useBackendAdminLessonStore((state) => state.lessons);
  const backendLoading = useBackendAdminLessonStore((state) => state.loading);
  const backendError = useBackendAdminLessonStore((state) => state.error);
  const loadBackendLessons = useBackendAdminLessonStore((state) => state.load);
  const source = useMemo(
    () => backendLessons.find((item) => item.id === lessonId) ?? null,
    [backendLessons, lessonId],
  );
  const [draft, setDraft] = useState<LessonPackage | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [message, setMessage] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadBackendLessons();
  }, [loadBackendLessons]);

  useEffect(() => {
    if (!source || draft) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setDraft(structuredClone(source));
    setSavedSnapshot(JSON.stringify(source));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [draft, source]);

  const dirty = Boolean(draft && JSON.stringify(draft) !== savedSnapshot);
  const validation = draft ? validateAdminLesson(draft) : null;

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if ((!draft || !validation) && backendLoading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <span className="size-9 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" />
      </div>
    );
  }

  if (!draft || !validation) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <h1 className="text-2xl font-bold">
          {lessonId === "new" ? "Manual blank creation is unavailable" : "Lesson not found"}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-slate-500">
          {lessonId === "new"
            ? "The previous editor created new lessons by cloning demo content. Use full lesson import or lesson generation until a backend-safe blank draft creator is implemented."
            : backendError || "The requested persisted lesson cannot be edited."}
        </p>
      </div>
    );
  }

  const errors = showErrors ? validation.errors : {};

  async function save(status: "draft" | "published") {
    const currentDraft = draft;
    if (!currentDraft) return;
    const result = validateAdminLesson(currentDraft);
    if (status === "published" && !result.valid) {
      setShowErrors(true);
      setMessage(
        `Publishing blocked: fix ${Object.keys(result.errors).length} validation issue(s).`,
      );
      document
        .getElementById("editor-validation-summary")
        ?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const next = { ...currentDraft, status };
    setSaving(true);
    setMessage("");
    const saved = await adminLessonRepository.saveDraft({
      ...next,
      status: "draft",
    });
    if (!saved.ok) {
      setSaving(false);
      setMessage(saved.error.message);
      return;
    }

    if (status === "published") {
      const payload =
        typeof saved.data === "object" &&
        saved.data !== null &&
        !Array.isArray(saved.data)
          ? saved.data
          : {};
      const backendLessonId =
        typeof payload.lesson_id === "string" ? payload.lesson_id : "";
      const published = backendLessonId
        ? await adminLessonRepository.publish(
            backendLessonId,
            "Published from the structured editor",
          )
        : null;
      if (!published?.ok) {
        setSaving(false);
        setMessage(
          published && !published.ok
            ? published.error.message
            : "The saved draft could not be published.",
        );
        return;
      }
    }

    await loadBackendLessons(true);
    setSaving(false);
    setDraft(next);
    setSavedSnapshot(JSON.stringify(next));
    setShowErrors(false);
    setMessage(
      status === "published"
        ? "Lesson published. The learner library now reads this persisted version."
        : "Draft version saved to Supabase.",
    );
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Structured content editor"
        title={draft.title}
        description={`${draft.id} · edits are saved as persisted lesson versions in Supabase.`}
        actions={
          <div className="flex items-center gap-2">
            <AdminStatus>{dirty ? "unsaved changes" : draft.status}</AdminStatus>
          </div>
        }
      />
      <div
        id="editor-validation-summary"
        className={`mb-6 rounded-2xl border p-4 ${
          validation.valid
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <ShieldCheck
            className={`size-5 ${
              validation.valid ? "text-emerald-700" : "text-amber-700"
            }`}
          />
          <div>
            <strong className="text-sm">
              {validation.valid
                ? "Strict validation passes"
                : `${Object.keys(validation.errors).length} validation issue(s)`}
            </strong>
            <p className="text-xs text-slate-600">
              {validation.valid
                ? "This lesson can be published."
                : "Save as a draft or correct the inline errors before publishing."}
            </p>
          </div>
        </div>
        {message && (
          <p role="status" className="mt-3 text-sm font-semibold text-slate-700">
            {message}
          </p>
        )}
      </div>

      <div className="space-y-6">
        <MetadataEditor lesson={draft} errors={errors} onChange={setDraft} />
        <CurriculumContentEditor
          lesson={draft}
          errors={errors}
          onChange={setDraft}
        />
        <StoryEditor lesson={draft} errors={errors} onChange={setDraft} />
        <ExerciseEditor lesson={draft} errors={errors} onChange={setDraft} />
      </div>

      <div className="sticky bottom-4 z-20 mt-7 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          className="rounded-xl"
          onClick={() => void save("draft")}
        >
          <Save className="size-4" /> {saving ? "Saving…" : "Save draft"}
        </Button>
        <Button
          type="button"
          disabled={saving}
          className="rounded-xl"
          onClick={() => void save("published")}
        >
          <Send className="size-4" /> Publish
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="rounded-xl"
          disabled={dirty}
          onClick={() => router.push(`/lesson/${draft.id}/preview`)}
        >
          <Eye className="size-4" /> Preview
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="rounded-xl"
          disabled={!dirty}
          onClick={() => {
            if (!source) return;
            setDraft(structuredClone(source));
            setSavedSnapshot(JSON.stringify(source));
            setMessage("Unsaved changes discarded.");
            setShowErrors(false);
          }}
        >
          <RotateCcw className="size-4" /> Discard changes
        </Button>
        <span className="ml-auto text-xs text-slate-500">
          {dirty ? "Save before leaving or previewing." : "All changes saved."}
        </span>
      </div>
    </>
  );
}
