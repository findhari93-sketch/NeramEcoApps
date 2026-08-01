'use client';

/**
 * Create OR edit a class assignment, type-aware.
 *
 * - Create: pick Drawing or Document, fill the form, create a draft (gets an id),
 *   then add materials (document) or just publish (drawing).
 * - Edit (assignmentId set): one combined form pre-filled from the assignment; the
 *   type is locked; Save changes PATCHes via the `update` action. Document materials
 *   (upload / pick / paste-link) are managed inline against the existing id.
 *
 * DRAWING assignments route through the Drawing Review channel; a DOCUMENT
 * assignment attaches the question paper (upload / pick from Study Materials /
 * paste a OneDrive link). The field set is the shared AssignmentFormFields (also
 * used by the AI import preview). Mobile bottom-sheet, 48px targets.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Button, Typography, TextField, Drawer, IconButton, Stack,
  Chip, LinearProgress, Divider,
  useMediaQuery, useTheme, alpha,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import LinkIcon from '@mui/icons-material/Link';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { ASSIGNMENT_ATTACHMENTS_FOLDER_ID } from '@/lib/assignment-constants';
import { istTodayStr } from '@/lib/assignment-clock';
import type { AssignmentFormat } from '@/lib/assignment-format';
import StudyFilePicker, { type PickedFile } from './StudyFilePicker';
import AssignmentFormFields, { type AssignmentDraft, type AssignmentType, blankDraft } from './AssignmentFormFields';
import QuestionsSummaryCard, { type QuestionsSummary } from './QuestionsSummaryCard';
import { resolveAssignmentMode } from '@/lib/assignment-mode';

interface AttachmentRow {
  id: string;
  study_file_id: string;
  file: { id: string; title: string; file_name: string; file_type: string | null } | null;
}
interface AssignmentDetail {
  id: string;
  title: string;
  assignment_type: AssignmentType;
  instructions: string | null;
  expected_outcome?: string | null;
  focus_points?: string | null;
  submission_format: AssignmentFormat;
  evaluation_type: 'marks' | 'stars';
  max_marks: number;
  class_date: string;
  due_at: string | null;
  catchup_window_days: number;
  content_image_url: string | null;
  reference_images?: string[] | null;
  recording_url: string | null;
  attachments: AttachmentRow[];
}

export default function NewAssignmentDialog({
  open,
  onClose,
  classroomId,
  authFetch,
  getToken,
  onCreated,
  assignmentId,
  scheduledClassId,
  classContextLabel,
  classStartLabel,
  defaultTiming,
  headerExtra,
}: {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  getToken: () => Promise<string | null>;
  /** The id is passed so a caller that opened this from a class can react. */
  onCreated: (assignmentId?: string) => void;
  /** When set, the dialog edits this assignment instead of creating one. */
  assignmentId?: string | null;
  /**
   * Opened from a timetable class: the new assignment is attached to it on
   * creation. Assignments are still standalone by default, so this stays
   * optional and unset everywhere else.
   */
  scheduledClassId?: string | null;
  /** Human label for that class, shown so the link is never a surprise. */
  classContextLabel?: string;
  /** "Thu 20 Aug, 7:00 PM", so a prework deadline reads as a real moment. */
  classStartLabel?: string;
  /** Preselect Before class, e.g. from the "Add pre-class work" snackbar action. */
  defaultTiming?: 'prework' | 'homework';
  /**
   * Rendered directly under the title. AssignmentSetupDialog puts its
   * create-or-link switch here so both branches share one header.
   */
  headerExtra?: React.ReactNode;
}) {
  const theme = useTheme();
  const router = useRouter();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!assignmentId;

  const [draft, setDraft] = useState<AssignmentDraft>(() => blankDraft(istTodayStr()));
  const patch = useCallback((p: Partial<AssignmentDraft>) => setDraft((d) => ({ ...d, ...p })), []);
  const type = draft.type;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [created, setCreated] = useState<AssignmentDetail | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // What the paper looks like, for the summary card. The paper itself is edited
  // on its own screen, so this dialog only ever reads it.
  const [questionSummary, setQuestionSummary] = useState<QuestionsSummary>({
    count: 0,
    totalMarks: 0,
    autoMarks: 0,
    manualMarks: 0,
  });
  const [questionsLockedReason, setQuestionsLockedReason] = useState<string | null>(null);

  const prefill = useCallback((a: AssignmentDetail) => {
    setDraft({
      type: a.assignment_type,
      // Filled in properly once the paper is known; a document assignment whose
      // paper is still loading reads as upload-only, which is the safe guess.
      mode: resolveAssignmentMode(a.assignment_type, 0),
      expectedOutcome: a.expected_outcome || '',
      focusPoints: a.focus_points || '',
      timing: (a as any).timing === 'prework' ? 'prework' : 'homework',
      title: a.title,
      instructions: a.instructions || '',
      classDate: a.class_date,
      dueDate: a.due_at ? a.due_at.slice(0, 10) : '',
      format: a.submission_format,
      evaluationType: a.evaluation_type ?? (a.assignment_type === 'drawing' ? 'stars' : 'marks'),
      maxMarks: String(a.max_marks ?? 10),
      category: '3d_composition',
      refImageUrls: a.reference_images?.length ? a.reference_images : a.content_image_url ? [a.content_image_url] : [],
      recordingUrl: a.recording_url || '',
      catchupDays: String(a.catchup_window_days ?? 7),
    });
    setCreated(a);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Reset first. defaultTiming lets a caller open this already set to "Before
    // class", e.g. the Add pre-class work action after a class is created.
    setDraft({ ...blankDraft(istTodayStr()), timing: defaultTiming ?? 'homework' });
    setShowAdvanced(false);
    setCreated(null);
    setLinkUrl('');
    setError('');
    // Edit mode: load the assignment and prefill.
    setQuestionSummary({ count: 0, totalMarks: 0, autoMarks: 0, manualMarks: 0 });
    setQuestionsLockedReason(null);
    if (assignmentId) {
      authFetch(`/api/assignments/${assignmentId}`)
        .then((res) => {
          prefill(res.assignment as AssignmentDetail);
          applyPaper(res, res.assignment?.assignment_type ?? 'document');
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the assignment.'));
    }
    // applyPaper is stable enough for this effect: it only ever calls setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignmentId, authFetch, prefill, defaultTiming]);

  /**
   * Read the paper off an assignment response into the summary card, and settle
   * the mode from it.
   *
   * The mode is derived rather than stored, so this is the only place that can
   * decide whether an existing document assignment is "Answer questions" or
   * "Solve and upload": it is whichever the paper says.
   */
  const applyPaper = useCallback((res: any, assignmentType: AssignmentType) => {
    const qs = (res?.paper?.questions ?? []) as { format?: string; marks?: number }[];
    const totalMarks = qs.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
    const autoMarks = qs
      .filter((q) => String(q.format || '').toUpperCase() !== 'SUBJECTIVE')
      .reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
    setQuestionSummary({
      count: qs.length,
      totalMarks,
      autoMarks,
      manualMarks: totalMarks - autoMarks,
    });
    setDraft((d) => ({ ...d, mode: resolveAssignmentMode(assignmentType, qs.length) }));

    // Re-keying a paper under students who already answered it would change
    // marks they have already been shown.
    const answered = (res?.roster || []).filter((r: any) => r.answers).length;
    setQuestionsLockedReason(
      answered > 0
        ? `${answered} ${answered === 1 ? 'student has' : 'students have'} already answered these questions, so the paper can no longer be changed.`
        : null,
    );
  }, []);

  const reloadDetail = async (id: string) => {
    const res = await authFetch(`/api/assignments/${id}`);
    setCreated(res.assignment as AssignmentDetail);
    applyPaper(res, (res.assignment as AssignmentDetail).assignment_type);
  };

  /**
   * Hand off to the full-screen question editor.
   *
   * The paper is NOT edited in here any more. Four questions with their options
   * and explanations never fit in a bottom sheet, and hiding them at the bottom
   * of one is what made the whole feature undiscoverable. Anything typed into
   * this dialog is saved on the way out, so nothing is lost by leaving.
   */
  const openQuestionEditor = async (id: string, isNewDraft: boolean) => {
    setBusy(true);
    try {
      if (isEdit) await persistFields(id);
      onCreated(id);
      onClose();
      router.push(`/teacher/assignments/${id}/questions${isNewDraft ? '?new=1' : ''}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save before opening the questions.');
    } finally {
      setBusy(false);
    }
  };

  // Injected uploader for the shared ImageUploadField (drawing reference image).
  const uploadReference = useCallback(
    async (file: File): Promise<{ url: string }> => {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Sign in again.');
      const form = new FormData();
      form.append('file', file);
      form.append('bucket', 'drawing-references');
      const res = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return { url: data.url as string };
    },
    [getToken],
  );

  // Injected resolver for a pasted OneDrive/SharePoint image link.
  const linkReference = useCallback(
    async (url: string): Promise<{ url: string }> => {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Sign in again.');
      const res = await fetch('/api/drawing/link-reference', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not import that link');
      return { url: data.url as string };
    },
    [getToken],
  );

  // Edit mode syncs the reference images immediately so they can't be forgotten.
  const onReferenceChange = (urls: string[]) => {
    patch({ refImageUrls: urls });
    if (isEdit && assignmentId) {
      authFetch(`/api/assignments/${assignmentId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'update', reference_image_urls: urls }),
      }).catch((e) => setError(e instanceof Error ? e.message : 'Could not save the images.'));
    }
  };

  const createDraft = async () => {
    if (!draft.title.trim()) {
      setError('Give the assignment a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await authFetch('/api/assignments', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          classroom_id: classroomId,
          ...(scheduledClassId ? { scheduled_class_id: scheduledClassId } : {}),
          assignment_type: draft.type,
          // Only meaningful with a class; the server derives a prework deadline
          // from the class start and ignores due_date entirely for one.
          ...(scheduledClassId ? { timing: draft.timing } : {}),
          title: draft.title.trim(),
          instructions: draft.instructions.trim() || null,
          expected_outcome: draft.expectedOutcome.trim() || null,
          focus_points: draft.focusPoints.trim() || null,
          class_date: draft.classDate || undefined,
          due_date: draft.dueDate || undefined,
          catchup_window_days: Number(draft.catchupDays) || 7,
          recording_url: draft.recordingUrl.trim() || null,
          evaluation_type: draft.evaluationType,
          max_marks: draft.evaluationType === 'stars' ? 5 : Number(draft.maxMarks) || 10,
          ...(draft.type === 'drawing'
            ? { drawing_category: draft.category, reference_image_urls: draft.refImageUrls }
            : { submission_format: draft.format }),
        }),
      });
      await reloadDetail(res.assignment.id);
      onCreated(res.assignment.id as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the assignment.');
    } finally {
      setBusy(false);
    }
  };

  /** The one update call, shared by Save changes and by leaving for the editor. */
  const persistFields = async (id: string) => {
    await authFetch(`/api/assignments/${id}`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'update',
        title: draft.title.trim(),
        instructions: draft.instructions.trim() || null,
        expected_outcome: draft.expectedOutcome.trim() || null,
        focus_points: draft.focusPoints.trim() || null,
        class_date: draft.classDate || undefined,
        due_at: draft.dueDate ? `${draft.dueDate}T23:59:59+05:30` : null,
        catchup_window_days: Number(draft.catchupDays) || 7,
        recording_url: draft.recordingUrl.trim() || null,
        evaluation_type: draft.evaluationType,
        max_marks: draft.evaluationType === 'stars' ? 5 : Number(draft.maxMarks) || 10,
        ...(draft.type === 'drawing'
          ? { reference_image_urls: draft.refImageUrls }
          : { submission_format: draft.format }),
      }),
    });
  };

  const saveEdit = async () => {
    if (!assignmentId) return;
    if (!draft.title.trim()) {
      setError('Give the assignment a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await persistFields(assignmentId);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setBusy(false);
    }
  };

  const uploadAttachment = async (file: File) => {
    if (!created) return;
    setUploading(true);
    setError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Sign in again.');
      const form = new FormData();
      form.append('file', file);
      form.append('folder_id', ASSIGNMENT_ATTACHMENTS_FOLDER_ID);
      const upRes = await fetch('/api/study-materials/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const upData = await upRes.json().catch(() => ({}));
      if (!upRes.ok) throw new Error(upData.error || 'Upload failed');
      await authFetch(`/api/assignments/${created.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'add_attachment', study_file_id: upData.file.id }),
      });
      await reloadDetail(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const pickFile = async (file: PickedFile) => {
    if (!created) return;
    setPickerOpen(false);
    setBusy(true);
    try {
      await authFetch(`/api/assignments/${created.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'add_attachment', study_file_id: file.id }),
      });
      await reloadDetail(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach the file.');
    } finally {
      setBusy(false);
    }
  };

  const linkDocument = async () => {
    if (!created || !linkUrl.trim()) return;
    setBusy(true);
    setError('');
    try {
      await authFetch('/api/assignments/link-document', {
        method: 'POST',
        body: JSON.stringify({ assignment_id: created.id, url: linkUrl.trim() }),
      });
      setLinkUrl('');
      await reloadDetail(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link the document.');
    } finally {
      setBusy(false);
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    if (!created) return;
    await authFetch(`/api/assignments/${created.id}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'remove_attachment', attachment_id: attachmentId }),
    });
    await reloadDetail(created.id);
  };

  const publish = async () => {
    if (!created) return;
    setBusy(true);
    try {
      await authFetch(`/api/assignments/${created.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'publish' }),
      });
      onCreated(created.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  // The document "materials" section (upload / pick / link), shown in edit and in
  // the create phase-2. Requires `created` (an existing assignment id).
  const materialsSection = created && type === 'document' && (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
        Question paper &amp; references
      </Typography>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadAttachment(f);
          e.target.value = '';
        }}
      />
      <Stack spacing={1}>
        {(created.attachments || []).map((a) => (
          <Stack key={a.id} direction="row" spacing={1} alignItems="center" sx={{ p: 1, borderRadius: 2, bgcolor: 'action.hover' }}>
            <PictureAsPdfOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
              {a.file?.title || a.file?.file_name || 'File'}
            </Typography>
            <IconButton size="small" onClick={() => removeAttachment(a.id)} sx={{ minWidth: 36, minHeight: 36 }}>
              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      {uploading && <LinearProgress sx={{ mt: 1, borderRadius: 1 }} />}
      <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} flexWrap="wrap" useFlexGap>
        <Button variant="outlined" size="small" startIcon={<UploadFileOutlinedIcon sx={{ fontSize: 18 }} />} onClick={() => fileRef.current?.click()} disabled={uploading} sx={{ minHeight: 40 }}>
          Upload
        </Button>
        <Button variant="outlined" size="small" startIcon={<DescriptionOutlinedIcon sx={{ fontSize: 18 }} />} onClick={() => setPickerOpen(true)} disabled={busy} sx={{ minHeight: 40 }}>
          Pick from library
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="flex-start">
        <TextField
          size="small"
          fullWidth
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="Paste a OneDrive/SharePoint link"
          InputProps={{ startAdornment: <LinkIcon sx={{ fontSize: 18, mr: 0.5, color: 'text.disabled' }} /> }}
        />
        <Button variant="outlined" size="small" onClick={linkDocument} disabled={busy || !linkUrl.trim()} sx={{ minHeight: 40, whiteSpace: 'nowrap' }}>
          Link
        </Button>
      </Stack>
    </Box>
  );

  /**
   * The paper's state and the way in to editing it. Document assignments only:
   * a drawing is judged from the drawing itself, so a multiple-choice question
   * has nothing to attach to.
   *
   * This is a SUMMARY, not the editor. The composer moved to its own screen
   * because a paper never fitted in a bottom sheet, and because burying it here
   * is what stopped anyone finding it.
   */
  const questionsSection = type === 'document' && (
    <QuestionsSummaryCard
      summary={questionSummary}
      lockedReason={questionsLockedReason}
      disabled={busy || (!isEdit && !created)}
      uploadOnlyHint={draft.mode === 'upload'}
      onEdit={() => {
        const id = assignmentId || created?.id;
        if (id) openQuestionEditor(id, !isEdit);
      }}
    />
  );

  const fieldsBlock = (
    <AssignmentFormFields
      value={draft}
      onChange={patch}
      uploadReference={uploadReference}
      linkReference={linkReference}
      onReferenceChange={onReferenceChange}
      lockType={isEdit}
      classContextLabel={scheduledClassId ? classContextLabel : undefined}
      showTiming={!!scheduledClassId}
      classStartLabel={classStartLabel}
      showCategory={!isEdit}
      autoFocusTitle={!isEdit}
      enableReferencePaste
      showAdvanced={showAdvanced}
      onToggleAdvanced={() => setShowAdvanced((s) => !s)}
    />
  );

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          maxHeight: '94vh',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          ...(isDesktop ? { maxWidth: 580, mx: 'auto', mb: 0 } : {}),
        },
      }}
    >
      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', flex: 1 }}>
            {isEdit
              ? 'Edit assignment'
              : created
                ? type === 'drawing'
                  ? 'Publish drawing task'
                  : draft.mode === 'questions'
                    ? 'Add the questions and publish'
                    : 'Attach the paper and publish'
                : 'New assignment'}
          </Typography>
          <IconButton onClick={onClose} sx={{ minWidth: 44, minHeight: 44 }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {headerExtra}

        {/* Opened from the timetable: say so, because an assignment that belongs
            to a class behaves differently from a standalone one. */}
        {!isEdit && scheduledClassId && classContextLabel && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 1.25,
              mb: 2,
              borderRadius: 2,
              bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
            }}
          >
            <EventOutlinedIcon sx={{ fontSize: 18, color: 'primary.dark' }} />
            <Typography variant="body2" sx={{ color: 'primary.dark', fontWeight: 600 }}>
              Links to {classContextLabel}
            </Typography>
          </Box>
        )}

        {isEdit ? (
          /* ---------- EDIT: one combined form ---------- */
          <Stack spacing={2}>
            {fieldsBlock}
            {materialsSection}
            {questionsSection && (
              <>
                <Divider />
                {questionsSection}
              </>
            )}
            {error && <Typography color="error" variant="body2" role="alert">{error}</Typography>}
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" onClick={onClose} sx={{ flex: 1, minHeight: 48 }}>Cancel</Button>
              <Button variant="contained" disabled={busy} onClick={saveEdit} sx={{ flex: 1, minHeight: 48 }}>
                {busy ? 'Saving...' : 'Save changes'}
              </Button>
            </Stack>
          </Stack>
        ) : !created ? (
          /* ---------- CREATE: phase 1 (form) ---------- */
          <Stack spacing={2}>
            {fieldsBlock}
            {error && <Typography color="error" variant="body2">{error}</Typography>}
            <Button variant="contained" disabled={busy} onClick={createDraft} sx={{ minHeight: 48 }}>
              {busy
                ? 'Creating...'
                : draft.mode === 'drawing'
                  ? 'Create drawing task'
                  : draft.mode === 'questions'
                    ? 'Next: write the questions'
                    : 'Next: attach the paper'}
            </Button>
          </Stack>
        ) : (
          /* ---------- CREATE: phase 2 (materials + publish) ---------- */
          <Stack spacing={2}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{created.title}</Typography>
              <Chip
                size="small"
                icon={type === 'drawing' ? <BrushOutlinedIcon sx={{ fontSize: 15 }} /> : <DescriptionOutlinedIcon sx={{ fontSize: 15 }} />}
                label={type === 'drawing' ? 'Drawing' : 'Document'}
                sx={{ mt: 0.5, height: 22 }}
              />
            </Box>

            {/* Questions first when that is the mode chosen, so the very next
                thing on screen is the thing the teacher said they wanted. */}
            {type === 'document' && (
              <>
                <Divider />
                {draft.mode === 'questions' ? (
                  <>
                    {questionsSection}
                    <Divider />
                    {materialsSection}
                  </>
                ) : (
                  <>
                    {materialsSection}
                    <Divider />
                    {questionsSection}
                  </>
                )}
              </>
            )}

            {type === 'drawing' && (
              <Typography variant="body2" color="text.secondary">
                Students submit a photo of their drawing. You will evaluate each one in the drawing review screen (mark regions, sketch over it, rate and give feedback).
              </Typography>
            )}

            {error && <Typography color="error" variant="body2">{error}</Typography>}
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" onClick={onClose} sx={{ flex: 1, minHeight: 48 }}>Save as draft</Button>
              <Button variant="contained" disabled={busy} onClick={publish} sx={{ flex: 1, minHeight: 48 }}>
                {busy ? 'Publishing...' : 'Publish to students'}
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>

      <StudyFilePicker open={pickerOpen} onClose={() => setPickerOpen(false)} authFetch={authFetch} onPick={pickFile} />
    </Drawer>
  );
}
