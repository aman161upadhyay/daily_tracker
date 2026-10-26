import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Divider, PillButton, Row } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { TYPE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { MIN_PASSWORD_LENGTH, type EncryptedBackup } from '@/src/data/backupCrypto';
import { describeImport, exportState, inspectExport, pickImport, unlockExportAsync } from '@/src/data/transfer';
import { backupAge, withExportStamp } from '@/src/domain/backup/backupAge';
import { deleteKeptSnapshots, deleteSnapshot, markCleanupPending, readKeptSnapshots, type Snapshot } from '@/src/services/backup';
import { reportBackup, useBackupFailure } from '@/src/services/backupHealth';
import { afterSnapshots } from '@/src/services/snapshotSync';
import type { TrackerState } from '@/src/state/types';
import { useTracker } from '@/src/state/TrackerProvider';

type Confirm = (title: string, message: string, label: string, run: () => void) => void;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * "Your data": export (optionally password-protected), import (asks for the
 * password when the file needs one), sample data and erase. The password
 * sheets are the only place passwords exist; nothing is stored.
 */
export function BackupCard({ confirm }: { confirm: Confirm }) {
  const c = useColors();
  const { state, actions, storageError, commitPending, nowMs, zone } = useTracker();
  const s = state.settings;
  const [transfer, setTransfer] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [locked, setLocked] = useState<EncryptedBackup | null>(null);
  /** Phone-backup snapshots an older build could not read, kept for this one to try (newest first). */
  const [kept, setKept] = useState<Snapshot[]>([]);
  const backupFailure = useBackupFailure();
  // The same queued delete BackupSync runs, from a button: "deleted" must end up meaning deleted.
  const retryDelete = () => {
    setBusy(true);
    afterSnapshots(deleteSnapshot)
      .then(() => reportBackup('delete', null))
      .catch((err) => reportBackup('delete', err))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let alive = true;
    readKeptSnapshots()
      .then((snaps) => {
        if (alive) setKept(snaps);
      })
      .catch((err) => console.warn('[backup] kept snapshot', err));
    return () => {
      alive = false;
    };
  }, []);

  // The intent is recorded first and the card changes only once the delete went through: a copy
  // that is still on disk must not vanish from the screen, and a kill mid-way finishes on start.
  const forgetKept = () => {
    setBusy(true);
    markCleanupPending('kept')
      .then(() => deleteKeptSnapshots())
      .then(() => setKept([]))
      .catch((err) => {
        console.warn('[backup] kept snapshot', err);
        setTransfer({ tone: 'error', text: `The set-aside copy could not be removed just now: ${message(err)}` });
      })
      .finally(() => setBusy(false));
  };

  const age = backupAge(s.lastExportAt, nowMs, zone);
  const runExport = async (password: string | undefined) => {
    setExporting(false);
    setBusy(true);
    setTransfer(null);
    try {
      // The file carries this export's own stamp; the live setting takes it only once the file was
      // handed over — a record of the hand-over, not a claim that any app kept the file.
      const at = Date.now();
      await exportState(withExportStamp(state, at), password);
      actions.updateSettings({ lastExportAt: at });
      setTransfer({
        tone: 'ok',
        text: password ? 'Backup created and encrypted. Only the password opens it; there is no way to recover a forgotten one.' : 'Backup created. Keep it somewhere safe; it contains everything you logged.',
      });
    } catch (err) {
      setTransfer({ tone: 'error', text: `Export failed: ${message(err)}` });
    } finally {
      setBusy(false);
    }
  };

  // "Imported" is said once the import is on disk, and the kept copy goes only then: a save that
  // gives up (storage full) must not end with the only copy of that data deleted.
  const offerImport = (incoming: TrackerState, onDone?: () => void) => {
    confirm('Replace everything with this backup?', `It holds ${describeImport(incoming)}. Your current data on this phone is replaced.`, 'Import', () => {
      actions.importState(incoming);
      setBusy(true);
      commitPending()
        .then((persisted) => {
          if (persisted) {
            setTransfer({ tone: 'ok', text: `Imported ${describeImport(incoming)}.` });
            onDone?.();
          } else {
            setTransfer({ tone: 'error', text: 'The backup is loaded on screen but could not be saved to this phone yet. Free up some storage; the app keeps retrying.' });
          }
        })
        .finally(() => setBusy(false));
    });
  };

  // The kept copies, now that the app may be new enough to read one: the newest readable copy is
  // offered. Still unreadable → they stay kept.
  const restoreKept = () => {
    if (kept.length === 0) return;
    setTransfer(null);
    let lastError: unknown = null;
    for (const snap of kept) {
      try {
        const inspected = inspectExport(snap.text);
        if (inspected.kind === 'encrypted') setLocked(inspected.file);
        else offerImport(inspected.state, forgetKept);
        return;
      } catch (err) {
        lastError = err;
      }
    }
    setTransfer({ tone: 'error', text: `Still can't open ${kept.length > 1 ? 'any of them' : 'it'}: ${message(lastError)}` });
  };

  const doImport = async () => {
    setBusy(true);
    setTransfer(null);
    try {
      const text = await pickImport();
      if (text === null) return;
      const inspected = inspectExport(text);
      if (inspected.kind === 'encrypted') setLocked(inspected.file);
      else offerImport(inspected.state);
    } catch (err) {
      setTransfer({ tone: 'error', text: `Import failed: ${message(err)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Txt role="body">{s.sampleData ? 'You are looking at sample data.' : 'Your data lives on this phone. Export a backup before switching phones or reinstalling.'}</Txt>
      {storageError ? (
        <Txt role="footnote" color={c.danger} style={{ marginTop: 8 }}>
          Saving is failing: {storageError}
        </Txt>
      ) : null}
      <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <PillButton label="Export backup" Leading={UI.Download} kind="ghost" onPress={() => setExporting(true)} disabled={busy} />
        <PillButton label="Import backup" Leading={UI.Upload} kind="ghost" onPress={doImport} disabled={busy} />
      </Row>
      {!s.sampleData ? (
        <Txt role="footnote" tone={age.stale ? 'gold' : 'secondary'} style={{ marginTop: 8 }}>
          {age.text}
        </Txt>
      ) : null}
      {transfer ? (
        <Txt role="footnote" color={transfer.tone === 'error' ? c.danger : c.greenBright} style={{ marginTop: 10 }}>
          {transfer.text}
        </Txt>
      ) : null}
      {Platform.OS === 'android' ? (
        <>
          <Divider />
          <Row style={{ justifyContent: 'space-between', paddingTop: 12 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Txt role="title2" heading>Android phone backup</Txt>
              <Txt role="footnote" tone="secondary">
                {s.cloudBackup
                  ? 'If phone backup is on, Android keeps a copy with your Google account so a new phone restores it — only encrypted with your screen lock (Android 9 or newer). Turn off to keep everything on this phone only.'
                  : 'Off: nothing leaves this phone unless you export a file. Erasing the app or losing the phone loses the data.'}
              </Txt>
            </View>
            <Switch value={s.cloudBackup} onValueChange={(cloudBackup) => actions.updateSettings({ cloudBackup })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Android phone backup" />
          </Row>
          {backupFailure ? (
            <Row gap={8} style={{ marginTop: 12, alignItems: 'center' }}>
              <UI.Info size={16} color={c.danger} weight="bold" />
              <Txt role="caption" tone="secondary" style={{ flex: 1 }}>
                {backupFailure.what === 'write'
                  ? `The copy for Android phone backup could not be written (${backupFailure.message}). Android backs up the previous copy, if there is one; the app tries again when you come back to it. An exported file is the sure copy.`
                  : `The phone-backup copy could not be deleted (${backupFailure.message}); it is still on this phone. The app tries again on its next start.`}
              </Txt>
              {backupFailure.what === 'delete' ? <PillButton label="Retry" kind="ghost" compact onPress={retryDelete} disabled={busy} /> : null}
            </Row>
          ) : null}
          {kept.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Txt role="footnote" tone="secondary">
                {kept.length === 1
                  ? `A phone backup${kept[0].writtenAt ? ` from ${new Date(kept[0].writtenAt).toLocaleDateString()}` : ''} that an earlier version of this app could not open is kept on this phone.`
                  : `${kept.length} phone backups that earlier versions of this app could not open are kept on this phone${kept[0].writtenAt ? ` (newest from ${new Date(kept[0].writtenAt).toLocaleDateString()})` : ''}.`}
              </Txt>
              <Row gap={8} style={{ marginTop: 8, flexWrap: 'wrap' }}>
                <PillButton label={kept.length === 1 ? 'Try to restore it' : 'Try to restore the newest'} kind="ghost" Leading={UI.Upload} onPress={restoreKept} disabled={busy} />
                <PillButton label={kept.length === 1 ? 'Delete it' : 'Delete them'} kind="ghost" disabled={busy} onPress={() => confirm(kept.length === 1 ? 'Delete the kept backup?' : 'Delete the kept backups?', `${kept.length === 1 ? 'The copy' : 'Every copy'} an earlier version could not open is removed from this phone for good.`, 'Delete', forgetKept)} />
              </Row>
            </View>
          ) : null}
        </>
      ) : null}
      <Divider />
      <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
        {s.sampleData ? (
          <PillButton label="Start fresh" kind="ghost" onPress={() => confirm('Start fresh?', 'Removes the sample history and keeps your settings.', 'Start fresh', actions.startFresh)} />
        ) : (
          <>
            <PillButton label="Load sample data" kind="ghost" onPress={() => confirm('Replace your data?', 'This replaces everything you logged with sample history.', 'Replace', actions.loadSample)} />
            <PillButton label="Erase everything" kind="danger" Leading={UI.Trash} onPress={() => confirm('Erase everything?', 'Every log and habit on this phone is deleted, along with the phone-backup copy. Your settings and the Water habit stay.', 'Erase', actions.startFresh)} />
          </>
        )}
      </Row>

      <ExportSheet visible={exporting} onClose={() => setExporting(false)} onExport={runExport} />
      <UnlockSheet
        file={locked}
        onClose={() => setLocked(null)}
        onUnlocked={(incoming) => {
          setLocked(null);
          offerImport(incoming);
        }}
      />
    </Card>
  );
}

function PasswordField({ value, onChange, placeholder, onSubmit }: { value: string; onChange: (v: string) => void; placeholder: string; onSubmit?: () => void }) {
  const c = useColors();
  const [visible, setVisible] = useState(false);
  return (
    <Row gap={8}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={onSubmit}
        style={[TYPE.body, styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.hairline }]}
        accessibilityLabel="Backup password"
      />
      <PillButton label={visible ? 'Hide' : 'Show'} kind="ghost" compact onPress={() => setVisible((v) => !v)} style={{ flexShrink: 0 }} />
    </Row>
  );
}

function ExportSheet({ visible, onClose, onExport }: { visible: boolean; onClose: () => void; onExport: (password: string | undefined) => void }) {
  const [password, setPassword] = useState('');
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const close = () => {
    setPassword('');
    onClose();
  };
  return (
    <Sheet visible={visible} title="Export backup" onClose={close}>
      <Txt role="footnote" tone="secondary" style={{ marginBottom: 12 }}>
        The file holds everything you logged. Add a password to encrypt it (AES-256; the file documents how to open it without this app). There is no way to recover a forgotten password.
      </Txt>
      <PasswordField value={password} onChange={setPassword} placeholder={`Password (optional, ${MIN_PASSWORD_LENGTH}+ characters)`} />
      {tooShort ? (
        <Txt role="footnote" tone="danger" style={{ marginTop: 8 }}>
          {`Use at least ${MIN_PASSWORD_LENGTH} characters, or leave it empty for a plain file.`}
        </Txt>
      ) : null}
      <View style={{ marginTop: 16, gap: 8 }}>
        <PillButton
          label={password ? 'Export encrypted' : 'Export without password'}
          Leading={password ? UI.Lock : UI.Download}
          disabled={tooShort}
          onPress={() => {
            const pw = password || undefined;
            setPassword('');
            onExport(pw);
          }}
        />
      </View>
    </Sheet>
  );
}

function UnlockSheet({ file, onClose, onUnlocked }: { file: EncryptedBackup | null; onClose: () => void; onUnlocked: (state: TrackerState) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The derivation yields, so Cancel, a new file and an unmount can all happen while it runs: each
  // retires the request, and a retired request's result — a state to replace everything with, or
  // an error — is dropped rather than shown for a sheet the person has left.
  const request = useRef(0);
  const inFlight = useRef(false);
  const retire = () => {
    request.current += 1;
    inFlight.current = false;
  };
  useEffect(() => {
    retire();
    setBusy(false);
    return retire;
  }, [file]);
  const close = () => {
    retire();
    setPassword('');
    setError(null);
    setBusy(false);
    onClose();
  };
  const unlock = async () => {
    // The keyboard's submit reaches here while the button is disabled: one derivation at a time.
    if (!file || !password || inFlight.current) return;
    inFlight.current = true;
    const mine = request.current;
    setBusy(true);
    setError(null);
    try {
      const state = await unlockExportAsync(file, password);
      if (request.current !== mine) return;
      setPassword('');
      onUnlocked(state);
    } catch (err) {
      if (request.current !== mine) return;
      setError(message(err));
    } finally {
      if (request.current === mine) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <Sheet visible={!!file} title="Backup is password-protected" onClose={close}>
      <Txt role="footnote" tone="secondary" style={{ marginBottom: 12 }}>
        {file ? `${typeof file.exportedAt === 'string' && file.exportedAt.length >= 10 ? `The file says it was exported ${file.exportedAt.slice(0, 10)}. ` : ''}Enter the password it was saved with.` : ''}
      </Txt>
      <PasswordField value={password} onChange={setPassword} placeholder="Password" onSubmit={unlock} />
      {error ? (
        <Txt role="footnote" tone="danger" style={{ marginTop: 8 }}>
          {error}
        </Txt>
      ) : null}
      <View style={{ marginTop: 16 }}>
        <PillButton label={busy ? 'Unlocking…' : 'Unlock'} Leading={UI.Key} disabled={!password || busy} onPress={unlock} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    // On the web a text field keeps an intrinsic width unless told it may shrink; without this the
    // Show / Log button beside it left a 320 dp sheet.
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
