'use client';

import { memo, useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Box, Typography, alpha, useTheme } from '@neram/ui';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import type { NexusQBQuestionListItem } from '@neram/database';
import { qbSectionLabel } from '@neram/database';
import { STATUS_SPEECH, statusOf, type QuestionStatus } from './practice-logic';

interface QuestionPaletteProps {
  questions: NexusQBQuestionListItem[];
  numbers: Map<string, number>;
  /**
   * The letter after the number for an option of an either-or drawing, so the
   * two halves of Q81 read "81A" and "81B". Absent for every other question.
   */
  suffixes?: Map<string, string>;
  currentId: string | null;
  onOpen: (id: string) => void;
  /** Selecting for a test: a tap toggles the question instead of opening it. */
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  /** Keep the current cell in view as it changes (the laptop rail). */
  autoReveal?: boolean;
  /** Show the legend under the grid. */
  legend?: boolean;
}

/**
 * The paper as a grid of numbers, the way the JEE computer-based test shows it.
 *
 * A student looking for question 18 finds it in one glance and one tap, with no
 * scrolling through two-line previews. Colour and a glyph both carry the
 * status, so it reads without colour too, and each cell says it aloud:
 * "Question 18, answered wrong".
 *
 * One tab stop for the whole grid (roving tabindex): Tab lands on the current
 * question, the arrow keys move between cells, Home and End jump to the ends.
 */
function QuestionPalette({
  questions,
  numbers,
  suffixes,
  currentId,
  onOpen,
  selecting = false,
  selectedIds,
  onToggleSelect,
  autoReveal = false,
  legend = true,
}: QuestionPaletteProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Sections, in paper order, but only when a paper actually has more than one.
  const groups = useMemo(() => {
    const out: { key: string; label: string | null; items: NexusQBQuestionListItem[] }[] = [];
    for (const q of questions) {
      const key = q.section ?? '';
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(q);
      else out.push({ key, label: q.section ? qbSectionLabel(q.section) : null, items: [q] });
    }
    return out.length > 1 ? out : [{ key: 'all', label: null, items: questions }];
  }, [questions]);

  const tabStopId = currentId && questions.some((q) => q.id === currentId) ? currentId : questions[0]?.id;

  useEffect(() => {
    if (!autoReveal || !currentId) return;
    const cell = rootRef.current?.querySelector<HTMLElement>(`[data-qid="${currentId}"]`);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    cell?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [autoReveal, currentId]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const cells = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[data-qid]') ?? []);
    const from = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (from < 0) return;
    let to = -1;
    if (e.key === 'ArrowRight') to = Math.min(from + 1, cells.length - 1);
    else if (e.key === 'ArrowLeft') to = Math.max(from - 1, 0);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = cells.length - 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // The cell straight below or above, whatever the column count is today.
      const here = cells[from].getBoundingClientRect();
      const down = e.key === 'ArrowDown';
      const candidates = cells
        .map((cell, idx) => ({ idx, rect: cell.getBoundingClientRect() }))
        .filter(({ rect }) => (down ? rect.top > here.top + 2 : rect.top < here.top - 2));
      if (candidates.length) {
        const rowTop = down
          ? Math.min(...candidates.map((c) => c.rect.top))
          : Math.max(...candidates.map((c) => c.rect.top));
        const row = candidates.filter((c) => Math.abs(c.rect.top - rowTop) < 2);
        row.sort((a, b) => Math.abs(a.rect.left - here.left) - Math.abs(b.rect.left - here.left));
        to = row[0].idx;
      }
    } else return;
    e.preventDefault();
    if (to >= 0) cells[to].focus();
  }, []);

  const counts = useMemo(() => {
    const c: Record<QuestionStatus, number> = { unanswered: 0, right: 0, wrong: 0 };
    for (const q of questions) c[statusOf(q.attempt_summary)] += 1;
    return c;
  }, [questions]);

  return (
    <Box ref={rootRef} onKeyDown={onKeyDown} data-roving>
      {groups.map((group) => (
        <Box key={group.key} sx={{ mb: 1.5 }} role="group" aria-label={group.label ?? 'Questions'}>
          {group.label && (
            <Typography
              variant="caption"
              component="h3"
              sx={{ display: 'block', fontWeight: 700, color: 'text.secondary', mb: 0.75, letterSpacing: 0.2 }}
            >
              {group.label}
            </Typography>
          )}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
              gap: 1,
            }}
          >
            {group.items.map((q) => (
              <PaletteCell
                key={q.id}
                id={q.id}
                label={`${numbers.get(q.id) ?? 0}${suffixes?.get(q.id) ?? ''}`}
                status={statusOf(q.attempt_summary)}
                current={q.id === currentId}
                tabStop={q.id === tabStopId}
                selecting={selecting}
                selected={!!selectedIds?.has(q.id)}
                onOpen={onOpen}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </Box>
        </Box>
      ))}

      {legend && questions.length > 0 && <PaletteLegend counts={counts} />}
    </Box>
  );
}

