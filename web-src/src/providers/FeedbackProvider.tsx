import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../theme/tokens';

type FeedbackTone = 'info' | 'success' | 'warning' | 'error';

type FeedbackInput = {
  title: string;
  message?: string;
  tone?: FeedbackTone;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};

type FeedbackState = FeedbackInput & {
  id: number;
  tone: FeedbackTone;
};

type FeedbackContextValue = {
  showFeedback: (input: FeedbackInput) => void;
  dismissFeedback: () => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const dismissFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const showFeedback = useCallback((input: FeedbackInput) => {
    setFeedback({ ...input, id: Date.now(), tone: input.tone ?? 'info' });
  }, []);

  const handleAction = useCallback(() => {
    if (!feedback?.onAction) {
      return;
    }

    const action = feedback.onAction;
    setFeedback(null);
    action();
  }, [feedback]);

  useEffect(() => {
    if (!feedback || feedback.onAction) {
      return undefined;
    }

    const timer = setTimeout(() => setFeedback(null), feedback.durationMs ?? 4500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const value = useMemo(() => ({ showFeedback, dismissFeedback }), [showFeedback, dismissFeedback]);

  return (
    <FeedbackContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        <SafeAreaView pointerEvents="box-none" style={styles.layer} edges={['top']}>
          {feedback ? (
            <View style={[styles.toast, toneStyles[feedback.tone]]} pointerEvents="auto">
              <View style={styles.textBlock}>
                <Text style={styles.title}>{feedback.title}</Text>
                {feedback.message ? <Text style={styles.message}>{feedback.message}</Text> : null}
                {feedback.actionLabel && feedback.onAction ? (
                  <Pressable accessibilityRole="button" onPress={handleAction} style={styles.actionButton}>
                    <Text style={styles.actionLabel}>{feedback.actionLabel}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar mensagem" onPress={dismissFeedback} hitSlop={10}>
                <Text style={styles.close}>Fechar</Text>
              </Pressable>
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used inside FeedbackProvider');
  }

  return context;
}

const toneStyles = StyleSheet.create({
  info: { borderColor: tokens.colors.primary, backgroundColor: tokens.colors.primarySoft },
  success: { borderColor: tokens.colors.secondary, backgroundColor: tokens.colors.secondarySoft },
  warning: { borderColor: tokens.colors.warning, backgroundColor: tokens.colors.warningSoft },
  error: { borderColor: tokens.colors.danger, backgroundColor: tokens.colors.dangerSoft },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    padding: tokens.spacing.md,
  },
  toast: {
    maxWidth: 560,
    alignSelf: 'center',
    width: '100%',
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  textBlock: { flex: 1, gap: 4 },
  title: { color: tokens.colors.text, fontSize: 15, fontWeight: '800' },
  message: { color: tokens.colors.text, fontSize: 14, lineHeight: 20 },
  actionButton: { alignSelf: 'flex-start', marginTop: 6 },
  actionLabel: { color: tokens.colors.primary, fontSize: 14, fontWeight: '800' },
  close: { color: tokens.colors.text, fontSize: 13, fontWeight: '700' },
});
