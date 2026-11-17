import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { Busy } from '../../src/components/Page';
export default function Layout() {
  const { user, loading } = useAuth();
  if (loading) return <Busy />;
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="teacher-area" getId={({params})=>[params?.event,params?.section,params?.mode,params?.item].map(v=>typeof v==='string'?v:'').join('|')} />
  </Stack>;
}
