// Change-aware audit ledger for a Next.js App Router app.
//
// Splits the app into audit units (a page, a route handler, a layout, a file
// many units share, a workspace package, the app config), fingerprints the code
// each unit depends on, and compares that against what the ledger recorded when
// the unit was last audited. A unit whose code is unchanged does not need to be
// read again; a unit whose code changed reports exactly which files did.
//
// The rule that shapes every decision here: a false "fresh" is far worse than a
// false "stale". A stale verdict costs one re-read; a wrong fresh verdict hides
// changed code from every later audit. So anything the tool cannot see clearly
// (an import it cannot resolve, an `import(expr)` with a computed path) makes the
// unit `unknown`, which can never read as fresh until someone acknowledges it.

import ts from 'typescript';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const UNIT_KINDS = ['page', 'layout', 'route', 'meta', 'root', 'shared', 'pkg', 'config'];
export const ENTRY_KINDS = new Set(['page', 'layout', 'route', 'meta', 'root']);
export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const FINDING_STATUSES = ['open', 'fixed', 'verified', 'accepted', 'wontfix'];
export const EVIDENCE_TYPES = ['measured', 'inferred'];

const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/;
const TEXT_EXT = /\.(tsx?|jsx?|mjs|cjs|json|css|scss|sass|less|md|mdx|svg|html|txt|ya?ml)$/i;

// Exact names only, so editor and tool temp files (`page.tsx.tmp.15332`) are not entries.
const ROUTE_FILE = /^(page|layout|template|route|error|global-error|loading|not-found|default)\.(tsx|ts|jsx|js)$/;
const META_FILE =
  /^(robots|sitemap|manifest|icon\d*|apple-icon\d*|opengraph-image\d*|twitter-image\d*)\.(tsx|ts|jsx|js|png|jpe?g|gif|svg|ico|webmanifest|txt|xml)$|^favicon\.ico$/;
const ROOT_FILE = /^(middleware|instrumentation)\.(ts|js)$/;
const ATTACHABLE = new Set(['error', 'loading', 'not-found', 'default']);

export const toPosix = (p) => p.replace(/\\/g, '/');

// realpath gives the on-disk case (Windows resolves a wrong-case import anyway;
// Linux would not) and follows pnpm's workspace symlinks into packages/.
const realMemo = new Map();
const realNative = (p) => {
  let r = realMemo.get(p);
  if (r === undefined) {
    try {
      r = fs.realpathSync.native(p);
    } catch {
      r = path.resolve(p);
    }
    realMemo.set(p, r);
  }
  return r;
};

const sha = (algo, data) => createHash(algo).update(data).digest('hex');

// ─── hashing ────────────────────────────────────────────────────────────────

/**
 * Hash one file's content. Text is hashed without a BOM and with LF endings, so
 * a Windows checkout (core.autocrlf) and a Linux cloud checkout agree.
 */
export function hashFile(buf, relPath) {
  let data = buf;
  if (TEXT_EXT.test(relPath)) {
    let s = buf.toString('utf8');
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    data = Buffer.from(s.replace(/\r\n/g, '\n'), 'utf8');
  }
  return sha('sha1', data).slice(0, 16);
}

/**
 * `fp` covers paths and contents, so any edit, add, remove or rename changes it.
 * `cfp` covers contents only, which lets a renamed unit be paired with its old
 * record. Keys sort by code unit (plain sort), never by locale.
 */
export function fingerprint(hashes) {
  const keys = Object.keys(hashes).sort();
  const fp = createHash('sha256');
  for (const k of keys) fp.update(`${k}\0${hashes[k]}\n`);
  const cfp = createHash('sha256');
  for (const h of keys.map((k) => hashes[k]).sort()) cfp.update(`${h}\n`);
  return { fp: fp.digest('hex').slice(0, 16), cfp: cfp.digest('hex').slice(0, 16) };
}

// ─── import extraction and resolution ──────────────────────────────────────

/**
 * Every module specifier a file names, from a full AST walk. `preProcessFile`
 * misses `export * as ns from`, so it is not used. A dynamic `import()` or
 * `require()` whose argument is not a string literal is reported as opaque:
 * the tool cannot know what it loads.
 */
