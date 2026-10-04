'use client';

/**
 * The answer bars, with the names behind each bar: who picked B, who got it
 * wrong, who said nothing. Hovering a bar shows the names (desktop); tapping it
 * lists them under the bar, which also works on a phone, with a keyboard and
 * with a screen reader. After Reveal the right answer is marked and the other
 * bars read as wrong.
 */

import { useEffect, useState } from 'react';
import { Box, Button, Chip, Stack, Tooltip, Typography, alpha, useTheme } from '@neram/ui';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import StudentAvatar from '@/components/students/StudentAvatar';
import { displayAnswer } from '@/lib/pad/client/format';
import { padFetch } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import { foldAnswers, namesByAnswer, namesPreview, stacksAnswerLabels, unansweredNames } from '@/lib/pad/client/teacher-view';
import type { AnswerType, ParticipationRow, PromptState } from '@/lib/pad/client/types';
import { HideNamesButton, useHideNames } from './HideNames';

export interface OptionNamesPrompt {
  id: string;
  answer_type: AnswerType;
  option_count: number | null;
  correct_keys: string[] | null;
  ungraded: boolean;
  state: PromptState;
  /** Any change to the prompt refetches the names. */
  version?: number;
}

interface BarRow {
  key: string;
  label: string;
  count: number;
  names: ParticipationRow[];
  tone: 'plain' | 'right' | 'wrong' | 'muted';
}

