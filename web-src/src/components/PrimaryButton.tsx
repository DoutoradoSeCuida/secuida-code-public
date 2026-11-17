import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '../theme/tokens';

type Props = {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, variant = 'primary', loading, disabled }: Props) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        variant === 'secondary' ? styles.secondary : variant === 'danger' ? styles.danger : styles.primary,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={variant === 'secondary' ? tokens.colors.text : '#fff'} /> : null}
        <Text style={[styles.label, variant === 'secondary' ? styles.secondaryLabel : null]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
    shadowColor: tokens.colors.shadow,
    shadowOpacity: 0.11,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, flexShrink:1,maxWidth:'100%' },
  primary: { backgroundColor: tokens.colors.primary, borderColor: '#1e40af' },
  secondary: { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.borderStrong, shadowOpacity: 0.04 },
  danger: { backgroundColor: tokens.colors.danger, borderColor: tokens.colors.danger },
  pressed: { opacity: 0.9, transform: [{ translateY: 1 }] },
  disabled: { opacity: 0.55 },
  label: { flexShrink:1,textAlign:'center',color: '#fff', fontSize: 15, fontWeight: '900' },
  secondaryLabel: { color: tokens.colors.text },
});
