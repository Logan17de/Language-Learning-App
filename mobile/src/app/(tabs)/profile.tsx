import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Brand, Button, Card, Copy, Eyebrow, Heading, InlineNotice, LoadingState, Screen } from '@/components/ui';
import { palette, space } from '@/constants/theme';
import { loadProfile } from '@/lib/aiko-repository';
import { useSession } from '@/providers/session-provider';
import type { Profile } from '@/types/domain';

export default function ProfileScreen() {
  const router = useRouter(); const { signOut } = useSession(); const [profile, setProfile] = useState<Profile | null>(null); const [loading, setLoading] = useState(true); const [signingOut, setSigningOut] = useState(false); const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { let active = true; void loadProfile().then((next) => { if (active) setProfile(next); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Profile could not be loaded.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []));
  async function handleSignOut() { setError(null); setSigningOut(true); try { await signOut(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'AIko could not sign out. Please try again.'); } finally { setSigningOut(false); } }
  if (loading) return <Screen scroll={false}><LoadingState label="Loading your profile…" /></Screen>;
  return <Screen><Brand /><View style={styles.intro}><Eyebrow>Profile</Eyebrow><Heading>{profile?.display_name ?? 'Your AIko account'}</Heading><Copy>{profile?.email}</Copy></View>{error && <InlineNotice tone="danger">{error}</InlineNotice>}
    <Card style={styles.details}><Row label="Japanese level" value={profile?.current_jlpt_level ?? '—'} /><Row label="Plan" value={profile?.subscription_plan === 'free' ? 'Free' : 'Premium'} /><Row label="Account" value="Active" /></Card>
    <Button label="Plan and access" variant="secondary" icon="diamond-outline" onPress={() => router.push('/subscription')} /><Button label="Sign out" variant="quiet" icon="log-out-outline" onPress={handleSignOut} loading={signingOut} disabled={signingOut} />
  </Screen>;
}
function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>; }
const styles = StyleSheet.create({ intro: { gap: space.sm }, details: { gap: space.lg }, row: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: palette.line }, rowLabel: { color: palette.inkMuted }, rowValue: { color: palette.ink, fontWeight: '800' } });
