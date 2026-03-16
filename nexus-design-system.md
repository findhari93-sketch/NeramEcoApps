# Nexus Design System — React Recreation Guide

> A complete reference to recreate the Nexus (LMS/Teacher platform) UI in any React project.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js | 14.x |
| UI Library | React | 18.x |
| Component Library | MUI (Material UI) | 7.x |
| Design Language | Material 3 (Material You) | — |
| Icons | @mui/icons-material | 7.x |
| Fonts | Google Fonts (Inter, Poppins, Noto Sans Tamil) | — |

### Installation

```bash
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled
```

### Font Setup (Next.js)

```tsx
import { Inter, Poppins, Noto_Sans_Tamil } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap' });
const poppins = Poppins({ weight: ['400','500','600','700','800'], subsets: ['latin'] });
const notoSansTamil = Noto_Sans_Tamil({ weight: ['400','500','600','700'], subsets: ['tamil'] });
```

---

## Color System

### Primary Palette (Purple)

| Token | Value | Usage |
|-------|-------|-------|
| `primary.main` | `#7C3AED` | Buttons, active states, sidebar |
| `primary.light` | `#A78BFA` | Hover backgrounds, light accents |
| `primary.dark` | `#6D28D9` | Sidebar gradient, pressed states |
| `primary.contrastText` | `#FFFFFF` | Text on primary |

### Secondary Palette (Teal)

| Token | Value | Usage |
|-------|-------|-------|
| `secondary.main` | `#00897B` | Progress bars, secondary actions |
| `secondary.light` | `#80CBC4` | Light accents |
| `secondary.dark` | `#00695C` | Pressed states |

### Tertiary / Accent (Amber)

| Token | Value | Usage |
|-------|-------|-------|
| `tertiary.main` | `#F9A825` | Highlights, badges, warnings |
| `tertiary.light` | `#FFE082` | Light accents |
| `tertiary.dark` | `#EF6C00` | Pressed/warning states |

### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| `success.main` | `#2E7D32` | Passed, correct, completed |
| `error.main` | `#C62828` | Failed, wrong, errors |
| `warning.main` | `#EF6C00` | Warnings, caution |
| `info.main` | `#1565C0` | Informational highlights |

### Neutrals

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#FAFBFC` | Page background |
| Surface / Paper | `#FFFFFF` | Cards, modals |
| Border / Divider | `#E1E5EB` | Borders, separators |
| Text Primary | `#1A2027` | Main text |
| Text Secondary | `#5A6672` | Descriptions, subtitles |
| Text Tertiary | `#8B95A1` | Captions, timestamps |
| Text Disabled | `#B8C0CC` | Disabled elements |

### Alpha Transparency Patterns

Used heavily with MUI's `alpha()` utility:

```tsx
import { alpha } from '@mui/material/styles';

// Backgrounds
alpha(theme.palette.primary.main, 0.04)  // Subtle hover
alpha(theme.palette.primary.main, 0.08)  // Active background
alpha(theme.palette.primary.main, 0.12)  // Selected background

// Borders
alpha(theme.palette.primary.main, 0.15)  // Subtle border
alpha(theme.palette.primary.main, 0.3)   // Active border

// Overlays
alpha('#000', 0.05)  // Light overlay
alpha('#fff', 0.7)   // Text on dark bg
```

---

## Typography

### Font Families

```typescript
const fontFamilies = {
  display: '"Poppins", "Noto Sans Tamil", sans-serif',
  body:    '"Inter", "Noto Sans Tamil", sans-serif',
  mono:    '"JetBrains Mono", "Fira Code", monospace',
  tamil:   '"Noto Sans Tamil", "Poppins", sans-serif',
};
```

### Font Weights

| Name | Value | Usage |
|------|-------|-------|
| Light | 300 | Subtle text |
| Regular | 400 | Body text |
| Medium | 500 | Labels, navigation |
| SemiBold | 600 | Active items, card titles |
| Bold | 700 | Headings, page titles |
| ExtraBold | 800 | Hero text, brand |

### Font Size Scale (rem)

