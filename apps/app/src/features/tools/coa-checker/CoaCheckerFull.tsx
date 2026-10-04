'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  CircularProgress,
  Chip,
  Collapse,
  Divider,
  Alert,
  Button,
  Skeleton,
  useTheme,
  useMediaQuery,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
} from '@neram/ui';
import { alpha, type Theme } from '@mui/material/styles';
import type { SvgIconComponent } from '@mui/icons-material';
import SearchIcon from '@mui/icons-material/Search';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LanguageIcon from '@mui/icons-material/Language';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { searchCoaColleges, getCOAColleges, getCOACities, type CoaInstitution } from '@neram/database';
import ToolPageHeader from '@/components/tools-hub/ToolPageHeader';
import { useToolOpened } from '@/hooks/useToolOpened';

// ─── Status config ────────────────────────────────────────────────────────────
type Tone = 'success' | 'warning' | 'error';

interface StatusConfig {
  label: string;
  tone: Tone;
  Icon: SvgIconComponent;
  verdict: string;
  sub: string;
}

const STATUS: Record<string, StatusConfig> = {
  active: {
    label: 'COA approved (2025-26)',
    tone: 'success',
    Icon: CheckCircleOutlineRoundedIcon,
    verdict: 'This college is COA approved for 2025-26',
    sub: 'Safe to apply. Approval is current and valid.',
  },
  expiring: {
    label: 'Approval expiring',
    tone: 'warning',
    Icon: WarningAmberRoundedIcon,
    verdict: 'COA approval was valid till 2024-25',
    sub: 'Check the renewal status with COA (ecoa.in) before you apply.',
  },
  unknown: {
    label: 'Status unknown',
    tone: 'error',
    Icon: HelpOutlineRoundedIcon,
    verdict: 'COA approval status is unclear',
    sub: 'This college may not be on the current approved list. Confirm at ecoa.in.',
  },
};

function statusOf(inst: CoaInstitution): StatusConfig {
  return STATUS[inst.approval_status] ?? STATUS.unknown;
}

const COA_STATES = [
  'Andhra Pradesh','Assam','Bihar','Chandigarh','Chhattisgarh','Delhi','Goa',
  'Gujarat','Haryana','Himachal Pradesh','Jammu & Kashmir','Jharkhand',
  'Karnataka','Kerala','Madhya Pradesh','Maharashtra','Meghalaya','Mizoram',
  'Odisha','Puducherry','Punjab','Rajasthan','Tamil Nadu','Telangana',
  'UAE','Uttar Pradesh','Uttarakhand','West Bengal',
];

const PAGE_SIZE = 20;

const tintBg = (tone: Tone, strength = 0.08) => (theme: Theme) =>
  alpha(theme.palette[tone].main, theme.palette.mode === 'light' ? strength : strength + 0.06);

/** Small non-interactive label, at least 12px */
function Tag({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        fontSize: '0.75rem',
        fontWeight: 600,
        lineHeight: 1.5,
        px: 0.875,
        py: 0.25,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        color: 'text.secondary',
      }}
    >
      {children}
    </Box>
  );
}

function ContactLink({ href, icon, children, external }: { href: string; icon: ReactNode; children: ReactNode; external?: boolean }) {
  return (
    <Box
      component="a"
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 44,
        px: 1,
        mx: -1,
        borderRadius: 1.5,
        color: 'primary.main',
        fontSize: '0.9375rem',
        textDecoration: 'none',
        overflowWrap: 'anywhere',
        '&:hover': { bgcolor: 'action.hover', textDecoration: 'underline' },
      }}
    >
      <Box aria-hidden="true" sx={{ display: 'flex', color: 'text.secondary' }}>
        {icon}
      </Box>
      {children}
    </Box>
  );
}

