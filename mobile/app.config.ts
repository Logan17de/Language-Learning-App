import type { ConfigContext, ExpoConfig } from 'expo/config';

const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? '';

function googleIosUrlScheme(clientId: string) {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId.endsWith(suffix)) return null;
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = googleIosUrlScheme(googleIosClientId);
  const plugins = [...(config.plugins ?? [])];

  if (iosUrlScheme) {
    plugins.push([
      '@react-native-google-signin/google-signin',
      { iosUrlScheme },
    ]);
  }

  return {
    ...config,
    name: config.name ?? 'AIko',
    slug: config.slug ?? 'aiko',
    plugins,
    // Native changes require an app-version bump and a new build. Updates for
    // one app version therefore cannot be delivered to an incompatible binary.
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      ...config.updates,
      enabled: Boolean(config.updates?.url),
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
  };
};
