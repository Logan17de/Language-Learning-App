import { Redirect } from 'expo-router';
import { LoadingState } from '@/components/ui';
import { useSession } from '@/providers/session-provider';

export default function Index() {
  const { loading, session } = useSession();
  if (loading) return <LoadingState />;
  return <Redirect href={session ? '/(tabs)' : '/(auth)/login'} />;
}
