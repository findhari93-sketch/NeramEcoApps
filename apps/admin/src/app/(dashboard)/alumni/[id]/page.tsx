'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  UserAvatar,
  Chip,
  Button,
  IconButton,
  Paper,
  CircularProgress,
  Divider,
  Tooltip,
  Link,
  Alert,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RestoreIcon from '@mui/icons-material/Restore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import InstagramIcon from '@mui/icons-material/Instagram';
import LanguageIcon from '@mui/icons-material/Language';
import VerifiedIcon from '@mui/icons-material/Verified';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import AlumniEditDialog from '../../../../components/alumni/AlumniEditDialog';
import AlumniExamRecords from '../../../../components/alumni/AlumniExamRecords';
import AlumniMsSection from '../../../../components/alumni/AlumniMsSection';
import StudentWorksPanel from '../../../../components/alumni/StudentWorksPanel';
import MergeDuplicatePanel from '../../../../components/alumni/MergeDuplicatePanel';
import PersonalDetailsPanel from '../../../../components/alumni/PersonalDetailsPanel';
import { Field, SectionCard } from '../../../../components/alumni/uiPrimitives';
import { isExamCategory } from '@/lib/examDocuments';
import {
  ACCENT,
  ACCENT_SOFT,
  INK,
  MUTED,
  LINE,
  HEAD_BG,
  yearOfStudyLabel,
  isGraduateArchitect,
} from '../../../../components/alumni/theme';

const yearChipSx = { height: 24, fontSize: 12, bgcolor: ACCENT_SOFT, color: ACCENT, fontWeight: 700 } as const;

function titleCase(s?: string | null): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function SocialLink({ href, icon, label, color }: { href?: string | null; icon: ReactNode; label: string; color: string }) {
  if (!href) return null;
  const normalized = href.startsWith('http') ? href : `https://${href.replace(/^@/, 'instagram.com/')}`;
  return (
    <Button component={Link} href={normalized} target="_blank" rel="noopener" size="small" startIcon={icon} sx={{ textTransform: 'none', color, borderColor: LINE }} variant="outlined">
      {label}
    </Button>
  );
}

