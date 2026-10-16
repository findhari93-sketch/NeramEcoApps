/**
 * Building blocks shared by the city, state and directory coaching pages (T6).
 * Server components; the only client JS is the lead form, the visit form and the WhatsApp button.
 * Mobile first: 48px touch targets, 8px gaps, 16px body text, no fixed widths.
 * Colours come from the design-system tokens (apps/marketing/DESIGN_SYSTEM.md).
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Box, Typography } from '@neram/ui';
import { siteTokens as t } from '@neram/ui/site-tokens';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { Faq } from '@/lib/seo/location-copy';
import { WhatsAppLinkButton } from '@/components/WhatsAppLinkButton';
import { Breadcrumb, CtaButton } from '@/design-system';

/**
 * One block of the page body: an article-size h2 and its content. Pages stack
 * these inside their own layout (AsideLayout main column, or a Section band).
 * `muted` is kept for callers but no longer paints a band.
 */
export function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title?: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <Box
      component="section"
      id={id}
      aria-labelledby={title && id ? `${id}-title` : undefined}
      // In-page links (#visit, #centre) land with the heading clear of the fixed header and announcement bar.
      sx={{ scrollMarginTop: { xs: 96, md: 88 }, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, color: t.ink }}
    >
      {title && (
        <Typography
          id={id ? `${id}-title` : undefined}
          component="h2"
          sx={{ m: 0, fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, lineHeight: 1.2 }}
        >
          {title}
        </Typography>
      )}
      {children}
    </Box>
  );
}

export interface Crumb {
  name: string;
  href?: string;
}

/** The design-system breadcrumb (it reads the surface colours, so it works on the dark hero). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return <Breadcrumb items={items} />;
}

export interface FactRow {
  label: string;
  value: ReactNode;
}

/**
 * Facts as a ruled two-column table (T6 "at a glance"): ink top rule, a
 * hairline per row, muted labels. Reads as a table to AI parsers and screen readers.
 */
