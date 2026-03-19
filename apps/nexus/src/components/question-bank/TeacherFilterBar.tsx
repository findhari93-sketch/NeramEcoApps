'use client';

import { useState, useRef } from 'react';
import {
  Box,
  Chip,
  Popover,
  MenuList,
  MenuItem,
  Typography,
  TextField,
  ListItemIcon,
  ListItemText,
} from '@neram/ui';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import {
  QB_CATEGORIES,
  QB_CATEGORY_LABELS,
  QB_QUESTION_STATUS_LABELS,
} from '@neram/database';

interface TeacherFilterBarProps {
  difficulty: string;
  category: string;
  examRelevance: string;
  questionStatus: string;
  total: number;
  loading: boolean;
  onDifficultyChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onExamRelevanceChange: (v: string) => void;
  onQuestionStatusChange: (v: string) => void;
}

interface FilterConfig {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  searchable?: boolean;
}

export default function TeacherFilterBar({
  difficulty,
  category,
  examRelevance,
  questionStatus,
  total,
  loading,
  onDifficultyChange,
  onCategoryChange,
  onExamRelevanceChange,
  onQuestionStatusChange,
}: TeacherFilterBarProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const chipRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const filters: FilterConfig[] = [
    {
      key: 'difficulty',
      label: 'Difficulty',
      value: difficulty,
      options: [
        { value: 'EASY', label: 'Easy' },
        { value: 'MEDIUM', label: 'Medium' },
        { value: 'HARD', label: 'Hard' },
      ],
      onChange: onDifficultyChange,
    },
    {
      key: 'category',
      label: 'Category',
      value: category,
      options: QB_CATEGORIES.map((cat: string) => ({
        value: cat,
        label: QB_CATEGORY_LABELS[cat as keyof typeof QB_CATEGORY_LABELS] || cat,
      })),
      onChange: onCategoryChange,
      searchable: true,
    },
    {
      key: 'exam',
      label: 'Exam',
      value: examRelevance,
      options: [
        { value: 'NATA', label: 'NATA' },
        { value: 'JEE', label: 'JEE' },
        { value: 'BOTH', label: 'Both' },
      ],
      onChange: onExamRelevanceChange,
    },
    {
      key: 'status',
      label: 'Status',
      value: questionStatus,
      options: [
        { value: 'active', label: QB_QUESTION_STATUS_LABELS.active || 'Active' },
        { value: 'complete', label: QB_QUESTION_STATUS_LABELS.complete || 'Complete' },
        { value: 'answer_keyed', label: QB_QUESTION_STATUS_LABELS.answer_keyed || 'Answer Keyed' },
        { value: 'draft', label: QB_QUESTION_STATUS_LABELS.draft || 'Draft' },
      ],
      onChange: onQuestionStatusChange,
    },
  ];

  function handleChipClick(key: string, el: HTMLElement) {
    setAnchorEl(el);
    setOpenFilter(key);
    setCategorySearch('');
  }

  function handleClose() {
    setAnchorEl(null);
    setOpenFilter(null);
    setCategorySearch('');
  }

  function handleSelect(config: FilterConfig, value: string) {
    config.onChange(config.value === value ? '' : value);
    handleClose();
  }

  function handleClear(config: FilterConfig, e: React.MouseEvent) {
    e.stopPropagation();
    config.onChange('');
  }

  function getSelectedLabel(config: FilterConfig): string {
    const opt = config.options.find((o) => o.value === config.value);
    return opt?.label || config.value;
  }

  const hasAnyFilter = filters.some((f) => f.value !== '');

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        overflowX: 'auto',
        py: 0.75,
        mb: 1,
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {filters.map((config) => {
        const isActive = config.value !== '';

        return (
          <Chip
            key={config.key}
            ref={(el: HTMLDivElement | null) => {
              chipRefs.current[config.key] = el;
            }}
            label={isActive ? getSelectedLabel(config) : config.label}
            variant={isActive ? 'filled' : 'outlined'}
            color={isActive ? 'primary' : 'default'}
            onClick={(e) => handleChipClick(config.key, e.currentTarget)}
            onDelete={isActive ? (e: React.MouseEvent) => handleClear(config, e as React.MouseEvent) : undefined}
            deleteIcon={isActive ? <CloseIcon sx={{ fontSize: 16 }} /> : undefined}
            icon={!isActive ? <KeyboardArrowDownIcon sx={{ fontSize: 18 }} /> : undefined}
            sx={{
              flexShrink: 0,
              height: 36,
              fontSize: '0.8125rem',
              fontWeight: 500,
              borderRadius: '18px',
              '& .MuiChip-label': { px: 1 },
              '& .MuiChip-icon': {
                order: 1,
                ml: -0.25,
                mr: 0.5,
              },
              ...(!isActive && {
                borderColor: 'grey.300',
                color: 'text.secondary',
                '&:hover': { borderColor: 'grey.400', bgcolor: 'grey.50' },
              }),
            }}
          />
        );
      })}

      {hasAnyFilter && (
        <Chip
          label="Clear"
          size="small"
          variant="outlined"
          color="error"
          onClick={() => filters.forEach((f) => f.onChange(''))}
          sx={{
            flexShrink: 0,
            height: 28,
            fontSize: '0.75rem',
            fontWeight: 500,
          }}
        />
      )}

      {!loading && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ flexShrink: 0, ml: 0.5, whiteSpace: 'nowrap' }}
        >
          {total} found
        </Typography>
      )}

      {/* Single popover, content changes based on openFilter */}
      <Popover
        open={Boolean(openFilter)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              minWidth: 180,
              maxHeight: 320,
              borderRadius: 2,
              boxShadow: 3,
            },
          },
        }}
      >
        {openFilter && (() => {
          const config = filters.find((f) => f.key === openFilter);
          if (!config) return null;

          let filteredOptions = config.options;
          if (config.searchable && categorySearch) {
            const q = categorySearch.toLowerCase();
            filteredOptions = config.options.filter((o) =>
              o.label.toLowerCase().includes(q)
            );
          }

          return (
            <>
              {config.searchable && (
                <Box sx={{ px: 1.5, py: 1, position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}>
                  <TextField
                    size="small"
                    placeholder="Search..."
                    fullWidth
                    autoFocus
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    sx={{ '& .MuiInputBase-root': { height: 36 } }}
                  />
                </Box>
              )}
              <MenuList dense sx={{ py: 0.5 }}>
                {filteredOptions.map((opt) => {
                  const selected = config.value === opt.value;
                  return (
                    <MenuItem
                      key={opt.value}
                      selected={selected}
                      onClick={() => handleSelect(config, opt.value)}
                      sx={{ minHeight: 44, px: 2 }}
                    >
                      <ListItemText primary={opt.label} />
                      {selected && (
                        <ListItemIcon sx={{ minWidth: 'auto', ml: 1 }}>
                          <CheckIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                        </ListItemIcon>
                      )}
                    </MenuItem>
                  );
                })}
                {filteredOptions.length === 0 && (
                  <MenuItem disabled>
                    <Typography variant="body2" color="text.secondary">
                      No matches
                    </Typography>
                  </MenuItem>
                )}
              </MenuList>
            </>
          );
        })()}
      </Popover>
    </Box>
  );
}
