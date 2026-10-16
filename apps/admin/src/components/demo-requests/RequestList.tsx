'use client';

import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Tooltip,
  Chip,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { INTEREST_LABELS } from '@neram/database/demo-follow-up';
import { formatDemoDateTime } from '@neram/database/demo-schedule';
import type { DemoFollowUpRow, InterestLevel } from '@neram/database';
import { formatIstDate } from '@/lib/ops-format';
import PhoneIcon from '@mui/icons-material/Phone';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import BrushIcon from '@mui/icons-material/Brush';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { FOCUS_RING } from '@/components/ops/OpsUi';
import type { DemoScheduleSettings, DemoHost } from './types';
import { MEETING_LABELS, closedReason, isFollowUpOpen, meetingKindOf, type DeskPerson, type DeskStage } from './journey';
import { ago, classLabel, isCallbackDue, isOverdueNew, telHref, waHref, whenLabel } from './format';

const HEAD: Record<DeskStage, [string, string]> = {
  to_call: ['Asked for', 'Call back'],
  scheduled: ['Demo', 'Meeting'],
  after_demo: ['Demo', 'Next follow-up'],
  joined: ['Demo', 'Joined'],
  closed: ['Last request', 'Why closed'],
};

function FollowUpCell({ f, now }: { f: DemoFollowUpRow | undefined; now: Date }) {
  if (!isFollowUpOpen(f)) {
    return (
      <Typography variant="body2" color="warning.dark" fontWeight={600}>
        Not started
      </Typography>
    );
  }
  const due = f!.scheduled_callback_at ? new Date(f!.scheduled_callback_at) : null;
  const late = due !== null && due.getTime() < now.getTime();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
      {f!.interest_level && (
        <Chip
          size="small"
          label={INTEREST_LABELS[f!.interest_level as InterestLevel]}
          color={f!.interest_level === 'hot' ? 'error' : f!.interest_level === 'warm' ? 'warning' : 'default'}
        />
      )}
      <Typography component="span" variant="body2" sx={{ color: late ? 'error.main' : 'text.primary', fontWeight: late ? 700 : 400 }}>
        {due ? `${late ? 'Overdue, ' : ''}${formatDemoDateTime(due)}` : 'No date'}
      </Typography>
    </Box>
  );
}