export function FactTable({ rows, caption }: { rows: FactRow[]; caption: string }) {
  return (
    <Box
      component="table"
      sx={{
        width: '100%',
        borderCollapse: 'collapse',
        borderTop: `1px solid ${t.ink}`,
        fontSize: '1rem',
        // The section heading already says this; keep the caption for assistive tech only.
        '& caption': { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' },
        '& th, & td': { textAlign: 'left', verticalAlign: 'top', py: 1.75, borderBottom: `1px solid ${t.line}` },
        '& th': { width: { xs: '42%', sm: '36%' }, pr: 2, fontWeight: 400, fontSize: '0.9375rem', color: t.inkMuted },
        '& td': { fontWeight: 600, color: t.ink, overflowWrap: 'anywhere' },
        '& td a': { color: t.ink, textDecoration: 'underline', textDecorationColor: t.lineStrong, textUnderlineOffset: '3px' },
        '& td a:hover': { textDecorationColor: t.gold500 },
      }}
    >
      <caption>{caption}</caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            <td>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </Box>
  );
}

/**
 * The FAQ as rules, not boxes (same look as the design-system FaqList), on
 * native details/summary: works without JS, keyboard accessible, indexable text.
 */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${t.ink}` }}>
      {faqs.map((f) => (
        <Box
          key={f.question}
          component="details"
          sx={{
            borderBottom: `1px solid ${t.line}`,
            '&[open] summary svg': { transform: 'rotate(180deg)' },
            '& summary::-webkit-details-marker': { display: 'none' },
          }}
        >
          <Box
            component="summary"
            sx={{
              listStyle: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
              minHeight: 60,
              py: 1.5,
              color: t.ink,
              '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
              '& svg': { transition: 'transform 200ms ease', flexShrink: 0, color: t.inkMuted },
              '@media (prefers-reduced-motion: reduce)': { '& svg': { transition: 'none' } },
            }}
          >
            <Box component="h3" sx={{ fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.4, m: 0 }}>
              {f.question}
            </Box>
            <ExpandMoreIcon aria-hidden />
          </Box>
          <Typography sx={{ pr: 5, pb: 2.25, fontSize: '1rem', lineHeight: 1.6, color: t.inkMuted }}>{f.answer}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export interface LinkItem {
  label: string;
  href: string;
  hint?: string;
}

/** A wrap of large, tappable links (nearby cities, related pages). Hover = gold border. */
export function LinkGrid({ items, columnMin = 220 }: { items: LinkItem[]; columnMin?: number }) {
  return (
    <Box
      component="ul"
      sx={{
        listStyle: 'none',
        p: 0,
        m: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${columnMin}px), 1fr))`,
        gap: 1,
      }}
    >
      {items.map((it) => (
        <Box component="li" key={it.href}>
          <Box
            component={Link}
            href={it.href}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              height: '100%',
              boxSizing: 'border-box',
              minHeight: 48,
              px: 1.75,
              py: 1,
              border: `1px solid ${t.line}`,
              borderRadius: `${t.radius}px`,
              color: t.ink,
              textDecoration: 'none',
              bgcolor: t.surface,
              transition: 'border-color 150ms ease',
              '&:hover': { borderColor: t.gold500, color: t.ink },
              '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.9375rem', display: 'block' }}>
                {it.label}
              </Typography>
              {it.hint && (
                <Typography component="span" sx={{ fontSize: '0.8125rem', color: t.inkMuted, display: 'block' }}>
                  {it.hint}
                </Typography>
              )}
            </Box>
            <ChevronRightIcon aria-hidden sx={{ fontSize: 18, color: t.inkMuted, flexShrink: 0 }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** Height of the mobile sticky bar; pages pad their bottom by this so nothing hides behind it. */
export const STICKY_CTA_HEIGHT = 72;

export function StickyCta({
  demoHref = '/demo-class',
  applyHref = '/apply',
  whatsapp,
}: {
  demoHref?: string;
  applyHref?: string;
  /** On location pages: WhatsApp (city and page code pre-filled) replaces Apply. */
  whatsapp?: { city?: string | null; citySlug?: string | null };
}) {
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: { xs: 'flex', md: 'none' },
        gap: 1,
        p: 1.5,
        pb: 'calc(12px + env(safe-area-inset-bottom))',
        bgcolor: t.surface,
        borderTop: `1px solid ${t.line}`,
        zIndex: 1100,
      }}
    >
      <CtaButton variant="outline" href={demoHref} size="md" endIcon={null} sx={{ flex: 1 }}>
        Free demo class
      </CtaButton>
      {whatsapp ? (
        <WhatsAppLinkButton city={whatsapp.city} citySlug={whatsapp.citySlug} label="WhatsApp" sx={{ flex: 1 }} />
      ) : (
        <CtaButton href={applyHref} size="md" endIcon={null} sx={{ flex: 1 }}>
          Apply now
        </CtaButton>
      )}
    </Box>
  );
}

/** "Last updated 3 October 2026. Sources: ..." Shown under the answer on location pages (dark hero or light body). */
export function UpdatedLine({ iso, sources }: { iso: string; sources: string[] }) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  return (
    <Typography sx={{ m: 0, fontSize: '0.875rem', lineHeight: 1.5, color: `var(--ds-muted, ${t.inkMuted})` }}>
      Last updated <time dateTime={d.toISOString().slice(0, 10)}>{label}</time>.{sources.length ? ` Sources: ${sources.join(', ')}.` : ''}
    </Typography>
  );
}

/** The sticky lead card in the T6 aside: 3px gold top, title, one line, then the form. */
export function LeadCard({ id, title, body, children }: { id?: string; title: string; body?: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      sx={{
        scrollMarginTop: { xs: 96, md: 88 },
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderTop: `3px solid ${t.gold500}`,
        borderRadius: `${t.radius}px`,
        p: { xs: 2.5, sm: 3 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        color: t.ink,
      }}
    >
      <Typography id={id ? `${id}-title` : undefined} component="h2" sx={{ m: 0, fontSize: '1.1875rem', fontWeight: 700, lineHeight: 1.3 }}>
        {title}
      </Typography>
      {body && <Typography sx={{ m: 0, fontSize: '0.875rem', lineHeight: 1.5, color: t.inkMuted }}>{body}</Typography>}
      {children}
    </Box>
  );
}
