import type { LessonPackage, LessonSource, LessonStatus } from "@/types/lesson";
import { EditorField, EditorPanel, inputClass } from "@/components/admin/lessons/editor-fields";

export function MetadataEditor({ lesson, errors, onChange }: { lesson: LessonPackage; errors: Record<string, string>; onChange: (lesson: LessonPackage) => void }) {
  return (
    <EditorPanel title="Metadata" description="Identity, discovery, level, duration, source, and publishing state.">
      <div className="grid gap-4 sm:grid-cols-2">
        <EditorField label="Title" error={errors.title}><input value={lesson.title} onChange={(event) => onChange({ ...lesson, title: event.target.value })} className={inputClass} /></EditorField>
        <EditorField label="Japanese title" error={errors.japaneseTitle}><input value={lesson.japaneseTitle} onChange={(event) => onChange({ ...lesson, japaneseTitle: event.target.value })} className={inputClass} lang="ja" /></EditorField>
        <EditorField label="Topic" error={errors.topic}><input value={lesson.topic} onChange={(event) => onChange({ ...lesson, topic: event.target.value })} className={inputClass} /></EditorField>
        <EditorField label="JLPT level"><select value={lesson.level} onChange={(event) => onChange({ ...lesson, level: event.target.value as LessonPackage["level"] })} className={inputClass}>{["N5", "N4", "N3", "N2", "N1"].map((item) => <option key={item}>{item}</option>)}</select></EditorField>
        <EditorField label="Duration in minutes" error={errors.durationMinutes}><input type="number" min={5} max={120} value={lesson.durationMinutes} onChange={(event) => onChange({ ...lesson, durationMinutes: Number(event.target.value) })} className={inputClass} /></EditorField>
        <EditorField label="Source"><select value={lesson.source} onChange={(event) => onChange({ ...lesson, source: event.target.value as LessonSource })} className={inputClass}>{["curated_seed", "generated", "user_generated", "community"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></EditorField>
        <EditorField label="Status"><select value={lesson.status} onChange={(event) => onChange({ ...lesson, status: event.target.value as LessonStatus })} className={inputClass}>{["draft", "approved", "published", "rejected", "archived", "malformed"].map((item) => <option key={item}>{item}</option>)}</select></EditorField>
        <EditorField label="Tags (comma separated)"><input value={(lesson.tags ?? []).join(", ")} onChange={(event) => onChange({ ...lesson, tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className={inputClass} /></EditorField>
        <EditorField label="Description" error={errors.summary} className="sm:col-span-2"><textarea value={lesson.summary} onChange={(event) => onChange({ ...lesson, summary: event.target.value })} className={`${inputClass} min-h-24 py-3`} /></EditorField>
        <EditorField label="Story preview" className="sm:col-span-2"><textarea value={lesson.storyPreview} onChange={(event) => onChange({ ...lesson, storyPreview: event.target.value })} className={`${inputClass} min-h-20 py-3`} lang="ja" /></EditorField>
      </div>
    </EditorPanel>
  );
}
