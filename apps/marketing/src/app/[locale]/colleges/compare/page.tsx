'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Box, Container, Skeleton, Snackbar, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import SearchIcon from '@mui/icons-material/Search';
import type { CollegeDetail } from '@/lib/college-hub/types';
import type { ListingCollege } from '@/lib/college-hub/listing-filter';
import { COMPARE_MAX } from '@/lib/college-hub/constants';
import { buildCompareSections, type CompareSection } from '@/lib/college-hub/compare-rows';
import { addToCompareList, readCompareList, removeFromCompareList } from '@/lib/college-hub/compare-store';
import { collegeHref, shortName, typeLabel } from '@/lib/college-hub/format';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import CollegeLogo from '@/components/college-hub/directory/CollegeLogo';
import { tokens } from '@/design-system';

type Loaded = { slug: string; college: CollegeDetail | null };

const LABEL_COL = 240;

function useBackHref() {
  const [href, setHref] = useState('/colleges');
  useEffect(() => {
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === window.location.origin && /\/colleges(\/|$)/.test(ref.pathname) && !/\/colleges\/compare/.test(ref.pathname)) {
        setHref(ref.pathname + ref.search);
      }
    } catch {
      // Keep the default.
    }
  }, []);
  return href;
}

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const slugsParam = searchParams?.get('slugs') ?? '';
  const slugs = useMemo(() => slugsParam.split(',').map(decodeURIComponent).filter(Boolean).slice(0, COMPARE_MAX), [slugsParam]);
  const backHref = useBackHref();

  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const loadedRef = useRef(new Map<string, Loaded>());
  const [loading, setLoading] = useState(true);
  const [diffOnly, setDiffOnly] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // No slugs in the URL but a saved compare list: open that list.
  useEffect(() => {
    if (slugs.length) return;
    const saved = readCompareList();
    if (saved.length) router.replace(`${pathname}?slugs=${saved.map((e) => encodeURIComponent(e.slug)).join(',')}`);
    else setLoading(false);
  }, [slugs.length, router, pathname]);

  useEffect(() => {
    if (!slugs.length) return;
    // Removing a college must not reload the others: fetch only what is new,
    // and show the skeleton only before the first college arrives.
    const missing = slugs.filter((s) => !loadedRef.current.has(s));
    if (!missing.length) return;
    let alive = true;
    if (loadedRef.current.size === 0) setLoading(true);
    Promise.all(
      missing.map((slug) =>
        fetch(`/api/colleges/detail?slug=${encodeURIComponent(slug)}`)
          .then((r) => (r.ok ? r.json() : { data: null }))
          .then((j) => ({ slug, college: (j.data ?? null) as CollegeDetail | null }))
          .catch(() => ({ slug, college: null }))
      )
    )
      .then((rows) => {
        if (!alive) return;
        for (const r of rows) loadedRef.current.set(r.slug, r);
        setLoaded([...loadedRef.current.values()]);
        // Keep the tray in step with what is on screen.
        for (const r of rows) {
          if (r.college) addToCompareList({ slug: r.slug, name: r.college.name, shortName: shortName(r.college), stateSlug: r.college.state_slug });
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [slugs]);

  const setSlugs = useCallback(
    (next: string[]) => {
      const qs = next.length ? `?slugs=${next.map(encodeURIComponent).join(',')}` : '';
      router.replace(`${pathname}${qs}`, { scroll: false });
    },
    [router, pathname]
  );

  const removeSlug = (slug: string) => {
    removeFromCompareList(slug);
    setSlugs(slugs.filter((s) => s !== slug));
  };
  const addSlug = (c: ListingCollege) => {
    if (slugs.includes(c.slug) || slugs.length >= COMPARE_MAX) return;
    addToCompareList({ slug: c.slug, name: c.name, shortName: shortName(c), stateSlug: c.state_slug });
    setSlugs([...slugs, c.slug]);
  };

  // Columns follow the URL order.
  const colleges = slugs.map((s) => loaded.find((l) => l.slug === s)?.college).filter(Boolean) as CollegeDetail[];
  const sections = useMemo(() => buildCompareSections(colleges, diffOnly), [colleges, diffOnly]);
  const emptySlots = Math.max(0, COMPARE_MAX - colleges.length);

  const share = async () => {
    const url = window.location.href;
    const title = `Compare ${colleges.map((c) => shortName(c)).join(', ')}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast('Link copied. Paste it to share this comparison.');
    } catch {
      // Share sheet dismissed.
    }
  };

  if (loading) return <CompareSkeleton />;

  if (colleges.length === 0) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 5, md: 8 }, textAlign: 'center' }}>
        <Typography component="h1" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 800, mb: 1 }}>
          Compare colleges
        </Typography>
        <Typography color={tokens.inkMuted} sx={{ mb: 3 }}>
          Pick up to {COMPARE_MAX} colleges from the list with the Compare box, then come back here to see them side by side.
        </Typography>
        <Box component={Link} href={backHref} sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, px: 3, borderRadius: 1, bgcolor: tokens.navy900, color: tokens.paper, fontWeight: 700, textDecoration: 'none' }}>
          Browse colleges
        </Box>
      </Container>
    );
  }

  return (
    <Box sx={{ bgcolor: tokens.ground, pb: { xs: 2, md: 8 } }}>
      {/* Header band */}
      <Box sx={{ bgcolor: tokens.surface, borderBottom: '1px solid', borderColor: tokens.line }}>
        <Container maxWidth="xl" sx={{ px: { xs: 2, md: 4 }, py: { xs: 1.5, md: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <Breadcrumbs items={[{ name: 'Colleges', href: '/colleges' }, { name: 'Compare' }]} />
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px 32px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box component={Link} href={backHref} aria-label="Back to results" sx={{ display: { xs: 'flex', md: 'none' }, width: 44, height: 44, ml: -1.25, alignItems: 'center', justifyContent: 'center', color: tokens.ink, borderRadius: '50%' }}>
                <ArrowBackIcon aria-hidden />
              </Box>
              <Box>
                <Typography component="h1" sx={{ m: 0, fontSize: { xs: '1.25rem', md: '2rem' }, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
                  Compare colleges
                </Typography>
                <Typography sx={{ m: 0, mt: 0.5, fontSize: { xs: '0.82rem', md: '0.95rem' }, color: tokens.inkMuted }}>
                  Comparing {colleges.length} {colleges.length === 1 ? 'college' : 'colleges'}. You can add up to {COMPARE_MAX}.
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25, '@media print': { display: 'none' } }}>
              {/* Phones get the toggle in the sticky compare header instead. */}
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <DiffToggle on={diffOnly} onChange={setDiffOnly} />
              </Box>
              <ToolButton onClick={() => window.print()} icon={<FileDownloadOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />} label="Download PDF" hideLabelOnPhone />
              <ToolButton onClick={share} icon={<ShareOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />} label="Share comparison" primary hideLabelOnPhone />
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ px: { xs: 0, md: 4 }, pt: { xs: 0, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box component={Link} href={backHref} sx={{ display: { xs: 'none', md: 'inline-flex' }, alignSelf: 'flex-start', alignItems: 'center', gap: 0.75, minHeight: 44, fontSize: '0.9rem', fontWeight: 600, color: tokens.navy900, textDecoration: 'none' }}>
          <ArrowBackIcon aria-hidden sx={{ fontSize: 18 }} />
          Back to results
        </Box>

        {colleges.length < 2 && (
          <Box role="status" sx={{ mx: { xs: 2, md: 0 }, mt: { xs: 2, md: 0 }, p: 1.75, borderRadius: 1, bgcolor: tokens.goldTintBg, color: tokens.ink, fontSize: '0.9rem' }}>
            Add at least two colleges to compare. Use Add a college below, or pick from the list.
          </Box>
        )}

        <DesktopTable colleges={colleges} sections={sections} emptySlots={emptySlots} onRemove={removeSlug} onAdd={addSlug} exclude={slugs} />
        <PhoneCompare colleges={colleges} sections={sections} onRemove={removeSlug} onAdd={addSlug} exclude={slugs} diffOnly={diffOnly} onDiff={setDiffOnly} canAdd={emptySlots > 0} />

        <Typography sx={{ m: 0, px: { xs: 2, md: 0 }, fontSize: '0.82rem', color: tokens.inkMuted, lineHeight: 1.5 }}>
          Fees are tuition only, as published by each college. The 5-year fee is the annual fee times 5. Hostel, exam and material costs are extra.
        </Typography>
      </Container>

      <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}

function DiffToggle({ on, onChange, short }: { on: boolean; onChange: (v: boolean) => void; short?: boolean }) {
  return (
    <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, height: 44, px: 1.75, border: '1px solid', borderColor: tokens.lineStrong, borderRadius: 1, bgcolor: tokens.surface, fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', '&:focus-within': { outline: tokens.focusOutline, outlineOffset: 2 } }}>
      <Box component="input" type="checkbox" checked={on} onChange={() => onChange(!on)} sx={{ width: 18, height: 18, m: 0, accentColor: tokens.navy900 }} />
      {short ? 'Only differences' : 'Show differences only'}
    </Box>
  );
}

function ToolButton({ onClick, icon, label, primary, hideLabelOnPhone }: { onClick: () => void; icon: React.ReactNode; label: string; primary?: boolean; hideLabelOnPhone?: boolean }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={label}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        height: 44,
        minWidth: 44,
        px: { xs: hideLabelOnPhone ? 1.25 : 1.75, md: 1.75 },
        border: primary ? 0 : '1px solid',
        borderColor: tokens.lineStrong,
        borderRadius: 1,
        bgcolor: primary ? tokens.navy900 : tokens.surface,
        color: primary ? tokens.paper : tokens.ink,
        font: 'inherit',
        fontSize: '0.88rem',
        fontWeight: 600,
        cursor: 'pointer',
        justifyContent: 'center',
        '&:hover': { bgcolor: primary ? tokens.navy900 : tokens.surfaceHover },
        '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 },
      }}
    >
      {icon}
      <Box component="span" sx={{ display: { xs: hideLabelOnPhone ? 'none' : 'inline', md: 'inline' } }}>
        {label}
      </Box>
    </Box>
  );
}

/** Search box that adds a college (empty compare slot). */
function AddCollege({ id, exclude, onAdd, compact }: { id: string; exclude: string[]; onAdd: (c: ListingCollege) => void; compact?: boolean }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ListingCollege[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      setBusy(true);
      fetch(`/api/colleges/browse?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j: { data: ListingCollege[] }) => setResults((j.data ?? []).filter((c) => !exclude.includes(c.slug)).slice(0, 6)))
        .catch(() => undefined)
        .finally(() => setBusy(false));
    }, 300);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [q, exclude]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%', minWidth: 0, textAlign: 'left' }}>
      <Box component="label" htmlFor={id} sx={{ fontSize: '0.9rem', fontWeight: 700, display: compact ? 'none' : 'block' }}>
        Add a college
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 44, px: 1.25, boxSizing: 'border-box', border: '1px solid', borderColor: tokens.lineStrong, borderRadius: 1, bgcolor: tokens.surface, color: tokens.inkMuted, '&:focus-within': { outline: tokens.focusOutline, outlineOffset: 2 } }}>
        <SearchIcon aria-hidden sx={{ fontSize: 18 }} />
        <Box
          component="input"
          id={id}
          type="search"
          value={q}
          aria-label={compact ? 'Add a college' : undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
          placeholder="Search by name"
          size={1}
          sx={{ flex: '1 1 auto', minWidth: 0, width: '100%', border: 0, outline: 'none', font: 'inherit', fontSize: '1rem', color: tokens.ink, bgcolor: 'transparent' }}
        />
      </Box>
      {busy && <Skeleton variant="rounded" height={44} />}
      {!busy && results.length > 0 && (
        <Box component="ul" aria-label="Matching colleges" sx={{ listStyle: 'none', m: 0, p: 0, border: '1px solid', borderColor: tokens.line, borderRadius: 1, overflow: 'hidden', bgcolor: tokens.surface }}>
          {results.map((c) => (
            <li key={c.slug}>
              <Box
                component="button"
                type="button"
                onClick={() => {
                  onAdd(c);
                  setQ('');
                }}
                sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25, minHeight: 48, px: 1.5, py: 1, border: 0, borderTop: '1px solid', borderColor: tokens.line, bgcolor: 'transparent', font: 'inherit', textAlign: 'left', cursor: 'pointer', '&:hover': { bgcolor: tokens.surfaceHover }, '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: -2 } }}
              >
                <Box component="span" sx={{ fontSize: '0.88rem', fontWeight: 600, color: tokens.ink }}>{c.name}</Box>
                <Box component="span" sx={{ fontSize: '0.78rem', color: tokens.inkMuted }}>{c.city}, {c.state}</Box>
              </Box>
            </li>
          ))}
        </Box>
      )}
      {!busy && q.trim().length >= 2 && results.length === 0 && (
        <Typography sx={{ m: 0, fontSize: '0.82rem', color: tokens.inkMuted }}>No college named &ldquo;{q.trim()}&rdquo;.</Typography>
      )}
    </Box>
  );
}

