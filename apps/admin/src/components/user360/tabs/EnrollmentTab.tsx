'use client';

import { Box, Typography } from '@neram/ui';
import ClassOutlinedIcon from '@mui/icons-material/ClassOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import OnboardingSection from '@/components/crm/OnboardingSection';
import DocumentsSection from '@/components/crm/DocumentsSection';
import { formatDate, nexusAccessText, relativeTime, sentenceCase } from '@/lib/user360-view';
import { EmptyNote, KeyValue, SectionCard, StatusChip, TwoColumns, type User360TabProps } from '../shared';

const ACCESS_ICONS = {
  enrolled: CheckCircleOutlineIcon,
  not_started: HourglassEmptyIcon,
  alumni: WorkspacePremiumOutlinedIcon,
  none: RemoveCircleOutlineIcon,
} as const;

export function NexusAccessCard({ person }: { person: Record<string, any> }) {
  const state = (person.nexus_access as keyof typeof ACCESS_ICONS) || 'none';
  const text = nexusAccessText(state);
  const Icon = ACCESS_ICONS[state] || RemoveCircleOutlineIcon;
  const participation = person.participation_status as string | undefined;
  return (
    <SectionCard title="Nexus access" icon={<LockOpenOutlinedIcon />}>
      <StatusChip icon={<Icon />} label={text.label} tone={text.tone} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 1.5 }}>
        {text.meaning}
      </Typography>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0,1fr))' } }}>
        <KeyValue label="Classroom" value={person.nexus_classroom_name} />
        <KeyValue
          label="Participation"
          value={
            participation ? (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                {participation === 'dormant' && <PauseCircleOutlineIcon sx={{ fontSize: 16 }} aria-hidden />}
                {participation === 'dormant'
                  ? person.dormant_source === 'staff'
                    ? 'Paused by staff'
                    : 'Not started'
                  : sentenceCase(participation)}
              </Box>
            ) : null
          }
        />
        <KeyValue
          label="Last opened Nexus"
          value={person.nexus_last_login_at ? `${formatDate(person.nexus_last_login_at)} (${relativeTime(person.nexus_last_login_at)})` : 'Never'}
        />
      </Box>
    </SectionCard>
  );
}

export default function EnrollmentTab({ data, detail }: User360TabProps) {
  const enrollments = data.enrollments || [];
  return (
    <Box sx={{ minWidth: 0 }}>
      <TwoColumns>
        <NexusAccessCard person={data.person || {}} />
        <SectionCard title={`Classroom enrollments (${enrollments.length})`} icon={<ClassOutlinedIcon />}>
          {enrollments.length === 0 ? (
            <EmptyNote>Not enrolled in any Nexus classroom.</EmptyNote>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.25 }}>
              {enrollments.map((e: any) => {
                const archived = e.classroom?.is_archived;
                return (
                  <Box
                    component="li"
                    key={e.id}
                    sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 1, p: 1.25, minWidth: 0 }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 0, wordBreak: 'break-word' }}>
                        {e.classroom?.name || 'Unknown classroom'}
                      </Typography>
                      {e.is_active ? (
                        <StatusChip icon={<CheckCircleOutlineIcon />} label="Active" tone="success" />
                      ) : (
                        <StatusChip icon={<RemoveCircleOutlineIcon />} label="Removed" tone="neutral" />
                      )}
                      {archived && <StatusChip icon={<Inventory2OutlinedIcon />} label="Archived classroom" tone="neutral" />}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {[
                        e.classroom?.academic_year && `Year ${e.classroom.academic_year}`,
                        e.role && sentenceCase(String(e.role)),
                        e.current_standard && `Class ${e.current_standard}`,
                        e.participation_status &&
                          (e.participation_status === 'dormant'
                            ? e.dormant_source === 'staff'
                              ? 'Paused by staff'
                              : 'Not started'
                            : sentenceCase(String(e.participation_status))),
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Enrolled {formatDate(e.enrolled_at)}
                      {e.removed_at ? `, removed ${formatDate(e.removed_at)}` : ''}
                      {e.removal_reason_category ? ` (${sentenceCase(String(e.removal_reason_category))})` : ''}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}
        </SectionCard>
      </TwoColumns>

      {detail && (
        <>
          <Box id="crm-section-onboarding">
            <OnboardingSection detail={detail} />
          </Box>
          <Box id="crm-section-documents">
            <DocumentsSection detail={detail} />
          </Box>
        </>
      )}
    </Box>
  );
}