| Token | Size | px |
|-------|------|----|
| xs | 0.75rem | 12px |
| sm | 0.875rem | 14px |
| base | 1rem | 16px |
| lg | 1.125rem | 18px |
| xl | 1.25rem | 20px |
| 2xl | 1.5rem | 24px |
| 3xl | 1.875rem | 30px |
| 4xl | 2.25rem | 36px |
| 5xl | 3rem | 48px |

### Line Heights

| Name | Value |
|------|-------|
| Tight | 1.2 |
| Snug | 1.375 |
| Normal | 1.5 |
| Relaxed | 1.625 |
| Loose | 2 |

### MUI Typography Overrides

```typescript
typography: {
  fontFamily: '"Inter", "Noto Sans Tamil", sans-serif',
  h4: { fontFamily: '"Poppins", sans-serif', fontWeight: 700, letterSpacing: '-0.3px' },
  h5: { fontFamily: '"Poppins", sans-serif', fontWeight: 700, fontSize: '1.5rem' },
  h6: { fontFamily: '"Poppins", sans-serif', fontWeight: 600, fontSize: '1.25rem' },
  subtitle1: { fontWeight: 500 },
  subtitle2: { fontWeight: 700, fontSize: '0.875rem' },
  body1: { fontWeight: 400, lineHeight: 1.5 },
  body2: { fontWeight: 400, fontSize: '0.875rem' },
  caption: { fontWeight: 400, fontSize: '0.75rem' },
  button: { textTransform: 'none', fontWeight: 600 },
},
```

---

## Spacing & Layout

### Spacing Scale (MUI units × 8px)

MUI spacing unit = 8px. `sx={{ p: 2 }}` = 16px.

| MUI Unit | px | Common Usage |
|----------|----|-------------|
| 0.5 | 4px | Tight gaps |
| 1 | 8px | Icon gaps, small padding |
| 1.5 | 12px | Compact card padding |
| 2 | 16px | Standard card padding (mobile) |
| 2.5 | 20px | Card padding (tablet) |
| 3 | 24px | Section padding |
| 4 | 32px | Large gaps |
| 6 | 48px | Section spacing |
| 10 | 80px | Bottom nav clearance on mobile |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| xs | 2px | Tiny elements |
| sm | 4px | Chips, small badges |
| base | 6px | Inputs, small cards |
| md | 8px | Standard cards (`borderRadius: 2`) |
| lg | 12px | Large cards (`borderRadius: 3`) |
| xl | 16px | Modals, drawers |
| 2xl | 24px | Bottom sheets |
| full | 9999px | Pills, circles |

### Breakpoints

| Name | Min Width | Target |
|------|-----------|--------|
| xs | 0px | Mobile portrait |
| sm | 600px | Mobile landscape / small tablet |
| md | 900px | Tablet |
| lg | 1200px | Desktop |
| xl | 1536px | Large desktop |

### Z-Index Hierarchy

```typescript
const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  fixed: 1200,
  modalBackdrop: 1300,
  modal: 1400,
  popover: 1500,
  tooltip: 1600,
  toast: 1700,
};
```

---

## Shadows & Elevation

### Shadow Scale

```typescript
const shadows = {
  none: 'none',
  xs:   '0 1px 2px rgba(0,0,0,0.05)',
  sm:   '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
  base: '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -1px rgba(0,0,0,0.04)',
  md:   '0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04)',
  lg:   '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
  xl:   '0 25px 50px -12px rgba(0,0,0,0.25)',
  inner: 'inset 0 2px 4px rgba(0,0,0,0.06)',
};

// Colored shadows (for cards on hover)
const coloredShadows = {
  primary:   '0 10px 40px -10px rgba(124,58,237,0.3)',  // purple glow
  secondary: '0 10px 40px -10px rgba(249,168,37,0.3)',   // amber glow
  accent:    '0 10px 40px -10px rgba(0,137,123,0.3)',     // teal glow
};
```

### Design Principle: Flat Baseline

Cards use `elevation={0}` (no shadow) by default. Shadows appear on **hover** for interactive cards:

