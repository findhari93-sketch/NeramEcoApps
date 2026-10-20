'use client';

import { alpha } from '@mui/material/styles';
import { Alert, AlertTitle, Box, Button, Chip, CircularProgress, Paper, Typography } from '@neram/ui';
import SyncIcon from '@mui/icons-material/Sync';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VideoFileOutlinedIcon from '@mui/icons-material/VideoFileOutlined';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import { FOCUS_RING } from '@/components/ops/OpsUi';
import { type DemoAttendee, type DemoRecordingFile, type DemoWithTeams } from '@/lib/demo/teams-evidence';
import { HELD_MINUTES, NO_SHOW_AFTER_END_MIN, demoWindow, timeTogether } from '@/lib/demo/demo-verdict';
import { ago } from './format';
import DemoReview from './DemoReview';

const timeIst = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
const mins = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;
const sizeMb = (b: number) => `${Math.round(b / 1_000_000)} MB`;

function span(a: DemoAttendee): string {
  if (!a.firstJoin) return '';
  return `${timeIst(a.firstJoin)}${a.lastLeave ? ` to ${timeIst(a.lastLeave).split(', ').pop()}` : ''}`;
}

function recordingLabel(f: DemoRecordingFile): string {
  return `Recorded ${timeIst(f.createdAt)}`;
}

/** The outcome as the desk sees it: what Teams decided, or why it is waiting for a person. */
function Verdict({
  r,
  now,
  busy,
  onMarkAttended,
  onMarkNoShow,
}: {
  r: DemoWithTeams;
  now: Date;
  busy: string | null;
  onMarkAttended: () => void;
  onMarkNoShow: () => void;
}) {
  const v = r.teams_verdict;
  const auto = r.attendance_source === 'teams';
  const fix = (label: string, onClick: () => void) => (
    <Button color="inherit" size="small" onClick={onClick} disabled={!!busy} sx={{ minHeight: 40, whiteSpace: 'nowrap', ...FOCUS_RING }}>
      {label}
    </Button>
  );

  if (r.status === 'attended' && auto) {
    return (
      <Alert severity="success" icon={<HowToRegIcon />} action={fix('Not right? No-show', onMarkNoShow)} sx={{ mt: 1.5 }}>
        <AlertTitle sx={{ mb: 0.25 }}>Demo held, marked automatically</AlertTitle>
        {v?.reason} The follow-up has started.
      </Alert>
    );
  }
  if (r.status === 'no_show' && auto) {
    return (
      <Alert severity="warning" icon={<PersonOffIcon />} action={fix('They attended', onMarkAttended)} sx={{ mt: 1.5 }}>
        <AlertTitle sx={{ mb: 0.25 }}>No-show, marked automatically</AlertTitle>
        {v?.reason} A rebooking follow-up has started. If the student joins late, this turns to Attended by itself.
      </Alert>
    );
  }
  if (r.status === 'approved' && v?.kind === 'unclear') {
    return (
      <Alert
        severity="warning"
        icon={<HelpOutlineIcon />}
        sx={{ mt: 1.5 }}
        action={
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {fix('Attended', onMarkAttended)}
            {fix('No-show', onMarkNoShow)}
          </Box>
        }
      >
        <AlertTitle sx={{ mb: 0.25 }}>Teams could not tell</AlertTitle>
        {v.reason}
      </Alert>
    );
  }
  if (r.status === 'approved' && r.scheduled_start) {
    const started = now.getTime() >= new Date(r.scheduled_start).getTime();
    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1.5, color: 'text.secondary' }}>
        <AutoModeIcon aria-hidden fontSize="small" sx={{ mt: 0.25 }} />
        <Typography variant="body2">
          {started ? 'Deciding as soon as Teams shares attendance. ' : 'Decided automatically after the meeting. '}
          {HELD_MINUTES} minutes or more with the student marks it Attended. Only the team in the meeting marks it No-show,{' '}
          {NO_SHOW_AFTER_END_MIN} minutes after the booked end.
        </Typography>
      </Box>
    );
  }
  return null;
}

/**
 * What Microsoft Teams saw for this demo, and what the desk made of it: the
 * automatic outcome (with a one-click correction), who joined and for how long
 * with the team, the recording, and the recording with its transcript.
 */