export default function AlumniProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params?.id as string;
  const { supabaseUserId } = useAdminProfile();

  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/alumni/${userId}`);
      const data = await res.json();
      setDetail(res.ok ? data : null);
      if (!res.ok) setBanner({ type: 'error', text: data.error || 'Failed to load' });
    } catch {
      setBanner({ type: 'error', text: 'Failed to load alumnus' });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (file: File) => {
    if (!supabaseUserId) {
      setBanner({ type: 'error', text: 'Admin session not ready, try again in a moment.' });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name);
      fd.append('adminId', supabaseUserId);
      const res = await fetch(`/api/crm/alumni/${userId}/documents`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setBanner({ type: 'success', text: 'Document uploaded.' });
      load();
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleRestore = async () => {
    if (!userId || !supabaseUserId) return;
    setRestoring(true);
    try {
      const res = await fetch('/api/crm/alumni/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [userId], adminId: supabaseUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore');
      setBanner({ type: 'success', text: 'Restored to active. They are back in the Students tab.' });
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to restore' });
    } finally {
      setRestoring(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!detail?.user) {
    return (
      <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/alumni')} sx={{ textTransform: 'none', mb: 2 }}>
          Back to alumni
        </Button>
        <Alert severity="error">Alumnus not found.</Alert>
      </Box>
    );
  }

  const user = detail.user;
  const profile = detail.alumniProfile;
  const college = detail.college;
  const activity = detail.activity;
  const docs: any[] = detail.nexusDocuments || [];
  const adminDocs: any[] = detail.studentDocuments || [];
  // Exam admit cards / scorecards / custom docs are managed in the Exam records card below, so
  // keep them out of the generic Documents list to avoid showing each file twice.
  const genericAdminDocs: any[] = adminDocs.filter((d: any) => !isExamCategory(d.category));
  const msSnap = user.metadata?.microsoft_profile_snapshot;
  const msArchivedAt = user.metadata?.microsoft_offboarded_at;

  const yearLabel = yearOfStudyLabel(profile?.college_start_year);
  const gradArchitect = isGraduateArchitect(profile?.college_start_year, profile?.expected_graduation_year);
  const collegeLabel = college?.name || college?.short_name || profile?.college_name || null;

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/alumni')} sx={{ textTransform: 'none', color: MUTED }}>
          Back to alumni
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)} sx={{ textTransform: 'none', borderColor: LINE, color: INK }}>
            Edit
          </Button>
          <Tooltip title="Restore to active (re-enable Nexus + Microsoft)">
            <Button color="inherit" disabled={restoring} startIcon={restoring ? <CircularProgress size={16} /> : <RestoreIcon />} onClick={handleRestore} sx={{ textTransform: 'none', color: MUTED }}>
              Restore
            </Button>
          </Tooltip>
        </Box>
      </Box>

      {banner && (
        <Alert severity={banner.type} sx={{ mb: 2, borderRadius: 2 }} onClose={() => setBanner(null)}>
          {banner.text}
        </Alert>
      )}

      {/* Header */}
      <Paper variant="outlined" sx={{ borderRadius: 2, borderColor: LINE, p: { xs: 2, md: 3 }, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <UserAvatar src={user.avatar_url} name={user.name} size={72} />
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h5" fontWeight={800} color={INK}>
            {user.name || 'Unnamed'}
          </Typography>
          <Typography variant="body2" sx={{ color: MUTED }}>
            {user.email || 'No email'}
            {user.phone ? ` · ${user.phone}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
            {user.academic_year && <Chip label={`Batch ${user.academic_year}`} size="small" sx={yearChipSx} />}
            {collegeLabel && <Chip label={collegeLabel} size="small" variant="outlined" sx={{ height: 24, fontSize: 12, borderColor: LINE }} />}
            {yearLabel && <Chip label={yearLabel} size="small" variant="outlined" sx={{ height: 24, fontSize: 12, borderColor: LINE }} />}
            {gradArchitect && (
              <Chip icon={<EmojiEventsOutlinedIcon sx={{ fontSize: '1rem !important' }} />} label="Graduate Architect" size="small" sx={{ height: 24, fontSize: 12, bgcolor: 'rgba(15,118,110,0.12)', color: '#0F766E', fontWeight: 700 }} />
            )}
            {profile?.is_verified && (
              <Chip icon={<VerifiedIcon sx={{ fontSize: '1rem !important' }} />} label="Verified" size="small" color="success" variant="outlined" sx={{ height: 24, fontSize: 12 }} />
            )}
          </Box>
        </Box>
      </Paper>

      <MergeDuplicatePanel userId={userId} adminId={supabaseUserId} onMerged={load} />
      <PersonalDetailsPanel user={user} leadProfile={detail.leadProfile} userId={userId} adminId={supabaseUserId} onSaved={load} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {/* College & course */}
        <SectionCard title="College & course">
          <Field label="College" value={collegeLabel} />
          {(college?.city || college?.state) && <Field label="Location" value={[college?.city, college?.state].filter(Boolean).join(', ')} />}
          <Field label="Course / branch" value={profile?.course_branch} />
          <Field label="College status" value={profile?.college_status ? <span style={{ textTransform: 'capitalize' }}>{profile.college_status}</span> : null} />
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Field label="Start year" value={profile?.college_start_year} />
            <Field label="Expected graduation" value={profile?.expected_graduation_year} />
          </Box>
        </SectionCard>

        {/* Stay in touch */}
        <SectionCard title="Stay in touch">
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: profile?.bio ? 2 : 0 }}>
            <SocialLink href={profile?.linkedin_url} icon={<LinkedInIcon />} label="LinkedIn" color="#0A66C2" />
            <SocialLink href={profile?.instagram_url} icon={<InstagramIcon />} label="Instagram" color="#E1306C" />
            <SocialLink href={profile?.portfolio_url} icon={<LanguageIcon />} label="Portfolio" color={INK} />
            {!profile?.linkedin_url && !profile?.instagram_url && !profile?.portfolio_url && (
              <Typography variant="body2" sx={{ color: MUTED }}>No links yet. Use Edit to add LinkedIn / Instagram.</Typography>
            )}
          </Box>
          {profile?.bio && (
            <>
              <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: MUTED, mb: 0.5 }}>ABOUT</Typography>
              <Typography variant="body2" color={INK} sx={{ whiteSpace: 'pre-wrap' }}>
                {profile.bio}
              </Typography>
            </>
          )}
        </SectionCard>
      </Box>

      {/* Activity */}
      <SectionCard title="Activity at Neram">
        <Box sx={{ display: 'flex', gap: 4, mb: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h5" fontWeight={800} color={INK} sx={{ fontVariantNumeric: 'tabular-nums' }}>{activity?.submissionCount ?? 0}</Typography>
            <Typography sx={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>DRAWINGS SUBMITTED</Typography>
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={800} color={INK} sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {activity?.attendance?.attended ?? 0}/{activity?.attendance?.total ?? 0}
            </Typography>
            <Typography sx={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>CLASSES ATTENDED</Typography>
          </Box>
        </Box>
        {/* The Vault: every drawing this student submitted, published and hidden */}
        <StudentWorksPanel userId={userId} studentName={user.name} />
      </SectionCard>

      {/* Microsoft */}
      <SectionCard title="Microsoft account">
        <AlumniMsSection userId={userId} onChanged={load} />
      </SectionCard>

      {/* Archived from Microsoft (snapshot captured at offboarding) */}
      {msSnap && (
        <SectionCard title="Archived from Microsoft">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 3 }}>
            <Field label="Display name" value={msSnap.displayName} />
            <Field label="Email" value={msSnap.mail || msSnap.userPrincipalName} />
            <Field label="Phone" value={msSnap.mobilePhone || (msSnap.businessPhones && msSnap.businessPhones[0])} />
            <Field label="Job title" value={msSnap.jobTitle} />
            <Field label="Department" value={msSnap.department} />
            <Field label="Office" value={msSnap.officeLocation} />
            <Field label="Location" value={[msSnap.city, msSnap.country].filter(Boolean).join(', ')} />
          </Box>
          {msArchivedAt && (
            <Typography variant="caption" sx={{ color: MUTED }}>
              Captured {(() => { try { return new Date(msArchivedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } })()}
            </Typography>
          )}
        </SectionCard>
      )}

      {/* Exam records: attempted exams + admit cards / scorecards / custom documents */}
      <SectionCard title="Exam records">
        <AlumniExamRecords
          userId={userId}
          adminId={supabaseUserId}
          profile={profile}
          documents={adminDocs}
          variant="full"
          onChanged={load}
        />
      </SectionCard>

      {/* Documents */}
      <SectionCard
        title={`Documents (${docs.length + genericAdminDocs.length})`}
        action={
          <Button
            component="label"
            size="small"
            disabled={uploading}
            startIcon={uploading ? <CircularProgress size={14} /> : <UploadFileIcon />}
            sx={{ textTransform: 'none' }}
          >
            {uploading ? 'Uploading...' : 'Upload'}
            <input
              hidden
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = '';
              }}
            />
          </Button>
        }
      >
        {docs.length === 0 && genericAdminDocs.length === 0 ? (
          <Typography variant="body2" sx={{ color: MUTED }}>
            No documents yet. Use Upload to add one (e.g. a missing onboarding document).
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {[
              ...genericAdminDocs.map((d: any) => ({ ...d, _url: d.file_url, _meta: [titleCase(d.category), 'Uploaded by staff'].filter(Boolean).join(' · ') })),
              ...docs.map((d: any) => ({ ...d, _url: d.sharepoint_web_url || d.file_url, _meta: [titleCase(d.category), 'Collected at onboarding'].filter(Boolean).join(' · ') })),
            ].map((d: any, i: number, arr: any[]) => (
              <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderBottom: i < arr.length - 1 ? '1px solid' : 'none', borderColor: '#F1F5F9' }}>
                <DescriptionOutlinedIcon fontSize="small" sx={{ color: MUTED }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" color={INK} noWrap>{d.title || d.category || 'Document'}</Typography>
                  <Typography variant="caption" sx={{ color: MUTED }}>
                    {d._meta}
                  </Typography>
                </Box>
                {d._url && (
                  <Button size="small" component={Link} href={d._url} target="_blank" rel="noopener" endIcon={<OpenInNewIcon />} sx={{ textTransform: 'none' }}>
                    Open
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        )}
      </SectionCard>

      <AlumniEditDialog
        open={editOpen}
        userId={userId}
        adminId={supabaseUserId}
        profile={profile || null}
        initialCollege={college ? { id: college.id, name: college.name, city: college.city, state: college.state } : null}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          load();
        }}
      />
    </Box>
  );
}