function BestTag({ tag, small }: { tag: string; small?: boolean }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, height: small ? 18 : 22, px: small ? 0 : 1, borderRadius: 1, bgcolor: small ? 'transparent' : tokens.surface, boxShadow: small ? 'none' : `inset 0 0 0 1px ${tokens.success}`, color: tokens.success, fontSize: small ? '0.68rem' : '0.74rem', fontWeight: 700 }}>
      <CheckIcon aria-hidden sx={{ fontSize: small ? 12 : 13 }} />
      {tag}
    </Box>
  );
}

interface TableProps {
  colleges: CollegeDetail[];
  sections: CompareSection[];
  emptySlots: number;
  onRemove: (slug: string) => void;
  onAdd: (c: ListingCollege) => void;
  exclude: string[];
}

function DesktopTable({ colleges, sections, emptySlots, onRemove, onAdd, exclude }: TableProps) {
  const cols = colleges.length + emptySlots;
  const template = `${LABEL_COL}px repeat(${cols}, minmax(0, 1fr))`;
  const cell = { px: 2.5, py: 1.75, borderBottom: '1px solid', borderRight: '1px solid', borderColor: tokens.line } as const;
  return (
    <Box sx={{ display: { xs: 'none', md: 'block' }, bgcolor: tokens.surface, border: '1px solid', borderColor: tokens.line, borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Box role="table" aria-label="College comparison" sx={{ minWidth: LABEL_COL + cols * 220 }}>
          <Box role="rowgroup">
            <Box role="row" sx={{ display: 'grid', gridTemplateColumns: template, position: 'sticky', top: 0, zIndex: 1, bgcolor: tokens.surface, borderBottom: '1px solid', borderColor: tokens.line }}>
              <Box role="columnheader" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 1, borderRight: '1px solid', borderColor: tokens.line }}>
                <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.inkMuted }}>Comparing</Box>
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.82rem', color: tokens.inkMuted }}>
                  <BestTag tag="Best" /> best value in each row
                </Box>
              </Box>
              {colleges.map((c) => (
                <Box role="columnheader" key={c.slug} sx={{ position: 'relative', p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.25, borderRight: '1px solid', borderColor: tokens.line }}>
                  <Box
                    component="button"
                    type="button"
                    aria-label={`Remove ${shortName(c)}`}
                    onClick={() => onRemove(c.slug)}
                    sx={{ position: 'absolute', top: 8, right: 8, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 1, bgcolor: 'transparent', color: tokens.inkMuted, cursor: 'pointer', '&:hover': { bgcolor: tokens.surfaceHover }, '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 }, '@media print': { display: 'none' } }}
                  >
                    <CloseIcon aria-hidden sx={{ fontSize: 18 }} />
                  </Box>
                  <CollegeLogo name={c.name} logoUrl={c.logo_url} size={48} />
                  <Typography component="h2" sx={{ m: 0, pr: 4, fontSize: '1.02rem', lineHeight: 1.3, fontWeight: 700, minHeight: '2.6em' }}>{c.name}</Typography>
                  <Typography sx={{ m: 0, fontSize: '0.84rem', color: tokens.inkMuted }}>{c.city} · {typeLabel(c.type)}</Typography>
                  <Box component={Link} href={collegeHref(c)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, mt: 0.5, border: '1px solid', borderColor: tokens.navy900, borderRadius: 1, fontSize: '0.88rem', fontWeight: 600, color: tokens.navy900, textDecoration: 'none', '@media print': { display: 'none' } }}>
                    View details
                  </Box>
                </Box>
              ))}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <Box role="columnheader" key={`slot-${i}`} sx={{ p: 2.5, display: 'flex', borderRight: '1px solid', borderColor: tokens.line, '@media print': { display: 'none' } }}>
                  <Box sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', textAlign: 'center', gap: 1.25, p: 2, border: '1.5px dashed', borderColor: tokens.lineStrong, borderRadius: 1, bgcolor: tokens.ground }}>
                    <Box aria-hidden sx={{ alignSelf: 'center', width: 40, height: 40, borderRadius: '50%', bgcolor: tokens.surfaceHover, color: tokens.navy900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AddIcon />
                    </Box>
                    {i === 0 ? <AddCollege id={`add-desktop-${i}`} exclude={exclude} onAdd={onAdd} /> : <Typography sx={{ fontSize: '0.84rem', color: tokens.inkMuted }}>Add a college</Typography>}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
          {sections.map((sec) => (
            <Box role="rowgroup" key={sec.id} aria-labelledby={`sec-${sec.id}`}>
              <Box role="row" sx={{ display: 'grid', gridTemplateColumns: '1fr' }}>
                <Typography id={`sec-${sec.id}`} role="rowheader" component="h3" sx={{ m: 0, px: 2.5, py: 1.75, bgcolor: tokens.surfaceHover, borderBottom: '1px solid', borderColor: tokens.line, fontSize: '0.9rem', fontWeight: 700 }}>
                  {sec.title}
                </Typography>
              </Box>
              {sec.rows.map((row) => (
                <Box role="row" key={row.key} sx={{ display: 'grid', gridTemplateColumns: template }}>
                  <Box role="rowheader" sx={{ ...cell, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    <Box component="span" sx={{ fontSize: '0.9rem', fontWeight: 600, color: tokens.ink }}>{row.label}</Box>
                    {row.hint && <Box component="span" sx={{ fontSize: '0.78rem', color: tokens.inkMuted }}>{row.hint}</Box>}
                    {row.same && <Box component="span" sx={{ fontSize: '0.78rem', color: tokens.inkMuted }}>Same for all</Box>}
                  </Box>
                  {row.cells.map((cl, i) => (
                    <Box role="cell" key={i} sx={{ ...cell, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', bgcolor: 'transparent', boxShadow: cl.best ? `inset 3px 0 0 ${tokens.success}` : 'none' }}>
                      <Box component="span" sx={{ fontSize: '0.95rem', fontWeight: cl.best ? 700 : cl.missing ? 400 : 500, color: cl.missing ? tokens.inkMuted : tokens.ink, fontVariantNumeric: 'tabular-nums' }}>{cl.value}</Box>
                      {cl.best && row.bestTag && <BestTag tag={row.bestTag} />}
                    </Box>
                  ))}
                  {Array.from({ length: emptySlots }).map((_, i) => (
                    <Box role="cell" key={`e-${i}`} sx={{ ...cell, bgcolor: tokens.ground }} />
                  ))}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function PhoneCompare({
  colleges,
  sections,
  onRemove,
  onAdd,
  exclude,
  diffOnly,
  onDiff,
  canAdd,
}: Omit<TableProps, 'emptySlots'> & { diffOnly: boolean; onDiff: (v: boolean) => void; canAdd: boolean }) {
  const [adding, setAdding] = useState(false);
  const grid = `repeat(${Math.max(colleges.length, 1)}, minmax(0, 1fr))`;
  return (
    <Box sx={{ display: { xs: 'block', md: 'none' }, bgcolor: tokens.surface }}>
      <Box sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: tokens.surface, borderBottom: '1px solid', borderColor: tokens.line, boxShadow: `0 4px 12px ${alpha(tokens.navy900, 0.06)}` }}>
        <Box component="ul" aria-label="Colleges being compared" sx={{ listStyle: 'none', m: 0, px: 1.5, pt: 1.25, pb: 1, display: 'grid', gridTemplateColumns: grid, gap: 0.75 }}>
          {colleges.map((c) => (
            <Box component="li" key={c.slug} sx={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, pt: 1, pb: 0.75, px: 0.5, borderRadius: 1, bgcolor: tokens.surfaceHover, textAlign: 'center', minWidth: 0 }}>
              <Box
                component="button"
                type="button"
                aria-label={`Remove ${shortName(c)}`}
                onClick={() => onRemove(c.slug)}
                sx={{ position: 'absolute', top: -2, right: -2, width: 44, height: 44, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', p: 0.75, border: 0, bgcolor: 'transparent', color: tokens.inkMuted, cursor: 'pointer' }}
              >
                <CloseIcon aria-hidden sx={{ fontSize: 16 }} />
              </Box>
              <CollegeLogo name={c.name} logoUrl={c.logo_url} size={38} radius={1.25} />
              <Box component={Link} href={collegeHref(c)} sx={{ fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.25, color: tokens.ink, textDecoration: 'none', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.5em', wordBreak: 'break-word' }}>
                {shortName(c)}
              </Box>
              <Box component="span" sx={{ fontSize: '0.7rem', color: tokens.inkMuted }}>{c.city}</Box>
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1.5, pr: 1.5, pb: 1 }}>
          <Box component="nav" aria-label="Jump to section" sx={{ flex: '1 1 auto', minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', gap: 0.75, whiteSpace: 'nowrap' }}>
              {sections.map((s) => (
                <li key={s.id}>
                  <Box component="a" href={`#m-sec-${s.id}`} sx={{ display: 'flex', alignItems: 'center', height: 36, px: 1.5, borderRadius: `${tokens.radiusPill}px`, border: '1px solid', borderColor: tokens.lineStrong, color: tokens.inkMuted, textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600 }}>
                    {s.title}
                  </Box>
                </li>
              ))}
            </Box>
          </Box>
          {canAdd && (
            <Box
              component="button"
              type="button"
              aria-expanded={adding}
              onClick={() => setAdding((v) => !v)}
              sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 0.5, height: 36, px: 1.5, border: 0, borderRadius: `${tokens.radiusPill}px`, bgcolor: tokens.surfaceHover, color: tokens.navy900, font: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
            >
              <AddIcon aria-hidden sx={{ fontSize: 16 }} />
              Add
            </Box>
          )}
        </Box>
        <Box sx={{ px: 1.5, pb: 1.25 }}>
          <Box component="label" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minHeight: 40, fontSize: '0.84rem', fontWeight: 600 }}>
            Only differences
            <Box component="input" type="checkbox" role="switch" checked={diffOnly} onChange={() => onDiff(!diffOnly)} sx={{ width: 20, height: 20, m: 0, accentColor: tokens.navy900 }} />
          </Box>
        </Box>
        {adding && canAdd && (
          <Box sx={{ px: 1.5, pb: 1.5 }}>
            <AddCollege id="add-phone" exclude={exclude} onAdd={(c) => { onAdd(c); setAdding(false); }} compact />
          </Box>
        )}
      </Box>

      {sections.map((sec) => (
        <Box component="section" key={sec.id} id={`m-sec-${sec.id}`} aria-labelledby={`m-h-${sec.id}`} sx={{ scrollMarginTop: 200 }}>
          <Typography id={`m-h-${sec.id}`} component="h2" sx={{ m: 0, px: 2, pt: 1.75, pb: 0.75, bgcolor: tokens.surfaceHover, fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: tokens.inkMuted }}>
            {sec.title}
          </Typography>
          {sec.rows.map((row) => (
            <Box key={row.key} sx={{ px: 1.5, pt: 1.25, pb: 1.5, borderBottom: '1px solid', borderColor: tokens.line }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 0.5, pb: 0.75 }}>
                <Box component="span" sx={{ fontSize: '0.8rem', fontWeight: 600, color: tokens.inkMuted }}>{row.label}</Box>
                {row.same && <Box component="span" sx={{ fontSize: '0.7rem', color: tokens.inkMuted, px: 0.75, py: 0.25, borderRadius: 1, bgcolor: tokens.surfaceHover }}>Same for all</Box>}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: grid, gap: 0.75 }}>
                {row.cells.map((cl, i) => (
                  <Box key={i} lang="en" sx={{ display: 'flex', flexDirection: 'column', gap: 0.375, minHeight: 40, px: 0.75, py: 0.875, boxSizing: 'border-box', borderRadius: 1, bgcolor: cl.best ? tokens.surface : tokens.ground, boxShadow: cl.best ? `inset 0 0 0 1px ${tokens.success}` : 'none', minWidth: 0 }}>
                    <Box component="span" sx={{ fontSize: '0.8rem', fontWeight: cl.best ? 700 : cl.missing ? 400 : 600, lineHeight: 1.3, color: cl.missing ? tokens.inkMuted : tokens.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'pre-line', overflowWrap: 'break-word', hyphens: 'auto' }}>{cl.value.replace(', ', '\n')}</Box>
                    {cl.best && row.bestTag && <BestTag tag={row.bestTag} small />}
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

function CompareSkeleton() {
  return (
    <Container maxWidth="xl" sx={{ px: { xs: 2, md: 4 }, py: { xs: 2, md: 4 } }} aria-busy="true" aria-label="Loading comparison">
      <Skeleton variant="text" width={260} height={48} />
      <Skeleton variant="text" width={320} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', md: `${LABEL_COL}px repeat(4, 1fr)` }, gap: 1.5, mt: 3 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={160} sx={{ display: { xs: i > 2 ? 'none' : 'block', md: 'block' } }} />
        ))}
      </Box>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={52} sx={{ mt: 1 }} />
      ))}
    </Container>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<CompareSkeleton />}>
      <CompareContent />
    </Suspense>
  );
}
