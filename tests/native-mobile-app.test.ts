import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('AIko native application boundary', () => {
  it('is a React Native application rather than a website wrapper', () => {
    const manifest = source('mobile/package.json');
    const layout = source('mobile/src/app/_layout.tsx');
    const lesson = source('mobile/src/app/lesson/[lessonId].tsx');

    expect(manifest).toContain('expo-router/entry');
    expect(layout).toContain('GestureHandlerRootView');
    expect(lesson).toContain('StoryReader');
    expect(`${layout}\n${lesson}`).not.toContain('WebView');
    expect(manifest).not.toContain('react-native-webview');
  });

  it('keeps microphone permission contextual and native', () => {
    const recorder = source('mobile/src/components/lesson/audio-practice.tsx');
    expect(recorder).toContain('AudioModule.requestRecordingPermissionsAsync()');
    expect(recorder).toContain('10_000');
    expect(recorder).not.toContain('speechSynthesis');
  });

  it('uses the native Apple authentication service on iOS', () => {
    const manifest = source('mobile/app.json');
    const auth = source('mobile/src/lib/native-auth.ts');
    const button = source('mobile/src/components/apple-auth-button.tsx');

    expect(manifest).toContain('"usesAppleSignIn": true');
    expect(auth).toContain('AppleAuthentication.signInAsync');
    expect(auth).toContain("provider: 'apple'");
    expect(button).toContain('AppleAuthenticationButton');
    expect(button).not.toContain('WebBrowser');
  });

  it('uses lazy native Google authentication without a browser OAuth fallback', () => {
    const auth = source('mobile/src/lib/native-auth.ts');
    expect(auth).toContain("provider: 'google'");
    expect(auth).toContain('signInWithIdToken');
    expect(auth).toContain("require('@react-native-google-signin/google-signin')");
    expect(auth).toContain("Platform.OS === 'web' || !googleWebClientId");
    expect(auth).toContain("Platform.OS === 'ios' && !googleIosClientId");
    expect(auth).not.toContain("from '@react-native-google-signin/google-signin'");
    expect(auth).not.toContain('signInWithOAuth');
    expect(auth).not.toContain('WebBrowser');
  });

  it('keeps OTA runtime matching independent from EAS environment variables', () => {
    const config = source('mobile/app.config.ts');
    expect(config).toContain("runtimeVersion: { policy: 'appVersion' }");
    expect(config).not.toContain('EAS_PROJECT_ID');
    expect(config).not.toContain('EXPO_PUBLIC_EAS_PROJECT_ID');
  });

  it('uses PKCE and handles native email confirmation failures', () => {
    const client = source('mobile/src/lib/supabase.ts');
    const callback = source('mobile/src/app/(auth)/auth/callback.tsx');
    const readme = source('mobile/README.md');
    expect(client).toContain("flowType: 'pkce'");
    expect(callback).toContain('exchangeCodeForSession');
    expect(callback).toContain('.catch(');
    expect(callback).toContain('Return to sign in');
    expect(readme).toContain('aiko://auth/callback');
    expect(readme).toContain('/--/auth/callback');
  });

  it('allows native bearer sessions on the APIs used by the app', () => {
    const serverClient = source('lib/supabase/server.ts');
    expect(serverClient).toContain('request?.headers.get("authorization")');
    for (const route of [
      'app/api/custom-lessons/generate/route.ts',
      'app/api/custom-lessons/status/route.ts',
      'app/api/audio/tts/route.ts',
      'app/api/audio/transcribe/route.ts',
    ]) {
      expect(source(route)).toContain('authorize("learn", request)');
    }
  });
});
