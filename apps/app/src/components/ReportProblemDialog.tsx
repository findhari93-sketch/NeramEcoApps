'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  SwipeableDrawer,
  IconButton,
  useTheme,
  useMediaQuery,
  Snackbar,
  Alert,
  ImageUploadList,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import type { FoundationIssueCategory } from '@neram/database/types';
import { collectDeviceInfo } from '@/lib/device-collector';
import { getRecentErrors } from '@/lib/error-buffer';
import { compressImage } from '@/lib/image-compress';

const CATEGORIES: { value: FoundationIssueCategory; label: string }[] = [
  { value: 'bug', label: 'Bug / Something Broken' },
  { value: 'content_issue', label: 'Content Issue' },
  { value: 'ui_ux', label: 'UI/UX Problem' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'other', label: 'Other' },
];

const BUCKET_PREFIX = 'issue-screenshots/';
function pathToUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_PREFIX}${path}`;
}
function urlToPath(url: string): string {
  const idx = url.indexOf(BUCKET_PREFIX);
  return idx >= 0 ? url.slice(idx + BUCKET_PREFIX.length) : url;
}

interface ReportProblemDialogProps {
  open: boolean;
  onClose: () => void;
  getToken: () => Promise<string | null>;
  pageUrl?: string;
  initialScreenshotFile?: File | null;
  prefill?: { title?: string; description?: string; category?: FoundationIssueCategory };
}

export default function ReportProblemDialog({
  open,
  onClose,
  getToken,
  pageUrl,
  initialScreenshotFile,
  prefill,
}: ReportProblemDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [category, setCategory] = useState<FoundationIssueCategory>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]); // storage paths
  const [submitting, setSubmitting] = useState(false);
  const [autoHandled, setAutoHandled] = useState(false);
  const [autoUploading, setAutoUploading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const resetForm = () => {
    setCategory('bug');
    setTitle('');
    setDescription('');
    setScreenshots([]);
  };

  // Manual-upload closure for the shared widget: compress → POST → path.
  const uploadScreenshot = useCallback(
    async (file: File): Promise<{ url: string; path?: string }> => {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append('file', compressed, 'screenshot.jpg');
      const res = await fetch('/api/error-reports/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }
      const { path } = await res.json();
      return { url: pathToUrl(path), path };
    },
    [getToken],
  );

  // Apply prefill once when opening.
  useEffect(() => {
    if (!open) {
      setAutoHandled(false);
      return;
    }
    if (prefill) {
      if (prefill.category) setCategory(prefill.category);
      if (prefill.title) setTitle((t) => t || prefill.title || '');
      if (prefill.description) setDescription((d) => d || prefill.description || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Upload the auto-captured screenshot once, when the dialog opens (best-effort).
  useEffect(() => {
    if (!open || !initialScreenshotFile || autoHandled) return;
    setAutoHandled(true);
    let cancelled = false;
    (async () => {
      setAutoUploading(true);
      try {
        const { path } = await uploadScreenshot(initialScreenshotFile);
        if (!cancelled && path) setScreenshots((prev) => (prev.includes(path) ? prev : [path, ...prev]));
      } catch {
        /* best-effort */
      } finally {
        if (!cancelled) setAutoUploading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialScreenshotFile, autoHandled]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      let deviceInfo: ReturnType<typeof collectDeviceInfo> | undefined;
      try {
        deviceInfo = collectDeviceInfo();
      } catch {
        deviceInfo = undefined;
      }
      const consoleLogs = getRecentErrors();

      const res = await fetch('/api/error-reports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          page_url: pageUrl || window.location.pathname,
          screenshot_urls: screenshots.length > 0 ? screenshots : undefined,
          device_info: deviceInfo,
          console_logs: consoleLogs.length > 0 ? consoleLogs : undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      const data = await res.json();
      resetForm();
      onClose();
      setSnackbar({ open: true, message: `Report ${data.ticket_number} sent. Thank you!`, severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Could not send the report. Please try again.', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      resetForm();
      onClose();
    }
  };

  const formContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TextField
        select
        label="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value as FoundationIssueCategory)}
        size="small"
        fullWidth
      >
        {CATEGORIES.map((cat) => (
          <MenuItem key={cat.value} value={cat.value}>
            {cat.label}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        label="What's the issue?"
        placeholder="e.g. Page won't load, button does nothing..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        size="small"
        fullWidth
        required
        inputProps={{ maxLength: 200 }}
      />

      <TextField
        label="Details (optional)"
        placeholder="Describe what happened..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        size="small"
        fullWidth
        multiline
        rows={3}
        inputProps={{ maxLength: 2000 }}
      />

      <ImageUploadList
        label="Screenshots"
        values={screenshots.map(pathToUrl)}
        onChange={(urls) => setScreenshots(urls.map(urlToPath))}
        upload={uploadScreenshot}
        maxFiles={3}
        accept="image/jpeg,image/png,image/webp"
      />

      {autoUploading && (
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
          Attaching a screenshot of this page…
        </Typography>
      )}
      <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
        Technical details (page, device, recent errors) are attached automatically so we can fix this faster.
        {pageUrl ? ` Page: ${pageUrl}` : ''}
      </Typography>
    </Box>
  );

  const actions = (
    <>
      <Button onClick={handleClose} sx={{ textTransform: 'none' }}>
        Cancel
      </Button>
      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={submitting || !title.trim()}
        endIcon={<SendIcon sx={{ fontSize: '1rem !important' }} />}
        sx={{ textTransform: 'none', minHeight: 40 }}
      >
        {submitting ? 'Sending…' : 'Send report'}
      </Button>
    </>
  );

  return (
    <>
      {isMobile ? (
        <SwipeableDrawer
          anchor="bottom"
          open={open}
          onClose={handleClose}
          onOpen={() => {}}
          disableSwipeToOpen
          PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90vh' } }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
          </Box>
          <Box sx={{ px: 2.5, pb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Report a problem
              </Typography>
              <IconButton size="small" onClick={handleClose}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
            {formContent}
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2 }}>{actions}</Box>
          </Box>
        </SwipeableDrawer>
      ) : (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
            Report a problem
            <IconButton onClick={handleClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent>{formContent}</DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>{actions}</DialogActions>
        </Dialog>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
