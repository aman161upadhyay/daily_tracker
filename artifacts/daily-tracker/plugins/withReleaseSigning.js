/**
 * Release signing (Expo config plugin).
 *
 * Adds a `release` signing config to android/app/build.gradle that reads the
 * keystore from Gradle properties, so nothing secret ever sits in the repo or
 * the generated project:
 *
 *   ~/.gradle/gradle.properties
 *     DT_RELEASE_STORE_FILE=/home/you/keystores/daily-tracker-release.jks
 *     DT_RELEASE_STORE_PASSWORD=…
 *     DT_RELEASE_KEY_ALIAS=daily-tracker
 *     DT_RELEASE_KEY_PASSWORD=…
 *
 * When the properties are missing (CI, a fresh laptop) the release build type
 * falls back to the debug keystore exactly as Expo's template does, so
 * `assembleRelease` still works — it just produces an APK you should not ship.
 * Full recipe: docs/BUILD_ANDROID.md.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const PROP = 'DT_RELEASE_STORE_FILE';

const RELEASE_CONFIG = `signingConfigs {
        release {
            // Added by plugins/withReleaseSigning.js; values come from ~/.gradle/gradle.properties.
            if (project.hasProperty('${PROP}')) {
                storeFile file(${PROP})
                storePassword DT_RELEASE_STORE_PASSWORD
                keyAlias DT_RELEASE_KEY_ALIAS
                keyPassword DT_RELEASE_KEY_PASSWORD
            }
        }`;

function applyReleaseSigning(contents) {
  if (contents.includes('withReleaseSigning.js')) return contents;
  if (!/signingConfigs\s*\{/.test(contents)) throw new Error('withReleaseSigning: no signingConfigs block in app/build.gradle');
  let out = contents.replace(/signingConfigs\s*\{/, RELEASE_CONFIG);
  const releaseBlock = /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/;
  if (!releaseBlock.test(out)) throw new Error('withReleaseSigning: release build type does not use signingConfigs.debug as expected');
  out = out.replace(releaseBlock, `$1signingConfig project.hasProperty('${PROP}') ? signingConfigs.release : signingConfigs.debug`);
  return out;
}

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('withReleaseSigning: only Groovy build.gradle is supported');
    cfg.modResults.contents = applyReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withReleaseSigning;
module.exports.applyReleaseSigning = applyReleaseSigning;
