'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  RadioGroup,
  FormControlLabel,
  Radio,
  Paper,
  Chip,
  IconButton,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  MenuItem,
  Select,
  Alert,
  alpha,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type {
  NexusQBOriginalPaper,
  NexusQBQuestion,
  NexusQBQuestionSource,
  QBQuestionFormat,
  QBDifficulty,
  QBExamRelevance,
  QBExamType,
  NexusQBQuestionOption,
} from '@neram/database';
import type { QBQuestionSection } from '@neram/database';
import {
  QB_CATEGORY_LABELS,
  QB_EXAM_TYPE_LABELS,
  qbSectionsForExam,
  qbSectionLabel,
} from '@neram/database';
import type { ImageState } from '@/lib/bulk-upload-schema';
import ImageUploadZone from '../ImageUploadZone';
import DrawingQuestionPanel from '../DrawingQuestionPanel';
import TagCategoryDialog from '../TagCategoryDialog';
import StudyEditor from './StudyEditor';
import DeleteQuestionDialog from '../DeleteQuestionDialog';
import SolutionVideoField from '../SolutionVideoField';
import DrawingPartsEditor, {
  SplitIntoPartsPrompt,
  formToParts,
  mergePartsText,
  partsFormProblem,
  partsFormTotalMarks,
  partsToForm,
  type DrawingPartsForm,
} from './DrawingPartsEditor';
import MathField from '@/components/common/MathField';
import MathAnswerField from '@/components/common/MathAnswerField';
// The keyword guess has one home, in lib/qb-image-needs.ts. A second copy
// here would drift the moment either changed.
import { questionNeedsImage } from '@/lib/qb-image-needs';
import { defaultOptions, normalizeOptionIds, optionLetter, withOptionAdded } from '@/lib/qb-option-ids';
import OptionAddBar from '../OptionAddBar';

/**
 * Every drawing question in the bank is worth this, so a blank means "nobody has
 * said yet" rather than "worth nothing". The editor fills it in, and a migration
 * backfilled the questions that predate the rule.
 */
const DEFAULT_DRAWING_MARKS = 50;

/** The format names a teacher reads, in place of the column's enum. */
const FORMAT_LABELS: Record<string, string> = {
  MCQ: 'MCQ',
  NUMERICAL: 'Numerical',
  DRAWING_PROMPT: 'Drawing',
  IMAGE_BASED: 'Image based',
  SUBJECTIVE: 'Written answer',
};

/** What a question's Source & Format panel needs when it has no source row. */
export type PaperFallback = Pick<NexusQBOriginalPaper, 'exam_type' | 'year' | 'session'>;

export interface QuestionEditFormProps {
  question: NexusQBQuestion;
  /**
   * The question's source rows, the one for the paper being viewed first.
   * Optional because a question can genuinely have none yet.
   */
  sources?: NexusQBQuestionSource[];
  /**
   * The paper this question was uploaded from, read when there is no source
   * row. Without it the panel fell back to a literal 'NATA' and the current
   * year, which labelled every paper's questions NATA whatever exam they came
   * from. A question reached through a paper can only belong to that paper.
   */
  paper?: PaperFallback;
  /** This question's current tag ids, fetched in batch alongside the paper. */
  tagIds?: string[];
  /** Paper numbers of this question's either/or alternatives, if it has any. */
  choiceGroupSiblings?: number[];
  onUnlinkChoiceGroup?: () => void;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
  onCancel: () => void;
  /**
   * Move this question into another section. Omitted means the control is hidden.
   *
   * Deliberately its own callback rather than a form field: a section write goes
   * to PATCH /api/question-bank/papers/[id]/sections, not the question endpoint,
   * and it saves on the spot. Folding it into the form's dirty state would let
   * Save rewrite a section a teacher only opened the menu on.
   */
  onChangeSection?: (questionId: string, section: QBQuestionSection) => Promise<void>;
  /**
   * Told whenever the form gains or loses unsaved edits, so the pane can ask
   * before moving to another question rather than dropping pasted figures.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The figure each option holds in the database, by its stored id. The baseline
 * a per-figure Save compares against, and the only ids that save can reach:
 * the images route merges by the ids already on the row, so an option added in
 * this form (or renamed by normalizeOptionIds) waits for the full Save.
 */
function savedOptionFigures(question: NexusQBQuestion): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const opt of question.options ?? []) map[opt.id] = opt.image_url ?? null;
  return map;
}

interface FormData {
  /** Null when neither a source row nor a paper says which exam this came from. */
  exam_type: QBExamType | null;
  year: string;
  session: string;
  question_number: string;
  question_format: QBQuestionFormat;
  question_text: string;
  question_text_hi: string;
  question_image?: ImageState;
  options: NexusQBQuestionOption[];
  option_images: Record<string, ImageState | undefined>;
  correct_option_id: string;
  correct_answer: string;
  answer_tolerance: string;
  categories: string[];
  tag_ids: string[];
  difficulty: QBDifficulty;
  exam_relevance: QBExamRelevance;
  topic_id: string;
  sub_topic: string;
  explanation_brief: string;
  explanation_detailed: string;
  solution_video_url: string;
  solution_image?: ImageState;
  // Drawing-only. Sent to the server only when question_format is
  // DRAWING_PROMPT, so switching a question's format cannot smear drawing
  // metadata onto an MCQ.
  drawing_marks: string;
  /** Null for a single-task question. See DrawingPartsEditor. */
  drawing_parts: DrawingPartsForm | null;
}

