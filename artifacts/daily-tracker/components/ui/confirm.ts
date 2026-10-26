import { Alert, Platform } from 'react-native';

/**
 * Ask before something that cannot be undone: a native alert with a Cancel and a destructive
 * button; the browser preview's confirm dialog (it has no Alert). `run` happens only on confirm.
 */
export function confirmDestructive(title: string, message: string, label: string, run: () => void): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && !window.confirm(`${title}\n\n${message}`)) return;
    run();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: label, style: 'destructive', onPress: run },
  ]);
}
