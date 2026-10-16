'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import PageHero from '../hero/PageHero';
import HubCard, { type HubCardProps } from '../HubCard';
import EmptyState from '../EmptyState';
import type { BreadcrumbItem } from '../Breadcrumb';
import { tokens as t } from '../tokens';

export interface HubItem extends Omit<HubCardProps, 'titleAs' | 'title' | 'desc'> {
  title: string;
  desc?: string;
  /** Extra words the search should match (aliases, short names). */
  keywords?: string;
}

export interface HubGroup {
  key: string;
  label: string;
  items: HubItem[];
}

export interface HubIndexProps {
  breadcrumb: BreadcrumbItem[];
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** Extra lines under the lede (e.g. "Part of aiArchitek"). */
  intro?: ReactNode;
  groups: HubGroup[];
  /** Shows the search input when set, e.g. "Find a tool, e.g. cutoff, predictor". */
  searchPlaceholder?: string;
  /** Tab label for everything (default "All"). */
  allLabel?: string;
  /** Plural noun for group counts ("tools", "counsellings"); a trailing s is dropped for one. Default "items". */
  countNoun?: string;
  /** Action line on every card (default "Open"). */
  cardCta?: string;
  /** Hide the category tabs (one group, or a hub that only needs search). */
  hideTabs?: boolean;
  /** An h2 above the card groups (e.g. "All 28 B.Arch counsellings in India"). */
  heading?: ReactNode;
  actions?: ReactNode;
  /** Content after the card groups (trust strip, FAQ...), server-rendered by the page. */
  children?: ReactNode;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD');

/**
 * T3 Hub index: a dark hero with an optional search and category tabs that
 * sit on its bottom edge (the active tab is the body colour, flush with it),
 * then the groups as card grids. Every card is in the HTML for crawlers; the
 * tabs and search only filter what is shown.
 */
export default function HubIndex({
  breadcrumb,
  eyebrow,
  title,
  lede,
  intro,
  groups,
  searchPlaceholder,
  allLabel = 'All',
  countNoun = 'items',
  cardCta = 'Open',
  hideTabs = false,
  heading,
  actions,
  children,
}: HubIndexProps) {
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const searchId = useId();
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return groups
      .filter((g) => tab === 'all' || g.key === tab)
      .map((g) => ({
        ...g,
        items: q ? g.items.filter((it) => norm(`${it.title} ${it.desc ?? ''} ${it.keywords ?? ''}`).includes(q)) : g.items,
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, tab, query]);

  const tabs = [{ key: 'all', label: allLabel, count: total }, ...groups.map((g) => ({ key: g.key, label: g.label, count: g.items.length }))];
  const showTabs = !hideTabs && groups.length > 1;

  return (
    <>
      <PageHero
        breadcrumb={breadcrumb}
        eyebrow={eyebrow}
        title={title}
        lede={lede}
        actions={actions}
        bottom={
          showTabs ? (
            <Box
              role="group"
              aria-label="Filter by category"
              sx={{
                maxWidth: t.container.page,
                mx: 'auto',
                px: { xs: 2, sm: 3 },
                boxSizing: 'content-box',
                display: 'flex',
                gap: 0.5,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
              }}
            >
              {tabs.map((tb) => {
                const on = tb.key === tab;
                return (
                  <Box
                    key={tb.key}
                    component="button"
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTab(tb.key)}
                    sx={{
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 1,
                      minHeight: 48,
                      px: 2,
                      border: 0,
                      borderRadius: `${t.radius}px ${t.radius}px 0 0`,
                      cursor: 'pointer',
                      font: 'inherit',
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      bgcolor: on ? t.ground : 'transparent',
                      color: on ? t.ink : t.paper,
                      transition: 'background-color 150ms ease, color 150ms ease',
                      '&:hover': { bgcolor: on ? t.ground : t.lineDark },
                      '&:focus-visible': { outline: t.focusOutline, outlineOffset: '-2px' },
                    }}
                  >
                    {tb.label}
                    <Box component="span" sx={{ fontFamily: t.fontMono, fontSize: '0.75rem', opacity: 0.7 }}>
                      {tb.count}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ) : undefined
        }
      >
        {intro}
        {searchPlaceholder && (
          <Box
            component="label"
            htmlFor={searchId}
            sx={{
              mt: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              maxWidth: 560,
              height: 52,
              px: 2,
              boxSizing: 'border-box',
              bgcolor: t.navy800,
              border: `1px solid ${t.outlineDark}`,
              borderRadius: `${t.radius}px`,
              color: t.paperMuted,
              '&:focus-within': { outline: t.focusOutline, outlineOffset: '2px' },
            }}
          >
            <SearchOutlinedIcon aria-hidden />
            <Box
              component="input"
              id={searchId}
              type="search"
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              sx={{
                flex: 1,
                minWidth: 0,
                bgcolor: 'transparent',
                border: 0,
                outline: 'none',
                color: t.paper,
                font: 'inherit',
                fontSize: '1rem',
                '&::placeholder': { color: t.paperSubtle, opacity: 1 },
              }}
            />
          </Box>
        )}
      </PageHero>

      <Box sx={{ bgcolor: t.ground, color: t.ink }}>
        <Box
          sx={{
            maxWidth: t.container.page,
            mx: 'auto',
            px: { xs: 2, sm: 3 },
            pt: { xs: 5, md: 6 },
            pb: { xs: 8, md: 10 },
            boxSizing: 'content-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {heading && (
            <Typography component="h2" sx={{ m: 0, mb: -2, fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, lineHeight: 1.2 }}>
              {heading}
            </Typography>
          )}
          {visible.length === 0 ? (
            <EmptyState title="Nothing matches that search" body="Try a shorter word, or pick All above." />
          ) : (
            visible.map((g) => (
              <Box component="section" key={g.key} aria-labelledby={`hub-${g.key}`} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', borderBottom: `1px solid ${t.line}`, pb: 1.5 }}>
                  <Typography id={`hub-${g.key}`} component="h2" sx={{ m: 0, fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.2 }}>
                    {g.label}
                  </Typography>
                  <Typography component="span" sx={{ fontSize: '0.875rem', color: t.inkMuted }}>
                    {g.items.length} {g.items.length === 1 ? countNoun.replace(/s$/, "") : countNoun}
                  </Typography>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: { xs: 2, md: 2.5 } }}>
                  {g.items.map((it, i) => (
                    <HubCard key={`${it.href}-${i}`} {...it} cta={it.cta ?? cardCta} />
                  ))}
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Box>
      {children}
    </>
  );
}
