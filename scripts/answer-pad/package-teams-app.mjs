#!/usr/bin/env node
/**
 * Build the Teams app package: manifest.json and the two icons, zipped with no
 * enclosing folder, ready for the Teams admin center or for sideloading.
 *
 *   node scripts/answer-pad/package-teams-app.mjs
 *       apps/nexus/teams-app/dist/neram-assistant-<version>.zip, from manifest.json as it is.
 *
 * Raise `version` in manifest.json before each upload: the Teams admin center
 * takes an update only with a higher one. (The separate "Neram Pad Dev" build
 * for tunnel testing is retired; Neram Assistant is the only Teams app.)
 *
 * The manifest is checked before anything is zipped: it carries no property the
 * Teams schema for its manifestVersion refuses, every page is https on a valid
 * domain, the sign-in resource names a valid domain and the app id, the bot is
 * the sign-in app, Teams' own Share button is hidden, and no user-visible text
 * has an en or em dash.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_DIR = join(ROOT, 'apps/nexus/teams-app');

/**
 * Every object in the Teams manifest schema refuses properties it does not
 * define, and the admin center rejects the whole package over one of them with a
 * single line: 'Schema validation failed at 'packageName': Property
 * "packageName" has not been defined and the schema does not allow additional
 * properties.' That is what v1.21 said about `packageName`, which v1.16 allowed.
 * The schema for the version the manifest declares is kept beside it, so the
 * same answer comes from here, before a zip exists, with no network.
 */
function schemaProblems(manifest) {
  const file = join(APP_DIR, `MicrosoftTeams.schema.${manifest.manifestVersion}.json`);
  if (!existsSync(file)) {
    return [`no schema kept for manifestVersion ${manifest.manifestVersion}: save ${manifest.$schema} as teams-app/${basename(file)}`];
  }
  const schema = JSON.parse(readFileSync(file, 'utf8'));

  const deref = (node) => {
    let at = node;
    while (at && typeof at.$ref === 'string') {
      at = at.$ref.replace(/^#\//, '').split('/').reduce((into, key) => into?.[key], schema);
    }
    return at;
  };
  // A property any branch of a choice defines counts as defined, so nothing is
  // blamed for a key that belongs to the branch it does not happen to match.
  const shapeOf = (node) => {
    const at = deref(node);
    if (!at) return null;
    const properties = new Map(Object.entries(at.properties ?? {}));
    let closed = at.additionalProperties === false;
    for (const branch of [...(at.allOf ?? []), ...(at.anyOf ?? []), ...(at.oneOf ?? [])]) {
      const sub = shapeOf(branch);
      if (!sub) continue;
      for (const [key, value] of sub.properties) if (!properties.has(key)) properties.set(key, value);
      closed = closed || sub.closed;
    }
    return { properties, closed, items: at.items };
  };

  const walk = (node, value, path) => {
    if (value === null || typeof value !== 'object') return [];
    const shape = shapeOf(node);
    if (!shape) return [];
    if (Array.isArray(value)) return value.flatMap((entry, index) => walk(shape.items, entry, `${path.replace(/\.$/, '')}[${index}].`));
    return Object.keys(value).flatMap((key) => {
      const property = shape.properties.get(key);
      if (!property) return shape.closed ? [`${path}${key} is not defined in the Teams manifest ${manifest.manifestVersion} schema`] : [];
      return walk(property, value[key], `${path}${key}.`);
    });
  };

  return walk(schema, manifest, '');
}

function problemsWith(manifest) {
  const problems = schemaProblems(manifest);
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

const manifest = JSON.parse(readFileSync(join(APP_DIR, 'manifest.json'), 'utf8'));

const problems = problemsWith(manifest);
if (problems.length > 0) {
  console.error(`The manifest is not ready:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}

const outDir = join(APP_DIR, 'dist');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `neram-assistant-${manifest.version}.zip`);
zip(manifest, out);
console.log(`Wrote ${out}`);
