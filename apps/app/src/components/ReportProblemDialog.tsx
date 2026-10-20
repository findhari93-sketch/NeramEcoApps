'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import Link from 'next/link';
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
  Alert,
  ImageUploadList,
  Skeleton,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import type { SupportTicketCategory } from '@neram/database/types';
import { collectReportDeviceInfo } from '@/lib/device-collector';
import { getRecentErrors } from '@/lib/error-buffer';
import { collectScreenshotPaths, compressForUpload } from '@/lib/issue-screenshot-upload';

/**
 * One form for every way a signed-in person raises a ticket in the Tools App.
 *
 *   mode="report"  the floating button and the crash screen. A picture of the
 *                  page is attached (they may drop it), details are optional.
 *   mode="support" "New request" on /support. Topic first, then subject and
 *                  description, attachments optional, no page picture.
 *
 * Both modes attach device details and recent console/network errors, so staff
 * can see what went wrong without asking. Phone: bottom sheet with the actions
 * pinned above the keyboard area. Wider: a dialog.
 *
 * After sending, the sheet shows the ticket number and a way to follow it.
 */

// The support_tickets categories, used verbatim. Staff filter on the same list.
const CATEGORIES: { value: SupportTicketCategory; label: string; hint: string }[] = [
  { value: 'technical_issue', label: 'Something is broken', hint: 'A page, button or tool not working' },
  { value: 'course_question', label: 'Course or content', hint: 'Classes, material, the question bank' },
  { value: 'account_issue', label: 'My account', hint: 'Sign in, phone, profile' },
  { value: 'payment_issue', label: 'Payment', hint: 'Fees, receipts, refunds' },
  { value: 'enrollment_issue', label: 'Enrollment', hint: 'Joining a class or course' },
  { value: 'other', label: 'Something else', hint: 'Anything not listed here' },
];

