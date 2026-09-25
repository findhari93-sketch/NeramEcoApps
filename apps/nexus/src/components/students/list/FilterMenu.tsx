'use client';

import { useState, type ReactNode } from 'react';
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  Drawer,
  Popover,
  Radio,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import TuneIcon from '@mui/icons-material/Tune';

/**
 * Every filter on a list behind ONE button, for the places where space is tight
 * (a drawer, a dialog, a side panel, a phone).
 *
 * A row of chips per filter reads well on a wide page, where a teacher scans
 * them at once. In a 480px drawer the same rows wrapped into four lines and
 * pushed the students off the first screen. Here they fold into a single
 * "Filter" button with a count of what is on; what is on also shows as a thin
 * line of removable chips (`ActiveFilterChips`) so nothing is hidden silently.
 *
 * A popover on a pointer screen, a bottom sheet on a phone. Changes apply as
 * they are tapped; Done only closes.
 */

export interface FilterOption {
  key: string;
  label: string;
  count?: number;
  /** A colour dot beside the label. The label always carries the meaning too. */
  color?: string;
  dotStyle?: 'solid' | 'dotted' | 'ring';
  hint?: string;
}

export interface FilterSection {
  id: string;
  title: string;
  /** 'single' picks one option or none; 'multi' shows any of the ticked ones. */
  mode: 'single' | 'multi';
  options: FilterOption[];
  value: readonly string[];
  /** Single mode: pick, or clear when the picked one is tapped again. Multi: tick or untick. */
  onToggle: (key: string) => void;
  onClear: () => void;
  /** Single mode: the "no filter" row, for example "Everyone". */
  allLabel?: string;
  /** Hide zero-count options (never the one that is on). */
  hideEmpty?: boolean;
  disabled?: boolean;
}

export function activeFilterCount(sections: readonly FilterSection[]): number {
  return sections.reduce((n, s) => n + s.value.length, 0);
}

const RESET_BUTTON = { appearance: 'none', font: 'inherit', cursor: 'pointer', textAlign: 'left' } as const;

export function FilterDot({ color, style = 'solid', size = 10 }: { color: string; style?: FilterOption['dotStyle']; size?: number }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'inline-block',
        ...(style === 'solid'
          ? { bgcolor: color }
          : { border: `2px solid ${color}`, borderStyle: style === 'dotted' ? 'dotted' : 'solid' }),
      }}
    />
  );
}

function visibleOptions(s: FilterSection): FilterOption[] {
  if (!s.hideEmpty) return s.options;
  return s.options.filter((o) => (o.count ?? 1) > 0 || s.value.includes(o.key));
}

function OptionRow({
  section,
  option,
}: {
  section: FilterSection;
  option: { key: string | null; label: string; count?: number; color?: string; dotStyle?: FilterOption['dotStyle']; hint?: string };
}) {
  const single = section.mode === 'single';
  const checked = option.key === null ? section.value.length === 0 : section.value.includes(option.key);
  const click = () => {
    if (option.key === null) section.onClear();
    else section.onToggle(option.key);
  };
  const countText = typeof option.count === 'number' ? `, ${option.count}` : '';
  return (
    <Box
      component="button"
      type="button"
      onClick={click}
      disabled={section.disabled}
      role={single ? 'radio' : 'checkbox'}
      aria-checked={checked}
      aria-label={`${option.label}${countText}${option.hint ? `. ${option.hint}` : ''}`}
      data-testid={`filter-option-${section.id}-${option.key ?? 'all'}`}
      sx={{
        ...RESET_BUTTON,
        width: '100%',
        minHeight: 48,
        px: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        border: 0,
        bgcolor: checked ? 'action.selected' : 'transparent',
        color: 'text.primary',
        '&:hover:not(:disabled)': { bgcolor: checked ? 'action.selected' : 'action.hover' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        '&:disabled': { opacity: 0.5, cursor: 'default' },
      }}
    >
      {single ? (
        <Radio checked={checked} tabIndex={-1} disableRipple size="small" sx={{ p: 0 }} inputProps={{ 'aria-hidden': true }} />
      ) : (
        <Checkbox checked={checked} tabIndex={-1} disableRipple size="small" sx={{ p: 0 }} inputProps={{ 'aria-hidden': true }} />
      )}
      {option.color && <FilterDot color={option.color} style={option.dotStyle} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: checked ? 700 : 500 }}>
          {option.label}
        </Typography>
        {option.hint && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
            {option.hint}
          </Typography>
        )}
      </Box>
      {typeof option.count === 'number' && (
        <Typography variant="body2" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {option.count}
        </Typography>
      )}
    </Box>
  );
}

