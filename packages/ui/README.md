# @neram/ui

Shared UI components, theme system, and design tokens for the Neram Classes ecosystem.

## Features

- **Material 3 (Material You)** compliant design system
- **Mobile-first** responsive components
- **4 App-specific themes**: Marketing, Tools App, Nexus, Admin
- **Dark mode** support with system preference detection
- **Framer Motion** animation presets
- **MUI v5** customization layer

## Installation

```bash
pnpm add @neram/ui
```

## Quick Start

```tsx
import { NeramThemeProvider, marketingLightTheme, marketingDarkTheme } from '@neram/ui';

function App({ children }) {
  return (
    <NeramThemeProvider
      lightTheme={marketingLightTheme}
      darkTheme={marketingDarkTheme}
      defaultMode="light"
    >
      {children}
    </NeramThemeProvider>
  );
}
```

## Available Themes

| Theme | Light | Dark | Use Case |
|-------|-------|------|----------|
| Marketing | `marketingLightTheme` | `marketingDarkTheme` | Public website, landing pages |
| Tools App | `toolsAppLightTheme` | `toolsAppDarkTheme` | Student PWA, tools |
| Nexus | `nexusLightTheme` | `nexusDarkTheme` | LMS, classroom |
| Admin | `adminLightTheme` | `adminDarkTheme` | Staff dashboard |

## Theme Mode Hook

```tsx
import { useThemeMode, ThemeModeToggle } from '@neram/ui';

function Header() {
  const { mode, actualMode, toggleMode, setMode } = useThemeMode();

  return (
    <header>
      <ThemeModeToggle /> {/* Ready-to-use toggle button */}
    </header>
  );
}
```

## Design Tokens

### Material 3 Color Palette

```tsx
import { m3LightScheme, m3DarkScheme, m3Primary } from '@neram/ui';

// Primary tonal palette
m3Primary[40]  // #1A73E8 - Primary
m3Primary[90]  // #D3E3FD - Primary Container

// Color schemes
m3LightScheme.primary           // Primary color
m3LightScheme.primaryContainer  // Primary container
m3LightScheme.onPrimary         // Text on primary
m3LightScheme.surface           // Surface color
m3LightScheme.surfaceContainer  // Elevated surface
```

### App-specific Accents

```tsx
import { m3MarketingAccent, m3AppAccent, m3NexusPrimary, m3AdminAccent } from '@neram/ui';

// Each has base, light, dark, container variants
m3MarketingAccent.base  // #F97316 (Orange)
m3AppAccent.base        // #8B5CF6 (Purple)
m3NexusPrimary.base     // #7C3AED (Deep Purple)
m3AdminAccent.base      // #DC2626 (Red)
```

### Motion Tokens

```tsx
import { m3Motion } from '@neram/ui';

// Duration (in ms)
m3Motion.duration.short1   // 50ms
m3Motion.duration.short4   // 200ms
m3Motion.duration.medium2  // 300ms
m3Motion.duration.long1    // 450ms

// Easing
m3Motion.easing.emphasized      // cubic-bezier(0.2, 0, 0, 1)
m3Motion.easing.emphasizedAccel // cubic-bezier(0.3, 0, 0.8, 0.15)
m3Motion.easing.standard        // cubic-bezier(0.2, 0, 0, 1)
```

## Components

### BentoGrid

Material 3 styled flexible grid layout.

```tsx
import { BentoGrid, BentoItem } from '@neram/ui';

<BentoGrid columns={4} gap={3}>
  <BentoItem span={2} featured>
    Featured Content
  </BentoItem>
  <BentoItem clickable onClick={() => {}}>
    Clickable Item
  </BentoItem>
  <BentoItem rowSpan={2}>
    Tall Item
  </BentoItem>
</BentoGrid>
```

**Props:**
- `columns`: 1 | 2 | 3 | 4 | 6 (default: 4)
- `gap`: number (spacing units, default: 3)
- `span`: 1 | 2 | 3 | 4 (column span)
- `rowSpan`: 1 | 2 (row span)
- `featured`: boolean (highlight styling)
- `clickable`: boolean (hover/click effects)

### GlassCard

Glassmorphism card with backdrop blur.

```tsx
import { GlassCard, GlassOverlay } from '@neram/ui';

<GlassCard blur="medium" glow hoverable>
  <Typography variant="h6">Glass Content</Typography>
</GlassCard>

// For modals
<GlassOverlay open={isOpen} onClose={handleClose}>
  <GlassCard>Modal Content</GlassCard>
</GlassOverlay>
```

**Props:**
- `blur`: 'light' | 'medium' | 'heavy'
- `opacity`: number (0-1, default: 0.7)
- `glow`: boolean (subtle border glow)
- `tint`: 'primary' | 'secondary' | 'tertiary' | 'neutral'
- `hoverable`: boolean (hover lift effect)
- `clickable`: boolean (cursor pointer)

