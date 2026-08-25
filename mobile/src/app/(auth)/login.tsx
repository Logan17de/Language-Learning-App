import { useState } from 'react';
import { Link } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Brand, Button, Copy, Heading, InlineNotice, Screen } from '@/components/ui';
import { AppleAuthButton } from '@/components/apple-auth-button';
import { palette, radius, space } from '@/constants/theme';
import { signInWithGoogle } from '@/lib/native-auth';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export default function LoginScreen() {
  const { configured } = useSession();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit() { setError(null); setLoading(true); const result = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (result.error) setError(result.error.message); setLoading(false); }
  async function google() { setError(null); setLoading(true); try { await signInWithGoogle(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Google sign-in could not be completed.'); } finally { setLoading(false); } }
  return <Screen contentStyle={styles.screen}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.content}>
    <Brand /><View style={styles.intro}><Heading>Welcome back.</Heading><Copy>Continue your Japanese path on this device.</Copy></View>
    {!configured && <InlineNotice tone="warning">Add the public Supabase values from mobile/.env.example before signing in.</InlineNotice>}
    <View style={styles.form}>
      <AppleAuthButton disabled={!configured || loading} onError={(message) => setError(message || null)} onLoadingChange={setLoading} />
      <Button label="Continue with Google" icon="logo-google" variant="secondary" onPress={google} disabled={!configured} loading={loading} />
      <View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>OR USE EMAIL</Text><View style={styles.line} /></View>
      <Text style={styles.label}>Email address</Text><TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={palette.inkMuted} style={styles.input} />
      <Text style={styles.label}>Password</Text><TextInput autoCapitalize="none" autoComplete="current-password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor={palette.inkMuted} style={styles.input} />
      {error && <InlineNotice tone="danger">{error}</InlineNotice>}<Button label="Sign in" onPress={submit} loading={loading} disabled={!configured || !email || !password} />
    </View>
    <Text style={styles.switchCopy}>New to AIko? <Link href="/(auth)/signup" style={styles.link}>Create an account</Link></Text>
  </KeyboardAvoidingView></Screen>;
}
const styles = StyleSheet.create({ screen: { justifyContent: 'center' }, content: { gap: space.xl }, intro: { gap: space.sm }, form: { gap: space.md }, label: { color: palette.ink, fontSize: 14, fontWeight: '700', marginTop: space.xs }, input: { minHeight: 56, borderWidth: 1, borderColor: palette.line, borderRadius: radius.md, paddingHorizontal: space.lg, backgroundColor: palette.surface, color: palette.ink, fontSize: 16 }, divider: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginVertical: space.sm }, line: { flex: 1, height: 1, backgroundColor: palette.line }, or: { color: palette.inkMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }, switchCopy: { color: palette.inkMuted, textAlign: 'center', fontSize: 14 }, link: { color: palette.moss700, fontWeight: '800' } });
