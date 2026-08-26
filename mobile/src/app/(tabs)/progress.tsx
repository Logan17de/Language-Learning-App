import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Copy, Eyebrow, Heading, InlineNotice, LoadingState, Screen } from '@/components/ui';
import { palette, radius, space } from '@/constants/theme';
import { loadMastery, loadProfile } from '@/lib/aiko-repository';
import type { MasteryItem, Profile } from '@/types/domain';

function average(items: MasteryItem[], type: string) { const group = items.filter((item) => item.item_type === type); return group.length ? Math.round(group.reduce((sum, item) => sum + item.mastery, 0) / group.length) : 0; }
function MasteryBar({ label, value }: { label: string; value: number }) { return <View style={styles.barGroup}><View style={styles.barHeader}><Text style={styles.barLabel}>{label}</Text><Text style={styles.barValue}>{value}%</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${value}%` }]} /></View></View>; }
export default function ProgressScreen() {
  const [profile, setProfile] = useState<Profile | null>(null); const [items, setItems] = useState<MasteryItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { let active = true; void Promise.all([loadProfile(), loadMastery()]).then(([nextProfile, nextItems]) => { if (active) { setProfile(nextProfile); setItems(nextItems); } }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Progress could not be loaded.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []));
  if (loading) return <Screen scroll={false}><LoadingState label="Reading your mastery…" /></Screen>;
  return <Screen><View style={styles.intro}><Eyebrow>Progress</Eyebrow><Heading>{profile?.current_jlpt_level} mastery</Heading><Copy>Your completed sections update this evidence in the background.</Copy></View>{error && <InlineNotice tone="danger">{error}</InlineNotice>}
    <Card style={styles.summary}><Text style={styles.summaryValue}>{profile?.xp ?? 0}</Text><Text style={styles.summaryLabel}>XP earned</Text><View style={styles.summaryRow}><Text style={styles.muted}>{profile?.streak_days ?? 0} day streak</Text><Text style={styles.muted}>{profile?.total_study_minutes ?? 0} minutes studied</Text></View></Card>
    <Card style={styles.mastery}><Text style={styles.cardTitle}>Mastery by language type</Text><MasteryBar label="Kanji" value={average(items, 'kanji')} /><MasteryBar label="Vocabulary" value={average(items, 'vocabulary')} /><MasteryBar label="Grammar" value={average(items, 'grammar')} /><Copy>AIko starts unknown language at 0 and raises scores from lesson evidence—not from a manual star list.</Copy></Card>
  </Screen>;
}
const styles = StyleSheet.create({ intro: { gap: space.sm }, summary: { backgroundColor: palette.moss900 }, summaryValue: { color: palette.white, fontSize: 42, fontWeight: '800' }, summaryLabel: { color: palette.persimmon200, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xl }, muted: { color: '#D5E4DD', fontSize: 12 }, mastery: { gap: space.xl }, cardTitle: { color: palette.ink, fontSize: 19, fontWeight: '800' }, barGroup: { gap: space.sm }, barHeader: { flexDirection: 'row', justifyContent: 'space-between' }, barLabel: { color: palette.ink, fontWeight: '700' }, barValue: { color: palette.moss700, fontWeight: '800' }, track: { height: 9, borderRadius: radius.pill, backgroundColor: palette.moss100, overflow: 'hidden' }, fill: { height: '100%', borderRadius: radius.pill, backgroundColor: palette.moss700 } });
