/**
 * Export / import scratch files — web stub. The browser never writes a copy of
 * the backup to disk on the app's behalf (downloads go straight to the user),
 * so there is nothing to clean. Native lives in transferCache.native.ts;
 * never import this file from there.
 */

export async function purgeTransferCache(_opts: { all?: boolean } = {}): Promise<void> {}
