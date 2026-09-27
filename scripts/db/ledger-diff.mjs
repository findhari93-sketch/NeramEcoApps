#!/usr/bin/env node
/**
 * Read-only comparison of supabase/migrations/ with the remote migration ledger
 * (supabase_migrations.schema_migrations). It prints repair commands and never
 * runs them.
 *
 *   SUPABASE_ACCESS_TOKEN=... node scripts/db/ledger-diff.mjs --env staging
 *   SUPABASE_ACCESS_TOKEN=... node scripts/db/ledger-diff.mjs --env production
 *   node scripts/db/ledger-diff.mjs --ledger ledger.json   (offline: [{version,name}])
 *
 * Why: `supabase db push` keys on the leading digits of each file name. Files
 * applied by hand or through MCP are recorded under a different version, so push
 * sees them as pending and aborts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECTS = {
  staging: 'hgxjavrsrvpihqrpezdh',
  production: 'zdnypksjqnhtiblwdaic',
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');

export function parseMigrationFile(file) {
  const m = /^(\d+)_?(.*)\.sql$/.exec(file);
  if (!m) return null;
  return { file, version: m[1], name: m[2] };
}

export function normaliseName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^\d+_?/, '')
    .replace(/\.sql$/, '');
}

/**
 * Pure diff. `local` is [{file, version, name}], `remote` is [{version, name}].
 */
export function diffLedger(local, remote) {
  const remoteByVersion = new Map(remote.map((r) => [String(r.version), r]));
  const remoteByName = new Map();
  for (const r of remote) {
    const key = normaliseName(r.name);
    if (!key) continue;
    if (!remoteByName.has(key)) remoteByName.set(key, []);
    remoteByName.get(key).push(r);
  }
  const localVersions = new Set(local.map((l) => l.version));

  const byVersion = new Map();
  for (const l of local) {
    if (!byVersion.has(l.version)) byVersion.set(l.version, []);
    byVersion.get(l.version).push(l.file);
  }
  const duplicateLocalVersions = [...byVersion.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([version, files]) => ({ version, files }));

  const appliedUnderOtherVersion = [];
  const missing = [];
  for (const l of local) {
    if (remoteByVersion.has(l.version)) continue;
    const twins = (remoteByName.get(normaliseName(l.name)) || []).filter(
      (r) => !localVersions.has(String(r.version)),
    );
    if (twins.length) {
      appliedUnderOtherVersion.push({ ...l, remoteVersions: twins.map((t) => String(t.version)) });
    } else {
      missing.push(l);
    }
  }

  const remoteOnly = remote.filter((r) => !localVersions.has(String(r.version)));

  return { missing, appliedUnderOtherVersion, remoteOnly, duplicateLocalVersions };
}

async function fetchLedger(env) {
  const ref = PROJECTS[env];
  if (!ref) throw new Error(`--env must be one of ${Object.keys(PROJECTS).join(', ')}`);
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set.');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'select version, name from supabase_migrations.schema_migrations order by version',
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Ledger query failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const env = arg('--env');
  const ledgerFile = arg('--ledger');
  if (!env && !ledgerFile) {
    console.error('Usage: node scripts/db/ledger-diff.mjs --env staging|production  (or --ledger file.json)');
    process.exit(2);
  }
  const remote = ledgerFile ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : await fetchLedger(env);
  const local = readdirSync(MIGRATIONS_DIR).map(parseMigrationFile).filter(Boolean);
  const d = diffLedger(local, remote);
  const label = env || ledgerFile;

  console.log(`Ledger diff for ${label}: ${local.length} local files, ${remote.length} ledger rows\n`);

  console.log(`1. Applied under a different version (${d.appliedUnderOtherVersion.length}). Repair, do not re-run:`);
  for (const m of d.appliedUnderOtherVersion) {
    console.log(`   ${m.file}  (ledger: ${m.remoteVersions.join(', ')})`);
    console.log(`     supabase migration repair --status applied ${m.version}`);
  }

  console.log(`\n2. Not in the ledger under any version (${d.missing.length}). Check the schema objects before deciding:`);
  for (const m of d.missing) console.log(`   ${m.file}`);

  console.log(`\n3. Ledger rows with no local file (${d.remoteOnly.length}). Usually MCP-stamped versions:`);
  for (const r of d.remoteOnly) {
    console.log(`   ${r.version}  ${r.name || ''}`);
    console.log(`     supabase migration repair --status reverted ${r.version}   # ledger row only, schema untouched`);
  }

  console.log(`\n4. Local files sharing one version prefix (${d.duplicateLocalVersions.length}). db push keys on the prefix:`);
  for (const dup of d.duplicateLocalVersions) console.log(`   ${dup.version}: ${dup.files.join(', ')}`);

  console.log('\nNothing was changed. Review each command, then run it with the project linked to this environment.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
