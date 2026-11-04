#!/usr/bin/env node
// dx-hub: the Deployment Hub from the terminal.
//   npx dx-hub          start the hub on its own (http://localhost:3050/hub)
//   npx dx-hub init     set a project up: sample config, .gitignore lines, and the one line for Storybook
import { existsSync, readFileSync, writeFileSync, appendFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('--') ? args[0] : 'serve';
// dx-hub --port 3060, dx-hub --host (every network interface) or --host 192.168.1.5. Without --host it is this computer only.
const flag = (name) => {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const next = args[at + 1];
  return next && !next.startsWith('--') ? next : true;
};
if (flag('--port') && flag('--port') !== true) process.env.PORT = String(flag('--port'));
if (flag('--host')) process.env.DX_HUB_HOST = flag('--host') === true ? '0.0.0.0' : flag('--host');

function init() {
  const root = process.env.DX_HUB_ROOT || process.cwd();
  const say = (mark, text) => console.log(`${mark} ${text}`);

  if (!existsSync(join(root, 'package.json'))) {
    console.error('No package.json here. Run this in your Storybook / DX components project folder.');
    process.exit(1);
  }

  // 1. The sample, copied beside tasks.config.json. The real hub.config.json is the person's own and never overwritten.
  const sample = join(root, 'hub.config.sample.json');
  if (existsSync(sample)) say('-', 'hub.config.sample.json already there');
  else {
    copyFileSync(join(packageDir, 'hub.config.sample.json'), sample);
    say('+', 'hub.config.sample.json: copy it to hub.config.json and fill in your servers');
  }

  // 2. Git must never see the secrets the hub keeps or the person's own server list.
  const ignorePath = join(root, '.gitignore');
  const current = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
  const missing = ['.dx-hub/', 'hub.config.json'].filter((line) => !current.split(/\r?\n/).includes(line));
  if (missing.length) {
    const lead = current === '' || current.endsWith('\n') ? '' : '\n';
    appendFileSync(ignorePath, `${lead}# Deployment Hub: your servers and sign-in details stay on your machine\n${missing.join('\n')}\n`);
    say('+', `.gitignore: added ${missing.join(', ')}`);
  } else say('-', '.gitignore already covers .dx-hub/ and hub.config.json');

  // 3. Storybook: say what to add rather than rewriting a file that is different in every project.
  const main = ['main.ts', 'main.js', 'main.mjs', 'main.cjs'].map((n) => join(root, '.storybook', n)).find(existsSync);
  const wired = main && readFileSync(main, 'utf8').includes('dx-deployment-hub');
  if (wired) say('-', `${main.replace(root, '.')} already uses the hub`);
  else {
    say('!', `Add the hub to ${main ? main.replace(root, '.') : '.storybook/main.ts'}:\n`);
    console.log(`    import { dxHub } from '@sanjeevsaniel/dx-deployment-hub';\n\n    async viteFinal(config) {\n      config.plugins = [...(config.plugins || []), dxHub()];\n      return config;\n    }\n`);
  }
  console.log('Then run Storybook and open /hub, or run `npx dx-hub` for the hub on its own.');
}

if (command === 'init') init();
else if (command === 'serve') await import('../src/server.mjs');
else {
  console.log('Usage: dx-hub [serve | init] [--port 3050] [--host [address]]');
  process.exit(command === 'help' || command === '--help' ? 0 : 1);
}