function getInitialFormData(
  question: NexusQBQuestion,
  sources?: NexusQBQuestionSource[],
  paper?: PaperFallback,
  tagIds?: string[],
): FormData {
  const source = sources?.[0];
  // An option saved as `opt_4_<timestamp>` loads as the next letter, so the
  // next save repairs it.
  const normalized = normalizeOptionIds(question.options ?? [], question.correct_answer);
  // Source row, then the paper, then nothing. Never a made-up exam: showing the
  // wrong exam confidently is worse than showing a blank.
  return {
    exam_type: source?.exam_type ?? paper?.exam_type ?? null,
    year: String(source?.year ?? paper?.year ?? ''),
    session: source?.session ?? paper?.session ?? '',
    question_number: String(source?.question_number ?? question.display_order ?? ''),
    question_format: question.question_format ?? 'MCQ',
    question_text: question.question_text ?? '',
    question_text_hi: question.question_text_hi ?? '',
    question_image: question.question_image_url
      ? { url: question.question_image_url, uploaded: true }
      : undefined,
    options: normalized.options.length ? normalized.options : defaultOptions(),
    option_images: normalized.options.reduce<Record<string, ImageState | undefined>>((acc, opt) => {
      if (opt.image_url) acc[opt.id] = { url: opt.image_url, uploaded: true };
      return acc;
    }, {}),
    correct_option_id: normalized.correctAnswer,
    correct_answer: normalized.correctAnswer,
    answer_tolerance: question.answer_tolerance ? String(question.answer_tolerance) : '',
    categories: question.categories ?? [],
    tag_ids: tagIds ?? [],
    difficulty: question.difficulty ?? 'MEDIUM',
    exam_relevance: question.exam_relevance ?? 'BOTH',
    topic_id: question.topic_id ?? '',
    sub_topic: question.sub_topic ?? '',
    explanation_brief: question.explanation_brief ?? '',
    explanation_detailed: question.explanation_detailed ?? '',
    solution_video_url: question.solution_video_url ?? '',
    solution_image: question.solution_image_url
      ? { url: question.solution_image_url, uploaded: true }
      : undefined,
    drawing_marks:
      question.drawing_marks != null
        ? String(question.drawing_marks)
        : question.question_format === 'DRAWING_PROMPT'
          ? String(DEFAULT_DRAWING_MARKS)
          : '',
    drawing_parts: question.question_format === 'DRAWING_PROMPT' ? partsToForm(question.drawing_parts) : null,
  };
}

function buildSubmitPayload(form: FormData) {
  // tag_ids rides alongside the question row but is not a column on it: the
  // API route strips it out and writes it through setQuestionTags instead.
  const questionData: Partial<NexusQBQuestion> & { tag_ids?: string[] } = {
    tag_ids: form.tag_ids,
    question_text: form.question_text || null,
    question_text_hi: form.question_text_hi || null,
    question_image_url: form.question_image?.uploaded ? form.question_image.url : null,
    question_format: form.question_format,
    options: form.question_format === 'MCQ'
      ? form.options.map((opt) => {
          const img = form.option_images[opt.id];
          // A key on the map is the form's word on this option, including
          // "removed" (undefined). Falling back to the loaded image_url there
          // re-sent the old figure, so a removal could never be saved.
          const fromForm = opt.id in form.option_images;
          return {
            ...opt,
            image_url: fromForm ? (img?.uploaded ? img.url : undefined) : opt.image_url || undefined,
          };
        })
      : null,
    // A drawing has no key and never will, so send null rather than the empty
    // string this used to write. A column every other reader treats as "the
    // key" should not hold a blank.
    correct_answer:
      form.question_format === 'DRAWING_PROMPT'
        ? null
        : form.question_format === 'MCQ'
          ? form.correct_option_id
          : form.correct_answer,
    answer_tolerance:
      form.question_format === 'NUMERICAL' && form.answer_tolerance
        ? Number(form.answer_tolerance)
        : null,
    solution_video_url: form.solution_video_url || null,
    solution_image_url: form.solution_image?.uploaded ? form.solution_image.url : null,
    categories: form.categories,
    topic_id: form.topic_id || null,
  };

  if (form.question_format === 'DRAWING_PROMPT') {
    questionData.drawing_marks = form.drawing_marks ? Number(form.drawing_marks) : null;
    // With parts, the server rebuilds question_text, the marks total and the
    // question-level solution from them, so what this form holds for those
    // is only a fallback.
    questionData.drawing_parts = form.drawing_parts ? formToParts(form.drawing_parts) : null;
    // Difficulty, exam relevance, sub-topic and the two explanation fields are
    // not on a drawing's pane, so they are not in its payload either. The PATCH
    // is a partial update, so a key left out keeps whatever the row holds;
    // sending the form's copy would let a stale value overwrite an edit made on
    // the full editor at Question bank, Questions, Edit.
  } else {
    questionData.difficulty = form.difficulty;
    questionData.exam_relevance = form.exam_relevance;
    questionData.sub_topic = form.sub_topic || null;
    questionData.explanation_brief = form.explanation_brief || null;
    questionData.explanation_detailed = form.explanation_detailed || null;
    questionData.drawing_parts = null;
  }

  return questionData;
}

