'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Chip, Avatar, Button, Divider, Card, CardContent,
  IconButton, EditIcon, DeleteIcon, Alert, Skeleton,
} from '@neram/ui';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { QuestionPostDisplay, QuestionCommentDisplay, VoteType, QBAccessInfo, QuestionChangeRequest } from '@neram/database';
import VoteButton from '@/components/question-bank/VoteButton';
import ConfidenceIndicator from '@/components/question-bank/ConfidenceIndicator';
import AdminBadge from '@/components/question-bank/AdminBadge';
import ImprovementSection from '@/components/question-bank/ImprovementSection';
import SessionTracker from '@/components/question-bank/SessionTracker';
import BlurredContent from '@/components/question-bank/BlurredContent';
import ContributionPrompt from '@/components/question-bank/ContributionPrompt';
import CommentSection from '@/components/question-bank/CommentSection';
import EditQuestionDialog from '@/components/question-bank/EditQuestionDialog';
import DeleteQuestionDialog from '@/components/question-bank/DeleteQuestionDialog';
import ChangeRequestStatus from '@/components/question-bank/ChangeRequestStatus';

const CATEGORY_LABELS: Record<string, string> = {
  mathematics: 'Mathematics',
  general_aptitude: 'General Aptitude',
  drawing: 'Drawing',
  logical_reasoning: 'Logical Reasoning',
  aesthetic_sensitivity: 'Aesthetic Sensitivity',
  other: 'Other',
};

const LIST_HREF = '/tools/nata/question-bank';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

async function readJson<T>(res: Response | null | undefined): Promise<T | null> {
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function DetailSkeleton() {
  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }} aria-hidden="true">
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
            <Skeleton variant="circular" width={36} height={36} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width={140} />
              <Skeleton variant="text" width={80} />
            </Box>
          </Stack>
          <Skeleton variant="text" width="85%" height={36} />
          <Stack direction="row" spacing={1} sx={{ my: 1.5 }}>
            <Skeleton variant="rounded" width={110} height={24} />
            <Skeleton variant="rounded" width={80} height={24} />
          </Stack>
          <Skeleton variant="text" />
          <Skeleton variant="text" />
          <Skeleton variant="text" width="70%" />
        </CardContent>
      </Card>
      <Skeleton variant="rounded" height={44} sx={{ mb: 2 }} />
      <Skeleton variant="rounded" height={44} sx={{ mb: 2 }} />
      <Skeleton variant="rounded" height={120} />
    </Box>
  );
}

