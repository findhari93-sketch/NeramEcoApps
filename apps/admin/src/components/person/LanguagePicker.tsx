'use client';

/**
 * The language choices, shared by the language chip's menu and the avatar's
 * quick editor so the two can never drift: a one-click "Confirm Tamil" when
 * there is a guess, the six languages and English, the Limited English tick,
 * and "Clear" when something is recorded.
 *
 * Returned as an array of MenuItems, not a component: MUI's Menu and MenuList
 * only move keyboard focus between their direct children.
 */
import CheckIcon from '@mui/icons-material/Check';
import {
  Box,
  Checkbox,
  Divider,
  LANGUAGES,
  LANGUAGE_ORDER,
  LIMITED_ENGLISH_HELP,
  LIMITED_ENGLISH_LABEL,
  LanguageMark,
  ListItemIcon,
  ListItemText,
  MenuItem,
  isLanguageValue,
} from '@neram/ui';
import type { ReactElement } from 'react';
import type { PersonFacts } from '@/lib/person-avatar';
import type { LanguagePatch } from './usePersonEdits';

const MARK = 18;

export function languagePickerItems(
  facts: Partial<PersonFacts> | null | undefined,
  onPick: (patch: LanguagePatch) => void,
): ReactElement[] {
  const recorded = isLanguageValue(facts?.homeLanguage) ? facts!.homeLanguage : null;
  const limited = facts?.limitedEnglish === true;
  const guess = !recorded ? facts?.guess ?? null : null;
  const items: ReactElement[] = [];

  if (guess) {
    items.push(
      <MenuItem key="confirm" onClick={() => onPick({ homeLanguage: guess.key })} sx={{ minHeight: 44 }}>
        <ListItemIcon>
          <LanguageMark language={guess.key} size={MARK} />
        </ListItemIcon>
        <ListItemText
          primary={`Confirm ${LANGUAGES[guess.key].label}`}
          secondary={guess.from ? `Guessed from ${guess.from}` : undefined}
          primaryTypographyProps={{ fontWeight: 700 }}
        />
      </MenuItem>,
      <Divider key="confirm-divider" />,
    );
  }

  for (const key of LANGUAGE_ORDER) {
    items.push(
      <MenuItem key={key} selected={recorded === key} onClick={() => onPick({ homeLanguage: key })} sx={{ minHeight: 44 }}>
        <ListItemIcon>
          {key === 'english' ? <Box sx={{ width: MARK }} /> : <LanguageMark language={key} size={MARK} />}
        </ListItemIcon>
        <ListItemText primary={LANGUAGES[key].label} />
        {recorded === key && <CheckIcon fontSize="small" color="primary" />}
      </MenuItem>,
    );
  }

  items.push(
    <Divider key="limited-divider" />,
    <MenuItem key="limited" onClick={() => onPick({ limitedEnglish: !limited })} sx={{ minHeight: 44, alignItems: 'flex-start' }}>
      <ListItemIcon sx={{ mt: -0.5 }}>
        <Checkbox edge="start" size="small" checked={limited} tabIndex={-1} disableRipple inputProps={{ 'aria-hidden': true }} />
      </ListItemIcon>
      <ListItemText
        primary={LIMITED_ENGLISH_LABEL}
        secondary={LIMITED_ENGLISH_HELP}
        secondaryTypographyProps={{ sx: { whiteSpace: 'normal' } }}
      />
    </MenuItem>,
  );

  if (recorded) {
    items.push(
      <Divider key="clear-divider" />,
      <MenuItem key="clear" onClick={() => onPick({ homeLanguage: null })} sx={{ minHeight: 44 }}>
        <ListItemText
          primary="Clear what was recorded"
          secondary="Goes back to a guess, if there is one"
          primaryTypographyProps={{ color: 'text.secondary' }}
        />
      </MenuItem>,
    );
  }

  return items;
}