export default function TeamsEvidence({
  r,
  now,
  busy,
  onCheck,
  onMarkAttended,
  onMarkNoShow,
  onPick,
}: {
  r: DemoWithTeams;
  now: Date;
  busy: string | null;
  onCheck: () => void;
  onMarkAttended: () => void;
  onMarkNoShow: () => void;
  onPick: (itemId: string) => void;
}) {
  const w = r.scheduled_start ? demoWindow(r.scheduled_start, r.scheduled_minutes) : null;
  const attendance = r.teams_attendance ?? [];
  const guests = timeTogether(attendance, w?.from ?? -Infinity, w?.to ?? Infinity);
  const elsewhere = timeTogether(attendance, -Infinity, Infinity).filter((g) => g.present > 0 && !guests.some((x) => x.guest === g.guest && x.present > 0));
  const team = attendance.filter((a) => a.staff && a.seconds > 0);
  const recordings = r.recording_candidates ?? [];
  const checked = !!r.teams_checked_at;
  const ended = w ? now.getTime() > w.end : false;
  const autoPicked = !!r.recording_item_id && !r.recording_picked_by && !!r.recording_picked_at;

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2, borderRadius: 2 }} component="section" aria-labelledby="teams-evidence-title">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography id="teams-evidence-title" variant="subtitle2" fontWeight={700} sx={{ flex: 1, minWidth: 160 }}>
          From Microsoft Teams
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {checked ? `Checked ${ago(r.teams_checked_at!, now)}` : 'Not checked yet'}
        </Typography>
        <Button
          size="small"
          startIcon={busy === 'teams_check' ? <CircularProgress size={16} /> : <SyncIcon />}
          onClick={onCheck}
          disabled={!!busy}
          sx={{ minHeight: 44, ...FOCUS_RING }}
        >
          {busy === 'teams_check' ? 'Checking' : 'Check now'}
        </Button>
      </Box>

      <Box aria-live="polite">
        <Verdict r={r} now={now} busy={busy} onMarkAttended={onMarkAttended} onMarkNoShow={onMarkNoShow} />
      </Box>

      {r.teams_check_note && (
        <Alert severity="info" sx={{ mt: 1 }}>
          {r.teams_check_note}
        </Alert>
      )}

      {/* Attendance */}
      <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mt: 1.5, lineHeight: 1.6 }}>
        Who joined
      </Typography>
      {!r.teams_attendance ? (
        <Typography variant="body2" color="text.secondary">
          {ended || checked ? 'No attendance from Teams yet. It appears a few minutes after everyone leaves.' : 'Teams shares attendance a few minutes after the meeting ends.'}
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 0.75 }}>
          {guests
            .filter((g) => g.present > 0)
            .map(({ guest: g, present, together }) => (
              <Box component="li" key={`${g.name}-${g.firstJoin}`}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Typography variant="body2" fontWeight={700}>
                    {g.name}
                  </Typography>
                  <Typography variant="body2" color={together >= HELD_MINUTES * 60_000 ? 'success.dark' : 'text.secondary'} fontWeight={600}>
                    {mins(together / 1000)} with the team
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  In the meeting {mins(present / 1000)}, {span(g)}
                </Typography>
              </Box>
            ))}
          {!guests.some((g) => g.present > 0) && (
            <Typography component="li" variant="body2" color="text.secondary">
              No one outside Neram joined around the booked time.
            </Typography>
          )}
          {elsewhere.map(({ guest: g }) => (
            <Typography component="li" variant="caption" color="text.secondary" key={`x-${g.name}-${g.firstJoin}`}>
              {g.name} joined at another time ({span(g)}). Not counted for this demo.
            </Typography>
          ))}
          {team.length > 0 && (
            <Typography component="li" variant="caption" color="text.secondary">
              Team: {team.map((t) => `${t.name} ${mins(t.seconds)}`).join(', ')}
            </Typography>
          )}
        </Box>
      )}

      {/* Recording and transcript */}
      <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mt: 2, lineHeight: 1.6 }}>
        Recording and transcript
      </Typography>
      {!recordings.length && !r.transcript_found_at ? (
        <Typography variant="body2" color="text.secondary">
          {checked
            ? 'Nothing yet. Teams saves the recording and transcript a few minutes after the meeting ends.'
            : 'Found automatically after the meeting.'}
        </Typography>
      ) : (
        recordings.length > 0 && (
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
            {recordings.map((f) => {
              const picked = r.recording_item_id === f.itemId;
              return (
                <Box
                  component="li"
                  key={f.itemId}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    p: 1.25,
                    borderRadius: 1.5,
                    border: 1,
                    borderColor: picked ? 'success.main' : 'divider',
                    bgcolor: (t) => (picked ? alpha(t.palette.success.main, 0.06) : 'transparent'),
                    flexWrap: 'wrap',
                  }}
                >
                  <VideoFileOutlinedIcon aria-hidden color={picked ? 'success' : 'action'} />
                  <Box sx={{ flex: 1, minWidth: 160 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {recordingLabel(f)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {f.durationMs ? `${mins(f.durationMs / 1000)}, ` : ''}
                      {sizeMb(f.size)}
                    </Typography>
                  </Box>
                  {picked ? (
                    <Chip icon={<CheckCircleIcon />} color="success" label={autoPicked ? 'Picked automatically' : "This demo's recording"} size="small" />
                  ) : (
                    <Button size="small" variant="outlined" onClick={() => onPick(f.itemId)} disabled={!!busy} sx={{ minHeight: 40, ...FOCUS_RING }}>
                      {busy === `pick:${f.itemId}` ? 'Saving' : 'Use this one'}
                    </Button>
                  )}
                </Box>
              );
            })}
          </Box>
        )
      )}
      {recordings.length > 1 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          More than one video: a test run records too. The longest one near the booked time is used; switch if it is the wrong one.
        </Typography>
      )}

      <DemoReview
        id={r.id}
        name={r.name}
        hasRecording={!!r.recording_item_id}
        hasTranscript={!!r.transcript_found_at}
        webUrl={r.recording_web_url ?? null}
      />
    </Paper>
  );
}
