/**
 * Core Web Vitals Monitor
 *
 * Monitors Core Web Vitals (LCP, FID/INP, CLS) across key pages
 * using the PageSpeed Insights API.
 *
 * Run with: pnpm seo:cwv
 *
 * Prerequisites:
 * - Set PAGESPEED_API_KEY environment variable (optional but recommended)
 */

const PSI_API_KEY = process.env.PAGESPEED_API_KEY;

// Pages to monitor
const PAGES_TO_MONITOR = [
  { name: 'Home', url: 'https://neramclasses.com' },
  { name: 'Courses', url: 'https://neramclasses.com/en/courses' },
  { name: 'NATA Course', url: 'https://neramclasses.com/en/courses/nata' },
  { name: 'Coaching', url: 'https://neramclasses.com/en/coaching' },
  { name: 'Apply', url: 'https://neramclasses.com/en/apply' },
  { name: 'Tools Landing', url: 'https://app.neramclasses.com/tools' },
  { name: 'Cutoff Calculator', url: 'https://app.neramclasses.com/tools/cutoff-calculator' },
  { name: 'College Predictor', url: 'https://app.neramclasses.com/tools/college-predictor' },
];

interface CWVResult {
  name: string;
  url: string;
  lcp: number;
  fid: number;
  cls: number;
  performance: number;
  accessibility: number;
  seo: number;
  error?: string;
}

// Thresholds for Core Web Vitals
const THRESHOLDS = {
  lcp: { good: 2500, needsImprovement: 4000 }, // milliseconds
  fid: { good: 100, needsImprovement: 300 }, // milliseconds
  cls: { good: 0.1, needsImprovement: 0.25 }, // score
};

async function measurePage(name: string, url: string): Promise<CWVResult> {
  const apiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  apiUrl.searchParams.set('url', url);
  apiUrl.searchParams.set('strategy', 'mobile');
  apiUrl.searchParams.set('category', 'performance');
  apiUrl.searchParams.set('category', 'accessibility');
  apiUrl.searchParams.set('category', 'seo');

  if (PSI_API_KEY) {
    apiUrl.searchParams.set('key', PSI_API_KEY);
  }

  try {
    const response = await fetch(apiUrl.toString());

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    const metrics = data.lighthouseResult?.audits;
    const categories = data.lighthouseResult?.categories;

    if (!metrics || !categories) {
      throw new Error('Invalid response format');
    }

    return {
      name,
      url,
      lcp: metrics['largest-contentful-paint']?.numericValue || 0,
      fid: metrics['max-potential-fid']?.numericValue || 0,
      cls: metrics['cumulative-layout-shift']?.numericValue || 0,
      performance: Math.round((categories.performance?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100),
    };
  } catch (error) {
    return {
      name,
      url,
      lcp: 0,
      fid: 0,
      cls: 0,
      performance: 0,
      accessibility: 0,
      seo: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function getStatusEmoji(value: number, thresholds: { good: number; needsImprovement: number }) {
  if (value <= thresholds.good) return '✅';
  if (value <= thresholds.needsImprovement) return '⚠️';
  return '❌';
}

function formatLCP(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatCLS(value: number): string {
  return value.toFixed(3);
}

async function main() {
  console.log('🔍 Core Web Vitals Monitor\n');
  console.log('=' .repeat(80));

  if (!PSI_API_KEY) {
    console.log('⚠️  PAGESPEED_API_KEY not set. Using public API (rate limited).\n');
  }

  const results: CWVResult[] = [];

  for (const page of PAGES_TO_MONITOR) {
    process.stdout.write(`📊 Measuring: ${page.name}...`);

    const result = await measurePage(page.name, page.url);
    results.push(result);

    if (result.error) {
      console.log(` ❌ Error: ${result.error}`);
    } else {
      console.log(` ✅ Done`);
    }

    // Rate limiting (1 request per 2 seconds for public API)
    if (!PSI_API_KEY) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Print report
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 CORE WEB VITALS REPORT (Mobile)\n');

  // Header
  console.log(
    'Page'.padEnd(20) +
      'LCP'.padStart(10) +
      'FID'.padStart(10) +
      'CLS'.padStart(10) +
      'Perf'.padStart(8) +
      'A11y'.padStart(8) +
      'SEO'.padStart(8)
  );
  console.log('-'.repeat(80));

  // Results
  for (const r of results) {
    if (r.error) {
      console.log(`${r.name.padEnd(20)} ❌ Error: ${r.error}`);
      continue;
    }

    const lcpStatus = getStatusEmoji(r.lcp, THRESHOLDS.lcp);
    const fidStatus = getStatusEmoji(r.fid, THRESHOLDS.fid);
    const clsStatus = getStatusEmoji(r.cls, THRESHOLDS.cls);

    console.log(
      r.name.substring(0, 18).padEnd(20) +
        `${lcpStatus} ${formatLCP(r.lcp)}`.padStart(10) +
        `${fidStatus} ${r.fid}ms`.padStart(10) +
        `${clsStatus} ${formatCLS(r.cls)}`.padStart(10) +
        `${r.performance}%`.padStart(8) +
        `${r.accessibility}%`.padStart(8) +
        `${r.seo}%`.padStart(8)
    );
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 SUMMARY\n');

  const successful = results.filter((r) => !r.error);
  const avgPerformance =
    successful.reduce((sum, r) => sum + r.performance, 0) / successful.length || 0;
  const avgLCP = successful.reduce((sum, r) => sum + r.lcp, 0) / successful.length || 0;

  console.log(`Total pages tested: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Average Performance Score: ${avgPerformance.toFixed(0)}%`);
  console.log(`Average LCP: ${formatLCP(avgLCP)}`);

  // Recommendations
  const poorLCP = successful.filter((r) => r.lcp > THRESHOLDS.lcp.needsImprovement);
  const poorCLS = successful.filter((r) => r.cls > THRESHOLDS.cls.needsImprovement);

  if (poorLCP.length > 0 || poorCLS.length > 0) {
    console.log('\n⚠️  PAGES NEEDING ATTENTION:\n');

    if (poorLCP.length > 0) {
      console.log('   Slow LCP (>4s):');
      poorLCP.forEach((r) => console.log(`   - ${r.name}: ${formatLCP(r.lcp)}`));
    }

    if (poorCLS.length > 0) {
      console.log('   High CLS (>0.25):');
      poorCLS.forEach((r) => console.log(`   - ${r.name}: ${formatCLS(r.cls)}`));
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n💡 Thresholds (Good / Needs Improvement):');
  console.log(`   LCP: <2.5s / <4s`);
  console.log(`   FID: <100ms / <300ms`);
  console.log(`   CLS: <0.1 / <0.25`);
  console.log('\n✨ Done!\n');
}

main().catch(console.error);
