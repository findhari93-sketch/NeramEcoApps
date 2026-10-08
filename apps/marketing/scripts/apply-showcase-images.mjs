#!/usr/bin/env node
/**
 * One-off: turns the Claude Design export for the /apply Nexus showcase into
 * the WebP files the page serves from /images/apply/nexus/.
 *
 *   node apps/marketing/scripts/apply-showcase-images.mjs <folder-with-the-pngs>
 *
 * live.png is a Teams grid of named students, so the name chips are blurred
 * before export. Uses the sharp that pnpm already installed for Next.js.
 */
import { createRequire } from 'node:module';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const require = createRequire(import.meta.url);

function loadSharp() {
  try {
    return require('sharp');
  } catch {
    const store = path.join(repoRoot, 'node_modules', '.pnpm');
    const candidates = require('node:fs')
      .readdirSync(store)
      .filter((d) => d.startsWith('sharp@'))
      .sort()
      .reverse();
    for (const dir of candidates) {
      try {
        return require(path.join(store, dir, 'node_modules', 'sharp'));
      } catch {
        /* try the next one */
      }
    }
    throw new Error('sharp not found. Run pnpm install first.');
  }
}

const sharp = loadSharp();
const src = process.argv[2];
if (!src) {
  console.error('Usage: node apply-showcase-images.mjs <folder with drawing.png, live.png, lib-*.png, insp-*.png>');
  process.exit(1);
}
const out = path.join(repoRoot, 'apps', 'marketing', 'public', 'images', 'apply', 'nexus');
await mkdir(out, { recursive: true });

const QUALITY = 80;

async function write(pipeline, name) {
  const file = path.join(out, name);
  await pipeline.webp({ quality: QUALITY, effort: 6 }).toFile(file);
  const { size } = await stat(file);
  console.log(`${name.padEnd(20)} ${(size / 1024).toFixed(0).padStart(5)} KB`);
  return size;
}

let total = 0;

// The student's drawing: hero of scene 1, 1215 x 680. One 2x and one phone size.
total += await write(sharp(path.join(src, 'drawing.png')), 'drawing-1215.webp');
total += await write(sharp(path.join(src, 'drawing.png')).resize({ width: 680 }), 'drawing-680.webp');

// The live class grid: 4 x 4 tiles of 340 x 190.75. Blur the name chip at the
// bottom-left of every tile so no student name is readable on the public page.
const live = path.join(src, 'live.png');
const { width: lw, height: lh } = await sharp(live).metadata();
const cols = 4;
const rows = 4;
const tileW = lw / cols;
const tileH = lh / rows;
const chips = [];
for (let r = 0; r < rows; r += 1) {
  for (let c = 0; c < cols; c += 1) {
    const left = Math.round(c * tileW + 4);
    const top = Math.round(r * tileH + 136);
    const width = Math.min(300, lw - left);
    const height = Math.min(48, lh - top);
    const input = await sharp(live).extract({ left, top, width, height }).blur(16).toBuffer();
    chips.push({ input, left, top });
  }
}
const liveBlurred = await sharp(live).composite(chips).png().toBuffer();
total += await write(sharp(liveBlurred), 'live-1360.webp');
total += await write(sharp(liveBlurred).resize({ width: 680 }), 'live-680.webp');

// Class recording thumbnails and sketchbook tiles: small, keep native size.
for (const file of (await readdir(src)).filter((f) => /^(lib|insp)-\d+\.png$/.test(f)).sort()) {
  total += await write(sharp(path.join(src, file)), file.replace(/\.png$/, '.webp'));
}

console.log(`total ${(total / 1024).toFixed(0)} KB in ${out}`);
