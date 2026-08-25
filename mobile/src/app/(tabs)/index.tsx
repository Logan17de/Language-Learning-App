import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { Brand, Button, Card, Copy, Eyebrow, Heading, InlineNotice, LoadingState, Screen } from '@/components/ui';
import { palette, radius, space, type } from '@/constants/theme';
import { loadLessonCreationState, loadProfile } from '@/lib/aiko-repository';
import type { LessonCreationState, Profile } from '@/types/domain';

export default function HomeScreen() {
  const router = useRouter(); const [profile, setProfile] = useState<Profile | null>(null); const [path, setPath] = useState<LessonCreationState | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setError(null); try { const [nextProfile, nextPath] = await Promise.all([loadProfile(), loadLessonCreationState()]); setProfile(nextProfile); setPath(nextPath); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your learning path could not be loaded.'); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (loading && !profile) return <Screen scroll={false}><LoadingState label="Finding your next lesson…" /></Screen>;
  const lessonId = path?.resumeLessonId ?? (path?.lessonState === 'ready' ? path.lessonId : null);
  const isPremium = profile?.subscription_plan !== 'free';
  return <Screen><Brand /><View style={styles.intro}><Eyebrow>Your learning path</Eyebrow><Heading>{profile ? `おかえり、${profile.display_name.split(' ')[0]}` : 'Welcome back.'}</Heading><Copy>AIko keeps your next step focused on the Japanese you need now.</Copy></View>
    {error && <InlineNotice tone="danger">{error}</InlineNotice>}
    <LinearGradient colors={[palette.moss900, palette.moss800]} style={styles.hero}>
      <Text style={styles.heroKicker}>{lessonId ? 'YOUR LESSON IS READY' : 'NEXT LESSON'}</Text><Text style={styles.heroTitle}>{path?.resumeTopic ?? 'AIko is choosing what comes next.'}</Text><Text style={styles.heroCopy}>{lessonId ? `${path?.resumeLevel ?? profile?.current_jlpt_level} · Continue from your last completed section.` : 'Open Learn to begin a level-matched lesson.'}</Text>
      <Button label={lessonId ? 'Resume lesson' : 'Go to Learn'} icon="arrow-forward" onPress={() => lessonId ? router.push(`/lesson/${lessonId}`) : router.push('/(tabs)/learn')} style={styles.heroButton} />
    </LinearGradient>
    <View style={styles.metricRow}><Card style={styles.metric}><Text style={styles.metricValue}>{profile?.streak_days ?? 0}</Text><Text style={styles.metricLabel}>day streak</Text></Card><Card style={styles.metric}><Text style={styles.metricValue}>{profile?.xp ?? 0}</Text><Text style={styles.metricLabel}>total XP</Text></Card></View>
    <Card style={styles.premium}><View style={styles.premiumHeader}><View><Eyebrow>{isPremium ? 'Premium active' : 'AIko plan'}</Eyebrow><Text style={styles.cardTitle}>{isPremium ? 'Your full lesson flow is open.' : 'Your core path is ready.'}</Text></View></View><Copy>{isPremium ? 'Custom topics, Listening, and Speaking are available on this account.' : 'Story, vocabulary, grammar, and reading stay connected to your level.'}</Copy><Button label="View plan" variant="secondary" onPress={() => router.push('/subscription')} /></Card>
  </Screen>;
}
const styles = StyleSheet.create({ intro: { gap: space.sm }, hero: { borderRadius: radius.lg, padding: space.xl, gap: space.md, overflow: 'hidden' }, heroKicker: { color: palette.persimmon200, fontSize: 10, fontWeight: '900', letterSpacing: 1.7 }, heroTitle: { color: palette.white, fontFamily: type.display, fontSize: 28, lineHeight: 34, fontWeight: '700' }, heroCopy: { color: '#D5E4DD', fontSize: 14, lineHeight: 21 }, heroButton: { marginTop: space.sm, backgroundColor: palette.persimmon600, borderColor: palette.persimmon600 }, metricRow: { flexDirection: 'row', gap: space.md }, metric: { flex: 1, padding: space.lg }, metricValue: { color: palette.moss900, fontSize: 26, fontWeight: '800' }, metricLabel: { color: palette.inkMuted, fontSize: 12, marginTop: space.xs }, premium: { gap: space.lg }, premiumHeader: { flexDirection: 'row', justifyContent: 'space-between' }, cardTitle: { color: palette.ink, fontSize: 19, lineHeight: 25, fontWeight: '800', marginTop: space.sm } });
