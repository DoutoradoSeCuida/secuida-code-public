import { pendingInvite } from '../src/lib/invite';
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '../src/providers/AuthProvider';
import { Busy, Notice } from '../src/components/Page';
import { PrimaryButton } from '../src/components/PrimaryButton';
export default function Index() { const a = useAuth(); if (a.loading) return <View style={{ padding: 30 }}><Busy text="Preparando seu acesso…" /></View>; if (a.error) return <View style={{ padding: 30, gap: 15 }}><Notice text={a.error} error /><PrimaryButton label="Tentar novamente" onPress={a.restore} /></View>; return <Redirect href={a.user ? (pendingInvite()?'/join':'/(app)/(tabs)') : '/(auth)/sign-in'} />; }