/**
 * The editing form for one question, extracted from InlineQuestionEditor.
 *
 * No expand and collapse machinery lives here: the detail pane owns which
 * question is open, so this component is always the open one. That is the whole
 * point of the extraction, since an accordion inside a pane that is already a
 * disclosure is one disclosure too many.
 *
 * Save sits in the header and again in the sticky footer while there are
 * unsaved edits: on a question with four option figures the header is
 * scrolled well out of view by the time the last one is pasted. Each option
 * figure also has its own Save, so a teacher can bank Figure A before pasting
 * Figure B, then save the whole question at the end.
 */
export default function QuestionEditForm({
  question,
  sources,
  paper,
  tagIds,
  choiceGroupSiblings,
  onUnlinkChoiceGroup,
  getToken,
  onSaved,
  onCancel,
  onChangeSection,
  onDirtyChange,
}: QuestionEditFormProps) {
  const theme = useTheme();
  const [form, setForm] = useState<FormData>(() => getInitialFormData(question, sources, paper, tagIds));
  const [optionImagesEnabled, setOptionImagesEnabled] = useState(
    () => question.options?.some((o) => !!o.image_url) ?? false
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [sectionSaving, setSectionSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFigures, setSavedFigures] = useState(() => savedOptionFigures(question));
  const [figureSaving, setFigureSaving] = useState<Record<string, boolean>>({});
  const [figureJustSaved, setFigureJustSaved] = useState<Record<string, boolean>>({});
  const [figureError, setFigureError] = useState<Record<string, string>>({});
  /**
   * Hindi is empty on almost every paper, so it costs a field per option and one
   * for the stem to show it by default. Seeded from the question so a paper that
   * does carry Hindi never hides it behind a button nobody would think to press.
   */
  const [showHindi, setShowHindi] = useState(
    () => Boolean(question.question_text_hi) || (question.options ?? []).some((o) => o.text_hi),
  );
  /** A 140px dropzone on a question with no figure is 140px of nothing. */
  const [showImageZone, setShowImageZone] = useState(
    () => Boolean(question.question_image_url) || questionNeedsImage(question),
  );

  // Reload whenever the pane swaps in a different question, or the same one
  // comes back refetched after a save. No `expanded` guard any more: the pane
  // unmounts nothing, so this effect is the only thing that resets the form.
  useEffect(() => {
    setForm(getInitialFormData(question, sources, paper, tagIds));
    setDirty(false);
    setOptionImagesEnabled(question.options?.some((o) => !!o.image_url) ?? false);
    setSavedFigures(savedOptionFigures(question));
    setFigureJustSaved({});
    setFigureError({});
    setShowHindi(Boolean(question.question_text_hi) || (question.options ?? []).some((o) => o.text_hi));
    setShowImageZone(Boolean(question.question_image_url) || questionNeedsImage(question));
  }, [question, sources, paper, tagIds]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // Unmounting (another question, or Images mode) takes the edits with it.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const updateField = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
    },
    []
  );

  const handleOptionTextChange = useCallback((optId: string, text: string) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((o) => (o.id === optId ? { ...o, text } : o)),
    }));
    setDirty(true);
  }, []);

  const handleOptionTextHiChange = useCallback((optId: string, text_hi: string) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((o) => (o.id === optId ? { ...o, text_hi } : o)),
    }));
    setDirty(true);
  }, []);

  const handleOptionImageChange = useCallback((optId: string, img: ImageState | undefined) => {
    setForm((prev) => ({
      ...prev,
      option_images: { ...prev.option_images, [optId]: img },
    }));
    setFigureJustSaved((prev) => ({ ...prev, [optId]: false }));
    setFigureError((prev) => withoutKey(prev, optId));
    setDirty(true);
  }, []);

  /**
   * Save option figures on their own, through the lightweight images route.
   * Deliberately not followed by onSaved(): that refetch re-seeds the whole
   * form and would wipe the answer or text the teacher has not saved yet. The
   * form stays dirty, so the question's own Save is still there at the end.
   *
   * Several ids go in ONE request, never one each: the route reads the options
   * column, merges and writes it back, so two requests in flight together would
   * each write over the other's figure.
   */
  const handleSaveFigures = async (optIds: string[]) => {
    if (optIds.length === 0) return;
    const urls: Record<string, string | null> = {};
    for (const id of optIds) urls[id] = imageUrlOf(form.option_images[id]);
    const mark = <T,>(value: T) => (prev: Record<string, T>) => {
      const next = { ...prev };
      for (const id of optIds) next[id] = value;
      return next;
    };
    setFigureSaving(mark(true));
    setFigureError((prev) => optIds.reduce((acc, id) => withoutKey(acc, id), prev));
    try {
      const token = await getToken();
      if (!token) throw new Error('Auth failed');
      const res = await fetch(`/api/question-bank/questions/${question.id}/images`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_images: urls }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Could not save this figure');
      }
      setSavedFigures((prev) => ({ ...prev, ...urls }));
      setFigureJustSaved(mark(true));
    } catch (err) {
      setFigureError(mark(err instanceof Error ? err.message : 'Could not save this figure'));
    } finally {
      setFigureSaving(mark(false));
    }
  };

  /**
   * Figures that differ from the row and can be saved on their own, in option
   * order. What Ctrl+S saves first, ahead of the question itself.
   */
  const pendingFigureIds = form.question_format === 'MCQ' && optionImagesEnabled
    ? form.options
        .map((o) => o.id)
        .filter(
          (id) =>
            id in savedFigures &&
            !figureSaving[id] &&
            imageUrlOf(form.option_images[id]) !== (savedFigures[id] ?? null),
        )
    : [];
  const pendingFigureLetters = pendingFigureIds.map((id) =>
    optionLetter(form.options.findIndex((o) => o.id === id)),
  );

  const addOption = useCallback((text?: string, textHi?: string) => {
    setForm((prev) => {
      const quick = text ? { text, text_hi: textHi } : undefined;
      const options = withOptionAdded(prev.options, quick, (id) => Boolean(prev.option_images[id]));
      return options ? { ...prev, options } : prev;
    });
    setDirty(true);
  }, []);

  const removeOption = useCallback((optId: string) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.filter((o) => o.id !== optId),
      option_images: { ...prev.option_images, [optId]: undefined },
    }));
    setDirty(true);
  }, []);

  /**
   * Id to label for the compact chip row. Only ids are stored on the form and
   * on the row, since a tag's own label can be renamed in Tag management, so
   * this looks it up rather than caching a copy that could drift.
   */
  const [tagLabels, setTagLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    if (form.tag_ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/question-bank/tags', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok || cancelled) return;
      const json = await res.json();
      const map: Record<string, string> = {};
      for (const t of json.data || []) map[t.id] = t.label;
      if (!cancelled) setTagLabels(map);
    })();
    return () => {
      cancelled = true;
    };
    // Only the id set changing (not identity) should re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.tag_ids.join(','), getToken]);

  const removeTag = useCallback((id: string) => {
    setForm((prev) => ({ ...prev, tag_ids: prev.tag_ids.filter((t) => t !== id) }));
    setDirty(true);
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat],
    }));
    setDirty(true);
  }, []);

  const handleSave = async () => {
    // Caught here, beside the part that needs it, rather than as a 400 after
    // the round trip.
    if (form.question_format === 'DRAWING_PROMPT' && form.drawing_parts) {
      const problem = partsFormProblem(form.drawing_parts);
      if (problem) {
        setSaveError(problem);
        return;
      }
    }
    setSaveError(null);
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Auth failed');

      const payload = buildSubmitPayload(form);
      const res = await fetch(`/api/question-bank/questions/${question.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Save failed');
      }

      setDirty(false);
      onSaved();
    } catch (err) {
      console.error('Save failed:', err);
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const splitIntoParts = useCallback((parts: DrawingPartsForm, questionMarks: number | null) => {
    setForm((prev) => {
      const items = [...parts.items];
      // A whole-question solution from before the split belongs to one of the
      // parts. The first is the likeliest home, and the teacher can move it.
      if (prev.solution_image && !items.some((p) => p.solution_image)) {
        items[0] = { ...items[0], solution_image: prev.solution_image };
      }
      if (prev.solution_video_url && !items.some((p) => p.solution_video_url)) {
        items[0] = { ...items[0], solution_video_url: prev.solution_video_url };
      }
      return {
        ...prev,
        drawing_parts: { ...parts, items },
        drawing_marks: prev.drawing_marks || (questionMarks != null ? String(questionMarks) : ''),
      };
    });
    setDirty(true);
  }, []);

  const mergeParts = useCallback(() => {
    setForm((prev) => {
      if (!prev.drawing_parts) return prev;
      const merged = mergePartsText(prev.drawing_parts);
      const firstImage = prev.drawing_parts.items.find((p) => p.solution_image)?.solution_image;
      const firstVideo = prev.drawing_parts.items.find((p) => p.solution_video_url.trim())?.solution_video_url;
      return {
        ...prev,
        question_text: merged.text,
        question_text_hi: merged.text_hi ?? prev.question_text_hi,
        solution_image: firstImage,
        solution_video_url: firstVideo ?? '',
        drawing_parts: null,
      };
    });
    setSaveError(null);
    setDirty(true);
  }, []);

  const partsTotal = form.drawing_parts ? partsFormTotalMarks(form.drawing_parts) : null;
  /**
   * A drawing's pane is the question, its solutions, an image and tags. The
   * founder's call, field by field: difficulty is unused, exam relevance is
   * already settled by the paper the question came from, and a brief and
   * detailed explanation on a drawing say nothing the model answer does not.
   * Every other format keeps all of it, because students read the explanation
   * text after answering an MCQ.
   */
  const isDrawing = form.question_format === 'DRAWING_PROMPT';
  const sourceLine = [
    form.exam_type ? QB_EXAM_TYPE_LABELS[form.exam_type] || form.exam_type : null,
    form.year || null,
    form.session && form.session !== '-' ? form.session : null,
    form.question_number ? `Q${form.question_number}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  // Closing unmounts this form, so there is nothing to reset here. Resetting
  // first threw the edits away even when the pane then asked "discard unsaved
  // changes?" and the teacher chose to keep editing.
  const handleCancel = () => {
    onCancel();
  };

  // Keyboard shortcuts. Re-subscribed every render on purpose: handleSave
  // closes over `form`, and with only [dirty, saving] as deps Ctrl+S kept the
  // form as it was at the first edit, so a second pasted figure was not saved.
  //
  // Ctrl+S follows the paste-then-save rhythm: a figure waiting for its own
  // Save is saved first (paste A, Ctrl+S, paste B, Ctrl+S), and once none is
  // waiting the next Ctrl+S saves the whole question.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (saving) return;
        if (pendingFigureIds.length > 0) void handleSaveFigures(pendingFigureIds);
        else if (dirty) handleSave();
      }
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  return (
    <Paper variant="outlined" sx={{ border: 'none', overflow: 'visible' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          rowGap: 1,
          // The section select takes a phone row of its own (see its `order`),
          // because inline it left Save hanging off the right edge at 375px.
          flexWrap: 'wrap',
          p: 1.5,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="body2" fontWeight={700}>
          Q{question.display_order}
        </Typography>
        <Chip
          label={FORMAT_LABELS[form.question_format] ?? form.question_format}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ fontSize: '0.7rem' }}
        />
        {dirty && (
          <Chip label="Unsaved" size="small" color="warning" sx={{ fontSize: '0.65rem', height: 20 }} />
        )}
        {onChangeSection && (
          <Select
            size="small"
            value={question.section ?? ''}
            displayEmpty
            disabled={sectionSaving}
            SelectDisplayProps={{ 'aria-label': `Section for question ${question.display_order ?? 0}` }}
            renderValue={(value) =>
              value ? `Section: ${qbSectionLabel(value as QBQuestionSection)}` : 'Unsectioned'
            }
            onChange={async (e) => {
              setSectionSaving(true);
              try {
                await onChangeSection(question.id, e.target.value as QBQuestionSection);
              } finally {
                setSectionSaving(false);
              }
            }}
            sx={{
              minHeight: 44,
              minWidth: { xs: 0, sm: 180 },
              width: { xs: '100%', sm: 'auto' },
              order: { xs: 2, sm: 0 },
            }}
          >
            <MenuItem value="" disabled><em>Unsectioned</em></MenuItem>
            {/* Only the sections this paper's exam has: Planning on a B.Planning
                paper, Drawing on a B.Arch one. A question already sitting in a
                section outside that list keeps it visible so it can be moved. */}
            {[
              ...qbSectionsForExam(paper?.exam_type),
              ...(question.section && !qbSectionsForExam(paper?.exam_type).includes(question.section)
                ? [question.section]
                : []),
            ].map((s) => (
              <MenuItem key={s} value={s} sx={{ minHeight: 44 }}>{qbSectionLabel(s)}</MenuItem>
            ))}
          </Select>
        )}
        <Box sx={{ flex: 1 }} />
        <IconButton
          size="small"
          onClick={() => setDeleteOpen(true)}
          title="Delete question"
          aria-label="Delete question"
          sx={{ color: 'error.main' }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
        <Button
          size="small"
          variant="contained"
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={!dirty || saving}
          sx={{ textTransform: 'none', minHeight: 32 }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <IconButton size="small" onClick={handleCancel} title="Cancel" aria-label="Cancel">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Placeholder or junk question that was never really on this paper
          (e.g. an auto-generated drawing slot with no real content): the
          teacher's escape hatch, with the same preflight-guarded soft/hard
          choice as the standalone Questions page. */}
      <DeleteQuestionDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        questionId={question.id}
        questionText={question.question_text}
        getToken={getToken}
        onDeleted={() => onSaved()}
      />

      {/*
        Either/or is display only, so this line is the whole feature: a
        teacher created the link from the selection bar and unlinks it from
        here, and nothing about scoring changes either way.
      */}
      {choiceGroupSiblings && choiceGroupSiblings.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            Attempt any {question.choice_group_pick ?? 1} of Q{question.display_order},{' '}
            {choiceGroupSiblings.map((n) => `Q${n}`).join(', ')}
          </Typography>
          {onUnlinkChoiceGroup && (
            <Button size="small" onClick={onUnlinkChoiceGroup} sx={{ textTransform: 'none', minHeight: 28, fontSize: '0.7rem' }}>
              Unlink
            </Button>
          )}
        </Box>
      )}

      <Box sx={{ p: { xs: 1.5, md: 2 } }}>
        {saveError && (
          <Alert severity="error" onClose={() => setSaveError(null)} sx={{ mb: 1.5 }}>
            {saveError}
          </Alert>
        )}
        {/* Section 1: Content (always visible) */}
        <Box sx={{ mb: 2 }}>
          {/* A drawing split into parts edits each part's text in place of the
              one question text, which the server rebuilds from them. */}
          {form.question_format === 'DRAWING_PROMPT' && form.drawing_parts ? (
            <DrawingPartsEditor
              value={form.drawing_parts}
              onChange={(next) => {
                setForm((prev) => ({ ...prev, drawing_parts: next }));
                setDirty(true);
              }}
              onMerge={mergeParts}
              questionNumber={question.display_order}
              showHindi={showHindi}
              getToken={getToken}
              categories={form.categories}
              questionMarks={form.drawing_marks ? Number(form.drawing_marks) : null}
            />
          ) : (
            <>
              <MathField
                label="Question text"
                value={form.question_text}
                onChange={(next) => updateField('question_text', next)}
                minRows={2}
              />
              {form.question_format === 'DRAWING_PROMPT' && (
                <SplitIntoPartsPrompt
                  text={form.question_text}
                  textHi={form.question_text_hi}
                  onSplit={splitIntoParts}
                />
              )}
            </>
          )}
          {form.question_format === 'DRAWING_PROMPT' && form.drawing_parts ? (
            !showHindi && (
              <Button
                size="small"
                onClick={() => setShowHindi(true)}
                sx={{ textTransform: 'none', minHeight: 36 }}
              >
                Add Hindi
              </Button>
            )
          ) : showHindi ? (
            <TextField
              label="Question text (Hindi)"
              value={form.question_text_hi}
              onChange={(e) => updateField('question_text_hi', e.target.value)}
              multiline
              minRows={1}
              maxRows={4}
              fullWidth
              size="small"
              sx={{ mb: 1.5 }}
            />
          ) : (
            <Button
              size="small"
              onClick={() => setShowHindi(true)}
              sx={{ textTransform: 'none', minHeight: 36 }}
            >
              Add Hindi
            </Button>
          )}

          {/* Question Image */}
          {showImageZone ? (
            <>
              <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
                {isDrawing ? 'Figure for this question' : 'Question Image'}
              </Typography>
              <ImageUploadZone
                image={form.question_image}
                onChange={(img) => { updateField('question_image', img); }}
                label="Paste or drop question image"
                height={140}
                getToken={getToken}
                subfolder="questions"
              />
            </>
          ) : (
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setShowImageZone(true)}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              {isDrawing ? 'Add figure image' : 'Add image'}
            </Button>
          )}

          {/* The solution and the marks, in the flow. They used to sit in an
              accordion called "Drawing setup", one of three collapsed sections
              named after solutions, which is how a teacher loses the one they
              are looking for. */}
          {isDrawing && (
            <Box sx={{ mt: 2 }}>
              <DrawingQuestionPanel
                value={{
                  drawing_marks: form.drawing_marks,
                  solution_image: form.solution_image,
                  solution_video_url: form.solution_video_url,
                }}
                onChange={(patch) => {
                  setForm((prev) => ({ ...prev, ...patch }));
                  setDirty(true);
                }}
                getToken={getToken}
                questionText={form.question_text}
                categories={form.categories}
                hasParts={Boolean(form.drawing_parts)}
                derivedMarks={partsTotal}
              />
            </Box>
          )}

          {/* MCQ Options */}
          {form.question_format === 'MCQ' && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" fontWeight={600}>
                  Options (select correct answer)
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={optionImagesEnabled}
                      onChange={(e) => setOptionImagesEnabled(e.target.checked)}
                    />
                  }
                  label={<Typography variant="caption" color="text.secondary">Options have images</Typography>}
                  sx={{ mr: 0 }}
                />
              </Box>
              {/*
                One row per option: radio, field, delete. The stacked layout this
                replaces gave every option its own Hindi field and dropzone, so
                four options ran past a phone screen on their own.
              */}
              {form.options.map((opt, idx) => (
                <Box key={opt.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
                  <Radio
                    size="small"
                    checked={form.correct_option_id === opt.id}
                    onChange={() => updateField('correct_option_id', opt.id)}
                    inputProps={{ 'aria-label': `Mark option ${optionLetter(idx)} correct` }}
                    sx={{ p: 1 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <MathField
                      label={`Option ${optionLetter(idx)}`}
                      value={opt.text ?? ''}
                      onChange={(next) => handleOptionTextChange(opt.id, next)}
                      minRows={1}
                    />
                    {showHindi && (
                      <TextField
                        label={`Option ${optionLetter(idx)} (Hindi)`}
                        value={opt.text_hi ?? ''}
                        onChange={(e) => handleOptionTextHiChange(opt.id, e.target.value)}
                        fullWidth
                        size="small"
                      />
                    )}
                    {optionImagesEnabled && (
                      <Box sx={{ mt: 0.5 }}>
                        <ImageUploadZone
                          image={form.option_images[opt.id]}
                          onChange={(img) => handleOptionImageChange(opt.id, img)}
                          label={`Option ${optionLetter(idx)} image`}
                          height={80}
                          getToken={getToken}
                          subfolder="options"
                        />
                        <FigureSaveRow
                          letter={optionLetter(idx)}
                          savable={opt.id in savedFigures}
                          pending={imageUrlOf(form.option_images[opt.id]) !== (savedFigures[opt.id] ?? null)}
                          saving={!!figureSaving[opt.id]}
                          justSaved={!!figureJustSaved[opt.id]}
                          error={figureError[opt.id]}
                          onSave={() => handleSaveFigures([opt.id])}
                        />
                      </Box>
                    )}
                  </Box>
                  {/* Guard kept from the editor this came from: a two-option MCQ
                      is the floor, and there is no undo for a deleted option. */}
                  {form.options.length > 2 && (
                    <IconButton
                      aria-label={`Remove option ${optionLetter(idx)}`}
                      onClick={() => removeOption(opt.id)}
                      sx={{ p: 1 }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              ))}
              <OptionAddBar options={form.options} optionImages={form.option_images} onAdd={addOption} />
            </Box>
          )}

          {/* NUMERICAL answer */}
          {form.question_format === 'NUMERICAL' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'flex-start' }}>
              <MathAnswerField
                value={form.correct_answer}
                onChange={(next) => updateField('correct_answer', next)}
                sx={{ flex: 1, minWidth: 0 }}
              />
              <TextField
                label="Tolerance (±)"
                value={form.answer_tolerance}
                onChange={(e) => updateField('answer_tolerance', e.target.value)}
                size="small"
                inputProps={{ inputMode: 'decimal' }}
                helperText="Blank = exact"
                sx={{ width: 120, flexShrink: 0 }}
              />
            </Box>
          )}
        </Box>

        {/* Tags and categories: always visible, not a disclosure. This used to
            be a 58-chip wall inside an accordion, roughly 400px whether or not
            it was ever opened, and it had no way to reach the tag registry a
            teacher actually curates at /teacher/question-bank/tags. Now it is
            the chips that are already set, plus one button to change them. */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              Tags and categories
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setTagDialogOpen(true)}
              sx={{ textTransform: 'none', minHeight: 32 }}
            >
              Add
            </Button>
          </Box>
          {form.tag_ids.length === 0 && form.categories.length === 0 ? (
            <Typography variant="caption" color="text.disabled">
              Nothing set yet.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxHeight: 68, overflowY: 'auto' }}>
              {form.tag_ids.map((id) => (
                <Chip
                  key={id}
                  label={tagLabels[id] || '…'}
                  size="small"
                  onDelete={() => removeTag(id)}
                  sx={{ fontSize: '0.7rem' }}
                />
              ))}
              {form.categories.map((cat) => (
                <Chip
                  key={cat}
                  label={QB_CATEGORY_LABELS[cat as keyof typeof QB_CATEGORY_LABELS] || cat}
                  size="small"
                  variant="outlined"
                  onDelete={() => toggleCategory(cat)}
                  sx={{ fontSize: '0.7rem' }}
                />
              ))}
            </Box>
          )}
        </Box>

        <TagCategoryDialog
          open={tagDialogOpen}
          onClose={() => setTagDialogOpen(false)}
          questionFormat={form.question_format}
          categories={form.categories}
          tagIds={form.tag_ids}
          getToken={getToken}
          onApply={({ categories, tagIds: nextTagIds }) => {
            setForm((prev) => ({ ...prev, categories, tag_ids: nextTagIds }));
            setDirty(true);
            setTagDialogOpen(false);
          }}
        />

        {/* What to study: the chapter, the chapters it also uses, and where to
            learn each concept. Saves on its own and goes live at once. */}
        {!isDrawing && (
          <StudyEditor
            questionId={question.id}
            isMath={form.categories.includes('mathematics')}
            getToken={getToken}
            onCategoriesChange={(categories) => setForm((prev) => ({ ...prev, categories }))}
          />
        )}

        {/* Section 2: Classification (collapsible). Not on a drawing: nobody
            sets its difficulty, and its exam relevance is settled by the paper
            it came from. The stored values are left alone, and the full editor
            at Question bank, Questions, Edit still shows them. */}
        {!isDrawing && (
        <Accordion defaultExpanded={false} disableGutters variant="outlined" sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={600}>Classification</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {/* Difficulty */}
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Difficulty
            </Typography>
            <RadioGroup
              row
              value={form.difficulty}
              onChange={(e) => updateField('difficulty', e.target.value as QBDifficulty)}
              sx={{ mb: 2 }}
            >
              {(['EASY', 'MEDIUM', 'HARD'] as QBDifficulty[]).map((d) => (
                <FormControlLabel key={d} value={d} control={<Radio size="small" />} label={d} />
              ))}
            </RadioGroup>

            {/* Exam Relevance */}
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Exam Relevance
            </Typography>
            <RadioGroup
              row
              value={form.exam_relevance}
              onChange={(e) => updateField('exam_relevance', e.target.value as QBExamRelevance)}
              sx={{ mb: 2 }}
            >
              {(['JEE', 'NATA', 'BOTH'] as QBExamRelevance[]).map((r) => (
                <FormControlLabel key={r} value={r} control={<Radio size="small" />} label={r} />
              ))}
            </RadioGroup>

            {/* Sub-topic */}
            <TextField
              label="Sub-topic"
              value={form.sub_topic}
              onChange={(e) => updateField('sub_topic', e.target.value)}
              size="small"
              fullWidth
            />
          </AccordionDetails>
        </Accordion>
        )}

        {/* Section 3: Solution (collapsible). A drawing's solution is its
            image, and it sits with the question above; a written explanation of
            a drawing says nothing the model answer does not. */}
        {!isDrawing && (
        <Accordion defaultExpanded={false} disableGutters variant="outlined" sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={600}>Solution</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {/* Solutions are where the maths actually lives, so these two get the
                preview as well: a worked answer is exactly what you cannot check
                by reading raw LaTeX. */}
            <MathField
              label="Brief Explanation"
              value={form.explanation_brief}
              onChange={(next) => updateField('explanation_brief', next)}
              minRows={2}
            />
            <MathField
              label="Detailed Explanation"
              value={form.explanation_detailed}
              onChange={(next) => updateField('explanation_detailed', next)}
              minRows={3}
            />
            <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
              Solution Image
            </Typography>
            <ImageUploadZone
              image={form.solution_image}
              onChange={(img) => { updateField('solution_image', img); }}
              label="Paste or drop solution image"
              height={120}
              getToken={getToken}
              subfolder="solutions"
            />
            {/* The same checked field as the paper's Videos mode: it says
                whether the link will play, and opens it to check it. */}
            <Box sx={{ mt: 1.5 }}>
              <SolutionVideoField
                label="Solution video"
                showLabel
                value={form.solution_video_url}
                onChange={(value) => updateField('solution_video_url', value)}
              />
            </Box>
          </AccordionDetails>
        </Accordion>
        )}

        {/* Section 4: Source, and on a drawing the only other thing left, the
            format. Collapsed and last, because changing a format is destructive
            (the server clears the parts with it) and reading the provenance is
            something a teacher does once. */}
        <Accordion defaultExpanded={false} disableGutters variant="outlined">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={600}>
              {isDrawing ? 'More settings' : <>Source &amp; Format</>}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {isDrawing ? (
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
                {sourceLine ? `From ${sourceLine}. Change it on the paper.` : 'No source recorded.'}
              </Typography>
            ) : (
            <>
            {/* Where the question came from. Read-only: this tuple lives on the
                paper and its source row, and Save has never carried these four
                fields, so an editable control here only invites a correction
                that is silently thrown away. */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
              <TextField
                label="Exam Type"
                value={
                  form.exam_type
                    ? QB_EXAM_TYPE_LABELS[form.exam_type] || form.exam_type
                    : 'Not recorded'
                }
                size="small"
                sx={{ minWidth: 140 }}
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Year"
                value={form.year || '-'}
                size="small"
                sx={{ width: 90 }}
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Session"
                value={form.session || '-'}
                size="small"
                sx={{ width: 110 }}
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Q#"
                value={form.question_number || '-'}
                size="small"
                sx={{ width: 70 }}
                InputProps={{ readOnly: true }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
              Taken from the paper this question belongs to. Change it on the paper.
            </Typography>
            </>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Question Format
            </Typography>
            <RadioGroup
              row
              value={form.question_format}
              onChange={(e) => {
                const next = e.target.value as QBQuestionFormat;
                setForm((prev) => ({
                  ...prev,
                  question_format: next,
                  // A question that becomes a drawing gets the same 50 a drawing
                  // is born with, so the rule does not depend on how the row
                  // arrived.
                  drawing_marks:
                    next === 'DRAWING_PROMPT' && !prev.drawing_marks
                      ? String(DEFAULT_DRAWING_MARKS)
                      : prev.drawing_marks,
                }));
                setDirty(true);
              }}
            >
              {(['MCQ', 'NUMERICAL', 'DRAWING_PROMPT', 'IMAGE_BASED'] as QBQuestionFormat[]).map((f) => (
                <FormControlLabel
                  key={f}
                  value={f}
                  control={<Radio size="small" />}
                  label={FORMAT_LABELS[f] ?? f}
                />
              ))}
            </RadioGroup>
          </AccordionDetails>
        </Accordion>
      </Box>

      {/*
        The question's own Save, pinned where the teacher is working: with four
        option figures the header Save is a long scroll away by the time the
        last one goes in. An opaque base under the tint so the form does not
        show through as it scrolls past.
      */}
      {dirty && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            zIndex: 1,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            p: 1.5,
            bgcolor: 'background.paper',
            backgroundImage: `linear-gradient(${alpha(theme.palette.warning.main, 0.08)}, ${alpha(theme.palette.warning.main, 0.08)})`,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
            {pendingFigureLetters.length > 0
              ? `Ctrl+S saves Figure ${pendingFigureLetters.join(', ')}`
              : 'Unsaved changes (Ctrl+S saves the question)'}
          </Typography>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
            sx={{ textTransform: 'none', minHeight: 44, flexShrink: 0 }}
          >
            {saving ? 'Saving...' : 'Save question'}
          </Button>
        </Box>
      )}
    </Paper>
  );
}

function imageUrlOf(img: ImageState | undefined): string | null {
  return img?.uploaded ? img.url : null;
}

function withoutKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

/**
 * The per-figure Save under an option's dropzone: a button while the figure in
 * the form differs from the one on the row, a saved line once it matches.
 * Status is an icon plus words, never colour alone, and announced politely.
 */
function FigureSaveRow({
  letter,
  savable,
  pending,
  saving,
  justSaved,
  error,
  onSave,
}: {
  letter: string;
  savable: boolean;
  pending: boolean;
  saving: boolean;
  justSaved: boolean;
  error?: string;
  onSave: () => void;
}) {
  if (!savable) {
    return pending ? (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        New option: this figure is saved with the question
      </Typography>
    ) : null;
  }
  return (
    <Box aria-live="polite" sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
      {pending && (
        <Button
          size="small"
          variant="contained"
          onClick={onSave}
          disabled={saving}
          title="Ctrl+S"
          aria-keyshortcuts="Control+S Meta+S"
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          {saving ? 'Saving...' : `Save Figure ${letter}`}
        </Button>
      )}
      {!pending && justSaved && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 44 }}>
          <CheckCircleIcon fontSize="small" color="success" />
          <Typography variant="caption" color="text.secondary">
            Figure {letter} saved
          </Typography>
        </Box>
      )}
      {error && (
        <Typography variant="caption" color="error" role="alert">
          {error}
        </Typography>
      )}
    </Box>
  );
}
