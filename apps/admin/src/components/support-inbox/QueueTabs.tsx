'use client';

/**
 * The inbox tabs (one per queue, with counts) and the filters under them:
 * Mine, Unassigned, Source, Category, Priority, and search.
 */
import { forwardRef, useState, type MouseEvent } from 'react';
import { Box, Chip, InputAdornment, Menu, MenuItem, Tab, Tabs, TextField } from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckIcon from '@mui/icons-material/Check';
import type { SupportTicketQueue, SupportTicketQueueCounts } from '@neram/database';
import { TICKET_CATEGORY_LABEL, TICKET_SOURCE_LABEL } from '@neram/database/support-ticket-status';
import { INBOX_QUEUES, QUEUE_LABEL, type InboxUrlState } from '@/lib/support-inbox/inbox-url';
import { ARIA_KEYS } from '@/lib/support-inbox/keyboard';
import { CHIP_SX } from './bits';

const PRIORITY_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export function QueueTabs({
  queue,
  counts,
  onQueue,
}: {
  queue: SupportTicketQueue;
  counts: SupportTicketQueueCounts | null;
  onQueue: (q: SupportTicketQueue) => void;
}) {
  return (
    <Tabs
      value={queue}
      onChange={(_, v: SupportTicketQueue) => onQueue(v)}
      aria-label="Ticket queues"
      variant="scrollable"
      scrollButtons="auto"
      sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 48 }}
    >
      {INBOX_QUEUES.map((q) => (
        <Tab
          key={q}
          value={q}
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              {QUEUE_LABEL[q]}
              <Box
                component="span"
                aria-label={counts ? `${counts[q]} tickets` : 'loading count'}
                sx={{
                  minWidth: 22,
                  px: 0.75,
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: '20px',
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                  bgcolor: q === queue ? 'primary.main' : 'grey.200',
                  color: q === queue ? 'primary.contrastText' : 'text.primary',
                }}
              >
                {counts ? counts[q] : '·'}
              </Box>
            </Box>
          }
          sx={{ minHeight: 48, fontWeight: 600, textTransform: 'none', px: 1.5, minWidth: 0 }}
        />
      ))}
    </Tabs>
  );
}

function MenuChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = options.find((o) => o.value === value);
  const open = (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget);
  return (
    <>
      <Chip
        label={current ? `${label}: ${current.label}` : label}
        onClick={open}
        onDelete={current ? () => onChange('') : undefined}
        deleteIcon={current ? undefined : <ArrowDropDownIcon />}
        variant={current ? 'filled' : 'outlined'}
        color={current ? 'primary' : 'default'}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        sx={CHIP_SX}
      />
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem
          selected={!value}
          onClick={() => {
            onChange('');
            setAnchor(null);
          }}
          sx={{ minHeight: 44 }}
        >
          Any {label.toLowerCase()}
        </MenuItem>
        {options.map((o) => (
          <MenuItem
            key={o.value}
            selected={o.value === value}
            onClick={() => {
              onChange(o.value);
              setAnchor(null);
            }}
            sx={{ minHeight: 44, gap: 1 }}
          >
            {o.label}
            {o.value === value && <CheckIcon fontSize="small" aria-hidden sx={{ ml: 'auto' }} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export const InboxFilters = forwardRef<
  HTMLInputElement,
  {
    state: InboxUrlState;
    onChange: (patch: Partial<InboxUrlState>) => void;
    counts: SupportTicketQueueCounts | null;
  }
>(function InboxFilters({ state, onChange, counts }, searchRef) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <TextField
        size="small"
        inputRef={searchRef}
        value={state.q}
        onChange={(e) => onChange({ q: e.target.value })}
        placeholder="Search number, name, subject"
        inputProps={{ 'aria-label': 'Search tickets', 'aria-keyshortcuts': ARIA_KEYS.search, maxLength: 80 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="primary" aria-hidden />
            </InputAdornment>
          ),
        }}
        sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
      />
      <Box role="group" aria-label="Filters" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip
          label={counts?.mine ? `Mine · ${counts.mine}` : 'Mine'}
          clickable
          variant={state.assignee === 'me' ? 'filled' : 'outlined'}
          color={state.assignee === 'me' ? 'primary' : 'default'}
          aria-pressed={state.assignee === 'me'}
          onClick={() => onChange({ assignee: state.assignee === 'me' ? '' : 'me' })}
          sx={CHIP_SX}
        />
        <Chip
          label="Unassigned"
          clickable
          variant={state.assignee === 'unassigned' ? 'filled' : 'outlined'}
          color={state.assignee === 'unassigned' ? 'primary' : 'default'}
          aria-pressed={state.assignee === 'unassigned'}
          onClick={() => onChange({ assignee: state.assignee === 'unassigned' ? '' : 'unassigned' })}
          sx={CHIP_SX}
        />
        <MenuChip
          label="Source"
          value={state.source}
          options={Object.entries(TICKET_SOURCE_LABEL).map(([value, label]) => ({ value, label }))}
          onChange={(source) => onChange({ source })}
        />
        <MenuChip
          label="Category"
          value={state.category}
          options={Object.entries(TICKET_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))}
          onChange={(category) => onChange({ category })}
        />
        <MenuChip
          label="Priority"
          value={state.priority}
          options={Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }))}
          onChange={(priority) => onChange({ priority })}
        />
      </Box>
    </Box>
  );
});