```tsx
<Paper
  elevation={0}
  sx={{
    border: '1px solid',
    borderColor: 'divider',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 16px rgba(124,58,237,0.1)',
      borderColor: alpha(theme.palette.primary.main, 0.4),
    },
    transition: 'all 200ms ease',
  }}
/>
```

---

## MUI Theme Configuration

### Complete Theme Object

```typescript
import { createTheme, alpha } from '@mui/material/styles';

const nexusTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#7C3AED',
      light: '#A78BFA',
      dark: '#6D28D9',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#00897B',
      light: '#80CBC4',
      dark: '#00695C',
    },
    success: { main: '#2E7D32' },
    error: { main: '#C62828' },
    warning: { main: '#EF6C00' },
    info: { main: '#1565C0' },
    background: {
      default: '#FAFBFC',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1A2027',
      secondary: '#5A6672',
      disabled: '#B8C0CC',
    },
    divider: '#E1E5EB',
  },
  typography: {
    fontFamily: '"Inter", "Noto Sans Tamil", sans-serif',
    h4: { fontFamily: '"Poppins", sans-serif', fontWeight: 700, letterSpacing: '-0.3px' },
    h5: { fontFamily: '"Poppins", sans-serif', fontWeight: 700, fontSize: '1.5rem' },
    h6: { fontFamily: '"Poppins", sans-serif', fontWeight: 600, fontSize: '1.25rem' },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 700, fontSize: '0.875rem' },
    body1: { fontWeight: 400, lineHeight: 1.5 },
    body2: { fontWeight: 400, fontSize: '0.875rem' },
    caption: { fontWeight: 400, fontSize: '0.75rem', color: '#8B95A1' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: {
    borderRadius: 8, // base unit (borderRadius: 1 = 8px)
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 44,
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: { '& .MuiInputBase-root': { minHeight: 48 } },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16 },
      },
    },
  },
});
```

---

## Component Patterns

### 1. Sidebar (Desktop — 3-State Collapsible)

States: **expanded** (260px) → **icons** (72px) → **hidden** (0px)

