import { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { tokens } from '../theme/tokens';

export function Card({ children,style }: { children: ReactNode;style?:StyleProp<ViewStyle> }) {
  return <View style={[styles.card,style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    borderLeftWidth: 4,
    borderLeftColor: tokens.colors.secondarySoft,
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
    shadowColor: tokens.colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
});
