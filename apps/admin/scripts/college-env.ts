/**
 * Points a college backfill script at one database, explicitly.
 *
 * `--env staging` reads the repo-root .env.staging, `--env prod` reads
 * .env.production. Only the Supabase URL and service key come from there; the
 * Gemini key comes from apps/admin/.env.local. Nothing is guessed from the
 * app's own .env.local, because which database that points at has changed
 * before. Call this BEFORE importing anything that loads @neram/database or
 * @neram/ai: their clients read the environment when they load.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : '';
}

export const flag = (name: string) => process.argv.includes(`--${name}`);

export function useEnv(): 'staging' | 'prod' {
  const env = arg('env');
  if (env !== 'staging' && env !== 'prod') {
    console.error('Pass --env staging or --env prod.');
    process.exit(1);
  }
  const root = resolve(__dirname, '..', '..', '..');
  const db = parseEnvFile(resolve(root, env === 'prod' ? '.env.production' : '.env.staging'));
  // The local Admin key has been revoked before; the first non-empty of these wins.
  const apps = resolve(__dirname, '..', '..');
  const geminiKey = ['marketing', 'nexus', 'admin']
    .map((app) => parseEnvFile(resolve(apps, app, '.env.local')).GEMINI_API_KEY)
    .find((k) => !!k);
  const url = db.NEXT_PUBLIC_SUPABASE_URL;
  const key = db.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the ${env} env file.`);
    process.exit(1);
  }
  const expectProd = env === 'prod';
  const isProd = /\/\/db\.neramclasses\.com|zdnypksjqnhtiblwdaic/.test(url);
  if (expectProd !== isProd) {
    console.error(`--env ${env} but the env file points at ${url}. Refusing.`);
    process.exit(1);
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  if (geminiKey && !process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = geminiKey;
  console.log(`Database: ${url} (${env})`);
  return env;
}

/** URL and service key for one environment, checked against the expected host. For scripts that talk to both. */
export function credsFor(env: 'staging' | 'prod'): { url: string; key: string } {
  const root = resolve(__dirname, '..', '..', '..');
  const db = parseEnvFile(resolve(root, env === 'prod' ? '.env.production' : '.env.staging'));
  const url = db.NEXT_PUBLIC_SUPABASE_URL;
  const key = db.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`Missing Supabase URL or key in the ${env} env file`);
  const isProd = /\/\/db\.neramclasses\.com|zdnypksjqnhtiblwdaic/.test(url);
  if ((env === 'prod') !== isProd) throw new Error(`${env} env file points at ${url}`);
  return { url, key };
}
