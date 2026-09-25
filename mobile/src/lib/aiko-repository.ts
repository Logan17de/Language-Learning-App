import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiUrl, supabase } from '@/lib/supabase';
import type { JLPTLevel, LessonCreationState, MasteryItem, PlayableLesson, Profile } from '@/types/domain';

const lessonCacheKey = (lessonId: string) => `aiko:lesson:${lessonId}:v1`;

function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function integer(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0; }
function level(value: unknown): JLPTLevel | null { return ['N5', 'N4', 'N3', 'N2', 'N1'].includes(String(value)) ? value as JLPTLevel : null; }

function parseCreationState(value: unknown): LessonCreationState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.plan !== 'free' && row.plan !== 'premium') return null;
  const resumeState = row.resume_lesson_state === 'ready' || row.resume_lesson_state === 'active' ? row.resume_lesson_state : null;
  return {
    plan: row.plan,
    canCreate: row.can_create === true,
    dailyLimit: integer(row.daily_limit),
    creationsToday: integer(row.creations_today),
    requestId: text(row.today_request_id ?? row.request_id),
    requestStatus: text(row.today_request_status ?? row.request_status),
    lessonId: text(row.today_lesson_id ?? row.lesson_id),
    lessonState: text(row.today_lesson_state ?? row.lesson_state),
    resumeTopic: text(row.resume_topic),
    resumeLevel: level(row.resume_level),
    resumeLessonId: text(row.resume_lesson_id),
    resumeLessonState: resumeState,
  };
}

export async function loadProfile(): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Your session has expired.');
  const { data, error } = await supabase.from('profiles').select('id,display_name,email,current_jlpt_level,subscription_plan,role,xp,streak_days,total_study_minutes').eq('id', auth.user.id).single();
  if (error || !data) throw new Error(error?.message || 'Your profile could not be loaded.');
  return data as Profile;
}

export async function loadLessonCreationState(): Promise<LessonCreationState> {
  const { data, error } = await supabase.rpc('get_lesson_creation_state');
  if (error) throw new Error(error.message);
  const state = parseCreationState(data);
  if (!state) throw new Error('Your lesson path could not be loaded.');
  return state;
}

export async function loadMastery(): Promise<MasteryItem[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Your session has expired.');
  const { data, error } = await supabase.from('learner_mastery').select('item_type,mastery,meaning_score,recognition_score,pronunciation_score').eq('user_id', auth.user.id).in('item_type', ['kanji', 'vocabulary', 'grammar']);
  if (error) throw new Error(error.message);
  return (data ?? []) as MasteryItem[];
}

function isPlayable(value: unknown): value is PlayableLesson {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>).lesson && (value as Record<string, unknown>).version);
}

export async function loadPlayableLesson(lessonId: string): Promise<{ lesson: PlayableLesson; cached: boolean }> {
  const { data, error } = await supabase.rpc('get_playable_lesson_payload', { p_lesson_id: lessonId });
  if (!error && isPlayable(data)) {
    await AsyncStorage.setItem(lessonCacheKey(lessonId), JSON.stringify(data));
    return { lesson: data, cached: false };
  }
  const cached = await AsyncStorage.getItem(lessonCacheKey(lessonId));
  if (cached) {
    const parsed: unknown = JSON.parse(cached);
    if (isPlayable(parsed)) return { lesson: parsed, cached: true };
  }
  throw new Error(error?.message || 'This lesson could not be loaded.');
}

export async function startOrResumeLesson(lesson: PlayableLesson) {
  const { data, error } = await supabase.rpc('start_or_resume_lesson_session', { p_lesson_id: lesson.lesson.id, p_lesson_version_id: lesson.version.id });
  if (error) throw new Error(error.message);
  return data;
}

export async function authorizedRequest(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Your session has expired.');
  const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { ...(!isForm ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${data.session.access_token}`, ...(init?.headers ?? {}) },
  });
}

export async function requestListeningAudio(textValue: string, audioAssetId?: string | null) {
  const response = await authorizedRequest('/api/audio/tts', { method: 'POST', body: JSON.stringify({ text: textValue, audioAssetId }) });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok || typeof payload.url !== 'string') throw new Error(text(payload.error) ?? 'Audio could not be loaded.');
  return payload.url;
}

export async function transcribeSpeaking(uri: string, exerciseId: string) {
  const form = new FormData();
  form.append('exerciseId', exerciseId);
  form.append('audio', { uri, name: 'aiko-speaking.m4a', type: 'audio/m4a' } as unknown as Blob);
  const response = await authorizedRequest('/api/audio/transcribe', { method: 'POST', body: form, headers: {} });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(text(payload.error) ?? 'Your recording could not be checked.');
  return { transcript: text(payload.transcript) ?? '', score: integer(payload.score) };
}

export async function createCustomLesson(topic: string, selectedLevel: JLPTLevel) {
  const response = await authorizedRequest('/api/custom-lessons/generate', { method: 'POST', body: JSON.stringify({ topic, level: selectedLevel }) });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(text(payload.error) ?? 'AIko could not start this lesson.');
  return payload;
}

export async function loadGenerationStatus(requestId: string) {
  const response = await authorizedRequest(`/api/custom-lessons/status?requestId=${encodeURIComponent(requestId)}`);
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(text(payload.error) ?? 'Lesson progress could not be loaded.');
  return payload;
}
