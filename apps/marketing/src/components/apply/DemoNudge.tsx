'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, Paper, Typography } from '@neram/ui';
import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import Close from '@mui/icons-material/Close';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';

const EXIT_SHOWN_KEY = 'neram_apply_exit_demo_shown';

/**
 * The quiet line under Continue on the Course and Review steps, for a student
 * who stalls because they do not know how the classes run. The draft is kept
 * (on this device, and on the server once signed in), so leaving is safe.
 */
export function DemoNotSureLink({ step }: { step: number }) {
  const t = useTranslations('apply.demo');
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 0.75,
        pt: 1.5,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <VideocamOutlined aria-hidden sx={{ fontSize: 20, color: 'text.secondary' }} />
      <Typography variant="body2" color="text.secondary" component="span">
        {t('notSure')}
      </Typography>
      <Button
        component={Link}
        href="/demo-class?from=apply"
        variant="text"
        onClick={() => trackTaxonomyEvent('demo_entry_clicked', { from: 'apply', step })}
        sx={{ minHeight: 44, px: 0.75, fontWeight: 700, textTransform: 'none', textDecoration: 'underline', textUnderlineOffset: 3 }}
      >
        {t('notSureLink')}
      </Button>
    </Box>
  );
}

/**
 * A small card, once per session, when the pointer heads for the tab bar on a
 * desktop: answers are saved, and a free demo is there if they are unsure.
 * Never on touch screens (there is no honest "about to leave" signal there),
 * never modal, and Esc or "Keep going" closes it.
 */
export function DemoExitIntent({ enabled, step }: { enabled: boolean; step: number }) {
  const t = useTranslations('apply.demo');
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    let alreadyShown = false;
    try {
      alreadyShown = window.sessionStorage.getItem(EXIT_SHOWN_KEY) === '1';
    } catch {
      // Storage blocked: still at most once per page load.
    }
    if (alreadyShown) return;
    if (!window.matchMedia?.('(pointer: fine) and (min-width: 900px)').matches) return;

    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget !== null || e.clientY > 0) return;
      try {
        window.sessionStorage.setItem(EXIT_SHOWN_KEY, '1');
      } catch {
        // ignore
      }
      document.removeEventListener('mouseout', onOut);
      setOpen(true);
      trackTaxonomyEvent('demo_entry_clicked', { from: 'apply_exit', step, shown: true });
    };
    document.addEventListener('mouseout', onOut);
    return () => document.removeEventListener('mouseout', onOut);
  }, [enabled, step]);

  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <Paper
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="demo-exit-title"
      tabIndex={-1}
      elevation={8}
      sx={{
        position: 'fixed',
        // Bottom-left sits over the showcase panel, never over the form fields.
        left: 24,
        bottom: 24,
        zIndex: 1300,
        width: 360,
        maxWidth: 'calc(100vw - 32px)',
        p: 2.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        outline: 'none',
        '&:focus-visible': { boxShadow: '0 0 0 3px rgba(232, 160, 32, 0.45)' },
        animation: 'demoExitIn 200ms ease-out',
        '@keyframes demoExitIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <IconButton
        aria-label={t('exitClose')}
        onClick={() => setOpen(false)}
        sx={{ position: 'absolute', top: 4, right: 4, width: 44, height: 44 }}
      >
        <Close fontSize="small" />
      </IconButton>
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', pr: 4 }}>
        <VideocamOutlined aria-hidden sx={{ color: 'primary.main' }} />
        <Typography id="demo-exit-title" fontWeight={800}>
          {t('exitTitle')}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {t('exitBody')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
        <Button
          component={Link}
          href="/demo-class?from=apply_exit"
          variant="contained"
          onClick={() => trackTaxonomyEvent('demo_entry_clicked', { from: 'apply_exit', step })}
          sx={{ minHeight: 44, fontWeight: 700, textTransform: 'none' }}
        >
          {t('exitCta')}
        </Button>
        <Button
          variant="text"
          color="inherit"
          onClick={() => setOpen(false)}
          sx={{ minHeight: 44, fontWeight: 600, textTransform: 'none' }}
        >
          {t('exitKeep')}
        </Button>
      </Box>
    </Paper>
  );
}
