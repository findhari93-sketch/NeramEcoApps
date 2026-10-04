/**
 * The page template for every public tool and place page.
 *
 *   breadcrumb, H1 + direct answer, demo      <- swapped for the full tool when signed in
 *   data sections (tables, lists)             <- page specific
 *   how it works, free vs signed in, FAQ
 *   place links (states, cities), related tools, more on neramclasses.com
 *
 * Everything is rendered on the server so crawlers and AI answer engines read
 * the same page a visitor does.
 */
import { Box, Typography } from '@neram/ui';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ToolSurface from '@/components/tools/ToolSurface';
import { JsonLd } from '@/components/seo/JsonLd';
import type { ToolSeo } from '@/lib/tools/tool-seo';
import { faqSchema, webApplicationSchema, type Crumb } from '@/lib/seo/tool-schemas';
import { Breadcrumbs, DemoCard, FaqList, LinkGrid, Section, Steps, ToolHero } from './parts';
import { RelatedToolTiles } from './client-parts';

export interface PlaceLinkGroup {
  id: string;
  title: string;
  links: Array<{ href: string; label: string; note?: string }>;
}

interface ToolPublicPageProps {
  tool: ToolSeo;
  crumbs: Crumb[];
  /** Defaults to the registry H1 and answer; place pages pass their own. */
  h1?: string;
  answer?: React.ReactNode;
  updated?: string;
  demoTitle?: string;
  demo: React.ReactNode;
  /** Page-specific sections between the demo and the guide (tables, lists). */
  children?: React.ReactNode;
  faqs?: Array<{ q: string; a: string }>;
  placeLinks?: PlaceLinkGroup[];
  /** Links to the matching neramclasses.com pages. */
  moreLinks?: Array<{ href: string; label: string }>;
  jsonLd?: Array<Record<string, unknown>>;
  /** Place pages describe the tool on the national page; keep WebApplication there only. */
  isToolHome?: boolean;
}

export default function ToolPublicPage({
  tool,
  crumbs,
  h1,
  answer,
  updated,
  demoTitle,
  demo,
  children,
  faqs,
  placeLinks,
  moreLinks,
  jsonLd = [],
  isToolHome = true,
}: ToolPublicPageProps) {
  const allFaqs = faqs ?? tool.faqs;

  return (
    <>
      {isToolHome && (
        <JsonLd
          data={webApplicationSchema({
            name: tool.name,
            description: tool.description,
            path: tool.path,
            features: [...tool.free, ...tool.gated],
          })}
        />
      )}
      {allFaqs.length > 0 && <JsonLd data={faqSchema(allFaqs)} />}
      {jsonLd.map((d, i) => (
        <JsonLd key={i} data={d} />
      ))}

      <ToolSurface toolId={tool.id}>
        <Breadcrumbs crumbs={crumbs} />
        <ToolHero toolId={tool.id} h1={h1 ?? tool.h1} answer={answer ?? tool.answer} source={tool.source} updated={updated} />
        <DemoCard title={demoTitle}>{demo}</DemoCard>
      </ToolSurface>

      {children}

      <Section id="how-it-works" title="How it works">
        <Steps steps={tool.steps} />
      </Section>

      <Section id="free-vs-account" title="Free to try, more with a free account">
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <FeatureList title="Without signing in" items={tool.free} icon="check" />
          <FeatureList title="With a free account" items={tool.gated} icon="lock" />
        </Box>
      </Section>

      {allFaqs.length > 0 && (
        <Section id="faq" title="Frequently asked questions">
          <FaqList faqs={allFaqs} />
        </Section>
      )}

      {placeLinks?.map((g) =>
        g.links.length > 0 ? (
          <Section key={g.id} id={g.id} title={g.title}>
            <LinkGrid links={g.links} />
          </Section>
        ) : null
      )}

      <Section id="related-tools" title="Related free tools">
        <RelatedToolTiles ids={tool.related} />
      </Section>

      {moreLinks && moreLinks.length > 0 && (
        <Section id="more-reading" title="Read more on Neram Classes">
          <LinkGrid links={moreLinks} columns={2} />
        </Section>
      )}
    </>
  );
}

function FeatureList({ title, items, icon }: { title: string; items: string[]; icon: 'check' | 'lock' }) {
  const Icon = icon === 'check' ? CheckRoundedIcon : LockOutlinedIcon;
  return (
    <Box sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Typography component="h3" sx={{ fontWeight: 700, fontSize: '1rem', mb: 1 }}>
        {title}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 0.75 }}>
        {items.map((it) => (
          <Box component="li" key={it} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Icon aria-hidden="true" sx={{ fontSize: 20, mt: '1px', color: icon === 'check' ? 'success.main' : 'text.secondary' }} />
            <Typography variant="body2" sx={{ lineHeight: 1.55 }}>
              {it}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