export default function OptionNames({
  host,
  prompt,
  groups,
  refreshKey,
}: {
  host: PadHost;
  prompt: OptionNamesPrompt;
  /** The counts the snapshot already has, so the bars draw before the names arrive. */
  groups: ReadonlyArray<{ value: string; count: number }>;
  /** Changes whenever the answers may have changed (the snapshot's server time is a good one). */
  refreshKey?: string | number;
}) {
  const theme = useTheme();
  const [rows, setRows] = useState<ParticipationRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hidden, setHidden] = useHideNames();
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    padFetch<{ rows: ParticipationRow[] }>(host, `/api/pad/prompts/${prompt.id}/participation`)
      .then((data) => active && setRows(data.rows))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [host, prompt.id, prompt.version, prompt.state, refreshKey]);

  const revealed = prompt.state === 'revealed' && !prompt.ungraded;
  const keys = new Set(prompt.correct_keys ?? []);
  const fromCounts = new Map(groups.map((group) => [group.value, group.count]));
  const bars: BarRow[] = namesByAnswer(prompt, rows ?? []).map((answer) => ({
    key: answer.value,
    label: displayAnswer(prompt.answer_type, answer.value),
    count: rows ? answer.count : (fromCounts.get(answer.value) ?? 0),
    names: answer.names,
    tone: !revealed ? 'plain' : keys.has(answer.value) ? 'right' : 'wrong',
  }));
  // Typed answers draw from the snapshot's counts until the names arrive.
  if (!rows && prompt.answer_type !== 'mcq' && prompt.answer_type !== 'yesno') {
    for (const group of groups) bars.push({ key: group.value, label: displayAnswer(prompt.answer_type, group.value), count: group.count, names: [], tone: 'plain' });
  }
  const others = rows ? unansweredNames(rows) : { silent: [], excused: [] };
  const extra: BarRow[] = [
    { key: '__silent', label: 'No answer', count: others.silent.length, names: others.silent, tone: 'muted' as const },
    { key: '__excused', label: 'Excused', count: others.excused.length, names: others.excused, tone: 'muted' as const },
  ].filter((row) => row.count > 0);

  const max = Math.max(1, ...bars.map((bar) => bar.count));
  const colour = (tone: BarRow['tone']) =>
    tone === 'right' ? theme.palette.success.main : tone === 'wrong' ? theme.palette.error.main : tone === 'muted' ? theme.palette.text.secondary : theme.palette.primary.main;

  if (bars.every((bar) => bar.count === 0) && extra.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Nobody answered this one.
      </Typography>
    );
  }

  // A typed sentence gets its own line above the bar; a letter sits beside it.
  const stacked = stacksAnswerLabels(bars.map((bar) => bar.label));
  const { shown, folded } = foldAnswers(prompt.answer_type, bars);
  const visible = showAll ? bars : shown;

  const track = (bar: BarRow) => (
    <Box sx={{ flex: 1, minWidth: 24, height: 12, borderRadius: 6, bgcolor: alpha(theme.palette.text.primary, 0.08) }} aria-hidden>
      <Box sx={{ width: `${(bar.count / max) * 100}%`, height: '100%', borderRadius: 6, bgcolor: colour(bar.tone) }} />
    </Box>
  );
  const count = (bar: BarRow) => (
    <Typography component="span" sx={{ minWidth: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
      {bar.count}
    </Typography>
  );

  const renderRow = (bar: BarRow, drawBar: boolean) => {
    const isOpen = expanded === bar.key;
    const tip = hidden ? 'Names are hidden' : rows ? namesPreview(bar.names) : 'Loading names';
    const spoken = `${bar.label}: ${bar.count}${bar.tone === 'right' ? ', correct answer' : ''}`;
    const label = (
      <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ minWidth: 0, ...(stacked || !drawBar ? { flex: drawBar ? 'none' : 1 } : { width: 48, flexShrink: 0 }) }}>
        {bar.tone === 'right' && <CheckCircleRounded fontSize="small" sx={{ color: colour('right'), mt: '2px' }} aria-hidden />}
        <Typography
          component="span"
          sx={{
            fontWeight: 700,
            minWidth: 0,
            overflowWrap: 'anywhere',
            // Two lines at most until the row is opened; then the whole answer.
            ...(!isOpen && {
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }),
          }}
          color={bar.tone === 'muted' ? 'text.secondary' : 'text.primary'}
        >
          {bar.label}
        </Typography>
      </Stack>
    );
    return (
      <Box component="li" key={bar.key} sx={{ listStyle: 'none' }}>
        <Tooltip title={bar.count > 0 ? tip : ''} placement="top" enterDelay={300} disableTouchListener>
          <Box
            component="button"
            type="button"
            onClick={() => setExpanded(isOpen ? null : bar.key)}
            aria-expanded={isOpen}
            aria-label={`${spoken}. ${isOpen ? 'Hide' : 'Show'} who`}
            disabled={bar.count === 0}
            sx={{
              width: '100%',
              minHeight: 44,
              display: 'flex',
              flexDirection: stacked && drawBar ? 'column' : 'row',
              alignItems: stacked && drawBar ? 'stretch' : 'center',
              gap: stacked && drawBar ? 0.5 : 1,
              px: 0.5,
              py: stacked && drawBar ? 0.75 : 0,
              border: 0,
              borderRadius: 1.5,
              background: 'none',
              color: 'inherit',
              font: 'inherit',
              textAlign: 'left',
              cursor: bar.count > 0 ? 'pointer' : 'default',
              '&:hover:not(:disabled)': { bgcolor: 'action.hover' },
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
            }}
          >
            {stacked && drawBar ? (
              <>
                {label}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                  {track(bar)}
                  {count(bar)}
                </Stack>
              </>
            ) : (
              <>
                {label}
                {drawBar ? track(bar) : null}
                {count(bar)}
              </>
            )}
          </Box>
        </Tooltip>
        {isOpen && (
          <Box sx={{ pl: 1, pb: 1 }}>
            {hidden ? (
              <Typography variant="caption" color="text.secondary">
                Names are hidden.
              </Typography>
            ) : !rows ? (
              <Typography variant="caption" color="text.secondary">
                {failed ? 'The names could not load. Try again in a moment.' : 'Loading names'}
              </Typography>
            ) : (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" role="list" aria-label={`Who ${bar.tone === 'muted' ? 'is' : 'answered'} ${bar.label}`}>
                {bar.names.map((person) => (
                  <Chip
                    key={person.student_id}
                    role="listitem"
                    size="small"
                    variant="outlined"
                    avatar={<StudentAvatar userId={person.student_id} name={person.name ?? ''} size={24} />}
                    label={person.skip_reason && bar.key === '__silent' ? `${person.name ?? 'Unnamed student'} (said a reason)` : (person.name ?? 'Unnamed student')}
                    sx={{ maxWidth: '100%', height: 'auto', minHeight: 32, '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 } }}
                  />
                ))}
              </Stack>
            )}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Stack spacing={0.25}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">
          {hidden ? 'Answers' : 'Answers. Tap one to see who.'}
        </Typography>
        <HideNamesButton hidden={hidden} onChange={setHidden} />
      </Stack>
      <Box component="ul" aria-label="Answers given" sx={{ m: 0, p: 0 }}>
        {visible.map((bar) => renderRow(bar, true))}
        {extra.map((bar) => renderRow(bar, false))}
      </Box>
      {folded.length > 0 && (
        <Button size="small" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
          {showAll ? 'Show the top answers only' : `${folded.length} other ${folded.length === 1 ? 'answer' : 'answers'}`}
        </Button>
      )}
    </Stack>
  );
}
