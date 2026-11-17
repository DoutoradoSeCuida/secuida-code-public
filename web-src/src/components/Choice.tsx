import { useId } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { ui } from './Page';
export function Choice<T extends string>({ value, options, onChange, label, helperText, disabled = false }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string; helperText?: string; disabled?: boolean }) {
  const helperId = useId();
  return <View style={{ gap: 7 }}><Text style={ui.muted}>{label}</Text>{helperText && <Text nativeID={helperId} style={ui.muted}>{helperText}</Text>}<View style={ui.row}>{options.map(o => <Pressable key={o.value} accessibilityRole="radio" aria-checked={value === o.value} accessibilityState={{ checked: value === o.value, disabled }} accessibilityLabel={o.label} accessibilityHint={helperText} {...(Platform.OS === 'web' && helperText ? { 'aria-describedby': helperId } : {})} disabled={disabled} onPress={() => onChange(o.value)} style={{ opacity: disabled ? .55 : 1, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: value === o.value ? '#2456c7' : '#aab9ad', backgroundColor: value === o.value ? '#e8eefc' : '#fff', padding: 11 }}><Text style={{ color: '#172b3a', fontWeight: value === o.value ? '800' : '500' }}>{o.label}</Text></Pressable>)}</View></View>;
}
