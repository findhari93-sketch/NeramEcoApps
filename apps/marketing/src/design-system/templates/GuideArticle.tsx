import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import DocHeader from '../hero/DocHeader';
import DocLayout from './DocLayout';
import GuideNav, { type GuideNavProps } from '../GuideNav';
import LinkTile from '../LinkTile';
import CtaButton from '../CtaButton';
import type { BreadcrumbItem } from '../Breadcrumb';
import { eyebrowSx, tokens as t } from '../tokens';

export interface GuideArticleProps {
  breadcrumb: BreadcrumbItem[];
  /** e.g. "NATA 2026 · Exam guide". */
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** "Updated March 13, 2026 · Source: Official NATA 2026 Brochure". */
  verified?: ReactNode;
  /** The guide rail (left on desktop, a pill scroller on phones). */
  nav?: GuideNavProps;
  /** "Also read" tiles under the article. */
  related?: Array<{ label: string; href: string; desc?: string }>;
  /** A quiet link back to the hub at the end. */
  back?: { label: string; href: string };
  /** Extra content in the header (badges, a portal link). */
  headerExtra?: ReactNode;
  children: ReactNode;
}

/**
 * T2 Exam guide article: white DocHeader, the guide rail beside an article
 * column of at most 780px, then "Also read" and a link back to the hub.
 * Children are ArticleSections (or any blocks); the column spaces them 40px.
 */
export default function GuideArticle({ breadcrumb, eyebrow, title, lede, verified, nav, related = [], back, headerExtra, children }: GuideArticleProps) {
  return (
    <>
      <DocHeader breadcrumb={breadcrumb} eyebrow={eyebrow} title={title} lede={lede} verified={verified}>
        {headerExtra}
      </DocHeader>
      <Box sx={{ bgcolor: t.ground }}>
        <DocLayout asideAt="start" aside={nav ? <GuideNav {...nav} /> : undefined}>
          {children}

          {related.length > 0 && (
            <Box component="section" aria-label="Also read" sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
              <Typography component="p" sx={eyebrowSx}>
                Also read
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 1.5 }}>
                {related.map((r) => (
                  <LinkTile key={r.href} href={r.href} title={r.label} meta={r.desc} />
                ))}
              </Box>
            </Box>
          )}

          {back && (
            <Box>
              <CtaButton variant="outline" href={back.href} size="md" endIcon={null}>
                {back.label}
              </CtaButton>
            </Box>
          )}
        </DocLayout>
      </Box>
    </>
  );
}
