"use client";

import { useEffect, useState } from "react";
import { Archive, ExternalLink, FileCheck2, Pencil, Send } from "lucide-react";
import { validateAdminLesson } from "@/lib/admin-lesson-validation";
import type { LessonPackage, LessonStatus } from "@/types/lesson";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button, ButtonLink } from "@/components/ui/button";
import { useBackendAdminLessonStore } from "@/store/backend-admin-lesson-store";

const tabs = ["Overview", "Content", "Exercises", "Assets"] as const;
type DetailTab = (typeof tabs)[number];

export function LessonDetail({ lessonId }: { lessonId: string }) {
  const lessons = useBackendAdminLessonStore((state) => state.lessons);
  const loading = useBackendAdminLessonStore((state) => state.loading);
  const error = useBackendAdminLessonStore((state) => state.error);
  const loadLessons = useBackendAdminLessonStore((state) => state.load);
  const setLessonStatus = useBackendAdminLessonStore((state) => state.setStatus);
  const [tab, setTab] = useState<DetailTab>("Overview");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  const lesson = lessons.find((item) => item.id === lessonId);

  if (loading && !lesson) {
    return (
      <div
        className="h-80 animate-pulse rounded-2xl bg-slate-100"
        aria-label="Loading lesson detail"
      />
    );
  }
  if (!lesson) {
    return (
      <AdminEmptyState
        title="Lesson not found"
        description={
          error || "This lesson ID is not available in the persisted lesson library."
        }
      />
    );
  }

  const schema = validateAdminLesson(lesson);

  async function changeStatus(nextStatus: LessonStatus) {
    setWorking(true);
    setMessage("");
    const ok = await setLessonStatus(lesson, nextStatus);
    setMessage(
      ok
        ? `Lesson changed to ${nextStatus}.`
        : "The lesson status could not be changed.",
    );
    setWorking(false);
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Lesson detail"
        title={lesson.title}
        description={`${lesson.japaneseTitle} · ${lesson.id}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              href={`/lesson/${lesson.id}/preview`}
              variant="secondary"
              className="rounded-xl"
            >
              <ExternalLink className="size-4" /> Learner preview
            </ButtonLink>
            <ButtonLink
              href={`/admin/lessons/${lesson.id}/edit`}
              className="rounded-xl"
            >
              <Pencil className="size-4" /> Edit lesson
            </ButtonLink>
          </div>
        }
      />

      {message && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="min-h-10 rounded-lg px-4"
          onClick={() =>
            setMessage(
              schema.valid
                ? "Structural validation passed."
                : `Structural validation found ${Object.keys(schema.errors).length} issue(s).`,
            )
          }
        >
          <FileCheck2 className="size-4" /> Run structural check
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={working}
          className="min-h-10 rounded-lg px-4"
          onClick={() =>
            void changeStatus(
              lesson.status === "published" ? "draft" : "published",
            )
          }
        >
          <Send className="size-4" />
          {lesson.status === "published" ? "Unpublish" : "Publish"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={working || lesson.status === "archived"}
          className="min-h-10 rounded-lg px-4"
          onClick={() => void changeStatus("archived")}
        >
          <Archive className="size-4" /> Archive
        </Button>
      </div>

      <div className="overflow-x-auto border-b border-slate-200">
        <div
          className="flex min-w-max gap-1"
          role="tablist"
          aria-label="Lesson detail sections"
        >
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => setTab(item)}
              className={`min-h-11 border-b-2 px-4 text-sm font-bold ${
                tab === item
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {tab === "Overview" && <Overview lesson={lesson} schema={schema} />}
        {tab === "Content" && <Content lesson={lesson} />}
        {tab === "Exercises" && <Exercises lesson={lesson} />}
        {tab === "Assets" && <Assets lesson={lesson} />}
      </div>
    </>
  );
}

function Overview({
  lesson,
  schema,
}: {
  lesson: LessonPackage;
  schema: ReturnType<typeof validateAdminLesson>;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_.8fr]">
      <AdminSection title="Metadata">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="Status" value={<AdminStatus>{lesson.status}</AdminStatus>} />
          <Fact label="Source" value={lesson.source.replaceAll("_", " ")} />
          <Fact label="Level" value={lesson.level} />
          <Fact label="Topic" value={lesson.topic} />
          <Fact label="Duration" value={`${lesson.durationMinutes} minutes`} />
          <Fact label="Tags" value={lesson.tags?.join(", ") || "None"} />
        </dl>
        <p className="mt-5 border-t border-slate-100 pt-5 text-sm leading-6 text-slate-600">
          {lesson.summary}
        </p>
      </AdminSection>

      <AdminSection title="Structural validation">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Package structure</span>
          <AdminStatus>{schema.valid ? "passed" : "failed"}</AdminStatus>
        </div>
        {!schema.valid && (
          <ul className="mt-4 space-y-2 text-sm text-red-700">
            {Object.values(schema.errors).map((validationError) => (
              <li key={validationError}>• {validationError}</li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs leading-5 text-slate-500">
          This is a local structural check of the persisted lesson package. It
          does not create a validation-run record.
        </p>
      </AdminSection>

      <AdminSection title="Curriculum coverage" className="xl:col-span-2">
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric
            label="Grammar points"
            value={lesson.grammar.length}
            detail={lesson.grammar.map((item) => item.pattern).join(", ")}
          />
          <Metric
            label="Kanji"
            value={lesson.kanji.length}
            detail={lesson.kanji.map((item) => item.character).join(" · ")}
          />
          <Metric
            label="Vocabulary"
            value={lesson.vocabulary.length}
            detail={lesson.vocabulary
              .slice(0, 5)
              .map((item) => item.term)
              .join(" · ")}
          />
        </div>
      </AdminSection>
    </div>
  );
}

function Content({ lesson }: { lesson: LessonPackage }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <AdminSection title="Story">
        {lesson.story.map((line) => (
          <div
            key={line.id}
            className="border-b border-slate-100 py-3 last:border-0"
          >
            <p className="font-semibold">{line.japanese}</p>
            <p className="mt-1 text-sm text-slate-500">{line.english}</p>
          </div>
        ))}
      </AdminSection>
      <AdminSection title="Reading passage">
        {lesson.readingConversation.map((line, index) => (
          <div
            key={`${line.speaker}_${index}`}
            className="mb-3 rounded-xl bg-slate-50 p-4"
          >
            <strong>{line.speaker}</strong>
            <p className="mt-2">{line.japanese}</p>
            <p className="mt-1 text-sm text-slate-500">{line.english}</p>
          </div>
        ))}
      </AdminSection>
      <AdminSection title="Linked grammar">
        {lesson.grammar.map((item) => (
          <div
            key={item.id}
            className="mb-3 rounded-xl border border-slate-100 p-4"
          >
            <strong>
              {item.pattern} — {item.meaning}
            </strong>
            <p className="mt-2 text-sm text-slate-500">{item.usage}</p>
          </div>
        ))}
      </AdminSection>
      <AdminSection title="Vocabulary and kanji">
        <div className="flex flex-wrap gap-2">
          {lesson.vocabulary.map((item) => (
            <span
              key={item.term}
              className="rounded-xl bg-teal-50 px-3 py-2 text-sm"
            >
              <strong>{item.term}</strong> {item.reading} · {item.meaning}
            </span>
          ))}
        </div>
      </AdminSection>
    </div>
  );
}

function Exercises({ lesson }: { lesson: LessonPackage }) {
  const groups = [
    ["Listening", lesson.listeningExercises],
    ["Speaking", lesson.speakingExercises],
    ["Final review", lesson.reviewQuestions],
  ] as const;
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {groups.map(([label, items]) => (
        <AdminSection key={label} title={label}>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl bg-slate-50 p-4">
                <p className="font-semibold">{item.prompt}</p>
                {"choices" in item && (
                  <p className="mt-2 text-xs text-slate-500">
                    {item.choices.join(" · ")}
                  </p>
                )}
                <p className="mt-2 text-xs font-bold text-teal-700">
                  Answer:{" "}
                  {"correctAnswer" in item
                    ? item.correctAnswer
                    : item.modelAnswer}
                </p>
              </div>
            ))}
          </div>
        </AdminSection>
      ))}
    </div>
  );
}

function Assets({ lesson }: { lesson: LessonPackage }) {
  const storyAudio = lesson.story
    .map((line) => line.audioAssetId)
    .filter((id): id is string => Boolean(id));
  const listeningAudio = lesson.listeningExercises
    .map((exercise) => exercise.audioAssetId)
    .filter((id): id is string => Boolean(id));
  const audioIds = [...new Set([...storyAudio, ...listeningAudio])];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <AdminSection title="Image references">
        {lesson.images.length ? (
          lesson.images.map((image) => (
            <div
              key={image.id}
              className="mb-3 rounded-xl border border-slate-100 p-4"
            >
              <strong>{image.id}</strong>
              <p className="mt-1 text-sm text-slate-500">
                {image.description}
              </p>
            </div>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">
            No image references in this lesson package.
          </p>
        )}
      </AdminSection>
      <AdminSection title="Audio references">
        {audioIds.length ? (
          <div className="space-y-2">
            {audioIds.map((id) => (
              <code
                key={id}
                className="block rounded-xl bg-slate-50 px-4 py-3 text-xs"
              >
                {id}
              </code>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">
            No audio asset IDs are stored in this lesson package.
          </p>
        )}
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Storage metadata is managed from the live Image and Audio inspectors;
          this view only shows references actually present in the lesson package.
        </p>
      </AdminSection>
    </div>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold capitalize text-slate-800">
        {value}
      </dd>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}
