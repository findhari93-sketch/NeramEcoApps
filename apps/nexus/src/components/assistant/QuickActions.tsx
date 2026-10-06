'use client';

import { Box, ListItemButton, ListItemIcon, ListItemText, Typography } from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import { EXPLAIN_THIS, HINT_THIS } from '@/lib/assistant/page-suggestions';

export interface QuickAction { label: string; hint: string; icon: React.ReactNode; onPick: () => void }

/** What the maths tutor can offer here: a question open on screen, the bank in general, or nothing (bank off). */
export type ExamHelp = 'question' | 'bank' | null;


/**
 * The empty-panel menu. Rows, not tiles: they read as a list on a phone.
 * `sketchbook` is the student.sketchbook flag: with it off, Add a sketch is not offered (Ruling 25).
 * `exam` puts the maths tutor in view: with a bank question open, Explain and Hint lead the list;
 * elsewhere one row puts the cursor in the message box, since a maths question has to be typed.
 */
export default function QuickActions({ onSend, onReport, sketchbook, exam = null, onAsk }: {
  onSend: (text: string) => void; onReport: () => void; sketchbook: boolean; exam?: ExamHelp; onAsk?: () => void;
}) {
  const tutor: QuickAction[] = exam === 'question'
    ? [
      { label: 'Explain this question', hint: 'Step by step. The answer once you have tried it', icon: <SchoolOutlinedIcon />, onPick: () => onSend(EXPLAIN_THIS) },
      { label: 'Give me a hint', hint: 'A nudge in the right direction, not the answer', icon: <LightbulbOutlinedIcon />, onPick: () => onSend(HINT_THIS) },
    ]
    : exam === 'bank' && onAsk
      ? [{ label: 'Ask a maths or exam question', hint: 'Formulas, chapters, past paper questions', icon: <CalculateOutlinedIcon />, onPick: onAsk }]
      : [];
  const items: QuickAction[] = [
    ...(exam === 'question' ? tutor : []),
    { label: "What's on today?", hint: 'Your classes, work due and reminders', icon: <TodayOutlinedIcon />, onPick: () => onSend("What's on today?") },
    ...(exam === 'bank' ? tutor : []),
    { label: "I can't attend a class", hint: 'Tell your teacher, one class or several days', icon: <EventBusyOutlinedIcon />, onPick: () => onSend("I can't attend a class") },
    { label: 'Remind me', hint: 'It shows on your brief card that day', icon: <NotificationsNoneOutlinedIcon />, onPick: () => onSend('Remind me') },
    ...(sketchbook ? [{ label: 'Add a sketch', hint: 'Snap it and it goes in your sketchbook', icon: <BrushOutlinedIcon />, onPick: () => onSend('Add a sketch') }] : []),
    { label: 'Report a problem', hint: 'Something on this page is not right', icon: <BugReportOutlinedIcon />, onPick: onReport },
  ];
  return (
    <Box sx={{ px: 1, py: 0.75 }}>
      <Typography id="assistant-quick-actions" variant="caption" sx={{ px: 1.5, pb: 0.25, display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'text.secondary' }}>What I can do</Typography>
      <Box role="list" aria-labelledby="assistant-quick-actions" sx={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((it) => (
          <Box key={it.label} role="listitem">
            <ListItemButton onClick={it.onPick} sx={{ borderRadius: 2, minHeight: 48, px: 1.5, py: 0.5 }}>
              <ListItemIcon sx={{ minWidth: 36, color: 'primary.main', '& svg': { fontSize: 20 } }}>{it.icon}</ListItemIcon>
              <ListItemText
                primary={it.label}
                secondary={it.hint}
                sx={{ my: 0.25 }}
                primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.35 }}
                secondaryTypographyProps={{ fontSize: '0.8125rem', lineHeight: 1.35 }}
              />
            </ListItemButton>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
