'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Avatar, Button, TextField, Divider, Alert, Card, CardContent, Chip, CircularProgress, Skeleton,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { QuestionImprovementDisplay, VoteType } from '@neram/database';
import VoteButton from './VoteButton';
import AdminBadge from './AdminBadge';

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

interface ImprovementSectionProps {
  questionId: string;
  improvementCount: number;
  isAuthenticated: boolean;
  getAuthToken: () => Promise<string | null>;
}

export default function ImprovementSection({
  questionId,
  improvementCount,
  isAuthenticated,
  getAuthToken,
}: ImprovementSectionProps) {
  const [improvements, setImprovements] = useState<QuestionImprovementDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchImprovements = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/questions/${questionId}/improvements`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setImprovements(data.data || []);
      setLoaded(true);
    } catch (error) {
      console.error('Error fetching improvements:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [questionId, getAuthToken]);

  // Load once when first opened
  useEffect(() => {
    if (expanded && !loaded && !loading && !loadError) {
      fetchImprovements();
    }
  }, [expanded, loaded, loading, loadError, fetchImprovements]);

  const handleSubmit = async () => {
    if (!newBody.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`/api/questions/${questionId}/improvements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: newBody.trim() }),
      });

      if (res.ok) {
        setNewBody('');
        setShowForm(false);
        setSubmitSuccess(true);
        setTimeout(() => setSubmitSuccess(false), 5000);
        fetchImprovements();
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error || 'Could not submit your improvement. Your text is still here, please try again.');
      }
    } catch (error) {
      console.error('Error submitting improvement:', error);
      setSubmitError('Could not submit your improvement. Your text is still here, please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (improvementId: string, vote: VoteType) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`/api/questions/${questionId}/improvements/${improvementId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ vote }),
    });

    if (!res.ok) throw new Error('Vote failed');
    const data = await res.json();
    if (!data?.data) throw new Error('Vote failed');
    return data.data;
  };

  const approvedCount = improvements.length;
  const displayCount = approvedCount || improvementCount;

  return (
    <Box sx={{ mt: 3 }}>
      <Divider sx={{ mb: 2 }} />

      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
        spacing={1}
        sx={{ mb: 1.5 }}
      >
        <Button
          onClick={() => setExpanded(!expanded)}
          endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          aria-expanded={expanded}
          aria-controls={`improvements-${questionId}`}
          sx={{ minHeight: 44, px: 1, ml: -1, fontWeight: 600, color: 'text.primary' }}
        >
          Suggested improvements ({displayCount})
        </Button>

        {isAuthenticated && !showForm && (
          <Button
            variant="outlined"
            startIcon={<EditNoteRoundedIcon />}
            onClick={() => { setExpanded(true); setShowForm(true); }}
            sx={{ minHeight: 44 }}
          >
            Suggest an improvement
          </Button>
        )}
      </Stack>

      {submitSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Your improvement has been submitted for review. It will appear once approved by moderators.
        </Alert>
      )}

      {expanded && (
        <Box id={`improvements-${questionId}`}>
          {/* Submit form */}
          {showForm && (
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Suggest a better version of this question. Add details you remember, fix inaccuracies, or clarify the wording.
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  maxRows={10}
                  placeholder="Write your improved version of this question..."
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  inputProps={{ maxLength: 5000, 'aria-label': 'Your improved version of this question' }}
                  helperText={newBody.trim().length > 0 && newBody.trim().length < 20
                    ? `At least 20 characters (${newBody.trim().length}/20)`
                    : `${newBody.length}/5000`}
                  sx={{ mb: 1.5 }}
                />
                {submitError && (
                  <Alert severity="error" role="alert" sx={{ mb: 1.5 }}>
                    {submitError}
                  </Alert>
                )}
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button onClick={() => setShowForm(false)} disabled={submitting} sx={{ minHeight: 44 }}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={!newBody.trim() || newBody.trim().length < 20 || submitting}
                    sx={{ minHeight: 44 }}
                  >
                    {submitting ? <CircularProgress size={18} color="inherit" aria-label="Submitting" /> : 'Submit for review'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Loading */}
          {loading && (
            <Box aria-hidden="true" sx={{ mb: 1.5 }}>
              <Skeleton variant="rounded" height={88} sx={{ mb: 1 }} />
              <Skeleton variant="rounded" height={88} />
            </Box>
          )}

          {!loading && loadError && (
            <Alert
              severity="error"
              role="alert"
              sx={{ mb: 1.5 }}
              action={
                <Button color="inherit" onClick={fetchImprovements} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>
                  Retry
                </Button>
              }
            >
              Could not load improvements.
            </Alert>
          )}

          {/* Improvements list */}
          {!loading && !loadError && improvements.length === 0 && !showForm && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No approved improvements yet. Be the first to suggest one.
            </Typography>
          )}

          {improvements.map((imp, idx) => (
            <Card
              key={imp.id}
              variant="outlined"
              sx={{
                mb: 1.5,
                borderColor: imp.is_accepted ? 'success.main' : idx === 0 && improvements.length > 1 ? 'primary.light' : 'divider',
                borderWidth: imp.is_accepted ? 2 : 1,
              }}
            >
              <CardContent sx={{ pb: '12px !important' }}>
                <Stack direction="row" spacing={1.5}>
                  {/* Vote button */}
                  {isAuthenticated && (
                    <VoteButton
                      score={imp.vote_score}
                      userVote={imp.user_vote || null}
                      onVote={(vote) => handleVote(imp.id, vote)}
                      size="small"
                    />
                  )}

                  {/* Content */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                      <Avatar
                        src={imp.author?.avatar_url || undefined}
                        alt=""
                        sx={{ width: 24, height: 24, fontSize: '0.75rem' }}
                      >
                        {(imp.author?.name || 'U')[0]}
                      </Avatar>
                      <Typography variant="body2" color="text.secondary">
                        {imp.author?.name || 'Anonymous'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {timeAgo(imp.created_at)}
                      </Typography>
                      <AdminBadge authorUserType={imp.author?.user_type} />
                      {imp.is_accepted && (
                        <Chip label="Best version" size="small" color="success" sx={{ height: 24, fontSize: '0.75rem' }} />
                      )}
                      {idx === 0 && !imp.is_accepted && improvements.length > 1 && (
                        <Chip label="Top voted" size="small" color="primary" variant="outlined" sx={{ height: 24, fontSize: '0.75rem' }} />
                      )}
                    </Stack>

                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {imp.body}
                    </Typography>

                    {!isAuthenticated && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {imp.vote_score} {imp.vote_score === 1 ? 'vote' : 'votes'}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
