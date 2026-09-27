'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@neram/ui';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import CredentialsSection from '@/components/crm/CredentialsSection';
import DeviceDiagnosticsSection from '@/components/crm/DeviceDiagnosticsSection';
import ArchiveDialog from '@/components/crm/ArchiveDialog';
import { sentenceCase } from '@/lib/user360-view';
import { SectionCard, StatusChip, TwoColumns, type User360TabProps } from '../shared';
import IdentityList from '../IdentityList';
import ClassroomLinkControl from '../ClassroomLinkControl';
import { NexusAccessCard } from './EnrollmentTab';

export default function AccessTab({ data, detail, adminId, onRefresh }: User360TabProps) {
  const p = data.person || {};
  const userId = String(p.id);
  const inLifecycle = 'lifecycle_stage' in p;
  const isDeactivated = p.account_status === 'deactivated' || p.is_disabled === true;
  const isArchived = p.lifecycle_stage === 'archived' || p.lifecycle_status === 'archived';
  const hasEnrollments = (data.enrollments || []).length > 0 || (detail?.nexusEnrollments || []).length > 0;
  const linkedEmail = ((detail?.user as any)?.linked_classroom_email ?? p.linked_classroom_email ?? null) as string | null;

  const [disableOpen, setDisableOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);

  const setDisabled = async (disable: boolean) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/users/${userId}/disable`, {
        method: disable ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: disable ? JSON.stringify({ adminId, reason: reason.trim() || undefined }) : undefined,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Could not change account access.');
      }
      setDisableOpen(false);
      setReason('');
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const archive = async (_ids: string[], why: string) => {
    const res = await fetch(`/api/crm/users/${userId}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId, reason: why }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || 'Could not archive this person.');
    }
    setArchiveOpen(false);
    onRefresh();
  };

  const restore = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/users/${userId}/archive`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId }),
      });
      if (!res.ok) throw new Error('Could not restore this person.');
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minWidth: 0 }}>
      {error && (
        <Alert severity="error" role="alert" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <TwoColumns>
        <Box sx={{ minWidth: 0 }}>
          <SectionCard title="Account" icon={<ManageAccountsOutlinedIcon />}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              {isDeactivated ? (
                <StatusChip icon={<BlockIcon />} label="Deactivated: cannot sign in" tone="error" />
              ) : (
                <StatusChip icon={<CheckCircleOutlineIcon />} label="Active: can sign in" tone="success" />
              )}
              {isArchived && <StatusChip icon={<Inventory2OutlinedIcon />} label="Archived from the CRM list" tone="neutral" />}
              {p.user_type && <StatusChip icon={<ManageAccountsOutlinedIcon />} label={`Type: ${sentenceCase(String(p.user_type))}`} />}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Deactivating blocks sign-in everywhere. Archiving only hides the person from the active CRM list; sign-in keeps
              working.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {isDeactivated ? (
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<CheckCircleOutlineIcon />}
                  onClick={() => setDisabled(false)}
                  disabled={busy}
                  sx={{ textTransform: 'none', minHeight: 44 }}
                >
                  Enable account
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<BlockIcon />}
                  onClick={() => setDisableOpen(true)}
                  disabled={busy}
                  sx={{ textTransform: 'none', minHeight: 44 }}
                >
                  Deactivate account
                </Button>
              )}
              {inLifecycle &&
                (isArchived ? (
                  <Button
                    variant="outlined"
                    startIcon={<UnarchiveOutlinedIcon />}
                    onClick={restore}
                    disabled={busy}
                    sx={{ textTransform: 'none', minHeight: 44 }}
                  >
                    Restore to active list
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    startIcon={<Inventory2OutlinedIcon />}
                    onClick={() => setArchiveOpen(true)}
                    disabled={busy}
                    sx={{ textTransform: 'none', minHeight: 44 }}
                  >
                    Archive
                  </Button>
                ))}
            </Box>
          </SectionCard>

          <SectionCard title="Sign-in methods" icon={<KeyOutlinedIcon />}>
            <IdentityList data={data} />
          </SectionCard>
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <NexusAccessCard person={p} />
          {!hasEnrollments && (
            <SectionCard title="Classroom email link" icon={<SchoolOutlinedIcon />}>
              <ClassroomLinkControl userId={userId} linkedEmail={linkedEmail} adminId={adminId} onChanged={onRefresh} />
            </SectionCard>
          )}
        </Box>
      </TwoColumns>

      {detail && (
        <>
          <Box id="crm-section-credentials">
            <CredentialsSection
              userId={detail.user.id}
              studentName={detail.user.name || detail.user.first_name || 'Student'}
              adminId={adminId}
              isStudent={detail.user.user_type === 'student'}
            />
          </Box>
          <Box id="crm-section-diagnostics">
            <DeviceDiagnosticsSection userId={detail.user.id} />
          </Box>
        </>
      )}

      <Dialog open={disableOpen} onClose={() => !busy && setDisableOpen(false)} maxWidth="xs" fullWidth aria-labelledby="disable-title">
        <DialogTitle id="disable-title">Deactivate {p.name || 'this account'}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            They will not be able to sign in to any Neram app until someone enables the account again. Nothing is deleted.
          </Typography>
          <TextField
            label="Reason (optional)"
            fullWidth
            size="small"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDisableOpen(false)} disabled={busy} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => setDisabled(true)}
            disabled={busy}
            sx={{ textTransform: 'none', minHeight: 44, boxShadow: 'none' }}
          >
            {busy ? 'Deactivating...' : 'Deactivate'}
          </Button>
        </DialogActions>
      </Dialog>

      {inLifecycle && (
        <ArchiveDialog open={archiveOpen} onClose={() => setArchiveOpen(false)} users={[p as any]} onConfirm={archive} />
      )}
    </Box>
  );
}
