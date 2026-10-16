import { Box, Typography } from '@neram/ui';
import { siteTokens as t } from '@neram/ui/site-tokens';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema, generateArticleSchema } from '@/lib/seo/schemas';
import CallbackDrawer from '@/components/counselling/CallbackDrawer';
import { toolIcon } from '@/components/tools/toolIcons';
import {
  ArticleSection,
  CheckList,
  CtaButton,
  DataTable,
  DocHeader,
  DocLayout,
  FactGrid,
  FactsCard,
  FaqList,
  LinkTile,
  NavCard,
  StatusBanner,
  Timeline,
} from '@/design-system';
import { toTimeline } from './schedule';
import type { CounsellingHubConfig, ExamRoute } from '@/data/counselling-2026/schema';
import type { HubSummary } from '@/data/counselling-2026';

const baseUrl = 'https://neramclasses.com';

const EXAM_ROUTE_LABEL: Record<ExamRoute, string> = {
  NATA: 'NATA',
  JEE_P2: 'JEE Main Paper 2',
  JEE_ADV_AAT: 'JEE Adv + AAT',
};

export interface CounsellingHubPageProps {
  config: CounsellingHubConfig;
  locale: string;
  /** Optional: pass 3-4 related hubs to render in the "Explore other counsellings" strip. */
  related?: HubSummary[];
}

