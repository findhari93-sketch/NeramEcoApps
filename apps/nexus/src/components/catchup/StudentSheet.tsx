'use client';

/**
 * One student's whole catch-up, on one sheet.
 *
 * Opened from a row on the Students view. A bottom sheet on a phone (thumb
 * reach, and the list stays visible behind it), a right drawer from md up.
 *
 * It answers the three questions a teacher asks about one person, in order:
 *   why are they behind      the diagnosis sentence at the top
 *   why did they miss it     each class's reason, wherever they gave it
 *   how are they working     how far in, on how many days, which check beats them
 * and puts the three things they can do (call, nudge, excuse) beside the answer.
 */
import {
  Box,
  Button,
  Drawer,
  IconButton,
  Stack,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import StudentAvatar from '@/components/students/StudentAvatar';
import { DIAGNOSIS_META } from '@/lib/catchup-diagnosis';
import { reasonShortLabel } from '@/lib/rsvp-reasons';
import { RADIUS } from '@/components/timetable/timetable-theme';
import { Gates, shortDate } from './shared';
import { useDiagnosisColor } from './StudentRow';
import type { Item, ItemAction, Row } from './types';

export interface StudentSheetProps {
  row: Row | null;
  onClose: () => void;
  busy: string | null;
  onAct: (itemId: string, action: ItemAction) => void;
  onNudge: (studentId: string, journeyId: string | null) => void;
}

/** Open work first (the one on the clock leading), then what is settled, oldest first within each. */
function order(items: Item[]): Item[] {
  const rank = (i: Item) =>
    i.active ? 0 : i.status === 'waiting' ? 1 : i.status === 'pending_teacher' || i.status === 'blocked' ? 2 : 3;
  return [...items].sort(
    (a, b) => rank(a) - rank(b) || a.class.scheduled_date.localeCompare(b.class.scheduled_date),
  );
}

export default function StudentSheet({ row, onClose, busy, onAct, onNudge }: StudentSheetProps) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const toneColor = useDiagnosisColor();

  const name = row ? row.student.name || row.student.email || 'Student' : '';
  const meta = row?.diagnosis ? DIAGNOSIS_META[row.diagnosis.state] : null;
  const items = row ? order(row.items) : [];

  return (
    <Drawer
      anchor={wide ? 'right' : 'bottom'}
      open={!!row}
      onClose={onClose}
      PaperProps={{
        // A Drawer's paper has no role of its own (unlike Dialog's), so screen
        // readers were told nothing when the sheet opened.
        role: 'dialog',
        'aria-modal': true,
        'aria-label': row ? `${name}, catch-up` : undefined,
        sx: wide
          ? { width: 480, maxWidth: '100%' }
          : { maxHeight: '90vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
      }}
    >
      {row && (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
          {!wide && (
            <Box aria-hidden sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1 }} />
          )}
          <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ p: 2, pb: 1.5 }}>
            <StudentAvatar userId={row.student.id} src={row.student.avatar_url} name={row.student.name || ''} size={44} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography component="h2" sx={{ fontWeight: 800, fontSize: '1.0625rem', lineHeight: 1.3 }}>
                {name}
              </Typography>
              {meta && (
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: toneColor(meta.tone) }}>
                  {meta.label}
                </Typography>
              )}
            </Box>
            <IconButton onClick={onClose} aria-label="Close" sx={{ width: 44, height: 44, mt: -0.5 }}>
              <CloseIcon />
            </IconButton>
          </Stack>

          <Box sx={{ px: 2, overflowY: 'auto', flex: 1, pb: 2 }}>
            {row.diagnosis && (
              <Box
                sx={{
                  p: 1.5,
                  mb: 1.5,
                  borderRadius: RADIUS.card,
                  bgcolor: alpha(meta ? toneColor(meta.tone) : theme.palette.text.secondary, 0.07),
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.5 }}>
                  {row.diagnosis.sentence}
                </Typography>
                {meta && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {meta.hint}
                  </Typography>
                )}
              </Box>
            )}

            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              {row.student.phone && (
                <Button
                  variant="outlined"
                  href={`tel:${row.student.phone}`}
                  startIcon={<PhoneOutlinedIcon />}
                  sx={{ flex: 1, minHeight: 44, textTransform: 'none', fontWeight: 700 }}
                >
                  Call
                </Button>
              )}
              {meta?.nudge && (
                <Button
                  variant="contained"
                  disabled={busy === row.student.id}
                  onClick={() => onNudge(row.student.id, row.journey_id)}
                  startIcon={<NotificationsActiveOutlinedIcon />}
                  sx={{ flex: 1, minHeight: 44, textTransform: 'none', fontWeight: 700 }}
                >
                  Nudge
                </Button>
              )}
            </Stack>

            <Typography
              component="h3"
              sx={{ fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}
            >
              Classes ({items.length})
            </Typography>
            <Stack spacing={1}>
              {items.map((item) => (
                <SheetItem key={item.id} item={item} busy={busy} onAct={onAct} />
              ))}
            </Stack>
          </Box>
        </Box>
      )}
    </Drawer>
  );
}

