#!/usr/bin/env node
/**
 * Build the Teams app package: manifest.json and the two icons, zipped with no
 * enclosing folder, ready for the Teams admin center or for sideloading.
 *
 *   node scripts/answer-pad/package-teams-app.mjs
 *       apps/nexus/teams-app/dist/neram-assistant-<version>.zip, from manifest.json as it is.
 *
 *   node scripts/answer-pad/package-teams-app.mjs --dev --host <tunnel host> [--bot] [--version 1.1.1]
 *       A separate "Neram Pad Dev" app with its own app id, whose tab pages, valid
 *       domain and sign-in resource are the tunnel (the host only, no https://).
 *       The bot and its permissions are left out unless --bot is given: a bot id
 *       belongs to one Teams app in a tenant, and the real app already uses it.
 *
 * The manifest is checked before anything is zipped: every page is https on a
 * valid domain, the sign-in resource names a valid domain and the app id, the
 * bot is the sign-in app, Teams' own Share button is hidden, and no user-visible
 * text has an en or em dash.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_DIR = join(ROOT, 'apps/nexus/teams-app');
const PROD_HOST = 'nexus.neramclasses.com';
/** The dev copy's own Teams app id, so it can sit next to the real app. */
const DEV_APP_ID = '7b1e4f0a-3c52-4d8e-9a61-2f9c0b7d5e43';

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function devManifest(prod, host, withBot) {
  const swapHost = (url) => url.split(`https://${PROD_HOST}`).join(`https://${host}`);
  const manifest = structuredClone(prod);

  manifest.id = DEV_APP_ID;
  manifest.packageName = `${prod.packageName}.dev`;
  manifest.name = { short: 'Neram Pad Dev', full: 'Neram Answer Pad (development)' };
  // My Work stays in the real app; the dev copy is only the Answer Pad.
  delete manifest.staticTabs;
  manifest.configurableTabs = prod.configurableTabs.map((tab) => ({ ...tab, configurationUrl: swapHost(tab.configurationUrl) }));
  manifest.validDomains = [host];
  manifest.webApplicationInfo = { ...prod.webApplicationInfo, resource: `api://${host}/${prod.webApplicationInfo.id}` };
  if (!withBot) {
    delete manifest.bots;
    // Sharing results to the meeting screen needs no bot, so its delegated permission stays.
    const delegated = (prod.authorization?.permissions?.resourceSpecific ?? []).filter((permission) => permission.type === 'Delegated');
    if (delegated.length > 0) manifest.authorization = { permissions: { resourceSpecific: delegated } };
    else delete manifest.authorization;
  }
  return manifest;
}

function problemsWith(manifest) {
  const problems = [];
  const domains = new Set(manifest.validDomains ?? []);

  const pages = [
    ...(manifest.staticTabs ?? []).flatMap((tab) => [tab.contentUrl, tab.websiteUrl]),
    ...(manifest.configurableTabs ?? []).map((tab) => tab.configurationUrl),
  ].filter(Boolean);
  for (const page of pages) {
    const url = new URL(page);
    if (url.protocol !== 'https:') problems.push(`${page} is not https`);
    if (!domains.has(url.host)) problems.push(`${url.host} is not in validDomains`);
  }

  const app = manifest.webApplicationInfo ?? {};
  const resource = /^api:\/\/([^/]+)\/(.+)$/.exec(app.resource ?? '');
  if (!resource || resource[2] !== app.id) problems.push('webApplicationInfo.resource must be api://<host>/<app id>');
  else if (!domains.has(resource[1])) problems.push(`webApplicationInfo.resource host ${resource[1]} is not in validDomains`);

  for (const bot of manifest.bots ?? []) {
    if (bot.botId !== app.id) problems.push('the bot must be the same Entra app as sign-in');
  }
  // Without it Teams puts its own Share button under the side panel for everyone,
  // students included, and one press takes over the meeting screen.
  if (manifest.meetingExtensionDefinition?.supportsCustomShareToStage !== true) {
    problems.push('meetingExtensionDefinition.supportsCustomShareToStage must be true (it hides Teams\' own Share button)');
  }
  if (Number(manifest.manifestVersion) < 1.21) problems.push('manifestVersion must be 1.21 or later for supportsCustomShareToStage');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? '')) problems.push('version must look like 1.2.3');
  if ((manifest.name?.short ?? '').length > 30) problems.push('name.short is longer than 30 characters');
  if ((manifest.description?.short ?? '').length > 80) problems.push('description.short is longer than 80 characters');
  if (/[–—]/.test(JSON.stringify([manifest.name, manifest.description]))) problems.push('user-visible text has an en or em dash');
  return problems;
}

function zip(manifest, out) {
  const stage = mkdtempSync(join(tmpdir(), 'teams-app-'));
  try {
    writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    copyFileSync(join(APP_DIR, 'color.png'), join(stage, 'color.png'));
    copyFileSync(join(APP_DIR, 'outline.png'), join(stage, 'outline.png'));
    rmSync(out, { force: true });

    const files = ['manifest.json', 'color.png', 'outline.png'].map((file) => join(stage, file));
    if (process.platform === 'win32') {
      const paths = files.map((file) => `'${file.replace(/'/g, "''")}'`).join(',');
      execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path ${paths} -DestinationPath '${out.replace(/'/g, "''")}' -Force`], {
        stdio: 'inherit',
      });
    } else {
      execFileSync('zip', ['-j', out, ...files], { stdio: 'inherit' });
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

const dev = process.argv.includes('--dev');
const host = dev ? option('--host') : PROD_HOST;
if (dev && (!host || !/^[a-z0-9.-]+$/i.test(host))) {
  console.error('Usage: node scripts/answer-pad/package-teams-app.mjs --dev --host <tunnel host, without https://> [--bot]');
  process.exit(1);
}

const prod = JSON.parse(readFileSync(join(APP_DIR, 'manifest.json'), 'utf8'));
const manifest = dev ? devManifest(prod, host, process.argv.includes('--bot')) : prod;
// The Teams admin center takes an update only with a higher version, so the dev copy can be given one.
const version = option('--version');
if (dev && version) manifest.version = version;

const problems = problemsWith(manifest);
if (problems.length > 0) {
  console.error(`The manifest is not ready:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}

const outDir = join(APP_DIR, 'dist');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${dev ? 'neram-pad-dev' : 'neram-assistant'}-${manifest.version}.zip`);
zip(manifest, out);
console.log(`Wrote ${out}`);
