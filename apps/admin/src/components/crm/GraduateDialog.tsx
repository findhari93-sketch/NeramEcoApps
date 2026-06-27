'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  TextField,
  MenuItem,
  Button,
  Alert,
  AlertTitle,
  CircularProgress,
  Chip,
  UserAvatar,
  Divider,
  Checkbox,
  FormControlLabel,
} from '@neram/ui';
import useMediaQuery from '@mui/material/useMediaQuery';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import { academicYearOptions, ACADEMIC_YEAR_REGEX } from './academic-years';

export interface GraduateStudent {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url?: string | null;
  academic_year?: string | null;
}

interface GraduateDialogProps {
  open: boolean;
  students: GraduateStudent[];
  defaultYear?: string;
  onClose: () => void;
  /** Calls the graduate API and returns its JSON result (graduated/ms summary). */
  onConfirm: (opts: { academicYear: string; reason: string; offboardMicrosoft: boolean }) => Promise<any>;
}

/**
 * Graduate the already-selected students to alumni. Unlike the old dialog this
 * takes a pre-selected set (from the Students table) instead of a classroom, lets
 * the admin confirm the cohort year + Microsoft offboarding, and shows the result.
 */
const STEP_LABELS: Record<string, string> = {
  remove_license: 'remove license',
  disable: 'disable sign-in',
  enable: 're-enable sign-in',
  readd_license: 're-add license',
};

/** Collapse identical per-user failures into "N students: <message>" rows, keeping
 *  the affected names so the admin knows exactly who to correct manually. */
function dedupeFailures(
  failures: Array<{ user?: string; step: string; code: string; message: string; fix?: string }>,
): Array<{ count: number; step: string; message: string; fix?: string; users: string[] }> {
  const map = new Map<string, { count: number; step: string; message: string; fix?: string; users: string[] }>();
  for (const f of failures) {
    const key = `${f.step}|${f.code}`;
    const cur = map.get(key);
    if (cur) {
      cur.count += 1;
      if (f.user) cur.users.push(f.user);
    } else {
      map.set(key, { count: 1, step: f.step, message: f.message, fix: f.fix, users: f.user ? [f.user] : [] });
    }
  }
  return [...map.values()];
}

/** A compact, always-visible list of the specific accounts in a category, so the
 *  admin can act on them (e.g. fix a stale Microsoft link) without digging. */
function NameList({ title, names, hint }: { title: string; names: string[]; hint?: string }) {
  if (!names || names.length === 0) return null;
  return (
    <Box sx={{ mt: 1, p: 1, borderRadius: 0.75, bgcolor: 'grey.50', border: '1px solid', borderColor: 'grey.200' }}>
      <Typography variant="caption" fontWeight={700} display="block" sx={{ color: 'text.primary' }}>
        {title}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          {hint}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
        {names.join(', ')}
      </Typography>
    </Box>
  );
}

/** Native collapsible "technical details" block (no extra React state). */
function RawDetails({ lines }: { lines: string[] }) {
  if (!lines || lines.length === 0) return null;
  return (
    <Box component="details" sx={{ mt: 1 }}>
      <Box component="summary" sx={{ cursor: 'pointer', fontSize: 12, color: 'text.secondary' }}>
        Technical details
      </Box>
      {lines.map((l, i) => (
        <Typography
          key={i}
          variant="caption"
          component="div"
          sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'text.secondary' }}
        >
          {l}
        </Typography>
      ))}
    </Box>
  );
}

