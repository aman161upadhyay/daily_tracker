import React, { useEffect, useMemo } from "react";
import { Platform, useColorScheme, View } from "react-native";
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
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BodySync } from "@/components/system/BodySync";
import { NudgeScheduler } from "@/components/system/NudgeScheduler";
import { WidgetSync } from "@/components/system/WidgetSync";
import { AppLockGate } from "@/components/system/AppLockGate";
import { BackupSync } from "@/components/system/BackupSync";
import { UI } from "@/components/ui/icons";
import { PillButton } from "@/components/ui/primitives";
import { Txt } from "@/components/ui/Txt";
import colors, { type Scheme } from "@/constants/colors";
import { FONTS } from "@/constants/typography";
import { SchemeContext, useColors } from "@/hooks/useColors";
import { TrackerProvider, useTracker } from "@/src/state/TrackerProvider";

SplashScreen.preventAutoHideAsync();

const NAV_FONTS = {
  regular: { fontFamily: FONTS.medium, fontWeight: "500" as const },
  medium: { fontFamily: FONTS.semibold, fontWeight: "600" as const },
  bold: { fontFamily: FONTS.bold, fontWeight: "700" as const },
  heavy: { fontFamily: FONTS.extrabold, fontWeight: "800" as const },
};

/** Shown when writes to the on-device store fail; the app keeps working in memory but says so. */
function StorageBanner({ message }: { message: string }) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  return (
    <View
      style={{ paddingTop: insets.top, backgroundColor: c.danger }}
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
        <UI.Info size={18} color="#FFFFFF" weight="bold" />
        <Txt role="footnote" color="#FFFFFF" style={{ flex: 1 }}>
          Changes are not being saved: {message}
        </Txt>
      </View>
    </View>
  );
}

/**
 * The database could not be opened at start. Nothing is loaded, so no screen renders (an empty
 * placeholder would read as a fresh install and its empty reminder plan would cancel the real
 * reminders); the person sees why and can try again without killing the app.
 */
function LoadFailedScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 48, paddingHorizontal: 24, gap: 12 }} accessibilityRole="alert">
      <UI.Info size={28} color={c.danger} weight="bold" />
      <Txt role="title1">Your data could not be opened</Txt>
      <Txt role="body" tone="secondary">
        Nothing was changed. The on-device database did not open: {message}
      </Txt>
      <Txt role="footnote" tone="tertiary">
        If this keeps happening, free some storage space or restart the phone. Your data is still on the device; Android's own backup keeps a copy too.
      </Txt>
      <PillButton label="Try again" color={c.green} onPress={onRetry} style={{ alignSelf: "flex-start", marginTop: 8 }} />
    </View>
  );
}

function RootLayoutNav() {
  const { ready, storageError, loadError, retryLoad } = useTracker();
  const c = useColors();

  useEffect(() => {
    if (ready || loadError) SplashScreen.hideAsync();
  }, [ready, loadError]);

  // Keep the splash up until saved data is loaded so no screen renders against an empty state.
  if (!ready) return loadError ? <LoadFailedScreen message={loadError} onRetry={retryLoad} /> : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {storageError ? <StorageBanner message={storageError} /> : null}
      <Stack
        screenOptions={{
          headerBackTitle: "Back",
          headerTintColor: c.text,
          headerStyle: { backgroundColor: c.bg },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontFamily: FONTS.bold,
            fontSize: 17,
            color: c.text,
          },
          contentStyle: { backgroundColor: c.bg },
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
          name="health-privacy"
          options={{ title: "Your health data", presentation: "modal" }}
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
      <BackupSync />
      <AppLockGate />
    </View>
  );
}

/** Resolves `settings.theme` (+ the phone's scheme) and feeds it to the tokens, navigation and status bar. */
function ThemeRoot() {
  const { state } = useTracker();
  const system = useColorScheme();
  const pref = state.settings.theme;
  const scheme: Scheme = pref === "system" ? (system === "light" ? "light" : "dark") : pref;
  const palette = colors[scheme];

  const navTheme = useMemo(
    () => ({
      ...(scheme === "dark" ? DarkTheme : DefaultTheme),
      colors: {
        ...(scheme === "dark" ? DarkTheme.colors : DefaultTheme.colors),
        primary: palette.green,
        background: palette.bg,
        card: palette.surface,
        text: palette.text,
        border: palette.hairline,
        notification: palette.violet,
      },
      fonts: NAV_FONTS,
    }),
    [scheme, palette],
  );

  useEffect(() => {
    if (Platform.OS !== "web") SystemUI.setBackgroundColorAsync(palette.bg).catch(() => {});
  }, [palette.bg]);

  return (
    <SchemeContext.Provider value={scheme}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <RootLayoutNav />
      </ThemeProvider>
    </SchemeContext.Provider>
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
            <TrackerProvider>
              <ThemeRoot />
            </TrackerProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
