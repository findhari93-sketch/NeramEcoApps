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
import { formatRupees, formatDueDate } from '@neram/database/fee-plan';
import type { DemoFollowUpRow, InterestLevel } from '@neram/database';
import { formatIstDate } from '@/lib/ops-format';
import PhoneIcon from '@mui/icons-material/Phone';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import BrushIcon from '@mui/icons-material/Brush';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import { FOCUS_RING } from '@/components/ops/OpsUi';
import { hasLiveTeamsMeeting, type DemoWithTeams } from '@/lib/demo/teams-evidence';
import { NO_SHOW_AFTER_END_MIN } from '@/lib/demo/demo-verdict';
import type { DemoScheduleSettings, DemoHost } from './types';
import { MEETING_LABELS, closedReason, isFollowUpOpen, meetingKindOf, saysJoinedNoFee, type DemoEnrolment, type DeskPerson, type DeskStage, type ProfileFee } from './journey';
import { ago, classLabel, isCallbackDue, isOverdueNew, parentJoiningLabel, telHref, waHref, whenLabel } from './format';
import { formatLaterDate } from '@/lib/demo/try-later';
import DemoPersonAvatar from './DemoPersonAvatar';

/**
 * Below sm the four columns do not fit, so each row stacks like a card: the
 * student with Call and WhatsApp beside them, then when, then where they stand.
 * No sideways scroll on a phone.
 */
const PHONE_ROWS = {
  '@media (max-width: 599.95px)': {
    '& thead': { display: 'none' },
    '& tbody tr': {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      gridTemplateAreas: '"who contact" "when when" "state state"',
      columnGap: 1,
      rowGap: 0.75,
      px: 2,
      py: 1.5,
      borderBottom: 1,
      borderColor: 'divider',
    },
    '& tbody tr:last-of-type': { borderBottom: 0 },
    '& tbody td': { display: 'block', minWidth: 0, p: 0, border: 0 },
    '& tbody td:empty': { display: 'none' },
    '& tbody td:nth-of-type(1)': { gridArea: 'who' },
    '& tbody td:nth-of-type(2)': { gridArea: 'when', pl: '46px' },
    '& tbody td:nth-of-type(3)': { gridArea: 'state', pl: '46px', whiteSpace: 'normal' },
    '& tbody td:nth-of-type(4)': { gridArea: 'contact', alignSelf: 'start' },
  },
} as const;

const HEAD: Record<DeskStage, [string, string]> = {
  to_call: ['Asked for', 'Call back'],
  scheduled: ['Demo', 'Meeting'],
  after_demo: ['Demo', 'Next follow-up'],
  joined: ['Demo', 'Enrolled'],
  later: ['Why later', 'Try again'],
  closed: ['Last request', 'Why closed'],
};

