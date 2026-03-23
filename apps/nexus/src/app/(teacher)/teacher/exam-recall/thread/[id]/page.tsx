'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Skeleton,
  Snackbar,
  Alert,
  Stack,
  MenuItem,
  TextField,
  Divider,
  Avatar,
  AvatarGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Collapse,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import TransformOutlinedIcon from '@mui/icons-material/TransformOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { VersionTimeline, CommentThread } from '@/components/exam-recall';
import type {
  ExamRecallThreadDetail,
  ExamRecallThreadStatus,
  ExamRecallVariantType,
  ExamRecallTopicCategory,
  ExamRecallClarity,
} from '@neram/database';

// --- Constants ---
const STATUS_OPTIONS: { value: ExamRecallThreadStatus; label: string; color: string; bgcolor: string }[] = [
  { value: 'raw', label: 'Raw', color: '#e65100', bgcolor: '#fff3e0' },
  { value: 'under_review', label: 'Under Review', color: '#1565c0', bgcolor: '#e3f2fd' },
  { value: 'published', label: 'Published', color: '#2e7d32', bgcolor: '#e8f5e9' },
  { value: 'dismissed', label: 'Dismissed', color: '#616161', bgcolor: '#f5f5f5' },
];

const VARIANT_TYPE_OPTIONS: { value: ExamRecallVariantType; label: string }[] = [
  { value: 'exact_repeat', label: 'Exact Repeat' },
  { value: 'different_values', label: 'Different Values' },
  { value: 'same_topic', label: 'Same Topic' },
];

const TOPIC_LABELS: Record<ExamRecallTopicCategory, string> = {
  visual_reasoning: 'Visual Reasoning',
  logical_derivation: 'Logical Derivation',
  gk_architecture: 'GK / Architecture',
  language: 'Language',
  design_sensitivity: 'Design Sensitivity',
  numerical_ability: 'Numerical Ability',
  drawing: 'Drawing',
};

const CLARITY_OPTIONS: { value: ExamRecallClarity; label: string }[] = [
  { value: 'clear', label: 'Clear' },
  { value: 'partial', label: 'Partial' },
  { value: 'vague', label: 'Vague' },
];