function SectionList({ sections }: { sections: readonly FilterSection[] }) {
  return (
    <>
      {sections.map((s, i) => {
        const total = s.options.reduce((n, o) => n + (o.count ?? 0), 0);
        return (
          <Box
            key={s.id}
            role={s.mode === 'single' ? 'radiogroup' : 'group'}
            aria-label={s.title}
            sx={{ py: 0.5, ...(i > 0 && { borderTop: '1px solid', borderColor: 'divider' }) }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, minHeight: 36 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 800, color: 'text.secondary', flex: 1, letterSpacing: 0.3 }}
              >
                {s.title}
              </Typography>
              {s.mode === 'multi' && s.value.length > 0 && (
                <Button size="small" onClick={s.onClear} sx={{ minHeight: 36, textTransform: 'none' }}>
                  Clear
                </Button>
              )}
            </Box>
            {s.mode === 'single' && s.allLabel && (
              <OptionRow section={s} option={{ key: null, label: s.allLabel, count: total || undefined }} />
            )}
            {visibleOptions(s).map((o) => (
              <OptionRow key={o.key} section={s} option={o} />
            ))}
          </Box>
        );
      })}
    </>
  );
}

export default function FilterMenu({
  sections,
  label = 'Filter',
  title = 'Filter students',
  fullWidth = false,
}: {
  sections: readonly FilterSection[];
  label?: string;
  title?: string;
  fullWidth?: boolean;
}) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = !!anchor;
  const active = activeFilterCount(sections);
  const clearAll = () => sections.forEach((s) => s.value.length && s.onClear());
  // Disabled only when there is nothing at all to pick. A section still waiting
  // on its data (the stage facts) is shown disabled inside the menu instead.
  const disabled = sections.length === 0;

  const body = (
    <>
      <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', minHeight: 48 }}>
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: 16, flex: 1 }}>
          {title}
        </Typography>
        {active > 0 && (
          <Button onClick={clearAll} sx={{ minHeight: 44, textTransform: 'none' }}>
            Clear all
          </Button>
        )}
      </Box>
      <SectionList sections={sections} />
      <Box sx={{ px: 1.5, pt: 1, pb: 1.5 }}>
        <Button fullWidth variant="contained" disableElevation onClick={() => setAnchor(null)} sx={{ minHeight: 48 }}>
          Done
        </Button>
      </Box>
    </>
  );

  return (
    <>
      <Badge
        color="primary"
        badgeContent={active}
        invisible={active === 0}
        overlap="rectangular"
        sx={{ flexShrink: 0, ...(fullWidth && { width: '100%' }) }}
      >
        <Button
          size="small"
          variant={active ? 'contained' : 'outlined'}
          disableElevation
          startIcon={<TuneIcon />}
          disabled={disabled}
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={active ? `${label}: ${active} on` : label}
          data-testid="filter-menu-button"
          fullWidth={fullWidth}
          sx={{
            minHeight: 48,
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: 2,
            whiteSpace: 'nowrap',
            ...(active ? {} : { bgcolor: 'background.paper' }),
          }}
        >
          {label}
        </Button>
      </Badge>
      {isPhone ? (
        <Drawer
          anchor="bottom"
          open={open}
          onClose={() => setAnchor(null)}
          PaperProps={{
            sx: {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '85vh',
              pb: 'env(safe-area-inset-bottom)',
            },
          }}
        >
          <Box role="dialog" aria-label={title}>
            {body}
          </Box>
        </Drawer>
      ) : (
        <Popover
          open={open}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { width: 340, maxWidth: 'calc(100vw - 32px)', maxHeight: '70vh', mt: 0.5, borderRadius: 2 } } }}
        >
          <Box role="dialog" aria-label={title}>
            {body}
          </Box>
        </Popover>
      )}
    </>
  );
}

