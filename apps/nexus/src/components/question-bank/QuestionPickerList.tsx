'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Drawer,
  MenuItem,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import QBSearchStatus, { type QBMatchKind } from '@/components/question-bank/QBSearchStatus';
import TagPicker from '@/components/question-bank/TagPicker';
import { paperTitles } from '@neram/database';
import type { NexusQBQuestionListItem } from '@neram/database';

const PAGE_SIZE = 20;
/** Below this many answers a "% right" is noise, so the chip stays hidden. */
const MIN_ANSWERS_FOR_ACCURACY = 5;

/** A past paper sitting, as the Paper filter lists it. */
export interface PickerPaper {
  id: string;
  exam_type: string;
  year: number;
  session: string | null;
  shift: string | null;
  total_questions: number | null;
}

type ExamFilter = '' | 'JEE' | 'NATA';
type SourceFilter = '' | 'past' | 'class' | 'study';

/**
 * Where a question came from, in the words a teacher uses.
 *
 * Maps onto `origin`: every question parsed from an exam paper (or recalled
 * from one) is a past paper question; class recap and catch-up checkpoints and
 * anything typed in Nexus are "authored"; study material uploads are
 * "imported". Past papers used to be a separate door in the test wizard even
 * though they were always in this same bank.
 */
const SOURCE_ORIGINS: Record<Exclude<SourceFilter, ''>, string> = {
  past: 'pyq,student_recalled',
  class: 'authored',
  study: 'imported',
};
const SOURCE_LABELS: Record<Exclude<SourceFilter, ''>, string> = {
  past: 'Past papers',
  class: 'Class and teacher made',
  study: 'Study material',
};

interface TagSuggestion {
  tag: { id: string; slug: string; label: string };
  total: number;
}

interface QuestionPickerListProps {
  getToken: () => Promise<string | null>;
  /** Current selection, owned by the caller so it survives dialog steps. */
  selected: Map<string, NexusQBQuestionListItem>;
  onChange: (next: Map<string, NexusQBQuestionListItem>) => void;
  /**
   * Restrict to formats a machine can mark. A prep test gates entry to a class,
   * so a question nobody can auto-mark would either hand out free marks or make
   * the paper unpassable.
   */
  formats?: string[];
  /** Seeds the search box, e.g. with the class topic. */
  initialSearch?: string;
  /** Cap on how many may be picked. Prep tests are meant to be short. */
  maxSelected?: number;
  /**
   * Show "unused" / "used in 2 tests" and "% right" on each row.
   *
   * Off by default because it costs extra queries per page. On in the test
   * wizard, where the whole argument for picking from the bank is reuse, and a
   * teacher cannot judge reuse without seeing it: handing a class the same
   * question for the third time is invisible until a student says so.
   */
  showUsage?: boolean;
  /**
   * The full filter set: Exam, Source and Paper, plus a nudge towards the Tag
   * coverage page when a topic has untagged look-alikes. Off in small dialogs,
   * where search and tags are enough.
   */
  fullFilters?: boolean;
  /** Reports the one paper sitting being filtered on, or null. */
  onPaperChange?: (paper: PickerPaper | null) => void;
  /** Reports the filtered match count, for a caller drawing its own "238 match" line. */
  onTotalChange?: (total: number) => void;
}

/**
 * Pick questions out of the bank.
 *
 * Mobile-first: at 375px this is a single column of tappable rows with a 48px
 * checkbox, not a table, and the extra filters live in a bottom sheet behind a
 * Filters button. Teachers set these on a phone between classes.
 *
 * Difficulty is not a filter any more. It was a hand-set label that nobody
 * filled in (97% of the bank sat on the Medium default), so it filtered
 * nothing. Rows show the measured "% right" instead.
 *
 * This is the only copy. /teacher/tests/new carried an older fork of it for a
 * while; the test wizard replaced that page and uses this one, so the two
 * pickers can no longer disagree about what the bank contains.
 */
