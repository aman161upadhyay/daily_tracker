import React from 'react';
import { Platform } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { UI } from '@/components/ui/icons';
import { FONTS } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { useTracker } from '@/src/state/TrackerProvider';

/**
 * Today · Habits · Body · Cycle. The Cycle tab is mounted only when cycle
 * tracking is on. Solid surface bar (no blur), hairline on top.
 */
export default function TabLayout() {
  const c = useColors();
  const { state } = useTracker();
  const cycleOn = state.settings.cycleEnabled;

  // First run: the welcome flow sets everything up before the tabs appear.
  if (!state.settings.onboardingDone) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.greenBright,
        tabBarInactiveTintColor: c.textTertiary,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.hairline,
          elevation: 0,
          ...(Platform.OS === 'web' ? { height: 64, paddingBottom: 8 } : {}),
        },
        tabBarLabelStyle: { fontFamily: FONTS.semibold, fontSize: 11 },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, focused }) => <UI.Today size={24} color={String(color)} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
      <Tabs.Screen
        name="habits"
        options={{
          title: 'Habits',
          tabBarIcon: ({ color, focused }) => <UI.Habits size={24} color={String(color)} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
      <Tabs.Screen
        name="body"
        options={{
          title: 'Body',
          tabBarIcon: ({ color, focused }) => <UI.Heartbeat size={24} color={String(color)} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
      <Tabs.Screen
        name="cycle"
        options={{
          title: 'Cycle',
          href: cycleOn ? undefined : null,
          tabBarIcon: ({ color, focused }) => <UI.Cycle size={24} color={String(color)} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
    </Tabs>
  );
}
