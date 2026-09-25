import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform, StyleSheet } from 'react-native';
import { signInWithApple } from '@/lib/native-auth';

type AppleAuthButtonProps = {
  disabled?: boolean;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
};

export function AppleAuthButton({ disabled, onError, onLoadingChange }: AppleAuthButtonProps) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAvailable);
  }, []);

  if (!available) return null;

  async function authenticate() {
    if (disabled) return;
    onError('');
    onLoadingChange(true);
    try {
      await signInWithApple();
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('ERR_REQUEST_CANCELED')) return;
      onError(cause instanceof Error ? cause.message : 'Apple sign-in could not be completed.');
    } finally {
      onLoadingChange(false);
    }
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={16}
      onPress={authenticate}
      style={[styles.button, disabled && styles.disabled]}
    />
  );
}

const styles = StyleSheet.create({
  button: { width: '100%', height: 54 },
  disabled: { opacity: 0.45 },
});