function SheetItem({
  item,
  busy,
  onAct,
}: {
  item: Item;
  busy: string | null;
  onAct: (itemId: string, action: ItemAction) => void;
}) {
  const theme = useTheme();
  const settled = item.status === 'done' || item.excused;
  const reason = item.reason ?? null;
  const late = item.kind === 'late_joiner';

  let clock: { text: string; bad: boolean } | null = null;
  if (item.overdue && typeof item.days_left === 'number' && item.days_left < 0) {
    clock = { text: `${-item.days_left} ${item.days_left === -1 ? 'day' : 'days'} over`, bad: true };
  } else if (item.overdue) {
    clock = { text: 'Ran over', bad: true };
  } else if (item.active && typeof item.days_left === 'number') {
    clock = { text: `${item.days_left} ${item.days_left === 1 ? 'day' : 'days'} left`, bad: false };
  }

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: RADIUS.control,
        border: '1px solid',
        borderColor: item.active ? alpha(theme.palette.primary.main, 0.4) : 'divider',
        bgcolor: settled ? alpha(theme.palette.text.disabled, 0.04) : 'background.paper',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {shortDate(item.class.scheduled_date)}
            {item.active ? ' · on the clock' : ''}
          </Typography>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: '0.875rem',
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              overflowWrap: 'anywhere',
            }}
          >
            {item.class.title || 'Class'}
          </Typography>
        </Box>
        <Box sx={{ pt: 0.5 }}>
          <Gates item={item} />
        </Box>
      </Stack>

      {/* Why they missed it. A late joiner has nothing to explain. */}
      <Typography variant="caption" sx={{ display: 'block', mt: 0.75, lineHeight: 1.45 }}>
        {late ? (
          <Box component="span" sx={{ color: 'text.secondary' }}>
            Taught before they joined
          </Box>
        ) : reason ? (
          <>
            <Box component="span" sx={{ fontWeight: 700 }}>
              {reasonShortLabel(reason.code)}
            </Box>
            {reason.note ? <Box component="span">{`: "${reason.note}"`}</Box> : null}
            <Box component="span" sx={{ color: 'text.secondary' }}>{` · ${reason.said}`}</Box>
          </>
        ) : (
          <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}>
            No reason given
          </Box>
        )}
      </Typography>

      {/* How they are working on it. */}
      {item.progress && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.45 }}>
          {item.progress}
        </Typography>
      )}

      <Stack direction="row" alignItems="center" sx={{ mt: 0.5 }}>
        {clock && (
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: clock.bad ? 'error.main' : 'text.secondary', flex: 1 }}
          >
            {clock.text}
          </Typography>
        )}
        <Box sx={{ flex: clock ? 0 : 1 }} />
        {item.status !== 'done' && (
          <Button
            size="small"
            disabled={busy === item.id}
            onClick={() => onAct(item.id, item.excused ? 'restore' : 'excuse')}
            sx={{ textTransform: 'none', minHeight: 44, minWidth: 76 }}
          >
            {item.excused ? 'Restore' : 'Excuse'}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
