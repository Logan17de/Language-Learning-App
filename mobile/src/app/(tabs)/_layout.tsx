import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '@/constants/theme';
import { useSession } from '@/providers/session-provider';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = { index: 'home-outline', learn: 'sparkles-outline', progress: 'analytics-outline', profile: 'person-outline' };

export default function TabsLayout() {
  const { session } = useSession();
  if (!session) return <Redirect href="/(auth)/login" />;
  return <Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: palette.moss700, tabBarInactiveTintColor: palette.inkMuted, tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.line, height: 82, paddingTop: 8, paddingBottom: 12 }, tabBarLabelStyle: { fontSize: 11, fontWeight: '700' }, tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name]} color={color} size={size} /> })}>
    <Tabs.Screen name="index" options={{ title: 'Home' }} /><Tabs.Screen name="learn" options={{ title: 'Learn' }} /><Tabs.Screen name="progress" options={{ title: 'Progress' }} /><Tabs.Screen name="profile" options={{ title: 'Profile' }} />
  </Tabs>;
}
