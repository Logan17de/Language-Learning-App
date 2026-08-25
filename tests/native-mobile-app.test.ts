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
