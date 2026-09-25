import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Heading, InlineNotice, LoadingState, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export default function AuthCallback() {
  const router = useRouter(); const { code } = useLocalSearchParams<{ code?: string }>(); const { session } = useSession(); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!code) return; let active = true; void supabase.auth.exchangeCodeForSession(code).then(({ data, error: exchangeError }) => { if (exchangeError) throw exchangeError; if (!data.session) throw new Error('No session was returned.'); if (active) router.replace('/(tabs)'); }).catch(() => { if (active) setError('This confirmation link has expired or was already used. You can return to sign in.'); }); return () => { active = false; }; }, [code, router]);
  if (error) return <Screen><Heading>Account confirmation could not be completed.</Heading><InlineNotice tone="danger">{error}</InlineNotice><Button label="Return to sign in" onPress={() => router.replace('/(auth)/login')} /></Screen>;
  if (session || !code) return <Redirect href={session ? '/(tabs)' : '/(auth)/login'} />;
  return <Screen scroll={false}><LoadingState label="Securing your AIko account…" /></Screen>;
}
