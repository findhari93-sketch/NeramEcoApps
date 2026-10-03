'use client';

import { Box, ListItemButton, ListItemIcon, ListItemText, Typography } from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';

export interface QuickAction { label: string; hint: string; icon: React.ReactNode; onPick: () => void }

/** The empty-panel menu. Rows, not tiles: five of them read as a list on a phone. */
export default function QuickActions({ onSend, onReport }: { onSend: (text: string) => void; onReport: () => void }) {
  const items: QuickAction[] = [
    { label: "What's on today?", hint: 'Your classes, work due and reminders', icon: <TodayOutlinedIcon />, onPick: () => onSend("What's on today?") },
    { label: "I can't attend a class", hint: 'Tell your teacher, one class or several days', icon: <EventBusyOutlinedIcon />, onPick: () => onSend("I can't attend a class") },
    { label: 'Remind me', hint: 'A reminder on the day you choose', icon: <NotificationsNoneOutlinedIcon />, onPick: () => onSend('Remind me') },
    { label: 'Add a sketch', hint: 'Snap it and it goes in your sketchbook', icon: <BrushOutlinedIcon />, onPick: () => onSend('Add a sketch') },
    { label: 'Report a problem', hint: 'Something on this page is not right', icon: <BugReportOutlinedIcon />, onPick: onReport },
  ];
  return (
    <Box sx={{ px: 1, py: 1 }}>
      <Typography id="assistant-quick-actions" variant="caption" sx={{ px: 1.5, pb: 0.5, display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'text.secondary' }}>What I can do</Typography>
      <Box role="list" aria-labelledby="assistant-quick-actions" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {items.map((it) => (
          <Box key={it.label} role="listitem">
            <ListItemButton onClick={it.onPick} sx={{ borderRadius: 2, minHeight: 56, px: 1.5 }}>
              <ListItemIcon sx={{ minWidth: 40, color: 'primary.main' }}>{it.icon}</ListItemIcon>
              <ListItemText primary={it.label} secondary={it.hint} primaryTypographyProps={{ fontWeight: 600 }} />
            </ListItemButton>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
