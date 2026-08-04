'use client';

import { useState, useEffect } from 'react';
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
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import DesignServicesOutlinedIcon from '@mui/icons-material/DesignServicesOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import ScreenshotUploader from './ScreenshotUploader';
import type { FoundationIssueCategory } from '@neram/database/types';
import { collectDeviceInfo } from '@/lib/device-collector';
import { getRecentErrors } from '@/lib/error-buffer';
import { collectScreenshotPaths, uploadIssueScreenshot } from '@/lib/issue-screenshot-upload';

const CATEGORIES: { value: FoundationIssueCategory; label: string; icon: React.ReactNode }[] = [
  { value: 'bug', label: 'Bug / Something Broken', icon: <BugReportOutlinedIcon fontSize="small" /> },
  { value: 'content_issue', label: 'Content Issue', icon: <MenuBookOutlinedIcon fontSize="small" /> },
  { value: 'ui_ux', label: 'UI/UX Problem', icon: <DesignServicesOutlinedIcon fontSize="small" /> },
  { value: 'feature_request', label: 'Feature Request', icon: <LightbulbOutlinedIcon fontSize="small" /> },
  { value: 'class_schedule', label: 'Class / Schedule Issue', icon: <EventOutlinedIcon fontSize="small" /> },
  { value: 'other', label: 'Other', icon: <HelpOutlineOutlinedIcon fontSize="small" /> },
];

interface ReportIssueDialogProps {
  open: boolean;
  onClose: () => void;
  getToken: () => Promise<string | null>;
  pageUrl?: string;
  defaultCategory?: FoundationIssueCategory;
  chapterId?: string;
  sectionId?: string;
  onSuccess?: () => void;
  /** Auto-captured screenshot of the page (taken before this dialog opened). */
  initialScreenshotFile?: File | null;
  /** Pre-fill the form (used when opened from an error surface). */
  prefill?: { title?: string; description?: string; category?: FoundationIssueCategory };
}

export default function ReportIssueDialog({
  open,
  onClose,
  getToken,
  pageUrl,
  defaultCategory,
  chapterId,
  sectionId,
  onSuccess,
  initialScreenshotFile,
  prefill,
}: ReportIssueDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [category, setCategory] = useState<FoundationIssueCategory>(defaultCategory || 'bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // The auto-captured page shot is held here and uploaded at SUBMIT time. Keep
  // it that way: uploading it early and writing the path back through state is
  // what silently lost every screenshot before. See issue-screenshot-upload.ts.
  const [autoShotDropped, setAutoShotDropped] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const autoShot = autoShotDropped ? null : initialScreenshotFile || null;

  const resetForm = () => {
    setCategory(defaultCategory || 'bug');
    setTitle('');
    setDescription('');
    setScreenshots([]);
    setAutoShotDropped(false);
  };

  // Apply the prefill (from an error surface) once, when the dialog opens.
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

  // Local preview of the page shot, so the student can see (and drop) what is
  // about to be attached. Nothing is sent to the server until Submit.
  const [autoShotPreview, setAutoShotPreview] = useState<string | null>(null);
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
    if (!title.trim() || !category) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      // Auto-captured technical context (staff-only; never shown to the student).
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
        upload: (file) => uploadIssueScreenshot(file, token),
      });
      setAttaching(false);

      const res = await fetch('/api/foundation/issues', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          page_url: pageUrl || window.location.pathname,
          chapter_id: chapterId || undefined,
          section_id: sectionId || undefined,
          screenshot_urls: screenshotPaths.length > 0 ? screenshotPaths : undefined,
          device_info: deviceInfo,
          console_logs: consoleLogs.length > 0 ? consoleLogs : undefined,
          source_app: 'nexus',
        }),
      });

      if (!res.ok) throw new Error('Failed to submit');

      const data = await res.json();
      resetForm();
      onClose();
      setSnackbar({
        open: true,
        message: `Ticket ${data.issue.ticket_number} created successfully.`,
        severity: 'success',
      });
      onSuccess?.();
    } catch {
      setSnackbar({ open: true, message: 'Failed to submit ticket. Please try again.', severity: 'error' });
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
        onChange={(e) => setCategory(e.target.value as FoundationIssueCategory)}
        size="small"
        fullWidth
        required
      >
        {CATEGORIES.map((cat) => (
          <MenuItem key={cat.value} value={cat.value}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {cat.icon}
              {cat.label}
            </Box>
          </MenuItem>
        ))}
      </TextField>

      <TextField
        label="What's the issue?"
        placeholder="e.g. Video not playing, Wrong answer in quiz..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        size="small"
        fullWidth
        required
        inputProps={{ maxLength: 200 }}
      />

      <TextField
        label="Details (optional)"
        placeholder="Describe the issue in more detail..."
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

      <ScreenshotUploader
        screenshots={screenshots}
        onScreenshotsChange={setScreenshots}
        getToken={getToken}
      />

      <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
        Technical details (page, device, recent errors) are attached automatically so we can fix this faster.
        {pageUrl ? ` Page: ${pageUrl}` : ''}
      </Typography>
    </Box>
  );

  if (isMobile) {
    return (
      <>
        <SwipeableDrawer
          anchor="bottom"
          open={open}
          onClose={handleClose}
          onOpen={() => {}}
          disableSwipeToOpen
          PaperProps={{
            sx: {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '90vh',
            },
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
          </Box>

          <Box sx={{ px: 2.5, pb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Report an Issue
              </Typography>
              <IconButton size="small" onClick={handleClose}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>

            {formContent}

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2, pb: 2 }}>
              <Button size="small" onClick={handleClose} sx={{ textTransform: 'none' }}>
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleSubmit}
                disabled={submitting || !title.trim()}
                endIcon={<SendIcon sx={{ fontSize: '1rem !important' }} />}
                sx={{ textTransform: 'none', minHeight: 40, minWidth: 120 }}
              >
                {attaching ? 'Attaching picture…' : submitting ? 'Submitting...' : 'Submit Ticket'}
              </Button>
            </Box>
          </Box>
        </SwipeableDrawer>

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

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Report an Issue
          <IconButton onClick={handleClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>{formContent}</DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
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
            {attaching ? 'Attaching picture…' : submitting ? 'Submitting...' : 'Submit Ticket'}
          </Button>
        </DialogActions>
      </Dialog>

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
