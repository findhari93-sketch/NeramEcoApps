/**
 * Building blocks shared by the city, state and directory coaching pages.
 * Server components; the only client JS is the lead form, the visit form and the WhatsApp button.
 * Mobile first: 48px touch targets, 8px gaps, 16px body text, no fixed widths.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Box, Container, Typography, Button } from '@neram/ui';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { Faq } from '@/lib/seo/location-copy';
import { WhatsAppLinkButton } from '@/components/WhatsAppLinkButton';

export function Section({
  id,
  title,
  children,
  muted = false,
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
      sx={{ py: { xs: 4, md: 6 }, scrollMarginTop: { xs: 96, md: 88 }, bgcolor: muted ? 'grey.50' : 'background.default' }}
    >
      <Container maxWidth="md">
        {title && (
          <Typography
            id={id ? `${id}-title` : undefined}
            variant="h2"
            sx={{ fontSize: { xs: '1.375rem', md: '1.75rem' }, fontWeight: 700, mb: 2, lineHeight: 1.3 }}
          >
            {title}
          </Typography>
        )}
        {children}
      </Container>
    </Box>
  );
}

export interface Crumb {
  name: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <Box component="nav" aria-label="Breadcrumb" sx={{ mb: 2 }}>
      <Box
        component="ol"
        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, listStyle: 'none', p: 0, m: 0 }}
      >
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <Box component="li" key={c.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {c.href && !last ? (
                <Box
                  component={Link}
                  href={c.href}
                  sx={{
                    color: 'primary.main',
                    fontSize: '0.875rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 44,
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}
                >
                  {c.name}
                </Box>
              ) : (
                <Typography component="span" aria-current={last ? 'page' : undefined} sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                  {c.name}
                </Typography>
              )}
              {!last && <ChevronRightIcon aria-hidden fontSize="small" sx={{ color: 'text.secondary' }} />}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export interface FactRow {
  label: string;
  value: ReactNode;
}

/** A two-column definition list; reads as a table to AI parsers and screen readers. */
export function FactTable({ rows, caption }: { rows: FactRow[]; caption: string }) {
  return (
    <Box
      component="table"
      sx={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '1rem',
        '& caption': { textAlign: 'left', fontWeight: 600, mb: 1, color: 'text.secondary', fontSize: '0.875rem' },
        '& th, & td': { textAlign: 'left', verticalAlign: 'top', py: 1.5, borderBottom: '1px solid', borderColor: 'divider' },
        '& th': { width: { xs: '42%', sm: '35%' }, pr: 2, fontWeight: 600, color: 'text.primary' },
        '& td': { color: 'text.primary', overflowWrap: 'anywhere' },
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

/** Native details/summary: works without JS, keyboard accessible, indexable text. */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {faqs.map((f) => (
        <Box
          key={f.question}
          component="details"
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
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
              gap: 1,
              minHeight: 48,
              px: 2,
              py: 1.5,
              fontWeight: 600,
              fontSize: '1rem',
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2, borderRadius: 2 },
              '& svg': { transition: 'transform 200ms ease', flexShrink: 0 },
              '@media (prefers-reduced-motion: reduce)': { '& svg': { transition: 'none' } },
            }}
          >
            <Box component="h3" sx={{ fontSize: 'inherit', fontWeight: 'inherit', m: 0 }}>
              {f.question}
            </Box>
            <ExpandMoreIcon aria-hidden />
          </Box>
          <Typography sx={{ px: 2, pb: 2, lineHeight: 1.6, color: 'text.secondary' }}>{f.answer}</Typography>
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

/** A wrap of large, tappable links (nearby cities, related pages). */
export function LinkGrid({ items }: { items: LinkItem[] }) {
  return (
    <Box
      component="ul"
      sx={{
        listStyle: 'none',
        p: 0,
        m: 0,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
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
              minHeight: 48,
              px: 2,
              py: 1,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              color: 'text.primary',
              textDecoration: 'none',
              bgcolor: 'background.paper',
              transition: 'border-color 150ms ease, background-color 150ms ease',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography component="span" sx={{ fontWeight: 600, display: 'block' }}>
                {it.label}
              </Typography>
              {it.hint && (
                <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary', display: 'block' }}>
                  {it.hint}
                </Typography>
              )}
            </Box>
            <ChevronRightIcon aria-hidden sx={{ color: 'text.secondary', flexShrink: 0 }} />
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
        bgcolor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
        zIndex: 1100,
        boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
      }}
    >
      <Button variant="outlined" component={Link} href={demoHref} sx={{ flex: 1, minHeight: 48, fontWeight: 600 }}>
        Free demo class
      </Button>
      {whatsapp ? (
        <WhatsAppLinkButton city={whatsapp.city} citySlug={whatsapp.citySlug} label="WhatsApp" sx={{ flex: 1 }} />
      ) : (
        <Button variant="contained" component={Link} href={applyHref} sx={{ flex: 1, minHeight: 48, fontWeight: 600 }}>
          Apply now
        </Button>
      )}
    </Box>
  );
}

/** "Last updated 3 October 2026. Sources: ..." Shown under the answer on location pages. */
export function UpdatedLine({ iso, sources }: { iso: string; sources: string[] }) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  return (
    <Typography sx={{ mt: 1, fontSize: '0.875rem', color: 'text.secondary' }}>
      Last updated <time dateTime={d.toISOString().slice(0, 10)}>{label}</time>.{sources.length ? ` Sources: ${sources.join(', ')}.` : ''}
    </Typography>
  );
}
