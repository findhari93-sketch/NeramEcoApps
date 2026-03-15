# Neram Classes — SEO Fix Implementation Guide for Claude Code

> **Purpose**: This document is a complete, actionable implementation spec for fixing all SEO issues found across `neramclasses.com` and `app.neramclasses.com`. It is designed to be fed directly into Claude Code CLI as a task reference.
>
> **Monorepo**: Turborepo with 4 Next.js apps — `neramclasses.com`, `app.neramclasses.com`, `nexus.neramclasses.com`, `admin.neramclasses.com`
>
> **Stack**: Next.js (App Router or Pages Router — verify), React, Vercel deployment, Cloudflare CDN, Supabase backend
>
> **Priority**: Issues are tagged P0 (do today), P1 (this week), P2 (this sprint), P3 (this month)

---

## TABLE OF CONTENTS

1. [Discovery: Page Inventory](#1-page-inventory)
2. [P0: XML Sitemap Generation](#2-p0-xml-sitemap-generation)
3. [P0: robots.txt for Both Domains](#3-p0-robotstxt-for-both-domains)
4. [P0: www → non-www Redirect (Cloudflare)](#4-p0-www-to-non-www-redirect)
5. [P0: Consolidate /en/ Duplicate URLs](#5-p0-consolidate-en-duplicate-urls)
6. [P0: Fix Duplicate Brand Name in Title Tags](#6-p0-fix-duplicate-brand-name-in-title-tags)
7. [P0: Enable SSR on app.neramclasses.com Public Pages](#7-p0-enable-ssr-on-appneramclassescom)
8. [P1: Homepage H1 Rewrite](#8-p1-homepage-h1-rewrite)
9. [P1: JSON-LD Structured Data](#9-p1-json-ld-structured-data)
10. [P1: Canonical Tags on Every Page](#10-p1-canonical-tags)
11. [P1: Open Graph & Twitter Card Tags](#11-p1-open-graph-and-twitter-card-tags)
12. [P1: Fix Year Mismatches (2025 → 2026)](#12-p1-fix-year-mismatches)
13. [P1: 301 Redirects for Dead/Ugly URLs](#13-p1-301-redirects)
14. [P2: Fix Heading Hierarchy Site-Wide](#14-p2-fix-heading-hierarchy)
15. [P2: Meta Description Length Audit](#15-p2-meta-description-length)
16. [P2: FAQ Schema on City Coaching Pages](#16-p2-faq-schema)
17. [P2: Image Alt Text Audit](#17-p2-image-alt-text-audit)
18. [P3: Internal Linking Consistency](#18-p3-internal-linking-consistency)
19. [P3: Cloudflare Bot Protection Audit](#19-p3-cloudflare-bot-protection)
20. [P3: neram.co.in Admin Panel Indexing Block](#20-p3-neramcoin-admin-panel)
21. [Verification Checklist](#21-verification-checklist)
22. [Google Search Console Submission Steps](#22-gsc-submission)

---

## 1. PAGE INVENTORY

### neramclasses.com — All discovered public pages

**Navigation pages:**
```
/                           → Homepage
/about                      → About Us
/courses                    → Course listing
/courses/architecture-entrance-year-long
/courses/architecture-entrance-crash-course
/courses/revit-training
/testimonials               → Student reviews
/nata-2026                  → NATA 2026 hub (NEW)
/counseling                 → Counseling page
/fees                       → Fee structure
/contact                    → Contact page
/careers                    → Careers
/apply                      → Application form
/scholarship                → Scholarship info
/demo-class                 → Free demo booking
/privacy                    → Privacy policy
/terms                      → Terms & conditions
/refund-policy              → Refund policy
```

**Content/SEO pages:**
```
/nata-syllabus              → NATA Syllabus 2026
/nata-preparation-guide     → NATA Prep Guide
/how-to-score-150-in-nata   → Score 150+ guide
/nata-important-questions   → Important questions
/best-books-nata-jee        → Best books
/previous-year-papers       → Previous year papers
/nata-cutoff-calculator     → Cutoff Calculator (on main site)
/nata-app                   → App landing page
/best-nata-coaching-online  → Online coaching page
/jee-paper-2-preparation    → JEE Paper 2 guide
/inner-page                 → ZOMBIE — returns 404, still indexed
/NATA_Coaching_center_near_me_address → UGLY URL, still indexed
```

**Blog posts:**
```
/blog                       → Blog index
/blog/best-nata-coaching-trichy-online
/blog/best-nata-coaching-madurai-online
/blog/best-nata-coaching-coimbatore-online
(discover more via: find /path/to/blog -name "*.tsx" or check CMS)
```

**City coaching pages (~155+ pages):**
```
/coaching/bengaluru-rural
/coaching/nata-coaching/nata-coaching-centers-in-pune
/coaching/nata-coaching/nata-coaching-centers-in-hyderabad
/coaching/nata-coaching/nata-coaching-centers-in-mumbai
/coaching/nata-coaching/nata-coaching-centers-in-delhi
/contact/nata-coaching-center-in-chennai
/contact/nata-coaching-center-in-bangalore
/contact/nata-coaching-center-in-coimbatore
/contact/nata-coaching-center-in-madurai
/contact/nata-coaching-center-in-trichy
/contact/nata-coaching-center-in-tiruppur
/contact/nata-coaching-center-in-pudukkottai
/contact/nata-coaching-center-in-kanchipuram
(... ~145 more cities — get full list from the data source/CMS)
```

> **NOTE**: City pages use TWO different URL patterns:
> - `/coaching/{city-slug}` (e.g., `/coaching/bengaluru-rural`)
> - `/coaching/nata-coaching/nata-coaching-centers-in-{city}` (e.g., Pune, Hyderabad)
> - `/contact/nata-coaching-center-in-{city}` (e.g., Chennai, Bangalore)
>
> This inconsistency should be normalized in a future sprint. For now, include ALL patterns in the sitemap.

### app.neramclasses.com — All public tool pages

```
/                           → App homepage / login
/tools                      → Tools landing page (PUBLIC)
/tools/cutoff-calculator    → Redirects to /tools/nata/cutoff-calculator
/tools/nata/cutoff-calculator   → NATA Cutoff Calculator (PUBLIC)
/tools/college-predictor    → Redirects to /tools/nata/college-predictor
/tools/nata/college-predictor   → College Predictor (PUBLIC)
/tools/exam-centers         → Exam Center Locator (PUBLIC)
/tools/nata/question-bank   → Question Bank (PUBLIC or requires auth — verify)
/tools/help                 → Help/Support chat (PUBLIC)
```

> **CRITICAL**: The cutoff-calculator page returns only "Loading..." to crawlers — this confirms CSR-only rendering. SSR must be enabled for all `/tools/*` routes.

---

## 2. P0: XML SITEMAP GENERATION

### Task: Install and configure `next-sitemap` for neramclasses.com

**Step 1: Install the package**
```bash
cd apps/neramclasses  # or wherever the main site app lives
npm install next-sitemap
```

**Step 2: Create `next-sitemap.config.js` in the app root**
```js
/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://neramclasses.com',
  generateRobotsTxt: true, // Also generates robots.txt
  sitemapSize: 5000,
  changefreq: 'weekly',
  priority: 0.7,
  exclude: [
    '/api/*',
    '/admin/*',
    '/dashboard/*',
    '/en/*',           // Exclude /en/ duplicates — canonical is without /en/
    '/inner-page',     // Zombie page
    '/NATA_Coaching_center_near_me_address', // Ugly URL
  ],
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/en/', '/_next/'],
      },
    ],
    additionalSitemaps: [
      'https://neramclasses.com/sitemap-0.xml',
    ],
  },
  // Override default priorities for key pages
  transform: async (config, path) => {
    // Homepage
    if (path === '/') {
      return { loc: path, changefreq: 'daily', priority: 1.0, lastmod: new Date().toISOString() };
    }
    // Course pages
    if (path.startsWith('/courses/')) {
      return { loc: path, changefreq: 'weekly', priority: 0.9, lastmod: new Date().toISOString() };
    }
    // Tool/calculator pages
    if (path.includes('cutoff') || path.includes('calculator') || path.includes('predictor')) {
      return { loc: path, changefreq: 'monthly', priority: 0.8, lastmod: new Date().toISOString() };
    }
    // City coaching pages
    if (path.startsWith('/coaching/') || path.startsWith('/contact/nata-coaching-center')) {
      return { loc: path, changefreq: 'monthly', priority: 0.7, lastmod: new Date().toISOString() };
    }
    // Blog posts
    if (path.startsWith('/blog/')) {
      return { loc: path, changefreq: 'monthly', priority: 0.6, lastmod: new Date().toISOString() };
    }
    // Default
    return { loc: path, changefreq: config.changefreq, priority: config.priority, lastmod: new Date().toISOString() };
  },
};
```

**Step 3: Add postbuild script to `package.json`**
```json
{
  "scripts": {
    "build": "next build",
    "postbuild": "next-sitemap"
  }
}
```

**Step 4: Verify after build**
```bash
npm run build
# Check output:
cat public/sitemap-0.xml | head -50
cat public/robots.txt
```

### Task: Create sitemap for app.neramclasses.com

Same approach but limited to public tool pages:

```js
/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://app.neramclasses.com',
  generateRobotsTxt: true,
  exclude: [
    '/api/*',
    '/dashboard/*',
    '/auth/*',
    '/login',
    '/signup',
    '/profile/*',
    '/settings/*',
  ],
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: ['/tools', '/tools/*'],
        disallow: ['/api/', '/dashboard/', '/auth/', '/login', '/signup', '/profile/', '/settings/', '/_next/'],
      },
    ],
  },
  // Only include public tool pages
  transform: async (config, path) => {
    if (path === '/tools' || path.startsWith('/tools/')) {
      return {
        loc: path,
        changefreq: 'weekly',
        priority: path === '/tools' ? 0.9 : 0.8,
        lastmod: new Date().toISOString(),
      };
    }
    // Exclude everything else from sitemap
    return null;
  },
};
```

---

## 3. P0: robots.txt FOR BOTH DOMAINS

> If using `next-sitemap` with `generateRobotsTxt: true` (above), this is auto-generated. But verify the output matches below.

### neramclasses.com/robots.txt
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /dashboard/
Disallow: /en/
Disallow: /_next/

Sitemap: https://neramclasses.com/sitemap.xml
```

### app.neramclasses.com/robots.txt
```
User-agent: *
Allow: /tools
Allow: /tools/
Disallow: /api/
Disallow: /dashboard/
Disallow: /auth/
Disallow: /login
Disallow: /signup
Disallow: /profile/
Disallow: /settings/
Disallow: /_next/

Sitemap: https://app.neramclasses.com/sitemap.xml
```

**Fallback if not using next-sitemap**: Create the file manually at `public/robots.txt` in each app's directory.

---

## 4. P0: www → non-www REDIRECT

### Option A: Cloudflare Page Rules (preferred — no code change)

1. Go to Cloudflare Dashboard → neramclasses.com → Rules → Page Rules
2. Create rule:
   - URL: `www.neramclasses.com/*`
   - Setting: **Forwarding URL** → **301 Permanent Redirect**
   - Destination: `https://neramclasses.com/$1`

### Option B: Cloudflare Redirect Rules (newer interface)

1. Cloudflare Dashboard → Rules → Redirect Rules
2. Create rule:
   - When: Hostname equals `www.neramclasses.com`
   - Then: Dynamic redirect to `concat("https://neramclasses.com", http.request.uri.path)`
   - Status: 301

### Option C: Next.js middleware fallback

Create `middleware.ts` (or `middleware.js`) in the app root:
```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';

  // www → non-www redirect
  if (host.startsWith('www.')) {
    const newUrl = new URL(request.url);
    newUrl.host = host.replace('www.', '');
    return NextResponse.redirect(newUrl, 301);
  }

  return NextResponse.next();
}
```

---

## 5. P0: CONSOLIDATE /en/ DUPLICATE URLs

### Problem
The footer links point to `/en/about`, `/en/courses`, `/en/contact`, etc., while the main nav links point to `/about`, `/courses`, `/contact`. This creates duplicate content at two URL paths.

### Fix Strategy
The `/en/` prefix appears to come from Next.js i18n routing. Since only English content exists, remove the i18n prefix entirely and redirect all `/en/*` to `/*`.

**Step 1: Check `next.config.js` for i18n config**
```bash
grep -n "i18n" next.config.js
grep -n "locales" next.config.js
```

If i18n is configured, either:
- **Remove the i18n config entirely** (if only English is used), OR
- Set `defaultLocale: 'en'` and ensure the default locale does NOT get a prefix

**Step 2: Add redirect rules in `next.config.js`**
```js
module.exports = {
  async redirects() {
    return [
      {
        source: '/en/:path*',
        destination: '/:path*',
        permanent: true, // 301 redirect
      },
    ];
  },
  // If i18n exists, update or remove:
  // i18n: {
  //   locales: ['en'],
  //   defaultLocale: 'en',
  //   localeDetection: false,
  // },
};
```

**Step 3: Fix all internal links in footer component**

Find the footer component file and replace all `/en/` prefixed hrefs:
```bash
# Find the footer component
grep -rl "en/about" apps/neramclasses/
grep -rl "en/courses" apps/neramclasses/
```

Replace in the footer component:
```
/en/about       → /about
/en/courses     → /courses
/en/coaching    → /coaching
/en/apply       → /apply
/en/contact     → /contact
/en/fees        → /fees
/en/scholarship → /scholarship
/en/careers     → /careers
/en/nata-syllabus → /nata-syllabus
/en/nata-preparation-guide → /nata-preparation-guide
/en/how-to-score-150-in-nata → /how-to-score-150-in-nata
/en/nata-important-questions → /nata-important-questions
/en/best-books-nata-jee → /best-books-nata-jee
/en/previous-year-papers → /previous-year-papers
/en/tools/cutoff-calculator → /nata-cutoff-calculator (or app.neramclasses.com link)
/en/nata-app    → /nata-app
/en/best-nata-coaching-online → /best-nata-coaching-online
/en/blog        → /blog
/en/privacy     → /privacy
/en/terms       → /terms
/en/refund-policy → /refund-policy
/en/demo-class  → /demo-class
```

Also fix footer city links:
```
/en/contact/nata-coaching-center-in-{city} → /contact/nata-coaching-center-in-{city}
/en/coaching/nata-coaching/nata-coaching-centers-in-{city} → /coaching/nata-coaching/nata-coaching-centers-in-{city}
```

---

## 6. P0: FIX DUPLICATE BRAND NAME IN TITLE TAGS

### Problem
Title tags append "| Neram Classes" twice (or thrice):
- `"JEE Paper 2 Preparation Guide 2026 - B.Arch & B.Planning | Neram Classes | Neram Classes"`
- `"Best NATA Coaching in Trichy 2026 ... | Neram Classes | Neram Classes Blog | Neram Classes"`

### Root Cause (likely)
The layout component appends `| Neram Classes` AND the page-level component also includes it in its title string.

### Fix

**Step 1: Find the title template**
```bash
# For App Router
grep -rn "title" apps/neramclasses/app/layout.tsx
grep -rn "template" apps/neramclasses/app/layout.tsx

# For Pages Router
grep -rn "titleTemplate" apps/neramclasses/
grep -rn "Head" apps/neramclasses/components/
```

**Step 2: If using App Router `metadata`**

In `app/layout.tsx`, set the title template:
```ts
export const metadata: Metadata = {
  title: {
    default: 'Neram Classes - Best NATA & JEE Paper 2 Coaching in India',
    template: '%s | Neram Classes', // This auto-appends the brand
  },
};
```

Then in each page's `metadata`, use ONLY the page-specific title WITHOUT the brand:
```ts
// ❌ WRONG — causes double brand
export const metadata = {
  title: 'JEE Paper 2 Preparation Guide 2026 - B.Arch & B.Planning | Neram Classes',
};

// ✅ CORRECT — template adds "| Neram Classes" automatically
export const metadata = {
  title: 'JEE Paper 2 Preparation Guide 2026 - B.Arch & B.Planning',
};
```

**Step 3: If using Pages Router with `next/head` or `next-seo`**

Find the SEO component and ensure it doesn't double-append:
```bash
grep -rn "Neram Classes" apps/neramclasses/ --include="*.tsx" --include="*.ts" --include="*.jsx" | grep -i "title"
```

Remove duplicate `| Neram Classes` from all page-level title strings.

**Step 4: Audit all page titles after fix**

Expected results:
```
Homepage:        "Neram Classes - Best NATA & JEE Paper 2 Coaching in India"  (default, no template)
/jee-paper-2:    "JEE Paper 2 Preparation Guide 2026 - B.Arch & B.Planning | Neram Classes"
/nata-syllabus:  "NATA Syllabus 2026 - Complete Subject-wise Guide | Neram Classes"
/blog/trichy:    "Best NATA Coaching in Trichy 2026 - Complete Guide | Neram Classes"
City pages:      "Best NATA Coaching in {City} 2026 | Neram Classes"
```

**Max title length: 55–60 characters** (including brand suffix).

---

## 7. P0: ENABLE SSR ON app.neramclasses.com PUBLIC PAGES

### Problem
`/tools/nata/cutoff-calculator` returns only `"Loading..."` to crawlers. Google cannot index CSR-only pages reliably.

### Fix: Convert public `/tools/*` routes to SSR or SSG

**If using App Router (`app/` directory):**

For static tool pages (cutoff calculator, exam centers):
```tsx
// app/tools/nata/cutoff-calculator/page.tsx

// This forces the page to be server-rendered
// Remove any 'use client' directive from the PAGE component
// (Child interactive components can still be 'use client')

import { Metadata } from 'next';
import CutoffCalculatorClient from './CutoffCalculatorClient'; // client component

export const metadata: Metadata = {
  title: 'Free NATA Cutoff Calculator 2026 - Calculate Your B.Arch Score',
  description: 'Calculate your NATA cutoff score out of 400. Enter board marks and NATA scores to get your final B.Arch admission cutoff. Free tool by Neram Classes.',
  alternates: {
    canonical: 'https://app.neramclasses.com/tools/nata/cutoff-calculator',
  },
};

export default function CutoffCalculatorPage() {
  return (
    <>
      {/* This HTML is server-rendered and visible to crawlers */}
      <h1>NATA Cutoff Calculator 2026</h1>
      <p>
        Calculate your NATA cutoff score out of 400 using the official formula:
        (Academic Percentage × 2) + Best NATA Score = Final Cutoff.
        Enter your board marks and up to three NATA attempt scores below.
      </p>

      {/* Interactive calculator is a client component */}
      <CutoffCalculatorClient />

      {/* SEO content rendered server-side */}
      <section>
        <h2>How is the NATA Cutoff Calculated?</h2>
        <p>
          The B.Arch admission cutoff is computed out of 400 using this formula:
          Academic Percentage (converted to a score out of 200) plus your best
          NATA score (out of 200). You need a minimum of 50% in academics and
          at least 70 marks in NATA to be eligible.
        </p>
        <h2>Frequently Asked Questions</h2>
        {/* Add FAQ content here — this is critical for SEO */}
      </section>
    </>
  );
}
```

**If using Pages Router:**
```tsx
// pages/tools/nata/cutoff-calculator.tsx
import { GetStaticProps } from 'next';

export const getStaticProps: GetStaticProps = async () => {
  // Fetch any data needed (e.g., last year's cutoff data from Supabase)
  return {
    props: {
      // Data for SEO content
    },
    revalidate: 86400, // Revalidate daily (ISR)
  };
};
```

**Apply the same pattern to all public tool pages:**
- `/tools` (tools landing page)
- `/tools/nata/cutoff-calculator`
- `/tools/nata/college-predictor`
- `/tools/exam-centers`
- `/tools/nata/question-bank` (if public)
- `/tools/help`

### Handle Duplicate Tool URLs

The tools have two URL paths each. Pick ONE canonical and redirect the other:

In the app's `next.config.js`:
```js
async redirects() {
  return [
    {
      source: '/tools/cutoff-calculator',
      destination: '/tools/nata/cutoff-calculator',
      permanent: true,
    },
    {
      source: '/tools/college-predictor',
      destination: '/tools/nata/college-predictor',
      permanent: true,
    },
  ];
},
```

---

## 8. P1: HOMEPAGE H1 REWRITE

### Current H1
```
Your Time to Master Architecture with AI
```

### Problem
Contains zero primary keywords (NATA, JEE, B.Arch, coaching, online classes).

### Recommended H1
```
Best NATA & JEE Paper 2 Coaching in India — Online & Offline Classes
```

**Alternative options (pick one):**
```
India's #1 NATA & JEE Paper 2 Coaching — Online & Offline B.Arch Prep
```
```
NATA & JEE Paper 2 Coaching by IIT/NIT Architects — Join 5000+ Students
```

### Implementation
Find the homepage component and replace the H1:
```bash
grep -rn "Your Time to Master" apps/neramclasses/
```

Replace the `<h1>` content. Keep the AI branding in a subtitle/tagline, not the H1.

---

## 9. P1: JSON-LD STRUCTURED DATA

### Create a reusable JSON-LD component

```tsx
// components/seo/JsonLd.tsx
interface JsonLdProps {
  data: Record<string, any>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

### Homepage — EducationalOrganization + WebSite

```tsx
<JsonLd data={{
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "name": "Neram Classes",
  "alternateName": "neramClasses",
  "url": "https://neramclasses.com",
  "logo": "https://neramclasses.com/images/logo.png",
  "description": "India's leading NATA & JEE Paper 2 coaching institute. Expert IIT/NIT alumni faculty, AI-powered preparation tools, 99.9% success rate.",
  "foundingDate": "2009",
  "founder": {
    "@type": "Person",
    "name": "Hari"
  },
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Pudukkottai",
    "addressRegion": "Tamil Nadu",
    "addressCountry": "IN"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+91-9176137043",
    "contactType": "admissions",
    "email": "hello@neramclasses.com",
    "availableLanguage": ["English", "Tamil"]
  },
  "sameAs": [
    "https://www.youtube.com/@neramclasses",
    "https://www.instagram.com/neramclasses",
    "https://www.facebook.com/neramclasses"
  ],
  "areaServed": ["India", "United Arab Emirates", "Qatar"],
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "NATA & JEE Paper 2 Courses",
    "itemListElement": [
      {
        "@type": "Course",
        "name": "Architecture Entrance - Year Long",
        "description": "Comprehensive NATA & JEE Paper 2 preparation with IIT/NIT architect alumni faculty",
        "provider": { "@type": "EducationalOrganization", "name": "Neram Classes" },
        "educationalLevel": "12th Standard / Higher Secondary",
        "timeRequired": "P12M"
      },
      {
        "@type": "Course",
        "name": "Architecture Entrance - Crash Course",
        "description": "Intensive NATA & JEE Paper 2 crash course for quick preparation",
        "provider": { "@type": "EducationalOrganization", "name": "Neram Classes" },
        "timeRequired": "P3M"
      }
    ]
  }
}} />

<JsonLd data={{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Neram Classes",
  "url": "https://neramclasses.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://neramclasses.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}} />
```

### Course Pages — Course schema

```tsx
<JsonLd data={{
  "@context": "https://schema.org",
  "@type": "Course",
  "name": "Architecture Entrance - Year Long",
  "description": "Comprehensive NATA & JEE Paper 2 preparation program...",
  "provider": {
    "@type": "EducationalOrganization",
    "name": "Neram Classes",
    "url": "https://neramclasses.com"
  },
  "educationalLevel": "12th Standard",
  "courseCode": "ARCH-YL-2026",
  "hasCourseInstance": {
    "@type": "CourseInstance",
    "courseMode": ["Online", "Onsite"],
    "courseWorkload": "PT1H daily",
    "instructor": {
      "@type": "Person",
      "name": "IIT/NIT Alumni Faculty"
    }
  },
  "offers": {
    "@type": "Offer",
    "category": "Architecture Entrance Coaching",
    "availability": "https://schema.org/InStock"
  }
}} />
```

### Tool Pages — WebApplication schema (for app.neramclasses.com)

```tsx
<JsonLd data={{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "NATA Cutoff Calculator 2026",
  "url": "https://app.neramclasses.com/tools/nata/cutoff-calculator",
  "applicationCategory": "EducationalApplication",
  "operatingSystem": "Any",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "INR"
  },
  "author": {
    "@type": "EducationalOrganization",
    "name": "Neram Classes"
  },
  "description": "Free NATA cutoff calculator. Enter board marks and NATA scores to calculate your B.Arch admission cutoff out of 400."
}} />
```

### City Pages — LocalBusiness + FAQPage schema

```tsx
<JsonLd data={{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is the best NATA coaching in {City}?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Neram Classes offers top-rated NATA coaching for students in {City} with both online and offline options. IIT/NIT alumni faculty, 99.9% success rate."
      }
    },
    {
      "@type": "Question",
      "name": "What are the fees for NATA coaching in {City}?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Neram Classes NATA coaching fees start at Rs. 15,000 for the crash course. EMI options and scholarships available."
      }
    }
    // Add 3-5 more FAQs per city page
  ]
}} />
```

---

## 10. P1: CANONICAL TAGS ON EVERY PAGE

### Implementation

Every page must have a canonical tag pointing to the single correct URL.

**For App Router:**
```tsx
// In each page's metadata export
export const metadata: Metadata = {
  alternates: {
    canonical: 'https://neramclasses.com/jee-paper-2-preparation',
  },
};
```

**For a reusable approach, create a helper:**
```tsx
// lib/seo.ts
export function getCanonical(path: string, domain = 'https://neramclasses.com') {
  return `${domain}${path}`;
}
```

**Critical canonical rules:**
- Homepage: `https://neramclasses.com/` (with trailing slash)
- Never include `/en/` in canonical URLs
- Never include `www.` in canonical URLs
- app.neramclasses.com tools: `https://app.neramclasses.com/tools/nata/cutoff-calculator` (not the shorter alias)

---

## 11. P1: OPEN GRAPH AND TWITTER CARD TAGS

### Create a reusable SEO config per page

```tsx
// For App Router — in each page's metadata export:
export const metadata: Metadata = {
  title: 'NATA Syllabus 2026 - Complete Subject-wise Guide',
  description: 'Complete NATA 2026 syllabus covering Mathematics, General Aptitude, and Drawing. Topic-wise breakdown with weightage and preparation tips.',
  alternates: {
    canonical: 'https://neramclasses.com/nata-syllabus',
  },
  openGraph: {
    title: 'NATA Syllabus 2026 - Complete Subject-wise Guide | Neram Classes',
    description: 'Complete NATA 2026 syllabus covering Mathematics, General Aptitude, and Drawing.',
    url: 'https://neramclasses.com/nata-syllabus',
    siteName: 'Neram Classes',
    images: [
      {
        url: 'https://neramclasses.com/images/og/nata-syllabus.jpg', // Create OG images!
        width: 1200,
        height: 630,
        alt: 'NATA Syllabus 2026 by Neram Classes',
      },
    ],
    locale: 'en_IN',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NATA Syllabus 2026 - Complete Subject-wise Guide',
    description: 'Complete NATA 2026 syllabus covering Mathematics, General Aptitude, and Drawing.',
    images: ['https://neramclasses.com/images/og/nata-syllabus.jpg'],
  },
};
```

**OG image creation task**: Create OG images (1200×630px) for at least:
- Homepage
- Each course page
- NATA Syllabus
- JEE Paper 2 Guide
- Cutoff Calculator
- College Predictor
- Each blog post

Use a template with the Neram brand colors (navy #060d1f, gold #e8a020, blue #1a8fff).

---

## 12. P1: FIX YEAR MISMATCHES (2025 → 2026)

### Search and replace

```bash
# Find all 2025 references in page metadata and headings
grep -rn "2025" apps/neramclasses/ --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.json" | grep -iE "title|description|heading|h1|h2|meta"
```

**Known mismatches to fix:**
- `/jee-paper-2-preparation` — meta description says "2025", title says "2026" → change meta to "2026"
- `/nata-cutoff-calculator` — H1 says "2025" → change to "2026"
- `/blog/best-nata-coaching-trichy-online` — title says "2025" → change to "2026"
- `/blog/best-nata-coaching-madurai-online` — title says "2025" → change to "2026"

**Important**: After fixing, also check that the body content and FAQ answers reference 2026 consistently.

---

## 13. P1: 301 REDIRECTS FOR DEAD/UGLY URLs

Add to `next.config.js`:

```js
async redirects() {
  return [
    // Zombie 404 page still in Google index
    {
      source: '/inner-page',
      destination: '/about',
      permanent: true,
    },
    // Ugly URL with uppercase and underscores
    {
      source: '/NATA_Coaching_center_near_me_address',
      destination: '/coaching',
      permanent: true,
    },
    // /en/ prefix consolidation (catch-all)
    {
      source: '/en/:path*',
      destination: '/:path*',
      permanent: true,
    },
  ];
},
```

After deploying, request URL removal for the old URLs in Google Search Console.

---

## 14. P2: FIX HEADING HIERARCHY SITE-WIDE

### Problem
Multiple pages use `<h5>` where `<h3>` should be used, creating a broken hierarchy: H1 → H2 → H5 (skipping H3, H4).

### Fix
Find the component that renders these H5 tags:
```bash
grep -rn "<h5" apps/neramclasses/components/ --include="*.tsx" --include="*.jsx"
grep -rn "variant.*h5" apps/neramclasses/components/
```

Replace with `<h3>` (or `<h4>` as appropriate based on nesting level).

**Expected heading hierarchy for every page:**
```
<h1> — One per page, contains primary keyword
  <h2> — Section headings
    <h3> — Sub-sections
      <h4> — Detail items (rarely needed)
```

**Specific pages to fix:**
- `/nata-cutoff-calculator` — H1 → H5 → H6 → H2 → H4 (completely broken, restructure)
- `/nata-syllabus` — Numbers used as H3 headings ("200", "3 Hours") → replace with descriptive headings
- All city coaching pages — H1 → H2 → H5 → fix H5 to H3

---

## 15. P2: META DESCRIPTION LENGTH AUDIT

### Rules
- **Minimum**: 120 characters
- **Maximum**: 155 characters
- **Must contain**: Primary keyword + compelling CTA

### Pages with known issues

```bash
# Find all meta descriptions
grep -rn "description" apps/neramclasses/ --include="*.tsx" --include="*.ts" | grep -i "meta\|metadata"
```

**Homepage**: Currently 235 chars → trim to ~150:
```
Before: "Top-ranked NATA & JEE B.Arch coaching by IIT/NIT architects. Microsoft certified online classes across India, UAE, Dubai, Qatar. Offline coaching in Trichy, Chennai, Bangalore, Coimbatore. AIR 1 results. 500+ practice questions. Enroll now!"

After: "India's #1 NATA & JEE Paper 2 coaching by IIT/NIT architects. Online & offline classes. AIR 1 results. 99.9% success rate. Enroll now!"
(130 chars)
```

**City pages**: Many exceed 180 chars. Use template:
```
"Best NATA coaching in {City} by IIT/NIT alumni. Online & offline classes, 99.9% success rate. Join {count}+ students. Enroll for 2026!"
(~135 chars per city)
```

---

## 16. P2: FAQ SCHEMA ON CITY COACHING PAGES

### Why
THiNC (top competitor) uses FAQ schema to earn featured snippets. City pages already have FAQ content — just needs schema markup.

### Implementation

City pages already have Q&A content. Wrap them in FAQPage schema (see Section 9 for the JSON-LD template).

**Minimum 3 FAQs per city page:**
1. "What is the best NATA coaching in {City}?"
2. "How much does NATA coaching cost in {City}?"
3. "Can I prepare for NATA online from {City}?"

---

## 17. P2: IMAGE ALT TEXT AUDIT

```bash
# Find images without alt text
grep -rn "<img" apps/neramclasses/ --include="*.tsx" --include="*.jsx" | grep -v "alt="
grep -rn "Image" apps/neramclasses/ --include="*.tsx" --include="*.jsx" | grep "src=" | grep -v "alt="
```

### Rules for alt text
- Course images: `"NATA coaching - {Course Name} by Neram Classes"`
- Faculty images: `"{Name}, {Qualification} - NATA Faculty at Neram Classes"`
- City images: `"NATA coaching center in {City}"`
- Tool screenshots: `"NATA {Tool Name} - Free tool by Neram Classes"`
- Decorative images: `alt=""` (empty string, not missing)

---

## 18. P3: INTERNAL LINKING CONSISTENCY

### Problem
Navigation links use `/path` but footer links use `/en/path`. After fixing the `/en/` redirect (Section 5), audit all remaining internal links.

```bash
# Find ALL internal links across the codebase
grep -rn 'href="/' apps/neramclasses/ --include="*.tsx" --include="*.jsx" | grep -v node_modules | sort
```

### Rules
- All internal links should use the non-prefixed path: `/about` not `/en/about`
- All internal links should be lowercase
- All internal links should use hyphens not underscores
- Cross-link between content pages (e.g., NATA Syllabus page should link to JEE Paper 2 page and vice versa)
- Blog posts should link to relevant course and tool pages
- City pages should link to the nearest coaching center and relevant courses

---

## 19. P3: CLOUDFLARE BOT PROTECTION AUDIT

### Problem
Some pages return 403 errors to crawlers (e.g., `/best-nata-coaching-online`, `/nata-app`).

### Fix
1. Cloudflare Dashboard → Security → WAF → Custom Rules
2. Check if any rules block `User-Agent: Googlebot` or `User-Agent: Bingbot`
3. Add a rule to ALLOW known search engine bots:
   ```
   Expression: (http.user_agent contains "Googlebot") or
               (http.user_agent contains "Bingbot") or
               (http.user_agent contains "baiduspider") or
               (http.user_agent contains "YandexBot")
   Action: Allow
   ```
4. Security → Bots → Bot Fight Mode → Set to "Off" for verified bots (or configure appropriately)
5. Also check: Security → Settings → Security Level — if set to "Under Attack", reduce to "Medium" or "Low"

### Verify
```bash
# Test with a curl pretending to be Googlebot
curl -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" -I https://neramclasses.com/best-nata-coaching-online
```

Expected: HTTP 200, not 403.

---

## 20. P3: neram.co.in ADMIN PANEL INDEXING BLOCK

### Problem
The admin panel at neram.co.in has indexed pages leaking client content.

### Fix
Add `robots.txt` to neram.co.in:
```
User-agent: *
Disallow: /
```

Add `noindex` meta tag to all admin panel pages:
```html
<meta name="robots" content="noindex, nofollow">
```

---

## 21. VERIFICATION CHECKLIST

Run these checks after implementing all fixes:

```bash
# 1. Build the site and check for errors
npm run build

# 2. Verify sitemap generation
curl https://neramclasses.com/sitemap.xml | head -20
curl https://app.neramclasses.com/sitemap.xml | head -20

# 3. Verify robots.txt
curl https://neramclasses.com/robots.txt
curl https://app.neramclasses.com/robots.txt

# 4. Verify www redirect
curl -I https://www.neramclasses.com/
# Should show: HTTP/1.1 301 Moved Permanently → Location: https://neramclasses.com/

# 5. Verify /en/ redirect
curl -I https://neramclasses.com/en/about
# Should show: HTTP/1.1 301 → Location: https://neramclasses.com/about

# 6. Verify zombie page redirect
curl -I https://neramclasses.com/inner-page
# Should show: HTTP/1.1 301 → Location: https://neramclasses.com/about

# 7. Verify SSR on app tools
curl -s https://app.neramclasses.com/tools/nata/cutoff-calculator | grep -i "<h1"
# Should show: <h1>NATA Cutoff Calculator 2026</h1> (not "Loading...")

# 8. Verify canonical tags
curl -s https://neramclasses.com/nata-syllabus | grep -i "canonical"
# Should show: <link rel="canonical" href="https://neramclasses.com/nata-syllabus" />

# 9. Verify JSON-LD
curl -s https://neramclasses.com/ | grep -i "application/ld+json"
# Should show: <script type="application/ld+json">

# 10. Verify OG tags
curl -s https://neramclasses.com/ | grep -i "og:title"
# Should show: <meta property="og:title" content="..." />

# 11. Verify title tag (no duplicate brand)
curl -s https://neramclasses.com/nata-syllabus | grep -i "<title>"
# Should NOT contain "Neram Classes" twice

# 12. Verify heading hierarchy
curl -s https://neramclasses.com/nata-cutoff-calculator | grep -E "<h[1-6]"
# Should show: h1, h2, h3 (no h5, h6 jumps)

# 13. Check all pages return 200
for url in "/" "/about" "/courses" "/nata-syllabus" "/jee-paper-2-preparation" "/nata-cutoff-calculator" "/best-nata-coaching-online" "/nata-app" "/blog"; do
  status=$(curl -o /dev/null -s -w "%{http_code}" "https://neramclasses.com${url}")
  echo "${url}: ${status}"
done
```

---

## 22. GOOGLE SEARCH CONSOLE SUBMISSION

After deploying all fixes:

1. **Go to** [Google Search Console](https://search.google.com/search-console)
2. **Verify ownership** for both domains:
   - `neramclasses.com` (if not already verified)
   - `app.neramclasses.com` (add as a new property)
3. **Submit sitemaps:**
   - For neramclasses.com: Submit `https://neramclasses.com/sitemap.xml`
   - For app.neramclasses.com: Submit `https://app.neramclasses.com/sitemap.xml`
4. **Request indexing** for key pages via URL Inspection tool:
   - `https://neramclasses.com/`
   - `https://neramclasses.com/best-nata-coaching-online`
   - `https://neramclasses.com/nata-app`
   - `https://app.neramclasses.com/tools`
   - `https://app.neramclasses.com/tools/nata/cutoff-calculator`
   - `https://app.neramclasses.com/tools/nata/college-predictor`
5. **Remove old URLs** via Removals tool:
   - `https://neramclasses.com/inner-page`
   - `https://neramclasses.com/NATA_Coaching_center_near_me_address`
   - Any `www.` or `/en/` variants that appear in the index
6. **Monitor** the Index Coverage report weekly for the first month

---

## IMPLEMENTATION ORDER SUMMARY

```
Week 1 (P0 — do immediately):
  □ Install next-sitemap, generate sitemaps for both domains
  □ Create/verify robots.txt for both domains
  □ Set up www → non-www 301 redirect in Cloudflare
  □ Add /en/* → /* 301 redirects in next.config.js
  □ Fix all footer links to remove /en/ prefix
  □ Fix duplicate "| Neram Classes" in title template
  □ Enable SSR for all /tools/* pages on app.neramclasses.com
  □ Submit both sitemaps to Google Search Console

Week 2 (P1):
  □ Rewrite homepage H1 with primary keywords
  □ Add JSON-LD schema (EducationalOrganization, Course, WebApplication)
  □ Add canonical tags to all pages
  □ Add OG + Twitter Card meta tags to all pages
  □ Fix all 2025 → 2026 year references
  □ Add 301 redirects for /inner-page and /NATA_Coaching_center_near_me_address
  □ Request removal of old URLs in GSC

Week 3-4 (P2):
  □ Fix heading hierarchy (H5 → H3) across all page templates
  □ Trim all meta descriptions to 120-155 characters
  □ Add FAQ schema to all city coaching pages
  □ Audit and fix image alt text

Month 2 (P3):
  □ Full internal linking audit and consistency fix
  □ Cloudflare bot protection audit
  □ Block neram.co.in admin panel from indexing
  □ Create OG images for all key pages
  □ Monitor GSC for indexing progress
```

---

*Generated: March 2026 | Based on comprehensive SEO audit of neramclasses.com and app.neramclasses.com*
