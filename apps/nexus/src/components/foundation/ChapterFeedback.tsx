'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  TextField,
  Paper,
  Divider,
  Snackbar,
  Alert,
  alpha,
  useTheme,
  Collapse,
  MenuItem,
} from '@neram/ui';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import SendIcon from '@mui/icons-material/Send';
import type { NexusFoundationSection } from '@neram/database/types';

interface ChapterFeedbackProps {
  chapterId: string;
  sections: Pick<NexusFoundationSection, 'id' | 'title'>[];
  getToken: () => Promise<string | null>;
  /** Override feedback API URL. Defaults to `/api/foundation/chapters/{chapterId}/feedback` */
  feedbackApiUrl?: string;
  /** Override issues API URL. Defaults to `/api/foundation/issues` */
  issuesApiUrl?: string;
  /** Body key for the item ID in issue submissions. Defaults to `chapter_id` */
  issueItemKey?: string;
}

export default function ChapterFeedback({
  chapterId,
  sections,
  getToken,
  feedbackApiUrl,
  issuesApiUrl,
  issueItemKey = 'chapter_id',
}: ChapterFeedbackProps) {
  const theme = useTheme();
  const [reaction, setReaction] = useState<'like' | 'dislike' | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [dislikeCount, setDislikeCount] = useState(0);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [issueSectionId, setIssueSectionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Fetch existing reaction
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const url = feedbackApiUrl || `/api/foundation/chapters/${chapterId}/feedback`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setReaction(data.reaction?.reaction || null);
          if (data.counts) {
            setLikeCount(data.counts.like_count || 0);
            setDislikeCount(data.counts.dislike_count || 0);
          }
        }
      } catch {
        // silent
      }
    })();
  }, [chapterId, getToken]);

  const handleReaction = useCallback(async (type: 'like' | 'dislike') => {
    const newReaction = reaction === type ? null : type;
    const prevReaction = reaction;
    const prevLikes = likeCount;
    const prevDislikes = dislikeCount;

    // Optimistic update
    setReaction(newReaction);
    let newLikes = likeCount;
    let newDislikes = dislikeCount;
    if (prevReaction === 'like') newLikes--;
    if (prevReaction === 'dislike') newDislikes--;
    if (newReaction === 'like') newLikes++;
    if (newReaction === 'dislike') newDislikes++;
    setLikeCount(Math.max(0, newLikes));
    setDislikeCount(Math.max(0, newDislikes));

    try {
      const token = await getToken();
      if (!token) return;
      const url = feedbackApiUrl || `/api/foundation/chapters/${chapterId}/feedback`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction: newReaction }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.counts) {
          setLikeCount(data.counts.like_count || 0);
          setDislikeCount(data.counts.dislike_count || 0);
        }
      }
    } catch {
      // revert on error
      setReaction(prevReaction);
      setLikeCount(prevLikes);
      setDislikeCount(prevDislikes);
    }
  }, [reaction, likeCount, dislikeCount, chapterId, getToken]);

  const handleSubmitIssue = async () => {
    if (!issueTitle.trim()) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;

      const url = issuesApiUrl || '/api/foundation/issues';
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [issueItemKey]: chapterId,
          section_id: issueSectionId || undefined,
          title: issueTitle.trim(),
          description: issueDescription.trim(),
        }),
      });

      if (res.ok) {
        setIssueTitle('');
        setIssueDescription('');
        setIssueSectionId('');
        setShowIssueForm(false);
        setSnackbar({ open: true, message: 'Issue reported successfully. Your teacher will review it.', severity: 'success' });
      } else {
        throw new Error('Failed');
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to report issue. Please try again.', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ mt: 3, mb: 2 }}>
      <Divider sx={{ mb: 2.5 }} />

      {/* Like/Dislike row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mr: 1, fontSize: '0.85rem' }}>
            Was this chapter helpful?
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <IconButton
              onClick={() => handleReaction('like')}
              size="small"
              sx={{
                color: reaction === 'like' ? theme.palette.success.main : 'text.secondary',
                bgcolor: reaction === 'like' ? alpha(theme.palette.success.main, 0.08) : 'transparent',
                '&:hover': { bgcolor: alpha(theme.palette.success.main, 0.12) },
              }}
            >
              {reaction === 'like' ? <ThumbUpIcon fontSize="small" /> : <ThumbUpOutlinedIcon fontSize="small" />}
            </IconButton>
            {likeCount > 0 && (
              <Typography variant="caption" sx={{ color: reaction === 'like' ? theme.palette.success.main : 'text.secondary', fontWeight: 600, minWidth: 16 }}>
                {likeCount}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <IconButton
              onClick={() => handleReaction('dislike')}
              size="small"
              sx={{
                color: reaction === 'dislike' ? theme.palette.error.main : 'text.secondary',
                bgcolor: reaction === 'dislike' ? alpha(theme.palette.error.main, 0.08) : 'transparent',
                '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.12) },
              }}
            >
              {reaction === 'dislike' ? <ThumbDownIcon fontSize="small" /> : <ThumbDownOutlinedIcon fontSize="small" />}
            </IconButton>
            {dislikeCount > 0 && (
              <Typography variant="caption" sx={{ color: reaction === 'dislike' ? theme.palette.error.main : 'text.secondary', fontWeight: 600, minWidth: 16 }}>
                {dislikeCount}
              </Typography>
            )}
          </Box>
        </Box>

        <Button
          size="small"
          startIcon={<ReportProblemOutlinedIcon />}
          onClick={() => setShowIssueForm(!showIssueForm)}
          sx={{
            textTransform: 'none',
            color: 'text.secondary',
            fontSize: '0.8rem',
            '&:hover': { color: theme.palette.warning.main },
          }}
        >
          Report Issue
        </Button>
      </Box>

      {/* Issue form */}
      <Collapse in={showIssueForm}>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            mt: 1.5,
            borderColor: alpha(theme.palette.warning.main, 0.3),
            bgcolor: alpha(theme.palette.warning.main, 0.02),
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5, fontSize: '0.85rem' }}>
            Report an Issue
          </Typography>

          <TextField
            select
            label="Section (optional)"
            value={issueSectionId}
            onChange={(e) => setIssueSectionId(e.target.value)}
            size="small"
            fullWidth
            sx={{ mb: 1.5 }}
          >
            <MenuItem value="">General / Entire Chapter</MenuItem>
            {sections.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.title}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="What's the issue?"
            placeholder="e.g. Video not playing, Wrong answer in quiz, Audio issue..."
            value={issueTitle}
            onChange={(e) => setIssueTitle(e.target.value)}
            size="small"
            fullWidth
            sx={{ mb: 1.5 }}
          />

          <TextField
            label="Details (optional)"
            placeholder="Describe the issue in more detail..."
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
            sx={{ mb: 1.5 }}
          />

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              onClick={() => setShowIssueForm(false)}
              sx={{ textTransform: 'none' }}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              color="warning"
              onClick={handleSubmitIssue}
              disabled={submitting || !issueTitle.trim()}
              endIcon={<SendIcon sx={{ fontSize: '1rem !important' }} />}
              sx={{ textTransform: 'none', minHeight: 36 }}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </Box>
        </Paper>
      </Collapse>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
