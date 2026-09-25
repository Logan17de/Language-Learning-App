import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Copy, Eyebrow, Heading, InlineNotice, LoadingState, Screen } from '@/components/ui';
import { palette, space } from '@/constants/theme';
import { loadProfile } from '@/lib/aiko-repository';
import type { Profile } from '@/types/domain';

export default function SubscriptionScreen() {
  const router = useRouter(); const [profile, setProfile] = useState<Profile | null>(null); const [loading, setLoading] = useState(true);
  useFocusEffect(useCallback(() => { void loadProfile().then(setProfile).finally(() => setLoading(false)); }, []));
  if (loading) return <Screen scroll={false}><LoadingState label="Checking your plan…" /></Screen>;
  const premium = profile?.subscription_plan !== 'free';
  return <Screen><View style={styles.header}><Eyebrow>Plan and access</Eyebrow><Heading>{premium ? 'AIko Premium' : 'AIko Free'}</Heading><Copy>{premium ? 'Premium access is active on this account and works across your devices.' : 'Your core Japanese learning path is active.'}</Copy></View>
    <Card style={styles.card}><Text style={styles.title}>{premium ? 'Included with Premium' : 'Included now'}</Text>{(premium ? ['Custom lesson topics', 'Listening practice', 'Speaking practice', 'All core lesson sections'] : ['Level-matched lessons', 'Story word support', 'Vocabulary and grammar practice', 'Reading comprehension']).map((item) => <View key={item} style={styles.item}><Text style={styles.check}>✓</Text><Text style={styles.itemText}>{item}</Text></View>)}</Card>
    {!premium && <InlineNotice>Premium purchase is not available in this app yet. Existing Premium access is recognized automatically.</InlineNotice>}
    <Button label="Close" onPress={() => router.back()} />
  </Screen>;
}
const styles = StyleSheet.create({ header: { gap: space.sm }, card: { gap: space.lg }, title: { color: palette.ink, fontSize: 20, fontWeight: '800' }, item: { flexDirection: 'row', gap: space.md, alignItems: 'center' }, check: { color: palette.moss700, fontSize: 18, fontWeight: '900' }, itemText: { color: palette.ink, fontSize: 15, flex: 1 } });