export default function QuestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useFirebaseAuth();
  const userId = user?.id ?? null;

  const [question, setQuestion] = useState<QuestionPostDisplay | null>(null);
  const [comments, setComments] = useState<QuestionCommentDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Bumped on every successful load so child state (votes, comments) restarts from fresh data
  const [dataVersion, setDataVersion] = useState(0);
  const [accessInfo, setAccessInfo] = useState<QBAccessInfo | null>(null);
  const [userDbId, setUserDbId] = useState<string | null>(null);
  const [changeRequests, setChangeRequests] = useState<QuestionChangeRequest[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      return token || null;
    } catch {
      return null;
    }
  }, []);

  // One load per question, with the token, every request in parallel
  useEffect(() => {
    if (!id || authLoading) return;
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      setLoading(true);
      setNotFound(false);
      setLoadError(null);
      try {
        const token = userId ? await getAuthToken() : null;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        if (token) {
          // Track the view (fire and forget)
          fetch('/api/questions/qb-stats', { method: 'POST', headers }).catch(() => {});
        }

        const optional = (url: string) => fetch(url, { headers, signal }).catch(() => null);
        const [questionRes, commentsRes, statsRes, meRes, crRes] = await Promise.all([
          fetch(`/api/questions/${id}`, { headers, signal }),
          optional(`/api/questions/${id}/comments`),
          token ? optional('/api/questions/qb-stats') : Promise.resolve(null),
          token ? optional('/api/auth/me') : Promise.resolve(null),
          token ? optional(`/api/questions/${id}/edit-request`) : Promise.resolve(null),
        ]);

        if (!questionRes.ok) {
          if (signal.aborted) return;
          if (questionRes.status === 404) {
            setNotFound(true);
          } else {
            setLoadError('Could not load this question. Please try again.');
          }
          return;
        }

        const [questionData, commentsData, statsData, meData, crData] = await Promise.all([
          readJson<{ data: QuestionPostDisplay }>(questionRes),
          readJson<{ data: QuestionCommentDisplay[] }>(commentsRes),
          readJson<{ data: QBAccessInfo }>(statsRes),
          readJson<{ data?: { id?: string }; id?: string }>(meRes),
          readJson<{ data: QuestionChangeRequest[] }>(crRes),
        ]);
        if (signal.aborted) return;

        if (!questionData?.data) {
          setLoadError('Could not load this question. Please try again.');
          return;
        }

        setQuestion(questionData.data);
        setComments(commentsData?.data || []);
        setAccessInfo(statsData?.data ?? null);
        setUserDbId(meData?.data?.id || meData?.id || null);
        setChangeRequests(crData?.data || []);
        setDataVersion((v) => v + 1);
      } catch (error) {
        if (signal.aborted) return;
        console.error('Error fetching question:', error);
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setLoadError(
          offline
            ? 'You seem to be offline. Check your connection and try again.'
            : 'Could not load this question. Please try again.'
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [id, authLoading, userId, getAuthToken, reloadKey]);

  const refetchAfterChangeRequest = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const [questionRes, crRes] = await Promise.all([
        fetch(`/api/questions/${id}`, { headers }),
        fetch(`/api/questions/${id}/edit-request`, { headers }),
      ]);

      const [questionData, crData] = await Promise.all([
        readJson<{ data: QuestionPostDisplay }>(questionRes),
        readJson<{ data: QuestionChangeRequest[] }>(crRes),
      ]);
      // VoteButton follows the new props itself; comments keep any replies posted meanwhile
      if (questionData?.data) setQuestion(questionData.data);
      if (crData) setChangeRequests(crData.data || []);
    } catch {
      // Non-critical
    }
  }, [id, getAuthToken]);

  const handleVote = async (vote: VoteType): Promise<{ vote: VoteType | null; voteScore: number }> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`/api/questions/${id}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ vote }),
    });
    if (!res.ok) throw new Error('Vote failed');
    const data = await res.json();
    return data.data;
  };

  if (loading) {
    return <DetailSkeleton />;
  }

  if (loadError) {
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', py: 4 }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Question
        </Typography>
        <Alert
          severity="error"
          role="alert"
          action={
            <Button color="inherit" onClick={() => setReloadKey((n) => n + 1)} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>
              Retry
            </Button>
          }
        >
          {loadError}
        </Alert>
      </Box>
    );
  }

  if (notFound || !question) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, maxWidth: 500, mx: 'auto' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Question not found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          This question may have been removed or is still pending review.
        </Typography>
        <Button component={Link} href={LIST_HREF} variant="contained" sx={{ minHeight: 44 }}>
          Go to Question Bank
        </Button>
      </Box>
    );
  }

  const childKey = `${question.id}-${dataVersion}`;
  const isAuthor = !!user && !!userDbId && question.user_id === userDbId;

  return (
    <Box component="article" sx={{ maxWidth: 800, mx: 'auto' }}>
      {/* Question card with vote column */}
      <Card
        variant="outlined"
        sx={{
          mb: 3,
          borderLeft: question.is_admin_post ? '3px solid' : undefined,
          borderLeftColor: question.is_admin_post ? 'warning.main' : undefined,
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Stack direction="row" spacing={{ xs: 1, sm: 2 }}>
            {user && (
              <Box sx={{ pt: 0.5, ml: { xs: -1, sm: 0 } }}>
                <VoteButton
                  key={childKey}
                  score={question.vote_score}
                  userVote={question.user_vote || null}
                  onVote={handleVote}
                />
              </Box>
            )}

            <Box sx={{ flex: 1, minWidth: 0 }}>
              {/* Author row */}
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                <Avatar
                  src={question.author?.avatar_url || undefined}
                  alt=""
                  sx={{ width: 36, height: 36 }}
                >
                  {(question.author?.name || 'U')[0]}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" fontWeight={600}>
                      {question.author?.name || 'Anonymous'}
                    </Typography>
                    <AdminBadge isAdminPost={question.is_admin_post} authorUserType={question.author?.user_type} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {timeAgo(question.created_at)}
                  </Typography>
                </Box>
              </Stack>

              {/* Title with Edit/Delete actions */}
              <Stack direction="row" alignItems="flex-start" spacing={1}>
                <Typography
                  variant="h5"
                  component="h1"
                  sx={{ mb: 0.5, lineHeight: 1.3, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
                >
                  {question.title}
                </Typography>
                {isAuthor && (
                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, mt: -0.5 }}>
                    <IconButton
                      onClick={() => setEditDialogOpen(true)}
                      aria-label="Edit question"
                      sx={{ width: 44, height: 44, color: 'text.secondary' }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      onClick={() => setDeleteDialogOpen(true)}
                      aria-label="Delete question"
                      sx={{ width: 44, height: 44, color: 'error.main' }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                )}
              </Stack>

              <ChangeRequestStatus requests={changeRequests} />

              {/* Tags */}
              <Stack direction="row" spacing={1} sx={{ my: 1.5 }} flexWrap="wrap" useFlexGap>
                <Chip
                  label={CATEGORY_LABELS[question.category] || question.category}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
                {question.exam_year && <Chip label={`NATA ${question.exam_year}`} size="small" variant="outlined" />}
                {question.exam_session && <Chip label={question.exam_session} size="small" variant="outlined" />}
                {question.confidence_level && question.confidence_level !== 3 && (
                  <ConfidenceIndicator level={question.confidence_level} />
                )}
                {question.tags?.map((tag) => (
                  <Chip key={tag} label={tag} size="small" variant="outlined" />
                ))}
              </Stack>

              {/* Body (blurred for users who need to contribute) */}
              <BlurredContent
                isBlurred={accessInfo?.accessLevel === 'blur_contribute'}
                contributionScore={accessInfo?.stats?.contribution_score}
              >
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, mb: 2, overflowWrap: 'anywhere' }}>
                  {question.body}
                </Typography>
              </BlurredContent>

              {/* Images */}
              {question.image_urls && question.image_urls.length > 0 && (
                <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
                  {question.image_urls.map((url, i) => (
                    <Box
                      key={i}
                      component="a"
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open question image ${i + 1} in a new tab`}
                      sx={{
                        display: 'block',
                        width: { xs: '100%', sm: 200 },
                        maxHeight: 200,
                        borderRadius: 1,
                        overflow: 'hidden',
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Question image ${i + 1}`}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </Box>
                  ))}
                </Stack>
              )}

              {/* Stats row */}
              <Divider sx={{ mb: 1.5 }} />
              <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
                {!user && (
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {question.vote_score > 0 ? '+' : ''}{question.vote_score} votes
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  {question.comment_count} {question.comment_count === 1 ? 'comment' : 'comments'}
                </Typography>
                {question.improvement_count > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {question.improvement_count} {question.improvement_count === 1 ? 'improvement' : 'improvements'}
                  </Typography>
                )}
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {accessInfo && <ContributionPrompt accessInfo={accessInfo} />}

      <SessionTracker
        key={`sessions-${childKey}`}
        questionId={id}
        sessionCount={question.session_count || 0}
        isAuthenticated={!!user}
        getAuthToken={getAuthToken}
      />

      <ImprovementSection
        key={`improvements-${question.id}`}
        questionId={id}
        improvementCount={question.improvement_count || 0}
        isAuthenticated={!!user}
        getAuthToken={getAuthToken}
      />

      <Box sx={{ mt: 3 }}>
        <CommentSection
          key={`comments-${childKey}`}
          comments={comments}
          questionId={id}
          isAuthenticated={!!user}
          getAuthToken={getAuthToken}
        />
      </Box>

      <EditQuestionDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        question={question}
        onSubmitted={refetchAfterChangeRequest}
      />
      <DeleteQuestionDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        question={question}
        onSubmitted={refetchAfterChangeRequest}
      />
    </Box>
  );
}
