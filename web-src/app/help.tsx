import { useLocalSearchParams, router } from 'expo-router';
import { View, Text } from 'react-native';
import { helpTarget } from '../src/lib/help';
import { HelpSurface } from '../src/components/HelpSurface';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { ui } from '../src/components/Page';
export default function Help() {
  const { page } = useLocalSearchParams<{ page?: string }>(); const target = helpTarget(page || 'events');
  return <View style={{ flex: 1, backgroundColor: '#fff', padding: 20, gap: 14 }}><Text style={ui.h2}>Ajuda · {target.title}</Text><PrimaryButton label="Voltar à app" variant="secondary" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} /><HelpSurface page={target.page} anchor={target.anchor} /></View>;
}
