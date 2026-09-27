'use client';

import { Box, Button, Chip, LinearProgress, Typography } from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TravelExploreOutlinedIcon from '@mui/icons-material/TravelExploreOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { profileCompleteness } from '@neram/database';
import UserProfileSection from '@/components/crm/UserProfileSection';
import { formatDate, formatDateTime, isOverdue, relativeTime, sentenceCase, suggestionLabel } from '@/lib/user360-view';
import { EmptyNote, KeyValue, SectionCard, TwoColumns, type User360TabProps } from '../shared';
import IdentityList from '../IdentityList';

const FIRST_TOUCH_LABELS: Record<string, string> = {
  utm_source: 'Source',
  utm_medium: 'Medium',
  utm_campaign: 'Campaign',
  referrer: 'Referrer',
  landing_page: 'Landing page',
  first_seen_at: 'First seen',
};

export default function OverviewTab({ data, detail, onNavigateTab }: User360TabProps) {
  const p = data.person || {};
  const inLifecycle = 'lifecycle_stage' in p;
  const completeness = profileCompleteness(p.profile_missing);
  const firstTouch = (p.first_touch && typeof p.first_touch === 'object' ? p.first_touch : null) as Record<string, any> | null;
  const touchEntries = firstTouch
    ? Object.entries(FIRST_TOUCH_LABELS).filter(([k]) => firstTouch[k])
    : [];
  const followUps = data.crm?.openFollowUps || [];
  const suggestions = data.suggestions || [];

  return (
    <TwoColumns>
      <Box sx={{ minWidth: 0 }}>
        {inLifecycle ? (
          <SectionCard title="Learner" icon={<SchoolOutlinedIcon />}>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <KeyValue label="Preparation goal" value={p.preparation_goal ? sentenceCase(String(p.preparation_goal)) : null} />
              <KeyValue
                label="Target exams"
                value={
                  p.target_exams?.length ? (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                      {p.target_exams.map((e: string) => (
                        <Chip key={e} label={e} size="small" variant="outlined" />
                      ))}
                    </Box>
                  ) : null
                }
              />
              <KeyValue label="Target year" value={p.target_year} />
              <KeyValue label="Class" value={p.current_standard ? `Class ${p.current_standard}` : null} />
              <KeyValue label="Academic year" value={p.academic_year} />
              <KeyValue label="City" value={p.city} />
            </Box>
          </SectionCard>
        ) : (
          <SectionCard title="Staff account" icon={<SchoolOutlinedIcon />}>
            <EmptyNote>
              This person is staff, so there is no learner profile or lifecycle stage. Access, audit history and
              notes still apply.
            </EmptyNote>
          </SectionCard>
        )}

        {inLifecycle && (
          <SectionCard title="Profile completeness" icon={<FactCheckOutlinedIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <LinearProgress
                variant="determinate"
                value={completeness.percent}
                aria-label={`Profile ${completeness.percent} percent complete`}
                color={completeness.percent === 100 ? 'success' : 'primary'}
                sx={{ flex: 1, height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 44, textAlign: 'right' }}>
                {completeness.percent}%
              </Typography>
            </Box>
            {completeness.items.length === 0 ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'success.dark' }}>
                <CheckCircleOutlineIcon sx={{ fontSize: 18 }} aria-hidden />
                <Typography variant="body2">Profile complete</Typography>
              </Box>
            ) : (
              <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 0.5 }}>
                {completeness.items.map((item) => (
                  <Box component="li" key={item} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <ErrorOutlineIcon sx={{ fontSize: 18, color: '#8a4b00' }} aria-hidden />
                    <Typography variant="body2">{/not /i.test(item) ? item : `No ${item.toLowerCase()} yet`}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </SectionCard>
        )}

        <SectionCard title="Sign-in methods" icon={<FactCheckOutlinedIcon />}>
          <IdentityList data={data} compact />
        </SectionCard>

        <SectionCard title="First touch" icon={<TravelExploreOutlinedIcon />}>
          {touchEntries.length ? (
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              {touchEntries.map(([k, label]) => (
                <KeyValue
                  key={k}
                  label={label}
                  value={k === 'first_seen_at' ? formatDateTime(firstTouch![k]) : String(firstTouch![k])}
                />
              ))}
            </Box>
          ) : (
            <EmptyNote>No first-touch data recorded. People who signed up before tracking started have none.</EmptyNote>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Joined {formatDate(p.created_at)}
          </Typography>
        </SectionCard>
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <SectionCard
          title="Next steps"
          icon={<ChecklistOutlinedIcon />}
          action={
            onNavigateTab && followUps.length > 0 ? (
              <Button size="small" onClick={() => onNavigateTab('crm')} sx={{ textTransform: 'none', minHeight: 44 }}>
                Open CRM
              </Button>
            ) : null
          }
        >
          {suggestions.length === 0 && followUps.length === 0 ? (
            <EmptyNote>Nothing is waiting on staff for this person.</EmptyNote>
          ) : (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1 }}>
              {suggestions.map((s: any) => (
                <Box component="li" key={s.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <LightbulbOutlinedIcon sx={{ fontSize: 20, color: 'info.dark', mt: 0.25 }} aria-hidden />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Suggested: {suggestionLabel(s.kind)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {s.reason}
                    </Typography>
                  </Box>
                </Box>
              ))}
              {followUps.map((f: any) => {
                const overdue = isOverdue(f.due_at);
                return (
                  <Box component="li" key={f.callback_id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    {overdue ? (
                      <WarningAmberIcon sx={{ fontSize: 20, color: 'error.main', mt: 0.25 }} aria-hidden />
                    ) : (
                      <EventOutlinedIcon sx={{ fontSize: 20, color: 'primary.main', mt: 0.25 }} aria-hidden />
                    )}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Follow-up {overdue ? 'overdue' : 'due'} {relativeTime(f.due_at)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatDateTime(f.due_at)}
                        {f.query_type ? `, ${sentenceCase(String(f.query_type))}` : ''}
                        {f.assigned_to_name ? `, assigned to ${f.assigned_to_name}` : ''}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </SectionCard>

        {detail && (
          <Box id="crm-section-profile">
            <UserProfileSection detail={detail} />
          </Box>
        )}
      </Box>
    </TwoColumns>
  );
}
