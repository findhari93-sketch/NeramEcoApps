'use client';

import { Box, Button, Divider, Typography } from '@neram/ui';
import EditIcon from '@mui/icons-material/Edit';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
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
  onConfirm,
}: ClassPanelTabProps) {
  if (role !== 'teacher') return null;

  const { isUpcoming, isCancelled, hasCalendarEntry, isRealChannelMeeting, needsCalendarRepair } = state;

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
