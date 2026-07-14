'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Drawer,
  Box,
  Typography,
  UserAvatar,
  Chip,
  IconButton,
  Button,
  CircularProgress,
  Tooltip,
  Link,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import StudentWorksPanel from './StudentWorksPanel';
import MergeDuplicatePanel from './MergeDuplicatePanel';
import PersonalDetailsPanel from './PersonalDetailsPanel';
import ApplicationDetailsPanel from './ApplicationDetailsPanel';
import { ACCENT, INK, MUTED, LINE } from './theme';
import { formatDate } from '../crm/academic-years';

interface StudentLite {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  academic_year: string | null;
  last_login_at: string | null;
  /** Nexus-only login signal (null until the student opens the Nexus app themselves). */
  nexus_first_login_at?: string | null;
  nexus_last_login_at?: string | null;
  submission_count: number;
  /** Class-provided Teams email; required before Nexus access can be granted. */
  ms_teams_email?: string | null;
  /** Whether the student currently holds live Nexus access (seeds the panel before the check). */
  has_nexus_access?: boolean;
}

interface StudentDetailDrawerProps {
  open: boolean;
  student: StudentLite | null;
  adminId?: string | null;
  onClose: () => void;
  /** Graduate just this one student (parent opens the GraduateDialog pre-selected). Omit to hide the Graduate button (e.g. on the /software page). */
  onGraduate?: (studentId: string) => void;
  /** Optional extra footer action, e.g. "Move to Software course" / "Move back to students". */
  moveAction?: { label: string; icon?: ReactNode; onClick: (studentId: string) => void };
  /** Optional "Mark as staff" action: reclassify a mis-tagged student as a teacher/admin. */
  staffAction?: { label: string; icon?: ReactNode; onClick: (studentId: string) => void };
  /** Optional "Change batch" action: move a mis-batched student to a different cohort. */
  setYearAction?: { label: string; icon?: ReactNode; onClick: (studentId: string) => void };
  /** Optional "Promote to current" action for a past-batch student (also restores Nexus access). Emphasized. */
  promoteAction?: { label: string; icon?: ReactNode; onClick: (studentId: string) => void };
  /** Called after this drawer grants or revokes Nexus access, so the parent list can refresh. */
  onChanged?: () => void;
}

const yearChipSx = { height: 22, fontSize: 11, bgcolor: 'rgba(180,83,9,0.10)', color: ACCENT, fontWeight: 700 } as const;

/**
 * Read-only detail for an ACTIVE student, opened from the Students tab row. Mirrors
 * the alumni drawer (same /api/crm/alumni/[id] journey route, which is generic to any
 * user) but trimmed to what matters before graduation: their drawings (with the
 * published/hidden split that answers "how many reached the gallery"), onboarding
 * documents, and a one-click path to graduate or to the full CRM profile.
 */
