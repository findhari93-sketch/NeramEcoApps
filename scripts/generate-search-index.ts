/**
 * generate-search-index.ts
 *
 * Runs before marketing app build. Fetches all colleges from Supabase
 * and writes them as a static TypeScript search index file.
 *
 * Usage: npx tsx scripts/generate-search-index.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from the marketing app (since this runs before next build)
const ENV_PATHS = [
  resolve(__dirname, '../apps/marketing/.env.local'),
  resolve(__dirname, '../.env.local'),
  resolve(__dirname, '../.env.production'),
  resolve(process.cwd(), '.env.local'),
];

for (const envPath of ENV_PATHS) {
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const OUTPUT_PATH = resolve(
  __dirname,
  '../apps/marketing/src/lib/generated-search-index.ts'
);

interface CollegeRow {
  slug: string;
  name: string;
  short_name: string | null;
  city: string;
  state: string;
  state_slug: string;
  type: string | null;
  established_year: number | null;
  coa_approved: boolean | null;
  naac_grade: string | null;
  nirf_rank: number | null;
  annual_fee_approx: number | null;
  accepted_exams: string[] | null;
  counseling_systems: string[] | null;
}

function formatFee(fee: number | null): string {
  if (!fee) return '';
  if (fee >= 100000) return `₹${(fee / 100000).toFixed(1)}L/yr`;
  if (fee >= 1000) return `₹${(fee / 1000).toFixed(0)}K/yr`;
  return `₹${fee}/yr`;
}

function buildDescription(c: CollegeRow): string {
  const parts: string[] = [];
  if (c.type) parts.push(c.type);
  if (c.established_year) parts.push(`Est. ${c.established_year}`);
  if (c.naac_grade) parts.push(`NAAC ${c.naac_grade}`);
  if (c.nirf_rank) parts.push(`NIRF #${c.nirf_rank}`);
  if (c.annual_fee_approx) parts.push(`Fee ${formatFee(c.annual_fee_approx)}`);
  if (c.coa_approved) parts.push('COA Approved');
  return parts.join(' · ') || 'Architecture College';
}

function buildKeywords(c: CollegeRow): string[] {
  const kw: string[] = [
    c.name.toLowerCase(),
    c.city.toLowerCase(),
    c.state.toLowerCase(),
  ];
  if (c.short_name) kw.push(c.short_name.toLowerCase());
  if (c.type) kw.push(c.type.toLowerCase());
  if (c.naac_grade) kw.push(`naac ${c.naac_grade.toLowerCase()}`);
  if (c.coa_approved) kw.push('coa approved');
  if (c.accepted_exams) {
    for (const exam of c.accepted_exams) kw.push(exam.toLowerCase());
  }
  if (c.counseling_systems) {
    for (const sys of c.counseling_systems) kw.push(sys.toLowerCase());
  }
  return [...new Set(kw)];
}

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[generate-search-index] Missing Supabase env vars. Writing empty index.');
    writeFileSync(
      OUTPUT_PATH,
      `// AUTO-GENERATED - DO NOT EDIT\n// Generated at: ${new Date().toISOString()}\n// Colleges: 0 (env vars missing)\nimport type { SearchEntry } from './search-index';\nexport const GENERATED_COLLEGE_INDEX: SearchEntry[] = [];\n`,
      'utf-8'
    );
    return;
  }

  let createClient: typeof import('@supabase/supabase-js').createClient;
  try {
    ({ createClient } = await import('@supabase/supabase-js'));
  } catch (err) {
    console.warn('[generate-search-index] @supabase/supabase-js not installed. Writing empty index.');
    writeFileSync(
      OUTPUT_PATH,
      `// AUTO-GENERATED - DO NOT EDIT\n// Generated at: ${new Date().toISOString()}\n// Colleges: 0 (supabase-js not available)\nimport type { SearchEntry } from './search-index';\nexport const GENERATED_COLLEGE_INDEX: SearchEntry[] = [];\n`,
      'utf-8'
    );
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: colleges, error } = await supabase
    .from('colleges')
    .select('slug, name, short_name, city, state, state_slug, type, established_year, coa_approved, naac_grade, nirf_rank, annual_fee_approx, accepted_exams, counseling_systems')
    .not('slug', 'is', null)
    .order('name');

  if (error) {
    console.error('[generate-search-index] Supabase error:', error.message);
    console.warn('[generate-search-index] Writing empty index as fallback.');
    writeFileSync(
      OUTPUT_PATH,
      `// AUTO-GENERATED - DO NOT EDIT\n// Generated at: ${new Date().toISOString()}\n// Colleges: 0 (fetch error: ${error.message})\nimport type { SearchEntry } from './search-index';\nexport const GENERATED_COLLEGE_INDEX: SearchEntry[] = [];\n`,
      'utf-8'
    );
    return;
  }

  const rows = (colleges || []) as CollegeRow[];
  console.log(`[generate-search-index] Fetched ${rows.length} colleges from Supabase`);

  const entries = rows.map((c) => {
    const path = `/colleges/${c.state_slug}/${c.slug}`;
    const title = `${c.name}, ${c.city}`;
    const description = buildDescription(c);
    const keywords = buildKeywords(c);
    return { path, title, description, keywords, category: 'college' as const };
  });

  const lines = entries.map((e) => {
    const kwStr = e.keywords.map((k) => `'${escapeString(k)}'`).join(', ');
    return `  {\n    path: '${escapeString(e.path)}',\n    title: '${escapeString(e.title)}',\n    description: '${escapeString(e.description)}',\n    keywords: [${kwStr}],\n    category: 'college',\n  }`;
  });

  const output = `// AUTO-GENERATED - DO NOT EDIT
// Generated at: ${new Date().toISOString()}
// Colleges: ${entries.length}
import type { SearchEntry } from './search-index';

export const GENERATED_COLLEGE_INDEX: SearchEntry[] = [
${lines.join(',\n')},
];
`;

  writeFileSync(OUTPUT_PATH, output, 'utf-8');
  console.log(`[generate-search-index] Wrote ${entries.length} college entries to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('[generate-search-index] Fatal error:', err);
  writeFileSync(
    OUTPUT_PATH,
    `// AUTO-GENERATED - DO NOT EDIT\n// Generated at: ${new Date().toISOString()}\n// Colleges: 0 (fatal error)\nimport type { SearchEntry } from './search-index';\nexport const GENERATED_COLLEGE_INDEX: SearchEntry[] = [];\n`,
    'utf-8'
  );
});
