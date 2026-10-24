'use client';

/**
 * The language chip on a person's page: shows what their avatar letter means
 * and lets staff record it.
 *
 * Reads "Tamil", "Likely Tamil" (a guess) or "English". Clicking opens a menu
 * (languagePickerItems, the same list the avatar's quick editor shows). A pick
 * saves straight away (PATCH /api/crm/users/[id]/language) and updates every
 * avatar of this person on screen; a failed save puts the old value back and
 * says so.
 */
import { useState } from 'react';
import TranslateIcon from '@mui/icons-material/Translate';
import { Alert, Box, Chip, LANGUAGE_SECTION_HELP, LanguageMark, Menu, Snackbar, Typography } from '@neram/ui';
import { avatarLanguageOf, languageChipLabel } from '@/lib/person-avatar';
import { languagePickerItems } from './LanguagePicker';
import { usePersonEdits } from './usePersonEdits';

export default function LanguageChip({ userId }: { userId: string }) {
  const { facts, saving, error, clearError, saveLanguage } = usePersonEdits(userId);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const language = avatarLanguageOf(facts);

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
        {languagePickerItems(facts, (patch) => {
          setAnchor(null);
          void saveLanguage(patch);
        })}
      </Menu>

      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={clearError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={clearError}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
