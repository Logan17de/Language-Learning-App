import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Button, Card, Copy, InlineNotice } from '@/components/ui';
import { palette, space, type } from '@/constants/theme';
import { requestListeningAudio, transcribeSpeaking } from '@/lib/aiko-repository';

export function ListeningPlayer({ text, audioAssetId }: { text: string; audioAssetId: string | null }) {
  const player = useAudioPlayer(null); const [loading, setLoading] = useState(false); const [ready, setReady] = useState(false); const [error, setError] = useState<string | null>(null);
  async function play() { setError(null); try { if (!ready) { setLoading(true); const url = await requestListeningAudio(text, audioAssetId); player.replace(url); setReady(true); } player.seekTo(0); player.play(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Audio could not be played.'); } finally { setLoading(false); } }
  return <View style={styles.audio}><Button label={ready ? 'Play again' : 'Play listening audio'} icon="headset-outline" onPress={play} loading={loading} />{error && <InlineNotice tone="danger">{error}</InlineNotice>}</View>;
}

export function SpeakingRecorder({ exerciseId, sentence }: { exerciseId: string; sentence: string }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY); const state = useAudioRecorderState(recorder, 250); const timer = useRef<ReturnType<typeof setTimeout> | null>(null); const [checking, setChecking] = useState(false); const [transcript, setTranscript] = useState(''); const [score, setScore] = useState<number | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function stopAndCheck() { if (timer.current) clearTimeout(timer.current); timer.current = null; try { await recorder.stop(); const uri = recorder.uri; if (!uri) throw new Error('No recording was captured.'); setChecking(true); const result = await transcribeSpeaking(uri, exerciseId); setTranscript(result.transcript); setScore(result.score); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your recording could not be checked.'); } finally { setChecking(false); } }
  async function record() { setError(null); setTranscript(''); setScore(null); const permission = await AudioModule.requestRecordingPermissionsAsync(); if (!permission.granted) { setError('Microphone access is needed only while you read this sentence aloud.'); return; } await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true }); await recorder.prepareToRecordAsync(); recorder.record(); timer.current = setTimeout(() => { void stopAndCheck(); }, 10_000); }
  return <Card style={styles.speaking}><Text style={styles.sentence}>{sentence}</Text><Copy>Read the sentence aloud. Recording stops after 10 seconds.</Copy><Button label={state.isRecording ? `Stop · ${Math.ceil(state.durationMillis / 1000)}s` : 'Start recording'} icon={state.isRecording ? 'stop' : 'mic-outline'} onPress={() => state.isRecording ? void stopAndCheck() : void record()} loading={checking} />{transcript ? <View style={styles.result}><Text style={styles.resultLabel}>AIko heard</Text><Text style={styles.transcript}>{transcript}</Text><Text style={styles.score}>Sentence match {score ?? 0}%</Text></View> : null}{error && <InlineNotice tone="danger">{error}</InlineNotice>}</Card>;
}
const styles = StyleSheet.create({ audio: { gap: space.md }, speaking: { gap: space.lg }, sentence: { color: palette.ink, fontFamily: type.japanese, fontSize: 24, lineHeight: 36, textAlign: 'center' }, result: { backgroundColor: palette.moss50, padding: space.lg, borderRadius: 16, gap: space.sm }, resultLabel: { color: palette.moss700, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 }, transcript: { color: palette.ink, fontFamily: type.japanese, fontSize: 18 }, score: { color: palette.moss700, fontWeight: '800' } });
