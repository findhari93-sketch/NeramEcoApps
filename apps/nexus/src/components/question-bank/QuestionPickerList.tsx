'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import TagPicker from '@/components/question-bank/TagPicker';
import type { NexusQBQuestionListItem, QBDifficulty } from '@neram/database';

const DIFFICULTIES: QBDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];
const DIFF_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  EASY: 'success',
  MEDIUM: 'warning',
  HARD: 'error',
};
const PAGE_SIZE = 20;

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
}

/**
 * Pick questions out of the bank.
 *
 * Mobile-first: at 375px this is a single column of tappable rows with a 48px
 * checkbox, not a table. Teachers set these on a phone between classes.
 *
 * NOTE: /teacher/tests/new still carries its own older copy of this picker. That
 * page works and is not on the critical path for this feature, so consolidating
 * the two is a follow-up rather than a same-change refactor.
 */
export default function QuestionPickerList({
  getToken,
  selected,
  onChange,
  formats,
  initialSearch,
  maxSelected,
}: QuestionPickerListProps) {
  const theme = useTheme();

  const [search, setSearch] = useState(initialSearch ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch ?? '');
  const [difficulty, setDifficulty] = useState<QBDifficulty[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);

  const [questions, setQuestions] = useState<NexusQBQuestionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = useCallback(
    (pageNum: number) => {
      const p = new URLSearchParams();
      p.set('page', String(pageNum));
      p.set('page_size', String(PAGE_SIZE));
      p.set('question_status', 'active');
      if (formats?.length) p.set('question_format', formats.join(','));
      if (difficulty.length) p.set('difficulty', difficulty.join(','));
      if (tagIds.length) p.set('tag_ids', tagIds.join(','));
      if (debouncedSearch.trim()) p.set('search', debouncedSearch.trim());
      return p.toString();
    },
    [formats, difficulty, tagIds, debouncedSearch],
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
        setTotal(json.data?.total || 0);
        setQuestions((prev) => (append ? [...prev, ...list] : list));
        setPage(pageNum);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load questions');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [getToken, buildQuery],
  );

  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage]);

  const atLimit = maxSelected != null && selected.size >= maxSelected;

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

  return (
    <Box>
      {/* Filters. Stacked on mobile, side by side from sm up. */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, mb: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the bank"
          InputProps={{
            startAdornment: <SearchOutlinedIcon sx={{ fontSize: 18, mr: 0.75, color: 'text.disabled' }} />,
          }}
          // 16px prevents iOS zooming the whole page on focus.
          inputProps={{ style: { fontSize: 16 } }}
          sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
        />
        <ToggleButtonGroup
          size="small"
          value={difficulty}
          onChange={(_e, v) => setDifficulty(v as QBDifficulty[])}
          sx={{ '& .MuiToggleButton-root': { minHeight: 48, px: 1.5, textTransform: 'none' } }}
        >
          {DIFFICULTIES.map((d) => (
            <ToggleButton key={d} value={d}>
              {d[0] + d.slice(1).toLowerCase()}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ mb: 1.5 }}>
        <TagPicker value={tagIds} onChange={setTagIds} getToken={getToken} />
      </Box>

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
                      {q.difficulty && (
                        <Chip
                          size="small"
                          label={q.difficulty[0] + q.difficulty.slice(1).toLowerCase()}
                          color={DIFF_COLOR[q.difficulty] ?? 'default'}
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
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Nothing matches those filters.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Only MCQ and numerical questions can be used here, because the test marks itself.
          </Typography>
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
