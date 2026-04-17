# Universal Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the marketing site's basic static search with a comprehensive cross-site search covering all marketing pages, 500+ colleges from Supabase, coaching locations, and tools app pages, with fuzzy matching via Fuse.js, grouped results UI, recent searches, and lightweight analytics.

**Architecture:** Build-time script generates college search entries from Supabase into a TypeScript file. This merges with handcrafted static entries (pages, tools, coaching). Fuse.js provides client-side fuzzy search over the merged index. A redesigned SearchDialog groups results by category. A thin analytics API route logs search events to Supabase via `navigator.sendBeacon()`.

**Tech Stack:** Next.js 14, Fuse.js, MUI v5, Supabase (Postgres), TypeScript, tsx (script runner)

**Spec:** `docs/superpowers/specs/2026-04-17-universal-search-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `scripts/generate-search-index.ts` | Create | Build-time script: fetches colleges from Supabase, writes generated index file |
| `apps/marketing/src/lib/generated-search-index.ts` | Create (auto) | Auto-generated college entries (gitignored, created by build script) |
| `apps/marketing/src/lib/search-index.ts` | Rewrite | Expanded search entry type, new static entries (tools, coaching, counseling, college category pages), merge with generated index, Fuse.js search function |
| `apps/marketing/src/components/SearchDialog.tsx` | Rewrite | Grouped results UI, recent searches, quick links, analytics tracking |
| `apps/marketing/src/components/Header.tsx` | Modify (lines 448-465) | Replace icon button with prominent search trigger |
| `apps/marketing/package.json` | Modify | Add `fuse.js` dependency, update build script |
| `apps/marketing/.gitignore` | Modify | Add generated index file |
| `apps/marketing/src/app/api/analytics/search/route.ts` | Create | Analytics ingestion endpoint |
| `supabase/migrations/XXXX_search_analytics.sql` | Create | Create `search_analytics` table |

---

### Task 1: Install Fuse.js and Update Build Config

**Files:**
- Modify: `apps/marketing/package.json`
- Modify: `apps/marketing/.gitignore`

- [ ] **Step 1: Install fuse.js**

Run:
```bash
cd apps/marketing && pnpm add fuse.js
```

- [ ] **Step 2: Update build script to chain index generation**

In `apps/marketing/package.json`, change the build script:

```json
"build": "npx tsx ../../scripts/generate-search-index.ts && next build",
```

The full scripts section becomes:
```json
"scripts": {
  "dev": "next dev -p 3010",
  "build": "npx tsx ../../scripts/generate-search-index.ts && next build",
  "start": "next start -p 3010",
  "lint": "next lint",
  "type-check": "tsc --noEmit",
  "clean": "node -e \"const fs=require('fs');fs.rmSync('.next',{recursive:true,force:true})\"",
  "clean:build": "node -e \"const fs=require('fs');fs.rmSync('.next',{recursive:true,force:true})\""
}
```

- [ ] **Step 3: Add generated file to .gitignore**

Append to `apps/marketing/.gitignore`:
```
# Auto-generated search index (created at build time)
src/lib/generated-search-index.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/package.json apps/marketing/.gitignore apps/marketing/pnpm-lock.yaml
git commit -m "feat(marketing): add fuse.js dependency, update build pipeline for search index generation"
```

---

### Task 2: Build-Time College Index Generator Script

**Files:**
- Create: `scripts/generate-search-index.ts`

This script runs before `next build` in marketing. It connects to Supabase (using env vars already available in the build environment), fetches all colleges, and writes a TypeScript file at `apps/marketing/src/lib/generated-search-index.ts`.

- [ ] **Step 1: Create the generator script**

Create `scripts/generate-search-index.ts`:

```typescript
/**
 * generate-search-index.ts
 * 
 * Runs before marketing app build. Fetches all colleges from Supabase
 * and writes them as a static TypeScript search index file.
 * 
 * Usage: npx tsx scripts/generate-search-index.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const OUTPUT_PATH = resolve(
  import.meta.dirname || __dirname,
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
  // Don't fail the build - write empty index
  writeFileSync(
    OUTPUT_PATH,
    `// AUTO-GENERATED - DO NOT EDIT\n// Generated at: ${new Date().toISOString()}\n// Colleges: 0 (fatal error)\nimport type { SearchEntry } from './search-index';\nexport const GENERATED_COLLEGE_INDEX: SearchEntry[] = [];\n`,
    'utf-8'
  );
});
```

- [ ] **Step 2: Test the script locally**

Run:
```bash
npx tsx scripts/generate-search-index.ts
```

Expected: Console output like `[generate-search-index] Fetched 52 colleges from Supabase` and a new file at `apps/marketing/src/lib/generated-search-index.ts` with college entries.

- [ ] **Step 3: Verify the generated file**

Run:
```bash
head -20 apps/marketing/src/lib/generated-search-index.ts
```

Expected: A file starting with `// AUTO-GENERATED` comment, importing `SearchEntry` type, and containing college entry objects.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-search-index.ts
git commit -m "feat(scripts): add build-time search index generator for college data"
```

---

### Task 3: Rewrite Search Index with Expanded Entries and Fuse.js

**Files:**
- Rewrite: `apps/marketing/src/lib/search-index.ts`

This task replaces the entire search-index.ts with:
1. Expanded `SearchCategory` type (adds `college`, `coaching`, `counseling`)
2. All existing ~70 static entries (keep as-is)
3. New static entries for tools app pages, coaching locations, counseling, and college category pages
4. Import of generated college index
5. Fuse.js-based search function replacing the old scoring algorithm
6. Category configuration (colors, icons, labels, max results)

- [ ] **Step 1: Rewrite search-index.ts**

Replace the entire contents of `apps/marketing/src/lib/search-index.ts` with:

```typescript
import Fuse from 'fuse.js';
import { GENERATED_COLLEGE_INDEX } from './generated-search-index';

// ─── Types ──────────────────────────────────────────────────────

export type SearchCategory =
  | 'page'
  | 'course'
  | 'tool'
  | 'nata'
  | 'blog'
  | 'legal'
  | 'college'
  | 'coaching'
  | 'counseling';

export interface SearchEntry {
  path: string;
  title: string;
  description: string;
  keywords: string[];
  category: SearchCategory;
}

// ─── Category Configuration ─────────────────────────────────────

export const CATEGORY_CONFIG: Record<
  SearchCategory,
  { label: string; color: string; maxResults: number }
> = {
  college: { label: 'Colleges', color: '#2e7d32', maxResults: 3 },
  page: { label: 'Pages', color: '#1976d2', maxResults: 4 },
  course: { label: 'Courses', color: '#7b1fa2', maxResults: 3 },
  tool: { label: 'Free Tools', color: '#ed6c02', maxResults: 3 },
  nata: { label: 'NATA 2026', color: '#9c27b0', maxResults: 3 },
  coaching: { label: 'Coaching', color: '#0288d1', maxResults: 3 },
  counseling: { label: 'Counseling', color: '#00796b', maxResults: 3 },
  blog: { label: 'Blog', color: '#0288d1', maxResults: 2 },
  legal: { label: 'Legal', color: '#757575', maxResults: 2 },
};

// Display order for grouped results
export const CATEGORY_ORDER: SearchCategory[] = [
  'college',
  'page',
  'course',
  'tool',
  'nata',
  'coaching',
  'counseling',
  'blog',
  'legal',
];

export function getCategoryLabel(category: SearchCategory): string {
  return CATEGORY_CONFIG[category].label;
}

export function getCategoryColor(category: SearchCategory): string {
  return CATEGORY_CONFIG[category].color;
}

// ─── Static Search Index ────────────────────────────────────────

const STATIC_INDEX: SearchEntry[] = [
  // ── Main Pages ──────────────────────────────────────────────
  {
    path: '/',
    title: 'Home',
    description: 'Best NATA & JEE Paper 2 coaching in India. Online and offline classes with expert IIT/NIT alumni faculty.',
    keywords: ['home', 'neram classes', 'nata coaching', 'jee paper 2'],
    category: 'page',
  },
  {
    path: '/about',
    title: 'About Neram Classes',
    description: 'Learn about our mission, faculty, and 99.9% success rate in NATA coaching.',
    keywords: ['about', 'mission', 'faculty', 'team', 'history'],
    category: 'page',
  },
  {
    path: '/courses',
    title: 'Courses',
    description: 'Browse all courses: NATA coaching, JEE Paper 2, Revit, AutoCAD, SketchUp training.',
    keywords: ['courses', 'programs', 'coaching', 'training', 'classes'],
    category: 'course',
  },
  {
    path: '/fees',
    title: 'Fee Structure',
    description: 'Course fees, payment options, installment plans. Crash Course ₹15,000, 1-Year ₹25,000, 2-Year ₹30,000.',
    keywords: ['fees', 'price', 'cost', 'payment', 'installment', 'pricing'],
    category: 'page',
  },
  {
    path: '/apply',
    title: 'Apply Now',
    description: 'Start your application to join Neram Classes. Simple online application form.',
    keywords: ['apply', 'admission', 'registration', 'join', 'enroll', 'application'],
    category: 'page',
  },
  {
    path: '/contact',
    title: 'Contact Us',
    description: 'Get in touch: phone, email, office hours, and center locations.',
    keywords: ['contact', 'phone', 'email', 'address', 'location', 'support', 'help'],
    category: 'page',
  },
  {
    path: '/centers',
    title: 'Our Centers',
    description: 'Find offline coaching centers in Coimbatore, Chennai, Bangalore, Madurai, Trichy, and more.',
    keywords: ['centers', 'offline', 'location', 'address', 'visit', 'branch'],
    category: 'page',
  },
  {
    path: '/demo-class',
    title: 'Book a Free Demo Class',
    description: 'Attend a free demo class on Sundays. Experience our teaching methodology before enrolling.',
    keywords: ['demo', 'free class', 'trial', 'sample', 'try'],
    category: 'page',
  },
  {
    path: '/testimonials',
    title: 'Student Testimonials',
    description: 'Hear from our students: success stories, reviews, and experiences at Neram Classes.',
    keywords: ['testimonials', 'reviews', 'success stories', 'students', 'feedback'],
    category: 'page',
  },
  {
    path: '/achievements',
    title: 'Achievements',
    description: 'Our students\' achievements: top ranks, college placements, and NATA scores.',
    keywords: ['achievements', 'results', 'toppers', 'ranks', 'placements'],
    category: 'page',
  },
  {
    path: '/alumni',
    title: 'Alumni Network',
    description: 'Connect with our alumni network of architecture professionals across India.',
    keywords: ['alumni', 'network', 'graduates', 'community'],
    category: 'page',
  },
  {
    path: '/scholarship',
    title: 'Scholarship',
    description: 'Apply for scholarships based on academic performance and financial background.',
    keywords: ['scholarship', 'financial aid', 'discount', 'merit'],
    category: 'page',
  },
  {
    path: '/careers',
    title: 'Careers at Neram Classes',
    description: 'Join our team: open positions for teachers, content creators, and more.',
    keywords: ['careers', 'jobs', 'hiring', 'work', 'positions'],
    category: 'page',
  },
  {
    path: '/youtube-reward',
    title: 'YouTube Subscription Reward',
    description: 'Subscribe to our YouTube channel and get Rs. 50 off on your course fee.',
    keywords: ['youtube', 'reward', 'discount', 'subscribe', 'offer'],
    category: 'page',
  },
  {
    path: '/free-resources',
    title: 'Free Resources',
    description: 'Free NATA study materials, practice papers, and learning resources.',
    keywords: ['free', 'resources', 'study material', 'practice', 'download'],
    category: 'page',
  },
  {
    path: '/blog',
    title: 'Blog',
    description: 'Articles about NATA preparation, architecture careers, and coaching tips.',
    keywords: ['blog', 'articles', 'news', 'tips', 'guides'],
    category: 'blog',
  },
  {
    path: '/enroll',
    title: 'Enroll Now',
    description: 'Complete your enrollment and start your coaching journey with Neram Classes.',
    keywords: ['enroll', 'enrollment', 'register', 'join', 'start'],
    category: 'page',
  },
  {
    path: '/my-enrollment',
    title: 'My Enrollment',
    description: 'View your enrollment details, batch schedule, and payment history.',
    keywords: ['my enrollment', 'dashboard', 'batch', 'schedule'],
    category: 'page',
  },
  {
    path: '/premium',
    title: 'Premium Programs',
    description: 'Premium coaching with 1-on-1 mentoring and personalized study plans.',
    keywords: ['premium', 'personal mentoring', '1-on-1', 'exclusive'],
    category: 'course',
  },
  {
    path: '/pay',
    title: 'Make a Payment',
    description: 'Pay your course fees online via Razorpay. UPI, cards, net banking accepted.',
    keywords: ['pay', 'payment', 'razorpay', 'upi', 'fees'],
    category: 'page',
  },

  // ── Coaching Pages ──────────────────────────────────────────
  {
    path: '/coaching',
    title: 'Coaching Programs',
    description: 'Explore our coaching programs for NATA and JEE Paper 2 entrance exams.',
    keywords: ['coaching', 'programs', 'nata', 'jee'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching',
    title: 'NATA Coaching',
    description: 'Comprehensive NATA 2026 coaching with expert faculty, mock tests, and daily drawing practice.',
    keywords: ['nata coaching', 'nata preparation', 'nata classes', 'nata course'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-center-in-tamil-nadu',
    title: 'NATA Coaching Centers in Tamil Nadu',
    description: 'Find NATA coaching centers across all 38 districts of Tamil Nadu.',
    keywords: ['tamil nadu', 'nata center', 'offline coaching', 'chennai', 'coimbatore'],
    category: 'coaching',
  },
  {
    path: '/coaching/best-nata-coaching-india',
    title: 'Best NATA Coaching in India',
    description: 'Why Neram Classes is rated the best NATA coaching institute in India.',
    keywords: ['best nata coaching', 'top coaching', 'india', 'ranking'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-chennai',
    title: 'NATA Coaching in Chennai',
    description: 'NATA coaching centers in Chennai: Anna Nagar, Adyar, Tambaram, T. Nagar, Velachery.',
    keywords: ['chennai', 'nata coaching chennai', 'anna nagar', 'adyar', 'tambaram'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-chennai/anna-nagar',
    title: 'NATA Coaching: Anna Nagar, Chennai',
    description: 'Neram Classes Anna Nagar branch. Offline NATA coaching in central Chennai.',
    keywords: ['anna nagar', 'chennai', 'offline', 'branch'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-chennai/adyar',
    title: 'NATA Coaching: Adyar, Chennai',
    description: 'Neram Classes Adyar branch. Offline NATA coaching in south Chennai.',
    keywords: ['adyar', 'chennai', 'offline', 'branch', 'south chennai'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-chennai/tambaram',
    title: 'NATA Coaching: Tambaram, Chennai',
    description: 'Neram Classes Tambaram branch. Offline NATA coaching near Tambaram station.',
    keywords: ['tambaram', 'chennai', 'offline', 'branch'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-chennai/velachery',
    title: 'NATA Coaching: Velachery, Chennai',
    description: 'Neram Classes Velachery branch. Offline NATA coaching in south-east Chennai.',
    keywords: ['velachery', 'chennai', 'offline', 'branch'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-chennai/t-nagar',
    title: 'NATA Coaching: T. Nagar, Chennai',
    description: 'Neram Classes T. Nagar branch. Offline NATA coaching in central Chennai.',
    keywords: ['t nagar', 'chennai', 'offline', 'branch', 'central chennai'],
    category: 'coaching',
  },
  {
    path: '/best-nata-coaching-online',
    title: 'Best NATA Coaching Online',
    description: 'Why Neram Classes is the best online NATA coaching with 99.9% success rate.',
    keywords: ['online coaching', 'best nata', 'online classes'],
    category: 'coaching',
  },
  {
    path: '/jee-paper-2-preparation',
    title: 'JEE Paper 2 Preparation',
    description: 'Complete JEE Paper 2 (B.Arch/B.Planning) preparation guide and coaching.',
    keywords: ['jee paper 2', 'b.arch', 'b.planning', 'jee main'],
    category: 'course',
  },

  // ── NATA 2026 Hub ───────────────────────────────────────────
  {
    path: '/nata-2026',
    title: 'NATA 2026: Complete Guide',
    description: 'Everything about NATA 2026: dates, pattern, eligibility, fees, and preparation tips.',
    keywords: ['nata 2026', 'nata exam', 'nata guide'],
    category: 'nata',
  },
  {
    path: '/nata-2026/exam-pattern',
    title: 'NATA 2026 Exam Pattern',
    description: 'NATA 2026 exam pattern: Part A (Drawing 80 marks) + Part B (MCQ 120 marks), 3 hours.',
    keywords: ['exam pattern', 'paper pattern', 'marks', 'sections', 'questions'],
    category: 'nata',
  },
  {
    path: '/nata-2026/syllabus',
    title: 'NATA 2026 Syllabus',
    description: 'Complete NATA 2026 syllabus: Mathematics, General Aptitude, and Drawing.',
    keywords: ['syllabus', 'topics', 'subjects', 'curriculum'],
    category: 'nata',
  },
  {
    path: '/nata-2026/eligibility',
    title: 'NATA 2026 Eligibility',
    description: 'NATA eligibility criteria: qualifications, age limit, and subject requirements.',
    keywords: ['eligibility', 'qualifications', 'criteria', 'age limit', 'who can apply'],
    category: 'nata',
  },
  {
    path: '/nata-2026/important-dates',
    title: 'NATA 2026 Important Dates',
    description: 'NATA 2026 key dates: registration, exam dates, results, counseling schedule.',
    keywords: ['dates', 'schedule', 'when', 'registration', 'exam date', 'result date'],
    category: 'nata',
  },
  {
    path: '/nata-2026/fee-structure',
    title: 'NATA 2026 Exam Fee',
    description: 'NATA 2026 exam fee: General ₹1,750, SC/ST ₹1,250, Transgender ₹1,000.',
    keywords: ['nata fee', 'exam fee', 'registration fee', 'application fee'],
    category: 'nata',
  },
  {
    path: '/nata-2026/how-to-apply',
    title: 'How to Apply for NATA 2026',
    description: 'Step-by-step guide to apply for NATA 2026 at nata.in.',
    keywords: ['how to apply', 'registration', 'application process', 'nata.in'],
    category: 'nata',
  },
  {
    path: '/nata-2026/admit-card',
    title: 'NATA 2026 Admit Card',
    description: 'Download NATA 2026 admit card: hall ticket, exam day instructions.',
    keywords: ['admit card', 'hall ticket', 'download', 'exam day'],
    category: 'nata',
  },
  {
    path: '/nata-2026/exam-centers',
    title: 'NATA 2026 Exam Centers',
    description: 'Find NATA exam centers across India and Dubai: 80+ cities.',
    keywords: ['exam centers', 'test centers', 'cities', 'venue'],
    category: 'nata',
  },
  {
    path: '/nata-2026/drawing-test',
    title: 'NATA Drawing Test',
    description: 'NATA drawing test guide: composition, sketching, 3D composition tips.',
    keywords: ['drawing', 'sketching', 'art', 'composition', '3d'],
    category: 'nata',
  },
  {
    path: '/nata-2026/scoring-and-results',
    title: 'NATA 2026 Scoring & Results',
    description: 'NATA scoring system, percentile calculation, and result dates.',
    keywords: ['scoring', 'results', 'percentile', 'marks', 'cutoff'],
    category: 'nata',
  },
  {
    path: '/nata-2026/preparation-tips',
    title: 'NATA Preparation Tips',
    description: 'Expert tips to crack NATA 2026: study plan, drawing practice, time management.',
    keywords: ['tips', 'preparation', 'study plan', 'strategy', 'how to crack'],
    category: 'nata',
  },
  {
    path: '/nata-2026/best-books',
    title: 'Best Books for NATA 2026',
    description: 'Recommended books for NATA preparation: Mathematics, Aptitude, and Drawing.',
    keywords: ['books', 'recommended', 'study material', 'reference'],
    category: 'nata',
  },
  {
    path: '/nata-2026/previous-year-papers',
    title: 'NATA Previous Year Papers',
    description: 'Download NATA previous year question papers with solutions.',
    keywords: ['previous year', 'question papers', 'past papers', 'solutions'],
    category: 'nata',
  },
  {
    path: '/nata-2026/cutoff-calculator',
    title: 'NATA Cutoff Calculator',
    description: 'Calculate college cutoffs based on your NATA score.',
    keywords: ['cutoff', 'calculator', 'score', 'prediction'],
    category: 'nata',
  },
  {
    path: '/nata-2026/dos-and-donts',
    title: 'NATA Exam Day Do\'s & Don\'ts',
    description: 'What to bring, what to avoid, and exam day tips for NATA 2026.',
    keywords: ['dos and donts', 'exam day', 'what to bring', 'tips'],
    category: 'nata',
  },
  {
    path: '/nata-2026/photo-signature-requirements',
    title: 'NATA Photo & Signature Requirements',
    description: 'Photo and signature specifications for NATA 2026 application.',
    keywords: ['photo', 'signature', 'requirements', 'specifications', 'upload'],
    category: 'nata',
  },

  // ── Study Resources ─────────────────────────────────────────
  {
    path: '/nata-syllabus',
    title: 'NATA Syllabus Guide',
    description: 'Detailed NATA syllabus breakdown with topic-wise weightage.',
    keywords: ['syllabus', 'topics', 'weightage'],
    category: 'nata',
  },
  {
    path: '/nata-preparation-guide',
    title: 'NATA Preparation Guide',
    description: 'Complete step-by-step NATA preparation guide for beginners.',
    keywords: ['preparation guide', 'study plan', 'beginner', 'how to start'],
    category: 'nata',
  },
  {
    path: '/nata-important-questions',
    title: 'NATA Important Questions',
    description: 'Most frequently asked NATA questions with answers and solutions.',
    keywords: ['important questions', 'frequently asked', 'practice'],
    category: 'nata',
  },
  {
    path: '/how-to-score-150-in-nata',
    title: 'How to Score 150+ in NATA',
    description: 'Strategy guide to score 150+ marks in NATA: study plan, tips, and practice.',
    keywords: ['score 150', 'high score', 'strategy', 'marks'],
    category: 'nata',
  },
  {
    path: '/previous-year-papers',
    title: 'Previous Year Papers',
    description: 'Download NATA and JEE Paper 2 previous year question papers.',
    keywords: ['previous year', 'papers', 'download', 'questions'],
    category: 'nata',
  },
  {
    path: '/best-books-nata-jee',
    title: 'Best Books for NATA & JEE',
    description: 'Top recommended books for NATA and JEE Paper 2 preparation.',
    keywords: ['books', 'nata books', 'jee books', 'recommended'],
    category: 'nata',
  },

  // ── Free Tools ──────────────────────────────────────────────
  {
    path: '/tools/question-bank',
    title: 'Free Question Bank',
    description: 'Practice 1000+ NATA questions: MCQ, aptitude, and drawing practice.',
    keywords: ['question bank', 'practice', 'mcq', 'questions', 'free'],
    category: 'tool',
  },
  {
    path: '/tools/cutoff-calculator',
    title: 'Cutoff Calculator',
    description: 'Calculate NATA cutoff scores for architecture colleges across India.',
    keywords: ['cutoff', 'calculator', 'college', 'score'],
    category: 'tool',
  },
  {
    path: '/tools/college-predictor',
    title: 'College Predictor',
    description: 'Predict which architecture colleges you can get based on your NATA score.',
    keywords: ['college predictor', 'predict', 'chances', 'admission'],
    category: 'tool',
  },
  {
    path: '/tools/exam-centers',
    title: 'Exam Centers Finder',
    description: 'Find NATA exam centers near you across 80+ cities in India.',
    keywords: ['exam centers', 'find', 'near me', 'location'],
    category: 'tool',
  },
  {
    path: '/nata-app',
    title: 'Neram App',
    description: 'Download the Neram app: AI-powered NATA preparation on your phone.',
    keywords: ['app', 'download', 'mobile', 'android', 'ios'],
    category: 'tool',
  },

  // ── Tools App Pages (link to marketing landing pages) ───────
  {
    path: '/tools/college-predictor',
    title: 'College Predictor Tool',
    description: 'Enter your NATA score and get a list of colleges you can apply to.',
    keywords: ['college predictor', 'nata score', 'which college', 'admission chances'],
    category: 'tool',
  },
  {
    path: '/counseling',
    title: 'Counseling Services',
    description: 'Expert guidance for architecture college admissions and NATA preparation strategy.',
    keywords: ['counseling', 'guidance', 'admission', 'career'],
    category: 'counseling',
  },
  {
    path: '/counseling/tnea-barch',
    title: 'TNEA B.Arch Counseling',
    description: 'Complete guide to TNEA B.Arch counseling process, cutoffs, and college selection.',
    keywords: ['tnea', 'b.arch', 'counseling', 'tamil nadu', 'anna university'],
    category: 'counseling',
  },

  // ── College Category Pages ──────────────────────────────────
  {
    path: '/colleges',
    title: 'Browse All Architecture Colleges',
    description: 'Explore 500+ architecture colleges across India. Filter by state, fees, ranking.',
    keywords: ['colleges', 'architecture colleges', 'browse', 'all colleges', 'india'],
    category: 'college',
  },
  {
    path: '/colleges/compare',
    title: 'Compare Architecture Colleges',
    description: 'Compare colleges side-by-side: fees, rankings, placements, facilities.',
    keywords: ['compare', 'comparison', 'vs', 'side by side'],
    category: 'college',
  },
  {
    path: '/colleges/rankings/nirf',
    title: 'NIRF Architecture Rankings',
    description: 'NIRF ranking of architecture colleges in India. Government and private.',
    keywords: ['nirf', 'ranking', 'top colleges', 'best colleges'],
    category: 'college',
  },
  {
    path: '/colleges/rankings/archindex',
    title: 'ArchIndex College Rankings',
    description: 'ArchIndex score-based ranking of architecture colleges. Data-driven comparison.',
    keywords: ['archindex', 'ranking', 'score', 'architecture'],
    category: 'college',
  },
  {
    path: '/colleges/tnea',
    title: 'TNEA Architecture Colleges',
    description: 'Architecture colleges accepting TNEA counseling for B.Arch admissions in Tamil Nadu.',
    keywords: ['tnea', 'tamil nadu', 'b.arch', 'counseling', 'anna university'],
    category: 'college',
  },
  {
    path: '/colleges/josaa',
    title: 'JoSAA Architecture Colleges',
    description: 'Architecture colleges accepting JoSAA counseling for B.Arch admissions (IITs, NITs, SPAs).',
    keywords: ['josaa', 'iit', 'nit', 'spa', 'central counseling'],
    category: 'college',
  },
  {
    path: '/nata-hub',
    title: 'NATA Hub: Colleges Accepting NATA',
    description: 'All architecture colleges accepting NATA scores for B.Arch admissions.',
    keywords: ['nata hub', 'nata colleges', 'nata accepting', 'b.arch'],
    category: 'college',
  },
  {
    path: '/jee-barch-hub',
    title: 'JEE B.Arch Hub',
    description: 'Architecture colleges accepting JEE Paper 2 scores for B.Arch admissions.',
    keywords: ['jee barch', 'jee paper 2', 'jee colleges', 'b.arch'],
    category: 'college',
  },
  {
    path: '/colleges/fees/below-1-lakh',
    title: 'Colleges Below ₹1 Lakh/Year',
    description: 'Affordable architecture colleges with annual fees under ₹1 lakh.',
    keywords: ['cheap', 'affordable', 'below 1 lakh', 'low fees', 'budget'],
    category: 'college',
  },
  {
    path: '/colleges/fees/below-2-lakhs',
    title: 'Colleges Below ₹2 Lakhs/Year',
    description: 'Architecture colleges with annual fees under ₹2 lakhs.',
    keywords: ['below 2 lakhs', 'moderate fees'],
    category: 'college',
  },
  {
    path: '/colleges/fees/below-5-lakhs',
    title: 'Colleges Below ₹5 Lakhs/Year',
    description: 'Architecture colleges with annual fees under ₹5 lakhs.',
    keywords: ['below 5 lakhs', 'mid range fees'],
    category: 'college',
  },

  // ── Legal ───────────────────────────────────────────────────
  {
    path: '/terms',
    title: 'Terms & Conditions',
    description: 'Terms and conditions for using Neram Classes services.',
    keywords: ['terms', 'conditions', 'legal', 'agreement'],
    category: 'legal',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy',
    description: 'How we collect, use, and protect your personal information.',
    keywords: ['privacy', 'data', 'policy', 'personal information'],
    category: 'legal',
  },
  {
    path: '/refund-policy',
    title: 'Refund Policy',
    description: 'Refund policy: 24-hour window, 30% processing fee. Full details.',
    keywords: ['refund', 'cancellation', 'money back', 'return'],
    category: 'legal',
  },
];

// ─── Merged Index ───────────────────────────────────────────────

export const SEARCH_INDEX: SearchEntry[] = [
  ...STATIC_INDEX,
  ...GENERATED_COLLEGE_INDEX,
];

// ─── Fuse.js Search ─────────────────────────────────────────────

const fuse = new Fuse(SEARCH_INDEX, {
  keys: [
    { name: 'title', weight: 0.4 },
    { name: 'keywords', weight: 0.35 },
    { name: 'description', weight: 0.25 },
  ],
  threshold: 0.3,
  distance: 100,
  minMatchCharLength: 2,
  includeScore: true,
  shouldSort: true,
});

export interface GroupedResults {
  category: SearchCategory;
  results: SearchEntry[];
  totalCount: number;
}

export function searchPages(query: string): GroupedResults[] {
  if (!query.trim()) return [];

  const fuseResults = fuse.search(query.trim(), { limit: 50 });

  // Group results by category
  const grouped = new Map<SearchCategory, SearchEntry[]>();
  for (const result of fuseResults) {
    const cat = result.item.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(result.item);
  }

  // Build ordered result groups
  const output: GroupedResults[] = [];
  for (const cat of CATEGORY_ORDER) {
    const items = grouped.get(cat);
    if (!items || items.length === 0) continue;
    output.push({
      category: cat,
      results: items.slice(0, CATEGORY_CONFIG[cat].maxResults),
      totalCount: items.length,
    });
  }

  return output;
}

// ─── Quick Links (shown on empty query) ─────────────────────────

export const QUICK_LINKS: SearchEntry[] = [
  STATIC_INDEX.find((e) => e.path === '/apply')!,
  STATIC_INDEX.find((e) => e.path === '/courses')!,
  STATIC_INDEX.find((e) => e.path === '/colleges')!,
  STATIC_INDEX.find((e) => e.path === '/tools/cutoff-calculator')!,
].filter(Boolean);
```

- [ ] **Step 2: Create a placeholder generated-search-index.ts for local dev**

The generated file won't exist until the build script runs. Create a placeholder for local development at `apps/marketing/src/lib/generated-search-index.ts`:

```typescript
// AUTO-GENERATED - DO NOT EDIT
// Placeholder for local development. Run `npx tsx ../../scripts/generate-search-index.ts` to populate.
import type { SearchEntry } from './search-index';
export const GENERATED_COLLEGE_INDEX: SearchEntry[] = [];
```

Then run the real generator to populate it:
```bash
npx tsx scripts/generate-search-index.ts
```

- [ ] **Step 3: Verify the module compiles**

Run:
```bash
cd apps/marketing && pnpm type-check
```

Expected: No type errors related to search-index.ts.

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/lib/search-index.ts
git commit -m "feat(marketing): expand search index with fuse.js, colleges, coaching, counseling entries"
```

---

### Task 4: Redesign Search Dialog Component

**Files:**
- Rewrite: `apps/marketing/src/components/SearchDialog.tsx`

This is the biggest task. The dialog gets: grouped results by category, recent searches, quick links, overflow handling, and analytics event firing.

- [ ] **Step 1: Rewrite SearchDialog.tsx**

Replace the entire contents of `apps/marketing/src/components/SearchDialog.tsx` with:

```typescript
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Dialog,
  Box,
  Typography,
  TextField,
  IconButton,
  Chip,
  useMediaQuery,
  useTheme,
  InputAdornment,
  Divider,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HistoryIcon from '@mui/icons-material/History';
import {
  searchPages,
  getCategoryColor,
  CATEGORY_CONFIG,
  QUICK_LINKS,
  type SearchEntry,
  type SearchCategory,
  type GroupedResults,
} from '@/lib/search-index';
import { useRouter } from 'next/navigation';

// ─── Recent Searches (localStorage) ─────────────────────────────

const RECENT_KEY = 'neram_recent_searches';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === 'undefined' || !query.trim()) return;
  try {
    const recent = getRecentSearches().filter((q) => q !== query.trim());
    recent.unshift(query.trim());
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch {
    // localStorage full or unavailable
  }
}

function clearRecentSearches() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // ignore
  }
}

// ─── Analytics ──────────────────────────────────────────────────

const SESSION_KEY = 'neram_search_session';

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return '';
  }
}

function trackSearchEvent(data: {
  event_type: 'query' | 'click' | 'no_results';
  query: string;
  result_path?: string;
  result_position?: number;
  result_count?: number;
}) {
  try {
    const payload = JSON.stringify({ ...data, session_id: getSessionId() });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/search', payload);
    }
  } catch {
    // analytics should never break search
  }
}

// ─── Component ──────────────────────────────────────────────────

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SearchDialog({ open, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [groupedResults, setGroupedResults] = useState<GroupedResults[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flatten grouped results into a navigable list for keyboard nav
  const flatResults = useMemo(() => {
    const items: { entry: SearchEntry; category: SearchCategory }[] = [];
    for (const group of groupedResults) {
      for (const entry of group.results) {
        items.push({ entry, category: group.category });
      }
    }
    return items;
  }, [groupedResults]);

  const totalResultCount = useMemo(
    () => groupedResults.reduce((sum, g) => sum + g.totalCount, 0),
    [groupedResults]
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setGroupedResults([]);
      setSelectedIndex(0);
      setRecentSearches(getRecentSearches());
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    const results = searchPages(query);
    setGroupedResults(results);
    setSelectedIndex(0);

    // Debounced analytics
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim()) {
      debounceRef.current = setTimeout(() => {
        const total = results.reduce((sum, g) => sum + g.totalCount, 0);
        if (total === 0) {
          trackSearchEvent({ event_type: 'no_results', query: query.trim(), result_count: 0 });
        } else {
          trackSearchEvent({ event_type: 'query', query: query.trim(), result_count: total });
        }
      }, 500);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const navigateTo = useCallback(
    (path: string, position?: number) => {
      if (query.trim()) {
        saveRecentSearch(query.trim());
        trackSearchEvent({
          event_type: 'click',
          query: query.trim(),
          result_path: path,
          result_position: position,
          result_count: totalResultCount,
        });
      }
      onClose();
      router.push(path);
    },
    [onClose, router, query, totalResultCount]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && flatResults[selectedIndex]) {
        e.preventDefault();
        navigateTo(flatResults[selectedIndex].entry.path, selectedIndex);
      }
    },
    [flatResults, selectedIndex, navigateTo]
  );

  const handleRecentClick = (q: string) => {
    setQuery(q);
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecentSearches([]);
  };

  // Track flat index position for keyboard highlighting
  let flatIndex = 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          ...(isMobile
            ? { m: 0, borderRadius: 0 }
            : { mt: '10vh', borderRadius: 3, maxHeight: '70vh' }),
          display: 'flex',
          flexDirection: 'column',
          alignSelf: 'flex-start',
        },
      }}
    >
      {/* Search Input */}
      <Box sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          placeholder="Search colleges, courses, tools..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {isMobile ? (
                  <IconButton size="small" onClick={onClose} sx={{ mr: -0.5 }}>
                    <ArrowBackIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                  </IconButton>
                ) : (
                  <SearchIcon sx={{ color: 'text.secondary' }} />
                )}
              </InputAdornment>
            ),
            endAdornment: query ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setQuery('')}>
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ) : null,
            sx: {
              borderRadius: 2,
              fontSize: '1rem',
              '& input': { py: 1.5 },
            },
          }}
          inputProps={{ style: { fontSize: '1rem' } }}
        />
        {!isMobile && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            <kbd style={{ padding: '1px 4px', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.7rem' }}>Esc</kbd>
            {' close '}
            <kbd style={{ padding: '1px 4px', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.7rem' }}>&uarr;&darr;</kbd>
            {' navigate '}
            <kbd style={{ padding: '1px 4px', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.7rem' }}>Enter</kbd>
            {' select'}
          </Typography>
        )}
      </Box>

      {/* Results Area */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 2 }}>
        {/* Empty State: Recent Searches + Quick Links */}
        {query.trim() === '' && (
          <>
            {recentSearches.length > 0 && (
              <Box sx={{ px: 1, pt: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Recent
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                    onClick={handleClearRecent}
                  >
                    Clear
                  </Typography>
                </Box>
                {recentSearches.map((q) => (
                  <Box
                    key={q}
                    onClick={() => handleRecentClick(q)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 2,
                      py: 1,
                      mx: 1,
                      borderRadius: 2,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                      minHeight: 40,
                    }}
                  >
                    <HistoryIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                    <Typography variant="body2">{q}</Typography>
                  </Box>
                ))}
                <Divider sx={{ my: 1 }} />
              </Box>
            )}

            <Box sx={{ px: 1, pt: recentSearches.length > 0 ? 0 : 1 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ px: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Quick Links
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, mt: 0.5 }}>
                {QUICK_LINKS.map((entry) => (
                  <Box
                    key={entry.path}
                    onClick={() => navigateTo(entry.path)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 2,
                      py: 1.5,
                      mx: 0.5,
                      borderRadius: 2,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: 'divider',
                      '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' },
                      minHeight: 48,
                    }}
                  >
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {entry.title}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </>
        )}

        {/* No Results */}
        {query.trim() !== '' && groupedResults.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <SearchIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No results for &ldquo;{query}&rdquo;
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Try a different search term
            </Typography>
            <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['NATA 2026', 'Colleges', 'Fees', 'Apply'].map((suggestion) => (
                <Chip
                  key={suggestion}
                  label={suggestion}
                  size="small"
                  variant="outlined"
                  onClick={() => setQuery(suggestion)}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              Need help? Call +91 91761 37043
            </Typography>
          </Box>
        )}

        {/* Grouped Results */}
        {groupedResults.map((group) => {
          const config = CATEGORY_CONFIG[group.category];
          const startIdx = flatIndex;

          return (
            <Box key={group.category} sx={{ mb: 1 }}>
              {/* Category Header */}
              <Typography
                variant="caption"
                fontWeight={600}
                color="text.secondary"
                sx={{ px: 2, py: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {config.label}
              </Typography>

              {/* Results */}
              {group.results.map((result, i) => {
                const currentFlatIdx = startIdx + i;
                const isSelected = currentFlatIdx === selectedIndex;
                // Advance flatIndex tracker after last item
                if (i === group.results.length - 1) {
                  flatIndex = startIdx + group.results.length;
                }
                return (
                  <Box
                    key={result.path}
                    onClick={() => navigateTo(result.path, currentFlatIdx)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 2,
                      py: isMobile ? 1.5 : 1,
                      mx: 1,
                      borderRadius: 2,
                      cursor: 'pointer',
                      bgcolor: isSelected ? 'action.hover' : 'transparent',
                      '&:hover': { bgcolor: 'action.hover' },
                      transition: 'background-color 0.15s',
                      minHeight: isMobile ? 64 : 48,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {result.title}
                        </Typography>
                        <Chip
                          label={config.label}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            bgcolor: `${config.color}15`,
                            color: config.color,
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        />
                      </Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {result.description}
                      </Typography>
                    </Box>
                    <ArrowForwardIcon
                      sx={{
                        fontSize: 16,
                        color: 'text.disabled',
                        flexShrink: 0,
                        opacity: isSelected ? 1 : 0,
                        transition: 'opacity 0.15s',
                      }}
                    />
                  </Box>
                );
              })}

              {/* Overflow: "+ N more" */}
              {group.totalCount > config.maxResults && (
                <Box
                  onClick={() => {
                    const overflowPath = group.category === 'college' ? `/colleges?q=${encodeURIComponent(query)}` : `/${group.category}`;
                    navigateTo(overflowPath);
                  }}
                  sx={{
                    px: 3,
                    py: 0.75,
                    mx: 1,
                    cursor: 'pointer',
                    '&:hover': { color: 'primary.main' },
                  }}
                >
                  <Typography variant="caption" color="primary">
                    + {group.totalCount - config.maxResults} more &rarr; Browse all
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })}

        {/* Footer result count */}
        {query.trim() !== '' && groupedResults.length > 0 && !isMobile && (
          <Typography variant="caption" color="text.disabled" sx={{ px: 2, pt: 1, display: 'block' }}>
            {totalResultCount} result{totalResultCount !== 1 ? 's' : ''}
          </Typography>
        )}
      </Box>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify the component compiles**

Run:
```bash
cd apps/marketing && pnpm type-check
```

Expected: No type errors.

- [ ] **Step 3: Test locally**

Run:
```bash
cd apps/marketing && pnpm dev
```

Open `http://localhost:3010`, press Ctrl+K, and verify:
1. Empty state shows recent searches (if any) and quick links
2. Typing "chennai" shows grouped results with colleges, pages, coaching
3. Typing "nata" shows results across NATA, courses, tools categories
4. Keyboard navigation (arrow keys + enter) works
5. Mobile view (resize to 375px) shows full-screen dialog with larger tap targets

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/components/SearchDialog.tsx
git commit -m "feat(marketing): redesign search dialog with grouped results, recent searches, quick links"
```

---

### Task 5: Update Header Search Trigger

**Files:**
- Modify: `apps/marketing/src/components/Header.tsx` (lines 448-465)

Replace the small icon button with a prominent search button showing icon + text + keyboard shortcut.

- [ ] **Step 1: Replace the desktop search trigger**

In `apps/marketing/src/components/Header.tsx`, find the desktop search section (around lines 448-465):

```typescript
            {/* ── Desktop Search ── */}
            <Tooltip title="Search (Ctrl+K)" arrow>
              <IconButton
                color="inherit"
                size="small"
                onClick={() => setSearchOpen(true)}
                sx={{
                  display: { xs: 'none', md: 'flex' },
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  opacity: 0.75,
                  '&:hover': { opacity: 1, bgcolor: 'action.hover' },
                }}
              >
                <SearchIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
```

Replace it with:

```typescript
            {/* ── Desktop Search Trigger ── */}
            <Box
              onClick={() => setSearchOpen(true)}
              sx={{
                display: { xs: 'none', md: 'flex' },
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                height: 36,
                minWidth: 200,
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.08)',
                  borderColor: 'rgba(255,255,255,0.4)',
                },
              }}
            >
              <SearchIcon sx={{ fontSize: 18, opacity: 0.7 }} />
              <Typography
                variant="body2"
                sx={{ opacity: 0.6, fontSize: '0.85rem', flex: 1, userSelect: 'none' }}
              >
                Search
              </Typography>
              <Box
                component="kbd"
                sx={{
                  fontSize: '0.7rem',
                  opacity: 0.4,
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '4px',
                  px: 0.75,
                  py: 0.25,
                  fontFamily: 'monospace',
                  lineHeight: 1,
                }}
              >
                Ctrl+K
              </Box>
            </Box>
```

- [ ] **Step 2: Enlarge mobile search icon**

In the mobile drawer section (around line 738-747), the search is already a ListItemButton, which is fine. But also find the mobile header area and ensure the search icon in the top bar (if present as a standalone icon) is 40x40px. Looking at the Header, the mobile search is only in the drawer, so no change needed there.

However, we should add a search icon button in the mobile top bar (before the hamburger menu) for quick access. Find the mobile spacer/hamburger area and add a search icon before the hamburger:

Find this line around line 468:
```typescript
            {/* Spacer for mobile */}
            <Box sx={{ flexGrow: 1, display: { xs: 'block', md: 'none' } }} />
```

Add after it (before the My Enrollment section):
```typescript
            {/* Mobile Search Icon */}
            <IconButton
              color="inherit"
              onClick={() => setSearchOpen(true)}
              sx={{
                display: { xs: 'flex', md: 'none' },
                width: 40,
                height: 40,
                mr: 0.5,
              }}
            >
              <SearchIcon sx={{ fontSize: 22 }} />
            </IconButton>
```

- [ ] **Step 3: Verify desktop and mobile**

Run:
```bash
cd apps/marketing && pnpm dev
```

Check:
1. Desktop: Search button shows "Search" text + "Ctrl+K" badge between nav links and Apply Now
2. Desktop: Hovering the search button shows border brightening
3. Mobile (375px): Search icon visible in top bar, 40x40px, before hamburger

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/components/Header.tsx
git commit -m "feat(marketing): redesign search trigger with prominent button on desktop, icon on mobile"
```

---

### Task 6: Search Analytics (Supabase Table + API Route)

**Files:**
- Create: `supabase/migrations/XXXX_search_analytics.sql`
- Create: `apps/marketing/src/app/api/analytics/search/route.ts`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260417_search_analytics.sql`:

```sql
-- Search Analytics Table
-- Tracks search queries, clicks, and zero-result queries for improving search quality

CREATE TABLE IF NOT EXISTS search_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('query', 'click', 'no_results')),
  query TEXT NOT NULL,
  result_path TEXT,
  result_position INTEGER,
  result_count INTEGER,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_search_analytics_created ON search_analytics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_event ON search_analytics (event_type);
CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics (query);

-- RLS: allow anonymous inserts (search analytics from unauthenticated marketing visitors)
ALTER TABLE search_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts" ON search_analytics
  FOR INSERT WITH CHECK (true);

-- No select/update/delete for anonymous users (admin-only reads)
CREATE POLICY "Admin reads analytics" ON search_analytics
  FOR SELECT USING (auth.role() = 'service_role');
```

- [ ] **Step 2: Apply migration to staging**

Use MCP tool:
```
mcp__supabase-staging__apply_migration with name "search_analytics" and the SQL above
```

- [ ] **Step 3: Apply migration to production**

Use MCP tool:
```
mcp__supabase-prod__apply_migration with name "search_analytics" and the SQL above
```

- [ ] **Step 4: Create the API route**

Create `apps/marketing/src/app/api/analytics/search/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

const VALID_EVENTS = ['query', 'click', 'no_results'] as const;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { event_type, query, result_path, result_position, result_count, session_id } = body;

    if (!event_type || !VALID_EVENTS.includes(event_type)) {
      return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 });
    }

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    await supabase.from('search_analytics').insert({
      event_type,
      query: query.slice(0, 200),
      result_path: result_path?.slice(0, 500) || null,
      result_position: typeof result_position === 'number' ? result_position : null,
      result_count: typeof result_count === 'number' ? result_count : null,
      session_id: session_id?.slice(0, 100) || null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Don't expose errors for analytics
  }
}
```

- [ ] **Step 5: Verify the API route works**

Run the dev server and test with curl:
```bash
curl -X POST http://localhost:3010/api/analytics/search \
  -H "Content-Type: application/json" \
  -d '{"event_type":"query","query":"test","result_count":5,"session_id":"test-123"}'
```

Expected: `{"ok":true}` response.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260417_search_analytics.sql apps/marketing/src/app/api/analytics/search/route.ts
git commit -m "feat(marketing): add search analytics table and API route"
```

---

### Task 7: End-to-End Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full marketing build**

```bash
cd apps/marketing && pnpm build
```

Expected: 
1. Console output `[generate-search-index] Fetched N colleges from Supabase`
2. `next build` succeeds with no errors
3. Generated search index file is populated

- [ ] **Step 2: Run type check across monorepo**

```bash
pnpm type-check
```

Expected: No errors.

- [ ] **Step 3: Run lint**

```bash
cd apps/marketing && pnpm lint
```

Expected: No errors (or only pre-existing warnings).

- [ ] **Step 4: Manual test on dev server**

Run `cd apps/marketing && pnpm dev` and verify:

1. **Search trigger**: Desktop shows "Search Ctrl+K" button. Mobile shows search icon.
2. **Empty state**: Open search, see recent searches + quick links.
3. **College search**: Type "chennai", see grouped college results with "Colleges" header.
4. **Fuzzy matching**: Type "chenai" (typo), still see Chennai colleges.
5. **NATA search**: Type "nata", see results across NATA, Courses, Tools categories.
6. **Tools search**: Type "cutoff", see Cutoff Calculator in Free Tools group.
7. **Coaching search**: Type "anna nagar", see coaching branch result.
8. **Overflow**: Type a broad term (e.g. "architecture"), see "+ N more" for colleges.
9. **Recent searches**: Search something, close dialog, reopen, see it in recent.
10. **No results**: Type "xyzabc", see no-results state with suggestions.
11. **Keyboard nav**: Arrow keys move selection highlight, Enter navigates.
12. **Mobile (375px)**: Full-screen dialog, back arrow to close, large tap targets.

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(marketing): polish universal search after verification"
```
