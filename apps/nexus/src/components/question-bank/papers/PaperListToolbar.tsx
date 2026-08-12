'use client';

import {
  Box,
  Chip,
  InputAdornment,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  alpha,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import {
  PAPER_SORTS,
  PAPER_SORT_LABELS,
  PAPER_STATUSES,
  PAPER_STATUS_LABELS,
  type PaperSort,
  type PaperStatus,
  type PaperView,
} from './paperTypes';

export interface PaperListToolbarProps {
  search: string;
  onSearchChange: (next: string) => void;
  status: PaperStatus;
  onStatusChange: (next: PaperStatus) => void;
  counts: Record<PaperStatus, number>;
  sort: PaperSort;
  onSortChange: (next: PaperSort) => void;
  view: PaperView;
  onViewChange: (next: PaperView) => void;
}

/**
 * Find a paper, then decide how densely to look at the result.
 *
 * All three controls are client-side over the ~26 papers the page already has
 * in memory. None of them costs a request, which is why search filters on every
 * keystroke rather than behind a submit.
 */
export default function PaperListToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  counts,
  sort,
  onSortChange,
  view,
  onViewChange,
}: PaperListToolbarProps) {
  return (
    <Box sx={{ mb: 2 }}>
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          alignItems: 'center',
          mb: 1.5,
        }}
      >
        <TextField
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search exam, year, session"
          size="small"
          type="search"
          // `inputProps`, not `aria-label` on the TextField: the latter lands on
          // the wrapper div, where no screen reader will read it as the name of
          // the field. There is no visible label, so this is the only name it has.
          inputProps={{ 'aria-label': 'Search papers' }}
          // Explicit widths, not flex hints. MUI's FormControl is inline-flex
          // with no intrinsic width, so `flex: 0 0 auto` resolved its basis
          // from a content box that had not been laid out yet and each control
          // claimed a row of its own.
          sx={{ width: { xs: '100%', sm: 260 }, flexShrink: 0 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        <TextField
          select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as PaperSort)}
          size="small"
          label="Sort"
          sx={{ width: { xs: '100%', sm: 180 }, flexShrink: 0 }}
        >
          {PAPER_SORTS.map((option) => (
            <MenuItem key={option} value={option} sx={{ minHeight: 44 }}>
              {PAPER_SORT_LABELS[option]}
            </MenuItem>
          ))}
        </TextField>

        {/* Density switch: table for scanning, tiles, or the roomy card. */}
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_e, next: PaperView | null) => {
            // Ignore de-select: one view is always active.
            if (next) onViewChange(next);
          }}
          size="small"
          aria-label="Paper list layout"
          sx={{
            ml: { sm: 'auto' },
            bgcolor: 'background.paper',
            borderRadius: 2,
            '& .MuiToggleButton-root': {
              minWidth: 44,
              minHeight: 44,
              px: 1.25,
              borderRadius: 2,
              color: 'text.secondary',
            },
            '& .Mui-selected': {
              bgcolor: (t) => alpha(t.palette.primary.main, 0.14),
              color: 'primary.main',
              '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.2) },
            },
          }}
        >
          <ToggleButton value="table" aria-label="Table view">
            <Tooltip title="Table" arrow><TableRowsOutlinedIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="grid" aria-label="Grid view">
            <Tooltip title="Grid" arrow><GridViewOutlinedIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="cards" aria-label="Detailed cards">
            <Tooltip title="Cards" arrow><ViewAgendaOutlinedIcon fontSize="small" /></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Counts are over every paper, not the filtered set, so picking one chip
          does not zero the others and hide what else is there. */}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }} role="group" aria-label="Filter by status">
        {PAPER_STATUSES.map((option) => {
          const selected = status === option;
          return (
            <Chip
              key={option}
              label={`${PAPER_STATUS_LABELS[option]} ${counts[option]}`}
              size="small"
              clickable
              aria-pressed={selected}
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              onClick={() => onStatusChange(option)}
              sx={{ height: { xs: 36, sm: 28 }, fontWeight: selected ? 700 : 500 }}
            />
          );
        })}
      </Box>
    </Box>
  );
}
