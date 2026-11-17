import { ReactNode, useId } from 'react';
import { Platform, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { tokens } from '../theme/tokens';

type Props = TextInputProps & {
  label: string;
  helperText?: string;
  right?: ReactNode;
};

export function TextField({ label, helperText, right, style, ...props }: Props) {
  const helperId = useId();
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {helperText ? <Text nativeID={helperId} selectable style={styles.helper}>{helperText}</Text> : null}
      <View style={styles.inputRow}>
        <TextInput
          {...props}
          {...(Platform.OS === 'web' && helperText ? { 'aria-describedby': helperId } : {})}
          accessibilityLabel={props.accessibilityLabel || label}
          accessibilityHint={props.accessibilityHint || helperText}
          placeholderTextColor={tokens.colors.muted}
          style={[styles.input, right ? styles.inputWithRight : null, style]}
        />
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: tokens.colors.text, fontSize: 13, fontWeight: '800' },
  helper: { color: tokens.colors.muted, fontSize: 13, lineHeight: 20 },
  inputRow: { position: 'relative' },
  input: {
    minHeight: 50,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: '#fbfdf9',
    paddingHorizontal: tokens.spacing.md,
    color: tokens.colors.text,
    fontSize: 15,
    borderLeftWidth: 3,
    borderLeftColor: tokens.colors.secondarySoft,
  },
  inputWithRight: { paddingRight: 52 },
  right: { position: 'absolute', right: 8, top: 6 },
});
