import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? '';
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? '';

let googleConfigured = false;

function configureGoogleSignIn() {
  if (!googleWebClientId) {
    throw new Error('Google sign-in is not configured for this app yet.');
  }
  if (Platform.OS === 'ios' && !googleIosClientId) {
    throw new Error('Google sign-in is not configured for iPhone yet.');
  }
  if (googleConfigured) return;

  GoogleSignin.configure({
    webClientId: googleWebClientId,
    ...(Platform.OS === 'ios' ? { iosClientId: googleIosClientId } : {}),
    offlineAccess: false,
  });
  googleConfigured = true;
}

function googleSignInError(cause: unknown) {
  if (!isErrorWithCode(cause)) return cause;
  if (cause.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return new Error('Google Play services must be installed or updated before signing in.');
  }
  if (cause.code === statusCodes.IN_PROGRESS) {
    return new Error('Google sign-in is already open.');
  }
  return cause;
}

export async function signInWithGoogle() {
  if (Platform.OS === 'web') {
    throw new Error('Use the AIko website to sign in from a web browser.');
  }

  configureGoogleSignIn();

  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return false;
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
    if (isErrorWithCode(cause) && cause.code === statusCodes.SIGN_IN_CANCELLED) return false;
    throw googleSignInError(cause);
  }
}

export async function signOutFromGoogle() {
  if (Platform.OS === 'web' || !GoogleSignin.hasPreviousSignIn()) return;
  await GoogleSignin.signOut();
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
