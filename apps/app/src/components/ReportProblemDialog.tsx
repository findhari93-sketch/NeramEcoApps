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
import type { SupportTicketCategory } from '@neram/database/types';
import { collectDeviceInfo } from '@/lib/device-collector';
import { getRecentErrors } from '@/lib/error-buffer';
import { collectScreenshotPaths, compressForUpload } from '@/lib/issue-screenshot-upload';

// These are the support_tickets categories, used here verbatim rather than
// mapped from a second set. A report from this dialog lands in the Admin
// support queue, so the reporter picks from the same list staff filter on.
const CATEGORIES: { value: SupportTicketCategory; label: string }[] = [
  { value: 'technical_issue', label: 'Something Broken' },
  { value: 'course_question', label: 'Course or Content Question' },
  { value: 'account_issue', label: 'Account Problem' },
  { value: 'payment_issue', label: 'Payment Problem' },
  { value: 'enrollment_issue', label: 'Enrollment Problem' },
  { value: 'other', label: 'Other' },
];

const DEFAULT_CATEGORY: SupportTicketCategory = 'technical_issue';

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
  prefill?: { title?: string; description?: string; category?: SupportTicketCategory };
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

  const [category, setCategory] = useState<SupportTicketCategory>(DEFAULT_CATEGORY);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]); // storage paths
  const [submitting, setSubmitting] = useState(false);
  // The auto-captured page shot is held here and uploaded at SUBMIT time. Keep
  // it that way: uploading it early and writing the path back through state is
  // what silently lost every screenshot before. See issue-screenshot-upload.ts.
  const [autoShotDropped, setAutoShotDropped] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [autoShotPreview, setAutoShotPreview] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const autoShot = autoShotDropped ? null : initialScreenshotFile || null;

  const resetForm = () => {
    setCategory(DEFAULT_CATEGORY);
    setTitle('');
    setDescription('');
    setScreenshots([]);
    setAutoShotDropped(false);
  };

  // Manual-upload closure for the shared widget: compress → POST → path.
  const uploadScreenshot = useCallback(
    async (file: File): Promise<{ url: string; path?: string }> => {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const compressed = await compressForUpload(file);
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
      setAutoShotDropped(false);
      return;
    }
    if (prefill) {
      if (prefill.category) setCategory(prefill.category);
      if (prefill.title) setTitle((t) => t || prefill.title || '');
      if (prefill.description) setDescription((d) => d || prefill.description || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Local preview of the page shot, so the reporter can see (and drop) what is
  // about to be attached. Nothing is sent to the server until Submit.
  useEffect(() => {
    if (!open || !autoShot) {
      setAutoShotPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(autoShot);
    setAutoShotPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [open, autoShot]);

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

      // Upload the page shot now, so its path goes straight into the body below
      // instead of through component state. Best-effort: a failed or slow upload
      // never blocks the report.
      if (autoShot) setAttaching(true);
      const screenshotPaths = await collectScreenshotPaths({
        manual: screenshots,
        autoFile: autoShot,
        upload: (file) => uploadScreenshot(file).then((r) => r.path || null),
      });
      setAttaching(false);

      const res = await fetch('/api/error-reports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          page_url: pageUrl || window.location.pathname,
          screenshot_urls: screenshotPaths.length > 0 ? screenshotPaths : undefined,
          device_info: deviceInfo,
          console_logs: consoleLogs.length > 0 ? consoleLogs : undefined,
        }),
      });
      if (!res.ok) {
        // A client that was open before enrolment changed, or one calling the
        // route directly, gets told what to do instead of a generic failure.
        if (res.status === 403) {
          throw new Error('Problem reports are for enrolled students. Please use Support to reach us.');
        }
        throw new Error('Could not send the report. Please try again.');
      }
      const data = await res.json();
      resetForm();
      onClose();
      setSnackbar({ open: true, message: `Report ${data.ticket_number} sent. Thank you!`, severity: 'success' });
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : 'Could not send the report. Please try again.';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setAttaching(false);
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
        onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
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

      {autoShotPreview && (
        <Box>
          <Typography variant="body2" sx={{ mb: 0.75, fontWeight: 600 }}>
            Picture of this page
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              component="img"
              src={autoShotPreview}
              alt="This page"
              sx={{
                width: 88,
                height: 88,
                objectFit: 'cover',
                objectPosition: 'top',
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'divider',
              }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                We will send this along so we can see what you saw.
              </Typography>
              <Button
                size="small"
                onClick={() => setAutoShotDropped(true)}
                disabled={submitting}
                sx={{ textTransform: 'none', minHeight: 40, px: 1, mt: 0.25 }}
              >
                Do not send it
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      <ImageUploadList
        label="Screenshots"
        values={screenshots.map(pathToUrl)}
        onChange={(urls) => setScreenshots(urls.map(urlToPath))}
        upload={uploadScreenshot}
        maxFiles={3}
        accept="image/jpeg,image/png,image/webp"
      />

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
        {attaching ? 'Attaching picture…' : submitting ? 'Sending…' : 'Send report'}
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