// ─── Result card ──────────────────────────────────────────────────────────────
function CollegeResultCard({ inst, showVerdict = false }: { inst: CoaInstitution; showVerdict?: boolean }) {
  const [expanded, setExpanded] = useState(showVerdict);
  const s = statusOf(inst);
  const contactId = `coa-contact-${inst.id}`;
  const hasContact = !!(inst.head_of_dept || inst.phone || inst.mobile || inst.email || inst.website);

  return (
    <Box
      component="article"
      sx={{
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        borderLeft: '4px solid',
        borderLeftColor: `${s.tone}.main`,
        bgcolor: 'background.paper',
        p: 2,
      }}
    >
      {/* Verdict banner, shown for a looked-up college */}
      {showVerdict && (
        <Box
          role="status"
          sx={(theme: Theme) => ({
            display: 'flex',
            gap: 1.25,
            alignItems: 'flex-start',
            bgcolor: tintBg(s.tone)(theme),
            border: '1px solid',
            borderColor: alpha(theme.palette[s.tone].main, 0.3),
            borderRadius: 2,
            px: 1.75,
            py: 1.5,
            mb: 1.75,
          })}
        >
          <s.Icon aria-hidden="true" sx={{ color: `${s.tone}.main`, fontSize: 26, flexShrink: 0, mt: '1px' }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: `${s.tone}.main`, lineHeight: 1.4 }}>{s.verdict}</Typography>
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.25 }}>{s.sub}</Typography>
          </Box>
        </Box>
      )}

      {/* College name + status */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h3" sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
            {inst.name}
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>Code {inst.institution_code}</Typography>
        </Box>
        <Chip
          icon={<s.Icon aria-hidden="true" />}
          label={s.label}
          color={s.tone}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 600, fontSize: '0.75rem', flexShrink: 0 }}
        />
      </Box>

      {/* Location */}
      {(inst.city || inst.state) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
          <LocationOnOutlinedIcon aria-hidden="true" sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
            {[inst.city, inst.state].filter(Boolean).join(', ')}
            {inst.pincode ? ` ${inst.pincode}` : ''}
          </Typography>
        </Box>
      )}

      {/* Quick facts */}
      {(inst.current_intake || inst.commenced_year || inst.approval_period_raw) && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
          {inst.current_intake ? <Tag>{inst.current_intake} seats</Tag> : null}
          {inst.commenced_year ? <Tag>Since {inst.commenced_year}</Tag> : null}
          {inst.approval_period_raw ? <Tag>{inst.approval_period_raw}</Tag> : null}
        </Box>
      )}

      {inst.affiliating_university && (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 1 }}>
          Affiliated to {inst.affiliating_university}
        </Typography>
      )}

      {hasContact && (
        <>
          <Button
            variant="text"
            onClick={() => setExpanded((p) => !p)}
            aria-expanded={expanded}
            aria-controls={contactId}
            endIcon={
              <ExpandMoreIcon
                sx={{
                  transform: expanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                }}
              />
            }
            sx={{ mt: 1, minHeight: 44, px: 1, ml: -1, fontWeight: 600 }}
          >
            {expanded ? 'Hide contact details' : 'Show contact details'}
          </Button>

          <Collapse in={expanded} id={contactId}>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {inst.head_of_dept && (
                <Typography sx={{ fontSize: '0.9375rem', py: 0.75 }}>
                  Head of department: <strong>{inst.head_of_dept}</strong>
                </Typography>
              )}
              {inst.phone && (
                <ContactLink href={`tel:${inst.phone}`} icon={<PhoneOutlinedIcon sx={{ fontSize: 18 }} />}>
                  {inst.phone}
                </ContactLink>
              )}
              {inst.mobile && (
                <ContactLink href={`tel:${inst.mobile}`} icon={<PhoneOutlinedIcon sx={{ fontSize: 18 }} />}>
                  {inst.mobile} (mobile)
                </ContactLink>
              )}
              {inst.email && (
                <ContactLink href={`mailto:${inst.email}`} icon={<EmailOutlinedIcon sx={{ fontSize: 18 }} />}>
                  {inst.email}
                </ContactLink>
              )}
              {inst.website && (
                <ContactLink
                  href={inst.website.startsWith('http') ? inst.website : `https://${inst.website}`}
                  icon={<LanguageIcon sx={{ fontSize: 18 }} />}
                  external
                >
                  {inst.website}
                </ContactLink>
              )}
            </Box>
          </Collapse>
        </>
      )}
    </Box>
  );
}

function CardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <Box aria-hidden="true" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={132} sx={{ borderRadius: 3 }} />
      ))}
    </Box>
  );
}

function ErrorWithRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert
      severity="error"
      sx={{ alignItems: 'center', mb: 2 }}
      action={
        <Button color="inherit" onClick={onRetry} sx={{ minHeight: 44, fontWeight: 700 }}>
          Retry
        </Button>
      }
    >
      {message}
    </Alert>
  );
}

// ─── Browse tab ───────────────────────────────────────────────────────────────
function BrowseTab() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [colleges, setColleges] = useState<CoaInstitution[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(1);
  const [filterState, setFilterState] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [filterCity, setFilterCity] = useState('');
  const listTopRef = useRef<HTMLDivElement>(null);

  // Only the latest filter/page combination may write results. The cleanup marks
  // an older request stale, so a slow response can never replace a newer one.
  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError(false);
    getCOAColleges({
      state: filterState || undefined,
      city: filterCity || undefined,
      status: filterStatus || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (stale) return;
        setColleges(result.data);
        setTotal(result.total);
      })
      .catch(() => {
        if (stale) return;
        setColleges([]);
        setTotal(0);
        setError(true);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [filterState, filterCity, filterStatus, page, reload]);

  // Cities for the chosen state, with the same stale guard
  useEffect(() => {
    if (!filterState) {
      setCities([]);
      return;
    }
    let stale = false;
    setCities([]);
    getCOACities(filterState)
      .then((c) => {
        if (!stale) setCities(c);
      })
      .catch(() => {
        if (!stale) setCities([]);
      });
    return () => {
      stale = true;
    };
  }, [filterState]);

  const handleStateChange = (state: string) => {
    setFilterState(state);
    setFilterCity('');
    setPage(1);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    listTopRef.current?.scrollIntoView({ block: 'start' });
  };

  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <Box>
      {/* Filters */}
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(180px, 1fr))' }, mb: 2 }}>
        <FormControl fullWidth>
          <InputLabel id="coa-state-label">State</InputLabel>
          <Select labelId="coa-state-label" value={filterState} label="State" onChange={(e) => handleStateChange(String(e.target.value))}>
            <MenuItem value="" sx={{ minHeight: 48 }}>All states</MenuItem>
            {COA_STATES.map((s) => (
              <MenuItem key={s} value={s} sx={{ minHeight: 48 }}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {cities.length > 0 && (
          <FormControl fullWidth>
            <InputLabel id="coa-city-label">City</InputLabel>
            <Select
              labelId="coa-city-label"
              value={filterCity}
              label="City"
              onChange={(e) => {
                setFilterCity(String(e.target.value));
                setPage(1);
              }}
            >
              <MenuItem value="" sx={{ minHeight: 48 }}>All cities</MenuItem>
              {cities.map((c) => (
                <MenuItem key={c} value={c} sx={{ minHeight: 48 }}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <FormControl fullWidth>
          <InputLabel id="coa-status-label">Approval</InputLabel>
          <Select
            labelId="coa-status-label"
            value={filterStatus}
            label="Approval"
            onChange={(e) => {
              setFilterStatus(String(e.target.value));
              setPage(1);
            }}
          >
            <MenuItem value="" sx={{ minHeight: 48 }}>All</MenuItem>
            <MenuItem value="active" sx={{ minHeight: 48 }}>Approved (2025-26)</MenuItem>
            <MenuItem value="expiring" sx={{ minHeight: 48 }}>Expiring</MenuItem>
            <MenuItem value="unknown" sx={{ minHeight: 48 }}>Unknown</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Box ref={listTopRef} sx={{ scrollMarginTop: 80 }} />
      <Typography role="status" aria-live="polite" sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 1.25 }}>
        {loading ? 'Loading colleges' : error ? '' : `${total} ${total === 1 ? 'college' : 'colleges'} found`}
      </Typography>

      {error && !loading ? (
        <ErrorWithRetry message="We could not load the college list. Check your connection and try again." onRetry={() => setReload((n) => n + 1)} />
      ) : loading ? (
        <CardSkeletons />
      ) : colleges.length === 0 ? (
        <Alert severity="info">No colleges match these filters. Try a different state or approval status.</Alert>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {colleges.map((inst) => (
              <CollegeResultCard key={inst.id} inst={inst} />
            ))}
          </Box>
          {pageCount > 1 && (
            <Box component="nav" aria-label="College list pages" sx={{ display: 'flex', justifyContent: 'center', mt: 2.5 }}>
              <Pagination
                count={pageCount}
                page={page}
                onChange={(_, p) => handlePageChange(p)}
                color="primary"
                siblingCount={isMobile ? 0 : 1}
                boundaryCount={1}
                sx={{
                  '& .MuiPaginationItem-root': { minWidth: 44, height: 44, mx: 0.25, fontSize: '0.9375rem', borderRadius: 2 },
                }}
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function COACheckerPage() {
  useToolOpened('coa_checker');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CoaInstitution[]>([]);
  /** The term the current results (or error) belong to */
  const [searchedTerm, setSearchedTerm] = useState('');
  const [searchError, setSearchError] = useState(false);
  const [selected, setSelected] = useState<CoaInstitution | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  // Clear a pending debounce when the page unmounts
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requestRef.current += 1;
    },
    [],
  );

  const handleSearch = useCallback(async (term: string) => {
    const id = ++requestRef.current;
    if (term.length < 2) {
      setResults([]);
      setSearchedTerm('');
      setSearchError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSearchError(false);
    try {
      const res = await searchCoaColleges(term, 8);
      if (id !== requestRef.current) return; // a newer search has started
      setResults(res);
      setSearchedTerm(term);
    } catch {
      if (id !== requestRef.current) return;
      setResults([]);
      setSearchedTerm(term);
      setSearchError(true);
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  }, []);

  const onInputChange = (val: string) => {
    setQuery(val);
    setSelected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(val.trim()), 350);
  };

  const trimmed = query.trim();
  const resultsAreCurrent = searchedTerm === trimmed && !loading;

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <ToolPageHeader toolId="counseling-coa-checker" />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        aria-label="Check one college or browse all"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', minHeight: 48 }}
      >
        <Tab
          id="coa-tab-check"
          aria-controls="coa-panel-check"
          label="Check a college"
          icon={<SearchIcon sx={{ fontSize: 20 }} />}
          iconPosition="start"
          sx={{ minHeight: 48, fontSize: '0.9375rem', fontWeight: 600, textTransform: 'none' }}
        />
        <Tab
          id="coa-tab-browse"
          aria-controls="coa-panel-browse"
          label="Browse all"
          icon={<FilterListIcon sx={{ fontSize: 20 }} />}
          iconPosition="start"
          sx={{ minHeight: 48, fontSize: '0.9375rem', fontWeight: 600, textTransform: 'none' }}
        />
      </Tabs>

      {/* ── Tab 0: Search & verify ── */}
      {tab === 0 && (
        <Box role="tabpanel" id="coa-panel-check" aria-labelledby="coa-tab-check">
          <TextField
            fullWidth
            type="search"
            placeholder="College name, city or code"
            value={query}
            onChange={(e) => onInputChange(e.target.value)}
            autoFocus={!isMobile}
            inputProps={{ 'aria-label': 'Search COA colleges', enterKeyHint: 'search', autoComplete: 'off' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  {loading ? (
                    <CircularProgress size={20} aria-label="Searching" />
                  ) : (
                    <SearchIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
                  )}
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { minHeight: 48 } }}
          />

          {/* Error, never shown as "not found" */}
          {searchError && resultsAreCurrent && !selected && (
            <ErrorWithRetry
              message="We could not search right now. This does not mean the college is unapproved."
              onRetry={() => handleSearch(trimmed)}
            />
          )}

          {/* Search results (before a pick) */}
          {results.length > 0 && !selected && !searchError && (
            <Box sx={{ mb: 1 }}>
              <Typography role="status" sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 1 }}>
                {results.length} {results.length === 1 ? 'result' : 'results'}. Tap one to see its approval status.
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {results.map((inst) => {
                  const s = statusOf(inst);
                  return (
                    <li key={inst.id}>
                      <Box
                        component="button"
                        type="button"
                        onClick={() => setSelected(inst)}
                        sx={{
                          width: '100%',
                          minHeight: 64,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.25,
                          px: 1.5,
                          py: 1.25,
                          borderRadius: 2.5,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'background.paper',
                          color: 'text.primary',
                          font: 'inherit',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'border-color 0.15s ease, background-color 0.15s ease',
                          '&:hover': { borderColor: 'primary.main' },
                          '&:active': { bgcolor: 'action.hover' },
                        }}
                      >
                        <Box
                          aria-hidden="true"
                          sx={(t: Theme) => ({
                            width: 40,
                            height: 40,
                            borderRadius: 2,
                            bgcolor: tintBg(s.tone, 0.1)(t),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          })}
                        >
                          <SchoolOutlinedIcon sx={{ color: `${s.tone}.main`, fontSize: 22 }} />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                            {inst.name}
                          </Typography>
                          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                            {[inst.city, inst.state].filter(Boolean).join(', ')}
                          </Typography>
                          <Box
                            component="span"
                            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.25, fontSize: '0.8125rem', fontWeight: 600, color: `${s.tone}.main` }}
                          >
                            <s.Icon aria-hidden="true" sx={{ fontSize: 16 }} />
                            {s.label}
                          </Box>
                        </Box>
                        <ChevronRightRoundedIcon aria-hidden="true" sx={{ color: 'text.secondary', flexShrink: 0 }} />
                      </Box>
                    </li>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Full detail card after a pick */}
          {selected && (
            <Box>
              <Button
                variant="text"
                startIcon={<ArrowBackRoundedIcon />}
                onClick={() => setSelected(null)}
                sx={{ minHeight: 44, mb: 1, ml: -1, px: 1, fontWeight: 600 }}
              >
                Back to results
              </Button>
              <CollegeResultCard key={selected.id} inst={selected} showVerdict />
            </Box>
          )}

          {/* Empty state: only once the search for this exact text has finished */}
          {resultsAreCurrent && !searchError && trimmed.length >= 2 && results.length === 0 && !selected && (
            <Alert severity="info">
              No colleges found for &quot;{trimmed}&quot;. Try a shorter name or the city. If a college is missing from the
              COA list, confirm at ecoa.in before you apply.
            </Alert>
          )}

          {trimmed.length < 2 && !selected && (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              <VerifiedOutlinedIcon aria-hidden="true" sx={{ fontSize: 48, opacity: 0.35, mb: 1 }} />
              <Typography sx={{ fontSize: '0.9375rem' }}>Type a college name to check its COA approval status</Typography>
              <Typography sx={{ fontSize: '0.8125rem', display: 'block', mt: 0.5 }}>Data source: ecoa.in (363 colleges)</Typography>
            </Box>
          )}
        </Box>
      )}

      {/* ── Tab 1: Browse all ── */}
      {tab === 1 && (
        <Box role="tabpanel" id="coa-panel-browse" aria-labelledby="coa-tab-browse">
          <BrowseTab />
        </Box>
      )}
    </Box>
  );
}