```tsx
// Sidebar container
<Box sx={{
  width: state === 'expanded' ? 260 : state === 'icons' ? 72 : 0,
  background: `linear-gradient(180deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
  color: '#fff',
  transition: 'all 250ms cubic-bezier(0.2, 0, 0, 1)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}}>

// Sidebar item
<ListItemButton sx={{
  borderRadius: 2.5,
  mx: 1,
  mb: 0.5,
  color: alpha('#fff', 0.7),
  '&:hover': { bgcolor: alpha('#fff', 0.08) },
  '&.active': {
    bgcolor: alpha('#fff', 0.12),
    color: '#fff',
    fontWeight: 600,
  },
  transition: 'all 200ms ease',
}}>

// Active indicator (left bar)
<Box sx={{
  position: 'absolute',
  left: 0,
  width: 4,
  height: 20,
  borderRadius: 2,
  bgcolor: '#fff',
  opacity: isActive ? 1 : 0,
  transition: 'opacity 200ms ease',
}} />
```

**Persistence:** Save sidebar state in `localStorage('nexus_sidebar_state')`.

### 2. Bottom Navigation (Mobile — Glassmorphic)

Shown only on `xs`/`sm` screens. Fixed at the bottom.

```tsx
<Paper sx={{
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  height: 64,
  display: { xs: 'flex', md: 'none' },
  bgcolor: alpha(theme.palette.background.paper, 0.8),
  backdropFilter: 'blur(8px)',
  borderTop: '1px solid',
  borderColor: 'divider',
  zIndex: 1200,
}}>

// Each nav item
<Box sx={{
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  flex: 1,
  pt: '6px',
  pb: '4px',
}}>

// Material 3 active indicator pill
{isActive && (
  <Box sx={{
    position: 'absolute',
    top: 4,
    width: 56,
    height: 28,
    borderRadius: 14,
    bgcolor: alpha(theme.palette.primary.main, 0.12),
  }} />
)}

// Icon
<Icon sx={{ fontSize: '1.3rem' }} />

// Label
<Typography sx={{
  fontSize: '0.6875rem',
  fontWeight: isActive ? 700 : 500,
  mt: 0.25,
}} />
```

### 3. Top App Bar (Sticky + Glassmorphic)

```tsx
<AppBar
  position="sticky"
  elevation={0}
  sx={{
    bgcolor: alpha(theme.palette.background.paper, 0.8),
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid',
    borderColor: 'divider',
    color: 'text.primary',
    height: { xs: 52, sm: 56 },
  }}
/>
```

### 4. StatCard (Dashboard Metrics)

Three variants: `gradient`, `outlined`, `surface`.

```tsx
<Paper sx={{
  p: { xs: 2, sm: 2.5 },
  borderRadius: 3,
  border: '1px solid',
  borderColor: 'divider',
  transition: 'all 200ms ease',
  animation: `fadeInUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1) ${index * 80}ms both`,
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.1)}`,
  },
}}>
  {/* Icon box */}
  <Box sx={{
    width: 40,
    height: 40,
    borderRadius: 2,
    bgcolor: alpha(theme.palette.primary.main, 0.1),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }}>
    <Icon sx={{ fontSize: '1.25rem', color: 'primary.main' }} />
  </Box>

  {/* Value */}
  <Typography sx={{
    fontSize: { xs: '1.5rem', sm: '1.75rem' },
    fontWeight: 700,
    fontFamily: '"Poppins", sans-serif',
  }}>
    {value}
  </Typography>

  {/* Trend indicator */}
  {trend && (
    <Chip
      icon={trend > 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
      label={`${trend}%`}
      size="small"
      color={trend > 0 ? 'success' : 'error'}
      variant="outlined"
    />
  )}
</Paper>
```

### 5. ProgressCard

```tsx
<Paper sx={{
  p: { xs: 2, sm: 2.5 },
  borderRadius: 3,
  border: '1px solid',
  borderColor: 'divider',
  '&:hover': { transform: 'translateY(-2px)' },
  transition: 'all 200ms ease',
}}>
  <Typography variant="subtitle2">{title}</Typography>
  <Typography variant="caption" color="text.secondary">
    {completed}/{total} completed
  </Typography>
  <LinearProgress
    variant="determinate"
    value={(completed / total) * 100}
    sx={{
      height: 8,
      borderRadius: 4,
      bgcolor: alpha(theme.palette.primary.main, 0.1),
      '& .MuiLinearProgress-bar': {
        borderRadius: 4,
        transition: 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
      },
    }}
  />
</Paper>
```

### 6. PageHeader (With Breadcrumbs)

```tsx
<Box sx={{ mb: 3, px: { xs: 0, sm: 1 } }}>
  <Breadcrumbs
    separator={<NavigateNextIcon sx={{ fontSize: '1rem' }} />}
    sx={{ mb: 1, '& .MuiBreadcrumb-li': { fontSize: '0.875rem' } }}
  >
    <Link href="/" color="text.secondary">Home</Link>
    <Typography color="text.primary">{currentPage}</Typography>
  </Breadcrumbs>

  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <Box>
      <Typography variant="h5" sx={{
        fontSize: { xs: '1.25rem', sm: '1.5rem' },
        letterSpacing: '-0.3px',
      }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
    {actionButton}
  </Box>
</Box>
```

### 7. ChapterCard (Learning Module Card)

```tsx
<Paper sx={{
  p: { xs: 2, sm: 2.5 },
  borderRadius: 3,
  border: '1px solid',
  borderColor: status === 'in_progress'
    ? alpha(theme.palette.primary.main, 0.3)
    : 'divider',
  opacity: status === 'locked' ? 0.6 : 1,
  cursor: status === 'locked' ? 'default' : 'pointer',
  animation: `fadeInUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1) ${index * 100}ms both`,
  '&:hover': status !== 'locked' ? {
    transform: 'translateY(-2px)',
    boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.1)}`,
  } : {},
  transition: 'all 200ms ease',
}}>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
    {/* Status icon box */}
    <Box sx={{
      width: 44,
      height: 44,
      borderRadius: 2.5,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: status === 'completed'
        ? alpha(theme.palette.success.main, 0.1)
        : status === 'in_progress'
        ? alpha(theme.palette.primary.main, 0.1)
        : alpha(theme.palette.text.disabled, 0.1),
    }}>
      {status === 'locked' && <LockOutlinedIcon sx={{ fontSize: '1.25rem', color: 'text.disabled' }} />}
      {status === 'completed' && <CheckCircleIcon sx={{ fontSize: '1.5rem', color: 'success.main' }} />}
      {status === 'in_progress' && (
        <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: 'primary.main' }}>
          {chapterNumber}
        </Typography>
      )}
    </Box>

    <Box sx={{ flex: 1 }}>
      <Typography variant="subtitle2">{title}</Typography>
      <Typography variant="caption" color="text.secondary">{sectionCount} sections</Typography>
    </Box>

    {status !== 'locked' && (
      <PlayCircleFilledIcon sx={{ fontSize: '2rem', color: alpha(theme.palette.primary.main, 0.7) }} />
    )}
  </Box>
