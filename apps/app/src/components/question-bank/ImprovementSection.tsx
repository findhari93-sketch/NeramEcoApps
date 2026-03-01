'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Avatar, Button, TextField, Divider, Alert, Card, CardContent, Chip, CircularProgress,
} from '@neram/ui';
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

  const fetchImprovements = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/questions/${questionId}/improvements`, { headers });
      if (res.ok) {
        const data = await res.json();
        setImprovements(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching improvements:', error);
    } finally {
      setLoading(false);
    }
  }, [questionId, getAuthToken]);

  useEffect(() => {
    if (expanded && improvements.length === 0) {
      fetchImprovements();
    }
  }, [expanded, fetchImprovements, improvements.length]);

  const handleSubmit = async () => {
    if (!newBody.trim() || submitting) return;
    setSubmitting(true);
    try {
      const token = await getAuthToken();
      if (!token) return;

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
      }
    } catch (error) {
      console.error('Error submitting improvement:', error);
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

    const data = await res.json();
    return data.data;
  };

  const approvedCount = improvements.length;
  const displayCount = approvedCount || improvementCount;

  return (
    <Box sx={{ mt: 3 }}>
      <Divider sx={{ mb: 2 }} />

      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Button
          onClick={() => setExpanded(!expanded)}
          size="small"
          sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.95rem' }}
        >
          Suggested Improvements ({displayCount})
          <span style={{ marginLeft: 4, fontSize: '0.8rem' }}>{expanded ? '▲' : '▼'}</span>
        </Button>

        {isAuthenticated && !showForm && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => { setExpanded(true); setShowForm(true); }}
          >
            Suggest Improvement
          </Button>
        )}
      </Stack>

      {submitSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Your improvement has been submitted for review. It will appear once approved by moderators.
        </Alert>
      )}

      {expanded && (
        <Box>
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
                  inputProps={{ maxLength: 5000 }}
                  helperText={`${newBody.length}/5000`}
                  sx={{ mb: 1.5 }}
                />
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button size="small" onClick={() => setShowForm(false)} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleSubmit}
                    disabled={!newBody.trim() || newBody.trim().length < 20 || submitting}
                  >
                    {submitting ? <CircularProgress size={16} /> : 'Submit for Review'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Loading */}
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          {/* Improvements list */}
          {!loading && improvements.length === 0 && !showForm && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No approved improvements yet. Be the first to suggest one!
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
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                      <Avatar
                        src={imp.author?.avatar_url || undefined}
                        sx={{ width: 22, height: 22, fontSize: '0.7rem' }}
                      >
                        {(imp.author?.name || 'U')[0]}
                      </Avatar>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                        {imp.author?.name || 'Anonymous'}
                      </Typography>
                      <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.75rem' }}>
                        {timeAgo(imp.created_at)}
                      </Typography>
                      <AdminBadge authorUserType={imp.author?.user_type} />
                      {imp.is_accepted && (
                        <Chip label="Best Version" size="small" color="success" sx={{ height: 20, fontSize: '0.65rem' }} />
                      )}
                      {idx === 0 && !imp.is_accepted && improvements.length > 1 && (
                        <Chip label="Top Voted" size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      )}
                    </Stack>

                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {imp.body}
                    </Typography>

                    {!isAuthenticated && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.75rem' }}>
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
