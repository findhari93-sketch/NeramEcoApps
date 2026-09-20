'use client';

import { Box, Button, Divider, Typography } from '@neram/ui';
import EditIcon from '@mui/icons-material/Edit';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import UndoIcon from '@mui/icons-material/Undo';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { ClassPanelTabProps } from './types';

/**
 * The teacher's tail of the Class tab: change it, move it, call it off, and the
 * audit line that explains what Teams actually did with it.
 *
 * Separate file because it is the only part of that tab a student never sees,
 * and because the calendar-repair banner underneath it is a whole argument of
 * its own.
 */
export default function ClassManageSection({
  cls,
  state,
  role,
  onEdit,
  onDelete,
  onDeletePermanent,
  onReschedule,
  onRepairMeeting,
  onNotTaught,
  onConfirm,
}: ClassPanelTabProps) {
  if (role !== 'teacher') return null;

  const { isUpcoming, isPast, isCancelled, hasCalendarEntry, isRealChannelMeeting, needsCalendarRepair } = state;

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* Moving a class to another day is its own action, not a field buried
            in Edit. It is the thing a teacher reaches for when something comes
            up, and it has to carry the Teams meeting and the posted cards with
            it, which Edit alone never did. */}
        {isUpcoming && !isCancelled && onReschedule && (
          <Button
            variant="outlined"
            fullWidth
            startIcon={<EventRepeatIcon />}
            onClick={() => onReschedule(cls)}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
          >
            Reschedule
          </Button>
        )}

        {isUpcoming && !isCancelled && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            {onEdit && (
              <Button
                variant="outlined"
                fullWidth
                startIcon={<EditIcon />}
                onClick={() => onEdit(cls)}
                sx={{ minHeight: 48, textTransform: 'none' }}
              >
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                variant="outlined"
                fullWidth
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => onConfirm('cancel')}
                sx={{ minHeight: 48, textTransform: 'none' }}
              >
                Cancel Class
              </Button>
            )}
          </Box>
        )}

        {/* The session where the tutor joined only to say the class was
            postponed. Until this existed a teacher's only lever on a finished
            class was Delete Permanently, which takes the attendance register,
            the recording and the transcript with it, so the honest answer to
            "nineteen people were in that room but nothing was taught" was that
            there was no answer.

            Outlined and NOT error-coloured, unlike the two beside it: this is
            reversible and it destroys nothing. Placed above Delete Permanently
            so the recoverable option is met first. */}
        {isPast && !isCancelled && onNotTaught && (
          <Button
            variant="outlined"
            fullWidth
            startIcon={<EventBusyIcon />}
            onClick={() => onConfirm('not_taught')}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            No class was taught
          </Button>
        )}

        {/* Offered on any cancelled past class, because the panel cannot tell
            from `cls` alone which ones we marked. The route decides, and
            refuses a class that was cancelled some other way: un-cancelling one
            that genuinely never ran would let the nightly cron derive a fresh
            set of obligations for a session nobody attended. */}
        {isPast && isCancelled && onNotTaught && (
          <Button
            variant="outlined"
            fullWidth
            startIcon={<UndoIcon />}
            onClick={() => onConfirm('undo_not_taught')}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            This was a class after all
          </Button>
        )}

        {isCancelled && onDeletePermanent && (
          <Button
            variant="outlined"
            fullWidth
            color="error"
            startIcon={<DeleteForeverIcon />}
            onClick={() => onConfirm('delete')}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Delete Permanently
          </Button>
        )}

        {/* A class that ran out the clock without ever being cancelled (typically
            one scheduled onto a date that had already passed) satisfies neither
            condition above: not upcoming, so no Cancel; never cancelled, so no
            Delete either. Left as-is it is unrecoverable from the UI, so it gets
            its own direct path straight to permanent delete, skipping the "mark
            cancelled" step entirely since the class never happened in the first
            place and a "Cancelled" card for a bygone slot would only confuse. */}
        {isPast && !isCancelled && onDeletePermanent && (
          <Button
            variant="outlined"
            fullWidth
            color="error"
            startIcon={<DeleteForeverIcon />}
            onClick={() => onConfirm('delete')}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Delete Permanently
          </Button>
        )}
      </Box>

      <Divider />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Class Info
          </Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
          {cls.teacher && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Created by
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                {cls.teacher.name}
              </Typography>
            </Box>
          )}
          <Box>
            <Typography variant="caption" color="text.secondary">
              Scope
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
              {cls.target_scope === 'all'
                ? 'All Students'
                : cls.target_scope === 'batch'
                  ? `Batch: ${cls.batch?.name || 'N/A'}`
                  : cls.classroom?.name || 'Classroom'}
            </Typography>
          </Box>
          {cls.teams_meeting_scope && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Teams type
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.8rem',
                  color: cls.teams_meeting_id && !hasCalendarEntry ? 'warning.dark' : 'inherit',
                  fontWeight: cls.teams_meeting_id && !hasCalendarEntry ? 600 : 400,
                }}
              >
                {!cls.teams_meeting_id
                  ? 'No meeting'
                  : !hasCalendarEntry
                    ? 'Link only, no invite sent'
                    : isRealChannelMeeting
                      ? 'Channel meeting'
                      : 'Calendar invites'}
              </Typography>
            </Box>
          )}
          {cls.classroom && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Classroom
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                {cls.classroom.name}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Two different holes, one repair. Either the class has a join link and
            no calendar entry at all, so it reached nobody, or it has one on the
            team calendar and still is not on the tutor's own calendar. Name
            whichever it is instead of always claiming the worse one, then offer
            the action, which reuses the existing join link so every link already
            posted to Teams and WhatsApp keeps working. */}
        {needsCalendarRepair && onRepairMeeting && (
          <Box
            sx={{
              mt: 0.5,
              p: 1.25,
              borderRadius: 1,
              bgcolor: 'warning.light',
              border: '1px solid',
              borderColor: 'warning.main',
            }}
          >
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'warning.dark' }}>
              {hasCalendarEntry ? 'Not on your calendar' : 'Nobody was invited to this class'}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.primary', mb: 1 }}>
              {hasCalendarEntry
                ? 'The invite went out from the class team calendar, which does not show in your own Teams or Outlook calendar. Add a copy so you see it alongside everything else.'
                : 'It has a Teams link but no calendar entry, so it will not appear on your calendar or on any student’s.'}
            </Typography>
            <Button
              variant="contained"
              color="warning"
              fullWidth
              startIcon={<EventAvailableIcon />}
              onClick={() => onRepairMeeting(cls)}
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
            >
              {hasCalendarEntry ? 'Add to my calendar' : 'Fix calendar invites'}
            </Button>
          </Box>
        )}
      </Box>
    </>
  );
}