</Paper>
```

### 8. QuizModal (Drawer on Desktop, Bottom Sheet on Mobile)

```tsx
// Desktop: Right Drawer
<Drawer
  anchor="right"
  open={open}
  disableEscapeKeyDown
  PaperProps={{
    sx: {
      width: { md: 420, lg: 460 },
      borderRadius: '16px 0 0 16px',
    },
  }}
>

// Mobile: Bottom Sheet
<SwipeableDrawer
  anchor="bottom"
  open={open}
  PaperProps={{
    sx: {
      maxHeight: '85vh',
      borderRadius: '20px 20px 0 0',
    },
  }}
>
  {/* Drag handle */}
  <Box sx={{
    width: 40,
    height: 4,
    borderRadius: 2,
    bgcolor: alpha(theme.palette.text.primary, 0.2),
    mx: 'auto',
    mt: 1,
    mb: 2,
  }} />

// Quiz option (radio)
<FormControlLabel
  sx={{
    py: 0.75,
    px: 1.5,
    borderRadius: 2,
    border: '1px solid',
    borderColor: isSelected
      ? alpha(theme.palette.primary.main, 0.3)
      : 'divider',
    bgcolor: isSelected
      ? alpha(theme.palette.primary.main, 0.04)
      : 'transparent',
    minHeight: 48,
    transition: 'all 150ms ease',
    // After grading:
    ...(isCorrect && {
      bgcolor: alpha(theme.palette.success.main, 0.06),
      borderColor: 'success.main',
    }),
    ...(isWrong && {
      bgcolor: alpha(theme.palette.error.main, 0.06),
      borderColor: 'error.main',
    }),
  }}
/>

// Result banner
<Box sx={{
  display: 'flex',
  alignItems: 'flex-start',
  gap: 1.5,
  p: 2,
  borderRadius: 2,
  bgcolor: passed
    ? alpha(theme.palette.success.main, 0.08)
    : alpha(theme.palette.error.main, 0.08),
  border: '1px solid',
  borderColor: passed
    ? alpha(theme.palette.success.main, 0.3)
    : alpha(theme.palette.error.main, 0.3),
}}>
  {passed ? <CheckCircleOutlineIcon sx={{ fontSize: '2rem', color: 'success.main' }} />
          : <CancelOutlinedIcon sx={{ fontSize: '2rem', color: 'error.main' }} />}
</Box>
```

### 9. Auth Layout (Login Page)

```tsx
<Box sx={{
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
}}>
  <Paper
    elevation={3}
    sx={{
      p: { xs: 3, sm: 4 },
      borderRadius: 1.5,
      maxWidth: 420,
      width: '100%',
      mx: 2,
    }}
  >
    {/* Login form content */}
  </Paper>
