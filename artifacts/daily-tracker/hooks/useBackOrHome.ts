import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Leave the current screen: back when there is history, otherwise home.
 *
 * A screen reached through a deep link (widget name tap, notification tap, a bookmarked web URL)
 * has nothing behind it; `router.back()` there is a no-op in release builds and an error toast in
 * development, and either way the user is left on a screen that believes it has closed itself.
 */
export function useBackOrHome() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
}
