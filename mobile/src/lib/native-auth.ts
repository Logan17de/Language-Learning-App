import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? '';
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? '';

let googleModule: GoogleModule | null | undefined;

function loadGoogleModule(): GoogleModule | null {
  if (googleModule !== undefined) return googleModule;
  try {
    // Keep this lazy: older binaries and Expo Go do not contain RNGoogleSignin.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    googleModule = require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    googleModule = null;
  }
  return googleModule;
}

export function isGoogleSignInAvailable() {
  if (Platform.OS === 'web' || !googleWebClientId) return false;
  if (Platform.OS === 'ios' && !googleIosClientId) return false;
  return loadGoogleModule() !== null;
}

function configureGoogleSignIn(google: GoogleModule) {
  if (!googleWebClientId) {
    throw new Error('Google sign-in is not configured for this app yet.');
  }
  if (Platform.OS === 'ios' && !googleIosClientId) {
    throw new Error('Google sign-in is not configured for iPhone yet.');
  }

  google.GoogleSignin.configure({
    webClientId: googleWebClientId,
    ...(Platform.OS === 'ios' ? { iosClientId: googleIosClientId } : {}),
    offlineAccess: false,
  });
}

function googleSignInError(cause: unknown, google: GoogleModule) {
  if (!google.isErrorWithCode(cause)) return cause;
  if (cause.code === google.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return new Error('Google Play services must be installed or updated before signing in.');
  }
  if (cause.code === google.statusCodes.IN_PROGRESS) {
    return new Error('Google sign-in is already open.');
  }
  if (cause.code === '10' || cause.code === 'DEVELOPER_ERROR') {
    return new Error('Google sign-in is not set up for this build of AIko yet.');
  }
  if (cause.code === google.statusCodes.NULL_PRESENTER) {
    return new Error('Google sign-in could not open. Please try again.');
  }
  return cause;
}

export async function signInWithGoogle() {
  if (Platform.OS === 'web') {
    throw new Error('Use the AIko website to sign in from a web browser.');
  }

  const google = loadGoogleModule();
  if (!google) {
    throw new Error('This version of AIko needs an app update before Google sign-in can be used.');
  }
  configureGoogleSignIn(google);

  try {
    if (Platform.OS === 'android') {
      await google.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    const response = await google.GoogleSignin.signIn();
    if (!google.isSuccessResponse(response)) return false;
    if (!response.data.idToken) {
      throw new Error('Google did not return the identity token required to sign in.');
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: response.data.idToken,
    });
    if (error) throw error;
    return true;
  } catch (cause) {
    throw googleSignInError(cause, google);
  }
}

export async function signOutFromGoogle() {
  if (Platform.OS === 'web') return;
  const google = loadGoogleModule();
  if (!google) return;
  try {
    if (!google.GoogleSignin.hasPreviousSignIn()) return;
    await google.GoogleSignin.signOut();
  } catch {
    // A provider cleanup failure must never keep the user signed in to AIko.
  }
}

export async function signInWithApple() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const credential = await AppleAuthentication.signInAsync({
    nonce: hashedNonce,
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple sign-in did not return an identity token.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  const fullName = [credential.fullName?.givenName, credential.fullName?.middleName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ');
  if (fullName) {
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        display_name: fullName,
        full_name: fullName,
        given_name: credential.fullName?.givenName,
        family_name: credential.fullName?.familyName,
      },
    });
    if (updateError) throw updateError;
  }

  return true;
}
