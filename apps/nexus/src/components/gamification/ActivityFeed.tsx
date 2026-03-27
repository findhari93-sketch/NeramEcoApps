'use client';

import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  alpha,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import MilitaryTechOutlinedIcon from '@mui/icons-material/MilitaryTechOutlined';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import StarOutlinedIcon from '@mui/icons-material/StarOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import CardGiftcardOutlinedIcon from '@mui/icons-material/CardGiftcardOutlined';
import type {
  GamificationStudentActivityLog,
  GamificationActivityType,
} from '@neram/database/types';
import {
  neramTokens,
  neramFontFamilies,
} from '@neram/ui';

// ── Activity type icon mapping ──

const ACTIVITY_ICONS: Record<GamificationActivityType, React.ReactNode> = {
  checklist_completed: (
    <CheckCircleOutlineIcon sx={{ color: neramTokens.success, fontSize: '1.25rem' }} />
  ),
  checklist_item_completed: (
    <CheckCircleOutlineIcon sx={{ color: neramTokens.success, fontSize: '1.25rem' }} />
  ),
  drawing_submitted: (
    <BrushOutlinedIcon sx={{ color: neramTokens.blue[500], fontSize: '1.25rem' }} />
  ),
  drawing_reviewed: (
    <BrushOutlinedIcon sx={{ color: neramTokens.blue[400], fontSize: '1.25rem' }} />
  ),
  badge_earned: (
    <MilitaryTechOutlinedIcon sx={{ color: neramTokens.gold[500], fontSize: '1.25rem' }} />
  ),
  streak_milestone: (
    <LocalFireDepartmentIcon sx={{ color: '#ff6b35', fontSize: '1.25rem' }} />
  ),
  class_attended: (
    <EventAvailableOutlinedIcon sx={{ color: neramTokens.success, fontSize: '1.25rem' }} />
  ),
  rank_improved: (
    <TrendingUpOutlinedIcon sx={{ color: neramTokens.blue[500], fontSize: '1.25rem' }} />
  ),
  manual_award: (
    <CardGiftcardOutlinedIcon sx={{ color: neramTokens.gold[500], fontSize: '1.25rem' }} />
  ),
};

// ── Date grouping helpers ──

function getDateLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function groupByDate(
  activities: GamificationStudentActivityLog[]
): { label: string; items: GamificationStudentActivityLog[] }[] {
  const groups = new Map<string, GamificationStudentActivityLog[]>();

  for (const activity of activities) {
    const label = getDateLabel(activity.activity_date);
    const existing = groups.get(label);
    if (existing) {
      existing.push(activity);
    } else {
      groups.set(label, [activity]);
    }
  }

  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items,
  }));
}

// ── Props ──

interface ActivityFeedProps {
  activities: GamificationStudentActivityLog[];
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  const grouped = groupByDate(activities);

  if (activities.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography
          sx={{
            fontFamily: neramFontFamilies.body,
            fontSize: '0.85rem',
            color: alpha(neramTokens.cream[100], 0.4),
          }}
        >
          No recent activity
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography
        sx={{
          fontFamily: neramFontFamilies.serif,
          fontSize: '1rem',
          fontWeight: 600,
          color: neramTokens.cream[100],
          mb: 1.5,
        }}
      >
        Recent Activity
      </Typography>

      {grouped.map((group, groupIdx) => (
        <Box key={group.label}>
          {/* Date header */}
          <Typography
            sx={{
              fontFamily: neramFontFamilies.body,
              fontSize: '0.7rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: alpha(neramTokens.cream[100], 0.5),
              mt: groupIdx > 0 ? 2 : 0,
              mb: 0.5,
              px: 1,
            }}
          >
            {group.label}
          </Typography>

          <List disablePadding>
            {group.items.map((activity, idx) => (
              <Box key={activity.id}>
                <ListItem
                  disableGutters
                  sx={{
                    px: 1,
                    py: 0.75,
                    minHeight: 48,
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 36,
                    }}
                  >
                    {ACTIVITY_ICONS[activity.activity_type] || (
                      <StarOutlinedIcon
                        sx={{
                          color: alpha(neramTokens.cream[100], 0.4),
                          fontSize: '1.25rem',
                        }}
                      />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={activity.title}
                    secondary={formatTime(activity.activity_date)}
                    primaryTypographyProps={{
                      sx: {
                        fontFamily: neramFontFamilies.body,
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        color: neramTokens.cream[100],
                        lineHeight: 1.3,
                      },
                    }}
                    secondaryTypographyProps={{
                      sx: {
                        fontFamily: neramFontFamilies.body,
                        fontSize: '0.7rem',
                        color: alpha(neramTokens.cream[100], 0.4),
                        mt: 0.25,
                      },
                    }}
                  />
                </ListItem>
                {idx < group.items.length - 1 && (
                  <Divider
                    sx={{
                      borderColor: alpha(neramTokens.cream[100], 0.06),
                      ml: 5,
                    }}
                  />
                )}
              </Box>
            ))}
          </List>
        </Box>
      ))}
    </Box>
  );
}
