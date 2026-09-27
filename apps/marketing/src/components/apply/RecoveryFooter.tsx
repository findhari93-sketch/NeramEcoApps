'use client';

import { Link } from '@/i18n/routing';
import { Box, Button, Typography } from '@neram/ui';
import { useTranslations } from 'next-intl';

/** The exit that is not a dead end: Tools for someone not ready for coaching. */
export default function RecoveryFooter() {
  const t = useTranslations('apply');
  return (
    <Box sx={{ mt: 4, textAlign: 'center' }}>
      <Typography variant="subtitle2">{t('recovery.title')}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t('recovery.body')}
      </Typography>
      <Button component={Link} href="/tools" variant="text" sx={{ mt: 0.5, minHeight: 44 }}>
        {t('recovery.cta')}
      </Button>
    </Box>
  );
}
