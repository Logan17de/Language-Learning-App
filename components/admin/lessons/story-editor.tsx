import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { LessonPackage, StoryLine } from "@/types/lesson";
import { EditorField, EditorPanel, inputClass } from "@/components/admin/lessons/editor-fields";
import { Button } from "@/components/ui/button";

export function StoryEditor({ lesson, errors, onChange }: { lesson: LessonPackage; errors: Record<string, string>; onChange: (lesson: LessonPackage) => void }) {
  function update(index: number, line: StoryLine) {
    onChange({ ...lesson, story: lesson.story.map((item, itemIndex) => itemIndex === index ? line : item) });
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= lesson.story.length) return;
    const story = [...lesson.story];
    [story[index], story[target]] = [story[target], story[index]];
    onChange({ ...lesson, story });
  }
  return (
    <EditorPanel title="Story" description="Edit, reorder, and link the contextual source used by later phases." error={errors.story ?? errors.storyLines}>
      <div className="space-y-4">
        {lesson.story.map((line, index) => <article key={line.id} className="rounded-xl border border-slate-200 p-4"><div className="mb-4 flex items-center justify-between"><strong className="text-sm">Line {index + 1} · {line.id}</strong><div className="flex gap-1"><IconButton label="Move line up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></IconButton><IconButton label="Move line down" disabled={index === lesson.story.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></IconButton><IconButton label="Remove line" onClick={() => onChange({ ...lesson, story: lesson.story.filter((_, itemIndex) => itemIndex !== index) })} danger><Trash2 className="size-4" /></IconButton></div></div><div className="grid gap-3 sm:grid-cols-2"><EditorField label="Japanese text"><textarea value={line.japanese} onChange={(event) => update(index, { ...line, japanese: event.target.value })} className={`${inputClass} min-h-20 py-3`} lang="ja" /></EditorField><EditorField label="Translation"><textarea value={line.english} onChange={(event) => update(index, { ...line, english: event.target.value })} className={`${inputClass} min-h-20 py-3`} /></EditorField><EditorField label="Vocabulary tokens"><input value={line.tappableTerms.join(", ")} onChange={(event) => update(index, { ...line, tappableTerms: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className={inputClass} /></EditorField><EditorField label="Image position / asset ID"><input value={line.imageId ?? ""} onChange={(event) => update(index, { ...line, imageId: event.target.value || undefined })} className={inputClass} placeholder="img_asset_id" /></EditorField><EditorField label="Mock audio asset"><input value={line.audioAssetId ?? ""} onChange={(event) => update(index, { ...line, audioAssetId: event.target.value || undefined })} className={inputClass} placeholder="audio_asset_id" /></EditorField></div></article>)}
      </div>
      <Button type="button" variant="secondary" className="mt-4 rounded-xl" onClick={() => onChange({ ...lesson, story: [...lesson.story, { id: `${lesson.id}_story_${lesson.story.length + 1}`, japanese: "", english: "", tappableTerms: [], words: [] }] })}><Plus className="size-4" /> Add story line</Button>
    </EditorPanel>
  );
}

function IconButton({ label, onClick, children, disabled = false, danger = false }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; danger?: boolean }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`grid size-9 place-items-center rounded-lg disabled:opacity-30 ${danger ? "text-red-600 hover:bg-red-50" : "text-slate-500 hover:bg-slate-100"}`}>{children}</button>;
}