export default function RequestList({
  people,
  stage,
  selectedId,
  onSelect,
  schedule,
  hosts,
  now,
  followUps,
  joinedAt,
}: {
  people: DeskPerson[];
  stage: DeskStage;
  selectedId: string | null;
  onSelect: (id: string) => void;
  schedule: DemoScheduleSettings;
  hosts: DemoHost[];
  now: Date;
  followUps: Record<string, DemoFollowUpRow>;
  joinedAt: Record<string, string>;
}) {
  const nameOf = (upn: string | null) => (upn ? hosts.find((h) => h.upn.toLowerCase() === upn.toLowerCase())?.name || upn.split('@')[0] : null);
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
      <Table size="small" aria-label="Demo students">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Student</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{HEAD[stage][0]}</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{HEAD[stage][1]}</TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Contact
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {people.map((p) => {
            const r = p.current;
            const when = whenLabel(r, schedule);
            const selected = r.id === selectedId || p.history.some((h) => h.id === selectedId);
            const start = r.scheduled_start ? new Date(r.scheduled_start) : null;
            const f = followUps[r.id];
            return (
              <TableRow
                key={p.key}
                hover
                selected={selected}
                onClick={() => onSelect(r.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(r.id);
                  }
                }}
                tabIndex={0}
                aria-selected={selected}
                sx={{ cursor: 'pointer', ...FOCUS_RING, '& td': { py: 1.25 } }}
              >
                <TableCell sx={{ minWidth: 180 }}>
                  <Typography variant="body2" fontWeight={700}>
                    {r.name}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', color: 'text.secondary' }}>
                    <Typography variant="caption">{r.ref_code}</Typography>
                    {classLabel(r.current_class) && <Typography variant="caption">{classLabel(r.current_class)}</Typography>}
                    {p.history.length > 0 && (
                      <Typography variant="caption">
                        +{p.history.length} earlier request{p.history.length === 1 ? '' : 's'}
                      </Typography>
                    )}
                    {r.account_holder === 'parent' && (
                      <Chip size="small" variant="outlined" label="Parent's account" sx={{ height: 20, fontSize: 11 }} />
                    )}
                    {r.parent_joining && (
                      <Tooltip title="Parent joining">
                        <FamilyRestroomIcon aria-label="Parent joining" sx={{ fontSize: 16 }} />
                      </Tooltip>
                    )}
                    {r.drawing_received_at && (
                      <Tooltip title={r.drawing_feedback_at ? 'Drawing received, feedback sent' : 'Drawing received'}>
                        <BrushIcon aria-label="Drawing received" sx={{ fontSize: 16, color: r.drawing_feedback_at ? 'success.main' : 'warning.main' }} />
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>

                <TableCell sx={{ minWidth: 180 }}>
                  <Typography variant="body2">{when.primary}</Typography>
                  {stage === 'to_call' || stage === 'closed' ? (
                    when.secondary && (
                      <Typography variant="caption" color="text.secondary">
                        {when.secondary}
                      </Typography>
                    )
                  ) : (
                    nameOf(r.tutor_upn) && (
                      <Typography variant="caption" color="text.secondary">
                        with {nameOf(r.tutor_upn)}
                      </Typography>
                    )
                  )}
                </TableCell>

                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {stage === 'to_call' &&
                    (r.next_contact_at ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: isCallbackDue(r, now) ? 'error.main' : 'text.primary' }}>
                        <ScheduleIcon aria-hidden sx={{ fontSize: 16 }} />
                        <Typography variant="body2" fontWeight={isCallbackDue(r, now) ? 700 : 400}>
                          {isCallbackDue(r, now) ? 'Due now' : formatDemoDateTime(new Date(r.next_contact_at))}
                        </Typography>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: isOverdueNew(r, now) ? 'error.main' : 'text.secondary' }}>
                        {isOverdueNew(r, now) && <ErrorOutlineIcon aria-hidden sx={{ fontSize: 16 }} />}
                        <Typography variant="body2" fontWeight={isOverdueNew(r, now) ? 700 : 400}>
                          {r.status === 'contacted' ? 'Called, no time yet' : `Asked ${ago(r.created_at, now)}`}
                          {isOverdueNew(r, now) ? ', call now' : ''}
                        </Typography>
                      </Box>
                    ))}

                  {stage === 'scheduled' &&
                    (start && start.getTime() + r.scheduled_minutes * 60_000 < now.getTime() ? (
                      <Chip size="small" color="error" icon={<ErrorOutlineIcon />} label="Mark what happened" />
                    ) : (
                      <Typography variant="body2" color={meetingKindOf(r) === 'later' ? 'warning.dark' : 'text.primary'} fontWeight={meetingKindOf(r) === 'later' ? 600 : 400}>
                        {MEETING_LABELS[meetingKindOf(r)]}
                      </Typography>
                    ))}

                  {stage === 'after_demo' && <FollowUpCell f={f} now={now} />}

                  {stage === 'joined' && (
                    <Chip
                      size="small"
                      color="success"
                      icon={<CheckCircleIcon />}
                      label={r.user_id && joinedAt[r.user_id] ? `Joined ${formatIstDate(joinedAt[r.user_id])}` : 'Joined'}
                    />
                  )}

                  {stage === 'closed' && (
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'normal', maxWidth: 280 }}>
                      {closedReason(r, f) || 'Closed'}
                    </Typography>
                  )}
                </TableCell>

                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title={`Call ${r.name}`}>
                    <IconButton
                      component="a"
                      href={telHref(r.phone)}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      aria-label={`Call ${r.name}`}
                      sx={{ width: 44, height: 44 }}
                    >
                      <PhoneIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={`WhatsApp ${r.name}`}>
                    <IconButton
                      component="a"
                      href={waHref(r.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      aria-label={`WhatsApp ${r.name}`}
                      sx={{ width: 44, height: 44, color: 'success.main' }}
                    >
                      <WhatsAppIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