## Animation Presets

```tsx
import { motion } from 'framer-motion';
import { fadeInUp, staggerContainer, staggerItem, buttonHover, buttonTap } from '@neram/ui';

// Fade in with upward motion
<motion.div variants={fadeInUp} initial="hidden" animate="visible">
  Content
</motion.div>

// Staggered list
<motion.ul variants={staggerContainer} initial="hidden" animate="visible">
  {items.map(item => (
    <motion.li key={item.id} variants={staggerItem}>
      {item.name}
    </motion.li>
  ))}
</motion.ul>

// Button interactions
<motion.button whileHover={buttonHover} whileTap={buttonTap}>
  Click Me
</motion.button>
```

### Available Variants

| Variant | Description |
|---------|-------------|
| `fadeIn` | Simple opacity fade |
| `fadeInUp` | Fade with upward motion |
| `fadeInDown` | Fade with downward motion |
| `fadeInLeft` | Fade from left |
| `fadeInRight` | Fade from right |
| `scaleIn` | Scale from 95% |
| `scaleInBounce` | Scale with spring bounce |
| `slideInBottom` | Slide from bottom |
| `slideInLeft` | Slide from left |
| `slideInRight` | Slide from right |
| `staggerContainer` | Parent for staggered children |
| `staggerItem` | Child item for stagger |
| `scrollReveal` | Reveal on scroll into view |

### Micro-interactions

| Effect | Description |
|--------|-------------|
| `buttonHover` | Lift and scale on hover |
| `buttonTap` | Press down on tap |
| `cardHover` | Lift with shadow increase |
| `iconSpin` | Continuous rotation |
| `pulse` | Scale/opacity pulse loop |
| `shake` | Error shake animation |
| `bounce` | Bouncing motion |

## Responsive Hooks

```tsx
import { useMediaQuery, useTheme } from '@neram/ui';

function ResponsiveComponent() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));

  return isMobile ? <MobileView /> : <DesktopView />;
}
```

### Breakpoints

| Breakpoint | Value | Description |
|------------|-------|-------------|
| `xs` | 0px | Mobile portrait |
| `sm` | 600px | Mobile landscape / Small tablet |
| `md` | 900px | Tablet |
| `lg` | 1200px | Desktop |
| `xl` | 1536px | Large desktop |

## Mobile-First Guidelines

All components follow mobile-first responsive design:

1. **Touch Targets**: Minimum 48x48px
2. **Base Font**: 16px (prevents iOS zoom)
3. **Forms**: Large inputs (min-height: 56px)
4. **Navigation**: Bottom nav for primary actions
5. **Dialogs**: Bottom sheets on mobile

## MUI Component Variants

Each theme includes custom MUI variants:

```tsx
// Marketing
<Card className="feature-card" />
<Card className="testimonial-card" />
<Button variant="contained" color="secondary" /> {/* CTA gradient */}
<Typography className="gradient-text" />

// Tools App
<Card className="tool-card" />
<Card className="result-card" />
<Paper className="result-highlight" />

// Nexus
<Drawer className="nexus-sidebar" />
<Card className="lesson-card" />
<Card className="lesson-card-completed" />
<Card className="lesson-card-active" />
<Chip className="status-completed" />
<Chip className="status-in-progress" />

// Admin
<Drawer className="admin-sidebar" />
<AppBar className="admin-header" />
<Card className="stat-card" />
<Card className="stat-card-primary" />
<Chip className="status-pending" />
<Chip className="status-approved" />
<Chip className="status-rejected" />
<Button className="action-approve" />
<Button className="action-reject" />
```

## TypeScript Support

All components and hooks are fully typed:

```tsx
import type { Theme, SxProps, ThemeMode } from '@neram/ui';

// Access custom theme properties
const myTheme = useTheme();
myTheme.custom?.m3?.scheme.primary;
myTheme.custom?.m3?.accent.base;
```

## File Structure

```
packages/ui/src/
├── theme/
│   ├── tokens.ts        # Design tokens (colors, spacing, typography)
│   ├── brand-2025.ts    # Material 3 color palettes
│   ├── theme.ts         # Base MUI theme
│   ├── variants.ts      # App-specific themes
│   ├── provider.tsx     # NeramThemeProvider
│   └── index.ts         # Theme exports
├── components/
│   ├── BentoGrid.tsx    # Bento grid layout
│   ├── GlassCard.tsx    # Glassmorphism card
│   └── index.ts         # Component exports
├── animations/
│   └── index.ts         # Framer Motion presets
├── hooks/
│   └── index.ts         # Custom hooks
├── utils/
│   └── index.ts         # Utilities
└── index.ts             # Package entry point
```

## Contributing

When adding new components:

1. Follow Material 3 design guidelines
2. Ensure mobile-first responsive behavior
3. Support both light and dark modes
4. Add TypeScript types
5. Document props and usage examples
