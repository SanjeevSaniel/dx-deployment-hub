#!/usr/bin/env node
// dx-hub: the Deployment Hub from the terminal.
//   npx dx-hub                 start the hub on its own (http://localhost:3050/hub)
//   npx dx-hub init            set a project up to use the installed package: sample config, .gitignore, the line for Storybook
//   npx dx-hub eject [folder]  copy the hub's source into your project (default tools/dx-hub) so you can read and change it
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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

const root = resolve(process.env.DX_HUB_ROOT || process.cwd());
const say = (mark, text) => console.log(`${mark} ${text}`);
const slashes = (path) => path.split(sep).join('/');

function requireProject() {
  if (!existsSync(join(root, 'package.json'))) {
    console.error('No package.json here. Run this in your Storybook / DX components project folder.');
    process.exit(1);
  }
}

/** The sample, copied beside tasks.config.json. The real hub.config.json is the person's own and never overwritten. */
function ensureSample() {
  const sample = join(root, 'hub.config.sample.json');
  if (existsSync(sample)) say('-', 'hub.config.sample.json already there');
  else {
    copyFileSync(join(packageDir, 'hub.config.sample.json'), sample);
    say('+', 'hub.config.sample.json: copy it to hub.config.json and fill in your servers');
  }
}

/** Git must never see the secrets the hub keeps or the person's own server list. */
function ensureGitignore() {
  const ignorePath = join(root, '.gitignore');
  const current = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
  const missing = ['.dx-hub/', 'hub.config.json'].filter((line) => !current.split(/\r?\n/).includes(line));
  if (missing.length) {
    const lead = current === '' || current.endsWith('\n') ? '' : '\n';
    appendFileSync(ignorePath, `${lead}# Deployment Hub: your servers and sign-in details stay on your machine\n${missing.join('\n')}\n`);
    say('+', `.gitignore: added ${missing.join(', ')}`);
  } else say('-', '.gitignore already covers .dx-hub/ and hub.config.json');
}

/** The Storybook main file, if there is one. It is different in every project, so it is only read, never rewritten. */
function storybookMain() {
  return ['main.ts', 'main.js', 'main.mjs', 'main.cjs'].map((n) => join(root, '.storybook', n)).find(existsSync);
}

function init() {
  requireProject();
  ensureSample();
  ensureGitignore();

  const main = storybookMain();
  if (main && readFileSync(main, 'utf8').includes('dx-deployment-hub')) say('-', `${slashes(relative(root, main))} already uses the hub`);
  else {
    say('!', `Add the hub to ${main ? slashes(relative(root, main)) : '.storybook/main.ts'}:\n`);
    console.log(`    import { dxHub } from '@sanjeevsaniel/dx-deployment-hub';\n\n    async viteFinal(config) {\n      config.plugins = [...(config.plugins || []), dxHub()];\n      return config;\n    }\n`);
  }
  console.log('Then run Storybook and open /hub, or run `npx dx-hub` for the hub on its own.');
}

/** Copies the hub's source into the project, so it is the project's own code from then on. */
function eject() {
  requireProject();
  const folder = args.slice(1).find((a) => !a.startsWith('--')) || 'tools/dx-hub';
  const target = resolve(root, folder);
  const inside = relative(root, target);
  if (isAbsolute(inside) || inside.startsWith('..') || inside === '') {
    console.error(`Choose a folder inside your project (not ${folder}).`);
    process.exit(1);
  }
  if (existsSync(target) && readdirSync(target).length > 0 && !flag('--force')) {
    console.error(`${slashes(inside)} is not empty. Pick another folder, or add --force to overwrite the hub files in it.`);
    process.exit(1);
  }

  mkdirSync(target, { recursive: true });
  cpSync(join(packageDir, 'src'), target, { recursive: true });
  const version = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')).version;
  writeFileSync(
    join(target, 'README.md'),
    `# Deployment Hub (your copy)\n\nCopied from @sanjeevsaniel/dx-deployment-hub ${version} by \`dx-hub eject\`. These files are yours now: read them, change them, commit them.\nUpdates to the package will not change this copy.\n\n- \`server.mjs\`: the hub on its own. Run it from the project folder: \`node ${slashes(inside)}/server.mjs\`\n- \`vite-plugin.mjs\`: the same hub inside Storybook's dev server (at /hub)\n- \`api/\`: the server side, one file per job. Start with \`api/index.mjs\`\n- \`web/\`: the page (plain HTML, one stylesheet, small modules)\n\nIt saves your servers and sign-in details to \`.dx-hub/\` in the project folder, which Git ignores.\nThe hub's two fonts are optional: \`npm i -D @fontsource-variable/inter @fontsource-variable/jetbrains-mono\`. Without them it uses system fonts.\n`,
  );
  say('+', `${slashes(inside)}/: the hub's source (${slashes(inside)}/README.md says what is where)`);
  ensureSample();
  ensureGitignore();

  const main = storybookMain();
  const plugin = `${slashes(relative(join(root, '.storybook'), join(target, 'vite-plugin.mjs')))}`;
  if (main && readFileSync(main, 'utf8').includes(slashes(inside))) say('-', `${slashes(relative(root, main))} already uses your copy`);
  else {
    say('!', `Add it to ${main ? slashes(relative(root, main)) : '.storybook/main.ts'}:\n`);
    console.log(`    import { dxHub } from '${plugin}';\n\n    async viteFinal(config) {\n      config.plugins = [...(config.plugins || []), dxHub()];\n      return config;\n    }\n`);
  }
  say('!', `To run it on its own, add this to "scripts" in package.json (if you do not have a "hub" script already):\n\n    "hub": "node ${slashes(inside)}/server.mjs"\n`);
  say('-', 'Optional fonts: npm i -D @fontsource-variable/inter @fontsource-variable/jetbrains-mono');
}

if (command === 'init') init();
else if (command === 'eject') eject();
else if (command === 'serve') await import('../src/server.mjs');
else {
  console.log('Usage: dx-hub [serve | init | eject [folder]] [--port 3050] [--host [address]] [--force]');
  process.exit(command === 'help' || command === '--help' ? 0 : 1);
}
