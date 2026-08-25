import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { LoadingState, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>(); const { session } = useSession(); const [done, setDone] = useState(!code);
  useEffect(() => { if (!code) return; void supabase.auth.exchangeCodeForSession(code).finally(() => setDone(true)); }, [code]);
  if (session || done) return <Redirect href={session ? '/(tabs)' : '/(auth)/login'} />;
  return <Screen scroll={false}><LoadingState label="Securing your AIko account…" /></Screen>;
}