/**
 * What the Filter button has on, as one thin line of removable chips. Takes no
 * height at all when nothing is on.
 */
export function ActiveFilterChips({ sections, trailing }: { sections: readonly FilterSection[]; trailing?: ReactNode }) {
  const on = sections.flatMap((s) =>
    s.value.map((key) => ({ s, key, option: s.options.find((o) => o.key === key) })),
  );
  if (on.length === 0) return null;
  return (
    <Box
      role="group"
      aria-label="Filters on"
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, mt: 1 }}
    >
      {on.map(({ s, key, option }) => (
        <Chip
          key={`${s.id}:${key}`}
          size="small"
          label={option?.label ?? key}
          icon={option?.color ? <Box component="span" sx={{ display: 'inline-flex', ml: '8px !important' }}><FilterDot color={option.color} style={option.dotStyle} size={8} /></Box> : undefined}
          onDelete={() => s.onToggle(key)}
          aria-label={`${s.title}: ${option?.label ?? key}. Remove`}
          sx={{
            fontWeight: 600,
            height: 32,
            // The chip is 32px to keep the line thin; its delete target grows
            // to a full 44px hit area without taking layout room.
            '& .MuiChip-deleteIcon': { position: 'relative', '&::after': { content: '""', position: 'absolute', inset: -8 } },
          }}
        />
      ))}
      {on.length > 1 && (
        <Button
          size="small"
          onClick={() => sections.forEach((s) => s.value.length && s.onClear())}
          sx={{ minHeight: 32, textTransform: 'none', fontWeight: 700 }}
        >
          Clear all
        </Button>
      )}
      {trailing}
    </Box>
  );
}

/**
 * One filter section as a row of chips, for a wide container where a teacher
 * scans the options at once. The same section folds into FilterMenu when the
 * container is narrow.
 */
export function FilterChipRow({ section }: { section: FilterSection }) {
  const total = section.options.reduce((n, o) => n + (o.count ?? 0), 0);
  return (
    <Box role="group" aria-label={section.title} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
      {section.mode === 'single' && section.allLabel && (
        <Chip
          label={`${section.allLabel}${total ? ` ${total}` : ''}`}
          onClick={section.onClear}
          color={section.value.length === 0 ? 'primary' : 'default'}
          variant={section.value.length === 0 ? 'filled' : 'outlined'}
          aria-pressed={section.value.length === 0}
          sx={{ minHeight: 44, fontWeight: 600 }}
        />
      )}
      {visibleOptions(section).map((o) => {
        const on = section.value.includes(o.key);
        return (
          <Chip
            key={o.key}
            label={typeof o.count === 'number' ? `${o.label} ${o.count}` : o.label}
            onClick={() => section.onToggle(o.key)}
            disabled={section.disabled}
            aria-pressed={on}
            title={o.hint}
            color={on ? 'primary' : 'default'}
            variant={on ? 'filled' : 'outlined'}
            icon={o.color ? <Box component="span" sx={{ display: 'inline-flex', ml: '10px !important' }}><FilterDot color={o.color} style={o.dotStyle} /></Box> : undefined}
            sx={{ minHeight: 44, fontWeight: 600 }}
          />
        );
      })}
    </Box>
  );
}
