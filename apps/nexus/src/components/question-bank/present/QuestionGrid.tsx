'use client';

/**
 * Every question in the deck, to jump to any of them: the class does not have
 * to go in order. Grouped by section. A question already asked is outlined; a
 * revealed one shows how many got it right. Nothing here shows an answer.
 */

import { Box, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@neram/ui';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { qbSectionLabel } from '@neram/database';
import type { DeckItem } from '@/lib/qb-present/deck';
import type { GridStatus } from './present-model';

export default function QuestionGrid({
  open,
  onClose,
  items,
  currentIndex,
  statuses,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  items: DeckItem[];
  currentIndex: number;
  statuses: Map<string, GridStatus>;
  onPick: (index: number) => void;
}) {
  const groups: Array<{ section: string | null; entries: Array<{ item: DeckItem; index: number }> }> = [];
  items.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.entries.push({ item, index });
    else groups.push({ section: item.section, entries: [{ item, index }] });
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
        <Box sx={{ flex: 1, fontWeight: 800 }}>Go to a question</Box>
        <IconButton aria-label="Close" onClick={onClose} sx={{ width: 48, height: 48 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={2} sx={{ mb: 2, color: 'text.secondary', fontSize: 14 }} aria-hidden>
          <Legend kind="new" label="Not asked" />
          <Legend kind="asked" label="Asked" />
          <Legend kind="revealed" label="Revealed, % right" />
        </Stack>
        <Stack spacing={2.5}>
          {groups.map((group, g) => (
            <Box key={g} component="section" aria-label={group.section ? qbSectionLabel(group.section) : 'Questions'}>
              {group.section && (
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {qbSectionLabel(group.section)}
                </Typography>
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: 1 }}>
                {group.entries.map(({ item, index }) => {
                  const status = statuses.get(item.id) ?? { state: 'new' };
                  const current = index === currentIndex;
                  const percent = status.state === 'revealed' ? status.percent : null;
                  return (
                    <Box
                      key={item.id}
                      component="button"
                      type="button"
                      autoFocus={current}
                      aria-current={current ? 'true' : undefined}
                      aria-label={`Question ${item.label}${status.state === 'asked' ? ', asked' : ''}${
                        status.state === 'revealed' ? `, revealed${percent !== null ? `, ${percent}% right` : ''}` : ''
                      }`}
                      onClick={() => onPick(index)}
                      sx={{
                        minHeight: 56,
                        borderRadius: 1.5,
                        border: 2,
                        cursor: 'pointer',
                        font: 'inherit',
                        fontWeight: 700,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1.1,
                        borderColor: current ? 'primary.main' : status.state === 'new' ? 'divider' : 'primary.light',
                        bgcolor: current ? 'primary.main' : status.state === 'revealed' ? 'action.selected' : 'background.paper',
                        color: current ? 'primary.contrastText' : 'text.primary',
                        '&:hover': { borderColor: 'primary.main' },
                        '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.dark', outlineOffset: 2 },
                      }}
                    >
                      <span>{item.label}</span>
                      {percent !== null && <Box component="span" sx={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{percent}%</Box>}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function Legend({ kind, label }: { kind: GridStatus['state']; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box
        sx={{
          width: 16,
          height: 16,
          borderRadius: 0.5,
          border: 2,
          borderColor: kind === 'new' ? 'divider' : 'primary.light',
          bgcolor: kind === 'revealed' ? 'action.selected' : 'background.paper',
        }}
      />
      <span>{label}</span>
    </Stack>
  );
}
