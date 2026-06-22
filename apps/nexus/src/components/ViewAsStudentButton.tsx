'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
  CircularProgress,
} from '@neram/ui';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface ViewAsStudentButtonProps {
  /** users.id of the student to view as. */
  studentId: string;
  /** Optional audit reason, e.g. "Ticket TKT-0042". */
  reason?: string;
  /** Optional originating ticket id (nexus_foundation_issues.id). */
  ticketId?: string;
  variant?: 'contained' | 'outlined' | 'text';
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  /** Render as a compact icon button (e.g. inside a dense list row). */
  iconOnly?: boolean;
  label?: string;
  sx?: object;
}

/**
 * "View as student" entry point. Visible only to teachers/admins who are not
 * already impersonating. On click it mints an impersonation token and navigates
 * to the student dashboard, where the whole app behaves as that student.
 */
export default function ViewAsStudentButton({
  studentId,
  reason,
  ticketId,
  variant = 'outlined',
  size = 'medium',
  fullWidth = false,
  iconOnly = false,
  label = 'View as student',
  sx,
}: ViewAsStudentButtonProps) {
  const { isTeacher, impersonation, startImpersonation } = useNexusAuthContext();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // isTeacher is true for teachers AND admins. Hide while already impersonating.
  if (!isTeacher || impersonation.active) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await startImpersonation(studentId, { reason, ticketId });
      router.push('/student/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open student view');
      setLoading(false);
    }
    // On success we navigate away, so no need to reset loading.
  };

  return (
    <>
      {iconOnly ? (
        <Tooltip title={label} arrow>
          <span>
            <IconButton
              onClick={handleClick}
              disabled={loading}
              aria-label={label}
              size={size}
              sx={{ width: 40, height: 40, ...sx }}
            >
              {loading ? (
                <CircularProgress size={18} />
              ) : (
                <VisibilityOutlinedIcon sx={{ fontSize: '1.2rem' }} />
              )}
            </IconButton>
          </span>
        </Tooltip>
      ) : (
        <Button
          onClick={handleClick}
          disabled={loading}
          variant={variant}
          size={size}
          fullWidth={fullWidth}
          startIcon={
            loading ? <CircularProgress size={16} color="inherit" /> : <VisibilityOutlinedIcon />
          }
          sx={{ textTransform: 'none', minHeight: 40, fontWeight: 600, ...sx }}
        >
          {loading ? 'Opening...' : label}
        </Button>
      )}

      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={() => setError(null)} sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
