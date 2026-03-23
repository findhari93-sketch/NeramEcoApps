'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Skeleton,
  Alert,
  Button,
  Tabs,
  Tab,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
  Divider,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PeopleIcon from '@mui/icons-material/People';
import QuizIcon from '@mui/icons-material/Quiz';
import PublishIcon from '@mui/icons-material/Publish';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CheckpointProgress from '@/components/exam-recall/CheckpointProgress';
import ThreadCard from '@/components/exam-recall/ThreadCard';
import TipCard from '@/components/exam-recall/TipCard';
import type {
  ExamRecallCheckpointStatus,
  ExamRecallThreadListItem,
  NexusExamRecallTip,
  User,
} from '@neram/database';

interface ExamDate {
  id: string;
  exam_type: string;
  year: number;
  phase: number | null;
  attempt_number: number;
  exam_date: string;
  label: string | null;
  registration_deadline: string | null;
  is_active: boolean;
}

type TipWithUser = NexusExamRecallTip & { user: Pick<User, 'id' | 'name' | 'avatar_url'> };

export default function ExamRecallPage() {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user, activeClassroom, getToken } = useNexusAuthContext();

  // Exam date selection
  const [examDates, setExamDates] = useState<ExamDate[]>([]);
  const [selectedExamDate, setSelectedExamDate] = useState('');
  const [selectedSession, setSelectedSession] = useState<number>(1);
  const [examDatesLoading, setExamDatesLoading] = useState(true);

  // Checkpoint
  const [checkpoint, setCheckpoint] = useState<ExamRecallCheckpointStatus | null>(null);
  const [checkpointLoading, setCheckpointLoading] = useState(false);

  // Threads & Tips
  const [threads, setThreads] = useState<ExamRecallThreadListItem[]>([]);
  const [myThreads, setMyThreads] = useState<ExamRecallThreadListItem[]>([]);
  const [tips, setTips] = useState<TipWithUser[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [tipsLoading, setTipsLoading] = useState(false);

  // Stats
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [contributorCount, setContributorCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);

  // Tab
  const [activeTab, setActiveTab] = useState(0);

  // Error
  const [error, setError] = useState<string | null>(null);

  // Fetch exam dates
  useEffect(() => {
    if (!activeClassroom) return;
    fetchExamDates();
  }, [activeClassroom]);

  // Fetch checkpoint + data when exam date/session changes
  useEffect(() => {
    if (!activeClassroom || !selectedExamDate) return;
    fetchCheckpoint();
    fetchThreads();
    fetchTips();
  }, [activeClassroom, selectedExamDate, selectedSession]);

  const fetchExamDates = useCallback(async () => {
    setExamDatesLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/documents/exam-dates?exam_type=nata&year=2026', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load exam dates');
      const data = await res.json();
      const dates: ExamDate[] = data.exam_dates || [];
      setExamDates(dates);
      if (dates.length > 0 && !selectedExamDate) {
        setSelectedExamDate(dates[0].exam_date);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exam dates');
    } finally {
      setExamDatesLoading(false);
    }
  }, [activeClassroom, getToken]);

  const fetchCheckpoint = useCallback(async () => {
    if (!activeClassroom || !selectedExamDate) return;
    setCheckpointLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        classroom_id: activeClassroom.id,
        exam_date: selectedExamDate,
        session_number: String(selectedSession),
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
  }, [activeClassroom, selectedExamDate, selectedSession, getToken]);

  const fetchThreads = useCallback(async () => {
    if (!activeClassroom) return;
    setThreadsLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        classroom_id: activeClassroom.id,
        exam_date: selectedExamDate,
        session_number: String(selectedSession),
        pageSize: '50',
      });
      const res = await fetch(`/api/exam-recall/threads?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load threads');
      const data = await res.json();
      const allThreads: ExamRecallThreadListItem[] = data.threads || [];
      setThreads(allThreads);
      setTotalQuestions(data.total || allThreads.length);

      // Filter my threads
      if (user) {
        setMyThreads(allThreads.filter((t) => t.created_by === user.id));
      }

      // Compute stats from threads
      const uniqueAuthors = new Set(allThreads.map((t) => t.created_by));
      setContributorCount(uniqueAuthors.size);
      setPublishedCount(allThreads.filter((t) => t.status === 'published').length);
    } catch (err) {
      console.error('Threads fetch error:', err);
    } finally {
      setThreadsLoading(false);
    }
  }, [activeClassroom, selectedExamDate, selectedSession, getToken, user]);

  const fetchTips = useCallback(async () => {
    if (!activeClassroom) return;
    setTipsLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        classroom_id: activeClassroom.id,
        exam_date: selectedExamDate,
      });
      const res = await fetch(`/api/exam-recall/tips?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load tips');
      const data = await res.json();
      setTips(data.tips || []);
    } catch (err) {
      console.error('Tips fetch error:', err);
    } finally {
      setTipsLoading(false);
    }
  }, [activeClassroom, selectedExamDate, getToken]);

  const handleTipUpvote = useCallback(
    async (tipId: string) => {
      try {
        const token = await getToken();
        await fetch(`/api/exam-recall/tips/${tipId}/upvote`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        fetchTips();
      } catch (err) {
        console.error('Upvote error:', err);
      }
    },
    [getToken, fetchTips],
  );

  const handleConfirm = useCallback(
    async (threadId: string) => {
      try {
        const token = await getToken();
        await fetch(`/api/exam-recall/threads/${threadId}/confirm`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        fetchThreads();
      } catch (err) {
        console.error('Confirm error:', err);
      }
    },
    [getToken, fetchThreads],
  );

  // Derive session options from selected exam date
  const sessionOptions = [1, 2, 3];

  const formatExamDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getSessionLabel = (num: number) => {
    const labels: Record<number, string> = { 1: 'Morning', 2: 'Afternoon', 3: 'Evening' };
    return `Session ${num} (${labels[num] || ''})`;
  };

  // No classroom selected
  if (!activeClassroom) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Select a classroom to continue.</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 3 }}
      >
        <Box>
          <Stack direction="row" alignItems="center" spacing={1}>
            <HistoryEduIcon sx={{ fontSize: { xs: '1.5rem', md: '1.8rem' }, color: 'primary.main' }} />
            <Typography variant={isMobile ? 'h6' : 'h5'} fontWeight={700}>
              NATA Exam Recall
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Help future students by sharing what you remember from your exam
          </Typography>
        </Box>
      </Stack>

      {/* Exam Date + Session Selector */}
      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mb: 3, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
            <InputLabel>Exam Date</InputLabel>
            <Select
              value={selectedExamDate}
              label="Exam Date"
              onChange={(e) => setSelectedExamDate(e.target.value)}
              disabled={examDatesLoading}
            >
              {examDates.map((d) => (
                <MenuItem key={d.id} value={d.exam_date}>
                  {d.label || formatExamDate(d.exam_date)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 180 } }}>
            <InputLabel>Session</InputLabel>
            <Select
              value={selectedSession}
              label="Session"
              onChange={(e) => setSelectedSession(Number(e.target.value))}
            >
              {sessionOptions.map((s) => (
                <MenuItem key={s} value={s}>
                  {getSessionLabel(s)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Loading state */}
      {(examDatesLoading || checkpointLoading) && (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={200} />
        </Stack>
      )}

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* No exam dates */}
      {!examDatesLoading && examDates.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No NATA exam dates found. Complete your NATA exam first, then come back to share what you
          remember.
        </Alert>
      )}

      {/* Main content: depends on checkpoint state */}
      {!examDatesLoading && !checkpointLoading && selectedExamDate && checkpoint && (
        <>
          {/* Checkpoint section: not yet unlocked */}
          {!checkpoint.is_unlocked && (
            <Paper
              variant="outlined"
              sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 2, bgcolor: 'background.paper' }}
            >
              <CheckpointProgress checkpoint={checkpoint} />
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Contribute at least 3 drawing recalls and 5 aptitude questions to unlock browsing
                all recalled questions.
              </Typography>
              <Button
                variant="contained"
                size={isMobile ? 'medium' : 'large'}
                endIcon={<ArrowForwardIcon />}
                onClick={() =>
                  router.push(
                    `/student/exam-recall/contribute?exam_date=${selectedExamDate}&session=${selectedSession}`,
                  )
                }
                fullWidth={isMobile}
              >
                Start Contributing
              </Button>
            </Paper>
          )}

          {/* Checkpoint met: show stats + tabs */}
          {checkpoint.is_unlocked && (
            <>
              {/* Quick Stats */}
              <Stack
                direction="row"
                spacing={{ xs: 1, sm: 2 }}
                sx={{ mb: 3, overflowX: 'auto', pb: 0.5 }}
              >
                <Paper
                  variant="outlined"
                  sx={{ px: { xs: 1.5, md: 2 }, py: 1, borderRadius: 2, minWidth: 100, textAlign: 'center' }}
                >
                  <Stack direction="row" alignItems="center" spacing={0.5} justifyContent="center">
                    <QuizIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />
                    <Typography variant="h6" fontWeight={700}>
                      {totalQuestions}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Questions
                  </Typography>
                </Paper>

                <Paper
                  variant="outlined"
                  sx={{ px: { xs: 1.5, md: 2 }, py: 1, borderRadius: 2, minWidth: 100, textAlign: 'center' }}
                >
                  <Stack direction="row" alignItems="center" spacing={0.5} justifyContent="center">
                    <PeopleIcon sx={{ fontSize: '1rem', color: 'secondary.main' }} />
                    <Typography variant="h6" fontWeight={700}>
                      {contributorCount}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Contributors
                  </Typography>
                </Paper>

                <Paper
                  variant="outlined"
                  sx={{ px: { xs: 1.5, md: 2 }, py: 1, borderRadius: 2, minWidth: 100, textAlign: 'center' }}
                >
                  <Stack direction="row" alignItems="center" spacing={0.5} justifyContent="center">
                    <PublishIcon sx={{ fontSize: '1rem', color: 'success.main' }} />
                    <Typography variant="h6" fontWeight={700}>
                      {publishedCount}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Published
                  </Typography>
                </Paper>
              </Stack>

              {/* Checkpoint badge */}
              <Box sx={{ mb: 2 }}>
                <CheckpointProgress checkpoint={checkpoint} />
              </Box>

              {/* Tab Navigation */}
              <Tabs
                value={activeTab}
                onChange={(_, v) => setActiveTab(v)}
                variant={isMobile ? 'fullWidth' : 'standard'}
                sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
              >
                <Tab label="My Contributions" />
                <Tab label="Browse All" />
                <Tab label="Tips" />
              </Tabs>

              {/* My Contributions tab */}
              {activeTab === 0 && (
                <Box>
                  {threadsLoading ? (
                    <Stack spacing={1.5}>
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} variant="rounded" height={100} />
                      ))}
                    </Stack>
                  ) : myThreads.length === 0 ? (
                    <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 2 }}>
                      <Typography color="text.secondary" sx={{ mb: 2 }}>
                        You haven&apos;t contributed any questions yet.
                      </Typography>
                      <Button
                        variant="outlined"
                        onClick={() =>
                          router.push(
                            `/student/exam-recall/contribute?exam_date=${selectedExamDate}&session=${selectedSession}`,
                          )
                        }
                      >
                        Contribute Now
                      </Button>
                    </Paper>
                  ) : (
                    <Stack spacing={1.5}>
                      {myThreads.map((thread) => (
                        <ThreadCard
                          key={thread.id}
                          thread={thread}
                          onConfirm={() => handleConfirm(thread.id)}
                          onThreadClick={() => router.push(`/student/exam-recall/thread/${thread.id}`)}
                        />
                      ))}
                    </Stack>
                  )}

                  {/* CTA to contribute more */}
                  <Box sx={{ mt: 2, textAlign: 'center' }}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() =>
                        router.push(
                          `/student/exam-recall/contribute?exam_date=${selectedExamDate}&session=${selectedSession}`,
                        )
                      }
                    >
                      Contribute More
                    </Button>
                  </Box>
                </Box>
              )}

              {/* Browse All tab */}
              {activeTab === 1 && (
                <Box>
                  {threadsLoading ? (
                    <Stack spacing={1.5}>
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} variant="rounded" height={100} />
                      ))}
                    </Stack>
                  ) : threads.length === 0 ? (
                    <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 2 }}>
                      <Typography color="text.secondary">
                        No questions recalled for this session yet.
                      </Typography>
                    </Paper>
                  ) : (
                    <>
                      <Stack spacing={1.5}>
                        {threads.map((thread) => (
                          <ThreadCard
                            key={thread.id}
                            thread={thread}
                            onConfirm={() => handleConfirm(thread.id)}
                            onThreadClick={() =>
                              router.push(`/student/exam-recall/thread/${thread.id}`)
                            }
                          />
                        ))}
                      </Stack>

                      {/* Link to full browse page */}
                      <Box sx={{ mt: 2, textAlign: 'center' }}>
                        <Button
                          variant="text"
                          endIcon={<ArrowForwardIcon />}
                          onClick={() =>
                            router.push(
                              `/student/exam-recall/browse?exam_date=${selectedExamDate}&session=${selectedSession}`,
                            )
                          }
                        >
                          View All with Filters
                        </Button>
                      </Box>
                    </>
                  )}
                </Box>
              )}

              {/* Tips tab */}
              {activeTab === 2 && (
                <Box>
                  {tipsLoading ? (
                    <Stack spacing={1.5}>
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} variant="rounded" height={80} />
                      ))}
                    </Stack>
                  ) : tips.length === 0 ? (
                    <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 2 }}>
                      <Typography color="text.secondary" sx={{ mb: 2 }}>
                        No tips shared yet. Be the first to share your exam experience!
                      </Typography>
                      <Button
                        variant="outlined"
                        onClick={() =>
                          router.push(
                            `/student/exam-recall/contribute?exam_date=${selectedExamDate}&session=${selectedSession}&tab=tips`,
                          )
                        }
                      >
                        Share Tips
                      </Button>
                    </Paper>
                  ) : (
                    <Stack spacing={1.5}>
                      {tips.map((tip) => (
                        <TipCard
                          key={tip.id}
                          tip={tip}
                          onUpvote={() => handleTipUpvote(tip.id)}
                        />
                      ))}
                    </Stack>
                  )}
                </Box>
              )}
            </>
          )}
        </>
      )}
    </Box>
  );
}
