'use client';

/**
 * Papers students built for themselves, grouped by student.
 *
 * What a student chooses to drill is a genuine signal (and a "Fix my mistakes"
 * paper is a different signal from a chosen topic). Two things make that signal
 * readable rather than merely present:
 *
 *   GROUPING. Nine near-identical rows all titled "Practice - 25 questions" hide
 *   the only fact worth having, which is that all nine are Perspective. The
 *   Topic axis is derived from the tags on the questions the student picked; the
 *   Folder axis is the student's own names for things, and answers a different
 *   question, whether they are organising at all.
 *
 *   DELETE. Staff can now clear a student's practice papers, singly or in bulk.
 *   This was refused until the papers piled up faster than anyone could use
 *   them. Soft, so the student keeps every score; silent, so nobody is told off
 *   for practising.
 *
 * What staff still cannot do here is MOVE a student's paper. Deleting clutter is
 * housekeeping; rearranging someone's folders behind their back is not, and
 * /api/test-folders enforces that.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Alert,
  Divider,
  TextField,
  Collapse,
  IconButton,
  InputAdornment,
  Button,
  Checkbox,
  ToggleButton,
  ToggleButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Snackbar,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutline';
import type { NexusTestContentSummary, NexusTestSourceFilters } from '@neram/database';
import { describeTestContent, examLabel, isGeneratedTitle } from '@/lib/test-provenance';
import { describeTestReason, looksBroken, testReasonShortLabel } from '@/lib/test-reasons';
import { groupByDominantCategory, groupByFolder, hasAnyFolder } from '@/lib/student-test-grouping';
import StudentIdentityLine from '@/components/students/StudentIdentityLine';

/** How the papers inside one student are bucketed. */
type GroupBy = 'topic' | 'folder' | 'date';

interface TestReasonRow {
  reason_code: string | null;
  reason_note: string | null;
  kind: 'abandoned' | 'skipped';
}

interface StudentTest {
  id: string;
  title: string;
  folder_name: string | null;
  from_mistakes: boolean;
  question_count: number;
  /** Finished sittings only. */
  attempts: number;
  /** Every sitting, finished or not. */
  attempts_started: number;
  /** Opened and never submitted: in progress plus abandoned. */
  attempts_unfinished: number;
  best_percentage: number | null;
  created_at: string;
  /** Derived from the questions, so present even on papers built before this shipped. */
  content_summary: NexusTestContentSummary | null;
  /** What the author asked for. NULL on every paper built before 20260824090000. */
  source_filters: NexusTestSourceFilters | null;
  /** Why students said this paper did not get done. Empty when nobody has said. */
  reasons: TestReasonRow[];
}

/**
 * What this student did with this paper, in one phrase.
 *
 * "0 attempts" was the old answer for a test that had been opened nine times and
 * abandoned nine times, which reads as a student ignoring their own work when it
 * actually means a student who cannot finish it. Unfinished sittings are the
 * more actionable half of this column, so they are never folded into a total.
 */
function attemptSummary(t: StudentTest): string {
  if (t.attempts_started === 0) return 'Never opened';
  const attempts = `${t.attempts} attempt${t.attempts === 1 ? '' : 's'}`;
  if (t.attempts === 0) {
    const tries = t.attempts_unfinished === 1 ? '1 try' : `${t.attempts_unfinished} tries`;
    return `${tries}, none finished`;
  }
  if (t.attempts_unfinished === 0) return attempts;
  return `${attempts}, ${t.attempts_unfinished} unfinished`;
}

function formatCreated(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch {
    return '';
  }
}