function formatVerified(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/**
 * T5 Counselling detail: light DocHeader, status banner, the schedule as a
 * ruled timeline, facts, eligibility, the free call-back box, then the
 * reference sections. Side rail: other counsellings and two free tools.
 * Used by all 26 /counseling/[body] pages.
 */
export default function CounsellingHubPage({ config, locale, related = [] }: CounsellingHubPageProps) {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;
  const hubUrl = `${baseUrl}${localePrefix}/counseling/${config.slug}`;
  const portalHost = new URL(config.primaryUrl).host;
  const showReservation = config.depth !== 'stub' && config.reservation && config.reservation.length > 0;
  const showFees = config.depth !== 'stub' && config.fees && config.fees.length > 0;
  const showColleges = config.depth !== 'stub' && config.topColleges && config.topColleges.length > 0;
  const showGotchas = config.gotchas && config.gotchas.length > 0;
  const faqs = config.faqs.slice(0, 12);

  // ─── JSON-LD ────────────────────────────────────────────────────────────────
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}` },
    { name: 'Counselling', url: `${baseUrl}${localePrefix}/counseling` },
    { name: config.shortName, url: hubUrl },
  ]);

  const faqSchema = faqs.length > 0 ? generateFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer }))) : null;

  const articleSchema = generateArticleSchema({
    title: config.title,
    description: config.description,
    url: hubUrl,
    publishedAt: config.lastVerified,
    modifiedAt: config.lastVerified,
    author: 'Neram Classes',
    category: 'B.Arch Counselling',
  });

  const bannerDetail = [config.statusBanner.detail, config.statusBanner.expectedDate && `Expected: ${config.statusBanner.expectedDate}`]
    .filter(Boolean)
    .map((part) => String(part).replace(/\.+$/, ''))
    .join('. ');

  const rail = (
    <>
      {related.length > 0 && (
        <NavCard
          title="Other counsellings"
          links={[
            ...related.map((r) => ({ label: r.shortName, href: `/counseling/${r.slug}` })),
            { label: 'All 28 counsellings', href: '/counseling' },
          ]}
        />
      )}
      <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Typography component="span" sx={{ fontFamily: t.fontMono, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.inkMuted }}>
          Free tools
        </Typography>
        <LinkTile href="/tools/college-predictor" icon={toolIcon('college-predictor')} title="College Predictor" />
        <LinkTile href="/tools/cutoff-calculator" icon={toolIcon('cutoff-calculator')} title="Cutoff Calculator" />
      </Box>
    </>
  );

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}

      <DocHeader
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Counselling', href: '/counseling' }, { name: config.shortName }]}
        eyebrow={`${config.examRoutes.map((r) => EXAM_ROUTE_LABEL[r]).join(' + ')} accepted · ${config.authorityShort ?? config.shortName}`}
        title={config.title}
        lede={config.tagline}
        verified={`Last verified ${formatVerified(config.lastVerified)} against ${portalHost}`}
      >
        <Box>
          <CtaButton variant="link" href={config.primaryUrl} external size="md">
            Official portal: {portalHost}
          </CtaButton>
        </Box>
      </DocHeader>

      <Box sx={{ bgcolor: t.ground, pb: { xs: 10, md: 0 } }}>
        <DocLayout aside={rail}>
          {locale !== 'en' && (
            <Typography sx={{ m: 0, p: 1.5, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, bgcolor: t.surface, fontSize: '0.9375rem', color: t.inkMuted }}>
              This counselling guide is currently available in English only. Translations are coming soon.
            </Typography>
          )}

          <StatusBanner
            status={config.status}
            label={config.statusBanner.label}
            detail={bannerDetail || undefined}
            note={config.cycleSourceNote ? `Note: ${config.cycleSourceNote}` : undefined}
          />

          <Typography component="p" sx={{ m: 0, fontSize: '1.0625rem', lineHeight: 1.7, color: t.ink }}>
            {config.description}
          </Typography>

          {config.dates.length > 0 && (
            <ArticleSection id="dates-title" title="Important dates">
              <Timeline items={toTimeline(config.dates)} />
            </ArticleSection>
          )}

          {config.atAGlance.length > 0 && (
            <ArticleSection id="glance-title" title="At a glance">
              <FactGrid items={config.atAGlance} />
            </ArticleSection>
          )}

          {config.eligibility.length > 0 && (
            <ArticleSection id="eligibility-title" title="Eligibility">
              <CheckList variant="ruled" columnMin={560} items={config.eligibility.map((r) => ({ title: r.label, body: r.detail }))} />
            </ArticleSection>
          )}

          <CallbackDrawer
            variant="sticky"
            card={{
              title: `Not sure which colleges to fill first in ${config.shortName}?`,
              body: 'A counsellor calls you back about eligibility, your choice list and the rounds. Free, no obligation.',
            }}
            context={`${config.shortName} B.Arch 2026`}
            queryType="b_arch_counselling"
            courseInterest="nata"
            ctaLabel={`Get ${config.shortName} Counselling Help`}
            drawerTitle={`Free ${config.shortName} Counselling Call`}
            drawerIntro={`Talk to a counsellor about ${config.shortName} eligibility, college choice, and counselling rounds. Free, no obligation.`}
            successMessage={`Our counsellor will call you back within 24 hours about ${config.shortName}.`}
            cutoffCalculatorUrl="https://app.neramclasses.com/tools/nata/cutoff-calculator"
            collegePredictorUrl="https://app.neramclasses.com/tools/counseling/college-predictor"
          />

          {showReservation && (
            <ArticleSection id="reservation-title" title="Reservation matrix">
              <DataTable
                caption={`${config.shortName} seat reservation`}
                hideCaption
                columns={['Category', 'Quota', 'Notes']}
                mutedColumn={2}
                rows={config.reservation!.map((r) => [r.category, r.percentage, r.note || ''])}
              />
            </ArticleSection>
          )}

          {showFees && (
            <ArticleSection id="fees-title" title="Fee structure">
              <FactsCard
                items={config.fees!.map((f) => ({
                  label: (
                    <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                      <span>{f.label}</span>
                      {f.note && (
                        <Box component="span" sx={{ fontSize: '0.8125rem', color: t.inkMuted }}>
                          {f.note}
                        </Box>
                      )}
                    </Box>
                  ),
                  value: f.amount,
                }))}
              />
            </ArticleSection>
          )}

          {showColleges && (
            <ArticleSection id="colleges-title" title="Top participating colleges">
              <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', borderTop: `1px solid ${t.ink}` }}>
                {config.topColleges!.map((c, idx) => (
                  <Box component="li" key={`${c.name}-${idx}`} sx={{ py: 1.75, borderBottom: `1px solid ${t.line}`, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    <Typography component="strong" sx={{ fontSize: '1rem', fontWeight: 700 }}>
                      {c.url ? (
                        <CtaButton variant="link" href={c.url} size="md" endIcon={null} sx={{ minHeight: 0, py: 0, px: 0, fontWeight: 700 }}>
                          {c.name}
                        </CtaButton>
                      ) : (
                        c.name
                      )}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: '0.875rem', color: t.inkMuted }}>
                      {[c.city, c.intake ? `${c.intake} seats` : null, c.feesPerYear ? `${c.feesPerYear}/yr` : null].filter(Boolean).join(' · ')}
                    </Typography>
                    {c.cutoffNote && (
                      <Typography component="span" sx={{ fontSize: '0.875rem', color: t.inkMuted }}>
                        {c.cutoffNote}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </ArticleSection>
          )}

          {showGotchas && (
            <ArticleSection id="gotchas-title" title="Common mistakes to avoid">
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {config.gotchas!.map((g, idx) => (
                  <Box
                    key={`${g.title}-${idx}`}
                    sx={{
                      bgcolor: t.surface,
                      border: `1px solid ${t.line}`,
                      borderLeft: 'none',
                      borderRadius: `${t.radius}px`,
                      boxShadow: `inset 3px 0 0 ${t.gold500}`,
                      px: 2.5,
                      py: 2,
                    }}
                  >
                    <Typography component="h3" sx={{ m: 0, fontSize: '1rem', fontWeight: 700 }}>
                      {g.title}
                    </Typography>
                    <Typography sx={{ mt: 0.5, fontSize: '0.9375rem', lineHeight: 1.55, color: t.inkMuted }}>{g.detail}</Typography>
                  </Box>
                ))}
              </Box>
            </ArticleSection>
          )}

          {faqs.length > 0 && (
            <ArticleSection id="faq-title" title="Frequently asked questions">
              <FaqList items={faqs.map((f) => ({ question: f.question, answer: f.answer }))} defaultOpen={-1} />
            </ArticleSection>
          )}

          <Typography sx={{ m: 0, fontSize: '0.875rem', color: t.inkMuted }}>
            Information curated from official sources. Always verify against{' '}
            <a href={config.primaryUrl} target="_blank" rel="noopener noreferrer" style={{ color: t.ink, textDecoration: 'underline' }}>
              {portalHost}
            </a>{' '}
            before applying.
          </Typography>
        </DocLayout>
      </Box>
    </>
  );
}
