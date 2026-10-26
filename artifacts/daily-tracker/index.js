/**
 * App entry. The headless tasks are registered here, not in app/_layout.tsx:
 * Expo Router evaluates route files only when it renders, and Android runs
 * this bundle without rendering anything for a notification button pressed
 * while the app is closed, the periodic re-plan, or a widget tap. Both
 * imports are honest no-ops on web.
 */
import './src/services/nudgeTasks';
import { registerWidgetTaskHandler } from './src/services/widget';
import 'expo-router/entry';

registerWidgetTaskHandler();
