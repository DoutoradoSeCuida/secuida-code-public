import { pendingInvite } from '../../src/lib/invite';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { Busy } from '../../src/components/Page';
export default function Layout() { const { user, loading } = useAuth(); if (loading) return <Busy />; if (user) return <Redirect href={pendingInvite()?'/join':'/(app)/(tabs)'} />; return <Stack screenOptions={{ headerShown: false }} />; }
