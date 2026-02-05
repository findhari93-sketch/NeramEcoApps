# Marketing Site Specialist (@neram/marketing)

## My Domain
Public website at neramclasses.com - Multi-language marketing site

## Key Features I Handle
- Course catalog and landing pages
- Lead capture (application form)
- YouTube subscription rewards
- Blog and testimonials
- SEO and performance optimization
- i18n (5 languages: EN, TA, HI, KN, ML)

## Tech Stack
- Next.js 14 with App Router
- next-intl for internationalization
- MUI v5 for UI components
- Framer Motion for animations

## Directory Structure
```
src/
├── app/
│   ├── [locale]/           # Locale-wrapped pages
│   │   ├── page.tsx        # Homepage
│   │   ├── about/          # About page
│   │   ├── apply/          # Application form
│   │   ├── coaching/       # Coaching info
│   │   ├── courses/        # Course catalog
│   │   ├── terms/          # Terms of service
│   │   └── youtube-reward/ # YouTube rewards page
│   └── api/
│       └── youtube/        # YouTube verification API
├── components/
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── Hero.tsx
│   ├── YouTubeSection.tsx
│   ├── AuthButton.tsx
│   ├── AuthProvider.tsx
│   └── VideoCard.tsx
├── i18n.ts                 # i18n configuration
└── middleware.ts           # Locale routing middleware
messages/
├── en.json                 # English translations
└── ta.json                 # Tamil translations (+ hi, kn, ml)
```

## Critical Files
- `src/app/[locale]/page.tsx` - Homepage
- `src/app/[locale]/apply/page.tsx` - Application form (leads to student enrollment)
- `src/components/YouTubeSection.tsx` - YouTube subscription rewards
- `src/i18n.ts` - i18n configuration
- `src/middleware.ts` - Locale routing
- `messages/*.json` - Translation files

## Patterns to Follow

### Adding a new page
```typescript
// src/app/[locale]/new-page/page.tsx
import { useTranslations } from 'next-intl';

export default function NewPage() {
  const t = useTranslations('NewPage');
  return <div>{t('title')}</div>;
}
```

### Adding translations
```json
// messages/en.json
{
  "NewPage": {
    "title": "New Page Title",
    "description": "Page description"
  }
}
```

### Using static generation with i18n
```typescript
export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'ta' }];
}
```

## API Routes
- `POST /api/youtube/verify` - Verify YouTube subscription
- `POST /api/youtube/callback` - OAuth callback

## When to Involve Other Agents
- Need database changes → `packages/database/CLAUDE.md`
- Need auth changes → `packages/auth/CLAUDE.md`
- Affects student app → `apps/app/CLAUDE.md`
- Need shared UI components → `packages/ui/CLAUDE.md`

## SEO Considerations
- Use `generateMetadata()` for page metadata
- Add structured data for courses
- Ensure proper `hreflang` tags for i18n

## Performance
- Use ISR (Incremental Static Regeneration) for content pages
- Lazy load below-fold components
- Optimize images with next/image
