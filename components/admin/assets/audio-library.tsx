"use client";

import { useMemo, useState } from "react";
import { Archive, Headphones, Play, RefreshCw, Save, Search, Square } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import type { AssetStatus, AudioAsset } from "@/types/admin";
import { AdminEmptyState, AdminPageHeader, AdminSection, AdminStatus, AdminTable } from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";

export function AudioLibrary() {
  const assets = useAdminStore((state) => state.audioAssets);
  const save = useAdminStore((state) => state.saveAudio);
  const [query, setQuery] = useState("");
  const [voice, setVoice] = useState("all");
  const [status, setStatus] = useState<AssetStatus | "all">("all");
  const [special, setSpecial] = useState<"all" | "missing" | "reported" | "unused">("all");
  const [playing, setPlaying] = useState<string | null>(null);
  const [editing, setEditing] = useState<AudioAsset | null>(null);
  const voices = [...new Set(assets.map((item) => item.voice))];
  const visible = useMemo(() => assets.filter((asset) => (!query || `${asset.id} ${asset.japaneseText} ${asset.linkedLessonIds.join(" ")}`.toLowerCase().includes(query.toLowerCase())) && (voice === "all" || asset.voice === voice) && (status === "all" || asset.status === status) && (special === "all" || (special === "missing" && asset.durationSeconds === 0) || (special === "reported" && asset.reportCount > 0) || (special === "unused" && !asset.linkedLessonIds.length))), [assets, query, special, status, voice]);

  function play(asset: AudioAsset) {
    if (playing === asset.id) {
      window.speechSynthesis?.cancel();
      setPlaying(null);
      return;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(asset.japaneseText);
      utterance.lang = "ja-JP";
      utterance.rate = asset.playbackSpeed;
      utterance.onend = () => setPlaying(null);
      window.speechSynthesis.speak(utterance);
    }
    setPlaying(asset.id);
  }

  return (
    <>
      <AdminPageHeader eyebrow="Asset operations" title="Audio library" description="Preview deterministic browser speech, manage metadata, and track missing, reported, or unused Japanese audio assets." />
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_10rem_11rem_11rem]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search audio" value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder="Text, asset, or lesson" /></label><select aria-label="Voice" value={voice} onChange={(event) => setVoice(event.target.value)} className="admin-input"><option value="all">All voices</option>{voices.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Audio status" value={status} onChange={(event) => setStatus(event.target.value as AssetStatus | "all")} className="admin-input"><option value="all">All statuses</option>{["active", "review", "reported", "archived", "low quality"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Audio issue" value={special} onChange={(event) => setSpecial(event.target.value as typeof special)} className="admin-input"><option value="all">All assets</option><option value="missing">Missing audio</option><option value="reported">Reported</option><option value="unused">Unused</option></select></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <AdminSection title="Audio assets" description="Playback uses the browser speech simulator and no external service.">
          {visible.length ? <AdminTable caption="Audio asset records" headers={["Preview", "Asset", "Japanese text", "Voice", "Style", "Duration", "Speed", "Lessons", "Status", "Reports", "Actions"]} rows={visible.map((asset) => ({ id: asset.id, cells: [<button key="play" type="button" onClick={() => play(asset)} aria-label={`${playing === asset.id ? "Stop" : "Preview"} ${asset.id}`} className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700">{playing === asset.id ? <Square className="size-4" /> : <Play className="size-4" />}</button>, <button key="edit" type="button" onClick={() => setEditing(asset)} className="font-bold text-teal-700">{asset.id}</button>, <span key="jp" lang="ja">{asset.japaneseText}</span>, asset.voice, asset.speakingStyle, asset.durationSeconds ? `${asset.durationSeconds}s` : <AdminStatus key="missing">missing</AdminStatus>, `${asset.playbackSpeed}×`, asset.linkedLessonIds.length, <AdminStatus key="status">{asset.status}</AdminStatus>, asset.reportCount, <div key="actions" className="flex"><button type="button" aria-label="Regenerate mock audio" onClick={() => save({ ...asset, durationSeconds: asset.durationSeconds || 4.5, status: "review" })} className="grid size-9 place-items-center rounded-lg hover:bg-slate-100"><RefreshCw className="size-4" /></button><button type="button" aria-label="Archive audio" onClick={() => save({ ...asset, status: "archived" })} className="grid size-9 place-items-center rounded-lg hover:bg-slate-100"><Archive className="size-4" /></button></div>] }))} /> : <AdminEmptyState title="No audio assets" description="Change the filters to restore audio records." />}
        </AdminSection>
        <AdminSection title={editing ? "Audio metadata" : "Select audio"} description="Edit, replace, regenerate, link, or unlink.">
          {editing ? <AudioForm asset={editing} onChange={setEditing} onSave={() => { save(editing); setEditing(null); }} /> : <div className="py-10 text-center text-sm text-slate-500"><Headphones className="mx-auto mb-3 size-8 text-slate-300" />Select an audio record.</div>}
        </AdminSection>
      </div>
    </>
  );
}

function AudioForm({ asset, onChange, onSave }: { asset: AudioAsset; onChange: (asset: AudioAsset) => void; onSave: () => void }) {
  return <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSave(); }}><Field label="Japanese text"><textarea value={asset.japaneseText} onChange={(event) => onChange({ ...asset, japaneseText: event.target.value })} className="admin-input min-h-20 py-3" lang="ja" /></Field><Field label="Voice"><input value={asset.voice} onChange={(event) => onChange({ ...asset, voice: event.target.value })} className="admin-input" /></Field><Field label="Speaking style"><select value={asset.speakingStyle} onChange={(event) => onChange({ ...asset, speakingStyle: event.target.value as AudioAsset["speakingStyle"] })} className="admin-input"><option>neutral</option><option>friendly</option><option>formal</option></select></Field><Field label="Duration seconds"><input type="number" min={0} step={0.1} value={asset.durationSeconds} onChange={(event) => onChange({ ...asset, durationSeconds: Number(event.target.value) })} className="admin-input" /></Field><Field label="Playback speed"><input type="number" min={0.5} max={2} step={0.05} value={asset.playbackSpeed} onChange={(event) => onChange({ ...asset, playbackSpeed: Number(event.target.value) })} className="admin-input" /></Field><Field label="Linked lesson IDs"><textarea value={asset.linkedLessonIds.join("\n")} onChange={(event) => onChange({ ...asset, linkedLessonIds: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} className="admin-input min-h-20 py-3" /></Field><Field label="Status"><select value={asset.status} onChange={(event) => onChange({ ...asset, status: event.target.value as AssetStatus })} className="admin-input">{["active", "review", "reported", "archived", "low quality"].map((item) => <option key={item}>{item}</option>)}</select></Field><Button type="submit" className="w-full rounded-xl"><Save className="size-4" /> Save audio</Button></form>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="field-label">{label}</span>{children}</label>; }
