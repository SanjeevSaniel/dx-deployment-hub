// What the terminal shows when the standalone hub starts: where to open it, whether hub.config.json was found and what is in it, and how to stop.
// Colour is used only when the terminal can show it (and NO_COLOR is not set), so a log file stays plain.
import { existsSync, readFileSync } from 'node:fs';
import { PATHS } from './config.mjs';
import { CONFIG_FILE, parseHubConfig } from './hub-config.mjs';

const COLOUR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = code => text => (COLOUR ? `\u001b[${code}m${text}\u001b[0m` : text);
const bold = paint('1');
const dim = paint('2');
const cyan = paint('36');
const green = paint('32');
const yellow = paint('33');
const violet = paint('38;5;141');

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** One line about hub.config.json: not found, wrong, or what it holds. */
function configLine() {
  if (!existsSync(PATHS.hubConfig)) {
    return `${yellow('!')} ${CONFIG_FILE} not found ${dim('- copy hub.config.sample.json to it')}`;
  }
  const { rows, problems } = parseHubConfig(readFileSync(PATHS.hubConfig, 'utf8'));
  if (problems.length) return `${yellow('!')} ${CONFIG_FILE}: ${problems[0]}`;
  const servers = new Set(rows.map(row => row.serverUrl)).size;
  const rulesets = new Set(rows.map(row => `${row.serverUrl} ${row.rulesetName}`)).size;
  return `${green('✓')} ${CONFIG_FILE} ${dim('-')} ${plural(servers, 'server')}, ${plural(rulesets, 'ruleset')}, ${plural(rows.length, 'version')}`;
}

export function printBanner(port, host = '127.0.0.1') {
  const open = ['127.0.0.1', 'localhost', '::1'].includes(host) ? '' : host;
  const rows = [
    `${violet('◆')} ${bold('Deployment Hub')} ${dim('· for Pega Constellation DX · by Sanjeev Kujur')}`,
    '',
    `${dim('Open')}    ${cyan(`http://localhost:${port}/hub`)}`,
    `${dim('Config')}  ${configLine()}`,
    ...(open
      ? [`${dim('Network')} ${yellow('!')} open to ${open}: anyone who can reach it can publish. It has no login.`]
      : []),
    `${dim('Stop')}    ${dim('Ctrl+C')}`
  ];
  const plain = text => text.replace(/\u001b\[[0-9;]*m/g, '');
  const width = Math.max(...rows.map(row => plain(row).length)) + 4;
  const line = text =>
    `${dim('│')}  ${text}${' '.repeat(width - plain(text).length - 2)}${dim('│')}`;
  console.log(`\n${dim(`╭${'─'.repeat(width)}╮`)}`);
  rows.forEach(row => console.log(line(row)));
  console.log(`${dim(`╰${'─'.repeat(width)}╯`)}\n`);
}
