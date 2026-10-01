/**
 * IndexNow URL Submission
 *
 * Submits new/updated URLs to search engines via IndexNow protocol.
 * Supported: Bing, Yandex, and IndexNow API.
 *
 * Run with: pnpm seo:indexnow
 *
 * Prerequisites:
 * 1. Set INDEXNOW_API_KEY environment variable
 * 2. Place {INDEXNOW_API_KEY}.txt file in public/ directory
 */

import { execSync } from 'child_process';

const INDEXNOW_KEY = process.env.INDEXNOW_API_KEY;
const MARKETING_HOST = 'neramclasses.com';
const APP_HOST = 'app.neramclasses.com';

interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

// IndexNow endpoints
const INDEXNOW_ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
  'https://yandex.com/indexnow',
];

// Marketing site URLs (static pages)
// Canonical money pages only (no /en/ prefix: English is unprefixed). The daily
// /api/cron/indexnow route submits everything else from the sitemap index.
const MARKETING_URLS = [
  '/',
  '/nata-online-coaching',
  '/coaching/nata-coaching',
  '/jee-paper-2-preparation',
  '/fees',
  '/courses',
  '/apply',
  '/demo-class',
  '/nata-2026',
  '/aat-2026',
  '/pgeta-2026',
  '/colleges',
  '/counseling',
  '/blog',
  '/about',
  '/contact',
];

// App/Tools URLs
const APP_URLS = [
  '/tools',
  '/tools/cutoff-calculator',
  '/tools/college-predictor',
  '/tools/exam-centers',
];

async function submitUrls(host: string, urls: string[]) {
  if (!INDEXNOW_KEY) {
    console.error('❌ INDEXNOW_API_KEY environment variable not set');
    console.log('   Set it with: export INDEXNOW_API_KEY=your-key-here');
    process.exit(1);
  }

  const fullUrls = urls.map((url) => `https://${host}${url}`);

  const payload: IndexNowPayload = {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`,
    urlList: fullUrls,
  };

  console.log(`\n📤 Submitting ${fullUrls.length} URLs for ${host}...`);

  for (const endpoint of INDEXNOW_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const status = response.status;
      const statusText =
        status === 200
          ? '✅ OK'
          : status === 202
            ? '✅ Accepted'
            : status === 400
              ? '❌ Bad Request'
              : status === 403
                ? '❌ Forbidden (check key)'
                : status === 422
                  ? '❌ Unprocessable'
                  : `⚠️ ${status}`;

      console.log(`   ${endpoint}: ${statusText}`);
    } catch (error) {
      console.error(`   ${endpoint}: ❌ Error - ${error}`);
    }
  }
}

async function getChangedFiles(): Promise<string[]> {
  try {
    // Get files changed in the last commit
    const stdout = execSync('git diff --name-only HEAD~1', { encoding: 'utf-8' });
    return stdout.split('\n').filter(Boolean);
  } catch {
    console.log('⚠️ Could not get git diff, submitting all URLs');
    return [];
  }
}

async function main() {
  console.log('🔍 IndexNow URL Submission\n');
  console.log('=' .repeat(50));

  const changedFiles = await getChangedFiles();

  if (changedFiles.length > 0) {
    console.log(`\n📝 Changed files (${changedFiles.length}):`);
    changedFiles.slice(0, 10).forEach((f) => console.log(`   - ${f}`));
    if (changedFiles.length > 10) {
      console.log(`   ... and ${changedFiles.length - 10} more`);
    }
  }

  // Filter URLs based on changed files (or submit all if no git diff)
  let marketingUrlsToSubmit = MARKETING_URLS;
  let appUrlsToSubmit = APP_URLS;

  if (changedFiles.length > 0) {
    // Only submit URLs for changed pages
    const hasMarketingChanges = changedFiles.some(
      (f) => f.startsWith('apps/marketing/') || f.includes('marketing')
    );
    const hasAppChanges = changedFiles.some(
      (f) => f.startsWith('apps/app/') || f.includes('tools')
    );

    if (!hasMarketingChanges) {
      console.log('\n📊 No marketing site changes detected');
      marketingUrlsToSubmit = [];
    }

    if (!hasAppChanges) {
      console.log('📊 No app changes detected');
      appUrlsToSubmit = [];
    }
  }

  // Submit marketing URLs
  if (marketingUrlsToSubmit.length > 0) {
    await submitUrls(MARKETING_HOST, marketingUrlsToSubmit);
  }

  // Submit app URLs
  if (appUrlsToSubmit.length > 0) {
    await submitUrls(APP_HOST, appUrlsToSubmit);
  }

  if (marketingUrlsToSubmit.length === 0 && appUrlsToSubmit.length === 0) {
    console.log('\n✅ No URLs to submit');
  } else {
    console.log('\n✅ IndexNow submission complete!');
  }

  console.log('\n' + '='.repeat(50));
  console.log('💡 Tips:');
  console.log('   - Run after deploying changes to production');
  console.log('   - Submissions are batched (up to 10,000 URLs)');
  console.log('   - Results appear in Bing/Yandex webmaster tools');
}

main().catch(console.error);
