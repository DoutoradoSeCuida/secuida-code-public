import { captureInvite } from '../src/lib/invite';
import { EventSessionProvider } from '../src/components/EventSession';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/providers/AuthProvider';
import { CodeProvider } from '../src/providers/CodeProvider';
import { FeedbackProvider } from '../src/providers/FeedbackProvider';
export default function Layout() { captureInvite(); return <SafeAreaProvider><FeedbackProvider><AuthProvider><CodeProvider><EventSessionProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }} /></EventSessionProvider></CodeProvider></AuthProvider></FeedbackProvider></SafeAreaProvider>; }
