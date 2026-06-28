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
  Divider,
  CircularProgress,
  Tooltip,
  Link,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RestoreIcon from '@mui/icons-material/Restore';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import InstagramIcon from '@mui/icons-material/Instagram';
import LanguageIcon from '@mui/icons-material/Language';
import VerifiedIcon from '@mui/icons-material/Verified';
import AlumniEditDialog from './AlumniEditDialog';
import AlumniExamRecords from './AlumniExamRecords';
import AlumniMsSection from './AlumniMsSection';
import StudentWorksPanel from './StudentWorksPanel';
import MergeDuplicatePanel from './MergeDuplicatePanel';
import PersonalDetailsPanel from './PersonalDetailsPanel';
import { ACCENT, ACCENT_SOFT, INK, MUTED, LINE, yearOfStudyLabel, isGraduateArchitect } from './theme';

interface AlumniDetailDrawerProps {
  open: boolean;
  userId: string | null;
  adminId: string | null;
  onClose: () => void;
  /** Called after an edit or restore so the directory can refresh. */
  onChanged: () => void;
}

const yearChipSx = { height: 22, fontSize: 11, bgcolor: ACCENT_SOFT, color: ACCENT, fontWeight: 700 } as const;

export default function AlumniDetailDrawer({ open, userId, adminId, onClose, onChanged }: AlumniDetailDrawerProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

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

  const handleRestore = async () => {
    if (!userId || !adminId) return;
    setRestoring(true);
    try {
      const res = await fetch('/api/crm/alumni/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [userId], adminId }),
      });
      if (!res.ok) throw new Error();
      onChanged();
      onClose();
    } catch {
      /* parent banner handles errors elsewhere; keep drawer open */
    } finally {
      setRestoring(false);
    }
  };

  const user = detail?.user;
  const profile = detail?.alumniProfile;
  const college = detail?.college;
  const activity = detail?.activity;
  const docs: any[] = detail?.nexusDocuments || [];

  const yearLabel = yearOfStudyLabel(profile?.college_start_year);
  const gradArchitect = isGraduateArchitect(profile?.college_start_year, profile?.expected_graduation_year);
  const collegeLabel = college?.name || college?.short_name || profile?.college_name || null;

  return (
    <>
      <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 480, maxWidth: '100vw' } }}>
        {/* Header */}
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: LINE, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          {loading || !user ? (
            <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', py: 2 }}>
              {loading ? <CircularProgress size={24} /> : <Typography color="text.secondary">No data</Typography>}
            </Box>
          ) : (
            <>
              <UserAvatar src={user.avatar_url} name={user.name} size={52} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" fontWeight={800} color={INK} noWrap>
                  {user.name || 'Unnamed'}
                </Typography>
                <Typography variant="caption" sx={{ color: MUTED, wordBreak: 'break-all' }}>
                  {user.email || 'No email'}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                  {user.academic_year && <Chip label={`Batch ${user.academic_year}`} size="small" sx={yearChipSx} />}
                  {yearLabel && <Chip label={yearLabel} size="small" variant="outlined" sx={{ height: 22, fontSize: 11, borderColor: LINE }} />}
                  {gradArchitect && (
                    <Chip icon={<EmojiEventsOutlinedIcon sx={{ fontSize: '0.9rem !important' }} />} label="Graduate Architect" size="small" sx={{ height: 22, fontSize: 11, bgcolor: 'rgba(15,118,110,0.12)', color: '#0F766E', fontWeight: 700 }} />
                  )}
                  {profile?.is_verified && (
                    <Chip icon={<VerifiedIcon sx={{ fontSize: '0.9rem !important' }} />} label="Verified" size="small" color="success" variant="outlined" sx={{ height: 22, fontSize: 11 }} />
                  )}
                </Box>
              </Box>
            </>
          )}
          <IconButton onClick={onClose} aria-label="Close" size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Body */}
        {user && (
          <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
            {/* Duplicate detection + personal details */}
            {userId && <MergeDuplicatePanel userId={userId} adminId={adminId} onMerged={() => { load(); onChanged(); }} />}
            {userId && <PersonalDetailsPanel user={user} leadProfile={detail?.leadProfile} userId={userId} adminId={adminId} onSaved={load} />}

            {/* College + course */}
            <SectionTitle icon={<SchoolOutlinedIcon fontSize="small" />} text="College & course" />
            {collegeLabel ? (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight={600} color={INK}>
                  {collegeLabel}
                </Typography>
                {(college?.city || college?.state) && (
                  <Typography variant="caption" sx={{ color: MUTED }}>
                    {[college?.city, college?.state].filter(Boolean).join(', ')}
                  </Typography>
                )}
                <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {profile?.course_branch && <Chip label={profile.course_branch} size="small" variant="outlined" sx={{ height: 22, fontSize: 11, borderColor: LINE }} />}
                  {profile?.college_status && <Chip label={profile.college_status} size="small" sx={{ height: 22, fontSize: 11, textTransform: 'capitalize' }} />}
                </Box>
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: MUTED, mb: 2 }}>
                No college recorded yet. Use Edit to add it.
              </Typography>
            )}

            {/* Social */}
            <SectionTitle text="Stay in touch" />
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <SocialBtn href={profile?.linkedin_url} icon={<LinkedInIcon />} title="LinkedIn" color="#0A66C2" />
              <SocialBtn href={profile?.instagram_url} icon={<InstagramIcon />} title="Instagram" color="#E1306C" />
              <SocialBtn href={profile?.portfolio_url} icon={<LanguageIcon />} title="Portfolio" color={MUTED} />
              {!profile?.linkedin_url && !profile?.instagram_url && !profile?.portfolio_url && (
                <Typography variant="body2" sx={{ color: MUTED }}>No links yet.</Typography>
              )}
            </Box>

            {profile?.bio && (
              <>
                <SectionTitle text="About" />
                <Typography variant="body2" sx={{ color: INK, mb: 2, whiteSpace: 'pre-wrap' }}>
                  {profile.bio}
                </Typography>
              </>
            )}

            {/* Activity */}
            <SectionTitle text="Activity" />
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Stat label="Drawings" value={activity?.submissionCount ?? 0} />
              <Stat label="Classes attended" value={`${activity?.attendance?.attended ?? 0}/${activity?.attendance?.total ?? 0}`} />
            </Box>

            {/* Works (the Vault): every drawing this student submitted, read-only */}
            {userId && (
              <Box sx={{ mb: 2 }}>
                <SectionTitle text="Works" />
                <StudentWorksPanel userId={userId} studentName={user.name} compact />
              </Box>
            )}

            {/* Microsoft */}
            {userId && (
              <Box sx={{ mb: 2 }}>
                <SectionTitle text="Microsoft" />
                <AlumniMsSection userId={userId} onChanged={load} compact />
              </Box>
            )}

            {/* Exam records (read-only summary; full editor lives on the profile page) */}
            {userId && (
              <Box sx={{ mb: 2 }}>
                <SectionTitle icon={<AssignmentOutlinedIcon fontSize="small" />} text="Exam records" />
                <AlumniExamRecords
                  userId={userId}
                  adminId={adminId}
                  profile={profile}
                  documents={detail?.studentDocuments}
                  variant="summary"
                />
              </Box>
            )}

            {/* Documents */}
            <SectionTitle icon={<DescriptionOutlinedIcon fontSize="small" />} text={`Documents (${docs.length})`} />
            {docs.length === 0 ? (
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
        {user && (
          <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: LINE, display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<OpenInNewIcon />}
              onClick={() => router.push(`/alumni/${userId}`)}
              sx={{ textTransform: 'none', flex: 1, bgcolor: ACCENT, '&:hover': { bgcolor: '#92400E' } }}
            >
              Full profile
            </Button>
            <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)} sx={{ textTransform: 'none', borderColor: LINE, color: INK }}>
              Edit
            </Button>
            <Tooltip title="Restore to active (re-enable Nexus + Microsoft)">
              <span>
                <Button size="small" color="inherit" disabled={restoring} startIcon={restoring ? <CircularProgress size={14} /> : <RestoreIcon />} onClick={handleRestore} sx={{ textTransform: 'none', color: MUTED }}>
                  Restore
                </Button>
              </span>
            </Tooltip>
          </Box>
        )}
      </Drawer>

      {userId && (
        <AlumniEditDialog
          open={editOpen}
          userId={userId}
          adminId={adminId}
          profile={profile || null}
          initialCollege={college ? { id: college.id, name: college.name, city: college.city, state: college.state } : null}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            load();
            onChanged();
          }}
        />
      )}
    </>
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

function SocialBtn({ href, icon, title, color }: { href?: string | null; icon: ReactNode; title: string; color: string }) {
  if (!href) return null;
  const normalized = href.startsWith('http') ? href : `https://${href.replace(/^@/, 'instagram.com/')}`;
  return (
    <Tooltip title={title}>
      <IconButton component={Link} href={normalized} target="_blank" rel="noopener" sx={{ color, border: '1px solid', borderColor: LINE }}>
        {icon}
      </IconButton>
    </Tooltip>
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
