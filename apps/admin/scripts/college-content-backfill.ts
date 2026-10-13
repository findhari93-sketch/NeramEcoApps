/**
 * Writes the FAQ section for college pages, the same way the nightly cron does.
 *
 * From apps/admin:
 *   npx tsx scripts/college-content-backfill.ts --env staging --dry-run --limit 3 --print
 *   npx tsx scripts/college-content-backfill.ts --env staging
 *   npx tsx scripts/college-content-backfill.ts --env staging --slug psg-iap --all
 *   npx tsx scripts/college-content-backfill.ts --env prod        (only when asked)
 *
 * By default only colleges whose facts changed since their FAQs were written.
 * --all rewrites every selected college. --no-ai uses the templates only.
 * --print shows each FAQ (handy with --dry-run).
 * --defer-ai writes template FAQs now and leaves each college queued, so the
 *   nightly cron rewords them once Gemini works again (e.g. credit ran out).
 */
import { arg, flag, useEnv } from './college-env';

async function main() {
  const env = useEnv();
  const { getSupabaseAdminClient } = await import('@neram/database');
  const { loadCollegesWithFacts, needsRewrite, writeCollegeFaqs } = await import('../src/lib/college-content/apply');
  const { writeFaqs } = await import('../src/lib/college-content/generate');

  const db = getSupabaseAdminClient() as any;
  const dryRun = flag('dry-run');
  const useAi = !flag('no-ai');
  const deferAi = flag('defer-ai');
  const limit = Number(arg('limit')) || Infinity;
  const slug = arg('slug');

  let all = await loadCollegesWithFacts(db);
  if (slug) all = all.filter((c) => c.row.slug === slug);
  const due = (flag('all') || slug ? all : all.filter(needsRewrite)).slice(0, limit);
  console.log(`${dryRun ? 'DRY RUN: ' : ''}${due.length} college(s) on ${env}\n`);

  let total = 0;
  for (const [i, c] of due.entries()) {
    try {
      if (flag('print')) {
        const r = await writeFaqs(c.facts, { useAi });
        console.log(`\n## ${c.row.name} (${r.faqs.length} FAQs: ${r.ai} AI, ${r.template} template)`);
        for (const f of r.faqs) console.log(`Q: ${f.question}\nA: ${f.answer}\n`);
        if (r.rejected.length) console.log('Rejected:', r.rejected);
        if (dryRun) continue;
      }
      const rep = await writeCollegeFaqs(db, c, { dryRun, useAi, deferAi });
      total += rep.written;
      if (rep.aiUnavailable && useAi && !deferAi) {
        console.log(`${String(i + 1).padStart(3)}. ${c.row.slug.padEnd(48)} ${rep.written} template FAQs; AI unavailable, stopping (rerun after midnight UTC)`);
        break;
      }
      console.log(`${String(i + 1).padStart(3)}. ${c.row.slug.padEnd(48)} ${rep.written} FAQs (${rep.ai} AI, ${rep.template} template, ${rep.kept} kept)${rep.rejected.length ? ` rejected:${rep.rejected.map((r) => `${r.intent}/${r.reason}`).join(',')}` : ''}`);
    } catch (err) {
      console.log(`${String(i + 1).padStart(3)}. ${c.row.slug.padEnd(48)} FAILED ${(err as Error).message}`);
    }
  }
  console.log(`\n${total} FAQs ${dryRun ? 'would be ' : ''}written.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