</Box>
```

### 10. Section List (Learning Progress)

```tsx
// Section item
<Box sx={{
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  py: 1,
  px: 1.5,
  minHeight: 48,
  borderRadius: 2,
  cursor: isAccessible ? 'pointer' : 'default',
  bgcolor: isCurrent ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
  '&:hover': isAccessible ? { bgcolor: alpha(theme.palette.primary.main, 0.04) } : {},
  transition: 'all 200ms ease',
}}>
  {/* Status icon */}
  {status === 'passed' && <CheckCircleIcon sx={{ fontSize: '1.3rem', color: 'success.main' }} />}
  {status === 'locked' && <LockOutlinedIcon sx={{ fontSize: '1.2rem', color: 'text.disabled' }} />}
  {status === 'in_progress' && <PlayArrowIcon sx={{ fontSize: '1.3rem', color: 'primary.main' }} />}
  {status === 'not_started' && <RadioButtonUncheckedIcon sx={{ fontSize: '1.2rem', color: 'text.disabled' }} />}

  <Typography variant="body2" sx={{ flex: 1, fontWeight: isCurrent ? 600 : 400 }}>
    {title}
  </Typography>

  <Typography variant="caption" color="text.tertiary" sx={{ fontSize: '0.7rem' }}>
    {duration}
  </Typography>
</Box>
```

---

## Animations

### Keyframes

```typescript
// Define in a shared animations file
const fadeInUp = {
  '@keyframes fadeInUp': {
    from: { opacity: 0, transform: 'translateY(12px)' },
    to:   { opacity: 1, transform: 'translateY(0)' },
  },
};

const scaleIn = {
  '@keyframes scaleIn': {
    from: { opacity: 0, transform: 'scale(0.95)' },
    to:   { opacity: 1, transform: 'scale(1)' },
  },
};

const slideInRight = {
  '@keyframes slideInRight': {
    from: { opacity: 0, transform: 'translateX(-16px)' },
    to:   { opacity: 1, transform: 'translateX(0)' },
  },
};

// Usage in sx prop
sx={{
  ...fadeInUp,
  animation: 'fadeInUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1) forwards',
}}

// Staggered animation (for lists)
sx={{
  animation: `fadeInUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1) ${index * 80}ms both`,
}}
```

### Easing Functions

```typescript
const easing = {
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',    // Standard MUI
  easeOut:   'cubic-bezier(0.0, 0, 0.2, 1)',     // Deceleration
  easeIn:    'cubic-bezier(0.4, 0, 1, 1)',       // Acceleration
  sharp:     'cubic-bezier(0.4, 0, 0.6, 1)',     // Quick
  bounce:    'cubic-bezier(0.68, -0.55, 0.265, 1.55)', // Playful
  m3Enter:   'cubic-bezier(0.05, 0.7, 0.1, 1)',  // Material 3 emphasis
};
```

### Transition Durations

| Name | Duration | Usage |
|------|----------|-------|
| shortest | 150ms | Ripples, checkboxes |
| shorter | 200ms | General hover/focus |
| short | 250ms | Sidebar transition |
| standard | 300ms | Dialog enter |
| complex | 375ms | Complex animations |
| enteringScreen | 225ms | Modal open |
| leavingScreen | 195ms | Modal close |

### Common Hover Effects

```tsx
// Card lift
'&:hover': {
  transform: 'translateY(-2px)',
  boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.1)}`,
  borderColor: alpha(theme.palette.primary.main, 0.4),
}

// Subtle background
'&:hover': {
  bgcolor: alpha(theme.palette.primary.main, 0.04),
}

// All transitions
transition: 'all 200ms ease',
```

---

## Responsive / Mobile-First Patterns

### Core Principle

Always define mobile styles first, then scale up:

```tsx
sx={{
  fontSize: { xs: '1.25rem', sm: '1.5rem' },
  p: { xs: 2, sm: 2.5, md: 3 },
  display: { xs: 'none', md: 'flex' },
  pb: { xs: 10, md: 3 }, // Extra padding on mobile for bottom nav
}}
```

### Touch Targets

All interactive elements must be minimum 48×48px:

