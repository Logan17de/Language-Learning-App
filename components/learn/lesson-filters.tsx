import { Search, SlidersHorizontal } from "lucide-react";
import type { LessonLibraryFilter } from "@/types/library";
import type { JLPTLevel } from "@/types/lesson";

export function LessonFilters({
  value,
  topics,
  onChange,
}: {
  value: LessonLibraryFilter;
  topics: string[];
  onChange: (next: LessonLibraryFilter) => void;
}) {
  return (
    <div className="rounded-3xl border border-black/[.06] bg-white p-4 shadow-card">
      <label className="relative block">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <span className="sr-only">Search lessons</span>
        <input value={value.query} onChange={(event) => onChange({ ...value, query: event.target.value })} className="form-input pl-11" placeholder="Search titles, topics, grammar, or kanji…" />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="mx-2 size-4 text-stone-400" aria-hidden="true" />
        <FilterSelect label="Level" value={value.level} onChange={(next) => onChange({ ...value, level: next as JLPTLevel | "all" })} options={["all", "N5", "N4", "N3", "N2", "N1"]} />
        <FilterSelect label="Topic" value={value.topic} onChange={(next) => onChange({ ...value, topic: next })} options={["all", ...topics]} />
        <FilterSelect label="Duration" value={value.duration} onChange={(next) => onChange({ ...value, duration: next as LessonLibraryFilter["duration"] })} options={["all", "short", "medium", "long"]} />
        <FilterSelect label="Status" value={value.completion} onChange={(next) => onChange({ ...value, completion: next as LessonLibraryFilter["completion"] })} options={["all", "not-started", "active", "completed"]} />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-10 rounded-full border border-stone-200 bg-white px-4 text-xs font-semibold capitalize text-stone-600 outline-none focus:border-moss-500 focus:ring-4 focus:ring-moss-100">
        {options.map((option) => <option key={option} value={option}>{option === "all" ? `All ${label.toLowerCase()}s` : option.replace("-", " ")}</option>)}
      </select>
    </label>
  );
}
