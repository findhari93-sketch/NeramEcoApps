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
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import SaveIcon from '@mui/icons-material/Save';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { NexusQBQuestion, QBQuestionSection, QBReportGroup } from '@neram/database';
import {
  QB_REPORT_TARGET_LABELS,
  QB_SECTION_ORDER,
  qbSectionLabel,
  QB_SECTIONS,
  needsAnswerKey,
  solutionVideosOf,
} from '@neram/database';
import {
  questionReferencesFigure,
  questionMissingImages,
  questionMissingSolutionImage,
} from '@/lib/qb-image-needs';
import { questionMissingAnswerKey } from '@/lib/qb-activation';
import PaperQuestionRow from './PaperQuestionRow';
import PaperVideoRow from './PaperVideoRow';
import type { VideoLinkDrafts, VideoPasteSummary, VideoRowState } from '@/hooks/useVideoLinkDrafts';
import { sectionVideoProgress, type SectionVideoProgress } from '@/lib/paper-video-progress';

/** Screen-reader-only text. Width '1px', never 1: MUI reads 1 as 100%. */
const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

export type PaperQuestionMode = 'edit' | 'images' | 'videos';

/**
 * What outstanding work the list is narrowed to.
 *
 * Was `ImageFilter`, and only applied in Images mode. It covers two backlogs
 * now (figures and worked solutions) and applies in both modes: "show me what
 * still needs doing" is not a thing a teacher only wants while pasting.
 * `'inactive'` narrows to questions hidden from students, so a teacher can
 * find the handful that got deactivated without scanning the whole paper.
 * `'drawing'` is a lens rather than a backlog: the two or three drawings of a
 * paper, which are worked through on their own and by a different person.
 * `'missing-video'` is the questions with no saved solution video, in both
 * modes. `'unsaved-video'` is Videos mode's pending rows, for checking a paste.
 * `'reported'` is the questions a student has an open report on.
 * `'missing-answer'` is the MCQ and numerical questions with no answer key,
 * the first stage of a paper: nothing goes live until it is empty.
 */
export type NeedsFilter =
  | 'all'
  | 'missing-answer'
  | 'figures'
  | 'missing-figure'
  | 'missing-solution'
  | 'missing-video'
  | 'unsaved-video'
  | 'reported'
  | 'drawing'
  | 'inactive';

/** Videos mode, owned by PaperWorkspace so drafts outlive a mode switch. */
export interface PaperVideosProps {
  drafts: VideoLinkDrafts;
  onOpenPaste: () => void;
  /** Search the channel for this paper's videos. Absent, the button is not offered. */
  onOpenYouTube?: () => void;
  onSave: () => void;
}

/** A row Save would change, or one that needs the teacher's attention. */
function isPendingVideo(state: VideoRowState): boolean {
  return (
    state === 'draft-new' ||
    state === 'draft-replace' ||
    state === 'draft-clear' ||
    state === 'invalid' ||
    state === 'error'
  );
}