export function extractSpecifiers(text, fileName) {
  const scriptKind = fileName.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : fileName.endsWith('.ts')
      ? ts.ScriptKind.TS
      : fileName.endsWith('.jsx')
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, scriptKind);
  const specs = new Set();
  const opaque = [];
  const literal = (n) =>
    n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;

  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const s = literal(node.moduleSpecifier);
      if (s) specs.add(s);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const s = literal(node.moduleReference.expression);
      if (s) specs.add(s);
    } else if (ts.isCallExpression(node)) {
      const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((isImport || isRequire) && node.arguments.length > 0) {
        const s = literal(node.arguments[0]);
        if (s) specs.add(s);
        else {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          opaque.push(`${isImport ? 'import' : 'require'}(${node.arguments[0].getText(sf)}) at line ${line}`);
        }
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const s = literal(node.argument.literal);
      if (s) specs.add(s);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { specs: [...specs], opaque };
}

/** Names of the workspace packages under `<repo>/packages/*`. */
function workspacePackageNames(repoRoot) {
  const dir = path.join(repoRoot, 'packages');
  if (!fs.existsSync(dir)) return [];
  const names = [];
  for (const d of fs.readdirSync(dir)) {
    const pj = path.join(dir, d, 'package.json');
    if (fs.existsSync(pj)) {
      try {
        names.push(JSON.parse(fs.readFileSync(pj, 'utf8')).name);
      } catch {
        /* unreadable package.json: not a resolvable workspace name */
      }
    }
  }
  return names.filter(Boolean);
}

/**
 * Resolve specifiers exactly as the app's own TypeScript config does, then keep
 * only files that live in this repo. `isExternalLibraryImport` is ignored on
 * purpose: it reports true for pnpm-linked workspace packages, which would drop
 * every `@neram/*` file out of every closure.
 */
export function createResolver({ repoRoot, appDir, tsconfigPath }) {
  const repoReal = realNative(repoRoot);
  const host = { ...ts.sys, readDirectory: () => [], onUnRecoverableConfigFileDiagnostic: () => {} };
  const parsed = ts.getParsedCommandLineOfConfigFile(tsconfigPath, {}, host);
  const options = parsed ? parsed.options : {};
  const cache = ts.createModuleResolutionCache(appDir, (x) => x, options);
  const pathsBase = options.pathsBasePath || path.dirname(tsconfigPath);
  const aliases = Object.entries(options.paths || {}).map(([key, targets]) => ({
    prefix: key.endsWith('*') ? key.slice(0, -1) : key,
    wildcard: key.endsWith('*'),
    targets,
  }));
  const workspaceNames = workspacePackageNames(repoRoot);

  const relToRepo = (abs) => {
    const rel = toPosix(path.relative(repoReal, abs));
    return rel.startsWith('../') || rel === '..' || path.isAbsolute(rel) ? null : rel;
  };
  const followable = (rel) => rel && !rel.includes('node_modules/') && !rel.endsWith('.d.ts');

  const isLocal = (spec) =>
    spec.startsWith('.') ||
    spec.startsWith('/') ||
    aliases.some((a) => (a.wildcard ? spec.startsWith(a.prefix) : spec === a.prefix)) ||
    workspaceNames.some((n) => spec === n || spec.startsWith(`${n}/`));

  /** Candidate paths for a non-code asset TypeScript will not resolve (css, svg, json). */
  const assetCandidates = (spec, fromAbs) => {
    const clean = spec.split('?')[0];
    const out = [];
    if (clean.startsWith('.')) out.push(path.resolve(path.dirname(fromAbs), clean));
    for (const a of aliases) {
      if (a.wildcard && clean.startsWith(a.prefix)) {
        for (const t of a.targets) out.push(path.resolve(pathsBase, t.replace('*', clean.slice(a.prefix.length))));
      }
    }
    if (workspaceNames.some((n) => clean.startsWith(`${n}/`))) {
      out.push(path.join(appDir, 'node_modules', clean), path.join(repoRoot, 'node_modules', clean));
    }
    return out;
  };

  const resolve = (spec, fromAbs) => {
    const r = ts.resolveModuleName(spec, fromAbs, options, ts.sys, cache).resolvedModule;
    if (r) {
      const real = realNative(r.resolvedFileName);
      return followable(relToRepo(real)) ? { file: real } : { external: true };
    }
    if (!isLocal(spec)) return { external: true };
    for (const c of assetCandidates(spec, fromAbs)) {
      try {
        if (fs.statSync(c).isFile()) {
          const real = realNative(c);
          if (followable(relToRepo(real))) return { file: real };
        }
      } catch {
        /* candidate does not exist */
      }
    }
    return { unresolved: true };
  };

  return { resolve, relToRepo, repoReal };
}

// ─── entries (what Next.js itself treats as a route file) ───────────────────

/** The folder under an app that holds App Router files. */
export function appRouterDir(appDir) {
  for (const c of ['src/app', 'app']) {
    const d = path.join(appDir, c);
    if (fs.existsSync(d)) return d;
  }
  throw new Error(`No App Router folder (src/app or app) under ${appDir}`);
}

const isGroup = (seg) => /^\(.*\)$/.test(seg);

export function areaOf(kind, dir) {
  if (kind === 'shared') return 'shared';
  if (kind === 'pkg') return 'packages';
  if (kind === 'config') return 'config';
  if (kind === 'root') return 'shell';
  const segs = dir === '.' ? [] : dir.split('/').filter((s) => !isGroup(s));
  if (kind === 'route') return segs[0] === 'api' ? `api/${segs[1] ?? ''}`.replace(/\/$/, '') : segs.slice(0, 2).join('/') || 'root';
  if (kind === 'layout' && segs.length === 0) return 'shell';
  return segs.slice(0, 2).join('/') || 'root';
}

/**
 * Walk the App Router folder and group route files into entry units.
 * `error`, `loading`, `not-found` and `default` belong to the page in the same
 * folder, else to the nearest layout at or above it. `global-error` belongs to
 * the root layout. Private `_folders` hold no routes.
 */
export function discoverEntries(appDir) {
  const routerDir = appRouterDir(appDir);
  const byDir = new Map();
  const walk = (abs, rel) => {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name.startsWith('.') || ent.name.startsWith('_')) continue;
        walk(path.join(abs, ent.name), rel === '.' ? ent.name : `${rel}/${ent.name}`);
      } else if (ROUTE_FILE.test(ent.name) || META_FILE.test(ent.name)) {
        if (!byDir.has(rel)) byDir.set(rel, []);
        byDir.get(rel).push({ name: ent.name, abs: path.join(abs, ent.name) });
      }
    }
  };
  walk(routerDir, '.');

  const units = new Map();
  const add = (id, kind, dir, abs) => {
    if (!units.has(id)) units.set(id, { id, kind, dir, area: areaOf(kind, dir), entries: [] });
    units.get(id).entries.push(abs);
  };
  const base = (name) => name.replace(/\.[^.]+$/, '');
  const has = (dir, b) => (byDir.get(dir) || []).some((f) => base(f.name) === b && ROUTE_FILE.test(f.name));
  const nearestLayout = (dir) => {
    let d = dir;
    for (;;) {
      if (has(d, 'layout')) return d;
      if (d === '.') return '.';
      d = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '.';
    }
  };

  for (const [dir, files] of byDir) {
    for (const f of files) {
      const b = base(f.name);
      if (META_FILE.test(f.name) && !ROUTE_FILE.test(f.name)) {
        add(`meta:${dir === '.' ? '' : `${dir}/`}${f.name}`, 'meta', dir, f.abs);
      }
      else if (b === 'page') add(`page:${dir}`, 'page', dir, f.abs);
      else if (b === 'layout') add(`layout:${dir}`, 'layout', dir, f.abs);
      else if (b === 'route') add(`route:${dir}`, 'route', dir, f.abs);
      else if (b === 'global-error') add('layout:.', 'layout', '.', f.abs);
      else if (b === 'template') add(`layout:${nearestLayout(dir)}`, 'layout', nearestLayout(dir), f.abs);
      else if (ATTACHABLE.has(b)) {
        if (has(dir, 'page')) add(`page:${dir}`, 'page', dir, f.abs);
        else {
          const l = nearestLayout(dir);
          add(`layout:${l}`, 'layout', l, f.abs);
        }
      }
    }
  }

  for (const holder of [path.join(appDir, 'src'), appDir]) {
    if (!fs.existsSync(holder)) continue;
    for (const name of fs.readdirSync(holder)) {
      if (ROOT_FILE.test(name)) add(`root:${base(name)}`, 'root', '.', path.join(holder, name));
    }
  }
  for (const u of units.values()) u.entries.sort();
  return [...units.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ─── shared classification ─────────────────────────────────────────────────

/**
 * A file many units reach becomes its own unit, audited once instead of inside
 * every page that imports it. Hysteresis stops a file flapping across the line
 * (which would change fingerprints on both sides): promote at `promote` units,
 * demote only below `demote`, using the set that was shared last time.
 */
export function classifyShared(fanIn, prevShared, { promote = 6, demote = 4 } = {}) {
  const shared = new Set();
  for (const [file, n] of fanIn) {
    if (n >= promote || (prevShared.has(file) && n >= demote)) shared.add(file);
  }
  return shared;
}

// ─── the analysis ──────────────────────────────────────────────────────────

/**
 * Derive every unit of an app, with its files, hashes and fingerprints.
 * `prevShared` is the set of repo-relative files the ledger recorded as shared.
 */
export function analyzeApp({ repoRoot, appDir, tsconfigPath, prevShared = new Set(), promote = 6, demote = 4 }) {
  const started = Date.now();
  realMemo.clear(); // files may have moved since the last analysis in this process
  tsconfigPath = tsconfigPath || path.join(appDir, 'tsconfig.json');
  const { resolve, relToRepo } = createResolver({ repoRoot, appDir, tsconfigPath });
  const appRel = relToRepo(realNative(appDir));
  const inApp = (rel) => rel.startsWith(`${appRel}/`);

  const graph = new Map(); // rel -> { deps: rel[], problems: string[] }
  const absOf = new Map(); // rel -> abs
  const hashes = new Map(); // rel -> hash

  const node = (abs) => {
    const real = realNative(abs);
    const rel = relToRepo(real);
    if (graph.has(rel)) return rel;
    absOf.set(rel, real);
    const buf = fs.readFileSync(real);
    hashes.set(rel, hashFile(buf, rel));
    const entry = { deps: [], problems: [] };
    graph.set(rel, entry);
    if (CODE_EXT.test(rel) && !rel.endsWith('.d.ts')) {
      const { specs, opaque } = extractSpecifiers(buf.toString('utf8'), real);
      for (const o of opaque) entry.problems.push(`${rel}: computed ${o}`);
      for (const spec of specs) {
        const r = resolve(spec, real);
        if (r.file) entry.deps.push(node(r.file));
        else if (r.unresolved) entry.problems.push(`${rel}: cannot resolve '${spec}'`);
      }
      entry.deps = [...new Set(entry.deps)];
    }
    return rel;
  };

  const entryUnits = discoverEntries(appDir);
  const entryFiles = new Set();
  for (const u of entryUnits) {
    u.entryRels = u.entries.map((abs) => node(abs));
    u.entryRels.forEach((r) => entryFiles.add(r));
  }

  const closureOf = (starts) => {
    const seen = new Set();
    const stack = [...starts];
    while (stack.length) {
      const rel = stack.pop();
      if (seen.has(rel)) continue;
      seen.add(rel);
      for (const d of graph.get(rel).deps) if (!seen.has(d)) stack.push(d);
    }
    return seen;
  };

  // Fan-in per unit (a page and its loading/error files count once).
  const fanIn = new Map();
  for (const u of entryUnits) {
    u.full = closureOf(u.entryRels);
    for (const rel of u.full) {
      if (inApp(rel) && !entryFiles.has(rel)) fanIn.set(rel, (fanIn.get(rel) || 0) + 1);
    }
  }
  const shared = classifyShared(fanIn, prevShared, { promote, demote });
  // Anything a shared file imports is shared too, so each shared unit is one file.
  for (const rel of [...shared]) {
    for (const d of closureOf([rel])) if (inApp(d) && !entryFiles.has(d)) shared.add(d);
  }

  // The nearest package.json above a file names the workspace package it belongs to.
  const pkgMemo = new Map();
  const pkgNameOf = (rel) => {
    const chain = [];
    let dir = path.posix.dirname(rel);
    let found = null;
    for (;;) {
      if (pkgMemo.has(dir)) {
        found = pkgMemo.get(dir);
        break;
      }
      chain.push(dir);
      if (dir === '.') break;
      const pj = path.join(realNative(repoRoot), dir, 'package.json');
      if (fs.existsSync(pj)) {
        let name = dir;
        try {
          name = JSON.parse(fs.readFileSync(pj, 'utf8')).name || dir;
        } catch {
          /* unreadable package.json: fall back to the folder name */
        }
        found = { name, pj: `${dir}/package.json` };
        break;
      }
      dir = path.posix.dirname(dir);
    }
    for (const d of chain) pkgMemo.set(d, found);
    return found;
  };

  const hashesFor = (rels) => {
    const out = {};
    for (const r of [...rels].sort()) out[r] = hashes.get(r) ?? hashOnDisk(r);
    return out;
  };
  const hashOnDisk = (rel) => {
    const abs = path.join(realNative(repoRoot), rel);
    const h = hashFile(fs.readFileSync(abs), rel);
    hashes.set(rel, h);
    return h;
  };
  const problemsOf = (rels) => [...new Set([...rels].flatMap((r) => graph.get(r)?.problems ?? []))].sort();

  const units = new Map();
  const finish = (u, ownRels, fullRels) => {
    u.files = [...ownRels].sort();
    u.hashes = hashesFor(ownRels);
    const f = fingerprint(u.hashes);
    u.fp = f.fp;
    u.cfp = f.cfp;
    u.deepFp = fingerprint(hashesFor(fullRels)).fp;
    u.problems = problemsOf(ownRels);
    u.reachShared = [...fullRels]
      .filter((r) => shared.has(r) && !ownRels.has(r))
      .map((r) => `shared:${r.slice(appRel.length + 1)}`)
      .sort();
    u.reachPkg = [...new Set([...fullRels].filter((r) => !inApp(r)).map((r) => `pkg:${pkgNameOf(r)?.name ?? r.split('/')[0]}`))].sort();
    units.set(u.id, u);
  };

  const pkgFiles = new Map(); // pkg name -> { files:Set, pj }
  const notePkg = (rel) => {
    const p = pkgNameOf(rel);
    const name = p?.name ?? rel.split('/')[0];
    if (!pkgFiles.has(name)) pkgFiles.set(name, { files: new Set(), pj: p?.pj });
    pkgFiles.get(name).files.add(rel);
  };

  for (const u of entryUnits) {
    const own = new Set();
    const stack = [...u.entryRels];
    while (stack.length) {
      const rel = stack.pop();
      if (own.has(rel)) continue;
      if (!inApp(rel)) continue; // package file: its own unit
      if (shared.has(rel) && !u.entryRels.includes(rel)) continue; // shared file: its own unit
      own.add(rel);
      for (const d of graph.get(rel).deps) stack.push(d);
    }
    for (const r of u.full) if (!inApp(r)) notePkg(r);
    finish(u, own, u.full);
    delete u.full;
    delete u.entries;
  }

  for (const rel of shared) {
    const full = closureOf([rel]);
    const u = { id: `shared:${rel.slice(appRel.length + 1)}`, kind: 'shared', dir: path.posix.dirname(rel), area: 'shared', fanIn: fanIn.get(rel) || 0 };
    finish(u, new Set([rel]), full);
  }

  for (const [name, { files, pj }] of pkgFiles) {
    const own = new Set(files);
    if (pj && fs.existsSync(path.join(realNative(repoRoot), pj))) own.add(pj);
    const u = { id: `pkg:${name}`, kind: 'pkg', dir: pj ? path.posix.dirname(pj) : '.', area: 'packages' };
    finish(u, own, own);
  }

  // App config: framework and dependency versions, deploy config, the tsconfig chain.
  const configRels = new Set();
  for (const name of ['next.config.js', 'next.config.mjs', 'next.config.ts', 'package.json', 'vercel.json', 'public/manifest.json']) {
    if (fs.existsSync(path.join(appDir, name))) configRels.add(`${appRel}/${name}`);
  }
  let tsc = realNative(tsconfigPath);
  for (let guard = 0; guard < 10 && tsc && fs.existsSync(tsc); guard += 1) {
    const rel = relToRepo(tsc);
    if (!rel || rel.includes('node_modules/')) break;
    configRels.add(rel);
    const ext = ts.readConfigFile(tsc, ts.sys.readFile).config?.extends;
    tsc = typeof ext === 'string' && ext.startsWith('.') ? realNative(path.resolve(path.dirname(tsc), ext)) : null;
  }
  const appName = path.basename(appDir);
  finish({ id: `config:${appName}`, kind: 'config', dir: '.', area: 'config' }, configRels, configRels);

  return {
    units,
    appRel,
    fileCount: graph.size,
    sharedFiles: shared,
    ms: Date.now() - started,
  };
}

// ─── checklist ─────────────────────────────────────────────────────────────

/**
 * Parse checks from the checklist markdown. Each check is a `### ID Title`
 * heading followed by a backticked metadata line:
 *   `applies=page,layout evidence=static v=1`         (static: never expires)
 *   `applies=route evidence=runtime ttl=30 v=1`       (runtime: expires after ttl days)
 * The content hash lets `verify` notice a check whose wording changed without a
 * version bump (a bump is what makes already-audited units rerun it).
 */
export function parseChecklist(md) {
  const text = md.replace(/\r\n/g, '\n');
  const heads = [...text.matchAll(/^### ([A-Z]{2,6}-\d+)[ \t]+(.+)$/gm)];
  const checks = [];
  const errors = [];
  const seen = new Set();
  heads.forEach((m) => {
    const start = m.index;
    const rest = text.slice(start + m[0].length);
    const nextHead = rest.search(/^#{2,3} /m);
    const body = nextHead === -1 ? rest : rest.slice(0, nextHead);
    const id = m[1];
    const meta = body.match(/`([^`]*\bapplies=[^`]*)`/);
    if (seen.has(id)) errors.push(`${id}: duplicate check id`);
    seen.add(id);
    if (!meta) {
      errors.push(`${id}: missing metadata line \`applies=... evidence=... v=...\``);
      return;
    }
    const kv = Object.fromEntries(meta[1].trim().split(/\s+/).map((p) => p.split('=')));
    const applies = (kv.applies || '').split(',').filter(Boolean);
    const bad = applies.filter((k) => !UNIT_KINDS.includes(k));
    if (!applies.length || bad.length) errors.push(`${id}: applies must list unit kinds from ${UNIT_KINDS.join(',')} (got ${kv.applies})`);
    if (!['static', 'runtime'].includes(kv.evidence)) errors.push(`${id}: evidence must be static or runtime`);
    const v = Number(kv.v);
    if (!Number.isInteger(v) || v < 1) errors.push(`${id}: v must be a positive integer`);
    const ttl = kv.ttl === undefined ? null : Number(kv.ttl);
    if (kv.evidence === 'runtime' && !(ttl > 0)) errors.push(`${id}: runtime checks need ttl=<days>`);
    checks.push({
      id,
      family: id.split('-')[0],
      title: m[2].trim(),
      applies,
      evidence: kv.evidence,
      ttl,
      v,
      h: sha('sha1', `${m[0]}\n${body.trim()}`).slice(0, 8),
    });
  });
  return { checks, errors };
}

/**
 * Expand a `--checks` argument for one unit kind: `all`, a family (`HYD`) or
 * exact ids (`HYD-1`). Only checks that apply to the kind are returned.
 */
export function expandChecks(arg, checks, kind) {
  const applicable = checks.filter((c) => c.applies.includes(kind));
  const out = new Map();
  const unknown = [];
  const notApplicable = [];
  for (const token of String(arg || '').split(',').map((t) => t.trim()).filter(Boolean)) {
    if (token === 'all') applicable.forEach((c) => out.set(c.id, c));
    else if (/^[A-Z]{2,6}$/.test(token)) applicable.filter((c) => c.family === token).forEach((c) => out.set(c.id, c));
    else {
      const c = checks.find((x) => x.id === token);
      if (!c) unknown.push(token);
      else if (c.applies.includes(kind)) out.set(c.id, c);
      else notApplicable.push(token);
    }
  }
  return { checks: [...out.values()], unknown, notApplicable };
}

// ─── status ────────────────────────────────────────────────────────────────

const ageDays = (iso, now) => (now.getTime() - new Date(iso).getTime()) / 86_400_000;
export const problemsHash = (problems) => sha('sha1', problems.join('\n')).slice(0, 12);

export function diffFiles(recorded = {}, current = {}) {
  const changed = [];
  const added = [];
  const removed = [];
  for (const [f, h] of Object.entries(current)) {
    if (!(f in recorded)) added.push(f);
    else if (recorded[f] !== h) changed.push(f);
  }
  for (const f of Object.keys(recorded)) if (!(f in current)) removed.push(f);
  return { changed: changed.sort(), added: added.sort(), removed: removed.sort() };
}

/**
 * One unit's status against its ledger record. Precedence, worst first:
 * unknown > stale:code > stale:checks > stale:ttl > stale:deps > fresh.
 * `stale:deps` means only a shared file or package under the unit changed; that
 * dependency is audited as its own unit, so the default plan does not re-read this one.
 */
export function unitStatus(unit, rec, checks, now = new Date()) {
  if (!unit) return { status: 'gone' };
  if (unit.problems.length && (!rec || rec.problemsAck !== problemsHash(unit.problems))) {
    return { status: 'unknown', problems: unit.problems };
  }
  if (!rec) return { status: 'never' };
  const applicable = checks.filter((c) => c.applies.includes(unit.kind));
  const codeChanged = rec.fp !== unit.fp;
  const missing = applicable.filter((c) => !rec.checks?.[c.id] || rec.checks[c.id].v < c.v).map((c) => c.id);
  const expired = applicable
    .filter((c) => c.ttl && rec.checks?.[c.id] && ageDays(rec.checks[c.id].at, now) > c.ttl)
    .map((c) => c.id);
  const depsChanged = rec.deepFp !== unit.deepFp;
  let status = 'fresh';
  if (codeChanged) status = 'stale:code';
  else if (missing.length) status = 'stale:checks';
  else if (expired.length) status = 'stale:ttl';
  else if (depsChanged) status = 'stale:deps';
  return {
    status,
    diff: codeChanged ? diffFiles(rec.files, unit.hashes) : null,
    missingChecks: missing,
    expiredChecks: expired,
    depsChanged,
  };
}

/** Status of every current unit, plus records whose unit no longer exists. */
export function statusAll(units, ledger, checks, now = new Date()) {
  const out = new Map();
  for (const [id, u] of units) out.set(id, { id, unit: u, rec: ledger.get(id), ...unitStatus(u, ledger.get(id), checks, now) });
  const gone = [...ledger.values()].filter((r) => !units.has(r.id));
  for (const r of gone) {
    const twin = [...out.values()].find((s) => s.status === 'never' && s.unit.cfp === r.cfp && s.unit.kind === r.kind);
    if (twin) {
      twin.status = 'moved';
      twin.movedFrom = r.id;
    }
    out.set(r.id, { id: r.id, unit: null, rec: r, status: 'gone', movedTo: twin?.id });
  }
  return out;
}

// ─── planning ──────────────────────────────────────────────────────────────

const NEEDS_AUDIT = (s) => ['never', 'unknown', 'moved', 'stale:code', 'stale:checks', 'stale:ttl'].includes(s);

/** Layout units whose folder is the page's folder or an ancestor of it. */
function ancestorLayouts(unit, units) {
  if (unit.kind !== 'page') return [];
  const out = [];
  let d = unit.dir;
  for (;;) {
    if (units.has(`layout:${d}`)) out.push(`layout:${d}`);
    if (d === '.') break;
    d = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '.';
  }
  return out;
}

/**
 * Does a focus needle name this unit? It matches a unit id by substring, or one
 * of the unit's files by exact name (`NavBadgeProvider`, `NavBadgeProvider.tsx`)
 * or path suffix (`lib/swr-cache.ts`). File paths are not substring-matched:
 * `NotificationBell` must not pull in `TimetableNotificationBell`.
 */
const matchesFocus = (u, needle) =>
  u.id.toLowerCase().includes(needle) ||
  u.files.some((f) => {
    const lower = f.toLowerCase();
    const name = lower.slice(lower.lastIndexOf('/') + 1);
    return name === needle || name.replace(/\.[^.]+$/, '') === needle || lower.endsWith(`/${needle}`);
  });

/**
 * Pick this session's units. Focus targets come first, with their ancestor
 * layouts, the packages they reach and the app config. The shared files they
 * reach are listed but planned only with `expand` (a page can reach dozens).
 * Then come foundation units (config, layouts from the root down, then shared
 * files and packages by fan-in), stale units carrying open CRITICAL/HIGH findings,
 * other stale units and never-audited ones, up to the budget. Fresh units are
 * never planned; they come back as `skipped` so the report can say so.
 */
export function buildPlan(statuses, units, findings, { focus = [], budget = 25, expand = false } = {}) {
  const picked = new Map();
  const skipped = [];
  const reached = new Set();
  const take = (id, why) => {
    const s = statuses.get(id);
    if (!s || !s.unit || picked.has(id)) return;
    if (NEEDS_AUDIT(s.status)) picked.set(id, { ...s, why });
    else if (!skipped.some((x) => x.id === id)) skipped.push({ id, status: s.status, why });
  };

  const needles = focus.map((f) => toPosix(f).toLowerCase());
  const matched = [...units.values()].filter((u) => needles.some((n) => matchesFocus(u, n)));
  for (const u of matched) {
    take(u.id, 'focus');
    if (ENTRY_KINDS.has(u.kind) || u.kind === 'shared') {
      for (const l of ancestorLayouts(u, units)) take(l, `layout above ${u.id}`);
      for (const sId of u.reachShared) {
        if (expand) take(sId, `reached by ${u.id}`);
        else reached.add(sId);
      }
      for (const pId of u.reachPkg) take(pId, `reached by ${u.id}`);
      const cfg = [...units.values()].find((x) => x.kind === 'config');
      if (cfg) take(cfg.id, 'app config');
    }
  }

  const severe = new Set(
    [...findings.values()]
      .filter((f) => f.status === 'open' && (f.severity === 'CRITICAL' || f.severity === 'HIGH'))
      .flatMap((f) => f.units || []),
  );
  const order = [...statuses.values()].filter((s) => s.unit && NEEDS_AUDIT(s.status));
  // The app shell comes first: config, then layouts from the root down. Every
  // page loads them, yet they have no fan-in, so ranked by fan-in alone they sat
  // behind every shared file and never made the budget.
  const shellRank = (u) =>
    u.kind === 'config' ? 0 : u.kind === 'root' ? 1 : u.kind === 'layout' ? 2 + (u.dir === '.' ? 0 : u.dir.split('/').length) : Infinity;
  const foundation = order
    .filter((s) => ['config', 'root', 'layout', 'shared', 'pkg'].includes(s.unit.kind))
    .sort(
      (a, b) =>
        shellRank(a.unit) - shellRank(b.unit) ||
        (b.unit.fanIn || 0) - (a.unit.fanIn || 0) ||
        (a.id < b.id ? -1 : 1),
    );
  const tiers = [
    [foundation, 'foundation'],
    [order.filter((s) => s.status !== 'never' && severe.has(s.id)), 'open severe finding'],
    [order.filter((s) => s.status !== 'never'), 'stale'],
    [order.filter((s) => s.status === 'never').sort((a, b) => (a.unit.area + a.id < b.unit.area + b.id ? -1 : 1)), 'never audited'],
  ];
  for (const [list, why] of tiers) {
    for (const s of list) {
      if (picked.size >= Math.max(budget, 0)) break;
      take(s.id, why);
    }
  }
  const reachedNotPlanned = [...reached]
    .filter((id) => !picked.has(id) && NEEDS_AUDIT(statuses.get(id)?.status))
    .sort((a, b) => (units.get(b)?.fanIn || 0) - (units.get(a)?.fanIn || 0));
  return { units: [...picked.values()], skipped, reachedNotPlanned };
}

/** What `record` stores for a planned unit: the code as it was when the audit started. */
export function snapshotOf(unit) {
  return {
    id: unit.id,
    kind: unit.kind,
    fp: unit.fp,
    deepFp: unit.deepFp,
    cfp: unit.cfp,
    files: unit.hashes,
    problems: unit.problems,
  };
}

/**
 * Build the ledger record for an audited unit. When the code is the same as the
 * previous record, earlier check results still hold and are kept; when it
 * changed, only the checks run now count.
 */
export function buildRecord(snap, prevRec, checksRun, { now = new Date(), commit = null, findings = [], note, ackProblems = false } = {}) {
  const at = now.toISOString();
  const checks = prevRec && prevRec.fp === snap.fp ? { ...prevRec.checks } : {};
  for (const c of checksRun) checks[c.id] = { v: c.v, h: c.h, at };
  const rec = {
    id: snap.id,
    kind: snap.kind,
    at,
    commit,
    fp: snap.fp,
    deepFp: snap.deepFp,
    cfp: snap.cfp,
    files: snap.files,
    checks: Object.fromEntries(Object.entries(checks).sort(([a], [b]) => (a < b ? -1 : 1))),
    findings: [...new Set([...(prevRec?.findings || []), ...findings])].sort(),
  };
  if (snap.problems?.length && ackProblems) rec.problemsAck = problemsHash(snap.problems);
  if (note) rec.note = note;
  return rec;
}

// ─── ledger files (JSONL, merge=union friendly) ────────────────────────────

/**
 * Read a JSONL file of records keyed by `id`. When git's union merge leaves two
 * lines for one id, the newest by `stamp` wins, so concurrent branches combine
 * instead of conflicting.
 */
export function readJsonl(text, stamp = 'at') {
  const map = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || /^(<{7}|={7}|>{7})/.test(t)) continue;
    const obj = JSON.parse(t);
    const prev = map.get(obj.id);
    if (!prev || String(obj[stamp] || '') >= String(prev[stamp] || '')) map.set(obj.id, obj);
  }
  return map;
}

export const serializeJsonl = (map) =>
  [...map.keys()]
    .sort()
    .map((k) => JSON.stringify(map.get(k)))
    .join('\n') + (map.size ? '\n' : '');

export const readLedger = (text) => readJsonl(text, 'at');
export const readFindings = (text) => readJsonl(text, 'updatedAt');

export function nextFindingId(findings) {
  const max = [...findings.keys()].reduce((m, id) => Math.max(m, Number(id.replace(/\D/g, '')) || 0), 0);
  return `PERF-${String(max + 1).padStart(4, '0')}`;
}

// ─── verification ──────────────────────────────────────────────────────────

const DETAIL_FIELDS = ['rootCause', 'evidence', 'fix', 'impact'];

/** Integrity of the ledger, findings and checklist together. */
export function verifyLedger({ ledger, findings, checks, units = null }) {
  const errors = [];
  const warnings = [];
  const byId = new Map(checks.map((c) => [c.id, c]));
  const drift = new Set();
  for (const rec of ledger.values()) {
    if (!UNIT_KINDS.includes(rec.kind)) errors.push(`${rec.id}: unknown kind ${rec.kind}`);
    for (const k of ['fp', 'deepFp', 'cfp', 'at']) if (!rec[k]) errors.push(`${rec.id}: missing ${k}`);
    if (!rec.files || typeof rec.files !== 'object') errors.push(`${rec.id}: missing files`);
    for (const [cid, c] of Object.entries(rec.checks || {})) {
      const cur = byId.get(cid);
      if (!cur) warnings.push(`${rec.id}: check ${cid} is no longer in the checklist`);
      else if (cur.v === c.v && cur.h !== c.h && !drift.has(cid)) {
        drift.add(cid);
        warnings.push(`${cid}: wording changed since it was recorded but v is still ${cur.v}. Bump v if audited units should rerun it.`);
      }
    }
    for (const fid of rec.findings || []) if (!findings.has(fid)) errors.push(`${rec.id}: references unknown finding ${fid}`);
    if (units && !units.has(rec.id)) warnings.push(`${rec.id}: unit no longer exists (gone or moved)`);
  }
  for (const f of findings.values()) {
    if (!/^PERF-\d{4,}$/.test(f.id)) errors.push(`${f.id}: id must look like PERF-0001`);
    if (!SEVERITIES.includes(f.severity)) errors.push(`${f.id}: severity must be one of ${SEVERITIES.join(',')}`);
    if (!FINDING_STATUSES.includes(f.status)) errors.push(`${f.id}: status must be one of ${FINDING_STATUSES.join(',')}`);
    if (!f.title) errors.push(`${f.id}: missing title`);
    if (!Array.isArray(f.units) || !f.units.length) errors.push(`${f.id}: units must name at least one unit`);
    if (f.redacted) {
      const leaked = DETAIL_FIELDS.filter((k) => f[k] && String(f[k]).length);
      if (leaked.length) errors.push(`${f.id}: redacted finding must not carry ${leaked.join(', ')} (the repo is public)`);
    } else if (!EVIDENCE_TYPES.includes(f.evidenceType)) {
      errors.push(`${f.id}: evidenceType must be measured or inferred`);
    }
    if (units) for (const u of f.units || []) if (!units.has(u)) warnings.push(`${f.id}: unit ${u} no longer exists`);
  }
  return { errors, warnings };
}

// ─── file IO with a lock ───────────────────────────────────────────────────

/** Run `fn` holding an exclusive lock on the audit folder (stale after 60s). */
export function withLock(dir, fn, { staleMs = 60_000, timeoutMs = 15_000 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, '.ledger.lock');
  const start = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > staleMs) {
          fs.unlinkSync(lock);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(`The audit ledger is locked by another session (${lock}). Retry shortly; delete the lock only if no audit is running.`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try {
    return fn();
  } finally {
    try {
      fs.unlinkSync(lock);
    } catch {
      /* already gone */
    }
  }
}

export function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export const readText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
