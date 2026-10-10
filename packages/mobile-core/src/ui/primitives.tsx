import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top', 'left', 'right'],
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
}) {
  const { colors, spacing } = useTheme();
  const content = {
    padding: padded ? spacing.lg : 0,
    gap: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  };
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padded && { padding: spacing.lg, gap: spacing.lg }]}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

type Variant = 'title' | 'heading' | 'body' | 'muted' | 'small' | 'label';

export function T({
  children,
  variant = 'body',
  style,
  numberOfLines,
  center,
}: {
  children: ReactNode;
  variant?: Variant;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  center?: boolean;
}) {
  const { colors, fontSize } = useTheme();
  const base: Record<Variant, TextStyle> = {
    title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    heading: {
      fontSize: fontSize.lg,
      fontWeight: '650' as TextStyle['fontWeight'],
      color: colors.text,
    },
    body: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
    muted: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
    small: { fontSize: fontSize.xs, color: colors.textMuted },
    label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  };
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[base[variant], center && { textAlign: 'center' }, style]}
    >
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
  accessibilityHint,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const { colors, radius } = useTheme();
  const palette = {
    primary: { bg: colors.primary, fg: colors.primaryText, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    danger: { bg: colors.danger, fg: '#fff', border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingVertical: small ? 8 : 14,
          paddingHorizontal: small ? 12 : 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        icon && <Ionicons name={icon} size={small ? 16 : 19} color={palette.fg} />
      )}
      <Text style={{ color: palette.fg, fontWeight: '600', fontSize: small ? 14 : 16 }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  error,
  hint,
  ...input
}: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const { colors, radius, fontSize } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...input}
        style={[
          {
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.border,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: fontSize.md,
            color: colors.text,
          },
          input.style,
        ]}
      />
      {error ? (
        <T variant="small" style={{ color: colors.danger }}>
          {error}
        </T>
      ) : hint ? (
        <T variant="small">{hint}</T>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const card: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  };
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [card, { opacity: pressed ? 0.9 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[card, style]}>{children}</View>;
}

export function Badge({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: Tone;
  icon?: IconName;
}) {
  const { colors } = useTheme();
  const map = {
    neutral: [colors.surfaceMuted, colors.textMuted],
    primary: [colors.primarySoft, colors.primary],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
  }[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        backgroundColor: map[0],
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      {icon && <Ionicons name={icon} size={13} color={map[1]} />}
      <Text style={{ color: map[1], fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Banner({
  tone = 'primary',
  icon,
  title,
  message,
  children,
}: {
  tone?: Tone;
  icon?: IconName;
  title: string;
  message?: string;
  children?: ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  const [bg, fg] = {
    neutral: [colors.surfaceMuted, colors.text],
    primary: [colors.primarySoft, colors.primary],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
  }[tone];
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: bg, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}
    >
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        {icon && <Ionicons name={icon} size={20} color={fg} />}
        <Text style={{ color: fg, fontWeight: '700', fontSize: 15, flex: 1 }}>{title}</Text>
      </View>
      {message && (
        <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{message}</Text>
      )}
      {children}
    </View>
  );
}

export function Row({
  children,
  gap = 8,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : colors.surface,
      }}
    >
      {icon && (
        <Ionicons name={icon} size={16} color={selected ? colors.primary : colors.textMuted} />
      )}
      <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Loading({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 32,
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.primary} size="large" />
      {label && <T variant="muted">{label}</T>}
    </View>
  );
}

export function ErrorText({ error }: { error: string | null | undefined }) {
  const { colors } = useTheme();
  if (!error) return null;
  return (
    <T variant="muted" style={{ color: colors.danger }}>
      {error}
    </T>
  );
}

export function Stars({ value, size = 16 }: { value: number | null | undefined; size?: number }) {
  if (value === null || value === undefined) return null;
  return (
    <Row gap={2}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={value >= i - 0.25 ? 'star' : value >= i - 0.75 ? 'star-half' : 'star-outline'}
          size={size}
          color="#F5A524"
        />
      ))}
    </Row>
  );
}