export default function QuestionPickerList({
  getToken,
  selected,
  onChange,
  formats,
  initialSearch,
  maxSelected,
  showUsage,
  fullFilters,
  onPaperChange,
  onTotalChange,
}: QuestionPickerListProps) {
  const theme = useTheme();
  // One set of filter controls, never two: inline from sm up, in a bottom sheet
  // behind a Filters button on a phone. Rendering both and hiding one with CSS
  // put every control in the page twice. False on the server and the first
  // client render, so there is no hydration mismatch.
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));

  const [search, setSearch] = useState(initialSearch ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch ?? '');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [exam, setExam] = useState<ExamFilter>('');
  const [source, setSource] = useState<SourceFilter>('');
  const [paperId, setPaperId] = useState('');
  const [papers, setPapers] = useState<PickerPaper[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [questions, setQuestions] = useState<NexusQBQuestionListItem[]>([]);
  const [accuracy, setAccuracy] = useState<Record<string, { answered: number; correct: number }>>({});
  const [total, setTotal] = useState(0);
  const [matchKind, setMatchKind] = useState<QBMatchKind | null>(null);
  const [didYouMean, setDidYouMean] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  /** Where "Review and tag them" should bring the teacher back to. Read after mount. */
  const [here, setHere] = useState('');

  useEffect(() => {
    setHere(`${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // A string, not the array: callers pass `formats` inline, and a new array on
  // every render would rebuild the query and refetch in a loop.
  const formatsKey = formats?.join(',') ?? '';

  const paper = useMemo(
    () => (paperId && papers ? papers.find((p) => p.id === paperId) ?? null : null),
    [paperId, papers],
  );

  // The Paper list only matters once "Past papers" is chosen, so it loads then.
  useEffect(() => {
    if (!fullFilters || source !== 'past' || papers !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/question-bank/papers', { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setPapers(res.ok ? ((json.data || []) as PickerPaper[]) : []);
      } catch {
        if (!cancelled) setPapers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fullFilters, source, papers, getToken]);

  useEffect(() => {
    onPaperChange?.(paper);
    // Reported on change only; a caller passing an inline arrow must not loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper]);

  const examPapers = useMemo(() => {
    const want = exam === 'JEE' ? 'JEE_PAPER_2' : exam === 'NATA' ? 'NATA' : null;
    return (papers || []).filter((p) => !want || p.exam_type === want);
  }, [papers, exam]);

  const buildQuery = useCallback(
    (pageNum: number) => {
      const p = new URLSearchParams();
      p.set('page', String(pageNum));
      p.set('page_size', String(PAGE_SIZE));
      p.set('question_status', 'active');
      if (formatsKey) p.set('question_format', formatsKey);
      if (tagIds.length) p.set('tag_ids', tagIds.join(','));
      if (debouncedSearch.trim()) p.set('search', debouncedSearch.trim());
      if (showUsage) p.set('include_usage', '1');
      if (exam) p.set('exam_relevance', exam);
      if (source) p.set('origin', SOURCE_ORIGINS[source]);
      if (paper) {
        p.set('exam_type', paper.exam_type);
        p.set('year', String(paper.year));
        if (paper.session) p.set('session', paper.session);
        if (paper.shift) p.set('shift', paper.shift);
      }
      return p.toString();
    },
    [formatsKey, tagIds, debouncedSearch, showUsage, exam, source, paper],
  );

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`/api/question-bank/questions?${buildQuery(pageNum)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Could not load questions');
        }
        const json = await res.json();
        const list: NexusQBQuestionListItem[] = json.data?.questions || [];
        const nextTotal = json.data?.total || 0;
        setTotal(nextTotal);
        setMatchKind(json.data?.search?.match_kind ?? null);
        setDidYouMean(json.data?.search?.did_you_mean ?? null);
        onTotalChange?.(nextTotal);
        setQuestions((prev) => (append ? [...prev, ...list] : list));
        setAccuracy((prev) => (append ? { ...prev, ...(json.data?.accuracy || {}) } : json.data?.accuracy || {}));
        setPage(pageNum);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load questions');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    // onTotalChange is deliberately not a dependency: a caller passing an
    // inline arrow would otherwise rebuild the fetcher on every render and
    // refetch the bank in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getToken, buildQuery],
  );

  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage]);

  /**
   * How many untagged questions look like each chosen topic.
   *
   * A topic filter that returns nothing used to be a dead end, even when the
   * bank held a hundred matching questions that simply had never been tagged.
   * This asks the Tag coverage suggestions for a count, so the empty state can
   * say how many are waiting and link straight to reviewing them.
   */
  useEffect(() => {
    if (!fullFilters || tagIds.length === 0) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const found = await Promise.all(
          tagIds.slice(0, 3).map(async (id) => {
            const res = await fetch(
              `/api/question-bank/tag-coverage/suggestions?tag_id=${encodeURIComponent(id)}&count_only=1`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!res.ok) return null;
            const json = await res.json().catch(() => null);
            return json?.data?.tag ? ({ tag: json.data.tag, total: json.data.total || 0 } as TagSuggestion) : null;
          }),
        );
        if (!cancelled) setSuggestions(found.filter((s): s is TagSuggestion => Boolean(s && s.total > 0)));
      } catch {
        // Only a nudge. The list itself is unaffected.
        if (!cancelled) setSuggestions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fullFilters, tagIds, getToken]);

  const atLimit = maxSelected != null && selected.size >= maxSelected;
  const activeFilterCount = (exam ? 1 : 0) + (source ? 1 : 0) + (paper ? 1 : 0) + (tagIds.length ? 1 : 0);

  const toggle = (q: NexusQBQuestionListItem) => {
    const next = new Map(selected);
    if (next.has(q.id)) {
      next.delete(q.id);
    } else {
      if (atLimit) return;
      next.set(q.id, q);
    }
    onChange(next);
  };

  const clearFilters = () => {
    setExam('');
    setSource('');
    setPaperId('');
    setTagIds([]);
    setSearch('');
  };

  const reviewHref = (s: TagSuggestion) => {
    const params = new URLSearchParams({ tag: s.tag.slug });
    if (here) params.set('from', here);
    return `/teacher/question-bank/tag-coverage?${params.toString()}`;
  };

  // The same controls render inline from sm up and in a bottom sheet on a phone.
  const filterControls = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        flexWrap: 'wrap',
        alignItems: { xs: 'stretch', sm: 'flex-end' },
        gap: 1.25,
      }}
    >
      <Box>
        <Typography component="p" variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
          Exam
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={exam}
          onChange={(_e, v) => {
            if (v === null) return;
            setExam(v as ExamFilter);
            setPaperId('');
          }}
          aria-label="Exam"
          sx={{ '& .MuiToggleButton-root': { minHeight: 44, px: 1.75, textTransform: 'none' } }}
        >
          <ToggleButton value="">All</ToggleButton>
          <ToggleButton value="NATA">NATA</ToggleButton>
          <ToggleButton value="JEE">JEE Paper 2</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <TextField
        select
        size="small"
        label="Source"
        value={source}
        onChange={(e) => {
          setSource(e.target.value as SourceFilter);
          setPaperId('');
        }}
        // displayEmpty + a shrunk label, or MUI paints "Any source" as a blank box.
        SelectProps={{ displayEmpty: true }}
        InputLabelProps={{ shrink: true }}
        sx={{ width: { xs: '100%', sm: 230 }, '& .MuiInputBase-root': { minHeight: 44 } }}
        inputProps={{ style: { fontSize: 16 } }}
      >
        <MenuItem value="">Any source</MenuItem>
        {(Object.keys(SOURCE_LABELS) as Array<Exclude<SourceFilter, ''>>).map((k) => (
          <MenuItem key={k} value={k}>
            {SOURCE_LABELS[k]}
          </MenuItem>
        ))}
      </TextField>
      {source === 'past' && (
        <TextField
          select
          size="small"
          label="Paper"
          value={paperId}
          onChange={(e) => setPaperId(e.target.value)}
          disabled={papers === null}
          helperText={papers === null ? 'Loading papers' : undefined}
          SelectProps={{ displayEmpty: true }}
          InputLabelProps={{ shrink: true }}
          sx={{ width: { xs: '100%', sm: 300 }, '& .MuiInputBase-root': { minHeight: 44 } }}
          inputProps={{ style: { fontSize: 16 } }}
        >
          <MenuItem value="">Every past paper</MenuItem>
          {examPapers.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {paperTitles(p).title}
              {p.total_questions ? ` · ${p.total_questions} Q` : ''}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Box>
  );

  const firstSuggestion = suggestions[0] ?? null;

  return (
    <Box>
      {/* Search, with the Filters button beside it on a phone. */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search question text"
          InputProps={{
            startAdornment: <SearchOutlinedIcon sx={{ fontSize: 18, mr: 0.75, color: 'text.disabled' }} />,
          }}
          // 16px prevents iOS zooming the whole page on focus.
          inputProps={{ style: { fontSize: 16 }, 'aria-label': 'Search question text' }}
          sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
        />
        {fullFilters && isPhone && (
          <Button
            variant="outlined"
            onClick={() => setSheetOpen(true)}
            aria-label={`Filters${activeFilterCount ? `, ${activeFilterCount} on` : ''}`}
            sx={{ minWidth: 48, minHeight: 48, px: 1.5, flexShrink: 0 }}
          >
            <Badge badgeContent={activeFilterCount} color="primary">
              <TuneOutlinedIcon />
            </Badge>
          </Button>
        )}
      </Box>

      {fullFilters && !isPhone && <Box sx={{ mb: 1.5 }}>{filterControls}</Box>}

      {fullFilters && isPhone && (
        <Drawer
          anchor="bottom"
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          PaperProps={{
            sx: {
              borderRadius: '16px 16px 0 0',
              p: 2,
              pb: 'calc(16px + env(safe-area-inset-bottom, 0px))',
              maxHeight: '85vh',
            },
          }}
        >
          <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 1.5 }} />
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Filters
          </Typography>
          {filterControls}
          <Box sx={{ display: 'flex', gap: 1, mt: 2.5 }}>
            <Button onClick={clearFilters} sx={{ flex: 1, minHeight: 48, textTransform: 'none' }}>
              Clear
            </Button>
            <Button
              variant="contained"
              onClick={() => setSheetOpen(false)}
              sx={{ flex: 2, minHeight: 48, textTransform: 'none' }}
            >
              {loading ? 'Show questions' : `Show ${total} question${total === 1 ? '' : 's'}`}
            </Button>
          </Box>
        </Drawer>
      )}

      <QBSearchStatus
        query={search}
        matchKind={matchKind}
        didYouMean={didYouMean}
        total={total}
        loading={loading}
        onUseSuggestion={(term) => setSearch(term)}
        onClear={() => setSearch('')}
      />

      <Box sx={{ mb: 1.5 }}>
        <TagPicker value={tagIds} onChange={setTagIds} getToken={getToken} />
      </Box>

      {/* Some results, but more look-alikes waiting to be tagged. */}
      {firstSuggestion && !loading && questions.length > 0 && (
        <Alert
          severity="info"
          icon={<LocalOfferOutlinedIcon fontSize="small" />}
          sx={{ mb: 1.5, alignItems: 'center' }}
          action={
            <Button
              component={Link}
              href={reviewHref(firstSuggestion)}
              size="small"
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              Review
            </Button>
          }
        >
          {firstSuggestion.total} more question{firstSuggestion.total === 1 ? '' : 's'} look like{' '}
          {firstSuggestion.tag.label} but {firstSuggestion.total === 1 ? 'is not' : 'are not'} tagged yet.
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {loading ? 'Loading' : `${total} question${total === 1 ? '' : 's'}`}
        </Typography>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: atLimit ? 'warning.dark' : 'text.secondary' }}
        >
          {selected.size} picked{maxSelected ? ` of ${maxSelected}` : ''}
        </Typography>
      </Box>

      {error && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
          {error}
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={64} />
            ))
          : questions.map((q) => {
              const isSelected = selected.has(q.id);
              const acc = accuracy[q.id];
              const pct =
                acc && acc.answered >= MIN_ANSWERS_FOR_ACCURACY ? Math.round((acc.correct / acc.answered) * 100) : null;
              const tagChips = ((q as any).tags || [])
                .filter((t: any) => t.group_type !== 'exam')
                .slice(0, 2) as Array<{ id: string; label: string }>;
              return (
                <Box
                  key={q.id}
                  onClick={() => toggle(q)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(q);
                    }
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    p: 1,
                    minHeight: 64,
                    cursor: 'pointer',
                    borderRadius: 1.5,
                    border: `1px solid ${isSelected ? theme.palette.primary.main : theme.palette.divider}`,
                    bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                    // Not disabled at the limit: a picked row must still be
                    // tappable to UNpick, which is the way out of the limit.
                    opacity: !isSelected && atLimit ? 0.5 : 1,
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    tabIndex={-1}
                    sx={{ p: 1, minWidth: 44, minHeight: 44 }}
                    inputProps={{ 'aria-label': `Pick question: ${q.question_text?.slice(0, 60) ?? ''}` }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0, pt: 0.75 }}>
                    <Typography sx={{ fontSize: '0.8125rem', lineHeight: 1.45 }}>
                      {(q.question_text || 'Untitled question').slice(0, 180)}
                      {(q.question_text || '').length > 180 ? '...' : ''}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        label={q.question_format === 'NUMERICAL' ? 'Numerical' : 'MCQ'}
                        variant="outlined"
                      />
                      {/* A previous-year question is worth reusing and worth
                          knowing about, so the year is a chip of its own. */}
                      {q.sources?.[0]?.year && (
                        <Chip size="small" label={`PYQ ${q.sources[0].year}`} variant="outlined" />
                      )}
                      {tagChips.map((t) => (
                        <Chip key={t.id} size="small" label={t.label} variant="outlined" color="primary" />
                      ))}
                      {/* Undefined when the caller did not ask for usage. Zero
                          is a real answer and reads as "unused". */}
                      {typeof q.used_in_tests === 'number' && (
                        <Chip
                          size="small"
                          label={
                            q.used_in_tests === 0
                              ? 'unused'
                              : `used in ${q.used_in_tests} test${q.used_in_tests === 1 ? '' : 's'}`
                          }
                          color={q.used_in_tests === 0 ? 'success' : 'default'}
                          variant="outlined"
                        />
                      )}
                      {pct !== null && (
                        <Chip
                          size="small"
                          label={`${pct}% right`}
                          title={`${acc!.correct} of ${acc!.answered} students got it right on their first try`}
                          color={pct < 40 ? 'warning' : 'default'}
                          variant="outlined"
                        />
                      )}
                    </Box>
                  </Box>
                </Box>
              );
            })}
      </Box>

      {!loading && questions.length === 0 && !error && (
        <Box sx={{ textAlign: 'center', py: 3, px: 1, display: 'grid', gap: 1, justifyItems: 'center' }}>
          {firstSuggestion ? (
            <>
              <LocalOfferOutlinedIcon sx={{ fontSize: 36, color: 'warning.main' }} />
              <Typography variant="subtitle1" component="p" sx={{ fontWeight: 700 }}>
                These questions exist, they just are not tagged
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440 }}>
                {firstSuggestion.total} question{firstSuggestion.total === 1 ? '' : 's'} look like{' '}
                {firstSuggestion.tag.label} but do not carry the tag yet. Review them once and they will show up here
                for every future test.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center', mt: 0.5 }}>
                <Button
                  component={Link}
                  href={reviewHref(firstSuggestion)}
                  variant="contained"
                  sx={{ minHeight: 48, textTransform: 'none' }}
                >
                  Review {firstSuggestion.total} suggestion{firstSuggestion.total === 1 ? '' : 's'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setTagIds([]);
                    setSearch(firstSuggestion.tag.label);
                  }}
                  sx={{ minHeight: 48, textTransform: 'none' }}
                >
                  Search the text instead
                </Button>
              </Box>
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                Nothing matches those filters.
              </Typography>
              {formatsKey && (
                <Typography variant="caption" color="text.secondary">
                  Only MCQ and numerical questions are shown, because the test marks itself.
                </Typography>
              )}
              {(activeFilterCount > 0 || search) && (
                <Button onClick={clearFilters} sx={{ minHeight: 44, textTransform: 'none' }}>
                  Clear filters
                </Button>
              )}
            </>
          )}
        </Box>
      )}

      {!loading && questions.length < total && (
        <Button
          fullWidth
          onClick={() => fetchPage(page + 1, true)}
          disabled={loadingMore}
          sx={{ mt: 1.25, textTransform: 'none', minHeight: 48 }}
        >
          {loadingMore ? <CircularProgress size={18} /> : `Load ${Math.min(PAGE_SIZE, total - questions.length)} more`}
        </Button>
      )}
    </Box>
  );
}
