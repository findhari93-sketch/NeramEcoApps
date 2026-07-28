'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  Menu,
  MenuItem,
  IconButton,
  Skeleton,
  Alert,
} from '@neram/ui';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import FamilyRestroomOutlinedIcon from '@mui/icons-material/FamilyRestroomOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ParentAccessDialog from '@/components/parent/ParentAccessDialog';
import ParentContactDialog from '@/components/parent/ParentContactDialog';

/**
 * Parent access for one student, on the teacher's student detail page.
 *
 * Capability-gated on structure.enrollment.add (manager and admin only), which
 * is the same authority question as "who may attach a person to a cohort".
 * Renders nothing at all for a teacher who lacks it, rather than showing a
 * button that will 403.
 */

interface AccessRow {
  studentId: string;
  parentUserId: string | null;
  loginId: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  /**
   * Stored on nexus_parent_credentials, NOT on users.email/users.phone. Those
   * two are unique across all four apps and a parent's address is usually
   * already on the lead row from their own enquiry form.
   */
  contactEmail: string | null;
  contactPhone: string | null;
}

interface Props {
  studentId: string;
  studentName: string;
  classroomId: string | null;
}

function relativeDay(iso: string | null): string {
  if (!iso) return 'Never signed in';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days)) return 'Never signed in';
  if (days <= 0) return 'Signed in today';
  if (days === 1) return 'Signed in yesterday';
  if (days < 30) return `Signed in ${days} days ago`;
  return `Signed in on ${new Date(iso).toLocaleDateString('en-IN')}`;
}

export default function ParentAccessCard({ studentId, studentName, classroomId }: Props) {
  const { getToken, can } = useNexusAuthContext();
  const allowed = can('structure.enrollment.add');

  const [row, setRow] = useState<AccessRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const load = useCallback(async () => {
    if (!allowed || !classroomId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/parent/access?classroom=${classroomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load parent access.');
      setRow((data.rows || []).find((r: AccessRow) => r.studentId === studentId) || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load parent access.');
    } finally {
      setLoading(false);
    }
  }, [allowed, classroomId, getToken, studentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevoke() {
    setMenuAnchor(null);
    if (!row?.parentUserId) return;
    try {
      const token = await getToken();
      await fetch(`/api/parent/access/${row.parentUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'revoke' }),
      });
      await load();
    } catch {
      setError('Could not revoke parent access.');
    }
  }

  async function handleRestore() {
    setMenuAnchor(null);
    if (!row?.parentUserId) return;
    try {
      const token = await getToken();
      await fetch(`/api/parent/access/${row.parentUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'restore' }),
      });
      await load();
    } catch {
      setError('Could not restore parent access.');
    }
  }

  if (!allowed) return null;

  return (
    <>
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <FamilyRestroomOutlinedIcon fontSize="small" color="action" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
            Parent access
          </Typography>
          {row?.parentUserId && (
            <IconButton
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              sx={{ width: 48, height: 48 }}
              aria-label="Parent access options"
            >
              <MoreVertIcon />
            </IconButton>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Skeleton variant="rounded" height={64} />
        ) : !classroomId ? (
          <Typography variant="body2" color="text.secondary">
            This student is not in an active class, so parent access cannot be
            created yet.
          </Typography>
        ) : !row?.parentUserId ? (
          <Stack spacing={1.5} alignItems="flex-start">
            <Typography variant="body2" color="text.secondary">
              No parent login has been created for {studentName.split(' ')[0]} yet.
            </Typography>
            <Button
              variant="contained"
              onClick={() => setDialogOpen(true)}
              sx={{ minHeight: 48 }}
            >
              Create parent access
            </Button>
          </Stack>
        ) : (
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700 }}>
                {row.loginId}
              </Typography>
              {!row.isActive && <Chip size="small" color="error" label="Revoked" />}
              {row.isActive && row.mustChangePassword && (
                <Chip size="small" color="warning" label="Password not yet changed" />
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {relativeDay(row.lastLoginAt)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {row.contactEmail || row.contactPhone
                ? [row.contactEmail, row.contactPhone].filter(Boolean).join(' . ')
                : 'No contact details on file'}
            </Typography>
          </Stack>
        )}
      </Paper>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setRegenerating(true);
            setDialogOpen(true);
          }}
        >
          Regenerate password
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setContactOpen(true);
          }}
        >
          Edit contact details
        </MenuItem>
        {row?.isActive ? (
          <MenuItem onClick={handleRevoke} sx={{ color: 'error.main' }}>
            Revoke access
          </MenuItem>
        ) : (
          <MenuItem onClick={handleRestore}>Restore access</MenuItem>
        )}
      </Menu>

      <ParentAccessDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setRegenerating(false);
        }}
        studentId={studentId}
        studentName={studentName}
        regenerateParentUserId={regenerating ? row?.parentUserId ?? null : null}
        onDone={load}
      />

      {row?.parentUserId && (
        <ParentContactDialog
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          parentUserId={row.parentUserId}
          studentName={studentName}
          currentEmail={row.contactEmail}
          currentPhone={row.contactPhone}
          onDone={load}
        />
      )}
    </>
  );
}
