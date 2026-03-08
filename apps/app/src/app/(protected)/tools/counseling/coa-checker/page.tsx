// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  CircularProgress,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  Alert,
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
import SearchIcon from '@mui/icons-material/Search';
import VerifiedIcon from '@mui/icons-material/Verified';
import SchoolIcon from '@mui/icons-material/School';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import LanguageIcon from '@mui/icons-material/Language';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FilterListIcon from '@mui/icons-material/FilterList';
import { searchCoaColleges, getCOAColleges, getCOACities } from '@neram/database';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS = {
  active: {
    label: 'COA Approved (2025-26)',
    color: '#10B981',
    bg: '#ECFDF5',
    chipColor: 'success' as const,
    verdict: '✅ This college is COA approved for 2025-26',
    sub: 'Safe to apply. Approval is current and valid.',
  },
  expiring: {
    label: 'Approval Expiring',
    color: '#F59E0B',
    bg: '#FFFBEB',
    chipColor: 'warning' as const,
    verdict: '⚠️ COA approval was valid till 2024-25',
    sub: 'Verify renewal status directly with COA (ecoa.in) before applying.',
  },
  unknown: {
    label: 'Status Unknown',
    color: '#EF4444',
    bg: '#FEF2F2',
    chipColor: 'error' as const,
    verdict: '❓ COA approval status unclear',
    sub: 'This college may not be in the current approved list. Confirm at ecoa.in.',
  },
};

const COA_STATES = [
  'Andhra Pradesh','Assam','Bihar','Chandigarh','Chhattisgarh','Delhi','Goa',
  'Gujarat','Haryana','Himachal Pradesh','Jammu & Kashmir','Jharkhand',
  'Karnataka','Kerala','Madhya Pradesh','Maharashtra','Meghalaya','Mizoram',
  'Odisha','Puducherry','Punjab','Rajasthan','Tamil Nadu','Telangana',
  'UAE','Uttar Pradesh','Uttarakhand','West Bengal',
];