function formatCreatedFull(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/**
 * The filters the student had set when they pressed Create.
 *
 * Only rendered when `source_filters` exists. Every paper built before this
 * feature shipped has NULL there, and the panel says so in those words rather
 * than showing an empty list: "no filters recorded" and "they used no filters"
 * are different facts, and a teacher deciding whether to trust the row needs to
 * know which one they are looking at.
 */
function BuiltFromPanel({
  test,
  categoryLabels,
}: {
  test: StudentTest;
  categoryLabels: Record<string, string>;
}) {
  const f = test.source_filters;

  const rows: Array<[string, string]> = [];
  if (f) {
    const exam = [f.exam_type ? examLabel(f.exam_type) : null, f.year ?? null, f.session ?? null]
      .filter(Boolean)
      .join(' ');
    if (exam) rows.push(['Paper', exam]);
    if (f.categories?.length) {
      rows.push(['Topics', f.categories.map((slug) => categoryLabels[slug] || slug.replace(/_/g, ' ')).join(', ')]);
    }
    if (f.difficulty?.length) rows.push(['Difficulty', f.difficulty.join(', ')]);
    if (f.question_format?.length) rows.push(['Format', f.question_format.join(', ')]);
    if (f.attempt_status) rows.push(['Attempt filter', f.attempt_status]);
    if (f.search_text) rows.push(['Searched for', `"${f.search_text}"`]);
    rows.push([
      'Chosen',
      f.selection === 'select_all'
        ? `All matching${typeof f.matched_count === 'number' ? ` (${f.matched_count} matched)` : ''}`
        : 'Picked one by one',
    ]);
  }

  return (
    <Box sx={{ px: 2.5, pb: 1.5, pt: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
        <TuneOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
          How this was built
        </Typography>
      </Box>

      {rows.length === 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          No filters were recorded for this paper. It was built before Nexus started keeping them,
          so what is shown above is read from the questions themselves.
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.5, rowGap: 0.25 }}>
          {rows.map(([label, value]) => (
            <Box key={label} sx={{ display: 'contents' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {label}
              </Typography>
              <Typography variant="caption" color="text.primary">
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        Created {formatCreatedFull(test.created_at)}
      </Typography>
    </Box>
  );
}

interface Group {
  student_id: string;
  student_name: string;
  avatar_url: string | null;
  /** nexus_enrollments.current_standard. Null is shown as "Not set", never hidden. */
  current_standard: string | null;
  participation_status: 'active' | 'dormant' | string | null;
  dormant_since: string | null;
  dormant_reason: string | null;
  tests: StudentTest[];
}

export default function StudentTestsView({
  getToken,
  onOpenTest,
}: {
  getToken: () => Promise<string | null>;
  onOpenTest: (testId: string) => void;
}) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  /** slug -> human label, resolved server-side so no client fetches the tag tree. */
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  /** Which rows have their "How this was built" panel open. Per test, not per student. */
  const [openBuild, setOpenBuild] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [groupBy, setGroupBy] = useState<GroupBy>('topic');
  /**
   * Selection belongs to ONE student at a time.
   *
   * A set spanning several collapsed panels would let a teacher press
   * "Delete 14" while looking at four of them, which is exactly the accident
   * this feature is most likely to cause. Opening selection on another student
   * clears the previous one.
   */
  const [selectingFor, setSelectingFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<StudentTest[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setGroups(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const params = debounced ? `?search=${encodeURIComponent(debounced)}` : '';
      const res = await fetch(`/api/question-bank/tests/student-tests${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Could not load student tests');
      }
      const json = await res.json();
      setGroups(json.data?.groups || []);
      setCategoryLabels(json.data?.category_labels || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load student tests');
      setGroups([]);
    }
  }, [getToken, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Offer the Folder axis only when at least one paper anywhere is filed.
   *
   * A toggle that files every paper on screen under one "Unfiled" heading is a
   * grouping that groups nothing, and reads as a broken control rather than as
   * an honest answer to "is this student organising".
   */
  const foldersInUse = useMemo(() => hasAnyFolder((groups || []).flatMap((g) => g.tests)), [groups]);

  useEffect(() => {
    if (groupBy === 'folder' && groups !== null && !foldersInUse) setGroupBy('topic');
  }, [groupBy, groups, foldersInUse]);

  const exitSelection = useCallback(() => {
    setSelectingFor(null);
    setSelected(new Set());
  }, []);

  /**
   * Collapsing a student ends any selection inside them.
   *
   * The rows unmount but the ticks would not, so re-opening the panel later
   * would show a selection the teacher had visibly walked away from, with a
   * Delete button already armed against it.
   */
  const togglePanel = useCallback(
    (studentId: string) => {
      setOpen((prev) => {
        const next = new Set(prev);
        if (next.has(studentId)) {
          next.delete(studentId);
          if (selectingFor === studentId) exitSelection();
        } else {
          next.add(studentId);
        }
        return next;
      });
    },
    [selectingFor, exitSelection],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const deletePending = useCallback(async () => {
    if (!pendingDelete || pendingDelete.length === 0) return;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/question-bank/tests/bulk-delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_ids: pendingDelete.map((t) => t.id) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Could not delete');
      }
      const json = await res.json();
      const n = json.data?.deleted ?? pendingDelete.length;
      setPendingDelete(null);
      exitSelection();
      await load();
      setNotice(`Deleted ${n} test${n !== 1 ? 's' : ''}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete those tests');
    } finally {
      setBusy(false);
    }
  }, [pendingDelete, getToken, exitSelection, load]);

  /**
   * Papers in the pending selection that somebody has actually sat.
   *
   * Deleting one is not destructive (the attempts survive), but it IS the
   * difference between clearing junk and removing work a student did, so the
   * dialog says which of the two is about to happen.
   */
  const pendingWithAttempts = useMemo(
    () => (pendingDelete || []).filter((t) => t.attempts_started > 0).length,
    [pendingDelete],
  );

  return (
    <Box>
      <TextField
        size="small"
        fullWidth
        label="Search student tests"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 1.5 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchOutlinedIcon sx={{ fontSize: 18 }} />
            </InputAdornment>
          ),
        }}
      />

      {/* One control for every student rather than one per panel. A teacher
          comparing two students wants them bucketed the same way, and eight
          copies of the same toggle is eight chances to have them disagree. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          Group by
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={groupBy}
          onChange={(_e, v) => v && setGroupBy(v as GroupBy)}
          aria-label="Group each student's tests by"
        >
          <ToggleButton value="topic" sx={{ textTransform: 'none', minHeight: 36, px: 1.5 }}>
            Topic
          </ToggleButton>
          {foldersInUse && (
            <ToggleButton value="folder" sx={{ textTransform: 'none', minHeight: 36, px: 1.5 }}>
              Folder
            </ToggleButton>
          )}
          <ToggleButton value="date" sx={{ textTransform: 'none', minHeight: 36, px: 1.5 }}>
            Date
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {groups === null ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1.5 }} />
          ))}
        </Box>
      ) : groups.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 6, px: 3, textAlign: 'center', borderRadius: 2 }}>
          <PersonOutlineOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {debounced
              ? 'No student test matches that search.'
              : 'No student has built their own test yet. They appear here as soon as they do.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {groups.map((g) => {
            const isOpen = open.has(g.student_id);
            const selecting = selectingFor === g.student_id;
            // Date keeps the server's newest-first order and renders as one
            // unlabelled run, which is what this view has always been.
            const buckets =
              groupBy === 'topic'
                ? groupByDominantCategory(g.tests, categoryLabels)
                : groupBy === 'folder'
                  ? groupByFolder(g.tests)
                  : [{ key: '__date__', label: '', tests: g.tests }];
            const selectedHere = g.tests.filter((t) => selected.has(t.id));
            return (
              <Paper key={g.student_id} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box
                  role="button"
                  tabIndex={0}
                  onClick={() => togglePanel(g.student_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      togglePanel(g.student_id);
                    }
                  }}
                  sx={{
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'pointer',
                    minHeight: 56,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  {/* Never a bare name. A dormant student's attempt counts are
                      history rather than news, and a Break Year student sits the
                      exam in weeks: both change what the rows below MEAN. */}
                  <StudentIdentityLine
                    student={{
                      id: g.student_id,
                      name: g.student_name,
                      avatar_url: g.avatar_url,
                      current_standard: g.current_standard,
                      participation_status: g.participation_status,
                      dormant_since: g.dormant_since,
                      dormant_reason: g.dormant_reason,
                    }}
                    trailing={
                      <>
                        <Chip
                          size="small"
                          label={`${g.tests.length} test${g.tests.length !== 1 ? 's' : ''}`}
                          sx={{ height: 22 }}
                        />
                        <IconButton size="small" aria-label={isOpen ? 'Collapse' : 'Expand'} sx={{ p: 0.5 }}>
                          <ExpandMoreOutlinedIcon
                            sx={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
                          />
                        </IconButton>
                      </>
                    }
                  />
                </Box>

                <Collapse in={isOpen} unmountOnExit>
                  <Divider />

                  {/* Selection lives inside the student it applies to, so
                      "Delete 6" can never mean six papers belonging to four
                      different people. */}
                  <Box
                    sx={{
                      px: 1.5,
                      py: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      flexWrap: 'wrap',
                      bgcolor: selecting ? 'action.hover' : undefined,
                    }}
                  >
                    {selecting ? (
                      <>
                        <Typography variant="caption" sx={{ fontWeight: 700, flex: 1 }}>
                          {selectedHere.length} selected
                        </Typography>
                        <Button
                          size="small"
                          onClick={() => setSelected(new Set(g.tests.map((t) => t.id)))}
                          sx={{ textTransform: 'none', minHeight: 40 }}
                        >
                          Select all
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          variant="contained"
                          disabled={selectedHere.length === 0}
                          startIcon={<DeleteOutlineOutlinedIcon />}
                          onClick={() => setPendingDelete(selectedHere)}
                          sx={{ textTransform: 'none', minHeight: 40 }}
                        >
                          Delete
                        </Button>
                        <Button size="small" onClick={exitSelection} sx={{ textTransform: 'none', minHeight: 40 }}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="small"
                        onClick={() => {
                          setSelectingFor(g.student_id);
                          setSelected(new Set());
                        }}
                        sx={{ textTransform: 'none', minHeight: 40 }}
                      >
                        Select to clear out
                      </Button>
                    )}
                  </Box>

                  {buckets.map((bucket) => (
                    <Box key={bucket.key}>
                      {bucket.label && (
                        <Box
                          sx={{
                            px: 2.5,
                            py: 0.75,
                            bgcolor: 'action.hover',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>
                            {bucket.label}
                          </Typography>
                          <Chip
                            size="small"
                            label={bucket.tests.length}
                            sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }}
                          />
                        </Box>
                      )}
                      {bucket.tests.map((t, i) => {
                    // The auto-generated titles are near-identical across papers
                    // and sometimes contradict the contents outright, so the
                    // derived description leads and the stored title drops to a
                    // second line. A title the student TYPED always leads: it is
                    // the most informative thing on the row.
                    const derived = describeTestContent(t.content_summary, categoryLabels);
                    const demoteTitle = isGeneratedTitle(t.title) && derived.length > 0;
                    const heading = demoteTitle ? derived : t.title;
                    const subheading = demoteTitle ? t.title : derived;
                    const builtOpen = openBuild.has(t.id);
                    const reasons = t.reasons || [];
                    const broken = looksBroken(reasons);

                    const isSelected = selected.has(t.id);

                    return (
                      <Box key={t.id}>
                        {i > 0 && <Divider />}
                        <Box
                          role={selecting ? 'checkbox' : 'button'}
                          aria-checked={selecting ? isSelected : undefined}
                          tabIndex={0}
                          // While selecting, the row ticks rather than navigates.
                          // Leaving it navigating would throw the teacher onto a
                          // detail page mid-selection and lose everything ticked.
                          onClick={() => (selecting ? toggleSelect(t.id) : onOpenTest(t.id))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (selecting) toggleSelect(t.id);
                              else onOpenTest(t.id);
                            }
                          }}
                          sx={{
                            p: 1.5,
                            pl: selecting ? 1 : 2.5,
                            cursor: 'pointer',
                            bgcolor: isSelected ? 'action.selected' : undefined,
                            '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            {selecting && (
                              <Checkbox
                                checked={isSelected}
                                onChange={() => toggleSelect(t.id)}
                                onClick={(e) => e.stopPropagation()}
                                inputProps={{ 'aria-label': `Select ${t.title}` }}
                                sx={{ p: 0.5 }}
                              />
                            )}
                            {t.from_mistakes && <AutoFixHighOutlinedIcon sx={{ fontSize: 16, color: 'warning.main' }} />}
                            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                              {heading}
                            </Typography>
                            {/* Outranks every other chip on the row. A student has
                                said this paper is broken, which means it is probably
                                also broken for everyone who did not bother to say. */}
                            {broken && (
                              <Chip
                                size="small"
                                icon={<ReportProblemOutlinedIcon sx={{ fontSize: 14 }} />}
                                label="Reported broken"
                                color="error"
                                sx={{ height: 22, fontWeight: 700, fontSize: '0.68rem', flexShrink: 0 }}
                              />
                            )}
                            {/* A paper opened and never finished is the one row on this
                                screen a teacher should chase, so it carries a chip of its
                                own rather than hiding inside a caption. */}
                            {!broken && t.attempts === 0 && t.attempts_unfinished > 0 && (
                              <Chip
                                size="small"
                                label="Unfinished"
                                color="warning"
                                variant="outlined"
                                sx={{ height: 22, fontWeight: 700, fontSize: '0.68rem', flexShrink: 0 }}
                              />
                            )}
                            {t.best_percentage != null && (
                              <Chip
                                size="small"
                                label={`${Math.round(t.best_percentage)}%`}
                                color={t.best_percentage >= 70 ? 'success' : 'default'}
                                sx={{ height: 22, fontWeight: 700, flexShrink: 0 }}
                              />
                            )}
                            {/* A direct button rather than a kebab hiding one
                                item. Hidden while selecting, where the bulk
                                Delete is the only sensible way to press it. */}
                            {!selecting && (
                              <IconButton
                                aria-label={`Delete ${t.title}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingDelete([t]);
                                }}
                                sx={{ width: 44, height: 44, flexShrink: 0, color: 'text.secondary' }}
                              >
                                <DeleteOutlineOutlinedIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Box>

                          {subheading && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              noWrap
                              sx={{ display: 'block', fontStyle: demoteTitle ? 'italic' : 'normal' }}
                            >
                              {demoteTitle ? `Named "${subheading}" by the student` : subheading}
                            </Typography>
                          )}

                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {t.question_count} question{t.question_count !== 1 ? 's' : ''} · {attemptSummary(t)}
                            {t.folder_name ? ` · ${t.folder_name}` : ''}
                            {t.created_at ? ` · ${formatCreated(t.created_at)}` : ''}
                          </Typography>

                          {/* In the student's own words, verbatim. The whole point of
                              asking was to replace a teacher's guess with a sentence,
                              so the sentence is shown rather than a tallied category. */}
                          {reasons.length > 0 && (
                            <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {reasons.slice(0, 3).map((r, idx) => (
                                <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                                  <Chip
                                    size="small"
                                    label={testReasonShortLabel(r.reason_code)}
                                    color={r.reason_code === 'technical_problem' ? 'error' : 'default'}
                                    variant="outlined"
                                    sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, flexShrink: 0 }}
                                  />
                                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                                    {describeTestReason(r.reason_code, r.reason_note)}
                                    <Box component="span" sx={{ opacity: 0.7 }}>
                                      {r.kind === 'abandoned' ? ' (stopped part way)' : ' (did not start)'}
                                    </Box>
                                  </Typography>
                                </Box>
                              ))}
                              {reasons.length > 3 && (
                                <Typography variant="caption" color="text.secondary">
                                  and {reasons.length - 3} more
                                </Typography>
                              )}
                            </Box>
                          )}
                        </Box>

                        {/* Its own control rather than part of the row, so opening
                            the detail page and inspecting how the paper was built
                            stay two separate intents. */}
                        <Box sx={{ pl: 2.5, pb: builtOpen ? 0 : 1 }}>
                          <Box
                            component="button"
                            type="button"
                            aria-expanded={builtOpen}
                            onClick={() =>
                              setOpenBuild((prev) => {
                                const next = new Set(prev);
                                if (next.has(t.id)) next.delete(t.id);
                                else next.add(t.id);
                                return next;
                              })
                            }
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              minHeight: 44,
                              px: 0,
                              border: 0,
                              bgcolor: 'transparent',
                              cursor: 'pointer',
                              color: 'primary.main',
                              font: 'inherit',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                            }}
                          >
                            <TuneOutlinedIcon sx={{ fontSize: 14 }} />
                            How this was built
                            <ExpandMoreOutlinedIcon
                              sx={{
                                fontSize: 15,
                                transform: builtOpen ? 'rotate(180deg)' : 'none',
                                transition: 'transform 150ms',
                              }}
                            />
                          </Box>
                        </Box>
                        <Collapse in={builtOpen} unmountOnExit>
                          <BuiltFromPanel test={t} categoryLabels={categoryLabels} />
                        </Collapse>
                      </Box>
                    );
                      })}
                    </Box>
                  ))}
                </Collapse>
              </Paper>
            );
          })}
        </Box>
      )}

      <Dialog
        open={Boolean(pendingDelete)}
        onClose={() => !busy && setPendingDelete(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Delete {pendingDelete?.length ?? 0} test{(pendingDelete?.length ?? 0) !== 1 ? 's' : ''}?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {(pendingDelete?.length ?? 0) === 1 ? 'It disappears' : 'They disappear'} from the student&apos;s Tests
            page. Their attempts and scores stay in their history, and they are not told.
          </Typography>
          {pendingWithAttempts > 0 && (
            // The line between clearing junk and removing work somebody did.
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              {pendingWithAttempts} of these {pendingWithAttempts === 1 ? 'has' : 'have'} been sat at least once.
            </Alert>
          )}
          {(pendingDelete?.length ?? 0) > 1 && (
            <Box
              sx={{ mt: 1.5, maxHeight: 200, overflowY: 'auto', bgcolor: 'action.hover', borderRadius: 1, p: 1 }}
            >
              {(pendingDelete || []).map((t) => (
                <Typography key={t.id} variant="caption" sx={{ display: 'block', py: 0.25 }} noWrap>
                  {t.title}
                </Typography>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPendingDelete(null)} disabled={busy} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={deletePending}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice(null)}>
        <Alert severity="success" variant="filled" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      </Snackbar>
    </Box>
  );
}
