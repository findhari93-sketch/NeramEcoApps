'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Skeleton,
  Chip,
  Alert,
  IconButton,
  Tabs,
  Tab,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Tooltip,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TranslateIcon from '@mui/icons-material/Translate';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { QB_EXAM_TYPE_LABELS, qbSectionLabel } from '@neram/database';
import type {
  NexusQBOriginalPaper,
  NexusQBQuestion,
  NexusQBQuestionSource,
  QBQuestionSection,
} from '@neram/database';
import PaperProgressBar from '@/components/question-bank/PaperProgressBar';
import HindiMergeDialog from '@/components/question-bank/HindiMergeDialog';
import AnswerKeyUpload from '@/components/question-bank/AnswerKeyUpload';
import PaperWorkspace, {
  type PaperQuestionMode,
  type NeedsFilter,
  type PaperSectionFilter,
} from '@/components/question-bank/paper/PaperWorkspace';
import BulkVideoLinksDialog from '@/components/question-bank/BulkVideoLinksDialog';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PaperStudentAccessPanel from '@/components/question-bank/PaperStudentAccessPanel';
import PaperJSONDialog from '@/components/question-bank/PaperJSONDialog';

export default function PaperDetailPage() {
  const router = useRouter();
  const params = useParams();
  const paperId = params.id as string;
  const { getToken } = useNexusAuthContext();

  const [paper, setPaper] = useState<NexusQBOriginalPaper | null>(null);
  const [questions, setQuestions] = useState<NexusQBQuestion[]>([]);
  /** Source rows per question id, this paper's row first. Feeds Source & Format. */
  const [sources, setSources] = useState<Record<string, NexusQBQuestionSource[]>>({});
  /** Tag ids per question id, fetched in the same round trip as the paper. */
  const [tagsByQuestion, setTagsByQuestion] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [hindiMergeOpen, setHindiMergeOpen] = useState(false);
  const [videoLinksOpen, setVideoLinksOpen] = useState(false);
  const [jsonUploadOpen, setJsonUploadOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState('');
  const [answerKeyOpen, setAnswerKeyOpen] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [redoSectionsOpen, setRedoSectionsOpen] = useState(false);
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState<HTMLElement | null>(null);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  // Edit/Images mode and both filters live here rather than inside
  // PaperWorkspace so the header can still drive the list, which is what the
  // unsectioned warning below does: it is the one thing up here that sets a
  // filter, now that the duplicate work-queue chips are gone.
  const [paperMode, setPaperMode] = useState<PaperQuestionMode>('edit');
  const [needsFilter, setNeedsFilter] = useState<NeedsFilter>('all');
  const [sectionFilter, setSectionFilter] = useState<PaperSectionFilter | null>(null);

  const fetchData = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setPaper(json.data.paper);
        setQuestions(json.data.questions);
        setSources(json.data.sources || {});
        setTagsByQuestion(json.data.tagsByQuestion || {});
      }
    } catch (err) {
      console.error('Failed to fetch paper:', err);
    } finally {
      if (!background) setLoading(false);
    }
  }, [paperId, getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Patch one question's fields in local state ahead of the network round
   * trip, for controls (needs_image today) whose value is read straight off
   * the question prop, so the click needs to feel instant rather than
   * waiting on a refetch.
   */
  const patchQuestionLocally = useCallback((questionId: string, patch: Partial<NexusQBQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === questionId ? { ...q, ...patch } : q)));
  }, []);

  /**
   * Save the paper as one JSON file.
   *
   * Fetched rather than linked, because the route needs a bearer token and an
   * anchor href cannot carry one. Same blob-and-click as the test editor's
   * download in components/tests/TestQuestionEditorDialog.tsx.
   */
  const handleDownloadJSON = useCallback(async () => {
    setDownloading(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}/json?download=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setMessage(json.error || 'Could not build the JSON');
        return;
      }

      // The filename the server chose, so the file is named after the paper
      // rather than after its uuid.
      const disposition = res.headers.get('Content-Disposition') || '';
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] || `paper-${paperId}.json`;

      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download paper JSON:', err);
      setMessage('Could not build the JSON');
    } finally {
      setDownloading(false);
    }
  }, [paperId, getToken]);

  /**
   * Move one or more questions into a different section.
   *
   * Takes a list because a bad import misplaces a whole block, not one
   * question, and the API has always accepted a batch. Saves on change and
   * refetches in the background, so the summary chips above and the grouping
   * below stay honest without a save button the teacher has to remember.
   */
  const handleChangeSections = async (questionIds: string[], section: QBQuestionSection) => {
    if (questionIds.length === 0) return;
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}/sections`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: questionIds.map((question_id) => ({ question_id, section })),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setMessage(json.error || 'Could not change the section');
        return;
      }
      if (questionIds.length > 1) {
        setMessage(`Moved ${questionIds.length} questions to ${qbSectionLabel(section)}.`);
      }
      await fetchData(true);
    } catch (err) {
      console.error('Failed to change sections:', err);
      setMessage('Could not change the section');
    }
  };

  /**
   * Work the sections out from the questions themselves.
   *
   * Two modes. The default fills only what has no section yet and never touches
   * a hand correction. `overwrite` re-does the whole paper, which is what a
   * teacher needs when the sections are not missing but wrong, and is behind a
   * confirmation because it discards corrections.
   */
  const handleReclassifySections = async (overwrite = false) => {
    setReclassifying(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}/sections`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(overwrite ? { overwrite: true } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || 'Could not work out the sections');
        return;
      }
      const { updated = 0, skipped = 0, unresolved = 0 } = json.data || {};
      const tail = [
        skipped > 0 ? `left ${skipped} you had already set` : '',
        unresolved > 0 ? `could not tell for ${unresolved}` : '',
      ].filter(Boolean);
      setMessage(
        updated === 0
          ? unresolved > 0
            ? `Could not work out a section for ${unresolved} question${unresolved === 1 ? '' : 's'} from their text. Set them yourself below.`
            : 'Every question already has a section.'
          : `Set ${updated} question${updated === 1 ? '' : 's'}${tail.length ? `, ${tail.join(', ')}` : ''}.`,
      );
      await fetchData(true);
    } catch (err) {
      console.error('Failed to reclassify sections:', err);
      setMessage('Could not work out the sections');
    } finally {
      setReclassifying(false);
      setRedoSectionsOpen(false);
    }
  };

  const handleSaveAnswers = async (
    answers: { question_number: number; correct_answer: string }[]
  ) => {
    setSaving(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}/answer-key`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answers }),
      });

      const json = await res.json();
      if (res.ok) {
        setMessage(json.message || 'Answers saved');
        await fetchData();
      } else {
        setMessage(`Error: ${json.error}`);
      }
    } catch (err) {
      setMessage('Failed to save answers');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    setActivating(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok) {
        setMessage(json.message || 'Questions activated');
        await fetchData();
      } else {
        setMessage(`Error: ${json.error}`);
      }
    } catch (err) {
      setMessage('Failed to activate');
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    setDeactivateConfirmOpen(false);
    setDeactivating(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}/deactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok) {
        setMessage(json.message || 'Questions deactivated');
        await fetchData();
      } else {
        setMessage(`Error: ${json.error}`);
      }
    } catch (err) {
      setMessage('Failed to deactivate');
    } finally {
      setDeactivating(false);
    }
  };

  const handleDelete = async () => {
    setDeleteConfirmOpen(false);
    setDeleting(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok) {
        router.push('/teacher/question-bank/papers');
      } else {
        setMessage(`Error: ${json.error}`);
      }
    } catch (err) {
      setMessage('Failed to delete paper');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  if (!paper) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
        <Alert severity="error">Paper not found</Alert>
      </Box>
    );
  }

  const total = paper.questions_parsed || 0;
  const keyed = paper.questions_answer_keyed || 0;
  const complete = paper.questions_complete || 0;
  const draft = total - keyed;
  const answerKeyedOnly = keyed - complete;
  const completeCount = questions.filter((q) => q.status === 'complete' || q.status === 'answer_keyed').length;
  const activeCount = questions.filter((q) => q.status === 'active' && q.is_active).length;
  const shiftSuffix = paper.shift ? ` (${paper.shift === 'forenoon' ? 'Forenoon' : 'Afternoon'})` : '';
  const paperLabel = `${QB_EXAM_TYPE_LABELS[paper.exam_type] || paper.exam_type} ${paper.year}${paper.session ? ` ${paper.session}` : ''}${shiftSuffix}`;
  // Not memoized: this runs after the loading/not-found early returns above,
  // so a hook here would be conditional. ~100 entries is cheap enough plain.
  const tagCounts = Object.fromEntries(Object.entries(tagsByQuestion).map(([id, ids]) => [id, ids.length]));

  // The figure and solution backlogs are not counted here any more: the filter
  // bar above the list already states both, scoped to whatever section is in
  // view, and two counts of the same thing is one to keep in sync and one to
  // read twice. This one stays because nothing below states it, see the chip.
  const unsectionedCount = questions.filter((q) => !q.section).length;

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      {/*
        One header block, where there used to be a title row and a status card
        under it.

        The card repeated the list's own filter bar: a Sections accordion that
        set the same Section filter, and "N need a figure" / "N need a
        solution" chips that set the same Needs chips. Two controls for one job
        means reading both to know what the list is showing, and on a phone all
        of it came before a single question did. The filters have one home now,
        directly above the list they narrow. What is left here is what never
        needed a card around it: what this paper is, how far along it is, and
        what you can do to it.
      */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2 }}>
        <IconButton
          size="small"
          aria-label="Back to all papers"
          onClick={() => router.push('/teacher/question-bank/papers')}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Title and actions share one row, so the actions cost no height of
              their own. They wrap as a group rather than splitting up, and stay
              right-aligned when they do, which is where a thumb is. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={QB_EXAM_TYPE_LABELS[paper.exam_type] || paper.exam_type}
              size="small"
              color="primary"
            />
            {/* The page's only heading, so it is the h1. It reads as "JEE
                Paper 2 2024 January (FN)" with the chips either side of it. */}
            <Typography variant="h6" component="h1" fontWeight={700}>
              {paper.year}
            </Typography>
            {paper.session && (
              <Chip
                label={paper.shift
                  ? `${paper.session} (${paper.shift === 'forenoon' ? 'FN' : 'AN'})`
                  : paper.session}
                size="small"
                variant="outlined"
              />
            )}

            {/*
              Activate is the only action that stays labelled: it is the
              constructive one, and the one a teacher comes here to press.
              Everything else is behind the overflow, including the paper-wide
              Deactivate, because "hide all 90 from students" does not belong
              one stray click away on every visit.

              The overflow sits up here rather than in the filter bar below for
              two reasons: these are things you do to the paper, not ways to
              narrow the list, and the Student access tab has no filter bar, so
              down there Upload Answer Key and Delete Paper would vanish
              whenever that tab was open.
            */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 'auto' }}>
              {completeCount > 0 && (
                <Button
                  variant="contained"
                  size="small"
                  color="success"
                  startIcon={<PlayArrowIcon />}
                  onClick={handleActivate}
                  disabled={activating}
                  sx={{ minHeight: 44, textTransform: 'none' }}
                >
                  {activating ? 'Activating...' : `Activate ${completeCount}`}
                </Button>
              )}
              <IconButton
                size="small"
                aria-label="More paper actions"
                aria-haspopup="true"
                onClick={(e) => setActionsMenuAnchor(e.currentTarget)}
                sx={{ border: '1px solid', borderColor: 'divider', minWidth: 44, minHeight: 44 }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {/* The one backlog the filter bar below cannot state. Its Section
              select lists Unsectioned, but never how many, and never that
              leaving them unset is what stops this paper being scheduled as an
              exam. It renders only when something is wrong, so a healthy paper
              pays no height for it. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary">
              Uploaded {formatDate(paper.created_at)}
            </Typography>
            {unsectionedCount > 0 && (
              <Tooltip
                title="A scheduled exam shuffles within sections, so set these before using this paper as an exam."
                arrow
              >
                <Chip
                  icon={<CategoryOutlinedIcon sx={{ fontSize: 15 }} />}
                  label={`${unsectionedCount} unsectioned`}
                  size="small"
                  clickable
                  onClick={() => {
                    setSectionFilter('__none__');
                    setNeedsFilter('all');
                    setTab(0);
                  }}
                  color="warning"
                  variant="outlined"
                  sx={{ flexShrink: 0, height: { xs: 44, sm: 30 }, fontWeight: 600, fontSize: '0.72rem' }}
                />
              </Tooltip>
            )}
          </Box>

          {/* Aligned to the title's own left edge instead of floating in a card
              of its own: it describes this paper, so it should read as part of
              the heading rather than as a separate panel. Each segment names
              itself and its count underneath, so colour is never the only thing
              saying what is done. */}
          <Box sx={{ mt: 1 }}>
            <PaperProgressBar
              total={total}
              draft={draft > 0 ? draft : 0}
              answerKeyed={answerKeyedOnly > 0 ? answerKeyedOnly : 0}
              complete={complete - activeCount > 0 ? complete - activeCount : 0}
              active={activeCount}
              showLabels
            />
          </Box>
        </Box>

        {/* Portaled, so it is a sibling of the header rather than nested in the
            row it is anchored to. */}
        <Menu
          anchorEl={actionsMenuAnchor}
          open={!!actionsMenuAnchor}
          onClose={() => setActionsMenuAnchor(null)}
        >
          {/* The round trip, first because it is the superset of the three
              narrow uploads below: answer key, video links and Hindi are each
              one column of the same document. */}
          <MenuItem
            onClick={() => { setActionsMenuAnchor(null); handleDownloadJSON(); }}
            disabled={downloading}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon><DownloadOutlinedIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText
              primary={downloading ? 'Preparing...' : 'Download JSON'}
              secondary="The whole paper in one file: answers, marks, explanations, videos, image links"
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </MenuItem>
          <MenuItem
            onClick={() => { setActionsMenuAnchor(null); setJsonUploadOpen(true); }}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon><UploadFileOutlinedIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText
              primary="Upload edited JSON"
              secondary="Applies your edits and rebuilds the test. Never deletes anything"
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </MenuItem>
          <Divider />
          {activeCount > 0 && (
            <MenuItem
              onClick={() => { setActionsMenuAnchor(null); setDeactivateConfirmOpen(true); }}
              disabled={deactivating}
              sx={{ minHeight: 44 }}
            >
              <ListItemIcon><VisibilityOffOutlinedIcon fontSize="small" color="warning" /></ListItemIcon>
              <ListItemText
                primary={deactivating ? 'Deactivating...' : `Deactivate all ${activeCount}`}
                secondary="Hides every active question from students"
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </MenuItem>
          )}
          {activeCount > 0 && <Divider />}
          <MenuItem
            onClick={() => { setActionsMenuAnchor(null); handleReclassifySections(false); }}
            disabled={reclassifying}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon><CategoryOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText
              primary={reclassifying ? 'Working...' : 'Fill in missing sections'}
              secondary="Only adds what is missing, never touches a section you set"
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </MenuItem>
          <MenuItem
            onClick={() => { setActionsMenuAnchor(null); setRedoSectionsOpen(true); }}
            disabled={reclassifying}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon><RestartAltIcon fontSize="small" color="warning" /></ListItemIcon>
            <ListItemText
              primary="Redo all sections"
              secondary="Re-detects every section, including ones you set by hand"
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => { setActionsMenuAnchor(null); setAnswerKeyOpen(true); }}
            disabled={saving}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{saving ? 'Saving answers...' : 'Upload Answer Key'}</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setActionsMenuAnchor(null); setVideoLinksOpen(true); }} sx={{ minHeight: 44 }}>
            <ListItemIcon><ContentPasteIcon fontSize="small" sx={{ color: '#7c3aed' }} /></ListItemIcon>
            <ListItemText>Paste Video Links</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setActionsMenuAnchor(null); setHindiMergeOpen(true); }} sx={{ minHeight: 44 }}>
            <ListItemIcon><TranslateIcon fontSize="small" sx={{ color: '#e65100' }} /></ListItemIcon>
            <ListItemText>Upload Hindi</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => { setActionsMenuAnchor(null); setDeleteConfirmOpen(true); }}
            disabled={deleting}
            sx={{ color: 'error.main', minHeight: 44 }}
          >
            <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>{deleting ? 'Deleting...' : 'Delete Paper'}</ListItemText>
          </MenuItem>
        </Menu>
      </Box>

      {message && (
        <Alert
          severity={message.startsWith('Error') ? 'error' : 'success'}
          sx={{ mb: 2 }}
          onClose={() => setMessage('')}
        >
          {message}
        </Alert>
      )}

      {/* Tabs. Bulk Images used to be its own tab with its own scrolling list
          of every question; it is an Edit/Images mode switch inside Questions
          now (see PaperQuestionList), so it no longer needs a tab of its own.
          The same 92 rows would otherwise exist in three places. */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label={`Questions (${questions.length})`} />
        <Tab
          label="Student access"
          icon={<GroupsOutlinedIcon sx={{ fontSize: 18 }} />}
          iconPosition="start"
          sx={{ minHeight: 48 }}
        />
      </Tabs>

      {/* Tab: Questions.
          One tab, not two. Answer Key and Questions each showed the same 92
          questions and each kept its own idea of which one you were on, so
          correcting an answer and then fixing its wording meant finding the
          question twice. The list scans, the pane edits, one selection. */}
      {tab === 0 && (
        <PaperWorkspace
          questions={questions}
          tagCounts={tagCounts}
          tagsByQuestion={tagsByQuestion}
          paper={paper ?? undefined}
          sources={sources}
          mode={paperMode}
          onModeChange={setPaperMode}
          needsFilter={needsFilter}
          onNeedsFilterChange={setNeedsFilter}
          sectionFilter={sectionFilter}
          onSectionFilterChange={setSectionFilter}
          getToken={getToken}
          onSaved={() => fetchData(true)}
          onChangeSections={handleChangeSections}
          onOptimisticPatch={patchQuestionLocally}
        />
      )}

      {/* Tab: Student access — the PDF, the test, and the publish switch.
          Mounted only when open so its four server-side reads are not paid for
          by a teacher who came here to fix an answer key. */}
      {tab === 1 && (
        <PaperStudentAccessPanel paperId={paperId} getToken={getToken} refreshKey={total} />
      )}

      {/* Bulk answer-key paste, reachable from the action row now that the tab
          it used to be nested inside is gone. */}
      <AnswerKeyUpload
        open={answerKeyOpen}
        onClose={() => setAnswerKeyOpen(false)}
        questions={questions}
        onApply={handleSaveAnswers}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>Delete Paper?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete <strong>{paperLabel}</strong> and all {total} questions.
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate confirmation. The only one-click destructive-ish action on
          this page until now: it pulls every active question off the live
          exam a student may be about to sit, and a stray click had no way
          back short of Activate-then-recheck everything. */}
      <Dialog open={deactivateConfirmOpen} onClose={() => setDeactivateConfirmOpen(false)}>
        <DialogTitle>Deactivate {activeCount} question{activeCount === 1 ? '' : 's'}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This hides all {activeCount} active question{activeCount === 1 ? '' : 's'} from students
            immediately. Nothing is deleted, and you can Activate them again from this same screen.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeactivateConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDeactivate} color="warning" variant="contained" disabled={deactivating}>
            {deactivating ? 'Deactivating...' : 'Deactivate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Redo-all-sections confirmation. Behind a dialog because it discards
          corrections a teacher may have spent real time making by hand. */}
      <Dialog open={redoSectionsOpen} onClose={() => setRedoSectionsOpen(false)}>
        <DialogTitle>Work out every section again?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This reads all {total} questions and decides the sections from their text, replacing
            what is there now, including any you set by hand. Questions it cannot place are left
            alone rather than cleared.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRedoSectionsOpen(false)}>Cancel</Button>
          <Button
            onClick={() => handleReclassifySections(true)}
            color="warning"
            variant="contained"
            disabled={reclassifying}
          >
            {reclassifying ? 'Working...' : 'Redo sections'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Hindi merge dialog */}
      <HindiMergeDialog
        open={hindiMergeOpen}
        onClose={() => setHindiMergeOpen(false)}
        paperId={paperId}
        questions={questions}
        getToken={getToken}
        onSuccess={() => {
          setMessage('Hindi text merged successfully');
          fetchData(true);
        }}
      />

      {/* Bulk video links dialog */}
      <BulkVideoLinksDialog
        open={videoLinksOpen}
        onClose={() => setVideoLinksOpen(false)}
        questions={questions}
        paperId={paperId}
        getToken={getToken}
        onSuccess={(msg) => {
          setMessage(msg);
          fetchData(true);
        }}
      />

      {/* The round trip's other half */}
      <PaperJSONDialog
        open={jsonUploadOpen}
        onClose={() => setJsonUploadOpen(false)}
        paperId={paperId}
        getToken={getToken}
        onSuccess={(msg) => {
          setMessage(msg);
          fetchData(true);
        }}
      />
    </Box>
  );
}