/** A one-line fee glance for the Enrolled row: paid of agreed, and the balance due. */
function feeLineShort(fee: ProfileFee | null | undefined): string | null {
  if (!fee) return null;
  const { paid, agreed, balance, nextDueDate } = fee;
  if (balance !== null && balance <= 0.01 && paid > 0) return 'Paid in full';
  if (agreed !== null) {
    const base = `${formatRupees(paid)} of ${formatRupees(agreed)}`;
    if (balance && balance > 0) return nextDueDate ? `${base} · due by ${formatDueDate(nextDueDate)}` : `${base} · balance due`;
    return base;
  }
  if (paid > 0) return `${formatRupees(paid)} paid`;
  return null;
}

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
  enrolment,
}: {
  people: DeskPerson[];
  stage: DeskStage;
  selectedId: string | null;
  onSelect: (id: string) => void;
  schedule: DemoScheduleSettings;
  hosts: DemoHost[];
  now: Date;
  followUps: Record<string, DemoFollowUpRow>;
  enrolment: Record<string, DemoEnrolment>;
}) {
  const nameOf = (upn: string | null) => (upn ? hosts.find((h) => h.upn.toLowerCase() === upn.toLowerCase())?.name || upn.split('@')[0] : null);
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
      <Table size="small" aria-label="Demo students" sx={PHONE_ROWS}>
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
            const e = enrolment[r.id];
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
                  <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                    <DemoPersonAvatar request={r} enrolment={e} size={36} />
                    <Box sx={{ minWidth: 0 }}>
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
                        {e?.kind === 'student_before' && (
                          <Tooltip title="Had a student profile before this demo: a current student or a test account">
                            <Chip size="small" variant="outlined" color="info" label={`Student since ${formatIstDate(e.since)}`} sx={{ height: 20, fontSize: 11 }} />
                          </Tooltip>
                        )}
                        {(r as DemoWithTeams).attendance_source === 'teams' && (r.status === 'attended' || r.status === 'no_show') && (
                          <Tooltip title={(r as DemoWithTeams).teams_verdict?.reason ?? 'Marked from Teams attendance'}>
                            <Chip
                              size="small"
                              variant="outlined"
                              icon={<AutoModeIcon />}
                              label={r.status === 'attended' ? 'Attended, by Teams' : 'No-show, by Teams'}
                              sx={{ height: 20, fontSize: 11, '& .MuiChip-icon': { fontSize: 14 } }}
                            />
                          </Tooltip>
                        )}
                        {r.account_holder === 'parent' && (
                          <Chip size="small" variant="outlined" label="Parent's account" sx={{ height: 20, fontSize: 11 }} />
                        )}
                        {r.parent_joining && (
                          <Tooltip title={parentJoiningLabel(r.status)}>
                            <FamilyRestroomIcon aria-label={parentJoiningLabel(r.status)} sx={{ fontSize: 16 }} />
                          </Tooltip>
                        )}
                        {r.drawing_received_at && (
                          <Tooltip title={r.drawing_feedback_at ? 'Drawing received, feedback sent' : 'Drawing received'}>
                            <BrushIcon aria-label="Drawing received" sx={{ fontSize: 16, color: r.drawing_feedback_at ? 'success.main' : 'warning.main' }} />
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </TableCell>

                <TableCell sx={{ minWidth: 180 }}>
                  {stage === 'later' ? (
                    <Typography variant="body2" sx={{ whiteSpace: 'normal', maxWidth: 280 }}>
                      {r.later_reason || 'Asked us to wait'}
                    </Typography>
                  ) : (
                    <Typography variant="body2">{when.primary}</Typography>
                  )}
                  {stage === 'later' ? null : stage === 'to_call' && r.last_call_outcome === 'later' ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'normal', maxWidth: 280 }}>
                      Asked to wait{r.later_reason ? `: ${r.later_reason}` : ''}
                    </Typography>
                  ) : stage === 'to_call' || stage === 'closed' ? (
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
                      // A Teams demo decides itself; only an unclear one, or one past the wait, needs a person.
                      hasLiveTeamsMeeting(r) &&
                      (r as DemoWithTeams).teams_verdict?.kind !== 'unclear' &&
                      now.getTime() < start.getTime() + (r.scheduled_minutes + NO_SHOW_AFTER_END_MIN + 30) * 60_000 ? (
                        <Chip size="small" variant="outlined" icon={<AutoModeIcon />} label="Checking Teams" />
                      ) : (
                        <Tooltip title={(r as DemoWithTeams).teams_verdict?.reason ?? ''}>
                          <Chip size="small" color="error" icon={<ErrorOutlineIcon />} label="Mark what happened" />
                        </Tooltip>
                      )
                    ) : (
                      <Typography variant="body2" color={meetingKindOf(r) === 'later' ? 'warning.dark' : 'text.primary'} fontWeight={meetingKindOf(r) === 'later' ? 600 : 400}>
                        {MEETING_LABELS[meetingKindOf(r)]}
                      </Typography>
                    ))}

                  {stage === 'after_demo' &&
                    (e?.kind === 'fee_pending' ? (
                      <Chip size="small" color="info" variant="outlined" icon={<ErrorOutlineIcon />} label="Payment entered, finalise" />
                    ) : saysJoinedNoFee(f, e) ? (
                      <Chip size="small" color="warning" variant="outlined" icon={<ErrorOutlineIcon />} label="Says joined, fee not recorded" />
                    ) : (
                      <FollowUpCell f={f} now={now} />
                    ))}

                  {stage === 'joined' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, alignItems: 'flex-start' }}>
                      <Chip
                        size="small"
                        color="success"
                        icon={<CheckCircleIcon />}
                        label={e?.kind === 'enrolled' ? `Enrolled ${formatIstDate(e.on)}` : 'Enrolled'}
                      />
                      {e?.kind === 'enrolled' && feeLineShort(e.fee) && (
                        <Typography variant="caption" color="text.secondary">
                          {feeLineShort(e.fee)}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {stage === 'later' && r.next_contact_at && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <ScheduleIcon aria-hidden sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography variant="body2">{formatLaterDate(r.next_contact_at)}</Typography>
                    </Box>
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
