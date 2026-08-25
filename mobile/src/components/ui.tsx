import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, type TextStyle, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { palette, radius, shadow, space, type } from '@/constants/theme';

export function Screen({ children, scroll = true, contentStyle }: PropsWithChildren<{ scroll?: boolean; contentStyle?: ViewStyle }>) {
  const body = <View style={[styles.screenContent, contentStyle]}>{children}</View>;
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      {scroll ? (
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {body}
        </ScrollView>
      ) : body}
    </SafeAreaView>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandRow} accessibilityLabel="AIko">
      <View style={styles.brandMark}><Text style={styles.brandKanji}>愛</Text></View>
      {!compact && <View><Text style={styles.brandName}>AIko</Text><Text style={styles.brandMeaning}>AI + ko · child</Text></View>}
    </View>
  );
}

export function Eyebrow({ children }: PropsWithChildren) { return <Text style={styles.eyebrow}>{children}</Text>; }
export function Heading({ children, style }: PropsWithChildren<{ style?: TextStyle }>) { return <Text style={[styles.heading, style]}>{children}</Text>; }
export function Copy({ children, style }: PropsWithChildren<{ style?: TextStyle }>) { return <Text style={[styles.copy, style]}>{children}</Text>; }
export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) { return <View style={[styles.card, style]}>{children}</View>; }

export function Button({ label, onPress, icon, variant = 'primary', disabled = false, loading = false, style }: {
  label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  const variantStyle = buttonVariants[variant];
  const textStyle = buttonTextVariants[variant];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || loading} onPress={() => { void Haptics.selectionAsync(); onPress(); }} style={({ pressed }) => [styles.button, variantStyle, style, (disabled || loading) && styles.buttonDisabled, pressed && styles.buttonPressed]}>
      {loading ? <ActivityIndicator color={textStyle.color as string} /> : <>{icon ? <Ionicons name={icon} size={18} color={textStyle.color as string} /> : null}<Text style={[styles.buttonText, textStyle]}>{label}</Text></>}
    </Pressable>
  );
}

export function InlineNotice({ children, tone = 'info' }: PropsWithChildren<{ tone?: 'info' | 'warning' | 'danger' }>) {
  const color = tone === 'danger' ? palette.danger : tone === 'warning' ? palette.warning : palette.moss700;
  const backgroundColor = tone === 'danger' ? palette.dangerSoft : tone === 'warning' ? palette.warningSoft : palette.moss50;
  return <View style={[styles.notice, { backgroundColor }]}><Ionicons name={tone === 'danger' ? 'alert-circle-outline' : 'information-circle-outline'} size={19} color={color} /><Text style={[styles.noticeText, { color }]}>{children}</Text></View>;
}

export function LoadingState({ label = 'Loading AIko…' }: { label?: string }) {
  return <View style={styles.centerState}><ActivityIndicator size="large" color={palette.moss700} /><Text style={styles.stateTitle}>{label}</Text></View>;
}

export function EmptyState({ icon = 'leaf-outline', title, detail, action }: { icon?: keyof typeof Ionicons.glyphMap; title: string; detail: string; action?: ReactNode }) {
  return <Card style={styles.emptyCard}><View style={styles.emptyIcon}><Ionicons name={icon} size={24} color={palette.moss700} /></View><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateCopy}>{detail}</Text>{action}</Card>;
}

const buttonVariants: Record<string, ViewStyle> = {
  primary: { backgroundColor: palette.moss700, borderColor: palette.moss700 },
  secondary: { backgroundColor: palette.surface, borderColor: palette.moss200 },
  quiet: { backgroundColor: 'transparent', borderColor: 'transparent' },
  danger: { backgroundColor: palette.dangerSoft, borderColor: palette.dangerSoft },
};
const buttonTextVariants: Record<string, TextStyle> = {
  primary: { color: palette.white }, secondary: { color: palette.moss900 }, quiet: { color: palette.moss700 }, danger: { color: palette.danger },
};
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.paper },
  scrollContent: { flexGrow: 1 },
  screenContent: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: 120, gap: space.lg },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.moss900, alignItems: 'center', justifyContent: 'center' },
  brandKanji: { color: palette.persimmon200, fontSize: 21, fontWeight: '800', fontFamily: type.japanese },
  brandName: { color: palette.ink, fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  brandMeaning: { color: palette.inkMuted, fontSize: 10, letterSpacing: 0.7 },
  eyebrow: { color: palette.moss700, fontSize: 11, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  heading: { color: palette.ink, fontFamily: type.display, fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -1 },
  copy: { color: palette.inkMuted, fontSize: 15, lineHeight: 23 },
  card: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radius.lg, padding: space.xl, ...shadow },
  button: { minHeight: 54, paddingHorizontal: space.xl, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  buttonText: { fontSize: 15, fontWeight: '800' },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] }, buttonDisabled: { opacity: 0.5 },
  notice: { padding: space.lg, borderRadius: radius.md, flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  centerState: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  stateTitle: { color: palette.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  stateCopy: { color: palette.inkMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  emptyCard: { alignItems: 'center', gap: space.md },
  emptyIcon: { width: 48, height: 48, borderRadius: 18, backgroundColor: palette.moss100, alignItems: 'center', justifyContent: 'center' },
});