/** "Students reported a problem: Video solution (2)", the row flag's name. */
function reportSummary(groups: QBReportGroup[] | undefined): string | null {
  if (!groups || groups.length === 0) return null;
  const parts = groups.map(
    (g) => `${QB_REPORT_TARGET_LABELS[g.target]}${g.part_label ? ` part ${g.part_label}` : ''} (${g.students})`,
  );
  return `Students reported a problem: ${parts.join(', ')}`;
}

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
  /** Permanent delete, guarded server-side. Refused rows are reported back, not silently skipped. */
  onDeleteQuestions: (questionIds: string[]) => Promise<{ deleted: number; refused: DeleteRefusal[] }>;
  /** Hide or re-show just the ticked questions. Replaces the header's paper-wide Deactivate. */
  onSetActiveQuestions: (questionIds: string[], active: boolean) => Promise<void>;
  /** Videos mode. Absent, the mode is not offered. */
  videos?: PaperVideosProps;
  /** Open student reports by question id: the "Reported" chip and the row flags. */
  reports?: Record<string, QBReportGroup[]>;
  /** Close a video report from its row, once the reported link has been replaced. */
  onTellVideoFixed?: (questionId: string, group: QBReportGroup) => void;
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
  onDeleteQuestions,
  onSetActiveQuestions,
  videos,
  reports,
  onTellVideoFixed,
}: PaperQuestionListProps) {
  const theme = useTheme();
  /** Videos mode's props when that mode is on, else null: a truthy check TypeScript can narrow on. */
  const videoMode = mode === 'videos' && videos ? videos : null;
  const [showSkipped, setShowSkipped] = useState(false);
  /** Each Videos-mode field, so Enter can move to the next question's. */
  const videoInputs = useRef(new Map<string, HTMLInputElement>());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSection, setBulkSection] = useState<QBQuestionSection | ''>('');
  const [applyingSection, setApplyingSection] = useState(false);
  const [applyingNeedsImage, setApplyingNeedsImage] = useState<'needed' | 'not-needed' | null>(null);
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
      // Videos mode has no tick boxes, so there is nothing for Select all to tick.
      if (mode === 'videos') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, mode]);

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

  /**
   * The ticked rows split by whether students can see them, in tick order.
   *
   * The bar offered "Deactivate" for any selection, including one where every
   * row was already hidden, and kept Activate in the overflow. Each button now
   * acts only on the rows it can change, so a mixed selection never sends an
   * already-live row to Activate or an already-hidden one to Deactivate.
   */
  const { hiddenIds, liveIds } = useMemo(() => {
    const byId = new Map(questions.map((q) => [q.id, q]));
    const hidden: string[] = [];
    const live: string[] = [];
    selected.forEach((id) => {
      const question = byId.get(id);
      if (!question) return;
      (question.is_active ? live : hidden).push(id);
    });
    return { hiddenIds: hidden, liveIds: live };
  }, [questions, selected]);
  const mixedVisibility = hiddenIds.length > 0 && liveIds.length > 0;

  /**
   * No confirmation dialog, unlike the paper-wide version this replaces. The
   * teacher ticked these rows, the count is on the bar in front of them, and
   * the result is reversible from the same bar.
   */
  const applySetActive = async (active: boolean) => {
    const ids = active ? hiddenIds : liveIds;
    if (ids.length === 0) return;
    setSettingActive(active ? 'activate' : 'deactivate');
    try {
      await onSetActiveQuestions(ids, active);
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
  const inactiveCount = useMemo(() => bySection.filter((q) => !q.is_active).length, [bySection]);
  const missingAnswerCount = useMemo(() => bySection.filter(questionMissingAnswerKey).length, [bySection]);
  /** Offered on any paper with something to key, so a finished paper reads "No answer key 0". */
  const paperNeedsKeys = useMemo(
    () => questions.some((q) => needsAnswerKey(q.question_format)),
    [questions],
  );
  // Saved state, not drafts: a row must not leave the "No video" queue while the
  // teacher is still typing its link. The Videos progress bar counts drafts.
  const missingVideoCount = useMemo(
    () => bySection.filter((q) => solutionVideosOf(q).length === 0).length,
    [bySection],
  );
  const reportedCount = useMemo(
    () => bySection.filter((q) => (reports?.[q.id]?.length ?? 0) > 0).length,
    [bySection, reports],
  );
  /** Whether the flag column is drawn at all: only on a paper someone has reported. */
  const paperHasReports = useMemo(
    () => !!reports && Object.values(reports).some((groups) => groups.length > 0),
    [reports],
  );
  const rowState = videos?.drafts.rowState;
  const unsavedVideoCount = useMemo(
    () => (rowState ? bySection.filter((q) => isPendingVideo(rowState(q))).length : 0),
    [bySection, rowState],
  );

  /**
   * The drawings of this paper.
   *
   * On `question_format`, never on `section`. The Section select below is built
   * from stored sections, and prod holds papers nobody has run "Fill in missing
   * sections" on, where a drawing sits under Unsectioned and the select offers
   * no Drawing option at all. The format is never null and never guessed, so
   * this chip finds them either way, which is what earns it its place next to
   * a select that mostly does the same job.
   *
   * Visibility off the whole paper so narrowing to Aptitude does not make the
   * chip vanish; the count off the section in view so the number describes what
   * is on screen. Same split the Solution missing chip already uses.
   */
  const paperHasDrawings = useMemo(
    () => questions.some((q) => q.question_format === 'DRAWING_PROMPT'),
    [questions],
  );
  const drawingCount = useMemo(
    () => bySection.filter((q) => q.question_format === 'DRAWING_PROMPT').length,
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
      needsFilter === 'missing-answer'
        ? questionMissingAnswerKey
        : needsFilter === 'missing-figure'
        ? (q) => questionMissingImages(q)
        : needsFilter === 'missing-solution'
          ? (q) => questionMissingSolutionImage(q)
          : needsFilter === 'missing-video'
            ? (q) => solutionVideosOf(q).length === 0
          : needsFilter === 'unsaved-video'
            ? (q) => (rowState ? isPendingVideo(rowState(q)) : false)
          : needsFilter === 'reported'
            ? (q) => (reports?.[q.id]?.length ?? 0) > 0
          : needsFilter === 'drawing'
            ? (q) => q.question_format === 'DRAWING_PROMPT'
            : needsFilter === 'inactive'
              ? (q) => !q.is_active
              : questionReferencesFigure;
    return bySection.filter(predicate);
  }, [bySection, needsFilter, rowState, reports]);

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
        const low = Math.min(...numbers);
        const high = Math.max(...numbers);
        const range = !numbers.length ? '' : low === high ? ` (Q${low})` : ` (Q${low} to Q${high})`;
        return {
          key,
          title: `${key === '__none__' ? 'Unsectioned' : qbSectionLabel(key)}${range}`,
          questions: group.questions,
        };
      });
  }, [visibleQuestions]);

  /**
   * Videos done per section, over the whole paper. Deliberately not
   * `visibleQuestions`: with "No video" on, the list holds only the gaps and a
   * section would read 0/21.
   */
  const hasVideoNow = videoMode?.drafts.hasVideoNow;
  const videoProgress = useMemo(
    () => (hasVideoNow ? sectionVideoProgress(questions, hasVideoNow) : []),
    [questions, hasVideoNow],
  );
  const videoProgressByKey = useMemo(
    () => new Map(videoProgress.map((row) => [row.key as string, row])),
    [videoProgress],
  );

  /**
   * Enter in one question's field moves to the next one down, in the order on
   * screen, skipping drawings whose videos are set per part. A run of pastes
   * is then paste, Enter, paste, Enter, with no mouse.
   */
  const focusNextVideoField = (fromId: string) => {
    const order = sections.flatMap((s) => s.questions).map((q) => q.id).filter((id) => videoInputs.current.has(id));
    const next = order[order.indexOf(fromId) + 1];
    const el = next ? videoInputs.current.get(next) : undefined;
    if (!el) return;
    el.focus();
    el.scrollIntoView({ block: 'nearest' });
  };

  const allSelected = selected.size > 0 && selected.size === questions.length;
  const someSelected = selected.size > 0 && !allSelected;

  /**
   * The work queues, in the order a paper is actually worked through: see
   * everything, then the figures, then the solutions.
   *
   * "Solution missing" is hidden on a paper that owes none at all, and
   * "Drawing" on a paper that has none, rather than sitting there permanently
   * reading 0.
   */
  const needsChips: {
    value: NeedsFilter;
    label: string;
    count: number;
    color: 'primary' | 'warning' | 'secondary' | 'error';
  }[] = [
    { value: 'all', label: 'All', count: bySection.length, color: 'primary' },
    // Right after All: a mistake students are still learning from outranks
    // every backlog below. Absent until a student reports something.
    ...(reportedCount > 0 || needsFilter === 'reported'
      ? ([{ value: 'reported' as const, label: 'Reported', count: reportedCount, color: 'error' as const }])
      : []),
    ...(paperNeedsKeys || needsFilter === 'missing-answer'
      ? ([
          {
            value: 'missing-answer' as const,
            label: 'No answer key',
            count: missingAnswerCount,
            color: 'warning' as const,
          },
        ])
      : []),
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
    { value: 'missing-video', label: 'No video', count: missingVideoCount, color: 'secondary' },
    ...((videoMode && videoMode.drafts.unsavedCount > 0) || needsFilter === 'unsaved-video'
      ? ([
          {
            value: 'unsaved-video' as const,
            label: 'Unsaved',
            count: unsavedVideoCount,
            color: 'primary' as const,
          },
        ])
      : []),
    ...(paperHasDrawings || needsFilter === 'drawing'
      ? ([
          {
            value: 'drawing' as const,
            label: 'Drawing',
            count: drawingCount,
            color: 'primary' as const,
          },
        ])
      : []),
    { value: 'inactive', label: 'Inactive', count: inactiveCount, color: 'secondary' },
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
          {!videoMode && (
            <Checkbox
              size="small"
              checked={allSelected}
              indeterminate={someSelected}
              onChange={() => (selected.size > 0 ? clearSelection() : selectAll())}
              inputProps={{ 'aria-label': allSelected ? 'Clear selection' : 'Select every question' }}
              sx={{ p: 0.75 }}
            />
          )}
          <Box aria-live="polite" sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} noWrap>
              {selected.size > 0 && !videoMode
                ? `${selected.size} of ${questions.length} selected`
                : visibleQuestions.length === questions.length
                  ? `${questions.length} question${questions.length === 1 ? '' : 's'}`
                  : `${visibleQuestions.length} of ${questions.length} questions`}
            </Typography>
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* Icons only on a phone: three labelled buttons pushed over the
              question count at 375px. Each keeps its name for screen readers
              and a tooltip for everyone else. */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, next) => next && onModeChange(next)}
            sx={{ height: { xs: 44, sm: 36 }, flexShrink: 0 }}
          >
            {(
              [
                { value: 'edit', label: 'Edit', Icon: EditOutlinedIcon },
                { value: 'images', label: 'Images', Icon: CollectionsOutlinedIcon },
                ...(videos ? [{ value: 'videos', label: 'Videos', Icon: VideoLibraryOutlinedIcon }] : []),
              ] as const
            ).map(({ value, label, Icon }) => (
              <ToggleButton
                key={value}
                value={value}
                aria-label={label}
                title={label}
                sx={{ px: 1, minWidth: 44, textTransform: 'none' }}
              >
                <Icon sx={{ fontSize: { xs: 20, sm: 16 }, mr: { xs: 0, sm: 0.5 } }} />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  {label}
                </Box>
              </ToggleButton>
            ))}
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

      {videoMode && (
        <VideoModeHeader
          drafts={videoMode.drafts}
          total={questions.length}
          sections={videoProgress}
          onShowMissing={(key) => {
            onSectionFilterChange(key);
            onNeedsFilterChange('missing-video');
          }}
          color={theme.palette.success.main}
          onOpenPaste={videoMode.onOpenPaste}
          onOpenYouTube={videoMode.onOpenYouTube}
          showSkipped={showSkipped}
          onToggleSkipped={() => setShowSkipped((v) => !v)}
        />
      )}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          // Room for the fixed Save bar, so it never sits over the last rows.
          pb: videoMode && videoMode.drafts.unsavedCount > 0 ? 12 : 0,
        }}
      >
        {sections.map((section) => {
          const groupIds = section.questions.map((x) => x.id);
          const groupSelected = groupIds.filter((id) => selected.has(id)).length;
          const allGroupSelected = groupSelected === groupIds.length && groupIds.length > 0;

          return (
            <Box key={section.key} sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper', py: 0.5, minHeight: 36 }}>
                {!videoMode && (
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
                )}
                <Typography variant="subtitle2" color="text.secondary" sx={videoMode ? { pl: 1 } : undefined}>
                  {section.title}
                </Typography>
                {videoMode && videoProgress.length > 1 && videoProgressByKey.has(section.key) && (
                  <SectionVideoCount row={videoProgressByKey.get(section.key)!} />
                )}
              </Box>

              {videoMode && section.questions.map((item) => {
                const number = item.display_order ?? positions.get(item.id) ?? 0;
                return (
                  <PaperVideoRow
                    key={item.id}
                    question={item}
                    number={number}
                    value={videoMode.drafts.valueFor(item.id)}
                    state={videoMode.drafts.rowState(item)}
                    errorText={videoMode.drafts.errorFor(item.id)}
                    active={item.id === activeQuestionId}
                    onChange={(value) => videoMode.drafts.setDraft(item.id, value)}
                    onActivate={() => onActivate(item.id)}
                    onEnter={() => focusNextVideoField(item.id)}
                    onBulkPaste={(text) => {
                      videoMode.drafts.pasteText(text, number);
                      setShowSkipped(false);
                    }}
                    inputRef={(el) => {
                      if (el) videoInputs.current.set(item.id, el);
                      else videoInputs.current.delete(item.id);
                    }}
                    onKeepSaved={() => videoMode.drafts.revert(item.id)}
                    videoReport={reports?.[item.id]?.find((g) => g.target === 'video' && !g.part_label)}
                    onTellFixed={onTellVideoFixed ? (group) => onTellVideoFixed(item.id, group) : undefined}
                  />
                );
              })}

              {!videoMode && section.questions.map((item) => (
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
                  showReportColumn={paperHasReports}
                  reportSummary={reportSummary(reports?.[item.id])}
                />
              ))}
            </Box>
          );
        })}
      </Box>

      {videoMode && videoMode.drafts.unsavedCount > 0 && (
        <VideoSaveBar drafts={videoMode.drafts} onSave={videoMode.onSave} />
      )}

      {!videoMode && (selected.size > 0 || (mode === 'images' && pendingImageCount > 0)) && (
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
              {/* Only the action that would change something is shown: Activate
                  for hidden rows, Deactivate for live ones, and both, each
                  counted, when the selection holds some of each.
                  describeChild keeps the visible label as the accessible name;
                  the tooltip is extra detail, not a replacement for it. */}
              {hiddenIds.length > 0 && (
                <Tooltip
                  describeChild
                  title="Show the selected hidden questions to students again. Questions with no answer key stay hidden."
                  arrow
                >
                  <Button
                    size="small"
                    color="success"
                    startIcon={
                      settingActive === 'activate'
                        ? <CircularProgress size={16} color="inherit" />
                        : <VisibilityOutlinedIcon sx={{ fontSize: 18 }} />
                    }
                    onClick={() => applySetActive(true)}
                    disabled={settingActive !== null}
                    sx={{ textTransform: 'none', minHeight: 44 }}
                  >
                    {settingActive === 'activate'
                      ? 'Activating...'
                      : mixedVisibility ? `Activate ${hiddenIds.length}` : 'Activate'}
                  </Button>
                </Tooltip>
              )}
              {liveIds.length > 0 && (
                <Tooltip describeChild title="Hide the selected questions from students. Nothing is deleted." arrow>
                  <Button
                    size="small"
                    color="inherit"
                    startIcon={
                      settingActive === 'deactivate'
                        ? <CircularProgress size={16} color="inherit" />
                        : <VisibilityOffOutlinedIcon sx={{ fontSize: 18, color: 'warning.main' }} />
                    }
                    onClick={() => applySetActive(false)}
                    disabled={settingActive !== null}
                    sx={{ textTransform: 'none', minHeight: 44 }}
                  >
                    {settingActive === 'deactivate'
                      ? 'Hiding...'
                      : mixedVisibility ? `Deactivate ${liveIds.length}` : 'Deactivate'}
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
                {/* "Link as either/or" lived here, linking whole questions. The
                    papers put the OR inside one question number, so either/or
                    is now a question's parts (DrawingPartsEditor). */}
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

/**
 * Videos mode's header: progress, the paste entry point, and what the last
 * paste did. The summary stays until Save or dismiss, so a teacher checking 59
 * rows can come back to it.
 */
function VideoModeHeader({
  drafts,
  total,
  sections,
  onShowMissing,
  color,
  onOpenPaste,
  onOpenYouTube,
  showSkipped,
  onToggleSkipped,
}: {
  drafts: VideoLinkDrafts;
  total: number;
  sections: SectionVideoProgress[];
  onShowMissing: (key: SectionVideoProgress['key']) => void;
  color: string;
  onOpenPaste: () => void;
  onOpenYouTube?: () => void;
  showSkipped: boolean;
  onToggleSkipped: () => void;
}) {
  // One bar per section once there is more than one: "Aptitude 50/50" is the
  // number a teacher checks, and a paper total averages it away.
  const perSection = sections.length > 1;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1, px: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: perSection ? 'flex-start' : 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
          {perSection ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography variant="caption" fontWeight={700}>
                  Videos
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {`${drafts.withVideoCount} of ${total} in all`}
                </Typography>
              </Box>
              {sections.map((row) => (
                <SectionTrack key={row.key} row={row} color={color} onShowMissing={() => onShowMissing(row.key)} />
              ))}
            </Box>
          ) : (
            <TrackBar label="Videos" done={drafts.withVideoCount} total={total} color={color} />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flexShrink: 0 }}>
          {onOpenYouTube && (
            <Button
              variant="contained"
              size="small"
              startIcon={<TravelExploreIcon sx={{ fontSize: 18 }} />}
              onClick={onOpenYouTube}
              sx={{ minHeight: 44, textTransform: 'none' }}
            >
              Find on YouTube
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            startIcon={<ContentPasteIcon sx={{ fontSize: 18 }} />}
            onClick={onOpenPaste}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Paste a list
          </Button>
        </Box>
      </Box>
      {drafts.summary && (
        <PasteSummaryAlert
          summary={drafts.summary}
          onClose={drafts.dismissSummary}
          showSkipped={showSkipped}
          onToggleSkipped={onToggleSkipped}
        />
      )}
    </Box>
  );
}

/**
 * One section's progress. On a phone the name, count and action share a line
 * and the bar runs full width beneath them; from sm up it is one row.
 *
 * A finished section says so in words beside a tick, so the state never rests
 * on the bar's colour alone. An unfinished one offers to show its gaps.
 */
function SectionTrack({
  row,
  color,
  onShowMissing,
}: {
  row: SectionVideoProgress;
  color: string;
  onShowMissing: () => void;
}) {
  const value = row.total > 0 ? (row.done / row.total) * 100 : 0;
  return (
    <Box
      sx={{
        display: 'grid',
        alignItems: 'center',
        columnGap: 1,
        gridTemplateColumns: { xs: 'minmax(0, 1fr) auto auto', sm: 'minmax(0, 170px) 52px minmax(60px, 1fr) auto' },
        gridTemplateAreas: { xs: '"label count action" "bar bar bar"', sm: '"label count bar action"' },
      }}
    >
      <Typography variant="caption" color="text.secondary" noWrap sx={{ gridArea: 'label' }}>
        {row.label}
      </Typography>
      <Typography variant="caption" fontWeight={600} sx={{ gridArea: 'count', whiteSpace: 'nowrap' }}>
        {row.done}/{row.total}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={value}
        aria-label={`${row.label}: ${row.done} of ${row.total} done`}
        sx={{
          gridArea: 'bar',
          height: 6,
          borderRadius: 3,
          bgcolor: alpha(color, 0.12),
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
        }}
      />
      <Box sx={{ gridArea: 'action', display: 'flex', alignItems: 'center', minHeight: 44, justifyContent: 'flex-end' }}>
        {row.complete ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.dark' }}>
            <CheckCircleIcon aria-hidden sx={{ fontSize: 16 }} />
            <Typography variant="caption" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>
              All have a video
            </Typography>
          </Box>
        ) : (
          <Button
            size="small"
            onClick={onShowMissing}
            aria-label={`Show ${row.missing} ${row.label} question${row.missing === 1 ? '' : 's'} without a video`}
            sx={{ minHeight: 44, textTransform: 'none', whiteSpace: 'nowrap' }}
          >
            Show {row.missing}
          </Button>
        )}
      </Box>
    </Box>
  );
}

/** A section heading's own count, so it stays in view while scrolling. */
function SectionVideoCount({ row }: { row: SectionVideoProgress }) {
  return (
    <Box
      sx={{
        ml: 'auto',
        pr: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        color: row.complete ? 'success.dark' : 'text.secondary',
      }}
    >
      {row.complete && <CheckCircleIcon aria-hidden sx={{ fontSize: 14 }} />}
      <Typography variant="caption" fontWeight={600} component="span">
        {row.done}/{row.total}
      </Typography>
      <Box component="span" sx={visuallyHidden}>
        {row.complete ? 'every question here has a video' : 'questions here have a video'}
      </Box>
    </Box>
  );
}

function PasteSummaryAlert({
  summary,
  onClose,
  showSkipped,
  onToggleSkipped,
}: {
  summary: VideoPasteSummary;
  onClose: () => void;
  showSkipped: boolean;
  onToggleSkipped: () => void;
}) {
  const filled = summary.added + summary.replaced;
  const skipped = summary.unmatched.length;
  const parts: string[] = [];
  if (filled > 0) {
    const detail = [
      summary.added > 0 ? `${summary.added} new` : null,
      summary.replaced > 0 ? `${summary.replaced} replace a saved link` : null,
    ]
      .filter(Boolean)
      .join(', ');
    parts.push(`${filled} link${filled === 1 ? '' : 's'} filled in (${detail}).`);
  } else {
    parts.push('No links were filled in.');
  }
  if (summary.unchanged > 0) parts.push(`${summary.unchanged} already saved.`);
  if (summary.mode === 'ordered') parts.push('No question numbers were found, so links went in line order.');
  if (filled > 0) parts.push('Check the highlighted rows, then Save.');

  return (
    <Alert
      severity={skipped > 0 || filled === 0 ? 'warning' : 'success'}
      role="status"
      onClose={onClose}
      sx={{ '& .MuiAlert-message': { width: '100%' } }}
    >
      <Typography variant="body2">{parts.join(' ')}</Typography>
      {summary.duplicates.map((d) => (
        <Typography key={d.number} variant="body2" sx={{ mt: 0.5 }}>
          Q{d.number} was in the list {d.lines.length} times, so the last link (line{' '}
          {d.lines[d.lines.length - 1]}) is used.
        </Typography>
      ))}
      {skipped > 0 && (
        <>
          <Button
            size="small"
            onClick={onToggleSkipped}
            aria-expanded={showSkipped}
            sx={{ mt: 0.5, ml: -1, minHeight: 44, textTransform: 'none', color: 'inherit', fontWeight: 700 }}
          >
            {showSkipped ? 'Hide' : 'Show'} the {skipped} line{skipped === 1 ? '' : 's'} that were skipped
          </Button>
          {showSkipped && (
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {summary.unmatched.map((u) => (
                <li key={`${u.line}-${u.text}`}>
                  <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                    Line {u.line}: {u.reason}
                  </Typography>
                </li>
              ))}
            </Box>
          )}
        </>
      )}
    </Alert>
  );
}

/** The one place Videos mode saves from, fixed to the bottom like the other bars. */
function VideoSaveBar({ drafts, onSave }: { drafts: VideoLinkDrafts; onSave: () => void }) {
  const ready = drafts.unsavedCount - drafts.invalidCount;
  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: { xs: 56, sm: 0 },
        zIndex: 30,
        p: 1.5,
        pb: 'calc(12px + env(safe-area-inset-bottom))',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
      }}
    >
      <Typography variant="body2" fontWeight={700} aria-live="polite">
        {drafts.unsavedCount} unsaved change{drafts.unsavedCount === 1 ? '' : 's'}
        {drafts.invalidCount > 0
          ? `, ${drafts.invalidCount} link${drafts.invalidCount === 1 ? '' : 's'} to fix first`
          : ''}
      </Typography>
      <Button onClick={drafts.discard} disabled={drafts.saving} sx={{ minHeight: 44, textTransform: 'none' }}>
        Discard
      </Button>
      <Button
        variant="contained"
        onClick={onSave}
        disabled={drafts.saving || ready === 0}
        startIcon={drafts.saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
        sx={{ minHeight: 44, textTransform: 'none' }}
      >
        {drafts.saving ? 'Saving...' : `Save ${ready}`}
      </Button>
    </Paper>
  );
}
