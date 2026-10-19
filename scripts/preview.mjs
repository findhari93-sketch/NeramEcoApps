#!/usr/bin/env node
/**
 * Production build of one app, run locally against the prod or staging env.
 *
 *   node scripts/preview.mjs <prod|staging> <marketing|app|nexus|admin>
 *   node scripts/preview.mjs stop [app]      (no app = all four)
 *
 * `next start` needs the app's usual port (Microsoft sign-in only redirects
 * back to localhost:3012 / 3013), so a `next dev` left running there made
 * every preview die with EADDRINUSE. Worse, dev and build share `.next`, so
 * building under a live dev server breaks it. We stop the Next server on the
 * port first, then build, then start.
 */
import { execSync, spawnSync } from 'node:child_process';

const APPS = {
  marketing: { filter: '@neram/marketing', port: 3010 },
  app: { filter: '@neram/tools-app', port: 3011 },
  nexus: { filter: '@neram/nexus', port: 3012 },
  admin: { filter: '@neram/admin', port: 3013 },
};
const ENVS = { prod: '.env.production', staging: '.env.staging' };
const isWin = process.platform === 'win32';

const sh = (cmd) => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

/** PIDs listening on the port. */
function listeners(port) {
  if (isWin) {
    const pids = sh('netstat -ano -p tcp')
      .split(/\r?\n/)
      .filter((l) => /LISTENING/.test(l) && new RegExp(`:${port}\\s`).test(l))
      .map((l) => Number(l.trim().split(/\s+/).pop()));
    return [...new Set(pids)].filter(Boolean);
  }
  return sh(`lsof -ti tcp:${port} -sTCP:LISTEN`).split(/\s+/).map(Number).filter(Boolean);
}

function processInfo(pid) {
  if (isWin) {
    const json = sh(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ParentProcessId,CommandLine | ConvertTo-Json"`,
    );
    if (!json.trim()) return null;
    const p = JSON.parse(json);
    return { parent: p.ParentProcessId, cmd: p.CommandLine || '' };
  }
  const line = sh(`ps -o ppid=,command= -p ${pid}`).trim();
  if (!line) return null;
  const [ppid, ...rest] = line.split(/\s+/);
  return { parent: Number(ppid), cmd: rest.join(' ') };
}

const isNext = (cmd) => /[\\/]next[\\/]dist[\\/]|next (dev|start)/.test(cmd);

/** The outermost Next process above the listener, so `next dev` cannot respawn it. */
function topNextProcess(pid) {
  let top = pid;
  let info = processInfo(pid);
  if (!info || !isNext(info.cmd)) return { pid, cmd: info?.cmd ?? '', next: false };
  let cmd = info.cmd;
  for (let i = 0; i < 5; i++) {
    const up = processInfo(info.parent);
    if (!up || !isNext(up.cmd)) break;
    top = info.parent;
    cmd = up.cmd;
    info = up;
  }
  return { pid: top, cmd, next: true };
}

function kill(pid) {
  if (isWin) sh(`taskkill /PID ${pid} /T /F`);
  else sh(`kill -9 ${pid}`);
}

async function freePort(name, port) {
  const pids = listeners(port);
  if (!pids.length) return true;
  for (const pid of pids) {
    const proc = topNextProcess(pid);
    if (!proc.next) {
      console.error(`\nPort ${port} (${name}) is used by something that is not a Next server, so it was left alone:`);
      console.error(`  PID ${pid}: ${proc.cmd || 'unknown'}`);
      console.error(isWin ? `  Stop it with: taskkill //PID ${pid} //F   (Git Bash)` : `  Stop it with: kill ${pid}`);
      return false;
    }
    const kind = /\bdev\b/.test(proc.cmd) ? 'dev server' : 'server';
    console.log(`Stopping the ${name} ${kind} on port ${port} (PID ${proc.pid}).`);
    kill(proc.pid);
  }
  for (let i = 0; i < 20 && listeners(port).length; i++) await new Promise((r) => setTimeout(r, 250));
  if (listeners(port).length) {
    console.error(`Port ${port} is still busy. Close the terminal running it and try again.`);
    return false;
  }
  return true;
}

function run(cmd) {
  const r = spawnSync(cmd, { stdio: 'inherit', shell: true });
  return r.status ?? 1;
}

const usage = () => {
  console.error('Usage: node scripts/preview.mjs <prod|staging> <marketing|app|nexus|admin>');
  console.error('       node scripts/preview.mjs stop [marketing|app|nexus|admin]');
  process.exit(1);
};

const [mode, name] = process.argv.slice(2);

if (mode === 'stop') {
  const names = name ? [name] : Object.keys(APPS);
  if (names.some((n) => !APPS[n])) usage();
  let ok = true;
  for (const n of names) {
    if (!listeners(APPS[n].port).length) console.log(`${n}: port ${APPS[n].port} is already free.`);
    else ok = (await freePort(n, APPS[n].port)) && ok;
  }
  process.exit(ok ? 0 : 1);
}

if (!ENVS[mode] || !APPS[name]) usage();
const { filter, port } = APPS[name];
const envFile = ENVS[mode];

if (!(await freePort(name, port))) process.exit(1);

const built = run(`dotenv -e ${envFile} -- turbo run build --filter=${filter}`);
if (built !== 0) process.exit(built);

console.log(`\n${name} (${mode} env) on http://localhost:${port}. Press Ctrl+C to stop, or run: pnpm stop:${name}\n`);
process.exit(run(`dotenv -e ${envFile} -- pnpm --filter ${filter} start`));
