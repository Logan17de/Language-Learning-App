import { useState } from 'react';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Brand, Button, Copy, Heading, InlineNotice, Screen } from '@/components/ui';
import { AppleAuthButton } from '@/components/apple-auth-button';
import { palette, radius, space } from '@/constants/theme';
import { signInWithGoogle } from '@/lib/native-auth';
import { supabase } from '@/lib/supabase';

export default function SignupScreen() {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [sent, setSent] = useState(false);
  const strongEnough = password.length >= 8;
  async function submit() { setError(null); setLoading(true); const result = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: Linking.createURL('auth/callback') } }); if (result.error) setError(result.error.message); else if (!result.data.session) setSent(true); setLoading(false); }
  async function google() { setError(null); setLoading(true); try { await signInWithGoogle(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Google sign-in could not be completed.'); } finally { setLoading(false); } }
  return <Screen><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.content}>
    <Brand /><View style={styles.intro}><Heading>Build Japanese that lasts.</Heading><Copy>Create your account, then choose your level and learning interests.</Copy></View>
    {sent ? <InlineNotice>Check your email to confirm this AIko account, then return to the app.</InlineNotice> : <View style={styles.form}>
      <AppleAuthButton disabled={loading} onError={(message) => setError(message || null)} onLoadingChange={setLoading} />
      <Button label="Create account with Google" icon="logo-google" variant="secondary" onPress={google} loading={loading} />
      <Text style={styles.label}>First name</Text><TextInput autoComplete="name" value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={palette.inkMuted} style={styles.input} />
      <Text style={styles.label}>Email address</Text><TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={palette.inkMuted} style={styles.input} />
      <Text style={styles.label}>Password</Text><TextInput autoCapitalize="none" autoComplete="new-password" secureTextEntry value={password} onChangeText={setPassword} placeholder="8 or more characters" placeholderTextColor={palette.inkMuted} style={styles.input} />
      <Text style={[styles.strength, strongEnough && styles.strong]}>Minimum 8 characters {strongEnough ? '· Ready' : ''}</Text>{error && <InlineNotice tone="danger">{error}</InlineNotice>}<Button label="Create my account" onPress={submit} loading={loading} disabled={!name.trim() || !email.trim() || !strongEnough} />
    </View>}
    <Text style={styles.switchCopy}>Already have an account? <Link href="/(auth)/login" style={styles.link}>Sign in</Link></Text>
  </KeyboardAvoidingView></Screen>;
}
const styles = StyleSheet.create({ content: { gap: space.xl }, intro: { gap: space.sm }, form: { gap: space.md }, label: { color: palette.ink, fontSize: 14, fontWeight: '700', marginTop: space.xs }, input: { minHeight: 56, borderWidth: 1, borderColor: palette.line, borderRadius: radius.md, paddingHorizontal: space.lg, backgroundColor: palette.surface, color: palette.ink, fontSize: 16 }, strength: { color: palette.inkMuted, fontSize: 12 }, strong: { color: palette.moss700, fontWeight: '700' }, switchCopy: { color: palette.inkMuted, textAlign: 'center', fontSize: 14 }, link: { color: palette.moss700, fontWeight: '800' } });
