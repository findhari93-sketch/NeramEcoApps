'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import SaveIcon from '@mui/icons-material/Save';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import LinkIcon from '@mui/icons-material/Link';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { NexusQBQuestion, QBQuestionSection } from '@neram/database';
import { QB_SECTION_ORDER, qbSectionLabel, QB_SECTIONS } from '@neram/database';
import {
  questionReferencesFigure,
  questionMissingImages,
  questionMissingSolutionImage,
} from '@/lib/qb-image-needs';
import PaperQuestionRow from './PaperQuestionRow';

export type PaperQuestionMode = 'edit' | 'images';

/**
 * What outstanding work the list is narrowed to.
 *
 * Was `ImageFilter`, and only applied in Images mode. It covers two backlogs
 * now (figures and worked solutions) and applies in both modes: "show me what
 * still needs doing" is not a thing a teacher only wants while pasting.
 */
export type NeedsFilter = 'all' | 'figures' | 'missing-figure' | 'missing-solution';

/** A section the list can be narrowed to, or '__none__' for unsectioned rows. */
export type PaperSectionFilter = QBQuestionSection | '__none__';

/**
 * The Select's "no filter" value. A sentinel rather than '', because MUI treats
 * an empty string as "nothing chosen" and drops the rendered value.
 */
const ALL_SECTIONS = '__all__';

function sectionOptionLabel(section: PaperSectionFilter): string {
  return section === '__none__' ? 'Unsectioned' : qbSectionLabel(section);
}

export interface DeleteRefusal {
  question_id: string;
  blockers: string[];
}

export interface PaperQuestionListProps {
  questions: NexusQBQuestion[];
  tagCounts: Record<string, number>;
  activeQuestionId: string | null;
  onActivate: (questionId: string) => void;
  onChangeSections: (questionIds: string[], section: QBQuestionSection) => Promise<void>;
  mode: PaperQuestionMode;
  onModeChange: (mode: PaperQuestionMode) => void;
  needsFilter: NeedsFilter;
  onNeedsFilterChange: (filter: NeedsFilter) => void;
  /** Also settable from the paper header's section chips; cleared from either end. */
  sectionFilter: PaperSectionFilter | null;
  onSectionFilterChange: (filter: PaperSectionFilter | null) => void;
  onBulkSetNeedsImage: (questionIds: string[], value: boolean) => Promise<void>;
  /**
   * Progress on both picture backlogs, counting unsaved work. Two tracks, never
   * summed: figures and worked solutions are different jobs.
   */
  imageStats: {
    total: number;
    withImages: number;
    solutionTotal: number;
    solutionWithImages: number;
  };
  pendingImageCount: number;
  onSaveAllImages: () => void;
  savingImages: boolean;
  saveImageProgress: { done: number; total: number };
  /** Link two or more selected questions as either/or alternatives. */
  onLinkChoiceGroup: (questionIds: string[]) => Promise<void>;
  /** Permanent delete, guarded server-side. Refused rows are reported back, not silently skipped. */
  onDeleteQuestions: (questionIds: string[]) => Promise<{ deleted: number; refused: DeleteRefusal[] }>;
  /** Hide or re-show just the ticked questions. Replaces the header's paper-wide Deactivate. */
  onSetActiveQuestions: (questionIds: string[], active: boolean) => Promise<void>;
}

/** Is the user typing? Then Ctrl+A should select their text, not every row. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/**
 * The paper as a scannable list.
 *
 * Grouping comes from the section stored on each question, never re-derived
 * from question numbers: that guess already has one home in
 * qb-section-inference.ts, and a second copy here is how the old grid quietly
 * mislabelled papers that did not follow the current JEE numbering.
 */