export default memo(QuestionPalette);

// ─── One cell ────────────────────────────────────────────────────────────────

interface PaletteCellProps {
  id: string;
  label: string;
  status: QuestionStatus;
  current: boolean;
  tabStop: boolean;
  selecting: boolean;
  selected: boolean;
  onOpen: (id: string) => void;
  onToggleSelect?: (id: string) => void;
}

const PaletteCell = memo(function PaletteCell({
  id,
  label,
  status,
  current,
  tabStop,
  selecting,
  selected,
  onOpen,
  onToggleSelect,
}: PaletteCellProps) {
  const theme = useTheme();
  const tone =
    status === 'right'
      ? { bg: theme.palette.success.main, fg: theme.palette.success.contrastText, border: theme.palette.success.main }
      : status === 'wrong'
        ? { bg: theme.palette.error.main, fg: theme.palette.error.contrastText, border: theme.palette.error.main }
        : { bg: theme.palette.background.paper, fg: theme.palette.text.primary, border: theme.palette.divider };

  const name = selecting
    ? `Question ${label}${selected ? ', selected for the test' : ''}`
    : `Question ${label}, ${STATUS_SPEECH[status]}`;

  return (
    <Box
      component="button"
      type="button"
      data-qid={id}
      tabIndex={tabStop ? 0 : -1}
      aria-label={name}
      aria-current={current && !selecting ? 'true' : undefined}
      aria-pressed={selecting ? selected : undefined}
      onClick={() => (selecting ? onToggleSelect?.(id) : onOpen(id))}
      sx={{
        position: 'relative',
        minWidth: 44,
        height: 44,
        p: 0,
        m: 0,
        fontFamily: 'inherit',
        fontSize: '0.9375rem',
        fontWeight: current ? 800 : 600,
        fontVariantNumeric: 'tabular-nums',
        color: tone.fg,
        bgcolor: tone.bg,
        border: '1px solid',
        borderColor: tone.border,
        borderRadius: '10px',
        cursor: 'pointer',
        transition: 'background-color 150ms ease, box-shadow 150ms ease',
        boxShadow: current ? `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${theme.palette.primary.main}` : 'none',
        '&:hover': {
          bgcolor: status === 'unanswered' ? alpha(theme.palette.primary.main, 0.08) : tone.bg,
          filter: status === 'unanswered' ? 'none' : 'brightness(0.95)',
        },
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: 2,
        },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {label}
      {!selecting && status !== 'unanswered' && (
        <Box
          component="span"
          aria-hidden
          sx={{ position: 'absolute', right: 2, bottom: 1, display: 'flex', lineHeight: 0 }}
        >
          {status === 'right' ? <CheckIcon sx={{ fontSize: 12 }} /> : <CloseIcon sx={{ fontSize: 12 }} />}
        </Box>
      )}
      {selecting && selected && (
        <Box
          component="span"
          aria-hidden
          sx={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 18,
            height: 18,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
          }}
        >
          <CheckIcon sx={{ fontSize: 12 }} />
        </Box>
      )}
    </Box>
  );
});

// ─── Legend ──────────────────────────────────────────────────────────────────

function PaletteLegend({ counts }: { counts: Record<QuestionStatus, number> }) {
  const item = (swatch: ReactNode, label: string, count: number) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      {swatch}
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
        {label} {count}
      </Typography>
    </Box>
  );
  const swatch = (bg: string, border: string, glyph?: ReactNode) => (
    <Box
      aria-hidden
      sx={{
        width: 16,
        height: 16,
        borderRadius: '4px',
        bgcolor: bg,
        border: '1px solid',
        borderColor: border,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {glyph}
    </Box>
  );
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.75, mt: 0.5 }}>
      {item(swatch('success.main', 'success.main', <CheckIcon sx={{ fontSize: 11 }} />), 'Right', counts.right)}
      {item(swatch('error.main', 'error.main', <CloseIcon sx={{ fontSize: 11 }} />), 'Wrong', counts.wrong)}
      {item(swatch('background.paper', 'divider'), 'Not answered', counts.unanswered)}
    </Box>
  );
}