// ─── Result card ──────────────────────────────────────────────────────────────
function CollegeResultCard({ inst, expanded: defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const s = STATUS[inst.approval_status] ?? STATUS.unknown;

  return (
    <Card
      variant="outlined"
      sx={{ borderRadius: 2, borderLeft: `4px solid ${s.color}`, mb: 1.5 }}
    >
      <CardContent sx={{ pb: '12px !important' }}>
        {/* Verdict banner — only shown when defaultExpanded (search result) */}
        {defaultExpanded && (
          <Box
            sx={{
              bgcolor: s.bg,
              borderRadius: 1.5,
              px: 2,
              py: 1.25,
              mb: 1.5,
              border: `1px solid ${s.color}30`,
            }}
          >
            <Typography variant="body1" fontWeight={700} sx={{ color: s.color }}>
              {s.verdict}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {s.sub}
            </Typography>
          </Box>
        )}

        {/* College name + status chip */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.35 }}>
              {inst.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Code: {inst.institution_code}
            </Typography>
          </Box>
          <Chip
            label={s.label}
            color={s.chipColor}
            size="small"
            sx={{ fontWeight: 600, fontSize: 11, flexShrink: 0 }}
          />
        </Box>

        {/* Location */}
        {(inst.city || inst.state) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
            <LocationOnIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {[inst.city, inst.state].filter(Boolean).join(', ')}
              {inst.pincode ? ` — ${inst.pincode}` : ''}
            </Typography>
          </Box>
        )}

        {/* Quick chips */}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.75 }}>
          {inst.current_intake && (
            <Chip label={`${inst.current_intake} seats`} size="small" variant="outlined" sx={{ fontSize: 11 }} />
          )}
          {inst.commenced_year && (
            <Chip label={`Est. ${inst.commenced_year}`} size="small" variant="outlined" sx={{ fontSize: 11 }} />
          )}
          {inst.approval_period_raw && (
            <Chip label={inst.approval_period_raw} size="small" variant="outlined" sx={{ fontSize: 11 }} />
          )}
        </Box>

        {/* University */}
        {inst.affiliating_university && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Affiliated to: {inst.affiliating_university}
          </Typography>
        )}

        {/* Expand contact */}
        <Box
          sx={{ display: 'flex', alignItems: 'center', mt: 1, cursor: 'pointer', color: 'text.secondary' }}
          onClick={() => setExpanded(p => !p)}
        >
          <Typography variant="caption" sx={{ flex: 1 }}>
            {expanded ? 'Hide contact details' : 'Show contact details'}
          </Typography>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
        </Box>

        <Collapse in={expanded}>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {inst.head_of_dept && (
              <Typography variant="caption">Head: <strong>{inst.head_of_dept}</strong></Typography>
            )}
            {inst.phone && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PhoneIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Typography variant="caption" component="a" href={`tel:${inst.phone}`} sx={{ color: 'primary.main' }}>
                  {inst.phone}
                </Typography>
              </Box>
            )}
            {inst.mobile && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PhoneIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Typography variant="caption" component="a" href={`tel:${inst.mobile}`} sx={{ color: 'primary.main' }}>
                  {inst.mobile} (mobile)
                </Typography>
              </Box>
            )}
            {inst.email && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <EmailIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Typography variant="caption" component="a" href={`mailto:${inst.email}`} sx={{ color: 'primary.main' }}>
                  {inst.email}
                </Typography>
              </Box>
            )}
            {inst.website && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <LanguageIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Typography
                  variant="caption"
                  component="a"
                  href={inst.website.startsWith('http') ? inst.website : `https://${inst.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ color: 'primary.main', wordBreak: 'break-all' }}
                >
                  {inst.website}
                </Typography>
              </Box>
            )}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

// ─── Browse tab ───────────────────────────────────────────────────────────────
function BrowseTab() {
  const [colleges, setColleges] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filterState, setFilterState] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [cities, setCities] = useState([]);
  const [filterCity, setFilterCity] = useState('');
  const PAGE_SIZE = 20;

  const fetchColleges = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCOAColleges({
        state: filterState || undefined,
        city: filterCity || undefined,
        status: filterStatus || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setColleges(result.data);
      setTotal(result.total);
    } catch {
      setColleges([]);
    } finally {
      setLoading(false);
    }
  }, [filterState, filterCity, filterStatus, page]);

  useEffect(() => { fetchColleges(); }, [fetchColleges]);

  const handleStateChange = async (state) => {
    setFilterState(state);
    setFilterCity('');
    setPage(1);
    if (state) {
      try {
        const c = await getCOACities(state);
        setCities(c);
      } catch { setCities([]); }
    } else {
      setCities([]);
    }
  };

  return (
    <Box>
      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 140, flex: 1 }}>
          <InputLabel>State</InputLabel>
          <Select value={filterState} label="State" onChange={e => handleStateChange(e.target.value)}>
            <MenuItem value="">All States</MenuItem>
            {COA_STATES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        {cities.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 130, flex: 1 }}>
            <InputLabel>City</InputLabel>
            <Select value={filterCity} label="City" onChange={e => { setFilterCity(e.target.value); setPage(1); }}>
              <MenuItem value="">All Cities</MenuItem>
              {cities.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </Select>
          </FormControl>
        )}
        <FormControl size="small" sx={{ minWidth: 140, flex: 1 }}>
          <InputLabel>Approval</InputLabel>
          <Select value={filterStatus} label="Approval" onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="active">Approved (2025-26)</MenuItem>
            <MenuItem value="expiring">Expiring</MenuItem>
            <MenuItem value="unknown">Unknown</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {loading ? 'Loading...' : `${total} colleges found`}
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <>
          {colleges.map(inst => (
            <CollegeResultCard key={inst.id} inst={inst} />
          ))}
          {Math.ceil(total / PAGE_SIZE) > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination
                count={Math.ceil(total / PAGE_SIZE)}
                page={page}
                onChange={(_, p) => setPage(p)}
                size="small"
                color="primary"
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const handleSearch = useCallback(async (term) => {
    if (term.length < 2) { setResults([]); setSelected(null); return; }
    setLoading(true);
    try {
      const res = await searchCoaColleges(term, 8);
      setResults(res);
      setSelected(null);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const onInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setSelected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(val), 350);
  };

  return (
    <Box sx={{ maxWidth: 680, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Box
          sx={{
            width: isMobile ? 38 : 44,
            height: isMobile ? 38 : 44,
            borderRadius: 1.5,
            bgcolor: '#0277BD',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <VerifiedIcon sx={{ color: 'white', fontSize: isMobile ? 20 : 24 }} />
        </Box>
        <Box>
          <Typography variant={isMobile ? 'h6' : 'h5'} fontWeight={700} sx={{ lineHeight: 1.2 }}>
            COA Approval Checker
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Verify if a B.Arch college is approved by Council of Architecture
          </Typography>
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Check" icon={<SearchIcon sx={{ fontSize: 16 }} />} iconPosition="start" sx={{ minHeight: 40, fontSize: 13 }} />
        <Tab label="Browse" icon={<FilterListIcon sx={{ fontSize: 16 }} />} iconPosition="start" sx={{ minHeight: 40, fontSize: 13 }} />
      </Tabs>

      {/* ── Tab 0: Search & Verify ── */}
      {tab === 0 && (
        <Box>
          <TextField
            fullWidth
            placeholder="Search college name, city, or code..."
            value={query}
            onChange={onInputChange}
            autoFocus={!isMobile}
            size={isMobile ? 'medium' : 'small'}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  {loading ? <CircularProgress size={18} /> : <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />}
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />

          {/* Search result list (before selection) */}
          {results.length > 0 && !selected && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                {results.length} result{results.length !== 1 ? 's' : ''} — tap to view details
              </Typography>
              {results.map(inst => {
                const s = STATUS[inst.approval_status] ?? STATUS.unknown;
                return (
                  <Box
                    key={inst.id}
                    onClick={() => setSelected(inst)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 1.25,
                      mb: 0.75,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                      transition: 'background 0.15s',
                    }}
                  >
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: 1,
                        bgcolor: `${s.color}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <SchoolIcon sx={{ color: s.color, fontSize: 18 }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {inst.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {inst.city}, {inst.state}
                      </Typography>
                    </Box>
                    <Chip
                      label={s.label}
                      color={s.chipColor}
                      size="small"
                      sx={{ fontSize: 10, fontWeight: 600, flexShrink: 0 }}
                    />
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Full detail card after selection */}
          {selected && (
            <Box>
              <Box
                sx={{ display: 'flex', alignItems: 'center', mb: 1.5, cursor: 'pointer', color: 'text.secondary' }}
                onClick={() => setSelected(null)}
              >
                <Typography variant="caption">← Back to results</Typography>
              </Box>
              <CollegeResultCard inst={selected} expanded />
            </Box>
          )}

          {/* Empty state */}
          {!loading && query.length >= 2 && results.length === 0 && !selected && (
            <Alert severity="info" sx={{ fontSize: 13 }}>
              No colleges found for "{query}". Try a shorter name or city.
            </Alert>
          )}

          {query.length < 2 && !selected && (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              <VerifiedIcon sx={{ fontSize: 48, opacity: 0.15, mb: 1 }} />
              <Typography variant="body2">
                Type the college name to check its COA approval status
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                Data source: ecoa.in (363 colleges)
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* ── Tab 1: Browse all ── */}
      {tab === 1 && <BrowseTab />}
    </Box>
  );
}