const BUCKET_PREFIX = 'issue-screenshots/';
function pathToUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_PREFIX}${path}`;
}
function urlToPath(url: string): string {
  const idx = url.indexOf(BUCKET_PREFIX);
  return idx >= 0 ? url.slice(idx + BUCKET_PREFIX.length) : url;
}

export type ReportDialogMode = 'report' | 'support';

export interface SubmittedTicket {
  id: string | null;
  ticket_number: string;
}

interface ReportProblemDialogProps {
  open: boolean;
  onClose: () => void;
  getToken: () => Promise<string | null>;
  pageUrl?: string;
  initialScreenshotFile?: File | null;
  /**
   * A page picture still being taken. The dialog opens at once and shows a
   * placeholder until it lands; Send waits a few seconds for it. Capturing
   * before opening made the button feel dead for up to 10s on a long page.
   */
  autoShotPromise?: Promise<File | null> | null;
  prefill?: { title?: string; description?: string; category?: SupportTicketCategory };
  mode?: ReportDialogMode;
  /** Called once the ticket exists, before the success view shows. */
  onSubmitted?: (ticket: SubmittedTicket) => void;
}

const touch = { minHeight: 48 } as const;

export default function ReportProblemDialog({
  open,
  onClose,
  getToken,
  pageUrl,
  initialScreenshotFile,
  autoShotPromise,
  prefill,
  mode = 'report',
  onSubmitted,
}: ReportProblemDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const titleId = useId();
  const isSupport = mode === 'support';
  const defaultCategory: SupportTicketCategory = isSupport ? 'other' : 'technical_issue';

  const [category, setCategory] = useState<SupportTicketCategory>(defaultCategory);
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
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SubmittedTicket | null>(null);

  const [capturedShot, setCapturedShot] = useState<File | null>(null);
  const [capturePending, setCapturePending] = useState(false);

  useEffect(() => {
    setCapturedShot(null);
    if (!open || !autoShotPromise) {
      setCapturePending(false);
      return;
    }
    let cancelled = false;
    setCapturePending(true);
    autoShotPromise
      .then((file) => {
        if (!cancelled) setCapturedShot(file);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCapturePending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, autoShotPromise]);

  const autoShot = isSupport || autoShotDropped ? null : initialScreenshotFile || capturedShot || null;
  const showCapturing = !isSupport && !autoShotDropped && !autoShot && capturePending;

  const resetForm = () => {
    setCategory(defaultCategory);
    setTitle('');
    setDescription('');
    setScreenshots([]);
    setAutoShotDropped(false);
    setError(null);
    setSent(null);
  };

  // Manual-upload closure for the shared widget: compress, POST, path.
  const uploadScreenshot = useCallback(
    async (file: File): Promise<{ url: string; path?: string }> => {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
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
  // about to be attached. Nothing is sent to the server until Send.
  useEffect(() => {
    if (!open || !autoShot) {
      setAutoShotPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(autoShot);
    setAutoShotPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [open, autoShot]);

  const canSend = isSupport ? !!title.trim() && !!description.trim() : !!title.trim();

  const handleSubmit = async () => {
    if (!canSend || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again to send this.');

      const deviceInfo = collectReportDeviceInfo();
      const consoleLogs = getRecentErrors();

      // Still taking the page picture: give it a few seconds, then send without it.
      let pageShot = autoShot;
      if (!pageShot && showCapturing && autoShotPromise) {
        setAttaching(true);
        pageShot = await Promise.race([
          autoShotPromise.catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
        ]);
      }

      // Upload the page shot now, so its path goes straight into the body below
      // instead of through component state. Best-effort: a failed or slow upload
      // never blocks the report.
      if (pageShot) setAttaching(true);
      const screenshotPaths = await collectScreenshotPaths({
        manual: screenshots,
        autoFile: pageShot,
        upload: (file) => uploadScreenshot(file).then((r) => r.path || null),
      });
      setAttaching(false);

      const common = {
        category,
        page_url: pageUrl || window.location.pathname,
        screenshot_urls: screenshotPaths.length > 0 ? screenshotPaths : undefined,
        device_info: deviceInfo,
        console_logs: consoleLogs.length > 0 ? consoleLogs : undefined,
      };
      const res = await fetch(isSupport ? '/api/support-tickets' : '/api/error-reports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isSupport
            ? { ...common, subject: title.trim(), description: description.trim() }
            : { ...common, title: title.trim(), description: description.trim() },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429 && data.message) throw new Error(data.message);
        if (res.status === 401) throw new Error('Please sign in again to send this.');
        throw new Error('Could not send it. Please check your connection and try again.');
      }
      const ticket: SubmittedTicket = {
        id: data.ticket_id || data.ticketId || data.issue_id || null,
        ticket_number: data.ticket_number || data.ticketNumber || '',
      };
      onSubmitted?.(ticket);
      setSent(ticket);
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : 'Could not send it. Please try again.',
      );
    } finally {
      setAttaching(false);
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  const heading = sent
    ? isSupport
      ? 'Request sent'
      : 'Report sent'
    : isSupport
      ? 'New request'
      : 'Report a problem';

  const categoryPicker = isSupport ? (
    <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
      <Typography component="legend" variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
        What is it about?
      </Typography>
      <Box
        role="radiogroup"
        aria-label="What is it about?"
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}
      >
        {CATEGORIES.map((cat) => {
          const selected = category === cat.value;
          return (
            <Box
              key={cat.value}
              component="button"
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setCategory(cat.value)}
              sx={{
                ...touch,
                textAlign: 'left',
                font: 'inherit',
                cursor: 'pointer',
                px: 1.5,
                py: 1,
                borderRadius: 2,
                border: '1.5px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected ? 'action.selected' : 'background.paper',
                color: 'text.primary',
                transition: 'border-color 150ms ease, background-color 150ms ease',
                '&:hover': { borderColor: selected ? 'primary.main' : 'text.secondary' },
                '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.light', outlineOffset: 2 },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              <Typography component="span" sx={{ display: 'block', fontWeight: 600, fontSize: '0.9375rem' }}>
                {cat.label}
              </Typography>
              <Typography component="span" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.8125rem' }}>
                {cat.hint}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  ) : (
    <TextField
      select
      label="Category"
      value={category}
      onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
      fullWidth
    >
      {CATEGORIES.map((cat) => (
        <MenuItem key={cat.value} value={cat.value} sx={touch}>
          {cat.label}
        </MenuItem>
      ))}
    </TextField>
  );

  const formContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
      {categoryPicker}

      <TextField
        label={isSupport ? 'Subject' : 'What went wrong?'}
        placeholder={isSupport ? 'A few words about it' : 'e.g. The page will not load, a button does nothing'}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        fullWidth
        required
        inputProps={{ maxLength: 200 }}
      />

      <TextField
        label={isSupport ? 'Tell us more' : 'Details (optional)'}
        placeholder={isSupport ? 'What happened, and what you expected' : 'What were you trying to do?'}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
        required={isSupport}
        multiline
        minRows={3}
        inputProps={{ maxLength: 2000 }}
      />

      {showCapturing && (
        <Box aria-live="polite" data-testid="report-auto-screenshot-pending">
          <Typography variant="body2" sx={{ mb: 0.75, fontWeight: 600 }}>
            Picture of this page
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Skeleton variant="rounded" width={88} height={88} sx={{ flexShrink: 0, borderRadius: 1.5 }} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Taking a picture of the page. You can start typing.
            </Typography>
          </Box>
        </Box>
      )}

      {autoShotPreview && (
        <Box>
          <Typography variant="body2" sx={{ mb: 0.75, fontWeight: 600 }}>
            Picture of this page
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              component="img"
              src={autoShotPreview}
              alt="Picture of the page you were on"
              data-testid="report-auto-screenshot"
              sx={{
                width: 88,
                height: 88,
                flexShrink: 0,
                objectFit: 'cover',
                objectPosition: 'top',
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'divider',
              }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                We will send this along so we can see what you saw.
              </Typography>
              <Button
                onClick={() => setAutoShotDropped(true)}
                disabled={submitting}
                sx={{ ...touch, textTransform: 'none', px: 1, mt: 0.25 }}
              >
                Do not send it
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      <ImageUploadList
        label={isSupport ? 'Attachments (optional)' : 'More screenshots (optional)'}
        values={screenshots.map(pathToUrl)}
        onChange={(urls) => setScreenshots(urls.map(urlToPath))}
        upload={uploadScreenshot}
        maxFiles={3}
        accept="image/jpeg,image/png,image/webp"
      />

      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
        Your device details and any recent errors are attached so we can help faster.
      </Typography>

      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
    </Box>
  );

  const successContent = sent && (
    <Box sx={{ textAlign: 'center', py: 2 }} aria-live="polite">
      <CheckCircleRoundedIcon sx={{ fontSize: 56, color: 'success.main', mb: 1 }} aria-hidden="true" />
      <Typography sx={{ fontWeight: 700, fontSize: '1.125rem' }}>Thank you. We have it.</Typography>
      {sent.ticket_number && (
        <Typography
          data-testid="report-ticket-number"
          sx={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 600, mt: 1 }}
        >
          {sent.ticket_number}
        </Typography>
      )}
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, maxWidth: 360, mx: 'auto' }}>
        We will reply in Support and by email. You can follow every step there.
      </Typography>
    </Box>
  );

  const actions = sent ? (
    <>
      <Button onClick={handleClose} sx={{ ...touch, textTransform: 'none' }}>
        Done
      </Button>
      <Button
        variant="contained"
        component={Link}
        href={sent.id ? `/support/${sent.id}` : '/support'}
        onClick={handleClose}
        sx={{ ...touch, textTransform: 'none' }}
      >
        Track it
      </Button>
    </>
  ) : (
    <>
      <Button onClick={handleClose} disabled={submitting} sx={{ ...touch, textTransform: 'none' }}>
        Cancel
      </Button>
      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={submitting || !canSend}
        endIcon={<SendIcon sx={{ fontSize: '1rem !important' }} />}
        sx={{ ...touch, textTransform: 'none', px: 2.5 }}
      >
        {attaching ? 'Attaching picture' : submitting ? 'Sending' : isSupport ? 'Send request' : 'Send report'}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={handleClose}
        onOpen={() => {}}
        disableSwipeToOpen
        // Opens while the page picture is still being taken: keep the sheet out of it.
        data-no-screenshot="true"
        PaperProps={{
          'aria-labelledby': titleId,
          role: 'dialog',
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '92dvh',
            display: 'flex',
            flexDirection: 'column',
          },
        } as object}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }} aria-hidden="true">
          <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 0.5 }}>
          <Typography id={titleId} component="h2" sx={{ fontWeight: 700, fontSize: '1.125rem' }}>
            {heading}
          </Typography>
          <IconButton onClick={handleClose} aria-label="Close" sx={{ width: 48, height: 48 }} disabled={submitting}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Box sx={{ px: 2, pb: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {sent ? successContent : formContent}
        </Box>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            justifyContent: 'flex-end',
            px: 2,
            pt: 1.5,
            pb: 'calc(12px + env(safe-area-inset-bottom, 0px))',
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            '& > *': { flex: 1 },
          }}
        >
          {actions}
        </Box>
      </SwipeableDrawer>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby={titleId}
      // Opens while the page picture is still being taken: keep the dialog out of it.
      data-no-screenshot="true"
    >
      <DialogTitle id={titleId} sx={{ fontWeight: 700, pr: 8 }}>
        {heading}
        <IconButton
          onClick={handleClose}
          aria-label="Close"
          disabled={submitting}
          sx={{ position: 'absolute', right: 8, top: 8, width: 48, height: 48 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>{sent ? successContent : formContent}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>{actions}</DialogActions>
    </Dialog>
  );
}