export default function ThreadModerationPage() {
  const router = useRouter();
  const params = useParams();
  const threadId = params.id as string;
  const theme = useTheme();
  const { getToken, user, activeClassroom } = useNexusAuthContext();

  // --- State ---
  const [thread, setThread] = useState<ExamRecallThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Staff version form
  const [showStaffVersionForm, setShowStaffVersionForm] = useState(false);
  const [staffVersion, setStaffVersion] = useState({
    recall_text: '',
    my_answer: '',
    my_working: '',
    clarity: 'clear' as ExamRecallClarity,
    options: [] as Array<{ id: string; text: string }>,
  });
  const [submittingVersion, setSubmittingVersion] = useState(false);

  // Link variant dialog
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkThreadId, setLinkThreadId] = useState('');
  const [linkVariantType, setLinkVariantType] = useState<ExamRecallVariantType>('same_topic');
  const [linking, setLinking] = useState(false);

  // Convert to QB dialog
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertData, setConvertData] = useState({
    question_text: '',
    question_format: '',
    topic: '',
    options: [] as Array<{ id: string; text: string }>,
  });

  // Inline edit
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Upload
  const [uploading, setUploading] = useState(false);

  // Sections collapse
  const [showConfirmers, setShowConfirmers] = useState(false);
  const [showUploads, setShowUploads] = useState(true);
  const [showVariants, setShowVariants] = useState(true);

  // --- Fetch thread detail ---
  const fetchThread = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`/api/exam-recall/threads/${threadId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch thread');
      const data: ExamRecallThreadDetail = await res.json();
      setThread(data);

      // Pre-fill convert dialog from most-vouched version
      if (data.versions.length > 0) {
        const sorted = [...data.versions].sort((a, b) => b.vouch_count - a.vouch_count);
        const best = sorted[0];
        setConvertData({
          question_text: best.recall_text || '',
          question_format: data.question_type,
          topic: data.topic_category || '',
          options: best.options || [],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thread');
    } finally {
      setLoading(false);
    }
  }, [threadId, getToken]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  // --- Status update ---
  const handleStatusChange = async (newStatus: ExamRecallThreadStatus) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/exam-recall/threads/${threadId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      setSnackbar({ open: true, message: `Status changed to ${newStatus}`, severity: 'success' });
      fetchThread();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed', severity: 'error' });
    }
  };

  // --- Version review (approve/reject) ---
  const handleVersionReview = async (versionId: string, status: 'approved' | 'rejected') => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/exam-recall/threads/${threadId}/versions/${versionId}/review`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to review version');
      setSnackbar({ open: true, message: `Version ${status}`, severity: 'success' });
      fetchThread();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed', severity: 'error' });
    }
  };

  // --- Add staff version ---
  const handleAddStaffVersion = async () => {
    if (!staffVersion.recall_text.trim()) return;
    try {
      setSubmittingVersion(true);
      const token = await getToken();
      const res = await fetch(`/api/exam-recall/threads/${threadId}/versions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recall_text: staffVersion.recall_text,
          my_answer: staffVersion.my_answer || null,
          my_working: staffVersion.my_working || null,
          clarity: staffVersion.clarity,
          options: staffVersion.options.length > 0 ? staffVersion.options : null,
        }),
      });
      if (!res.ok) throw new Error('Failed to add version');
      setSnackbar({ open: true, message: 'Staff version added', severity: 'success' });
      setShowStaffVersionForm(false);
      setStaffVersion({ recall_text: '', my_answer: '', my_working: '', clarity: 'clear', options: [] });
      fetchThread();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed', severity: 'error' });
    } finally {
      setSubmittingVersion(false);
    }
  };

  // --- Add comment ---
  const handleAddComment = async (body: string, parentId?: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/exam-recall/threads/${threadId}/comments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body, parent_comment_id: parentId || null }),
      });
      if (!res.ok) throw new Error('Failed to add comment');
      fetchThread();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed', severity: 'error' });
    }
  };

  // --- Link variant ---
  const handleLinkVariant = async () => {
    if (!linkThreadId.trim()) return;
    try {
      setLinking(true);
      const token = await getToken();
      const res = await fetch(`/api/exam-recall/threads/${threadId}/link`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          linked_thread_id: linkThreadId,
          variant_type: linkVariantType,
        }),
      });
      if (!res.ok) throw new Error('Failed to link variant');
      setSnackbar({ open: true, message: 'Variant linked', severity: 'success' });
      setShowLinkDialog(false);
      setLinkThreadId('');
      fetchThread();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed', severity: 'error' });
    } finally {
      setLinking(false);
    }
  };

  // --- Upload teacher image ---
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('thread_id', threadId);
      formData.append('upload_type', 'reference_image');
      const res = await fetch('/api/exam-recall/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      setSnackbar({ open: true, message: 'Image uploaded', severity: 'success' });
      fetchThread();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Upload failed', severity: 'error' });
    } finally {
      setUploading(false);
    }
  };

  // --- Vouch handler ---
  const handleVouch = async (versionId: string) => {
    try {
      const token = await getToken();
      await fetch(`/api/exam-recall/threads/${threadId}/vouch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ version_id: versionId }),
      });
      fetchThread();
    } catch {
      // Silently fail vouch toggle
    }
  };

  // --- Convert to QB ---
  const handleConvertToQB = () => {
    // Navigate to question bank creation pre-filled with data
    const qbParams = new URLSearchParams({
      question_text: convertData.question_text,
      question_format: convertData.question_format,
      topic: convertData.topic,
      source_exam_type: 'NATA',
      source_year: String(thread?.exam_year || ''),
      source_session: `${thread?.exam_date || ''} S${thread?.session_number || ''}`,
      recall_thread_id: threadId,
    });
    if (convertData.options.length > 0) {
      qbParams.set('options', JSON.stringify(convertData.options));
    }
    router.push(`/teacher/question-bank/new?${qbParams.toString()}`);
    setShowConvertDialog(false);
  };

  // --- Loading state ---
  if (loading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={48} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={200} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={300} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={200} />
      </Box>
    );
  }

  if (!thread) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          Thread not found.
        </Typography>
        <Button
          sx={{ mt: 2 }}
          variant="outlined"
          startIcon={<ArrowBackOutlinedIcon />}
          onClick={() => router.push('/teacher/exam-recall')}
        >
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  const currentStatusOption = STATUS_OPTIONS.find((s) => s.value === thread.status);

  return (
    <Box>
      {/* Back + Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => router.push('/teacher/exam-recall')} size="small">
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
          Thread Moderation
        </Typography>
      </Stack>

      {/* Status Control Header */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between">
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
              {currentStatusOption && (
                <Chip
                  label={currentStatusOption.label}
                  sx={{
                    bgcolor: currentStatusOption.bgcolor,
                    color: currentStatusOption.color,
                    fontWeight: 700,
                    fontSize: '0.85rem',
                  }}
                />
              )}
              <Chip label={thread.question_type.toUpperCase()} size="small" variant="outlined" />
              <Chip label={thread.section === 'part_a' ? 'Part A' : 'Part B'} size="small" variant="outlined" />
              {thread.topic_category && (
                <Chip label={TOPIC_LABELS[thread.topic_category]} size="small" variant="outlined" />
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {thread.exam_date} - Session {thread.session_number} | {thread.confirm_count} confirms, {thread.vouch_count} vouches, {thread.version_count} versions
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <TextField
              select
              size="small"
              value={thread.status}
              onChange={(e) => handleStatusChange(e.target.value as ExamRecallThreadStatus)}
              sx={{ minWidth: 160 }}
              label="Status"
            >
              {STATUS_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  <Chip
                    label={opt.label}
                    size="small"
                    sx={{ bgcolor: opt.bgcolor, color: opt.color, fontWeight: 600 }}
                  />
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              color="primary"
              startIcon={<TransformOutlinedIcon />}
              onClick={() => setShowConvertDialog(true)}
              size="small"
            >
              Convert to QB
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Version Timeline with Review Controls */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>
            Versions ({thread.versions.length})
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddCircleOutlineIcon />}
            onClick={() => setShowStaffVersionForm(!showStaffVersionForm)}
          >
            Add Staff Version
          </Button>
        </Stack>

        {/* Staff version form */}
        <Collapse in={showStaffVersionForm}>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.03),
              border: '1px dashed',
              borderColor: 'primary.main',
            }}
          >
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
              Add Staff Version (auto-approved)
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Recall Text"
                multiline
                rows={4}
                fullWidth
                value={staffVersion.recall_text}
                onChange={(e) => setStaffVersion((s) => ({ ...s, recall_text: e.target.value }))}
                placeholder="Enter the cleaned-up question text..."
              />
              {thread.question_type === 'mcq' && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    Options (one per line, e.g. A. option text):
                  </Typography>
                  <TextField
                    multiline
                    rows={4}
                    fullWidth
                    size="small"
                    placeholder={'A. First option\nB. Second option\nC. Third option\nD. Fourth option'}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n').filter((l) => l.trim());
                      const opts = lines.map((line, i) => ({
                        id: `staff_opt_${i}`,
                        text: line.replace(/^[A-Da-d][.)]\s*/, ''),
                      }));
                      setStaffVersion((s) => ({ ...s, options: opts }));
                    }}
                  />
                </Box>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="My Answer"
                  fullWidth
                  size="small"
                  value={staffVersion.my_answer}
                  onChange={(e) => setStaffVersion((s) => ({ ...s, my_answer: e.target.value }))}
                />
                <TextField
                  select
                  label="Clarity"
                  size="small"
                  value={staffVersion.clarity}
                  onChange={(e) => setStaffVersion((s) => ({ ...s, clarity: e.target.value as ExamRecallClarity }))}
                  sx={{ minWidth: 140 }}
                >
                  {CLARITY_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </TextField>
              </Stack>
              <TextField
                label="Working / Solution"
                multiline
                rows={3}
                fullWidth
                size="small"
                value={staffVersion.my_working}
                onChange={(e) => setStaffVersion((s) => ({ ...s, my_working: e.target.value }))}
              />
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setShowStaffVersionForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  disabled={!staffVersion.recall_text.trim() || submittingVersion}
                  onClick={handleAddStaffVersion}
                >
                  {submittingVersion ? 'Adding...' : 'Add Version'}
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Collapse>

        {/* Version timeline with review buttons */}
        <Box>
          {thread.versions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No versions yet.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {[...thread.versions]
                .sort((a, b) => a.version_number - b.version_number)
                .map((version) => (
                  <Box key={version.id}>
                    {/* Render the version using VersionTimeline's pattern inline */}
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: version.status === 'approved' ? alpha('#2e7d32', 0.3) : version.status === 'rejected' ? alpha('#d32f2f', 0.3) : 'grey.200',
                        bgcolor: version.status === 'approved' ? alpha('#2e7d32', 0.04) : version.status === 'rejected' ? alpha('#d32f2f', 0.04) : 'background.paper',
                      }}
                    >
                      {/* Version header */}
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <Chip
                          label={`v${version.version_number}`}
                          size="small"
                          sx={{ bgcolor: 'grey.800', color: '#fff', fontWeight: 700, fontSize: '0.7rem', height: 22 }}
                        />
                        <Avatar
                          src={version.author.avatar_url || undefined}
                          alt={version.author.name || 'User'}
                          sx={{ width: 28, height: 28, fontSize: '0.75rem' }}
                        >
                          {version.author.name?.[0] || '?'}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {version.author.name || 'Unknown'}
                            </Typography>
                            <Chip
                              label={version.author_role}
                              size="small"
                              sx={{ fontSize: '0.6rem', height: 18, textTransform: 'capitalize' }}
                            />
                            <Chip
                              label={version.status}
                              size="small"
                              sx={{
                                bgcolor: version.status === 'approved' ? '#e8f5e9' : version.status === 'rejected' ? '#ffebee' : '#fff3e0',
                                color: version.status === 'approved' ? '#2e7d32' : version.status === 'rejected' ? '#d32f2f' : '#e65100',
                                fontWeight: 600,
                                fontSize: '0.6rem',
                                height: 18,
                              }}
                            />
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(version.created_at).toLocaleString()}
                          </Typography>
                        </Box>

                        {/* Review buttons (only for pending_review) */}
                        {version.status === 'pending_review' && (
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Approve version">
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => handleVersionReview(version.id, 'approved')}
                              >
                                <CheckCircleOutlineIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject version">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleVersionReview(version.id, 'rejected')}
                              >
                                <CancelOutlinedIcon />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        )}

                        {/* Inline edit button */}
                        <Tooltip title="Edit version text">
                          <IconButton
                            size="small"
                            onClick={() => {
                              if (editingVersionId === version.id) {
                                setEditingVersionId(null);
                              } else {
                                setEditingVersionId(version.id);
                                setEditText(version.recall_text || '');
                              }
                            }}
                          >
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>

                      {/* Recall text (or inline edit) */}
                      {editingVersionId === version.id ? (
                        <Box sx={{ mb: 1 }}>
                          <TextField
                            multiline
                            rows={3}
                            fullWidth
                            size="small"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                          />
                          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={async () => {
                                // For inline edit, we POST a new version with the edited text
                                try {
                                  const token = await getToken();
                                  const res = await fetch(`/api/exam-recall/threads/${threadId}/versions`, {
                                    method: 'POST',
                                    headers: {
                                      Authorization: `Bearer ${token}`,
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                      recall_text: editText,
                                      clarity: version.clarity,
                                      options: version.options,
                                      my_answer: version.my_answer,
                                      my_working: version.my_working,
                                      parent_version_id: version.id,
                                    }),
                                  });
                                  if (!res.ok) throw new Error('Failed to save edit');
                                  setEditingVersionId(null);
                                  setSnackbar({ open: true, message: 'Edit saved as new version', severity: 'success' });
                                  fetchThread();
                                } catch (err) {
                                  setSnackbar({ open: true, message: 'Failed to save edit', severity: 'error' });
                                }
                              }}
                            >
                              Save as New Version
                            </Button>
                            <Button size="small" variant="outlined" onClick={() => setEditingVersionId(null)}>
                              Cancel
                            </Button>
                          </Stack>
                        </Box>
                      ) : (
                        <Typography variant="body2" sx={{ mb: 1, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {version.recall_text || 'No text'}
                        </Typography>
                      )}

                      {/* Options */}
                      {version.options && version.options.length > 0 && (
                        <Box sx={{ mb: 1, pl: 1 }}>
                          {version.options.map((opt, i) => (
                            <Typography key={opt.id} variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
                              <strong>{String.fromCharCode(65 + i)}.</strong> {opt.text}
                            </Typography>
                          ))}
                        </Box>
                      )}

                      {/* My answer + working */}
                      {version.my_answer && (
                        <Box sx={{ mb: 1, p: 1, borderRadius: 1, bgcolor: 'grey.50' }}>
                          <Typography variant="caption" color="text.secondary" fontWeight={600}>My Answer:</Typography>
                          <Typography variant="body2">{version.my_answer}</Typography>
                        </Box>
                      )}

                      {/* Images */}
                      {version.recall_image_urls && version.recall_image_urls.length > 0 && (
                        <Stack direction="row" spacing={1} sx={{ mb: 1, overflowX: 'auto' }}>
                          {version.recall_image_urls.map((url, i) => (
                            <Box
                              key={i}
                              component="img"
                              src={url}
                              alt={`Image ${i + 1}`}
                              sx={{
                                width: 120,
                                height: 120,
                                objectFit: 'cover',
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'grey.200',
                                cursor: 'pointer',
                              }}
                              onClick={() => window.open(url, '_blank')}
                            />
                          ))}
                        </Stack>
                      )}

                      {/* Bottom row: vouch count */}
                      <Typography variant="caption" color="text.secondary">
                        {version.vouch_count} vouch{version.vouch_count !== 1 ? 'es' : ''}
                      </Typography>
                    </Box>
                  </Box>
                ))}
            </Stack>
          )}
        </Box>
      </Paper>

      {/* All Confirmers */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          onClick={() => setShowConfirmers(!showConfirmers)}
          sx={{ cursor: 'pointer' }}
        >
          <Typography variant="h6" fontWeight={600}>
            Confirmers ({thread.confirms.length})
          </Typography>
          <IconButton size="small">
            {showConfirmers ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Stack>
        <Collapse in={showConfirmers}>
          <Stack spacing={1} sx={{ mt: 2 }}>
            {thread.confirms.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                No confirmations yet.
              </Typography>
            ) : (
              thread.confirms.map((confirm) => (
                <Stack key={confirm.id} direction="row" spacing={1.5} alignItems="center" sx={{ py: 0.5 }}>
                  <Avatar
                    src={confirm.user.avatar_url || undefined}
                    alt={confirm.user.name || 'User'}
                    sx={{ width: 32, height: 32, fontSize: '0.8rem' }}
                  >
                    {confirm.user.name?.[0] || '?'}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={500}>
                      {confirm.user.name || 'Unknown'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {confirm.exam_date && `Exam: ${confirm.exam_date}`}
                      {confirm.session_number != null && ` - Session ${confirm.session_number}`}
                      {confirm.note && ` | "${confirm.note}"`}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(confirm.created_at).toLocaleDateString()}
                  </Typography>
                </Stack>
              ))
            )}
          </Stack>
        </Collapse>
      </Paper>

      {/* Discussion Thread */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          Discussion ({thread.comments.length})
        </Typography>
        <CommentThread
          comments={thread.comments}
          onAddComment={handleAddComment}
          currentUserId={user?.id || ''}
        />
      </Paper>

      {/* Linked Variants */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: showVariants ? 2 : 0, cursor: 'pointer' }}
          onClick={() => setShowVariants(!showVariants)}
        >
          <Typography variant="h6" fontWeight={600}>
            Linked Variants ({thread.variants.length})
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<LinkOutlinedIcon />}
              onClick={(e) => {
                e.stopPropagation();
                setShowLinkDialog(true);
              }}
            >
              Link
            </Button>
            <IconButton size="small">
              {showVariants ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Stack>
        </Stack>
        <Collapse in={showVariants}>
          {thread.variants.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
              No linked variants.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {thread.variants.map((variant) => (
                <Stack
                  key={variant.id}
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  sx={{
                    p: 1.5,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'grey.200',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  }}
                  onClick={() => router.push(`/teacher/exam-recall/thread/${variant.linked_thread.id}`)}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={500}>
                      Thread {variant.linked_thread.id.slice(0, 8)}...
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {variant.linked_thread.exam_date} - Session {variant.linked_thread.session_number}
                    </Typography>
                  </Box>
                  <Chip
                    label={VARIANT_TYPE_OPTIONS.find((v) => v.value === variant.variant_type)?.label || variant.variant_type}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={variant.linked_thread.status}
                    size="small"
                    sx={{
                      bgcolor: variant.linked_thread.status === 'published' ? '#e8f5e9' : variant.linked_thread.status === 'raw' ? '#fff3e0' : '#e3f2fd',
                      color: variant.linked_thread.status === 'published' ? '#2e7d32' : variant.linked_thread.status === 'raw' ? '#e65100' : '#1565c0',
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      textTransform: 'capitalize',
                    }}
                  />
                </Stack>
              ))}
            </Stack>
          )}
        </Collapse>
      </Paper>

      {/* Uploads Gallery */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: showUploads ? 2 : 0, cursor: 'pointer' }}
          onClick={() => setShowUploads(!showUploads)}
        >
          <Typography variant="h6" fontWeight={600}>
            Uploads ({thread.uploads.length})
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              component="label"
              size="small"
              variant="outlined"
              startIcon={<CloudUploadOutlinedIcon />}
              disabled={uploading}
              onClick={(e) => e.stopPropagation()}
            >
              {uploading ? 'Uploading...' : 'Upload Cleaned Version'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={handleUpload}
              />
            </Button>
            <IconButton size="small">
              {showUploads ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Stack>
        </Stack>
        <Collapse in={showUploads}>
          {thread.uploads.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
              No uploads yet.
            </Typography>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
                gap: 2,
              }}
            >
              {thread.uploads.map((upload) => (
                <Box
                  key={upload.id}
                  sx={{
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'grey.200',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    '&:hover': { boxShadow: theme.shadows[2] },
                  }}
                  onClick={() => {
                    // Build full URL from storage_path
                    const url = upload.storage_path.startsWith('http')
                      ? upload.storage_path
                      : upload.storage_path;
                    window.open(url, '_blank');
                  }}
                >
                  {upload.mime_type.startsWith('image/') ? (
                    <Box
                      component="img"
                      src={upload.storage_path}
                      alt={upload.original_filename}
                      sx={{ width: '100%', height: 120, objectFit: 'cover' }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: '100%',
                        height: 120,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'grey.100',
                      }}
                    >
                      <ImageOutlinedIcon sx={{ fontSize: 40, color: 'grey.400' }} />
                    </Box>
                  )}
                  <Box sx={{ p: 1 }}>
                    <Typography variant="caption" noWrap display="block">
                      {upload.original_filename}
                    </Typography>
                    <Chip
                      label={upload.upload_type.replace(/_/g, ' ')}
                      size="small"
                      sx={{ fontSize: '0.6rem', height: 18, textTransform: 'capitalize', mt: 0.5 }}
                    />
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Collapse>
      </Paper>

      {/* Link Variant Dialog */}
      <Dialog open={showLinkDialog} onClose={() => setShowLinkDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Link to Another Thread</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Thread ID"
              fullWidth
              size="small"
              value={linkThreadId}
              onChange={(e) => setLinkThreadId(e.target.value)}
              placeholder="Enter thread ID to link..."
            />
            <TextField
              select
              label="Variant Type"
              fullWidth
              size="small"
              value={linkVariantType}
              onChange={(e) => setLinkVariantType(e.target.value as ExamRecallVariantType)}
            >
              {VARIANT_TYPE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowLinkDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleLinkVariant}
            disabled={!linkThreadId.trim() || linking}
          >
            {linking ? 'Linking...' : 'Link'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Convert to QB Dialog */}
      <Dialog open={showConvertDialog} onClose={() => setShowConvertDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Convert to Question Bank Question</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Question Text"
              multiline
              rows={4}
              fullWidth
              value={convertData.question_text}
              onChange={(e) => setConvertData((d) => ({ ...d, question_text: e.target.value }))}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Question Format"
                fullWidth
                size="small"
                value={convertData.question_format}
                onChange={(e) => setConvertData((d) => ({ ...d, question_format: e.target.value }))}
              />
              <TextField
                label="Topic"
                fullWidth
                size="small"
                value={convertData.topic}
                onChange={(e) => setConvertData((d) => ({ ...d, topic: e.target.value }))}
              />
            </Stack>
            {convertData.options.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Options:
                </Typography>
                {convertData.options.map((opt, i) => (
                  <Typography key={opt.id} variant="body2" sx={{ mb: 0.25 }}>
                    <strong>{String.fromCharCode(65 + i)}.</strong> {opt.text}
                  </Typography>
                ))}
              </Box>
            )}
            <Alert severity="info">
              Source: NATA {thread?.exam_year} | {thread?.exam_date} Session {thread?.session_number}
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConvertDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleConvertToQB}
          >
            Create in Question Bank
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error display */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