export default function PaperQuestionList({
  questions,
  tagCounts,
  activeQuestionId,
  onActivate,
  onChangeSections,
  mode,
  onModeChange,
  needsFilter,
  onNeedsFilterChange,
  sectionFilter,
  onSectionFilterChange,
  onBulkSetNeedsImage,
  imageStats,
  pendingImageCount,
  onSaveAllImages,
  savingImages,
  saveImageProgress,
  onLinkChoiceGroup,
  onDeleteQuestions,
  onSetActiveQuestions,
}: PaperQuestionListProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSection, setBulkSection] = useState<QBQuestionSection | ''>('');
  const [applyingSection, setApplyingSection] = useState(false);
  const [applyingNeedsImage, setApplyingNeedsImage] = useState<'needed' | 'not-needed' | null>(null);
  const [linking, setLinking] = useState(false);
  const [settingActive, setSettingActive] = useState<'activate' | 'deactivate' | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteRefused, setDeleteRefused] = useState<DeleteRefusal[]>([]);
  // The selection bar's overflow. Six inline controls is already two rows at
  // 375px; the eight it used to carry were three.
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);

  // Explorer-style range selection. Only shift is special: it re-derives the
  // selection as base ∪ [anchor..clicked], so dragging it up and down grows
  // and shrinks the same run instead of accumulating one row at a time. Every
  // other path here toggles exactly the clicked row into whatever was already
  // selected, because the row body's own plain click never reaches this
  // function at all (it opens the question instead); the only plain clicks
  // that arrive here are checkbox clicks, and a checkbox is a multi-select
  // gesture by convention; ticking row 1 then row 3 must select both, not
  // replace one with the other.
  const anchorRef = useRef<number | null>(null);
  const baseRef = useRef<Set<string>>(new Set());

  const toggleOne = (question: NexusQBQuestion, shiftKey: boolean) => {
    const idx = questions.findIndex((q) => q.id === question.id);
    if (idx < 0) return;

    if (shiftKey && anchorRef.current != null) {
      const lo = Math.min(anchorRef.current, idx);
      const hi = Math.max(anchorRef.current, idx);
      const next = new Set(baseRef.current);
      for (let i = lo; i <= hi; i++) next.add(questions[i].id);
      setSelected(next);
      return;
    }

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      baseRef.current = next;
      return next;
    });
    anchorRef.current = idx;
  };

  const clearSelection = () => {
    setSelected(new Set());
    baseRef.current = new Set();
    anchorRef.current = null;
  };

  const selectAll = () => {
    setSelected(new Set(questions.map((x) => x.id)));
    baseRef.current = new Set(questions.map((x) => x.id));
    anchorRef.current = questions.length - 1;
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  const applyBulkSection = async () => {
    if (!bulkSection || selected.size === 0) return;
    setApplyingSection(true);
    try {
      await onChangeSections(Array.from(selected), bulkSection);
      clearSelection();
      setBulkSection('');
    } finally {
      setApplyingSection(false);
    }
  };

  const applyBulkNeedsImage = async (value: boolean) => {
    if (selected.size === 0) return;
    setApplyingNeedsImage(value ? 'needed' : 'not-needed');
    try {
      await onBulkSetNeedsImage(Array.from(selected), value);
    } finally {
      setApplyingNeedsImage(null);
    }
  };

  const applyLinkChoiceGroup = async () => {
    if (selected.size < 2) return;
    setLinking(true);
    try {
      await onLinkChoiceGroup(Array.from(selected));
      clearSelection();
    } finally {
      setLinking(false);
    }
  };

  /**
   * No confirmation dialog, unlike the paper-wide version this replaces. The
   * teacher ticked these rows, the count is on the bar in front of them, and
   * the opposite action sits two buttons away.
   */
  const applySetActive = async (active: boolean) => {
    if (selected.size === 0) return;
    setSettingActive(active ? 'activate' : 'deactivate');
    try {
      await onSetActiveQuestions(Array.from(selected), active);
      clearSelection();
    } finally {
      setSettingActive(null);
    }
  };

  const openDeleteDialog = () => {
    if (selected.size === 0) return;
    setDeleteRefused([]);
    setDeleteDialogOpen(true);
  };

  /**
   * Kept ones come back with a reason rather than being silently skipped, so a
   * teacher clearing out a batch of placeholder questions can see which ones
   * a student has already sat and leave those alone.
   */
  const applyBulkDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const { refused } = await onDeleteQuestions(Array.from(selected));
      const refusedIds = new Set(refused.map((r) => r.question_id));
      setSelected(refusedIds);
      baseRef.current = refusedIds;
      setDeleteRefused(refused);
      if (refused.length === 0) setDeleteDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  // Paper-order position per question, so a row whose display_order is NULL
  // still gets a distinct number. A staging drawing paper has 96 questions with
  // no display_order at all, which otherwise names every row "question 0".
  const positions = useMemo(() => {
    const map = new Map<string, number>();
    questions.forEach((item, i) => map.set(item.id, i + 1));
    return map;
  }, [questions]);

  // Section narrowing happens first, so the "needs" chip counts below describe
  // whatever section is in view rather than the whole paper: "12 missing a
  // figure" while filtered to Aptitude has to mean twelve aptitude questions.
  const bySection = useMemo(() => {
    if (!sectionFilter) return questions;
    return questions.filter((q) => (q.section ?? '__none__') === sectionFilter);
  }, [questions, sectionFilter]);

  const figureCount = useMemo(() => bySection.filter(questionReferencesFigure).length, [bySection]);
  const missingCount = useMemo(
    () => bySection.filter((q) => questionMissingImages(q)).length,
    [bySection],
  );
  const missingSolutionCount = useMemo(
    () => bySection.filter((q) => questionMissingSolutionImage(q)).length,
    [bySection],
  );

  /**
   * Every section actually present on this paper, for the Section select.
   *
   * In QB_SECTIONS order, not first-seen order, so the menu reads in the order
   * the paper is sat. Unsectioned goes last: it is a state to clear, not a
   * section.
   */
  const sectionOptions = useMemo<PaperSectionFilter[]>(() => {
    const seen = new Set<PaperSectionFilter>();
    for (const q of questions) seen.add(q.section ?? '__none__');
    const options: PaperSectionFilter[] = QB_SECTIONS.filter((s) => seen.has(s));
    if (seen.has('__none__')) options.push('__none__');
    return options;
  }, [questions]);

  // Applies in both modes. It used to be Images-only, so a teacher fixing
  // wording had no way to see just the questions that still needed work.
  const visibleQuestions = useMemo(() => {
    if (needsFilter === 'all') return bySection;
    const predicate: (q: NexusQBQuestion) => boolean =
      needsFilter === 'missing-figure'
        ? (q) => questionMissingImages(q)
        : needsFilter === 'missing-solution'
          ? (q) => questionMissingSolutionImage(q)
          : questionReferencesFigure;
    return bySection.filter(predicate);
  }, [bySection, needsFilter]);

  const sections = useMemo(() => {
    const groups = new Map<string, { order: number; questions: NexusQBQuestion[] }>();
    for (const item of visibleQuestions) {
      const key = item.section ?? '__none__';
      if (!groups.has(key)) {
        groups.set(key, { order: item.section ? QB_SECTION_ORDER[item.section] ?? 98 : 99, questions: [] });
      }
      groups.get(key)!.questions.push(item);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, group]) => {
        const numbers = group.questions.map((x) => x.display_order).filter((n): n is number => n != null);
        const range = numbers.length ? ` (Q${Math.min(...numbers)} to Q${Math.max(...numbers)})` : '';
        return {
          key,
          title: `${key === '__none__' ? 'Unsectioned' : qbSectionLabel(key)}${range}`,
          questions: group.questions,
        };
      });
  }, [visibleQuestions]);

  const allSelected = selected.size > 0 && selected.size === questions.length;
  const someSelected = selected.size > 0 && !allSelected;

  /**
   * The work queues, in the order a paper is actually worked through: see
   * everything, then the figures, then the solutions.
   *
   * "Solution missing" is hidden on a paper with no maths at all (a NATA
   * aptitude paper), rather than sitting there permanently reading 0.
   */
  const needsChips: {
    value: NeedsFilter;
    label: string;
    count: number;
    color: 'primary' | 'warning' | 'secondary';
  }[] = [
    { value: 'all', label: 'All', count: bySection.length, color: 'primary' },
    { value: 'figures', label: 'Figures', count: figureCount, color: 'primary' },
    { value: 'missing-figure', label: 'Figure missing', count: missingCount, color: 'warning' },
    ...(imageStats.solutionTotal > 0 || needsFilter === 'missing-solution'
      ? ([
          {
            value: 'missing-solution' as const,
            label: 'Solution missing',
            count: missingSolutionCount,
            color: 'secondary' as const,
          },
        ])
      : []),
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/*
        The one filter home. Section and Needs both live here, directly above
        the list they narrow, instead of the old split where sections were set
        in the header card, the image filters here, and the chip reporting the
        section filter in a third place again.
      */}
      <Paper variant="outlined" sx={{ p: 1, mb: 1, borderRadius: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Checkbox
            size="small"
            checked={allSelected}
            indeterminate={someSelected}
            onChange={() => (selected.size > 0 ? clearSelection() : selectAll())}
            inputProps={{ 'aria-label': allSelected ? 'Clear selection' : 'Select every question' }}
            sx={{ p: 0.75 }}
          />
          <Box aria-live="polite" sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} noWrap>
              {selected.size > 0
                ? `${selected.size} of ${questions.length} selected`
                : visibleQuestions.length === questions.length
                  ? `${questions.length} question${questions.length === 1 ? '' : 's'}`
                  : `${visibleQuestions.length} of ${questions.length} questions`}
            </Typography>
          </Box>

          <Box sx={{ flex: 1 }} />

          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, next) => next && onModeChange(next)}
            sx={{ height: 36, flexShrink: 0 }}
          >
            <ToggleButton value="edit" sx={{ px: 1, textTransform: 'none' }}>
              <EditOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} />
              Edit
            </ToggleButton>
            <ToggleButton value="images" sx={{ px: 1, textTransform: 'none' }}>
              <CollectionsOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} />
              Images
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/*
          One line that scrolls sideways rather than wrapping into a three-row
          wall at 375px. The strip clips itself, so nothing here can make the
          page scroll horizontally.
        */}
        <Box
          role="group"
          aria-label="Filter the question list"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            flexWrap: 'nowrap',
            overflowX: 'auto',
            mt: 0.75,
            pb: 0.25,
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {sectionOptions.length > 1 && (
            <Select
              size="small"
              value={sectionFilter ?? ALL_SECTIONS}
              onChange={(e) => {
                const next = e.target.value as string;
                onSectionFilterChange(next === ALL_SECTIONS ? null : (next as PaperSectionFilter));
              }}
              renderValue={(value) =>
                value === ALL_SECTIONS ? 'All sections' : sectionOptionLabel(value as PaperSectionFilter)
              }
              SelectDisplayProps={{ 'aria-label': 'Filter the list by section' }}
              sx={{
                flexShrink: 0,
                height: { xs: 44, sm: 36 },
                fontSize: '0.75rem',
                fontWeight: 600,
                ...(sectionFilter ? { color: 'primary.main' } : null),
              }}
            >
              <MenuItem value={ALL_SECTIONS} sx={{ minHeight: 44, fontSize: '0.85rem' }}>
                All sections
              </MenuItem>
              {sectionOptions.map((s) => (
                <MenuItem key={s} value={s} sx={{ minHeight: 44, fontSize: '0.85rem' }}>
                  {sectionOptionLabel(s)}
                </MenuItem>
              ))}
            </Select>
          )}

          {needsChips.map(({ value, label, count, color }) => {
            const active = needsFilter === value;
            return (
              <Chip
                key={value}
                label={`${label} ${count}`}
                size="small"
                clickable
                onClick={() => onNeedsFilterChange(value)}
                variant={active ? 'filled' : 'outlined'}
                color={active ? color : 'default'}
                aria-pressed={active}
                sx={{
                  flexShrink: 0,
                  // 44 on a phone, where this is a thumb target and the row has
                  // the space; 34 from sm up, where it is a mouse target next
                  // to a 36px Select and 44 would look oversized.
                  height: { xs: 44, sm: 34 },
                  borderRadius: 999,
                  fontSize: '0.75rem',
                  fontWeight: active ? 700 : 500,
                  // A queue that is empty is not the one to reach for, but it
                  // still has to be readable: 4.5:1 rules out disabled grey.
                  ...(count === 0 && !active ? { color: 'text.secondary' } : null),
                }}
              />
            );
          })}
        </Box>
      </Paper>

      {/*
        Two tracks, never summed. "40/40 figures, 0/40 solutions" averaged into
        one half-full bar would describe neither job.
      */}
      {mode === 'images' && (imageStats.total > 0 || imageStats.solutionTotal > 0) && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1, px: 0.5 }}>
          {imageStats.total > 0 && (
            <TrackBar
              label="Figures"
              done={imageStats.withImages}
              total={imageStats.total}
              color={theme.palette.success.main}
            />
          )}
          {imageStats.solutionTotal > 0 && (
            <TrackBar
              label="Solutions"
              done={imageStats.solutionWithImages}
              total={imageStats.solutionTotal}
              color={theme.palette.secondary.main}
            />
          )}
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {sections.map((section) => {
          const groupIds = section.questions.map((x) => x.id);
          const groupSelected = groupIds.filter((id) => selected.has(id)).length;
          const allGroupSelected = groupSelected === groupIds.length && groupIds.length > 0;

          return (
            <Box key={section.key} sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper', py: 0.5 }}>
                <Checkbox
                  size="small"
                  checked={allGroupSelected}
                  indeterminate={groupSelected > 0 && !allGroupSelected}
                  inputProps={{ 'aria-label': `Select every question in ${section.title}` }}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (allGroupSelected) groupIds.forEach((id) => next.delete(id));
                      else groupIds.forEach((id) => next.add(id));
                      baseRef.current = next;
                      return next;
                    })
                  }
                  sx={{ p: 0.75 }}
                />
                <Typography variant="subtitle2" color="text.secondary">
                  {section.title}
                </Typography>
              </Box>

              {section.questions.map((item) => (
                <PaperQuestionRow
                  key={item.id}
                  question={item}
                  selected={selected.has(item.id)}
                  active={item.id === activeQuestionId}
                  tagCount={tagCounts[item.id] ?? 0}
                  position={positions.get(item.id)}
                  linked={!!item.choice_group_id}
                  onToggleSelect={(shiftKey) => toggleOne(item, shiftKey)}
                  onActivate={() => onActivate(item.id)}
                />
              ))}
            </Box>
          );
        })}
      </Box>

      {(selected.size > 0 || (mode === 'images' && pendingImageCount > 0)) && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed', left: 0, right: 0, bottom: { xs: 56, sm: 0 }, zIndex: 30,
            p: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))',
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 1,
          }}
        >
          {selected.size > 0 && (
            <>
              <Typography variant="body2" fontWeight={700}>{selected.size} selected</Typography>
              {mode === 'edit' && (
                <>
                  <Select
                    size="small"
                    value={bulkSection}
                    displayEmpty
                    disabled={applyingSection}
                    onChange={(e) => setBulkSection(e.target.value as QBQuestionSection)}
                    SelectDisplayProps={{ 'aria-label': 'Section to move the selected questions into' }}
                    sx={{ minWidth: 180, minHeight: 44 }}
                  >
                    <MenuItem value="" disabled><em>Move to section...</em></MenuItem>
                    {QB_SECTIONS.map((s) => (
                      <MenuItem key={s} value={s} sx={{ minHeight: 44 }}>{qbSectionLabel(s)}</MenuItem>
                    ))}
                  </Select>
                  <Button variant="contained" onClick={applyBulkSection} disabled={!bulkSection || applyingSection}
                    startIcon={applyingSection ? <CircularProgress size={16} color="inherit" /> : undefined}
                    sx={{ textTransform: 'none', minHeight: 44, minWidth: 100 }}>
                    {applyingSection ? 'Moving...' : 'Apply'}
                  </Button>
                </>
              )}
              {/* The paper header used to carry "Deactivate 90" on every visit.
                  It belongs here, scoped to rows the teacher actually ticked,
                  next to the other things you do to a selection. */}
              <Tooltip title="Hide the selected questions from students. Nothing is deleted." arrow>
                <Button
                  size="small"
                  color="warning"
                  startIcon={
                    settingActive === 'deactivate'
                      ? <CircularProgress size={16} color="inherit" />
                      : <VisibilityOffOutlinedIcon sx={{ fontSize: 18 }} />
                  }
                  onClick={() => applySetActive(false)}
                  disabled={settingActive !== null}
                  sx={{ textTransform: 'none', minHeight: 44 }}
                >
                  {settingActive === 'deactivate' ? 'Hiding...' : 'Deactivate'}
                </Button>
              </Tooltip>
              <Tooltip title="Permanently remove questions that never really belonged on this paper" arrow>
                <Button
                  size="small"
                  color="error"
                  startIcon={<DeleteOutlineIcon sx={{ fontSize: 18 }} />}
                  onClick={openDeleteDialog}
                  sx={{ textTransform: 'none', minHeight: 44 }}
                >
                  Delete
                </Button>
              </Tooltip>
              <IconButton
                aria-label="More actions for the selected questions"
                aria-haspopup="true"
                onClick={(e) => setMoreAnchor(e.currentTarget)}
                sx={{ minWidth: 44, minHeight: 44, border: '1px solid', borderColor: 'divider' }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
              <Menu anchorEl={moreAnchor} open={!!moreAnchor} onClose={() => setMoreAnchor(null)}>
                <MenuItem
                  onClick={() => { setMoreAnchor(null); applySetActive(true); }}
                  disabled={settingActive !== null}
                  sx={{ minHeight: 44 }}
                >
                  <ListItemIcon><PlayArrowIcon fontSize="small" color="success" /></ListItemIcon>
                  <ListItemText
                    primary="Activate"
                    secondary="Only the ones that already have an answer key"
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </MenuItem>
                <MenuItem
                  onClick={() => { setMoreAnchor(null); applyBulkNeedsImage(true); }}
                  disabled={applyingNeedsImage !== null}
                  sx={{ minHeight: 44 }}
                >
                  <ListItemText>Needs a figure</ListItemText>
                </MenuItem>
                <MenuItem
                  onClick={() => { setMoreAnchor(null); applyBulkNeedsImage(false); }}
                  disabled={applyingNeedsImage !== null}
                  sx={{ minHeight: 44 }}
                >
                  <ListItemText>No figure needed</ListItemText>
                </MenuItem>
                {mode === 'edit' && selected.size >= 2 && (
                  <MenuItem
                    onClick={() => { setMoreAnchor(null); applyLinkChoiceGroup(); }}
                    disabled={linking}
                    sx={{ minHeight: 44 }}
                  >
                    <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
                    <ListItemText
                      primary="Link as either/or"
                      secondary="Attempt any one of these on the paper"
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </MenuItem>
                )}
              </Menu>
              <Button onClick={clearSelection} disabled={applyingSection} sx={{ textTransform: 'none', minHeight: 44 }}>
                Clear
              </Button>
            </>
          )}

          {selected.size === 0 && mode === 'images' && pendingImageCount > 0 && (
            <Button
              variant="contained"
              startIcon={savingImages ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              onClick={onSaveAllImages}
              disabled={savingImages}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              {savingImages
                ? `Saving ${saveImageProgress.done}/${saveImageProgress.total}...`
                : `Save All (${pendingImageCount})`}
            </Button>
          )}
        </Paper>
      )}

      {/* Permanent, guarded server-side: a question a student has already
          answered, that a test is holding, or that has drawing submissions
          against it comes back refused rather than silently dropped. For a
          placeholder question that was never really on this paper (e.g. an
          auto-generated drawing slot with no real content), this is the
          escape hatch Deactivate does not offer. */}
      <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>
          Delete {selected.size} question{selected.size !== 1 ? 's' : ''} permanently?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This cannot be undone. Questions that a student has already answered, that a test is
            holding, or that have drawing submissions against them will be kept and listed back to
            you. If you only want to stop students seeing these, use Deactivate instead.
          </Typography>
          {deleteRefused.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {deleteRefused.length} question{deleteRefused.length !== 1 ? 's were' : ' was'} kept
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {deleteRefused.slice(0, 6).map((r) => (
                  <li key={r.question_id}>
                    <Typography variant="body2">{r.blockers[0]}</Typography>
                  </li>
                ))}
              </Box>
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting} sx={{ textTransform: 'none', minHeight: 44 }}>
            {deleteRefused.length > 0 ? 'Close' : 'Cancel'}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={applyBulkDelete}
            disabled={deleting}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            {deleting ? 'Deleting...' : 'Delete permanently'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/**
 * One labelled progress track.
 *
 * Labelled, because there are two of them now and an unlabelled pair of bars
 * is a puzzle. The count leads: "3/40" is the number a teacher is watching.
 */
function TrackBar({
  label,
  done,
  total,
  color,
}: {
  label: string;
  done: number;
  total: number;
  color: string;
}) {
  const value = total > 0 ? (done / total) * 100 : 0;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ whiteSpace: 'nowrap', minWidth: 62 }}
      >
        {label}
      </Typography>
      <Typography variant="caption" fontWeight={600} sx={{ whiteSpace: 'nowrap', minWidth: 44 }}>
        {done}/{total}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={value}
        aria-label={`${label}: ${done} of ${total} done`}
        sx={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          bgcolor: alpha(color, 0.12),
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
        }}
      />
    </Box>
  );
}
