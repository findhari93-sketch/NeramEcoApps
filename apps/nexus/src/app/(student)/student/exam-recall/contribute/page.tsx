'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Skeleton,
  Alert,
  Button,
  Tabs,
  Tab,
  Stack,
  Chip,
  Paper,
  Snackbar,
  Divider,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditNoteIcon from '@mui/icons-material/EditNote';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import ListAltIcon from '@mui/icons-material/ListAlt';
import DescriptionIcon from '@mui/icons-material/Description';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CheckpointProgress from '@/components/exam-recall/CheckpointProgress';
import ContributeTypeIt from '@/components/exam-recall/ContributeTypeIt';
import ContributeDrawing from '@/components/exam-recall/ContributeDrawing';
import ContributeQuickList from '@/components/exam-recall/ContributeQuickList';
import ContributeTips from '@/components/exam-recall/ContributeTips';
import OCRPreview, { type ExtractedQuestion } from '@/components/exam-recall/OCRPreview';
import SimilarQuestionBanner, { type SimilarMatch } from '@/components/exam-recall/SimilarQuestionBanner';
import type { ExamRecallCheckpointStatus } from '@neram/database';

const TAB_LABELS = [
  { label: 'Type It', icon: <EditNoteIcon sx={{ fontSize: '1.1rem' }} /> },
  { label: 'Photo Notes', icon: <PhotoCameraIcon sx={{ fontSize: '1.1rem' }} /> },
  { label: 'Quick List', icon: <ListAltIcon sx={{ fontSize: '1.1rem' }} /> },
  { label: 'Paper Photo', icon: <DescriptionIcon sx={{ fontSize: '1.1rem' }} /> },
  { label: 'Tips', icon: <LightbulbIcon sx={{ fontSize: '1.1rem' }} /> },
];

