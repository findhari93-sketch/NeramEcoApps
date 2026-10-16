import { siteLightTheme } from '@neram/ui';
import { siteTokens as t } from '@neram/ui/site-tokens';
import { createTheme } from '@mui/material/styles';

/** Field errors and the error summary rail. The site tokens have no error red yet. */
export const APPLY_ERROR = '#c62828';
/** Focus glow on inputs: border navy900 plus this 3px gold ring. */
export const INPUT_FOCUS_RING = '0 0 0 3px rgba(232,160,32,0.35)';

const rail = (color: string) => ({
  backgroundColor: t.surface,
  color: t.ink,
  border: `1px solid ${t.line}`,
  boxShadow: `inset 3px 0 0 ${color}`,
});

/**
 * The /apply, /pay and /enroll theme: the site light theme (navy, gold, Inter,
 * 8px radius) plus the form-specific pieces of the Apply Flow handoff, so every
 * plain MUI control in the flow already looks right:
 * - inputs 48px, 1px lineStrong, focus = navy border + gold ring, 16px text
 * - toggle buttons as separate 48px pills, selected = navy fill
 * - checkboxes and radios navy when checked
 * - alerts as a white card with a 3px coloured rail, never a tinted fill
 * Spec: apps/marketing/Docs/Marketing Website Design Audit/design_handoff_neram_apply_flow/README.md
 */
export const applyTheme = createTheme(siteLightTheme, {
  palette: {
    error: { main: APPLY_ERROR },
    // Older apply components reference the light primary tints; keep them neutral.
    primary: { 50: t.ground, 100: t.surfaceHover },
  },
  typography: {
    // Helper text in the body face, never mono capitals.
    caption: { fontFamily: t.fontSans, fontSize: '0.8125rem', lineHeight: 1.45, letterSpacing: 0, textTransform: 'none' },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: t.radius, textTransform: 'none', fontWeight: 700, '&.Mui-focusVisible': { outline: t.focusOutline, outlineOffset: 2 } },
        outlined: { borderColor: t.lineStrong, color: t.ink, backgroundColor: t.surface },
        // Green and orange buttons are gone: every "success" or "warning" button reads as the primary.
        containedSuccess: { background: t.gold500, color: t.navy900, '&:hover': { background: t.gold300 } },
        containedWarning: { background: t.gold500, color: t.navy900, '&:hover': { background: t.gold300 } },
        outlinedError: { borderColor: t.lineStrong, color: t.ink },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: t.radius,
          backgroundColor: t.surface,
          '& .MuiOutlinedInput-notchedOutline': { borderWidth: 1, borderColor: t.lineStrong },
          '&:hover:not(.Mui-disabled) .MuiOutlinedInput-notchedOutline': { borderColor: t.inkMuted },
          '&.Mui-focused': { boxShadow: INPUT_FOCUS_RING },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1, borderColor: t.navy900 },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: APPLY_ERROR },
          '&.Mui-disabled': { backgroundColor: t.ground },
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: t.line },
        },
        input: {
          fontSize: 16,
          padding: '12.5px 14px',
          '&::placeholder': { color: t.inkMuted, opacity: 1 },
        },
        multiline: { padding: 0, '& textarea': { padding: '12px 14px', lineHeight: 1.5 } },
      },
    },
    MuiSelect: { styleOverrides: { select: { minHeight: 'unset' } } },
    MuiFormHelperText: {
      styleOverrides: {
        root: { fontFamily: 'inherit', fontSize: 13, lineHeight: 1.45, letterSpacing: 0, textTransform: 'none', marginLeft: 0, marginRight: 0, marginTop: 6 },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: { display: 'flex', flexWrap: 'wrap', gap: 8, borderRadius: 0 },
        grouped: {
          margin: 0,
          borderRadius: t.radius,
          border: `2px solid ${t.line}`,
          '&:not(:first-of-type)': { marginLeft: 0, borderLeft: `2px solid ${t.line}`, borderRadius: t.radius },
          '&:not(:last-of-type)': { borderRadius: t.radius },
          '&.Mui-selected, &.Mui-selected:not(:first-of-type)': { borderColor: t.navy900 },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: 48,
          padding: '0 14px',
          borderRadius: t.radius,
          border: `2px solid ${t.line}`,
          textTransform: 'none',
          fontSize: 15,
          fontWeight: 600,
          lineHeight: 1.2,
          color: t.ink,
          backgroundColor: t.surface,
          transition: 'border-color 150ms, background-color 150ms',
          '&:hover': { backgroundColor: t.surface, borderColor: t.lineStrong },
          '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: t.navy900, borderColor: t.navy900, color: t.paper },
          '&.Mui-focusVisible': { outline: t.focusOutline, outlineOffset: 2, zIndex: 1 },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: { color: t.lineStrong, '&.Mui-checked': { color: t.navy900 }, '&.Mui-focusVisible': { outline: t.focusOutline } },
      },
    },
    MuiRadio: {
      styleOverrides: {
        root: { color: t.lineStrong, '&.Mui-checked': { color: t.navy900 }, '&.Mui-focusVisible': { outline: t.focusOutline } },
      },
    },
    MuiPaper: { styleOverrides: { outlined: { borderColor: t.line } } },
    MuiCard: { styleOverrides: { root: { borderRadius: t.radius, border: `1px solid ${t.line}`, boxShadow: 'none' } } },
    MuiChip: { styleOverrides: { root: { borderRadius: t.radiusPill, fontWeight: 600 } } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: t.radius, fontSize: 15, alignItems: 'flex-start' },
        standardSuccess: { ...rail(t.success), '& .MuiAlert-icon': { color: t.success } },
        standardError: { ...rail(APPLY_ERROR), '& .MuiAlert-icon': { color: APPLY_ERROR } },
        standardWarning: { ...rail(t.statusDraft), '& .MuiAlert-icon': { color: t.gold800 } },
        standardInfo: { ...rail(t.navy900), '& .MuiAlert-icon': { color: t.navy900 } },
        outlinedSuccess: rail(t.success),
        outlinedError: rail(APPLY_ERROR),
        outlinedWarning: rail(t.statusDraft),
        outlinedInfo: rail(t.navy900),
      },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { height: 6, borderRadius: 3, backgroundColor: t.line }, bar: { borderRadius: 3, backgroundColor: t.gold500 } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: t.radius, boxShadow: t.shadowMegaMenu } },
    },
    MuiDialogTitle: { styleOverrides: { root: { color: t.ink, fontWeight: 800, fontSize: '1.25rem' } } },
    MuiDrawer: { styleOverrides: { paper: { backgroundColor: t.surface } } },
  },
});
