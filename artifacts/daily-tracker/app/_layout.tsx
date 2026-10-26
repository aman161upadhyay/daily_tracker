import React, { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BodySync } from "@/components/system/BodySync";
import { NudgeScheduler } from "@/components/system/NudgeScheduler";
import { WidgetSync } from "@/components/system/WidgetSync";
import { UI } from "@/components/ui/icons";
import { Txt } from "@/components/ui/Txt";
import colors from "@/constants/colors";
import { FONTS } from "@/constants/typography";
import { TrackerProvider, useTracker } from "@/src/state/TrackerProvider";

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
    regular: { fontFamily: FONTS.medium, fontWeight: "500" as const },
    medium: { fontFamily: FONTS.semibold, fontWeight: "600" as const },
    bold: { fontFamily: FONTS.bold, fontWeight: "700" as const },
    heavy: { fontFamily: FONTS.extrabold, fontWeight: "800" as const },
  },
};

/** Shown when writes to the on-device store fail; the app keeps working in memory but says so. */
function StorageBanner({ message }: { message: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{ paddingTop: insets.top, backgroundColor: colors.dark.danger }}
      accessibilityRole="alert"
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}
      >
        <UI.Info size={18} color={colors.dark.onGreen} weight="bold" />
        <Txt role="footnote" color={colors.dark.onGreen} style={{ flex: 1 }}>
          Changes are not being saved: {message}
        </Txt>
      </View>
    </View>
  );
}

function RootLayoutNav() {
  const { ready, storageError } = useTracker();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Keep the splash up until saved data is loaded so no screen renders against an empty state.
  if (!ready) return null;

  return (
    <View style={{ flex: 1 }}>
      {storageError ? <StorageBanner message={storageError} /> : null}
      <Stack
        screenOptions={{
          headerBackTitle: "Back",
          headerTintColor: colors.dark.text,
          headerStyle: { backgroundColor: colors.dark.bg },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontFamily: FONTS.bold,
            fontSize: 17,
            color: colors.dark.text,
          },
          contentStyle: { backgroundColor: colors.dark.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="habit/[id]" options={{ title: "Habit" }} />
        <Stack.Screen name="body/[metric]" options={{ title: "Body" }} />
        <Stack.Screen
          name="body/setup"
          options={{ title: "Health Connect", presentation: "modal" }}
        />
        <Stack.Screen
          name="settings"
          options={{ title: "Settings", presentation: "modal" }}
        />
        <Stack.Screen
          name="mind"
          options={{ title: "Mind", presentation: "modal" }}
        />
        <Stack.Screen
          name="shield"
          options={{ title: "Sugar Shield", presentation: "modal" }}
        />
      </Stack>
      <NudgeScheduler />
      <WidgetSync />
      <BodySync />
    </View>
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
        <GestureHandlerRootView
          style={{ flex: 1, backgroundColor: colors.dark.bg }}
        >
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
