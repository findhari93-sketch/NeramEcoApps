'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Chip, Avatar, CircularProgress, Button, Divider, Card, CardContent,
} from '@neram/ui';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { QuestionPostDisplay, QuestionCommentDisplay, VoteType, QBAccessInfo } from '@neram/database';
import VoteButton from '@/components/question-bank/VoteButton';
import ConfidenceIndicator from '@/components/question-bank/ConfidenceIndicator';
import AdminBadge from '@/components/question-bank/AdminBadge';
import ImprovementSection from '@/components/question-bank/ImprovementSection';
import SessionTracker from '@/components/question-bank/SessionTracker';
import BlurredContent from '@/components/question-bank/BlurredContent';
import ContributionPrompt from '@/components/question-bank/ContributionPrompt';
import CommentSection from '@/components/question-bank/CommentSection';

const CATEGORY_LABELS: Record<string, string> = {
  mathematics: 'Mathematics',
  general_aptitude: 'General Aptitude',
  drawing: 'Drawing',
  logical_reasoning: 'Logical Reasoning',
  aesthetic_sensitivity: 'Aesthetic Sensitivity',
  other: 'Other',
};

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

export default function QuestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useFirebaseAuth();

  const [question, setQuestion] = useState<QuestionPostDisplay | null>(null);
  const [comments, setComments] = useState<QuestionCommentDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accessInfo, setAccessInfo] = useState<QBAccessInfo | null>(null);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      return token || null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        let authHeader = '';
        if (user) {
          const token = await getAuthToken();
          if (token) authHeader = `Bearer ${token}`;
        }

        const headers: Record<string, string> = {};
        if (authHeader) headers.Authorization = authHeader;

        const fetches: Promise<Response>[] = [
          fetch(`/api/questions/${id}`, { headers }),
          fetch(`/api/questions/${id}/comments`, { headers }),
        ];
        // Fetch access info for authenticated users
        if (authHeader) {
          fetches.push(fetch('/api/questions/qb-stats', { headers }));
          // Track view
          fetch('/api/questions/qb-stats', { method: 'POST', headers }).catch(() => {});
        }

        const [questionRes, commentsRes, statsRes] = await Promise.all(fetches);

        if (!questionRes.ok) {
          setNotFound(true);
          return;
        }

        const questionData = await questionRes.json();
        setQuestion(questionData.data);

        if (commentsRes.ok) {
          const commentsData = await commentsRes.json();
          setComments(commentsData.data);
        }

        if (statsRes?.ok) {
          const statsData = await statsRes.json();
          setAccessInfo(statsData.data);
        }
      } catch (error) {
        console.error('Error fetching question:', error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    if (id) fetchData();
  }, [id, user, getAuthToken]);

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
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (notFound || !question) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, maxWidth: 500, mx: 'auto' }}>
        <Typography variant="h5" gutterBottom>
          Question not found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          This question may have been removed or is still pending review.
        </Typography>
        <Button component={Link} href="/tools/nata/question-bank" variant="contained">
          Back to Question Bank
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      {/* Back link */}
      <Button
        component={Link}
        href="/tools/nata/question-bank"
        size="small"
        sx={{ mb: 2 }}
        onClick={(e) => {
          if (window.history.length > 1) {
            e.preventDefault();
            router.back();
          }
        }}
      >
        &larr; Back
      </Button>

      {/* Question card with vote sidebar */}
      <Card
        sx={{
          mb: 3,
          borderLeft: question.is_admin_post ? '3px solid' : 'none',
          borderColor: question.is_admin_post ? 'warning.main' : 'transparent',
        }}
      >
        <CardContent>
          <Stack direction="row" spacing={2}>
            {/* Vote column */}
            {user && (
              <Box sx={{ pt: 0.5 }}>
                <VoteButton
                  score={question.vote_score}
                  userVote={question.user_vote || null}
                  onVote={handleVote}
                />
              </Box>
            )}

            {/* Content column */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {/* Author row */}
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                <Avatar
                  src={question.author?.avatar_url || undefined}
                  alt={question.author?.name || 'User'}
                  sx={{ width: 36, height: 36 }}
                >
                  {(question.author?.name || 'U')[0]}
                </Avatar>
                <Box>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="body2" fontWeight={600}>
                      {question.author?.name || 'Anonymous'}
                    </Typography>
                    <AdminBadge
                      isAdminPost={question.is_admin_post}
                      authorUserType={question.author?.user_type}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.disabled">
                    {timeAgo(question.created_at)}
                  </Typography>
                </Box>
              </Stack>

              {/* Title */}
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, lineHeight: 1.3 }}>
                {question.title}
              </Typography>

              {/* Tags */}
              <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                <Chip
                  label={CATEGORY_LABELS[question.category] || question.category}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
                {question.exam_year && (
                  <Chip label={`NATA ${question.exam_year}`} size="small" variant="outlined" />
                )}
                {question.exam_session && (
                  <Chip label={question.exam_session} size="small" variant="outlined" />
                )}
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
                <Typography
                  variant="body1"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.7,
                    mb: 2,
                  }}
                >
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
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </Box>
                  ))}
                </Stack>
              )}

              {/* Stats row */}
              <Divider sx={{ mb: 1.5 }} />
              <Stack direction="row" alignItems="center" spacing={2}>
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

      {/* Contribution prompt (for users who need to contribute) */}
      {accessInfo && <ContributionPrompt accessInfo={accessInfo} />}

      {/* Session tracker */}
      <SessionTracker
        questionId={id}
        sessionCount={question.session_count || 0}
        isAuthenticated={!!user}
        getAuthToken={getAuthToken}
      />

      {/* Improvements */}
      <ImprovementSection
        questionId={id}
        improvementCount={question.improvement_count || 0}
        isAuthenticated={!!user}
        getAuthToken={getAuthToken}
      />

      {/* Comments */}
      <CommentSection
        comments={comments}
        questionId={id}
        isAuthenticated={!!user}
        getAuthToken={getAuthToken}
      />
    </Box>
  );
}
