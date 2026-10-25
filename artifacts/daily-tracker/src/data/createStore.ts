/**
 * Web build: whole-state JSON in AsyncStorage (localStorage). Native builds
 * resolve `createStore.native.ts` instead (Metro platform extensions).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { JsonStore } from './jsonStore';
import type { TrackerStore } from './store';

export async function createStore(): Promise<TrackerStore> {
  return new JsonStore(AsyncStorage);
}
