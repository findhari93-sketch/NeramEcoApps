'use client';

/**
 * The language chip on a person's page: shows what their avatar letter means
 * and lets staff record it.
 *
 * Reads "Tamil", "Likely Tamil" (a guess) or "English". Clicking opens a menu:
 * a one-click "Confirm Tamil" when there is a guess, then the six languages and
 * English, then the Limited English tick. A pick saves straight away (PATCH
 * /api/crm/users/[id]/language) and updates every avatar of this person on
 * screen; a failed save puts the old value back and says so.
 */
import { useState } from 'react';
import CheckIcon from '@mui/icons-material/Check';
import TranslateIcon from '@mui/icons-material/Translate';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  Divider,
  LANGUAGES,
  LANGUAGE_ORDER,
  LANGUAGE_SECTION_HELP,
  LIMITED_ENGLISH_HELP,
  LIMITED_ENGLISH_LABEL,
  LanguageMark,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Typography,
  isLanguageValue,
  type LanguageKey,
} from '@neram/ui';
import { avatarLanguageOf, languageChipLabel, type PersonFacts } from '@/lib/person-avatar';
import { usePersonFacts, useUpdatePersonFacts } from './PersonFactsProvider';

const MARK = 18;

export default function LanguageChip({ userId }: { userId: string }) {
  const { facts } = usePersonFacts(userId);
  const updateFacts = useUpdatePersonFacts();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const language = avatarLanguageOf(facts);
  const recorded = isLanguageValue(facts?.homeLanguage) ? facts!.homeLanguage : null;
  const limited = facts?.limitedEnglish === true;
  const guess = !recorded ? facts?.guess ?? null : null;

  async function save(patch: { homeLanguage?: LanguageKey | null; limitedEnglish?: boolean }) {
    setAnchor(null);
    if (!facts) return;
    const previous: Partial<PersonFacts> = { homeLanguage: facts.homeLanguage, limitedEnglish: facts.limitedEnglish };
    updateFacts(userId, patch);
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/users/${userId}/language`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Could not save the language');
    } catch (err) {
      updateFacts(userId, previous);
      setError(err instanceof Error ? err.message : 'Could not save the language');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Chip
        size="small"
        variant="outlined"
        disabled={!facts || saving}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-label={`Language: ${languageChipLabel(facts)}. Change`}
        data-testid="person-language-chip"
        icon={
          language ? (
            <LanguageMark
              language={language.key}
              limitedEnglish={language.limitedEnglish}
              likely={language.likely}
              size={16}
              sx={{ ml: '4px !important' }}
            />
          ) : (
            <TranslateIcon sx={{ fontSize: 16 }} />
          )
        }
        label={languageChipLabel(facts)}
        sx={{
          height: 28,
          fontWeight: 600,
          cursor: 'pointer',
          // Sits in a row of 28px status chips, but takes a 44px tall hit area.
          position: 'relative',
          overflow: 'visible',
          '&::before': { content: '""', position: 'absolute', inset: '-8px 0' },
          ...(language?.likely ? { borderStyle: 'dashed', color: 'text.secondary' } : {}),
        }}
      />

      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 280 } } }}
      >
        <Box sx={{ px: 2, pt: 0.5, pb: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
            {LANGUAGE_SECTION_HELP}
          </Typography>
        </Box>

        {guess && (
          <MenuItem onClick={() => save({ homeLanguage: guess.key })} sx={{ minHeight: 44 }}>
            <ListItemIcon>
              <LanguageMark language={guess.key} size={MARK} />
            </ListItemIcon>
            <ListItemText
              primary={`Confirm ${LANGUAGES[guess.key].label}`}
              secondary={guess.from ? `Guessed from ${guess.from}` : undefined}
              primaryTypographyProps={{ fontWeight: 700 }}
            />
          </MenuItem>
        )}
        {guess && <Divider />}

        {LANGUAGE_ORDER.map((key) => (
          <MenuItem
            key={key}
            selected={recorded === key}
            onClick={() => save({ homeLanguage: key })}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon>
              {key === 'english' ? <Box sx={{ width: MARK }} /> : <LanguageMark language={key} size={MARK} />}
            </ListItemIcon>
            <ListItemText primary={LANGUAGES[key].label} />
            {recorded === key && <CheckIcon fontSize="small" color="primary" />}
          </MenuItem>
        ))}

        <Divider />
        <MenuItem onClick={() => save({ limitedEnglish: !limited })} sx={{ minHeight: 44, alignItems: 'flex-start' }}>
          <ListItemIcon sx={{ mt: -0.5 }}>
            <Checkbox edge="start" size="small" checked={limited} tabIndex={-1} disableRipple inputProps={{ 'aria-hidden': true }} />
          </ListItemIcon>
          <ListItemText
            primary={LIMITED_ENGLISH_LABEL}
            secondary={LIMITED_ENGLISH_HELP}
            secondaryTypographyProps={{ sx: { whiteSpace: 'normal' } }}
          />
        </MenuItem>

        {recorded && <Divider />}
        {recorded && (
          <MenuItem onClick={() => save({ homeLanguage: null })} sx={{ minHeight: 44 }}>
            <ListItemText
              primary="Clear what was recorded"
              secondary="Goes back to a guess, if there is one"
              primaryTypographyProps={{ color: 'text.secondary' }}
            />
          </MenuItem>
        )}
      </Menu>

      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
