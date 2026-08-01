'use client';

import { Box, Chip, IconButton, Tab, Tabs, Typography, useTheme } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { formatTime } from '../date-utils';
import { tagSx } from '../timetable-theme';
import type { ClassCardData } from '../ClassCard';
import type { ClassPanelTabKey, ClassState, TimeIndicator } from './class-state';

const statusColors: Record<string, string> = {
  scheduled: 'primary.main',
  live: 'error.main',
  completed: 'success.main',
  cancelled: 'text.disabled',
  rescheduled: 'warning.main',
};

const statusChipColor: Record<string, 'primary' | 'error' | 'success' | 'default' | 'warning'> = {
  scheduled: 'primary',
  live: 'error',
  completed: 'success',
  cancelled: 'default',
  rescheduled: 'warning',
};

const TAB_LABELS: Record<ClassPanelTabKey, string> = {
  class: 'Class',
  prep: 'Prep',
  after: 'After',
};

function formatDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

interface ClassPanelHeaderProps {
  cls: ClassCardData;
  state: ClassState;
  timeIndicator: TimeIndicator | null;
  tabs: ClassPanelTabKey[];
  tab: ClassPanelTabKey;
  onTabChange: (next: ClassPanelTabKey) => void;
  /** Only the overlay has somewhere to close to. */
  showClose: boolean;
  onClose?: () => void;
}

/**
 * What this class is, and the three questions you can ask about it.
 *
 * Sticky, so the title and the tabs stay put while a long tab body scrolls
 * under them. Whichever ancestor owns the scroll (the drawer body, or the
 * planner column) gets that for free.
 */
export default function ClassPanelHeader({
  cls,
  state,
  timeIndicator,
  tabs,
  tab,
  onTabChange,
  showClose,
  onClose,
}: ClassPanelHeaderProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        bgcolor: 'background.paper',
        borderBottom: '3px solid',
        borderBottomColor: statusColors[state.displayStatus] || 'primary.main',
      }}
    >
      <Box sx={{ p: 2, pb: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {cls.title}
            </Typography>
            {/* Date and time in the header rather than as the first row of the
                Class tab: it is the one fact that stays true whichever tab you
                are reading, and a teacher on the After tab should not have to
                go back to find out which class they are looking at. */}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {formatDate(cls.scheduled_date)} · {formatTime(cls.start_time)} to{' '}
              {formatTime(cls.end_time)}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, mt: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip
                label={state.displayStatus === 'completed' && !state.isCompleted ? 'Done' : state.displayStatus}
                size="small"
                color={statusChipColor[state.displayStatus] || 'default'}
                variant="outlined"
                sx={{ textTransform: 'capitalize' }}
              />
              {state.isDraft && (
                <Box component="span" sx={tagSx(theme, 'neutral')}>
                  Draft
                </Box>
              )}
              {timeIndicator && (
                <Chip
                  icon={
                    state.isLive ? (
                      <FiberManualRecordIcon
                        sx={{ fontSize: '10px !important', animation: 'pulse 1.5s infinite' }}
                      />
                    ) : undefined
                  }
                  label={timeIndicator.label}
                  size="small"
                  color={timeIndicator.color}
                  variant="filled"
                  sx={{
                    fontWeight: 600,
                    '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
                  }}
                />
              )}
              {cls.classroom && (
                <Chip
                  label={cls.classroom.type === 'common' ? 'All Students' : cls.classroom.name}
                  size="small"
                  color={cls.classroom.type === 'common' ? 'warning' : 'default'}
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
          {showClose && (
            <IconButton onClick={onClose} aria-label="Close" sx={{ minWidth: 44, minHeight: 44 }}>
              <CloseIcon />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* One tab is no choice, so it is not drawn as one. That happens for a
          cancelled class, which has nothing to prepare and nothing to look back
          on. */}
      {tabs.length > 1 && (
        <Tabs
          value={tab}
          onChange={(_, next) => onTabChange(next as ClassPanelTabKey)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            px: 1,
            minHeight: 46,
            '& .MuiTab-root': { minHeight: 46, textTransform: 'none', fontWeight: 600 },
          }}
        >
          {tabs.map((key) => (
            <Tab key={key} value={key} label={TAB_LABELS[key]} />
          ))}
        </Tabs>
      )}
    </Box>
  );
}
