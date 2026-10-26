import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Divider, PillButton, Row } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { TYPE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { MIN_PASSWORD_LENGTH, type EncryptedBackup } from '@/src/data/backupCrypto';
import { describeImport, exportState, inspectExport, pickImport, unlockExport } from '@/src/data/transfer';
import { deleteKeptSnapshot, readKeptSnapshot, type Snapshot } from '@/src/services/backup';
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
  const { state, actions, storageError } = useTracker();
  const s = state.settings;
  const [transfer, setTransfer] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [locked, setLocked] = useState<EncryptedBackup | null>(null);
  /** A phone-backup snapshot an older build could not read, kept for this one to try. */
  const [kept, setKept] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let alive = true;
    readKeptSnapshot()
      .then((snap) => {
        if (alive) setKept(snap);
      })
      .catch((err) => console.warn('[backup] kept snapshot', err));
    return () => {
      alive = false;
    };
  }, []);

  const forgetKept = () => {
    setKept(null);
    deleteKeptSnapshot().catch((err) => console.warn('[backup] kept snapshot', err));
  };

  const runExport = async (password: string | undefined) => {
    setExporting(false);
    setBusy(true);
    setTransfer(null);
    try {
      await exportState(state, password);
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

  const offerImport = (incoming: TrackerState, onDone?: () => void) => {
    confirm('Replace everything with this backup?', `It holds ${describeImport(incoming)}. Your current data on this phone is replaced.`, 'Import', () => {
      actions.importState(incoming);
      setTransfer({ tone: 'ok', text: `Imported ${describeImport(incoming)}.` });
      onDone?.();
    });
  };

  // The kept copy, now that the app may be new enough to read it. Still unreadable → it stays kept.
  const restoreKept = () => {
    if (!kept) return;
    setTransfer(null);
    try {
      const inspected = inspectExport(kept.text);
      if (inspected.kind === 'encrypted') setLocked(inspected.file);
      else offerImport(inspected.state, forgetKept);
    } catch (err) {
      setTransfer({ tone: 'error', text: `Still can't open it: ${message(err)}` });
    }
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
              <Txt role="title2">Android phone backup</Txt>
              <Txt role="footnote" tone="secondary">
                {s.cloudBackup
                  ? 'If phone backup is on, Android keeps a copy with your Google account so a new phone restores it — only encrypted with your screen lock (Android 9 or newer). Turn off to keep everything on this phone only.'
                  : 'Off: nothing leaves this phone unless you export a file. Erasing the app or losing the phone loses the data.'}
              </Txt>
            </View>
            <Switch value={s.cloudBackup} onValueChange={(cloudBackup) => actions.updateSettings({ cloudBackup })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Android phone backup" />
          </Row>
          {kept ? (
            <View style={{ marginTop: 12 }}>
              <Txt role="footnote" tone="secondary">
                {`A phone backup${kept.writtenAt ? ` from ${new Date(kept.writtenAt).toLocaleDateString()}` : ''} that an earlier version of this app could not open is kept on this phone.`}
              </Txt>
              <Row gap={8} style={{ marginTop: 8, flexWrap: 'wrap' }}>
                <PillButton label="Try to restore it" kind="ghost" Leading={UI.Upload} onPress={restoreKept} disabled={busy} />
                <PillButton label="Delete it" kind="ghost" onPress={() => confirm('Delete the kept backup?', 'The copy an earlier version could not open is removed from this phone for good.', 'Delete', forgetKept)} />
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
      <PillButton label={visible ? 'Hide' : 'Show'} kind="ghost" compact onPress={() => setVisible((v) => !v)} />
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
  const close = () => {
    setPassword('');
    setError(null);
    onClose();
  };
  const unlock = () => {
    if (!file || !password) return;
    setBusy(true);
    setError(null);
    // Let the sheet repaint with the busy label before the key derivation blocks the JS thread.
    setTimeout(() => {
      try {
        const state = unlockExport(file, password);
        setPassword('');
        onUnlocked(state);
      } catch (err) {
        setError(message(err));
      } finally {
        setBusy(false);
      }
    }, 30);
  };
  return (
    <Sheet visible={!!file} title="Backup is password-protected" onClose={close}>
      <Txt role="footnote" tone="secondary" style={{ marginBottom: 12 }}>
        {file ? `${typeof file.exportedAt === 'string' && file.exportedAt.length >= 10 ? `Exported ${file.exportedAt.slice(0, 10)}. ` : ''}Enter the password it was saved with.` : ''}
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
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