export default function ContributePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user, activeClassroom, getToken } = useNexusAuthContext();

  // From query params
  const examDate = searchParams.get('exam_date') || '';
  const sessionNumber = Number(searchParams.get('session') || '1');
  const initialTab = searchParams.get('tab');

  // State
  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab === 'tips') return 4;
    return 0;
  });
  const [checkpoint, setCheckpoint] = useState<ExamRecallCheckpointStatus | null>(null);
  const [checkpointLoading, setCheckpointLoading] = useState(true);

  // OCR extracted questions for ContributeTypeIt prefill
  const [ocrQuestions, setOcrQuestions] = useState<ExtractedQuestion[]>([]);
  const [ocrPrefillIndex, setOcrPrefillIndex] = useState(0);

  // Similar question matching
  const [similarMatches, setSimilarMatches] = useState<SimilarMatch[]>([]);
  const [showSimilarBanner, setShowSimilarBanner] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  // Fetch checkpoint
  useEffect(() => {
    if (!activeClassroom || !examDate) return;
    fetchCheckpoint();
  }, [activeClassroom, examDate, sessionNumber]);

  const fetchCheckpoint = useCallback(async () => {
    if (!activeClassroom || !examDate) return;
    setCheckpointLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        classroom_id: activeClassroom.id,
        exam_date: examDate,
        session_number: String(sessionNumber),
      });
      const res = await fetch(`/api/exam-recall/checkpoint?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load checkpoint');
      const data: ExamRecallCheckpointStatus = await res.json();
      setCheckpoint(data);
    } catch (err) {
      console.error('Checkpoint fetch error:', err);
    } finally {
      setCheckpointLoading(false);
    }
  }, [activeClassroom, examDate, sessionNumber, getToken]);

  const checkSimilar = useCallback(
    async (queryText: string) => {
      if (!activeClassroom || !queryText.trim()) return;
      try {
        const token = await getToken();
        const res = await fetch('/api/exam-recall/match', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query_text: queryText,
            classroom_id: activeClassroom.id,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const matches: SimilarMatch[] = data.matches || [];
        if (matches.length > 0) {
          setSimilarMatches(matches);
          setShowSimilarBanner(true);
        }
      } catch {
        // Silently fail — matching is optional
      }
    },
    [activeClassroom, getToken],
  );

  // Submit handlers
  const handleTypeItSubmit = useCallback(
    async (data: any) => {
      const token = await getToken();

      // Check for similar questions first
      if (data.recall_text) {
        await checkSimilar(data.recall_text);
      }

      const res = await fetch('/api/exam-recall/threads', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classroom_id: activeClassroom!.id,
          exam_year: new Date(examDate).getFullYear(),
          exam_date: examDate,
          session_number: sessionNumber,
          ...data,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit');
      }
      setSnackbar({ open: true, message: 'Question submitted!', severity: 'success' });
      fetchCheckpoint();

      // If we're going through OCR questions, advance to next
      if (ocrQuestions.length > 0 && ocrPrefillIndex < ocrQuestions.length - 1) {
        setOcrPrefillIndex((prev) => prev + 1);
      }
    },
    [getToken, activeClassroom, examDate, sessionNumber, checkSimilar, fetchCheckpoint, ocrQuestions, ocrPrefillIndex],
  );

  const handleDrawingSubmit = useCallback(
    async (drawings: any[]) => {
      const token = await getToken();
      for (const drawing of drawings) {
        const res = await fetch('/api/exam-recall/drawings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            classroom_id: activeClassroom!.id,
            exam_year: new Date(examDate).getFullYear(),
            exam_date: examDate,
            session_number: sessionNumber,
            ...drawing,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to submit drawing');
        }
      }
      setSnackbar({
        open: true,
        message: `${drawings.length} drawing(s) submitted!`,
        severity: 'success',
      });
      fetchCheckpoint();
    },
    [getToken, activeClassroom, examDate, sessionNumber, fetchCheckpoint],
  );

  const handleQuickListSubmit = useCallback(
    async (dumps: any[]) => {
      const token = await getToken();
      const res = await fetch('/api/exam-recall/topic-dumps', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classroom_id: activeClassroom!.id,
          exam_year: new Date(examDate).getFullYear(),
          exam_date: examDate,
          session_number: sessionNumber,
          dumps,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit quick list');
      }
      setSnackbar({ open: true, message: 'Quick list submitted!', severity: 'success' });
      fetchCheckpoint();
    },
    [getToken, activeClassroom, examDate, sessionNumber, fetchCheckpoint],
  );

  const handleTipsSubmit = useCallback(
    async (tip: any) => {
      const token = await getToken();
      const res = await fetch('/api/exam-recall/tips', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classroom_id: activeClassroom!.id,
          exam_year: new Date(examDate).getFullYear(),
          exam_date: examDate,
          session_number: sessionNumber,
          ...tip,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit tip');
      }
      setSnackbar({ open: true, message: 'Tip shared! Thanks for helping others.', severity: 'success' });
    },
    [getToken, activeClassroom, examDate, sessionNumber],
  );

  const handleOCRExtracted = useCallback((questions: ExtractedQuestion[]) => {
    const selected = questions.filter((q) => q.selected);
    setOcrQuestions(selected);
    setOcrPrefillIndex(0);
    // Switch to Type It tab to review/edit each extracted question
    setActiveTab(0);
  }, []);

  const handleSimilarSame = useCallback(
    async (threadId: string) => {
      // Confirm on the existing thread
      const token = await getToken();
      await fetch(`/api/exam-recall/threads/${threadId}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setShowSimilarBanner(false);
      setSimilarMatches([]);
      setSnackbar({ open: true, message: 'Confirmed existing question!', severity: 'success' });
      fetchCheckpoint();
    },
    [getToken, fetchCheckpoint],
  );

  const handleSimilarRefine = useCallback((threadId: string) => {
    router.push(`/student/exam-recall/thread/${threadId}`);
  }, [router]);

  const handleSimilarDifferent = useCallback(() => {
    setShowSimilarBanner(false);
    setSimilarMatches([]);
  }, []);

  const formatExamDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getSessionLabel = (num: number) => {
    const labels: Record<number, string> = { 1: 'Morning', 2: 'Afternoon', 3: 'Evening' };
    return `Session ${num} (${labels[num] || ''})`;
  };

  const drawingCount = checkpoint?.checkpoint?.drawing_count ?? 0;
  const drawingRequired = 3;

  if (!activeClassroom) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Select a classroom to continue.</Typography>
      </Box>
    );
  }

  if (!examDate) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Alert severity="warning">
          No exam date selected. <Button onClick={() => router.push('/student/exam-recall')}>Go back</Button>
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header with back button */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/student/exam-recall')}
          size="small"
          color="inherit"
        >
          Back
        </Button>
      </Stack>

      {/* Selected exam context */}
      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mb: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Chip label={formatExamDate(examDate)} size="small" color="primary" variant="outlined" />
          <Chip label={getSessionLabel(sessionNumber)} size="small" variant="outlined" />
        </Stack>
      </Paper>

      {/* Checkpoint progress */}
      {checkpointLoading ? (
        <Skeleton variant="rounded" height={60} sx={{ mb: 2 }} />
      ) : checkpoint ? (
        <Box sx={{ mb: 2 }}>
          <CheckpointProgress checkpoint={checkpoint} />
        </Box>
      ) : null}

      {/* Similar question banner */}
      {showSimilarBanner && similarMatches.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <SimilarQuestionBanner
            matches={similarMatches}
            onSame={handleSimilarSame}
            onRefine={handleSimilarRefine}
            onDifferent={handleSimilarDifferent}
          />
        </Box>
      )}

      {/* Drawing Section — always visible at top */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, md: 2.5 },
          mb: 3,
          borderRadius: 2,
          borderColor: drawingCount < drawingRequired ? 'warning.main' : 'success.main',
          bgcolor: drawingCount < drawingRequired ? 'warning.50' : 'success.50',
        }}
      >
        {drawingCount < drawingRequired ? (
          <>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Drawing recall is required — {drawingRequired - drawingCount} more needed
            </Alert>
            <ContributeDrawing
              examDate={examDate}
              sessionNumber={sessionNumber}
              classroomId={activeClassroom.id}
              onSubmit={handleDrawingSubmit}
            />
          </>
        ) : (
          <Stack direction="row" alignItems="center" spacing={1}>
            <CheckCircleIcon color="success" />
            <Typography variant="body2" fontWeight={600} color="success.main">
              Drawing questions submitted ({drawingCount})
            </Typography>
            <Button
              size="small"
              variant="text"
              onClick={() => {
                // Expand drawing form for adding more
                setActiveTab(-1); // temporary — just show drawing
              }}
            >
              Add more
            </Button>
          </Stack>
        )}
      </Paper>

      {/* Drawing expand section when "Add more" is clicked and checkpoint met */}
      {drawingCount >= drawingRequired && activeTab === -1 && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 3, borderRadius: 2 }}>
          <ContributeDrawing
            examDate={examDate}
            sessionNumber={sessionNumber}
            classroomId={activeClassroom.id}
            onSubmit={async (drawings) => {
              await handleDrawingSubmit(drawings);
              setActiveTab(0);
            }}
          />
        </Paper>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Input mode tabs */}
      <Tabs
        value={activeTab >= 0 ? activeTab : 0}
        onChange={(_, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 2,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': { minHeight: 48, textTransform: 'none', fontSize: '0.85rem' },
        }}
      >
        {TAB_LABELS.map((tab, i) => (
          <Tab
            key={i}
            label={
              <Stack direction="row" alignItems="center" spacing={0.5}>
                {tab.icon}
                <span>{tab.label}</span>
              </Stack>
            }
          />
        ))}
      </Tabs>

      {/* Tab content */}
      <Box sx={{ minHeight: 300 }}>
        {/* Type It */}
        {activeTab === 0 && (
          <ContributeTypeIt
            examDate={examDate}
            sessionNumber={sessionNumber}
            classroomId={activeClassroom.id}
            onSubmit={handleTypeItSubmit}
            onSimilarFound={(matches) => {
              setSimilarMatches(matches);
              setShowSimilarBanner(true);
            }}
          />
        )}

        {/* Photo Notes — OCR then prefill TypeIt */}
        {activeTab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Upload a photo of your handwritten notes. We&apos;ll extract the text so you can review and
              submit each question.
            </Typography>
            <OCRPreview onExtracted={handleOCRExtracted} uploadType="notes" />
            {ocrQuestions.length > 0 && (
              <Alert severity="info" sx={{ mt: 2 }}>
                {ocrQuestions.length} question(s) extracted. Switched to &quot;Type It&quot; tab for review.
              </Alert>
            )}
          </Box>
        )}

        {/* Quick List */}
        {activeTab === 2 && (
          <ContributeQuickList
            examDate={examDate}
            sessionNumber={sessionNumber}
            classroomId={activeClassroom.id}
            onSubmit={handleQuickListSubmit}
          />
        )}

        {/* Paper Photo — OCR for question papers */}
        {activeTab === 3 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Upload a photo of the question paper (if you have one). We&apos;ll extract questions
              for review.
            </Typography>
            <OCRPreview onExtracted={handleOCRExtracted} uploadType="question_paper" />
          </Box>
        )}

        {/* Tips */}
        {activeTab === 4 && (
          <ContributeTips
            examDate={examDate}
            sessionNumber={sessionNumber}
            classroomId={activeClassroom.id}
            onSubmit={handleTipsSubmit}
          />
        )}
      </Box>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