export default function GraduateDialog({ open, students, defaultYear, onClose, onConfirm }: GraduateDialogProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const options = academicYearOptions();
  const [academicYear, setAcademicYear] = useState(defaultYear || '');
  const [reason, setReason] = useState('');
  const [offboardMicrosoft, setOffboardMicrosoft] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setAcademicYear(defaultYear || '');
      setReason('');
      setOffboardMicrosoft(true);
      setError('');
      setResult(null);
    }
  }, [open, defaultYear]);

  const yearValid = ACADEMIC_YEAR_REGEX.test(academicYear);
  // Smart default reason for the common case (a cohort finishing its exam cycle).
  // Shown as ghost placeholder; Tab fills it into the field (see onKeyDown below).
  const reasonSuggestion = yearValid ? `Completed ${academicYear} exam cycle` : '';
  const canConfirm = students.length > 0 && yearValid && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await onConfirm({
        academicYear,
        reason: reason.trim() || `Graduated to alumni (${academicYear})`,
        offboardMicrosoft,
      });
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to graduate students');
    } finally {
      setSubmitting(false);
    }
  };

  const ms = result?.ms;

  return (
    <Dialog open={open} onClose={() => !submitting && onClose()} maxWidth="sm" fullWidth fullScreen={fullScreen} PaperProps={{ sx: { borderRadius: { xs: 0, sm: 1.5 } } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <HistoryEduIcon sx={{ color: '#B45309' }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Graduate to Alumni
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Reversible. Revokes Nexus access and preserves their work.
          </Typography>
        </Box>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {/* Result view */}
        {result ? (
          <>
            <Alert severity="success" sx={{ mb: 2 }}>
              <AlertTitle>Done</AlertTitle>
              Graduated {result.graduated} student{result.graduated === 1 ? '' : 's'} to alumni ({academicYear}).{' '}
              {result.enrollmentsDeactivated} Nexus enrollment{result.enrollmentsDeactivated === 1 ? '' : 's'} deactivated.
            </Alert>
            {ms && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                  Microsoft offboarding
                </Typography>

                {ms.configError ? (
                  /* Token never acquired (e.g. expired secret): one clear, actionable banner. */
                  <Alert severity="warning">
                    <AlertTitle>Microsoft step skipped: {ms.configError.message}</AlertTitle>
                    {ms.configError.fix && (
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        {ms.configError.fix}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      The students were still graduated and locked out of Nexus. After fixing the above, restore them
                      and graduate again to remove their licenses.
                    </Typography>
                    {ms.configError.raw && <RawDetails lines={[ms.configError.raw]} />}
                  </Alert>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Disabled sign-in: {ms.disabled}. Licenses removed: {ms.licensesRemoved}.
                      {ms.noMsAccount ? ` No Microsoft account: ${ms.noMsAccount}.` : ''}
                      {ms.accountGone ? ` Already removed from Microsoft: ${ms.accountGone}.` : ''}
                    </Typography>
                    {/* Who, specifically, in each category, so the admin can act on them. */}
                    <NameList
                      title={`No Microsoft account (${ms.noMsAccountUsers?.length || 0})`}
                      names={ms.noMsAccountUsers || []}
                      hint="Never had a Microsoft account, nothing to revoke. Check if one should be created."
                    />
                    <NameList
                      title={`Already removed from Microsoft (${ms.accountGoneUsers?.length || 0})`}
                      names={ms.accountGoneUsers || []}
                      hint="Their Microsoft account was already deleted, so there was nothing left to revoke."
                    />
                    {ms.groupAssigned?.length > 0 && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        {ms.groupAssigned.length} student(s) have group-assigned licenses that cannot be freed per user.
                        Remove them from the licensing group manually: {ms.groupAssigned.join(', ')}.
                      </Alert>
                    )}
                    {ms.failures?.length > 0 && (
                      <Alert severity="error" sx={{ mt: 1 }}>
                        <AlertTitle>
                          {ms.failures.length} Microsoft step{ms.failures.length === 1 ? '' : 's'} failed
                        </AlertTitle>
                        {dedupeFailures(ms.failures).map((g, i) => (
                          <Box key={i} sx={{ mb: 0.75 }}>
                            <Typography variant="body2" sx={{ mb: 0.25 }}>
                              {g.count} {g.count === 1 ? 'student' : 'students'} · {STEP_LABELS[g.step] || g.step}:{' '}
                              {g.message}
                              {g.fix ? ` ${g.fix}` : ''}
                            </Typography>
                            {g.users.length > 0 && (
                              <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-word', color: 'inherit', opacity: 0.85 }}>
                                {g.users.join(', ')}
                              </Typography>
                            )}
                          </Box>
                        ))}
                        <RawDetails lines={ms.failures.slice(0, 10).map((f: any) => `${f.user}: ${f.step} — ${f.raw || f.message}`)} />
                      </Alert>
                    )}
                  </>
                )}
              </Box>
            )}
          </>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Alert severity="warning" sx={{ mb: 2 }}>
              The {students.length} selected student{students.length === 1 ? '' : 's'} will be{' '}
              <strong>locked out of Nexus</strong> and their classroom enrollments deactivated. Their data and drawings
              are kept, and their best work can be featured in the Alumni Hall of Fame. You can restore them anytime.
            </Alert>

            {/* Selected students */}
            <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
              Selected students ({students.length})
            </Typography>
            <Box
              sx={{
                maxHeight: 200,
                overflowY: 'auto',
                border: '1px solid',
                borderColor: 'grey.200',
                borderRadius: 0.75,
                mb: 2,
              }}
            >
              {students.map((s, idx) => (
                <Box
                  key={s.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 1,
                    borderBottom: idx < students.length - 1 ? '1px solid' : 'none',
                    borderColor: 'grey.100',
                  }}
                >
                  <UserAvatar src={s.avatar_url} name={s.name} size={28} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {s.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {s.email || 'No email'}
                    </Typography>
                  </Box>
                  {s.academic_year && (
                    <Chip
                      label={s.academic_year}
                      size="small"
                      sx={{ height: 20, fontSize: 10, bgcolor: 'rgba(217,119,6,0.12)', color: '#B45309', fontWeight: 600 }}
                    />
                  )}
                </Box>
              ))}
            </Box>

            {/* Cohort year */}
            <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
              Cohort year
            </Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={options.includes(academicYear) ? academicYear : ''}
              onChange={(e) => setAcademicYear(e.target.value)}
              disabled={submitting}
              helperText="Stamped on each graduate as their cohort"
              sx={{ mb: 2 }}
            >
              {options.map((y) => (
                <MenuItem key={y} value={y}>
                  {y}
                </MenuItem>
              ))}
            </TextField>

            {/* Microsoft offboarding */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={offboardMicrosoft}
                  onChange={(e) => setOffboardMicrosoft(e.target.checked)}
                  disabled={submitting}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    Also remove Microsoft license and disable sign-in
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Frees the paid M365 seat and blocks Microsoft sign-in (Teams, email). Reversible on restore.
                  </Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', mb: 1, ml: 0 }}
            />

            {/* Reason */}
            <Typography variant="body2" sx={{ mb: 1, mt: 1 }}>
              Reason (optional)
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder={reasonSuggestion || 'e.g. Completed 2025-26 exam cycle'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                // Tab on the empty field accepts the suggested reason and keeps
                // focus here; a second Tab then moves on normally.
                if (e.key === 'Tab' && !e.shiftKey && reason.length === 0 && reasonSuggestion) {
                  e.preventDefault();
                  setReason(reasonSuggestion);
                }
              }}
              disabled={submitting}
              helperText={reason.length === 0 && reasonSuggestion ? 'Press Tab to accept the suggestion' : undefined}
            />
          </>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ p: 2, gap: 1 }}>
        {result ? (
          <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', minWidth: 120 }}>
            Close
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={submitting} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="warning"
              onClick={handleConfirm}
              disabled={!canConfirm}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <HistoryEduIcon sx={{ fontSize: 18 }} />}
              sx={{ textTransform: 'none', minWidth: 200 }}
            >
              {submitting ? 'Graduating...' : `Graduate ${students.length} to Alumni`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