export default function StudentDetailDrawer({ open, student, adminId, onClose, onGraduate, moveAction, staffAction, setYearAction, promoteAction, onChanged }: StudentDetailDrawerProps) {
  const router = useRouter();
  const userId = student?.id || null;
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/alumni/${userId}`);
      const data = await res.json();
      setDetail(res.ok ? data : null);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open && userId) load();
    if (!open) setDetail(null);
  }, [open, userId, load]);

  const activity = detail?.activity;
  const docs: any[] = detail?.nexusDocuments || [];
  const lead = detail?.leadProfile;

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 480, maxWidth: '100vw' } }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: LINE, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        {student ? (
          <>
            <UserAvatar src={student.avatar_url} name={student.name} size={52} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" fontWeight={800} color={INK} noWrap>
                {student.name || 'Unnamed'}
              </Typography>
              <Typography variant="caption" sx={{ color: MUTED, wordBreak: 'break-all' }}>
                {student.email || 'No email'}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75, alignItems: 'center' }}>
                {student.academic_year ? (
                  <Chip label={`Batch ${student.academic_year}`} size="small" sx={yearChipSx} />
                ) : (
                  <Chip label="No year" size="small" variant="outlined" sx={{ height: 22, fontSize: 11, borderColor: LINE }} />
                )}
                <Typography
                  variant="caption"
                  sx={{ color: student.nexus_first_login_at ? '#15803D' : '#94A3B8', fontWeight: student.nexus_first_login_at ? 600 : 400 }}
                >
                  {student.nexus_first_login_at
                    ? `Opened Nexus ${formatDate(student.nexus_last_login_at || student.nexus_first_login_at)}`
                    : 'Never opened Nexus'}
                </Typography>
                {student.last_login_at && (
                  <Typography variant="caption" sx={{ color: '#CBD5E1' }}>
                    {`· any-app login ${formatDate(student.last_login_at)}`}
                  </Typography>
                )}
              </Box>
            </Box>
          </>
        ) : (
          <Box sx={{ flex: 1 }} />
        )}
        <IconButton onClick={onClose} aria-label="Close" size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Body */}
      {student && (
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
          {/* Nexus access: grant or revoke this student's entry into the classroom app. */}
          {userId && (
            <NexusAccessPanel
              userId={userId}
              msTeamsEmail={student.ms_teams_email}
              initialHasAccess={student.has_nexus_access}
              adminId={adminId}
              onChanged={onChanged}
            />
          )}

          {/* Duplicate detection + editable personal details */}
          {userId && <MergeDuplicatePanel userId={userId} adminId={adminId ?? null} onMerged={load} />}
          {userId && <PersonalDetailsPanel user={detail?.user} leadProfile={lead} userId={userId} adminId={adminId ?? null} onSaved={load} />}

          {/* What the student filled in the application form, with a completeness banner */}
          {userId && <ApplicationDetailsPanel leadProfile={lead} />}

          {/* Activity */}
          <SectionTitle text="Activity" />
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Stat label="Drawings" value={activity?.submissionCount ?? student.submission_count ?? 0} />
            <Stat label="Classes attended" value={`${activity?.attendance?.attended ?? 0}/${activity?.attendance?.total ?? 0}`} />
          </Box>

          {/* Works (the Vault): every drawing this student submitted, with the
              Published/Hidden split = how many reached the student gallery. */}
          {userId && (
            <Box sx={{ mb: 2 }}>
              <SectionTitle text="Works" />
              <StudentWorksPanel userId={userId} studentName={student.name} compact />
            </Box>
          )}

          {/* Documents */}
          <SectionTitle icon={<DescriptionOutlinedIcon fontSize="small" />} text={`Documents (${docs.length})`} />
          {loading && docs.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : docs.length === 0 ? (
            <Typography variant="body2" sx={{ color: MUTED }}>
              No documents shared.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {docs.slice(0, 8).map((d: any) => {
                const url = d.sharepoint_web_url || d.file_url;
                return (
                  <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderBottom: '1px solid', borderColor: '#F1F5F9' }}>
                    <DescriptionOutlinedIcon fontSize="small" sx={{ color: MUTED }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap color={INK}>
                        {d.title || d.category || 'Document'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: MUTED }}>
                        Collected at onboarding
                      </Typography>
                    </Box>
                    {url && (
                      <Tooltip title="Open">
                        <IconButton size="small" component={Link} href={url} target="_blank" rel="noopener">
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      )}

      {/* Footer actions */}
      {student && (
        <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: LINE, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button
            size="small"
            variant="contained"
            startIcon={<OpenInNewIcon />}
            onClick={() => router.push(`/crm/${userId}`)}
            sx={{ textTransform: 'none', flex: 1, bgcolor: ACCENT, '&:hover': { bgcolor: '#92400E' } }}
          >
            Full CRM profile
          </Button>
          {promoteAction && (
            <Button
              size="small"
              variant="contained"
              color="warning"
              startIcon={promoteAction.icon}
              onClick={() => userId && promoteAction.onClick(userId)}
              sx={{ textTransform: 'none' }}
            >
              {promoteAction.label}
            </Button>
          )}
          {moveAction && (
            <Button
              size="small"
              variant="outlined"
              startIcon={moveAction.icon}
              onClick={() => userId && moveAction.onClick(userId)}
              sx={{ textTransform: 'none', borderColor: LINE, color: INK }}
            >
              {moveAction.label}
            </Button>
          )}
          {staffAction && (
            <Button
              size="small"
              variant="outlined"
              startIcon={staffAction.icon}
              onClick={() => userId && staffAction.onClick(userId)}
              sx={{ textTransform: 'none', borderColor: LINE, color: INK }}
            >
              {staffAction.label}
            </Button>
          )}
          {setYearAction && (
            <Button
              size="small"
              variant="outlined"
              startIcon={setYearAction.icon}
              onClick={() => userId && setYearAction.onClick(userId)}
              sx={{ textTransform: 'none', borderColor: LINE, color: INK }}
            >
              {setYearAction.label}
            </Button>
          )}
          {onGraduate && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<HistoryEduIcon />}
              onClick={() => userId && onGraduate(userId)}
              sx={{ textTransform: 'none', borderColor: LINE, color: INK }}
            >
              Graduate
            </Button>
          )}
        </Box>
      )}
    </Drawer>
  );
}

/**
 * Grant or revoke a single student's Nexus access. Access = an active
 * enrollment in the default classroom; with none, the student only sees the
 * "You're almost in" welcome screen. Grant needs a Teams email (the enroll
 * endpoint blocks otherwise), so the button is disabled with a hint until then.
 */
function NexusAccessPanel({
  userId,
  msTeamsEmail,
  initialHasAccess,
  adminId,
  onChanged,
}: {
  userId: string;
  msTeamsEmail?: string | null;
  initialHasAccess?: boolean;
  adminId?: string | null;
  onChanged?: () => void;
}) {
  const [checking, setChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean>(!!initialHasAccess);
  const [classroomName, setClassroomName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/students/${userId}/nexus-enroll`);
      const data = await res.json().catch(() => ({}));
      const rows = res.ok ? data.data || [] : [];
      setHasAccess(rows.length > 0);
      setClassroomName(rows[0]?.classroom?.name || null);
    } catch {
      /* keep the optimistic value from the row */
    } finally {
      setChecking(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const mutate = async (body: Record<string, unknown>, failMsg: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${userId}/nexus-enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || failMsg);
      await refresh();
      onChanged?.();
    } catch (e: any) {
      setError(e.message || failMsg);
    } finally {
      setBusy(false);
    }
  };

  const grant = () => mutate({}, 'Could not grant access');
  const revoke = () => {
    if (!window.confirm('Revoke Nexus access for this student? They will see the welcome screen until they are re-enrolled.')) return;
    mutate({ remove: true, removedBy: adminId || null }, 'Could not revoke access');
  };

  const canGrant = !!msTeamsEmail;

  return (
    <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: LINE, borderRadius: 1.5, bgcolor: '#FAFAFA' }}>
      <SectionTitle text="Nexus access" />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {checking ? (
          <CircularProgress size={16} />
        ) : hasAccess ? (
          <Chip
            icon={<CheckCircleIcon sx={{ fontSize: '15px !important' }} />}
            label={classroomName ? `Has access, ${classroomName}` : 'Has Nexus access'}
            size="small"
            sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(22,163,74,0.10)', color: '#15803D' }}
          />
        ) : (
          <Chip
            label="No access, sees the welcome screen"
            size="small"
            sx={{ height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(100,116,139,0.12)', color: '#475569' }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        {hasAccess ? (
          <Button
            size="small"
            variant="outlined"
            color="error"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={14} /> : <LockOutlinedIcon />}
            onClick={revoke}
            sx={{ textTransform: 'none' }}
          >
            Revoke access
          </Button>
        ) : canGrant ? (
          <Button
            size="small"
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={14} /> : <LockOpenOutlinedIcon />}
            onClick={grant}
            sx={{ textTransform: 'none', bgcolor: '#15803D', '&:hover': { bgcolor: '#166534' } }}
          >
            Grant access
          </Button>
        ) : (
          <Tooltip title="Share credentials first: this student needs a Teams email before they can be added to a classroom." arrow>
            <span>
              <Button size="small" variant="contained" disabled startIcon={<LockOpenOutlinedIcon />} sx={{ textTransform: 'none' }}>
                Grant access
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>
      {error && (
        <Typography variant="caption" sx={{ color: '#B91C1C', display: 'block', mt: 0.75 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

function SectionTitle({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
      {icon && <Box sx={{ color: MUTED, display: 'flex' }}>{icon}</Box>}
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: MUTED }}>{text.toUpperCase()}</Typography>
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box>
      <Typography variant="h6" fontWeight={800} color={INK} sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 11, color: MUTED, fontWeight: 600, letterSpacing: 0.4 }}>{label.toUpperCase()}</Typography>
    </Box>
  );
}
