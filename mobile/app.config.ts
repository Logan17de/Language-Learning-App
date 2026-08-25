import type { ConfigContext, ExpoConfig } from 'expo/config';

const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? '';
const easProjectIdFromEnvironment = (
  process.env.EAS_PROJECT_ID?.trim()
  || process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim()
  || ''
);

function googleIosUrlScheme(clientId: string) {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId.endsWith(suffix)) return null;
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = googleIosUrlScheme(googleIosClientId);
  const plugins = [...(config.plugins ?? [])];
  const configuredProjectId = (
    easProjectIdFromEnvironment
    || (config.extra?.eas as { projectId?: string } | undefined)?.projectId
    || ''
  );
  const updateUrl = config.updates?.url || (
    configuredProjectId ? `https://u.expo.dev/${configuredProjectId}` : ''
  );

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
    runtimeVersion: { policy: 'fingerprint' },
    updates: {
      ...config.updates,
      enabled: Boolean(updateUrl),
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      ...(updateUrl ? { url: updateUrl } : {}),
    },
    extra: {
      ...config.extra,
      ...(configuredProjectId ? { eas: { projectId: configuredProjectId } } : {}),
    },
  };
};
