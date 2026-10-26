// Runs before every install (root package.json "preinstall"). Plain Node so it
// works the same on macOS, Windows and Linux: the previous `sh -c` version
// failed on Windows shells (see docs/GET_IT_ON_YOUR_PHONE.md).
const fs = require('fs');
const path = require('path');

for (const name of ['package-lock.json', 'yarn.lock']) {
  const file = path.join(__dirname, '..', name);
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}

const agent = process.env.npm_config_user_agent || '';
if (!agent.startsWith('pnpm/')) {
  console.error('Use pnpm instead (npm install -g pnpm, then run: pnpm install).');
  process.exit(1);
}
