import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from '@expo-google-fonts/manrope';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import colors from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { TrackerProvider, useTracker } from '@/src/state/TrackerProvider';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.dark.green,
    background: colors.dark.bg,
    card: colors.dark.surface,
    text: colors.dark.text,
    border: colors.dark.hairline,
    notification: colors.dark.violet,
  },
  fonts: {
    regular: { fontFamily: FONTS.medium, fontWeight: '500' as const },
    medium: { fontFamily: FONTS.semibold, fontWeight: '600' as const },
    bold: { fontFamily: FONTS.bold, fontWeight: '700' as const },
    heavy: { fontFamily: FONTS.extrabold, fontWeight: '800' as const },
  },
};

function RootLayoutNav() {
  const { ready } = useTracker();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Keep the splash up until saved data is loaded so no screen renders against an empty state.
  if (!ready) return null;

  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Back',
        headerTintColor: colors.dark.text,
        headerStyle: { backgroundColor: colors.dark.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: FONTS.bold, fontSize: 17, color: colors.dark.text },
        contentStyle: { backgroundColor: colors.dark.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="habit/[id]" options={{ title: 'Habit' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
      <Stack.Screen name="mind" options={{ title: 'Mind', presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.dark.bg }}>
          <KeyboardProvider>
            <ThemeProvider value={theme}>
              <TrackerProvider>
                <StatusBar style="light" />
                <RootLayoutNav />
              </TrackerProvider>
            </ThemeProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
