/// <reference types="node" />
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { applyReleaseSigning } = require('../plugins/withReleaseSigning') as { applyReleaseSigning: (contents: string) => string };

// The relevant part of Expo's app/build.gradle template (SDK 57).
const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}`;

describe('withReleaseSigning plugin', () => {
  it('adds a property-driven release config and keeps the debug fallback', () => {
    const out = applyReleaseSigning(TEMPLATE);
    assert.match(out, /signingConfigs \{\s*release \{/);
    assert.match(out, /storeFile file\(DT_RELEASE_STORE_FILE\)/);
    assert.match(out, /release \{[^}]*signingConfig project\.hasProperty\('DT_RELEASE_STORE_FILE'\) \? signingConfigs\.release : signingConfigs\.debug/);
    assert.match(out, /debug \{\s*signingConfig signingConfigs\.debug/, 'the debug build type is untouched');
    assert.ok(!/storePassword '.*release/.test(out), 'no literal secrets');
  });

  it('is idempotent', () => {
    const once = applyReleaseSigning(TEMPLATE);
    assert.equal(applyReleaseSigning(once), once);
  });

  it('fails loudly when the template changed shape', () => {
    assert.throws(() => applyReleaseSigning('android {}'), /no signingConfigs block/);
  });
});
