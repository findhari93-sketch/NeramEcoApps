/**
 * Server-rendered building blocks of the public tool and place pages. Plain
 * object `sx` only (functions cannot cross to client components), real
 * headings, and native <details> for the FAQ so answers are in the HTML.
 */
import Link from 'next/link';
import { Box, Typography } from '@neram/ui';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbSchema, type Crumb } from '@/lib/seo/tool-schemas';
import { ToolIconTile } from './client-parts';

const linkSx = {
  color: 'primary.main',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
  '&:hover': { textDecorationThickness: 2 },
} as const;

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <>
      <JsonLd data={breadcrumbSchema(crumbs)} />
      <Box component="nav" aria-label="Breadcrumb" sx={{ mb: { xs: 1, md: 1.5 }, overflowX: 'auto' }}>
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <Box component="li" key={c.path} sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                {last ? (
                  <Typography component="span" aria-current="page" sx={{ fontSize: '0.875rem', color: 'text.secondary', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
                    {c.name}
                  </Typography>
                ) : (
                  <>
                    <Box
                      component={Link}
                      href={c.path}
                      sx={{ fontSize: '0.875rem', color: 'text.secondary', textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center', '&:hover': { color: 'text.primary', textDecoration: 'underline' } }}
                    >
                      {c.name}
                    </Box>
                    <ChevronRightRoundedIcon aria-hidden="true" sx={{ fontSize: 18, color: 'text.disabled', mx: 0.25 }} />
                  </>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </>
  );
}

/** H1, the direct answer and where the numbers come from. */
export function ToolHero({
  toolId,
  h1,
  answer,
  source,
  updated,
}: {
  toolId: string;
  h1: string;
  answer: React.ReactNode;
  source?: string;
  /** ISO date the facts were last updated. */
  updated?: string;
}) {
  return (
    <Box component="header" sx={{ display: 'flex', gap: { xs: 1.5, md: 2 }, alignItems: 'flex-start', mb: { xs: 2, md: 3 } }}>
      <ToolIconTile toolId={toolId} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, lineHeight: 1.25, mb: 1 }}>
          {h1}
        </Typography>
        <Typography component="p" sx={{ fontSize: { xs: '1rem', md: '1.0625rem' }, lineHeight: 1.6, maxWidth: 760, color: 'text.primary' }}>
          {answer}
        </Typography>
        {(source || updated) && (
          <Typography variant="body2" component="p" sx={{ mt: 1, color: 'text.secondary', maxWidth: 760 }}>
            {source}
            {source && updated ? ' ' : ''}
            {updated && (
              <>
                Updated <time dateTime={updated}>{formatDate(updated)}</time>.
              </>
            )}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** The framed "try it" area that holds a demo. */
export function DemoCard({ title = 'Try it free', children }: { title?: string; children: React.ReactNode }) {
  return (
    <Box
      component="section"
      aria-labelledby="demo-title"
      sx={{
        p: { xs: 2, sm: 3 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
        mb: { xs: 3, md: 4 },
      }}
    >
      <Typography id="demo-title" component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700, mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ mb: { xs: 4, md: 5 }, maxWidth: 880 }}>
      <Typography id={id} component="h2" sx={{ fontSize: { xs: '1.25rem', md: '1.375rem' }, fontWeight: 700, mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export function Steps({ steps }: { steps: Array<{ title: string; text: string }> }) {
  return (
    <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: `repeat(${Math.min(steps.length, 3)}, 1fr)` } }}>
      {steps.map((s, i) => (
        <Box component="li" key={s.title} sx={{ display: 'flex', gap: 1.5, p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Box aria-hidden="true" sx={{ width: 32, height: 32, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700, fontSize: '0.9375rem' }}>
            {i + 1}
          </Box>
          <Box>
            <Typography component="h3" sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.25 }}>
              {s.title}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.55 }}>
              {s.text}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export function FaqList({ faqs }: { faqs: Array<{ q: string; a: string }> }) {
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {faqs.map((f) => (
        <Box
          component="details"
          key={f.q}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
            '& > summary': {
              listStyle: 'none',
              cursor: 'pointer',
              minHeight: 48,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1.25,
              fontWeight: 600,
              fontSize: '1rem',
            },
            '& > summary::-webkit-details-marker': { display: 'none' },
            '& > summary .faq-chevron': { transition: 'transform 0.2s ease', ml: 'auto', flexShrink: 0 },
            '&[open] > summary .faq-chevron': { transform: 'rotate(180deg)' },
            '@media (prefers-reduced-motion: reduce)': { '& > summary .faq-chevron': { transition: 'none' } },
          }}
        >
          <summary>
            <span>{f.q}</span>
            <ExpandMoreRoundedIcon className="faq-chevron" aria-hidden="true" />
          </summary>
          <Typography sx={{ px: 2, pb: 2, color: 'text.secondary', lineHeight: 1.6 }}>{f.a}</Typography>
        </Box>
      ))}
    </Box>
  );
}

/** A wrapping grid of text links (states, cities, related pages). Each link is 44px tall. */
export function LinkGrid({ links, columns = 3 }: { links: Array<{ href: string; label: string; note?: string }>; columns?: number }) {
  return (
    <Box
      component="ul"
      sx={{
        listStyle: 'none',
        p: 0,
        m: 0,
        display: 'grid',
        columnGap: 2,
        gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${columns}, 1fr)` },
      }}
    >
      {links.map((l) => (
        <li key={l.href}>
          <Box
            component={l.href.startsWith('http') ? 'a' : Link}
            href={l.href}
            sx={{ ...linkSx, display: 'flex', alignItems: 'center', minHeight: 44, fontSize: '0.9375rem', gap: 0.75 }}
          >
            <span>{l.label}</span>
            {l.note && (
              <Typography component="span" variant="caption" sx={{ color: 'text.secondary', textDecoration: 'none' }}>
                {l.note}
              </Typography>
            )}
          </Box>
        </li>
      ))}
    </Box>
  );
}

/** Responsive data table: scrolls inside its own box on a phone, never the page. */
export function DataTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  return (
    <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
      <Box
        component="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.9375rem',
          '& caption': { textAlign: 'left', p: 1.5, fontSize: '0.875rem', color: 'text.secondary' },
          '& th, & td': { textAlign: 'left', px: 1.5, py: 1.25, borderTop: '1px solid', borderColor: 'divider', verticalAlign: 'top' },
          '& th': { fontWeight: 700, bgcolor: 'action.hover', whiteSpace: 'nowrap' },
          '& td.num, & th.num': { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
        }}
      >
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={i > 0 && /km|marks|rank|seats|intake|fee|count|score/i.test(h) ? 'num' : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={j > 0 && /km|marks|rank|seats|intake|fee|count|score/i.test(head[j] ?? '') ? 'num' : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}
