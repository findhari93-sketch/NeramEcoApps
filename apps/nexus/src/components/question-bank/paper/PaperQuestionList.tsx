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
  LinearProgress,
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
import type { NexusQBQuestion, QBQuestionSection } from '@neram/database';
import { QB_SECTION_ORDER, qbSectionLabel, QB_SECTIONS } from '@neram/database';
import { questionReferencesFigure, questionMissingImages } from '@/lib/qb-image-needs';
import PaperQuestionRow from './PaperQuestionRow';

export type PaperQuestionMode = 'edit' | 'images';
export type ImageFilter = 'all' | 'figures' | 'missing';

/** A section the list can be narrowed to, or '__none__' for unsectioned rows. */
export type PaperSectionFilter = QBQuestionSection | '__none__';

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
  imageFilter: ImageFilter;
  onImageFilterChange: (filter: ImageFilter) => void;
  /** Set from the paper header's section chips; cleared here or there. */
  sectionFilter: PaperSectionFilter | null;
  onSectionFilterChange: (filter: PaperSectionFilter | null) => void;
  onBulkSetNeedsImage: (questionIds: string[], value: boolean) => Promise<void>;
  /** Progress across questions that want a picture, counting unsaved work. */
  imageStats: { total: number; withImages: number };
  pendingImageCount: number;
  onSaveAllImages: () => void;
  savingImages: boolean;
  saveImageProgress: { done: number; total: number };
  /** Link two or more selected questions as either/or alternatives. */
  onLinkChoiceGroup: (questionIds: string[]) => Promise<void>;
  /** Permanent delete, guarded server-side. Refused rows are reported back, not silently skipped. */
  onDeleteQuestions: (questionIds: string[]) => Promise<{ deleted: number; refused: DeleteRefusal[] }>;
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
  imageFilter,
  onImageFilterChange,
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
}: PaperQuestionListProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSection, setBulkSection] = useState<QBQuestionSection | ''>('');
  const [applyingSection, setApplyingSection] = useState(false);
  const [applyingNeedsImage, setApplyingNeedsImage] = useState<'needed' | 'not-needed' | null>(null);
  const [linking, setLinking] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteRefused, setDeleteRefused] = useState<DeleteRefusal[]>([]);

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

  // The section chips in the paper header filter this same list, so the
  // section narrowing has to happen before the image filter, and both the
  // image filter chips and the counts below should reflect whatever section
  // is currently in view rather than the whole paper.
  const bySection = useMemo(() => {
    if (!sectionFilter) return questions;
    return questions.filter((q) => (q.section ?? '__none__') === sectionFilter);
  }, [questions, sectionFilter]);

  const figureCount = useMemo(() => bySection.filter(questionReferencesFigure).length, [bySection]);
  const missingCount = useMemo(
    () => bySection.filter((q) => questionMissingImages(q)).length,
    [bySection],
  );

  const visibleQuestions = useMemo(() => {
    if (mode !== 'images' || imageFilter === 'all') return bySection;
    const predicate = imageFilter === 'missing' ? (q: NexusQBQuestion) => questionMissingImages(q) : questionReferencesFigure;
    return bySection.filter(predicate);
  }, [bySection, mode, imageFilter]);

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
  const progress = imageStats.total > 0 ? (imageStats.withImages / imageStats.total) * 100 : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Paper
        variant="outlined"
        sx={{ p: 1, mb: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, borderRadius: 1.5 }}
      >
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
              : `${questions.length} question${questions.length === 1 ? '' : 's'}`}
          </Typography>
        </Box>

        {/* Set from the paper header's section chips (or the "missing an
            image" chip); cleared from either end. */}
        {sectionFilter && (
          <Chip
            label={`Filtering: ${sectionFilter === '__none__' ? 'Unsectioned' : qbSectionLabel(sectionFilter)}`}
            size="small"
            color="primary"
            onDelete={() => onSectionFilterChange(null)}
            sx={{ fontSize: '0.7rem' }}
          />
        )}

        <Box sx={{ flex: 1 }} />

        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, next) => next && onModeChange(next)}
          sx={{ height: 32 }}
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

        {mode === 'images' && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Chip
              label={`All (${questions.length})`}
              size="small"
              onClick={() => onImageFilterChange('all')}
              variant={imageFilter === 'all' ? 'filled' : 'outlined'}
              sx={{ fontSize: '0.7rem' }}
            />
            <Chip
              label={`Figures (${figureCount})`}
              size="small"
              onClick={() => onImageFilterChange('figures')}
              variant={imageFilter === 'figures' ? 'filled' : 'outlined'}
              color={imageFilter === 'figures' ? 'primary' : 'default'}
              sx={{ fontSize: '0.7rem' }}
            />
            <Chip
              label={`Missing (${missingCount})`}
              size="small"
              onClick={() => onImageFilterChange('missing')}
              variant={imageFilter === 'missing' ? 'filled' : 'outlined'}
              color={imageFilter === 'missing' ? 'warning' : 'default'}
              sx={{ fontSize: '0.7rem' }}
            />
          </Box>
        )}
      </Paper>

      {mode === 'images' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 0.5 }}>
          <Typography variant="caption" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>
            {imageStats.withImages}/{imageStats.total}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              bgcolor: alpha(theme.palette.success.main, 0.12),
              '& .MuiLinearProgress-bar': { bgcolor: 'success.main', borderRadius: 3 },
            }}
          />
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
              <Tooltip title="Mark every selected question as needing a figure" arrow>
                <Button
                  size="small"
                  onClick={() => applyBulkNeedsImage(true)}
                  disabled={applyingNeedsImage !== null}
                  sx={{ textTransform: 'none', minHeight: 44 }}
                >
                  {applyingNeedsImage === 'needed' ? 'Marking...' : 'Needs a figure'}
                </Button>
              </Tooltip>
              <Tooltip title="Mark every selected question as not needing a figure" arrow>
                <Button
                  size="small"
                  onClick={() => applyBulkNeedsImage(false)}
                  disabled={applyingNeedsImage !== null}
                  sx={{ textTransform: 'none', minHeight: 44 }}
                >
                  {applyingNeedsImage === 'not-needed' ? 'Marking...' : 'No figure needed'}
                </Button>
              </Tooltip>
              {mode === 'edit' && selected.size >= 2 && (
                <Tooltip title="Attempt any one of these on the paper" arrow>
                  <Button
                    size="small"
                    onClick={applyLinkChoiceGroup}
                    disabled={linking}
                    startIcon={linking ? <CircularProgress size={16} color="inherit" /> : undefined}
                    sx={{ textTransform: 'none', minHeight: 44 }}
                  >
                    {linking ? 'Linking...' : 'Link as either/or'}
                  </Button>
                </Tooltip>
              )}
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
