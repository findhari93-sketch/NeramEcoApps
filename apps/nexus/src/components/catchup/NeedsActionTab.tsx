'use client';

/**
 * Who to call today, and where each of them is stuck.
 *
 * The chase list is unchanged in spirit: overdue and behind-pace pinned to the
 * top, phone number one tap away.
 *
 * What changed is underneath it. The per-student breakdown used to render as an
 * expandable card on mobile and a student x class matrix on desktop, and only
 * the card carried the reason line. So a teacher on a laptop, which is where
 * most of this work happens, saw three dots and never learned that the student
 * had already explained themselves. The cards are now the default at every
 * width and the matrix is an opt-in density, not a breakpoint accident.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Collapse,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  UserAvatar,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import { describeReason, reasonShortLabel } from '@/lib/rsvp-reasons';
import { RADIUS } from '@/components/timetable/timetable-theme';
import { Gates, SECTION_HEADING_SX, owedLine, shortDate } from './shared';
import type { Item, Row, TabProps } from './types';

const VIEW_STORAGE_KEY = 'nexus:catchup:view';

/**
 * Everything worth saying out loud on the call: when it was, what they said in
 * their own words, and how late it is. `describeReason` prefers the typed note
 * over the category, because "Hospital visit" says more than "Family".
 */
function itemLine(item: Item): string {
  const bits = [shortDate(item.class.scheduled_date)];
  if (item.reason_code) {
    const said = describeReason(item.reason_code, item.reason_note);
    bits.push(item.reason_note ? `"${said}"` : said);
  }
  // Only the class they actually started has a clock. Saying "due" about one
  // they have not touched was how every card ended up looking late.
  if (item.overdue) {
    bits.push(`ran over ${item.due_on ? shortDate(item.due_on) : ''}`.trim());
  } else if (item.active && item.due_on) {
    bits.push(
      typeof item.days_left === 'number'
        ? `${item.days_left === 1 ? '1 day' : `${item.days_left} days`} left`
        : `due ${shortDate(item.due_on)}`,
    );
  } else {
    bits.push('not started');
  }
  return bits.join(' · ');
}

