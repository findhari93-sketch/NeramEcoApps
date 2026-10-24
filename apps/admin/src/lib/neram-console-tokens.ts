/**
 * Neram Console design tokens (admin only).
 *
 * Source of truth for the admin redesign: colours, the seven status tones,
 * type scale, spacing and shape. Not wired in yet. The plan is to merge
 * `neramConsoleThemeOptions` into `adminLightTheme` in @neram/ui, then move
 * pages off hardcoded hex onto `statusTone()` and the palette.
 */
import type { ThemeOptions } from '@mui/material/styles';

export const colors = {
  ink950: '#0F1729', // rail, dark bars
  primary700: '#1B3AA6', // hover
  primary600: '#2448C8', // action, links, selected
  primary300: '#A4B4F2', // focus ring
  primary100: '#E9EDFB', // selected background
  primary50: '#F5F7FF', // row hover / selected row
  text: '#101828',
  text2: '#475467',
  text3: '#667085', // lightest allowed text (4.5:1 on white and ground)
  borderStrong: '#D0D5DD',
  border: '#E4E7EC',
  borderSubtle: '#F2F4F7',
  ground: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceMuted: '#F9FAFB',
} as const;

/**
 * One meaning per tone. Amber (warning) only ever means "a person must act".
 * Expired, archived, dead lead, merged and cancelled are `archived`, never warning.
 */
export type StatusTone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger' | 'archived';

export const statusTones: Record<StatusTone, { fg: string; bg: string; border: string; dashed?: boolean }> = {
  neutral: { fg: '#475467', bg: '#F2F4F7', border: '#E4E7EC' },
  info: { fg: '#175CD3', bg: '#EFF8FF', border: '#B2DDFF' },
  progress: { fg: '#6941C6', bg: '#F4F3FF', border: '#D9D6FE' },
  success: { fg: '#067647', bg: '#ECFDF3', border: '#ABEFC6' },
  warning: { fg: '#B54708', bg: '#FFFAEB', border: '#FEDF89' },
  danger: { fg: '#B42318', bg: '#FEF3F2', border: '#FECDCA' },
  archived: { fg: '#667085', bg: '#FFFFFF', border: '#D0D5DD', dashed: true },
};

/** sx for a 22px status chip in a given tone. */
export function statusChipSx(tone: StatusTone) {
  const t = statusTones[tone];
  return {
    height: 22,
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 999,
    color: t.fg,
    bgcolor: t.bg,
    border: `1px ${t.dashed ? 'dashed' : 'solid'} ${t.border}`,
  } as const;
}

/**
 * Status value -> tone, for the statuses on the priority screens.
 * Add new statuses here rather than picking a colour in the page.
 */
export const STATUS_TONE: Record<string, StatusTone> = {
  // People lifecycle
  signed_up: 'neutral', shared_phone: 'progress', applied: 'progress', enrolled: 'success',
  studying: 'success', paused: 'warning', alumni: 'neutral', archived: 'archived',
  dead_lead: 'archived', irrelevant: 'archived',
  // Direct enrolment links
  payment_submitted: 'warning', active: 'info', used: 'success', expired: 'archived', cancelled: 'archived',
  // Demo classes
  pending: 'warning', contacted: 'neutral', approved: 'info', attended: 'success', no_show: 'danger', rejected: 'archived',
  // Contact messages (unread is not an error)
  unread: 'info', read: 'neutral', replied: 'success',
  // Q&A moderation
  flagged: 'warning',
};

export function statusTone(status: string | null | undefined, fallback: StatusTone = 'neutral'): StatusTone {
  return (status && STATUS_TONE[status]) || fallback;
}

export const typeScale = {
  display: { fontSize: 30, lineHeight: '38px', fontWeight: 600 },
  pageTitle: { fontSize: 24, lineHeight: '32px', fontWeight: 600 },
  section: { fontSize: 16, lineHeight: '24px', fontWeight: 600 },
  body: { fontSize: 14, lineHeight: '20px', fontWeight: 400 },
  table: { fontSize: 13, lineHeight: '20px', fontWeight: 400 },
  label: { fontSize: 12, lineHeight: '16px', fontWeight: 500 },
} as const;

export const density = { rowCompact: 36, rowComfortable: 44, control: 34, chip: 22, touchTarget: 44 } as const;

/** Partial theme to merge into adminLightTheme (deep merge, these keys win). */
export const neramConsoleThemeOptions: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: { main: colors.primary600, dark: colors.primary700, light: colors.primary300, contrastText: '#FFFFFF' },
    success: { main: statusTones.success.fg, light: statusTones.success.bg, contrastText: '#FFFFFF' },
    warning: { main: statusTones.warning.fg, light: statusTones.warning.bg, contrastText: '#FFFFFF' },
    error: { main: statusTones.danger.fg, light: statusTones.danger.bg, contrastText: '#FFFFFF' },
    info: { main: statusTones.info.fg, light: statusTones.info.bg, contrastText: '#FFFFFF' },
    text: { primary: colors.text, secondary: colors.text2, disabled: colors.text3 },
    divider: colors.border,
    background: { default: colors.ground, paper: colors.surface },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: "'Geist', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    h1: typeScale.pageTitle,
    h2: typeScale.section,
    body1: typeScale.body,
    body2: typeScale.table,
    caption: { fontSize: 12, lineHeight: '16px' },
    button: { textTransform: 'none', fontWeight: 500, fontSize: 13 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: density.control } } },
    MuiChip: { styleOverrides: { root: { height: density.chip, fontSize: 12, fontWeight: 500 }, sizeSmall: { height: density.chip } } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { outlined: { borderColor: colors.border } } },
    MuiTableCell: { styleOverrides: { head: { fontSize: 12, fontWeight: 500, color: colors.text2, backgroundColor: colors.surfaceMuted }, root: { fontSize: 13 } } },
  },
};
