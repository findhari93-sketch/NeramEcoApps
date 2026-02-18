'use client';

/**
 * SelectQuestion - Card-based option selector
 * Supports single-select and multi-select modes.
 * Large tap targets (48px+ height), visual feedback on selection.
 */

import { Box, Typography } from '@neram/ui';
import type { OnboardingQuestionOption } from '@neram/database';

// Map icon names from seed data to Material icon unicode or emoji fallbacks
const ICON_MAP: Record<string, string> = {
  pencil_ruler: '\u270F\uFE0F',
  construction: '\uD83C\uDFD7\uFE0F',
  computer: '\uD83D\uDCBB',
  help_outline: '\uD83E\uDD14',
  smart_display: '\uD83D\uDCFA',
  photo_camera: '\uD83D\uDCF8',
  search: '\uD83D\uDD0D',
  group: '\uD83D\uDC65',
  school: '\uD83C\uDF93',
  domain: '\uD83C\uDFEB',
  chat: '\uD83D\uDCAC',
  more_horiz: '\u2728',
  account_balance: '\uD83C\uDFDB\uFE0F',
  menu_book: '\uD83D\uDCDA',
  auto_stories: '\uD83D\uDCD6',
  remove: '\u2014',
};

interface SelectQuestionProps {
  options: OnboardingQuestionOption[];
  value: string[];
  multiSelect: boolean;
  onChange: (selected: string[]) => void;
}

export function SelectQuestion({ options, value, multiSelect, onChange }: SelectQuestionProps) {
  const handleSelect = (optionValue: string) => {
    if (multiSelect) {
      const isSelected = value.includes(optionValue);
      if (isSelected) {
        onChange(value.filter(v => v !== optionValue));
      } else {
        onChange([...value, optionValue]);
      }
    } else {
      onChange([optionValue]);
    }
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          sm: options.length <= 4 ? '1fr 1fr' : '1fr 1fr',
        },
        gap: 1.5,
      }}
    >
      {options.map((option) => {
        const isSelected = value.includes(option.value);
        const icon = option.icon ? ICON_MAP[option.icon] || '' : '';

        return (
          <Box
            key={option.value}
            onClick={() => handleSelect(option.value)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelect(option.value);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 2,
              minHeight: 56,
              borderRadius: 2,
              border: '2px solid',
              borderColor: isSelected ? 'primary.main' : 'divider',
              bgcolor: isSelected ? 'primary.main' : 'background.paper',
              color: isSelected ? 'primary.contrastText' : 'text.primary',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              userSelect: 'none',
              '&:hover': {
                borderColor: isSelected ? 'primary.dark' : 'primary.light',
                transform: 'scale(1.01)',
              },
              '&:active': {
                transform: 'scale(0.98)',
              },
            }}
          >
            {icon && (
              <Typography sx={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>
                {icon}
              </Typography>
            )}
            <Typography
              fontWeight={isSelected ? 600 : 400}
              sx={{ fontSize: { xs: '0.95rem', sm: '1rem' } }}
            >
              {option.label}
            </Typography>
            {multiSelect && (
              <Box
                sx={{
                  ml: 'auto',
                  width: 22,
                  height: 22,
                  borderRadius: '4px',
                  border: '2px solid',
                  borderColor: isSelected ? 'primary.contrastText' : 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {isSelected && (
                  <Typography sx={{ fontSize: '0.75rem', lineHeight: 1, color: 'inherit' }}>
                    &#10003;
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