export default function NeedsActionTab({ data, busy, onAct, onNudge }: TabProps) {
  const theme = useTheme();
  const canShowMatrix = useMediaQuery(theme.breakpoints.up('md'));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView] = useState<'cards' | 'matrix'>('cards');

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'matrix' || saved === 'cards') setView(saved);
  }, []);

  // Run over, or stalled: work owed with no clock running on any of it. The
  // second one is the important addition. Counting overdue items used to surface
  // whoever had the most, but with one clock at a time that count tops out at 1,
  // and a student who has started nothing would otherwise look identical to one
  // who is halfway through.
  const needsAttention = useMemo(
    () =>
      data.students.filter(
        (s) => s.clock?.overdue || s.clock?.stalled || s.pace.state === 'behind',
      ),
    [data.students],
  );
  const rest = useMemo(
    () => data.students.filter((s) => !needsAttention.includes(s)),
    [data.students, needsAttention],
  );

  const showMatrix = canShowMatrix && view === 'matrix';

  const studentRow = (s: Row, flagged: boolean) => (
    <Box
      key={s.student.id}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        borderRadius: RADIUS.control,
        border: '1px solid',
        borderColor: flagged ? alpha(theme.palette.error.main, 0.4) : 'divider',
        bgcolor: flagged ? alpha(theme.palette.error.main, 0.05) : 'background.paper',
        flexWrap: 'wrap',
      }}
    >
      <UserAvatar src={s.student.avatar_url} name={s.student.name || ''} size={38} />
      <Box sx={{ flex: 1, minWidth: 140 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
          {s.student.name || s.student.email || 'Student'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {owedLine(s)}
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.75}>
        {s.student.phone && (
          <Button
            size="small"
            variant="outlined"
            href={`tel:${s.student.phone}`}
            startIcon={<PhoneOutlinedIcon />}
            sx={{ minHeight: 40, textTransform: 'none' }}
          >
            Call
          </Button>
        )}
        <Button
          size="small"
          variant="contained"
          disabled={busy === s.student.id}
          onClick={() => onNudge(s.student.id, s.journey_id)}
          sx={{ minHeight: 40, textTransform: 'none' }}
        >
          Nudge
        </Button>
      </Stack>
    </Box>
  );

  return (
    <>
      {data.students.length === 0 && (
        <Alert severity="success" sx={{ borderRadius: 2 }}>
          Nobody is behind. Every student has cleared the classes they missed.
        </Alert>
      )}

      {needsAttention.length > 0 && (
        <Box sx={{ mb: 3.5 }}>
          <Typography sx={{ ...SECTION_HEADING_SX, color: 'error.main' }}>Call these first</Typography>
          <Stack spacing={1}>{needsAttention.map((s) => studentRow(s, true))}</Stack>
        </Box>
      )}

      {rest.length > 0 && (
        <Box sx={{ mb: 3.5 }}>
          <Typography sx={SECTION_HEADING_SX}>Everyone else catching up</Typography>
          <Stack spacing={1}>{rest.map((s) => studentRow(s, false))}</Stack>
        </Box>
      )}

      {data.students.length > 0 && (
        <Box sx={{ mb: 3.5 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 1, gap: 1 }}
          >
            <Typography sx={{ ...SECTION_HEADING_SX, mb: 0 }}>Where each one is stuck</Typography>
            {canShowMatrix && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={view}
                onChange={(_e, v) => {
                  if (!v) return;
                  setView(v);
                  window.localStorage.setItem(VIEW_STORAGE_KEY, v);
                }}
                aria-label="How to show the breakdown"
              >
                <ToggleButton value="cards" aria-label="One card per student" sx={{ px: 1.25 }}>
                  <ViewAgendaOutlinedIcon sx={{ fontSize: 18 }} />
                </ToggleButton>
                <ToggleButton value="matrix" aria-label="Grid of every class" sx={{ px: 1.25 }}>
                  <GridOnOutlinedIcon sx={{ fontSize: 18 }} />
                </ToggleButton>
              </ToggleButtonGroup>
            )}
          </Stack>

          {!showMatrix ? (
            <Stack spacing={1}>
              {data.students.map((s) => {
                const open = expanded === s.student.id;
                return (
                  <Box
                    key={s.student.id}
                    sx={{
                      borderRadius: RADIUS.control,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                    }}
                  >
                    <Box
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpanded(open ? null : s.student.id)}
                      onKeyDown={(e) => e.key === 'Enter' && setExpanded(open ? null : s.student.id)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        p: 1.5,
                        minHeight: 56,
                        cursor: 'pointer',
                      }}
                    >
                      <UserAvatar src={s.student.avatar_url} name={s.student.name || ''} size={32} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }} noWrap>
                          {s.student.name || s.student.email || 'Student'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {owedLine(s)}
                        </Typography>
                      </Box>
                      <ExpandMoreIcon
                        sx={{
                          color: 'text.disabled',
                          transform: open ? 'rotate(180deg)' : 'none',
                          transition: 'transform 200ms ease',
                        }}
                      />
                    </Box>
                    <Collapse in={open} unmountOnExit>
                      <Stack spacing={0.5} sx={{ px: 1.5, pb: 1.5 }}>
                        {s.items.map((item) => (
                          <Box
                            key={item.id}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              py: 0.75,
                              borderTop: '1px solid',
                              borderColor: 'divider',
                              flexWrap: 'wrap',
                            }}
                          >
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                {item.class.title || 'Class'}
                              </Typography>
                              <Typography
                                variant="caption"
                                color={item.overdue ? 'error.main' : 'text.disabled'}
                                sx={{ display: 'block' }}
                              >
                                {itemLine(item)}
                              </Typography>
                            </Box>
                            <Gates item={item} />
                            <Button
                              size="small"
                              disabled={busy === item.id}
                              onClick={() => onAct(item.id, item.excused ? 'restore' : 'excuse')}
                              sx={{ textTransform: 'none', minHeight: 40, minWidth: 72 }}
                            >
                              {item.excused ? 'Restore' : 'Excuse'}
                            </Button>
                          </Box>
                        ))}
                      </Stack>
                    </Collapse>
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                <Box component="thead">
                  <Box component="tr">
                    <Box
                      component="th"
                      sx={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                        bgcolor: 'background.paper',
                        textAlign: 'left',
                        p: 1.25,
                        minWidth: 190,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        fontSize: '0.75rem',
                      }}
                    >
                      Student
                    </Box>
                    {data.classes.map((c) => (
                      <Box
                        key={c.id}
                        component="th"
                        title={c.title || ''}
                        sx={{
                          p: 1.25,
                          minWidth: 92,
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: 'text.secondary',
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {shortDate(c.scheduled_date)}
                      </Box>
                    ))}
                  </Box>
                </Box>
                <Box component="tbody">
                  {data.students.map((s) => (
                    <Box component="tr" key={s.student.id}>
                      <Box
                        component="td"
                        sx={{
                          position: 'sticky',
                          left: 0,
                          zIndex: 1,
                          bgcolor: 'background.paper',
                          p: 1.25,
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <UserAvatar src={s.student.avatar_url} name={s.student.name || ''} size={28} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.82rem' }} noWrap>
                              {s.student.name || s.student.email || 'Student'}
                            </Typography>
                            <Typography variant="caption" color="text.disabled">
                              {s.missedTotals.completed + s.totals.completed}/
                              {s.missedTotals.total + s.totals.total}
                            </Typography>
                          </Box>
                        </Stack>
                      </Box>
                      {data.classes.map((c) => {
                        const item = s.items.find((i) => i.scheduled_class_id === c.id);
                        return (
                          <Box
                            key={c.id}
                            component="td"
                            title={item ? itemLine(item) : ''}
                            sx={{
                              p: 1.25,
                              textAlign: 'center',
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                              bgcolor: item?.overdue
                                ? alpha(theme.palette.error.main, 0.06)
                                : 'transparent',
                            }}
                          >
                            {item ? <Gates item={item} /> : null}
                          </Box>
                        );
                      })}
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          )}

          {showMatrix && (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
              The grid shows progress only. Switch back to cards to read what each student said,
              including anyone who chose {reasonShortLabel('other').toLowerCase()}.
            </Typography>
          )}
        </Box>
      )}
    </>
  );
}