```tsx
// Buttons
<Button sx={{ minHeight: 44 }}>

// Inputs
<TextField inputProps={{ style: { minHeight: 24 } }} /> // total ~48px with padding

// List items
<ListItemButton sx={{ minHeight: 48 }}>

// Icon buttons
<IconButton sx={{ p: 1 }}> // 24px icon + 8px*2 padding = 40px (add more if needed)
```

### Layout Switching

```tsx
// Sidebar: visible on desktop, hidden on mobile
<Sidebar sx={{ display: { xs: 'none', md: 'flex' } }} />

// Bottom nav: visible on mobile, hidden on desktop
<BottomNav sx={{ display: { xs: 'flex', md: 'none' } }} />

// Content padding: account for bottom nav on mobile
<Box sx={{ pb: { xs: 10, md: 3 } }}>

// Full-width video on mobile
<Box sx={{
  mx: { xs: -2, sm: 0 }, // Negative margin to break out of padding
  borderRadius: { xs: 0, sm: 2 },
}}>
```

### Modal → Bottom Sheet Pattern

On desktop show a right drawer; on mobile show a bottom sheet:

```tsx
const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

{isMobile ? (
  <SwipeableDrawer anchor="bottom" PaperProps={{ sx: { maxHeight: '85vh', borderRadius: '20px 20px 0 0' } }}>
    {content}
  </SwipeableDrawer>
) : (
  <Drawer anchor="right" PaperProps={{ sx: { width: { md: 420, lg: 460 }, borderRadius: '16px 0 0 16px' } }}>
    {content}
  </Drawer>
)}
```

### Font Size: Prevent iOS Zoom

Always use `16px` (1rem) minimum for input fonts:

```tsx
<TextField sx={{ '& input': { fontSize: '1rem' } }} />
```

---

## Global CSS

```css
/* globals.css */
:root {
  --foreground-rgb: 26, 32, 39;
  --background-rgb: 250, 251, 252;
}

*,
*::before,
*::after {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}

body {
  color: rgb(var(--foreground-rgb));
  background: rgb(var(--background-rgb));
}

a {
  color: inherit;
  text-decoration: none;
}

/* Prevent iOS zoom on inputs */
input, select, textarea {
  font-size: 16px;
}
```

---

## File Structure (Recommended)

```
src/
├── app/
│   ├── layout.tsx              # Root layout with ThemeProvider + fonts
│   ├── globals.css             # Global styles
│   ├── (auth)/
│   │   ├── layout.tsx          # Gradient background layout
│   │   └── login/page.tsx
│   └── (dashboard)/
│       ├── layout.tsx          # Sidebar + AppBar + BottomNav
│       ├── dashboard/page.tsx  # StatCards, ProgressCards
│       └── courses/page.tsx    # ChapterCards, SectionList
├── components/
│   ├── Sidebar.tsx             # 3-state collapsible sidebar
│   ├── BottomNav.tsx           # Mobile glassmorphic navigation
│   ├── AppBar.tsx              # Sticky glassmorphic top bar
│   ├── StatCard.tsx            # Dashboard metric card
│   ├── ProgressCard.tsx        # Progress bar card
│   ├── PageHeader.tsx          # Title + breadcrumbs
│   ├── ChapterCard.tsx         # Learning module card
│   ├── SectionList.tsx         # Learning section list
│   └── QuizModal.tsx           # Drawer/BottomSheet quiz
├── styles/
│   └── animations.ts           # Keyframe definitions
└── theme/
    └── index.ts                # MUI theme configuration
```

---

## Quick Start Checklist

1. Install MUI 7 + Emotion + Icons
2. Set up Google Fonts (Inter, Poppins)
3. Create the theme object (copy from Theme Configuration section above)
4. Wrap app in `<ThemeProvider theme={nexusTheme}>`
5. Add `globals.css` with box-sizing reset
6. Build layout: Sidebar (desktop) + BottomNav (mobile) + sticky AppBar
7. Use `elevation={0}` + borders for all cards
8. Add `fadeInUp` animation for list items with stagger delay
9. Use `alpha()` for all transparency-based colors
10. Test on 375px viewport width first
