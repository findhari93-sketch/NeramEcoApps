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
import StudentWorksPanel from './StudentWorksPanel';
import MergeDuplicatePanel from './MergeDuplicatePanel';
import PersonalDetailsPanel from './PersonalDetailsPanel';
import { ACCENT, INK, MUTED, LINE } from './theme';
import { formatDate } from '../crm/academic-years';

interface StudentLite {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  academic_year: string | null;
  last_login_at: string | null;
  submission_count: number;
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
}

const yearChipSx = { height: 22, fontSize: 11, bgcolor: 'rgba(180,83,9,0.10)', color: ACCENT, fontWeight: 700 } as const;

/**
 * Read-only detail for an ACTIVE student, opened from the Students tab row. Mirrors
 * the alumni drawer (same /api/crm/alumni/[id] journey route, which is generic to any
 * user) but trimmed to what matters before graduation: their drawings (with the
 * published/hidden split that answers "how many reached the gallery"), onboarding
 * documents, and a one-click path to graduate or to the full CRM profile.
 */
export default function StudentDetailDrawer({ open, student, adminId, onClose, onGraduate, moveAction }: StudentDetailDrawerProps) {
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
                <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                  {student.last_login_at ? `Last login ${formatDate(student.last_login_at)}` : 'Never logged in'}
                </Typography>
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
          {/* Duplicate detection + editable personal details */}
          {userId && <MergeDuplicatePanel userId={userId} adminId={adminId ?? null} onMerged={load} />}
          {userId && <PersonalDetailsPanel user={detail?.user} leadProfile={lead} userId={userId} adminId={adminId ?? null} onSaved={load} />}

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
        <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: LINE, display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="contained"
            startIcon={<OpenInNewIcon />}
            onClick={() => router.push(`/crm/${userId}`)}
            sx={{ textTransform: 'none', flex: 1, bgcolor: ACCENT, '&:hover': { bgcolor: '#92400E' } }}
          >
            Full CRM profile
          </Button>
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
