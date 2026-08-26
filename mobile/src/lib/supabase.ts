import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

export const isSupabaseConfigured = Boolean(url && publishableKey);

export const supabase = createClient(
  url || 'https://unconfigured.supabase.co',
  publishableKey || 'sb_publishable_unconfigured',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  },
);

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const apiUrl = (process.env.EXPO_PUBLIC_API_URL?.trim() || 'https://aiko.zetbros.com').replace(/\/$/, '');
